// src/services/patients.js
import {
  collection, doc, addDoc, updateDoc,
  getDocs, getDoc, query, where, serverTimestamp,
  orderBy, writeBatch, increment
} from 'firebase/firestore';
import { db, auth } from './firebase';

const COLLECTION = 'patients';

// ─── Firestore Index Required ──────────────────────────────────────────────────
//
// Add this composite index in the Firebase Console (or firestore.indexes.json):
//   Collection: patients
//   Fields:     therapist_email (ASC), is_archived (ASC), full_name (ASC)
//
// Until the index is created, getPatients() falls back to client-side filtering.
// ──────────────────────────────────────────────────────────────────────────────

function requireAuth() {
  const user = auth.currentUser;
  if (!user) throw new Error('User not authenticated');
  return user;
}

function systemFields() {
  const user = auth.currentUser;
  return {
    created_by: user?.email || '',
    therapist_email: user?.email || '',
  };
}

/**
 * getPatients — fetch patients with server-side archive filtering.
 *
 * FIX: previously fetched ALL patients then filtered `is_archived` in JS.
 * Now filters server-side. Falls back gracefully if composite index is missing.
 */
export async function getPatients(therapistEmail, includeArchived = false) {
  try {
    // Attempt server-side filter — requires composite index
    const q = query(
      collection(db, COLLECTION),
      where('therapist_email', '==', therapistEmail),
      where('is_archived', '==', includeArchived),
      orderBy('full_name', 'asc')
    );
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch (err) {
    // Index not yet deployed — fall back gracefully with a dev hint
    if (err.code === 'failed-precondition') {
      console.warn(
        '[patients.js] Missing Firestore index for (therapist_email, is_archived, full_name).',
        'Add it in the Firebase Console to improve performance.',
        'Falling back to client-side filter.'
      );
      const q = query(
        collection(db, COLLECTION),
        where('therapist_email', '==', therapistEmail),
        orderBy('full_name', 'asc')
      );
      const snap = await getDocs(q);
      const all = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      return includeArchived
        ? all.filter(p => p.is_archived)
        : all.filter(p => !p.is_archived);
    }
    throw err;
  }
}

export async function getPatient(id) {
  if (!id) throw new Error('Patient ID is required');
  const snap = await getDoc(doc(db, COLLECTION, id));
  if (!snap.exists()) throw new Error('Patient not found');
  return { id: snap.id, ...snap.data() };
}

// Alias used by treatments.js
export const getPatientById = getPatient;

/**
 * createPatient — adds treatment_count: 0 so Patients.jsx never needs
 * to fire a separate getCountFromServer() call per patient row.
 * Increment/decrement this field from createTreatment / deleteTreatment.
 */
export async function createPatient(data) {
  requireAuth();
  const now = serverTimestamp();
  const ref = await addDoc(collection(db, COLLECTION), {
    ...data,
    ...systemFields(),
    created_date: now,
    updated_date: now,
    status: data.status || 'active',
    is_archived: false,
    portal_access_enabled: data.portal_access_enabled || false,
    treatment_count: 0, // denormalized — eliminates N+1 queries in patient list
  });
  return ref.id;
}

export async function updatePatient(id, data) {
  if (!id) throw new Error('Patient ID is required');
  // Guard: never let stale UI state overwrite the atomic counter
  const { treatment_count, ...safeData } = data;
  await updateDoc(doc(db, COLLECTION, id), {
    ...safeData,
    updated_date: serverTimestamp(),
  });
}

/**
 * incrementTreatmentCount — atomic counter update.
 * Call with delta=+1 from createTreatment, delta=-1 from deleteTreatment.
 * Uses Firestore increment() — safe for concurrent writes.
 */
export async function incrementTreatmentCount(patientId, delta) {
  if (!patientId) return;
  try {
    await updateDoc(doc(db, COLLECTION, patientId), {
      treatment_count: increment(delta),
      updated_date: serverTimestamp(),
    });
  } catch (err) {
    // Non-fatal: a slightly stale count is fine; don't fail the treatment save.
    console.warn('[patients.js] Failed to sync treatment_count:', err);
  }
}

/**
 * deletePatient — soft-delete (archive) + cancel future appointments atomically.
 */
export async function deletePatient(patientId) {
  const user = requireAuth();
  const batch = writeBatch(db);

  batch.update(doc(db, COLLECTION, patientId), {
    is_archived: true,
    archived_date: serverTimestamp(),
    updated_date: serverTimestamp(),
  });

  const today = new Date().toISOString().slice(0, 10);
  const apptsSnap = await getDocs(
    query(
      collection(db, 'appointments'),
      where('patient_id', '==', patientId),
      where('therapist_email', '==', user.email),
      where('date', '>=', today)
    )
  );
  apptsSnap.forEach(d => batch.delete(d.ref));

  try {
    await batch.commit();
  } catch (error) {
    console.error('[patients.js] deletePatient batch failed:', error);
    throw new Error('לא הצלחנו להעביר את המטופל לארכיון. נסה שוב.');
  }
}

/** Validate Israeli ID — Luhn-variant checksum. */
export function validateIsraeliId(id) {
  if (!id || id.length !== 9 || !/^\d{9}$/.test(id)) return false;
  let sum = 0;
  for (let i = 0; i < 9; i++) {
    let digit = parseInt(id[i]) * ((i % 2) + 1);
    if (digit > 9) digit -= 9;
    sum += digit;
  }
  return sum % 10 === 0;
}

export async function restorePatient(patientId) {
  if (!patientId) throw new Error('Patient ID is required');
  try {
    await updateDoc(doc(db, COLLECTION, patientId), {
      is_archived: false,
      updated_date: serverTimestamp(),
    });
  } catch (error) {
    console.error('[patients.js] restorePatient failed:', error);
    throw new Error('לא הצלחנו לשחזר את המטופל. נסה שוב.');
  }
}