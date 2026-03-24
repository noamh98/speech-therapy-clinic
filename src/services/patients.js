// src/services/patients.js — Multi-tenant patient service using ownerId with robust error handling
import {
  collection, doc, addDoc, updateDoc,
  getDocs, getDoc, query, where, serverTimestamp,
  orderBy, writeBatch, increment
} from 'firebase/firestore';
import { db, auth } from './firebase';
import { localDateStr } from '../utils/formatters';

const COLLECTION = 'patients';

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

/**
 * getPatients — fetch ALL patients for the current user (both active and archived).
 * 
 * CRITICAL FIX: This function now:
 * 1. Fetches ONLY by ownerId (no complex filters that require indexes)
 * 2. Performs ALL filtering and sorting in JavaScript
 * 3. Gracefully handles auth race conditions
 * 4. Returns empty array instead of throwing on auth failure
 */
export async function getPatients(includeArchived = false) {
  try {
    const user = requireAuth();
    
    // CRITICAL: Simple query — only ownerId, no composite index required
    // This prevents "failed-precondition" errors from missing indexes
    const q = query(
      collection(db, COLLECTION),
      where('ownerId', '==', user.uid)
    );
    
    const snap = await getDocs(q);
    const all = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    
    console.log(`[patients.js] Fetched ${all.length} total patients for user ${user.uid}`);
    
    // ═══════════════════════════════════════════════════════════════════════════
    // CLIENT-SIDE FILTERING: All filtering happens here, not in Firestore
    // ═══════════════════════════════════════════════════════════════════════════
   // ═══════════════════════════════════════════════════════════════════════════
// CLIENT-SIDE FILTERING: סינון פשוט ובטוח יותר
// ═══════════════════════════════════════════════════════════════════════════
const filtered = all.filter(p => {
  // אם ביקשנו לראות הכל (כולל ארכיון), פשוט נחזיר אמת לכולם
  if (includeArchived === true) return true;

  // אחרת, נבדוק אם המטופל בארכיון. אם הוא לא - נציג אותו.
  const isArchived = p.is_archived === true || p.status === 'archived';
  return !isArchived;
});
    
    console.log(`[patients.js] After filtering: ${filtered.length} patients (includeArchived=${includeArchived})`);
    
    // ═══════════════════════════════════════════════════════════════════════════
    // CLIENT-SIDE SORTING: Sort by full_name in Hebrew alphabetical order
    // ═══════════════════════════════════════════════════════════════════════════
    const sorted = filtered.sort((a, b) =>
      (a.full_name || '').localeCompare(b.full_name || '', 'he')
    );
    
    return sorted;
  } catch (err) {
    console.error('[patients.js] Error in getPatients:', err);
    
    // CRITICAL: If auth fails, return empty array instead of throwing
    // This prevents the entire UI from crashing due to auth race conditions
    if (err.message === 'User not authenticated') {
      console.warn('[patients.js] Auth not ready yet, returning empty array');
      return [];
    }
    
    throw err;
  }
}

export async function getPatient(id) {
  if (!id) throw new Error('Patient ID is required');
  const user = requireAuth();
  const snap = await getDoc(doc(db, COLLECTION, id));
  if (!snap.exists()) throw new Error('Patient not found');
  
  // Verify ownership
  const data = snap.data();
  if (data.ownerId !== user.uid) {
    throw new Error('Access denied: patient does not belong to you');
  }
  
  return { id: snap.id, ...data };
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
    last_visit: data.last_visit || null, // Track last treatment date
  });
  return ref.id;
}

export async function updatePatient(id, data) {
  if (!id) throw new Error('Patient ID is required');
  const user = requireAuth();
  
  // Verify ownership before updating
  const snap = await getDoc(doc(db, COLLECTION, id));
  if (!snap.exists() || snap.data().ownerId !== user.uid) {
    throw new Error('Access denied: patient does not belong to you');
  }
  
  // Guard: never let stale UI state overwrite the atomic counter
  const { treatment_count, ownerId, ...safeData } = data;
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
// src/services/patients.js

/**
 * deletePatient — Soft-delete with full cascade.
 *
 * WHAT THIS DOES:
 * 1. Archives the patient (is_archived: true) — existing behavior
 * 2. Deletes all FUTURE scheduled appointments — existing behavior
 * 3. NEW: Soft-deletes all treatments (is_archived: true)
 * 4. NEW: Soft-deletes all payments linked to those treatments
 *
 * WHY SOFT DELETE FOR TREATMENTS/PAYMENTS (not hard delete):
 * - Preserves income history for reporting
 * - Allows full restore via restorePatient()
 * - Firestore batch limit is 500 ops — soft delete is safer for
 *   patients with large treatment histories
 *
 * WHY TWO BATCHES:
 * Firestore batches are capped at 500 operations.
 * A patient with 200 treatments × 3 payments each = 600+ ops.
 * We split into chunks of 400 to stay safely under the limit.
 *
 * @param {string} patientId
 * @returns {Promise<{
 *   archivedTreatments: number,
 *   archivedPayments: number,
 *   deletedAppointments: number
 * }>}
 */
export async function deletePatient(patientId) {
  const user = requireAuth();

  if (!patientId) throw new Error('Patient ID is required');

  // ─── Step 1: Verify ownership ────────────────────────────────────────────
  const patientRef = doc(db, COLLECTION, patientId);
  const patientSnap = await getDoc(patientRef);

  if (!patientSnap.exists()) {
    throw new Error('Patient not found');
  }
  if (patientSnap.data().ownerId !== user.uid) {
    throw new Error('Access denied: patient does not belong to you');
  }

  // ─── Step 2: Fetch all related data in parallel ──────────────────────────
  const today = localDateStr();

  const [treatmentsSnap, futureApptsSnap, paymentsSnap] = await Promise.all([

    // All treatments for this patient
    getDocs(query(
      collection(db, 'treatments'),
      where('ownerId', '==', user.uid),
      where('patient_id', '==', patientId)
    )),

    // Only FUTURE scheduled appointments (past ones stay for history)
    getDocs(query(
      collection(db, 'appointments'),
      where('ownerId', '==', user.uid),
      where('patient_id', '==', patientId),
      where('status', '==', 'scheduled'),
      where('date', '>=', today)
    )),

    // All payments for this patient
    getDocs(query(
      collection(db, 'payments'),
      where('ownerId', '==', user.uid),
      where('patientId', '==', patientId)
    )),

  ]);

  const treatmentDocs = treatmentsSnap.docs;
  const futureApptDocs = futureApptsSnap.docs;
  const paymentDocs = paymentsSnap.docs;

  console.log(
    `[patients.js] Archiving patient ${patientId}: ` +
    `${treatmentDocs.length} treatments, ` +
    `${paymentDocs.length} payments, ` +
    `${futureApptDocs.length} future appointments`
  );

  // ─── Step 3: Commit in batches of 400 ───────────────────────────────────
  // Firestore hard limit is 500 ops per batch.
  // We use 400 as a safe ceiling to leave room for the patient update itself.
  const BATCH_SIZE = 400;

  // Collect all write operations as { ref, type, data } descriptors
  const allOps = [

    // Archive the patient itself
    {
      ref: patientRef,
      type: 'update',
      data: {
        is_archived: true,
        archived_date: serverTimestamp(),
        updated_date: serverTimestamp(),
      }
    },

    // Soft-delete all treatments
    ...treatmentDocs.map(d => ({
      ref: d.ref,
      type: 'update',
      data: {
        is_archived: true,
        archived_date: serverTimestamp(),
        updated_date: serverTimestamp(),
      }
    })),

    // Soft-delete all payments
    ...paymentDocs.map(d => ({
      ref: d.ref,
      type: 'update',
      data: {
        is_archived: true,
        archived_date: serverTimestamp(),
        updated_date: serverTimestamp(),
      }
    })),

    // Hard-delete future appointments (they haven't happened yet)
    ...futureApptDocs.map(d => ({
      ref: d.ref,
      type: 'delete',
    })),

  ];

  // Split into chunks and commit sequentially
  // Sequential (not parallel) to avoid overwhelming Firestore
  // with concurrent batch commits from the same client
  const chunks = chunkArray(allOps, BATCH_SIZE);

  try {
    for (const chunk of chunks) {
      const batch = writeBatch(db);

      for (const op of chunk) {
        if (op.type === 'delete') {
          batch.delete(op.ref);
        } else {
          batch.update(op.ref, op.data);
        }
      }

      await batch.commit();
    }
  } catch (err) {
    console.error('[patients.js] Archive batch failed:', err);
    throw new Error('הארכוב נכשל. ייתכן שחלק מהנתונים עודכנו. נסה שוב.');
  }

  return {
    archivedTreatments: treatmentDocs.length,
    archivedPayments: paymentDocs.length,
    deletedAppointments: futureApptDocs.length,
  };
}

// ─── Helper ───────────────────────────────────────────────────────────────────
/**
 * chunkArray — split an array into chunks of maxSize.
 * Used to stay under Firestore's 500-ops-per-batch limit.
 */
function chunkArray(arr, maxSize) {
  const chunks = [];
  for (let i = 0; i < arr.length; i += maxSize) {
    chunks.push(arr.slice(i, i + maxSize));
  }
  return chunks;
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

// src/services/patients.js

/**
 * restorePatient — Full restore with cascade.
 *
 * MIRRORS deletePatient exactly in reverse:
 * Un-archives the patient, all their treatments, and all their payments.
 * Does NOT restore deleted future appointments (they were hard-deleted).
 *
 * @param {string} patientId
 * @returns {Promise<{
 *   restoredTreatments: number,
 *   restoredPayments: number
 * }>}
 */
export async function restorePatient(patientId) {
  if (!patientId) throw new Error('Patient ID is required');
  const user = requireAuth();

  // ─── Step 1: Verify ownership ────────────────────────────────────────────
  const patientRef = doc(db, COLLECTION, patientId);
  const patientSnap = await getDoc(patientRef);

  if (!patientSnap.exists()) {
    throw new Error('Patient not found');
  }
  if (patientSnap.data().ownerId !== user.uid) {
    throw new Error('Access denied: patient does not belong to you');
  }

  // ─── Step 2: Fetch all archived related data ─────────────────────────────
  const [treatmentsSnap, paymentsSnap] = await Promise.all([

    getDocs(query(
      collection(db, 'treatments'),
      where('ownerId', '==', user.uid),
      where('patient_id', '==', patientId),
      where('is_archived', '==', true)
    )),

    getDocs(query(
      collection(db, 'payments'),
      where('ownerId', '==', user.uid),
      where('patientId', '==', patientId),
      where('is_archived', '==', true)
    )),

  ]);

  const treatmentDocs = treatmentsSnap.docs;
  const paymentDocs = paymentsSnap.docs;

  console.log(
    `[patients.js] Restoring patient ${patientId}: ` +
    `${treatmentDocs.length} treatments, ` +
    `${paymentDocs.length} payments`
  );

  // ─── Step 3: Commit in batches of 400 ────────────────────────────────────
  const BATCH_SIZE = 400;

  const allOps = [

    // Restore the patient
    {
      ref: patientRef,
      type: 'update',
      data: {
        is_archived: false,
        archived_date: null,
        updated_date: serverTimestamp(),
      }
    },

    // Restore all treatments
    ...treatmentDocs.map(d => ({
      ref: d.ref,
      type: 'update',
      data: {
        is_archived: false,
        archived_date: null,
        updated_date: serverTimestamp(),
      }
    })),

    // Restore all payments
    ...paymentDocs.map(d => ({
      ref: d.ref,
      type: 'update',
      data: {
        is_archived: false,
        archived_date: null,
        updated_date: serverTimestamp(),
      }
    })),

  ];

  const chunks = chunkArray(allOps, BATCH_SIZE);

  try {
    for (const chunk of chunks) {
      const batch = writeBatch(db);
      for (const op of chunk) {
        batch.update(op.ref, op.data);
      }
      await batch.commit();
    }
  } catch (err) {
    console.error('[patients.js] Restore batch failed:', err);
    throw new Error('השחזור נכשל. ייתכן שחלק מהנתונים עודכנו. נסה שוב.');
  }

  return {
    restoredTreatments: treatmentDocs.length,
    restoredPayments: paymentDocs.length,
  };
}
