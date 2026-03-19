// src/services/payments.js — Multi-tenant payments service using ownerId
/**
 * PAYMENTS SERVICE
 *
 * FIXES APPLIED:
 *
 * 1. WRONG DEFAULT payment_status:
 *    `createPayment` defaulted `payment_status` to `'pending'` when no status
 *    was provided. Every inline payment created via TreatmentDialog (the
 *    "create payment" checkbox flow) went through without a status, so it was
 *    stored as 'pending'. This meant `paymentStats.completed_amount` was always
 *    zero even after the therapist had received money.
 *    FIX: Default changed to `'completed'` — when a therapist creates a payment
 *    inline during treatment documentation, the money has been received.
 *    The PaymentModal still lets the user explicitly set any status.
 *
 * 2. MISSING patient_id FIELD (snake_case):
 *    The treatments collection stores patient reference as `patient_id`
 *    (snake_case). Payments stored only `patientId` (camelCase). Cross-queries
 *    that tried to join these collections by patient were mismatched.
 *    FIX: `createPayment` now stores BOTH `patientId` AND `patient_id` so the
 *    document is queryable from either convention without a migration.
 *
 * 3. UTC DATE OFFSET in createPayment default date:
 *    `new Date().toISOString().slice(0, 10)` produces a UTC date. In Israel
 *    this shifts to yesterday before 02:00/03:00 AM local time.
 *    FIX: Uses local-date helper inline.
 *
 * STRUCTURE:
 * - payments collection
 *   ├── ownerId (therapist's UID)
 *   ├── treatmentId (reference to treatment — camelCase)
 *   ├── patientId  (reference to patient — camelCase, primary)
 *   ├── patient_id (reference to patient — snake_case, alias for cross-queries)
 *   ├── appointmentId (reference to appointment — camelCase)
 *   ├── amount (payment amount in ILS)
 *   ├── payment_method (cash, credit, bank_transfer, check, bit, paybox)
 *   ├── payment_status (completed, pending, refunded, cancelled)
 *   ├── payment_date (YYYY-MM-DD local date)
 *   ├── description (auto-generated or manual)
 *   ├── notes (optional free text)
 *   ├── receipt_url / receipt_filename / receipt_type / receipt_size
 *   └── created_date, updated_date (Firestore serverTimestamp)
 */

import {
  collection, doc, addDoc, updateDoc, deleteDoc, getDoc,
  getDocs, query, where, serverTimestamp, orderBy,
} from 'firebase/firestore';
import { db, auth } from './firebase';

const COLLECTION = 'payments';

function requireAuth() {
  const user = auth.currentUser;
  if (!user) throw new Error('User not authenticated');
  return user;
}

function systemFields() {
  const user = auth.currentUser;
  return {
    ownerId: user?.uid || '',
    created_by: user?.email || '',
    therapist_email: user?.email || '',
  };
}

// FIX #3: Local-date helper — avoids UTC offset that toISOString() introduces
function localDateStr(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

// ─── Query helpers (with index fallback) ─────────────────────────────────────

async function queryWithFallback(primaryConstraints, fallbackFilter) {
  const user = requireAuth();
  try {
    const q = query(...primaryConstraints);
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch (err) {
    if (err.code === 'failed-precondition') {
      console.warn('[payments.js] Missing Firestore index, using client-side filter');
      const q = query(
        collection(db, COLLECTION),
        where('ownerId', '==', user.uid)
      );
      const snap = await getDocs(q);
      const all = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      return fallbackFilter(all);
    }
    throw err;
  }
}

// ─── Reads ────────────────────────────────────────────────────────────────────

export async function getPayments() {
  const user = requireAuth();
  return queryWithFallback(
    [collection(db, COLLECTION), where('ownerId', '==', user.uid), orderBy('payment_date', 'desc')],
    all => all.sort((a, b) => (b.payment_date || '').localeCompare(a.payment_date || ''))
  );
}

export async function getPayment(id) {
  if (!id) throw new Error('Payment ID is required');
  const user = requireAuth();
  const snap = await getDoc(doc(db, COLLECTION, id));
  if (!snap.exists()) throw new Error('Payment not found');
  const data = snap.data();
  if (data.ownerId !== user.uid) throw new Error('Access denied');
  return { id: snap.id, ...data };
}

export async function getPaymentsByTreatment(treatmentId) {
  if (!treatmentId) throw new Error('Treatment ID is required');
  const user = requireAuth();
  return queryWithFallback(
    [collection(db, COLLECTION), where('ownerId', '==', user.uid), where('treatmentId', '==', treatmentId), orderBy('payment_date', 'desc')],
    all => all.filter(p => p.treatmentId === treatmentId).sort((a, b) => (b.payment_date || '').localeCompare(a.payment_date || ''))
  );
}

export async function getPaymentsByPatient(patientId) {
  if (!patientId) throw new Error('Patient ID is required');
  const user = requireAuth();
  // Query by patientId (camelCase — primary field)
  return queryWithFallback(
    [collection(db, COLLECTION), where('ownerId', '==', user.uid), where('patientId', '==', patientId), orderBy('payment_date', 'desc')],
    all => all
      .filter(p => p.patientId === patientId || p.patient_id === patientId)
      .sort((a, b) => (b.payment_date || '').localeCompare(a.payment_date || ''))
  );
}

export async function getPaymentsByDateRange(startDate, endDate) {
  const user = requireAuth();
  const all = await queryWithFallback(
    [collection(db, COLLECTION), where('ownerId', '==', user.uid), orderBy('payment_date', 'desc')],
    items => items
  );
  return all.filter(p => {
    const d = p.payment_date || '';
    return (!startDate || d >= startDate) && (!endDate || d <= endDate);
  });
}

export async function getTotalPaymentsByPatient(patientId) {
  if (!patientId) throw new Error('Patient ID is required');
  const user = requireAuth();
  const q = query(
    collection(db, COLLECTION),
    where('ownerId', '==', user.uid),
    where('patientId', '==', patientId),
    where('payment_status', '==', 'completed')
  );
  const snap = await getDocs(q);
  return snap.docs.reduce((total, d) => total + (d.data().amount || 0), 0);
}

export async function getPaymentsByAppointment(appointmentId) {
  if (!appointmentId) return [];
  const user = requireAuth();
  try {
    return await queryWithFallback(
      [collection(db, COLLECTION), where('ownerId', '==', user.uid), where('appointmentId', '==', appointmentId), orderBy('payment_date', 'desc')],
      all => all.filter(p => p.appointmentId === appointmentId).sort((a, b) => (b.payment_date || '').localeCompare(a.payment_date || ''))
    );
  } catch (err) {
    console.warn('[payments.js] getPaymentsByAppointment failed:', err);
    return [];
  }
}

// ─── Write: createPayment ─────────────────────────────────────────────────────

/**
 * createPayment — create a new payment record.
 *
 * IMPORTANT: payment_status defaults to 'completed', not 'pending'.
 * Rationale: payments created inline during treatment documentation represent
 * money that has already been received. The PaymentModal lets users set any
 * explicit status when needed.
 */
export async function createPayment(data) {
  requireAuth();
  const now = serverTimestamp();

  const paymentData = {
    treatmentId: data.treatmentId || null,
    // FIX #2: Store BOTH field name conventions so cross-queries work regardless
    // of whether calling code uses camelCase or snake_case for the patient reference.
    patientId: data.patientId || data.patient_id || null,
    patient_id: data.patientId || data.patient_id || null,
    appointmentId: data.appointmentId || null,
    amount: Number(data.amount) || 0,
    payment_method: data.payment_method || 'cash',
    // FIX #1: Default to 'completed' — inline payments have already been received.
    // PaymentModal still lets users explicitly set 'pending' when needed.
    payment_status: data.payment_status || 'completed',
    // FIX #3: Use local date to avoid UTC midnight offset in Israel
    payment_date: data.payment_date || localDateStr(),
    description: data.description || '',
    notes: data.notes || '',
    receipt_url: data.receipt_url || null,
    receipt_filename: data.receipt_filename || null,
    receipt_type: data.receipt_type || null,
    receipt_size: data.receipt_size || null,
    receipt_uploaded_date: data.receipt_uploaded_date || null,
    ...systemFields(),
    created_date: now,
    updated_date: now,
  };

  try {
    const ref = await addDoc(collection(db, COLLECTION), paymentData);
    console.log('[payments.js] Created payment:', ref.id);
    return { id: ref.id, ...paymentData };
  } catch (error) {
    console.error('[payments.js] Error creating payment:', error);
    throw error;
  }
}

// ─── Write: updatePayment ─────────────────────────────────────────────────────

export async function updatePayment(id, data) {
  if (!id) throw new Error('Payment ID is required');
  const user = requireAuth();
  const docRef = doc(db, COLLECTION, id);

  const snap = await getDoc(docRef);
  if (!snap.exists() || snap.data().ownerId !== user.uid) {
    throw new Error('Access denied: payment does not belong to you');
  }

  const { id: _, created_date, ownerId, created_by, therapist_email, ...safeData } = data;
  if (safeData.amount !== undefined) safeData.amount = Number(safeData.amount);

  // FIX #2: Keep both patient ID conventions in sync on update
  if (safeData.patientId) safeData.patient_id = safeData.patientId;
  if (safeData.patient_id) safeData.patientId = safeData.patient_id;

  await updateDoc(docRef, { ...safeData, updated_date: serverTimestamp() });
  return { id, ...safeData };
}

// ─── Write: deletePayment ─────────────────────────────────────────────────────

export async function deletePayment(id) {
  if (!id) throw new Error('Payment ID is required');
  const user = requireAuth();
  const docRef = doc(db, COLLECTION, id);

  const snap = await getDoc(docRef);
  if (!snap.exists() || snap.data().ownerId !== user.uid) {
    throw new Error('Access denied: payment does not belong to you');
  }

  await deleteDoc(docRef);
  return true;
}

// ─── Receipt helpers ──────────────────────────────────────────────────────────

export async function updatePaymentReceipt(id, receiptData) {
  if (!id) throw new Error('Payment ID is required');
  const user = requireAuth();
  const docRef = doc(db, COLLECTION, id);

  const snap = await getDoc(docRef);
  if (!snap.exists() || snap.data().ownerId !== user.uid) {
    throw new Error('Access denied');
  }

  await updateDoc(docRef, {
    receipt_url: receiptData.url,
    receipt_filename: receiptData.filename,
    receipt_type: receiptData.type,
    receipt_size: receiptData.size,
    receipt_uploaded_date: serverTimestamp(),
    updated_date: serverTimestamp(),
  });
}

export async function deletePaymentReceipt(id) {
  if (!id) throw new Error('Payment ID is required');
  const user = requireAuth();
  const docRef = doc(db, COLLECTION, id);

  const snap = await getDoc(docRef);
  if (!snap.exists() || snap.data().ownerId !== user.uid) {
    throw new Error('Access denied');
  }

  await updateDoc(docRef, {
    receipt_url: null,
    receipt_filename: null,
    receipt_type: null,
    receipt_size: null,
    receipt_uploaded_date: null,
    updated_date: serverTimestamp(),
  });
}

// ─── Stats ────────────────────────────────────────────────────────────────────

export async function getPaymentStats(startDate, endDate) {
  const payments = await getPaymentsByDateRange(startDate, endDate);

  const stats = {
    total_payments: payments.length,
    total_amount: 0,
    total_income: 0,
    completed_amount: 0,
    pending_amount: 0,
    refunded_amount: 0,
    by_method: {},
    by_status: {},
  };

  payments.forEach(payment => {
    const amount = payment.amount || 0;
    stats.total_amount += amount;

    if (payment.payment_status === 'completed') {
      stats.completed_amount += amount;
      stats.total_income += amount;
    } else if (payment.payment_status === 'pending') {
      stats.pending_amount += amount;
    } else if (payment.payment_status === 'refunded') {
      stats.refunded_amount += amount;
    }

    const method = payment.payment_method || 'unknown';
    stats.by_method[method] = (stats.by_method[method] || 0) + amount;

    const status = payment.payment_status || 'unknown';
    stats.by_status[status] = (stats.by_status[status] || 0) + 1;
  });

  return stats;
}
