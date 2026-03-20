// src/services/treatments.js — Multi-tenant treatments service with linked appointment and payment support
/**
 * TREATMENTS SERVICE — Linked-Record Architecture
 *
 * FIXES APPLIED:
 * 1. Replaced the two-step `linkAppointmentToTreatment()` + `updateAppointment(status:'completed')`
 *    with a single call to `completeAppointment(appointmentId, treatmentId)`.
 *    This eliminates a race condition where two rapid sequential writes to the same
 *    Firestore document could interleave, with the second write's serverTimestamp
 *    overwriting the first before it resolves.
 *
 * STRUCTURE:
 * - treatments collection
 *   ├── ownerId (therapist's UID)
 *   ├── patient_id (patient reference)
 *   ├── appointmentId (optional, linked appointment — camelCase, matches appointments.treatmentId)
 *   ├── date (treatment date)
 *   ├── treatment_number (sequential number per patient)
 *   ├── goals (treatment goals)
 *   ├── description (session description)
 *   ├── progress (patient progress notes)
 *   ├── files (attached documents)
 *   └── created_date, updated_date (timestamps)
 *
 * PAYMENTS ARE CREATED SEPARATELY via payments.js
 * Each payment has: treatmentId, patientId, appointmentId (optional), amount, method, date
 */

import {
  collection, doc, addDoc, updateDoc, deleteDoc, getDoc,
  getDocs, query, where, serverTimestamp, orderBy, getCountFromServer
} from 'firebase/firestore';
import { db, auth } from './firebase';
// FIX: Import completeAppointment instead of separate link + update calls.
// completeAppointment writes treatmentId and status:'completed' in a single atomic updateDoc.
import { completeAppointment } from './appointments';
import { updatePatient, getPatientById, incrementTreatmentCount } from './patients';
import { createPayment } from './payments';

const COLLECTION = 'treatments';

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
 * getTreatment — fetch a single treatment by ID.
 */
export async function getTreatment(id) {
  try {
    if (!id) return null;
    const user = requireAuth();
    const docRef = doc(db, COLLECTION, id);
    const docSnap = await getDoc(docRef);
    if (!docSnap.exists()) return null;

    const data = docSnap.data();
    if (data.ownerId !== user.uid) {
      throw new Error('Access denied: treatment does not belong to you');
    }

    return { id: docSnap.id, ...data };
  } catch (error) {
    console.error('[treatments.js] Error fetching treatment:', error);
    throw error;
  }
}

/**
 * getPatientTreatments — fetch all treatments for a specific patient.
 */
export async function getPatientTreatments(patientId) {
  const user = requireAuth();

  try {
    const q = query(
      collection(db, COLLECTION),
      where('ownerId', '==', user.uid),
      where('patient_id', '==', patientId),
      orderBy('treatment_number', 'desc')
    );
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch (error) {
    if (error.code === 'failed-precondition') {
      console.warn('[treatments.js] Missing Firestore index, using client-side filter');
      try {
        const q = query(
          collection(db, COLLECTION),
          where('ownerId', '==', user.uid),
          where('patient_id', '==', patientId)
        );
        const snap = await getDocs(q);
        return snap.docs
          .map(d => ({ id: d.id, ...d.data() }))
          .sort((a, b) => (b.treatment_number || 0) - (a.treatment_number || 0));
      } catch (fallbackErr) {
        console.error('[treatments.js] Fallback query failed:', fallbackErr);
        throw fallbackErr;
      }
    }
    throw error;
  }
}

/**
 * getTreatments — fetch all treatments for the current user.
 */
export async function getTreatments() {
  const user = requireAuth();

  try {
    const q = query(
      collection(db, COLLECTION),
      where('ownerId', '==', user.uid),
      orderBy('date', 'desc')
    );
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch (error) {
    if (error.code === 'failed-precondition') {
      console.warn('[treatments.js] Missing Firestore index, using client-side filter');
      try {
        const q = query(
          collection(db, COLLECTION),
          where('ownerId', '==', user.uid)
        );
        const snap = await getDocs(q);
        return snap.docs
          .map(d => ({ id: d.id, ...d.data() }))
          .sort((a, b) => b.date.localeCompare(a.date));
      } catch (fallbackErr) {
        console.error('[treatments.js] Fallback query failed:', fallbackErr);
        throw fallbackErr;
      }
    }
    throw error;
  }
}

/**
 * getTreatmentsByAppointment — fetch all treatments linked to an appointment.
 */
export async function getTreatmentsByAppointment(appointmentId) {
  if (!appointmentId) return [];
  const user = requireAuth();

  try {
    const q = query(
      collection(db, COLLECTION),
      where('ownerId', '==', user.uid),
      where('appointmentId', '==', appointmentId)
    );
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch (error) {
    console.warn('[treatments.js] Error fetching treatments by appointment:', error);
    return [];
  }
}

/**
 * getNextTreatmentNumber — get the next treatment number for a patient.
 */
export async function getNextTreatmentNumber(patientId) {
  const user = requireAuth();
  if (!patientId) return 1;

  try {
    const q = query(
      collection(db, COLLECTION),
      where('ownerId', '==', user.uid),
      where('patient_id', '==', patientId)
    );
    const snap = await getDocs(q);
    return snap.size + 1;
  } catch (error) {
    console.warn('[treatments.js] Error getting next treatment number:', error);
    return 1;
  }
}

/**
 * createTreatment — create a new treatment record.
 *
 * If paymentAmount is provided, automatically creates a linked payment record.
 * Automatically updates patient's last_visit and treatment_count.
 * Links to appointment if appointmentId is provided.
 */
export async function createTreatment(data) {
  const user = requireAuth();
  const now = serverTimestamp();

  const treatmentNumber = data.treatment_number || (await getNextTreatmentNumber(data.patient_id));

  const treatmentData = {
    // FIX: localDateStr() instead of toISOString().slice(0,10) — see function above.
    date: data.date || localDateStr(),
    treatment_number: Number(treatmentNumber) || 1,
    patient_id: data.patient_id,
    patient_name: data.patient_name || '',
    appointmentId: data.appointmentId || null,
    goals: data.goals || '',
    description: data.description || '',
    progress: data.progress || '',
    files: data.files || [],
    ...systemFields(),
    created_date: now,
    updated_date: now,
  };

  try {
    const ref = await addDoc(collection(db, COLLECTION), treatmentData);
    const treatmentId = ref.id;

    console.log('[treatments.js] Created treatment:', treatmentId);

    // ─── Update patient: increment treatment count and last_visit ──────────
    await incrementTreatmentCount(treatmentData.patient_id, 1);
    await updatePatient(treatmentData.patient_id, {
      last_visit: treatmentData.date,
    });

    // ─── Link to appointment: single atomic write ──────────────────────────
    // FIX: Replaced two sequential calls:
    //   linkAppointmentToTreatment(appointmentId, treatmentId)  — sets treatmentId
    //   updateAppointment(appointmentId, { status: 'completed' }) — sets status
    // With a single call to completeAppointment() which writes both fields at once,
    // eliminating the race condition between the two writes.
    if (treatmentData.appointmentId) {
      try {
        await completeAppointment(treatmentData.appointmentId, treatmentId);
        console.log('[treatments.js] Completed appointment:', treatmentData.appointmentId);
      } catch (err) {
        console.warn('[treatments.js] Failed to complete appointment (non-fatal):', err);
      }
    }

    // ─── Create payment if requested ───────────────────────────────────────
    if (data.paymentAmount && Number(data.paymentAmount) > 0) {
      try {
        const paymentData = {
          treatmentId,
          // Store both naming conventions so payment is queryable either way
          patientId: treatmentData.patient_id,
          patient_id: treatmentData.patient_id,
          appointmentId: treatmentData.appointmentId || null,
          amount: Number(data.paymentAmount),
          payment_method: data.payment_method || 'cash',
          // Inline payments created during treatment documentation represent
          // money already received — default to 'completed', not 'pending'.
          payment_status: 'completed',
          payment_date: treatmentData.date,
          description: `Payment for treatment #${treatmentNumber}`,
          notes: data.payment_notes || '',
        };

        await createPayment(paymentData);
        console.log('[treatments.js] Created linked payment for treatment:', treatmentId);
      } catch (err) {
        console.warn('[treatments.js] Failed to create linked payment (non-fatal):', err);
      }
    }

    // ─── Sync files to patient documents ──────────────────────────────────
    if (treatmentData.files.length > 0) {
      for (const file of treatmentData.files) {
        try {
          await syncFileToPatient(treatmentData.patient_id, { ...file, treatment_id: treatmentId });
        } catch (err) {
          console.warn('[treatments.js] Failed to sync file:', err);
        }
      }
    }

    return { id: treatmentId, ...treatmentData };
  } catch (error) {
    console.error('[treatments.js] Error in createTreatment:', error);
    throw error;
  }
}

/**
 * updateTreatment — update an existing treatment record.
 */
export async function updateTreatment(id, data) {
  const user = requireAuth();
  const docRef = doc(db, COLLECTION, id);
  const now = serverTimestamp();

  const snap = await getDoc(docRef);
  if (!snap.exists() || snap.data().ownerId !== user.uid) {
    throw new Error('Access denied: treatment does not belong to you');
  }

  const { id: _, created_date, ownerId, therapist_email, ...updateData } = data;

  const finalUpdate = {
    ...updateData,
    updated_date: now
  };

  try {
    await updateDoc(docRef, finalUpdate);
    console.log('[treatments.js] Updated treatment:', id);

    // If the update includes an appointmentId, ensure the appointment is also
    // marked complete and linked. Use completeAppointment for the same atomic
    // single-write reason as in createTreatment.
    if (data.appointmentId) {
      try {
        await completeAppointment(data.appointmentId, id);
        console.log('[treatments.js] Completed appointment on update:', data.appointmentId);
      } catch (err) {
        console.warn('[treatments.js] Failed to complete appointment on update (non-fatal):', err);
      }
    }

    if (data.files && data.files.length > 0) {
      for (const file of data.files) {
        try {
          await syncFileToPatient(data.patient_id, { ...file, treatment_id: id });
        } catch (err) {
          console.warn('[treatments.js] Failed to sync file:', err);
        }
      }
    }

    return { id, ...data };
  } catch (error) {
    console.error('[treatments.js] Error in updateTreatment:', error);
    throw error;
  }
}

/**
 * syncFileToPatient — add treatment files to patient's documents collection.
 */
async function syncFileToPatient(patientId, fileInfo) {
  try {
    if (!patientId) return;
    const patient = await getPatientById(patientId);
    if (!patient) return;

    const currentDocs = patient.documents || [];
    const exists = currentDocs.some(d => d.url === fileInfo.url);

    if (!exists) {
      await updatePatient(patientId, {
        documents: [...currentDocs, {
          ...fileInfo,
          source: 'treatment',
          created_at: new Date().toISOString()
        }]
      });
    }
  } catch (err) {
    console.warn('[treatments.js] Document sync failed:', err);
  }
}

/**
 * deleteTreatment — delete a treatment and update patient's treatment count.
 */
export async function deleteTreatment(id, patientId) {
  const user = requireAuth();
  const docRef = doc(db, COLLECTION, id);

  const snap = await getDoc(docRef);
  if (!snap.exists() || snap.data().ownerId !== user.uid) {
    throw new Error('Access denied: treatment does not belong to you');
  }

  try {
    await deleteDoc(docRef);
    console.log('[treatments.js] Deleted treatment:', id);

    if (patientId) {
      await incrementTreatmentCount(patientId, -1);
    }

    return true;
  } catch (error) {
    console.error('[treatments.js] Error deleting treatment:', error);
    throw error;
  }
}

/**
 * getTreatmentStats — get comprehensive treatment statistics for a date range.
 */
export async function getTreatmentStats(startDate, endDate) {
  const user = requireAuth();

  try {
    const q = query(
      collection(db, COLLECTION),
      where('ownerId', '==', user.uid)
    );

    const snap = await getDocs(q);
    let treatments = snap.docs.map(d => d.data());

    if (startDate) {
      treatments = treatments.filter(t => t.date >= startDate);
    }
    if (endDate) {
      treatments = treatments.filter(t => t.date <= endDate);
    }

    return {
      total_count: treatments.length,
      total_treatments: treatments.length,
    };
  } catch (error) {
    console.error('[treatments.js] Error getting treatment stats:', error);
    return { total_count: 0, total_treatments: 0 };
  }
}

// FIX: localDateStr() — timezone-safe local date. toISOString() converts to UTC
// first, which in Israel (UTC+2/+3) shifts local midnight to the previous UTC day,
// causing the stored date to be one day behind the date shown in the UI.
function localDateStr(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

// Alias to prevent import errors in components that use getTreatmentById
export const getTreatmentById = getTreatment;
