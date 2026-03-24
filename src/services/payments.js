// src/services/payments.js — Multi-tenant payments service using ownerId
/**
 * FIXES IN THIS VERSION:
 *
 * FIX A — getPayments() NOW FILTERS is_archived:
 *   After deletePatient() soft-archives payments (is_archived: true),
 *   getPayments() was returning ALL payments including archived ones.
 *   This caused paymentStats to still show the deleted patient's income
 *   even after archiving. FIX: client-side filter on is_archived !== true.
 *   Same fix applied to getPaymentsByPatient() and getPaymentsByTreatment().
 *
 * FIX B — DUAL patient_id FIELD CONSISTENCY:
 *   All create/update operations now explicitly write BOTH patientId (camelCase)
 *   AND patient_id (snake_case) so context filters using either convention work.
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

function localDateStr(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

// ─── Query helpers ────────────────────────────────────────────────────────────
async function queryWithFallback(primaryConstraints, fallbackFilter) {
  const user = requireAuth();
  try {
    const q = query(...primaryConstraints);
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch (err) {
    if (err.code === 'failed-precondition') {
      console.warn('[payments.js] Missing index, using client-side filter');
      const q = query(collection(db, COLLECTION), where('ownerId', '==', user.uid));
      const snap = await getDocs(q);
      const all = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      return fallbackFilter(all);
    }
    throw err;
  }
}

// ─── Reads ────────────────────────────────────────────────────────────────────

/**
 * getPayments — fetch all NON-ARCHIVED payments for the current user.
 * FIX A: Filters is_archived !== true so archived patient payments are excluded
 * from paymentStats computed in useClinicData.
 */
export async function getPayments() {
  const user = requireAuth();
  const results = await queryWithFallback(
    [
      collection(db, COLLECTION),
      where('ownerId', '==', user.uid),
      orderBy('payment_date', 'desc'),
    ],
    all => all.sort((a, b) => (b.payment_date || '').localeCompare(a.payment_date || ''))
  );
  // FIX A: exclude soft-archived records
  return results.filter(p => p.is_archived !== true);
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
  const results = await queryWithFallback(
    [
      collection(db, COLLECTION),
      where('ownerId', '==', user.uid),
      where('treatmentId', '==', treatmentId),
      orderBy('payment_date', 'desc'),
    ],
    all => all
      .filter(p => p.treatmentId === treatmentId)
      .sort((a, b) => (b.payment_date || '').localeCompare(a.payment_date || ''))
  );
  return results.filter(p => p.is_archived !== true);
}

export async function getPaymentsByPatient(patientId) {
  if (!patientId) throw new Error('Patient ID is required');
  const user = requireAuth();
  const results = await queryWithFallback(
    [
      collection(db, COLLECTION),
      where('ownerId', '==', user.uid),
      where('patientId', '==', patientId),
      orderBy('payment_date', 'desc'),
    ],
    all => all
      // FIX B: check both field naming conventions
      .filter(p => p.patientId === patientId || p.patient_id === patientId)
      .sort((a, b) => (b.payment_date || '').localeCompare(a.payment_date || ''))
  );
  return results.filter(p => p.is_archived !== true);
}

export async function getPaymentsByDateRange(startDate, endDate) {
  const user = requireAuth();
  const all = await queryWithFallback(
    [
      collection(db, COLLECTION),
      where('ownerId', '==', user.uid),
      orderBy('payment_date', 'desc'),
    ],
    items => items
  );
  return all
    .filter(p => p.is_archived !== true)
    .filter(p => {
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
  return snap.docs
    .filter(d => d.data().is_archived !== true)
    .reduce((total, d) => total + (d.data().amount || 0), 0);
}

export async function getPaymentsByAppointment(appointmentId) {
  if (!appointmentId) return [];
  const user = requireAuth();
  try {
    const results = await queryWithFallback(
      [
        collection(db, COLLECTION),
        where('ownerId', '==', user.uid),
        where('appointmentId', '==', appointmentId),
        orderBy('payment_date', 'desc'),
      ],
      all => all
        .filter(p => p.appointmentId === appointmentId)
        .sort((a, b) => (b.payment_date || '').localeCompare(a.payment_date || ''))
    );
    return results.filter(p => p.is_archived !== true);
  } catch (err) {
    console.warn('[payments.js] getPaymentsByAppointment failed:', err);
    return [];
  }
}

// ─── Write: createPayment ─────────────────────────────────────────────────────
export async function createPayment(data) {
  requireAuth();
  const now = serverTimestamp();

  const paymentData = {
    treatmentId:    data.treatmentId || null,
    // FIX B: always store both naming conventions
    patientId:      data.patientId || data.patient_id || null,
    patient_id:     data.patientId || data.patient_id || null,
    appointmentId:  data.appointmentId || null,
    amount:         Number(data.amount) || 0,
    payment_method: data.payment_method || 'cash',
    payment_status: data.payment_status || 'completed',
    payment_date:   data.payment_date || localDateStr(),
    description:    data.description || '',
    notes:          data.notes || '',
    receipt_url:          data.receipt_url || null,
    receipt_filename:     data.receipt_filename || null,
    receipt_type:         data.receipt_type || null,
    receipt_size:         data.receipt_size || null,
    receipt_uploaded_date: data.receipt_uploaded_date || null,
    is_archived:    false,   // explicit — ensures filter works from creation
    ...systemFields(),
    created_date:   now,
    updated_date:   now,
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

  // FIX B: keep both conventions in sync on update
  if (safeData.patientId)  safeData.patient_id = safeData.patientId;
  if (safeData.patient_id) safeData.patientId  = safeData.patient_id;

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
  if (!snap.exists() || snap.data().ownerId !== user.uid) throw new Error('Access denied');

  await updateDoc(docRef, {
    receipt_url:           receiptData.url,
    receipt_filename:      receiptData.filename,
    receipt_type:          receiptData.type,
    receipt_size:          receiptData.size,
    receipt_uploaded_date: serverTimestamp(),
    updated_date:          serverTimestamp(),
  });
}

export async function deletePaymentReceipt(id) {
  if (!id) throw new Error('Payment ID is required');
  const user = requireAuth();
  const docRef = doc(db, COLLECTION, id);
  const snap = await getDoc(docRef);
  if (!snap.exists() || snap.data().ownerId !== user.uid) throw new Error('Access denied');

  await updateDoc(docRef, {
    receipt_url:           null,
    receipt_filename:      null,
    receipt_type:          null,
    receipt_size:          null,
    receipt_uploaded_date: null,
    updated_date:          serverTimestamp(),
  });
}

// ─── Stats (kept for backward compat, but Dashboard no longer uses this) ─────
export async function getPaymentStats(startDate, endDate) {
  const payments = await getPaymentsByDateRange(startDate, endDate);
  const stats = {
    total_payments:   payments.length,
    total_amount:     0,
    total_income:     0,
    completed_amount: 0,
    pending_amount:   0,
    refunded_amount:  0,
    by_method:        {},
    by_status:        {},
  };
  payments.forEach(payment => {
    const amount = payment.amount || 0;
    stats.total_amount += amount;
    if (payment.payment_status === 'completed') {
      stats.completed_amount += amount;
      stats.total_income     += amount;
    } else if (payment.payment_status === 'pending') {
      stats.pending_amount  += amount;
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
