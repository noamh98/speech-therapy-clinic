// Load environment variables from .env.local (development)
if (process.env.NODE_ENV !== 'production') {
  require('dotenv').config();
}

const functions = require('firebase-functions');
const admin = require('firebase-admin');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const { generateReceiptPDF, computeSHA256 } = require('./receiptGenerator');

admin.initializeApp();

// ─── Gemini Proxy Function ───────────────────────────────────────────────────
// This function proxies requests to Google Gemini API, keeping the API key secure
// on the backend instead of exposing it in the frontend code.

exports.callGemini = functions
  .runWith({ secrets: ['GEMINI_API_KEY'] })
  .https.onCall(async (data, context) => {
    // Verify user is authenticated
    if (!context.auth) {
      throw new functions.https.HttpsError(
        'unauthenticated',
        'User must be authenticated to call this function'
      );
    }

    const { messages, systemPrompt } = data;

    // Validate input
    if (!Array.isArray(messages) || !systemPrompt || typeof systemPrompt !== 'string') {
      throw new functions.https.HttpsError(
        'invalid-argument',
        'Missing or invalid messages/systemPrompt'
      );
    }

    // Limit message history to prevent abuse
    if (messages.length > 50) {
      throw new functions.https.HttpsError(
        'invalid-argument',
        'Message history too long (max 50 messages)'
      );
    }

    // Verify all messages have role and content
    if (!messages.every(m => m.role && m.content && typeof m.content === 'string')) {
      throw new functions.https.HttpsError(
        'invalid-argument',
        'Invalid message format'
      );
    }

    try {
      // API Key is loaded from Secret Manager via secrets parameter
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) {
        console.error('GEMINI_API_KEY not available');
        throw new functions.https.HttpsError(
          'internal',
          'API configuration error'
        );
      }

      const genAI = new GoogleGenerativeAI(apiKey);
      const model = genAI.getGenerativeModel({
        model: process.env.GEMINI_MODEL || 'gemini-1.5-flash',
        systemInstruction: systemPrompt,
      });

      const conversationHistory = messages.map(msg => ({
        role: msg.role === 'user' ? 'user' : 'model',
        parts: [{ text: msg.content }],
      }));

      let historyToUse = conversationHistory.filter((msg, idx) => {
        if (idx === 0 && msg.role === 'model') return false;
        return true;
      });

      if (historyToUse.length > 0 && historyToUse[0].role === 'model') {
        historyToUse = historyToUse.slice(1);
      }

      const chat = model.startChat({
        history: historyToUse.slice(0, -1),
      });

      const lastMessage = historyToUse[historyToUse.length - 1];
      if (!lastMessage || lastMessage.role !== 'user') {
        throw new Error('Last message must be from user');
      }

      const result = await chat.sendMessage(lastMessage.parts[0].text);
      const responseText = result.response.text();

      if (!responseText) {
        throw new Error('Empty response from Gemini');
      }

      return { reply: responseText };
    } catch (err) {
      console.error('Gemini API error:', err);
      throw new functions.https.HttpsError(
        'internal',
        err.message || 'Failed to get response from Gemini API'
      );
    }
  }
);

// ─── Receipt Helpers ──────────────────────────────────────────────────────────

async function _allocateReceiptNumber(txn, profileRef) {
  const snap = await txn.get(profileRef);
  if (!snap.exists) {
    throw new functions.https.HttpsError('failed-precondition', 'יש להגדיר פרופיל עסקי בהגדרות לפני הוצאת קבלה');
  }
  const profile = snap.data();
  const num = profile.numbering || {};
  const prefix     = num.prefix     || 'REC-';
  const padLength  = num.padLength  || 6;
  const yearlyReset = num.yearlyReset || false;
  let nextNumber   = num.next_number  || 1;
  let currentYear  = num.current_year || new Date().getFullYear();

  const thisYear = new Date().getFullYear();
  if (yearlyReset && currentYear !== thisYear) {
    nextNumber  = 1;
    currentYear = thisYear;
  }

  const receipt_seq    = nextNumber;
  const receipt_number = `${prefix}${receipt_seq.toString().padStart(padLength, '0')}`;

  txn.update(profileRef, {
    'numbering.next_number':  admin.firestore.FieldValue.increment(1),
    'numbering.current_year': currentYear,
  });

  return { receipt_seq, receipt_number };
}

async function _loadBuffer(bucket, storagePath) {
  if (!storagePath) return null;
  try {
    const file = bucket.file(storagePath);
    const [buf] = await file.download();
    return buf;
  } catch (_) {
    return null;
  }
}

async function _uploadReceiptPdf({ receipt, payment, profile, uid, receiptId, bucket, hmacSecret, originalReceiptNumber }) {
  const logoBuffer      = await _loadBuffer(bucket, profile.logoPath);
  const signatureBuffer = await _loadBuffer(bucket, profile.signaturePath);

  const { pdfBuffer, sha256, hmac } = await generateReceiptPDF({
    receipt, payment, profile, logoBuffer, signatureBuffer, originalReceiptNumber, hmacSecret,
  });

  const pdfPath = `receipts-managed/${uid}/${receiptId}/${receipt.receipt_number}.pdf`;
  const fileRef = bucket.file(pdfPath);
  await fileRef.save(pdfBuffer, { metadata: { contentType: 'application/pdf' } });
  await fileRef.makePublic().catch(() => {}); // best-effort; auth download URL used instead

  return { pdfPath, sha256, hmac };
}

function _auditEntry(action, uid, email, extra = {}) {
  return {
    action,
    at: admin.firestore.Timestamp.now(), // serverTimestamp() forbidden inside arrays
    by_uid: uid,
    by_email: email || '',
    ...extra,
  };
}

// ─── Invite User Function ─────────────────────────────────────────────────────
// Only admins can invite users, runs with Admin SDK for secure role assignment

exports.inviteUser = functions.https.onCall(async (data, context) => {
  // Verify user is authenticated
  if (!context.auth) {
    throw new functions.https.HttpsError(
      'unauthenticated',
      'User must be authenticated'
    );
  }

  // Check if user is admin
  const adminRef = await admin.firestore().collection('users').doc(context.auth.uid).get();
  if (!adminRef.exists || adminRef.data().role !== 'admin') {
    throw new functions.https.HttpsError(
      'permission-denied',
      'Only admins can invite users'
    );
  }

  const { email, role } = data;

  // Validate input
  if (!email || !['user', 'admin'].includes(role)) {
    throw new functions.https.HttpsError(
      'invalid-argument',
      'Invalid email or role'
    );
  }

  // Validate email format
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    throw new functions.https.HttpsError(
      'invalid-argument',
      'Invalid email format'
    );
  }

  try {
    // Store user document with role (secure because this runs on backend with Admin SDK)
    const cleanEmail = email.toLowerCase().trim();
    await admin.firestore().collection('users').doc(cleanEmail).set({
      email: cleanEmail,
      role: role,
      status: 'invited',
      invitedAt: admin.firestore.FieldValue.serverTimestamp(),
      invitedBy: context.auth.uid,
    }, { merge: true });

    return { success: true, message: `User ${email} invited with role ${role}` };
  } catch (err) {
    console.error('Invite user error:', err);
    throw new functions.https.HttpsError(
      'internal',
      err.message || 'Failed to invite user'
    );
  }
});

// ─── Receipt Functions ────────────────────────────────────────────────────────

exports.issueReceiptInternal = functions
  .runWith({ timeoutSeconds: 120, memory: '512MB' })
  .https.onCall(async (data, context) => {
    if (!context.auth) throw new functions.https.HttpsError('unauthenticated', 'נדרש אימות');

    const { paymentId, taxWithholding = 0 } = data;
    if (!paymentId) throw new functions.https.HttpsError('invalid-argument', 'חסר paymentId');
    if (typeof taxWithholding !== 'number' || taxWithholding < 0 || taxWithholding > 100) {
      throw new functions.https.HttpsError('invalid-argument', 'ניכוי מס חייב להיות בין 0 ל-100');
    }

    const uid = context.auth.uid;
    const db  = admin.firestore();
    const bucket = admin.storage().bucket();
    const hmacSecret = process.env.RECEIPT_HMAC_SECRET || null;

    // Load payment + verify ownership
    const paySnap = await db.collection('payments').doc(paymentId).get();
    if (!paySnap.exists || paySnap.data().ownerId !== uid) {
      throw new functions.https.HttpsError('not-found', 'תשלום לא נמצא');
    }
    if (paySnap.data().receipt_id) {
      throw new functions.https.HttpsError('already-exists', 'לתשלום זה כבר קיימת קבלה');
    }

    const payment = { id: paymentId, ...paySnap.data() };
    const profileRef = db.collection('receiptProfiles').doc(uid);
    const profileSnap = await profileRef.get();
    if (!profileSnap.exists) {
      throw new functions.https.HttpsError('failed-precondition', 'יש להגדיר פרופיל עסקי בהגדרות');
    }
    const profile = profileSnap.data();

    // Transaction: allocate number + create DRAFT receipt
    let receiptRef;
    let receiptData;
    await db.runTransaction(async txn => {
      const { receipt_seq, receipt_number } = await _allocateReceiptNumber(txn, profileRef);
      receiptRef = db.collection('receipts').doc();

      receiptData = {
        ownerId:          uid,
        patientId:        payment.patientId || payment.patient_id || null,
        paymentId,
        receipt_number,
        receipt_seq,
        mode:             'internal',
        doc_type:         'ORIGINAL',
        status:           'DRAFT',
        tax_withholding:  taxWithholding,
        payment_amount:   payment.amount,
        payment_method:   payment.payment_method,
        payment_date:     payment.payment_date,
        business_name:    profile.businessName || '',
        business_id:      profile.businessId   || '',
        links: { original_receipt_id: null, cancellation_receipt_id: null, replacement_receipt_id: null },
        audit_trail: [_auditEntry('CREATED', uid, context.auth.token?.email)],
        pdf_path:    null,
        sha256:      null,
        hmac:        null,
        issued_at:   null,
        created_at:  admin.firestore.FieldValue.serverTimestamp(),
      };
      txn.set(receiptRef, receiptData);
    });

    // Generate + upload PDF outside transaction
    const { pdfPath, sha256, hmac } = await _uploadReceiptPdf({
      receipt: { ...receiptData, receipt_number: receiptData.receipt_number },
      payment,
      profile,
      uid,
      receiptId: receiptRef.id,
      bucket,
      hmacSecret,
      originalReceiptNumber: null,
    });

    // Mark ISSUED
    await receiptRef.update({
      status:    'ISSUED',
      pdf_path:  pdfPath,
      sha256,
      hmac,
      issued_at: admin.firestore.FieldValue.serverTimestamp(),
      audit_trail: admin.firestore.FieldValue.arrayUnion(_auditEntry('ISSUED', uid, context.auth.token?.email)),
    });

    // Stamp payment with receipt info
    await db.collection('payments').doc(paymentId).update({
      receipt_id:     receiptRef.id,
      receipt_number: receiptData.receipt_number,
      receipt_mode:   'internal',
      receipt_status: 'ISSUED',
    });

    // Return pdfPath — client calls getDownloadURL() which uses Firebase Auth credentials
    return { receiptId: receiptRef.id, receiptNumber: receiptData.receipt_number, pdfPath };
  });

// ─────────────────────────────────────────────────────────────────────────────

exports.voidReceiptWithDocument = functions
  .runWith({ timeoutSeconds: 120, memory: '512MB' })
  .https.onCall(async (data, context) => {
    if (!context.auth) throw new functions.https.HttpsError('unauthenticated', 'נדרש אימות');

    const { receiptId, reason } = data;
    if (!receiptId) throw new functions.https.HttpsError('invalid-argument', 'חסר receiptId');
    if (!reason || !reason.trim()) throw new functions.https.HttpsError('invalid-argument', 'נדרשת סיבת ביטול');

    const uid = context.auth.uid;
    const db  = admin.firestore();
    const bucket = admin.storage().bucket();
    const hmacSecret = process.env.RECEIPT_HMAC_SECRET || null;

    const origSnap = await db.collection('receipts').doc(receiptId).get();
    if (!origSnap.exists || origSnap.data().ownerId !== uid) {
      throw new functions.https.HttpsError('not-found', 'קבלה לא נמצאה');
    }
    const orig = origSnap.data();
    if (orig.status !== 'ISSUED') throw new functions.https.HttpsError('failed-precondition', 'ניתן לבטל רק קבלה שהוצאה');
    if (orig.doc_type !== 'ORIGINAL') throw new functions.https.HttpsError('failed-precondition', 'לא ניתן לבטל מסמך ביטול');

    const profileRef = db.collection('receiptProfiles').doc(uid);
    const profileSnap = await profileRef.get();
    if (!profileSnap.exists) throw new functions.https.HttpsError('failed-precondition', 'פרופיל עסקי חסר');
    const profile = profileSnap.data();

    const origRef = db.collection('receipts').doc(receiptId);
    let cancelRef;
    let cancelData;

    await db.runTransaction(async txn => {
      const { receipt_seq, receipt_number } = await _allocateReceiptNumber(txn, profileRef);
      cancelRef = db.collection('receipts').doc();

      cancelData = {
        ownerId:         uid,
        patientId:       orig.patientId,
        paymentId:       orig.paymentId,
        receipt_number,
        receipt_seq,
        mode:            orig.mode,
        doc_type:        'CANCELLATION',
        status:          'DRAFT',
        tax_withholding: orig.tax_withholding,
        payment_amount:  orig.payment_amount,
        payment_method:  orig.payment_method,
        payment_date:    orig.payment_date,
        business_name:   orig.business_name,
        business_id:     orig.business_id,
        void_reason:     reason.trim(),
        links: {
          original_receipt_id:      receiptId,
          cancellation_receipt_id:  null,
          replacement_receipt_id:   null,
        },
        audit_trail: [_auditEntry('CREATED', uid, context.auth.token?.email, { reason: reason.trim(), related_receipt_id: receiptId })],
        pdf_path:   null,
        sha256:     null,
        hmac:       null,
        issued_at:  null,
        created_at: admin.firestore.FieldValue.serverTimestamp(),
      };
      txn.set(cancelRef, cancelData);

      // Mark original as VOIDED
      txn.update(origRef, {
        status: 'VOIDED',
        'links.cancellation_receipt_id': cancelRef.id,
        audit_trail: admin.firestore.FieldValue.arrayUnion(_auditEntry('VOIDED', uid, context.auth.token?.email, { reason: reason.trim(), related_receipt_id: cancelRef.id })),
      });
    });

    // Generate + upload CANCELLATION PDF
    const { pdfPath, sha256, hmac } = await _uploadReceiptPdf({
      receipt: cancelData,
      payment: { amount: orig.payment_amount, payment_method: orig.payment_method, payment_date: orig.payment_date },
      profile,
      uid,
      receiptId: cancelRef.id,
      bucket,
      hmacSecret,
      originalReceiptNumber: orig.receipt_number,
    });

    await cancelRef.update({
      status:    'ISSUED',
      pdf_path:  pdfPath,
      sha256,
      hmac,
      issued_at: admin.firestore.FieldValue.serverTimestamp(),
      audit_trail: admin.firestore.FieldValue.arrayUnion(_auditEntry('ISSUED', uid, context.auth.token?.email)),
    });

    // Update payment receipt_status
    await db.collection('payments').doc(orig.paymentId).update({ receipt_status: 'VOIDED' });

    return { cancellationReceiptId: cancelRef.id, cancellationReceiptNumber: cancelData.receipt_number };
  });

// ─────────────────────────────────────────────────────────────────────────────

exports.issueReplacementReceipt = functions
  .runWith({ timeoutSeconds: 180, memory: '512MB' })
  .https.onCall(async (data, context) => {
    if (!context.auth) throw new functions.https.HttpsError('unauthenticated', 'נדרש אימות');

    const { originalReceiptId, newPaymentId, reason, taxWithholding = 0 } = data;
    if (!originalReceiptId || !newPaymentId || !reason?.trim()) {
      throw new functions.https.HttpsError('invalid-argument', 'חסרים שדות חובה');
    }

    const uid = context.auth.uid;
    const db  = admin.firestore();
    const bucket = admin.storage().bucket();
    const hmacSecret = process.env.RECEIPT_HMAC_SECRET || null;

    const origSnap = await db.collection('receipts').doc(originalReceiptId).get();
    if (!origSnap.exists || origSnap.data().ownerId !== uid) {
      throw new functions.https.HttpsError('not-found', 'קבלה מקורית לא נמצאה');
    }
    const orig = origSnap.data();
    if (orig.status !== 'ISSUED') throw new functions.https.HttpsError('failed-precondition', 'ניתן להחליף רק קבלה שהוצאה');

    const newPaySnap = await db.collection('payments').doc(newPaymentId).get();
    if (!newPaySnap.exists || newPaySnap.data().ownerId !== uid) {
      throw new functions.https.HttpsError('not-found', 'תשלום חדש לא נמצא');
    }
    if (newPaySnap.data().receipt_id) {
      throw new functions.https.HttpsError('already-exists', 'לתשלום החדש כבר קיימת קבלה');
    }
    const newPayment = { id: newPaymentId, ...newPaySnap.data() };

    const profileRef = db.collection('receiptProfiles').doc(uid);
    const profileSnap = await profileRef.get();
    if (!profileSnap.exists) throw new functions.https.HttpsError('failed-precondition', 'פרופיל עסקי חסר');
    const profile = profileSnap.data();

    const origRef = db.collection('receipts').doc(originalReceiptId);
    let cancelRef, cancelData, replRef, replData;

    await db.runTransaction(async txn => {
      // Allocate cancellation number
      const { receipt_seq: cSeq, receipt_number: cNum } = await _allocateReceiptNumber(txn, profileRef);
      cancelRef = db.collection('receipts').doc();

      // Allocate replacement number (second allocation in same transaction)
      // Note: We re-read profileRef in the same transaction — Firestore allows this after the first update
      // Actually we need to do arithmetic ourselves since we already updated it
      const profSnap2 = await txn.get(profileRef);
      const numData = profSnap2.data().numbering || {};
      const replSeq = (numData.next_number || 1); // already incremented once above
      const replNum = `${numData.prefix || 'REC-'}${replSeq.toString().padStart(numData.padLength || 6, '0')}`;
      txn.update(profileRef, { 'numbering.next_number': admin.firestore.FieldValue.increment(1) });

      replRef = db.collection('receipts').doc();

      cancelData = {
        ownerId: uid, patientId: orig.patientId, paymentId: orig.paymentId,
        receipt_number: cNum, receipt_seq: cSeq,
        mode: orig.mode, doc_type: 'CANCELLATION', status: 'DRAFT',
        tax_withholding: orig.tax_withholding,
        payment_amount: orig.payment_amount, payment_method: orig.payment_method, payment_date: orig.payment_date,
        business_name: orig.business_name, business_id: orig.business_id,
        void_reason: reason.trim(),
        links: { original_receipt_id: originalReceiptId, cancellation_receipt_id: null, replacement_receipt_id: replRef.id },
        audit_trail: [_auditEntry('CREATED', uid, context.auth.token?.email, { reason: reason.trim(), related_receipt_id: originalReceiptId })],
        pdf_path: null, sha256: null, hmac: null, issued_at: null,
        created_at: admin.firestore.FieldValue.serverTimestamp(),
      };

      replData = {
        ownerId: uid, patientId: newPayment.patientId || newPayment.patient_id || orig.patientId, paymentId: newPaymentId,
        receipt_number: replNum, receipt_seq: replSeq,
        mode: 'internal', doc_type: 'REPLACEMENT', status: 'DRAFT',
        tax_withholding: taxWithholding,
        payment_amount: newPayment.amount, payment_method: newPayment.payment_method, payment_date: newPayment.payment_date,
        business_name: orig.business_name, business_id: orig.business_id,
        links: { original_receipt_id: originalReceiptId, cancellation_receipt_id: cancelRef.id, replacement_receipt_id: null },
        audit_trail: [_auditEntry('CREATED', uid, context.auth.token?.email, { reason: reason.trim(), related_receipt_id: originalReceiptId })],
        pdf_path: null, sha256: null, hmac: null, issued_at: null,
        created_at: admin.firestore.FieldValue.serverTimestamp(),
      };

      txn.set(cancelRef, cancelData);
      txn.set(replRef, replData);

      // Mark original VOIDED + REPLACED
      txn.update(origRef, {
        status: 'REPLACED',
        'links.cancellation_receipt_id': cancelRef.id,
        'links.replacement_receipt_id':  replRef.id,
        audit_trail: admin.firestore.FieldValue.arrayUnion(_auditEntry('REPLACED', uid, context.auth.token?.email, { reason: reason.trim(), related_receipt_id: replRef.id })),
      });
    });

    // Upload PDFs
    const [cancelPdf, replPdf] = await Promise.all([
      _uploadReceiptPdf({ receipt: cancelData, payment: { amount: orig.payment_amount, payment_method: orig.payment_method, payment_date: orig.payment_date }, profile, uid, receiptId: cancelRef.id, bucket, hmacSecret, originalReceiptNumber: orig.receipt_number }),
      _uploadReceiptPdf({ receipt: replData, payment: newPayment, profile, uid, receiptId: replRef.id, bucket, hmacSecret, originalReceiptNumber: orig.receipt_number }),
    ]);

    const now = admin.firestore.FieldValue.serverTimestamp();
    await Promise.all([
      cancelRef.update({ status: 'ISSUED', pdf_path: cancelPdf.pdfPath, sha256: cancelPdf.sha256, hmac: cancelPdf.hmac, issued_at: now, audit_trail: admin.firestore.FieldValue.arrayUnion(_auditEntry('ISSUED', uid, context.auth.token?.email)) }),
      replRef.update({   status: 'ISSUED', pdf_path: replPdf.pdfPath,   sha256: replPdf.sha256,   hmac: replPdf.hmac,   issued_at: now, audit_trail: admin.firestore.FieldValue.arrayUnion(_auditEntry('ISSUED', uid, context.auth.token?.email)) }),
      db.collection('payments').doc(orig.paymentId).update({ receipt_status: 'REPLACED' }),
      db.collection('payments').doc(newPaymentId).update({ receipt_id: replRef.id, receipt_number: replData.receipt_number, receipt_mode: 'internal', receipt_status: 'ISSUED' }),
    ]);

    return { cancellationId: cancelRef.id, replacementId: replRef.id, replacementNumber: replData.receipt_number };
  });

// ─────────────────────────────────────────────────────────────────────────────

exports.registerExternalReceipt = functions.https.onCall(async (data, context) => {
  if (!context.auth) throw new functions.https.HttpsError('unauthenticated', 'נדרש אימות');

  const { paymentId, externalData, uploadedPdfPath = null } = data;
  if (!paymentId) throw new functions.https.HttpsError('invalid-argument', 'חסר paymentId');
  const { provider, external_receipt_number, external_issued_date } = externalData || {};
  if (!external_receipt_number?.trim()) throw new functions.https.HttpsError('invalid-argument', 'נדרש מספר קבלה חיצונית');

  const uid = context.auth.uid;
  const db  = admin.firestore();

  const paySnap = await db.collection('payments').doc(paymentId).get();
  if (!paySnap.exists || paySnap.data().ownerId !== uid) {
    throw new functions.https.HttpsError('not-found', 'תשלום לא נמצא');
  }
  if (paySnap.data().receipt_id) {
    throw new functions.https.HttpsError('already-exists', 'לתשלום זה כבר קיימת קבלה');
  }

  const payment = paySnap.data();
  const receiptRef = db.collection('receipts').doc();
  const receiptData = {
    ownerId:                  uid,
    patientId:                payment.patientId || payment.patient_id || null,
    paymentId,
    receipt_number:           external_receipt_number.trim(),
    receipt_seq:              null,
    mode:                     'external',
    doc_type:                 'ORIGINAL',
    status:                   'ISSUED',
    payment_amount:           payment.amount,
    payment_method:           payment.payment_method,
    payment_date:             payment.payment_date,
    external_provider:        provider || '',
    external_receipt_number:  external_receipt_number.trim(),
    external_issued_date:     external_issued_date || '',
    external_pdf_path:        uploadedPdfPath,
    links: { original_receipt_id: null, cancellation_receipt_id: null, replacement_receipt_id: null },
    audit_trail: [_auditEntry('CREATED', uid, context.auth.token?.email)],
    pdf_path:  null,
    sha256:    null,
    hmac:      null,
    issued_at: admin.firestore.FieldValue.serverTimestamp(),
    created_at: admin.firestore.FieldValue.serverTimestamp(),
  };

  await receiptRef.set(receiptData);
  await db.collection('payments').doc(paymentId).update({
    receipt_id:     receiptRef.id,
    receipt_number: external_receipt_number.trim(),
    receipt_mode:   'external',
    receipt_status: 'ISSUED',
  });

  return { receiptId: receiptRef.id };
});

// ─────────────────────────────────────────────────────────────────────────────

exports.verifyReceipt = functions.https.onCall(async (data, context) => {
  if (!context.auth) throw new functions.https.HttpsError('unauthenticated', 'נדרש אימות');

  const { receiptId } = data;
  if (!receiptId) throw new functions.https.HttpsError('invalid-argument', 'חסר receiptId');

  const uid = context.auth.uid;
  const db  = admin.firestore();
  const snap = await db.collection('receipts').doc(receiptId).get();
  if (!snap.exists || snap.data().ownerId !== uid) {
    throw new functions.https.HttpsError('not-found', 'קבלה לא נמצאה');
  }

  const receipt = snap.data();
  if (!receipt.pdf_path || !receipt.sha256) return { valid: null, reason: 'אין קובץ PDF מקומי' };

  const bucket = admin.storage().bucket();
  const [buf] = await bucket.file(receipt.pdf_path).download();
  const computed = computeSHA256(buf);

  return { valid: computed === receipt.sha256, storedHash: receipt.sha256, computedHash: computed };
});

// ─────────────────────────────────────────────────────────────────────────────

exports.previewReceipt = functions
  .runWith({ timeoutSeconds: 60, memory: '512MB' })
  .https.onCall(async (data, context) => {
    if (!context.auth) throw new functions.https.HttpsError('unauthenticated', 'נדרש אימות');

    const uid = context.auth.uid;
    const profileSnap = await admin.firestore().collection('receiptProfiles').doc(uid).get();
    if (!profileSnap.exists) throw new functions.https.HttpsError('failed-precondition', 'יש להגדיר פרופיל עסקי');
    const profile = profileSnap.data();

    const dummyReceipt = {
      receipt_number: 'PREVIEW',
      doc_type: 'ORIGINAL',
      status: 'ISSUED',
      issued_at: new Date(),
      tax_withholding: 0,
      payment_amount: 350,
      payment_method: 'bit',
      payment_date: new Date().toLocaleDateString('he-IL'),
    };
    const dummyPayment = {
      amount: 350,
      payment_method: 'bit',
      payment_date: new Date().toLocaleDateString('he-IL'),
      notes: 'תצוגה מקדימה — טיפול לדוגמה',
    };

    const hmacSecret = process.env.RECEIPT_HMAC_SECRET || null;
    const bucket = admin.storage().bucket();
    const logoBuffer = await _loadBuffer(bucket, profile.logoPath);
    const sigBuffer  = await _loadBuffer(bucket, profile.signaturePath);

    const { pdfBuffer } = await generateReceiptPDF({
      receipt: dummyReceipt, payment: dummyPayment, profile,
      logoBuffer, signatureBuffer: sigBuffer, originalReceiptNumber: null, hmacSecret,
    });

    return { pdfBase64: pdfBuffer.toString('base64') };
  });
