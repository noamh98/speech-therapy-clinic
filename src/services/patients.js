// src/services/patients.js — Multi-tenant patient service using ownerId with robust error handling
import {
  collection, doc, addDoc, updateDoc,
  getDocs, getDoc, query, where, serverTimestamp,
  orderBy, writeBatch, increment
} from 'firebase/firestore';
import { db, auth } from './firebase';

const COLLECTION = 'patients';

/**
 * localDateStr — timezone-safe YYYY-MM-DD string from the local clock.
 *
 * WHY: new Date().toISOString().slice(0,10) converts to UTC before formatting.
 * In Israel (UTC+2/+3), local midnight is 22:00/21:00 UTC the previous day,
 * so toISOString() returns yesterday's date for any local time before 02:00/03:00 AM.
 * This function reads getFullYear/getMonth/getDate — always local, never UTC.
 */
function localDateStr(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

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
export async function deletePatient(patientId) {
  const user = requireAuth();
  
  // Verify ownership
  const snap = await getDoc(doc(db, COLLECTION, patientId));
  if (!snap.exists() || snap.data().ownerId !== user.uid) {
    throw new Error('Access denied: patient does not belong to you');
  }
  
  const batch = writeBatch(db);

  batch.update(doc(db, COLLECTION, patientId), {
    is_archived: true,
    archived_date: serverTimestamp(),
    updated_date: serverTimestamp(),
  });

  const today = localDateStr();
  const apptsSnap = await getDocs(
    query(
      collection(db, 'appointments'),
      where('ownerId', '==', user.uid),
      where('patient_id', '==', patientId),
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
  const user = requireAuth();
  
  // Verify ownership
  const snap = await getDoc(doc(db, COLLECTION, patientId));
  if (!snap.exists() || snap.data().ownerId !== user.uid) {
    throw new Error('Access denied: patient does not belong to you');
  }
  
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
