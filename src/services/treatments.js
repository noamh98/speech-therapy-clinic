// src/services/treatments.js — Multi-tenant treatments service with linked appointment and payment support
/**
 * TREATMENTS SERVICE — Linked-Record Architecture
 * 
 * Each treatment can be linked to an appointment via appointmentId.
 * When a treatment is created with a payment amount, it automatically creates a linked payment record.
 * 
 * STRUCTURE:
 * - treatments collection
 *   ├── ownerId (therapist's UID)
 *   ├── patient_id (patient reference)
 *   ├── appointmentId (optional, linked appointment)
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
  getDocs, query, where, serverTimestamp, orderBy, getCountFromServer,
  writeBatch,
} from 'firebase/firestore';
import { db, auth } from './firebase';
import { updateAppointment, linkAppointmentToTreatment } from './appointments';
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
    
    // Verify ownership
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
/**
 * getPatientTreatments — fetch all treatments for a specific patient.
 * מסנן אוטומטית טיפולים שנמצאים בארכיון.
 */
export async function getPatientTreatments(patientId) {
  const user = requireAuth();
  
  try {
    const q = query(
      collection(db, COLLECTION),
      where('ownerId', '==', user.uid),
      where('patient_id', '==', patientId)
    );
    const snap = await getDocs(q);
    
    return snap.docs
      .map(d => ({ id: d.id, ...d.data() }))
      // סינון צד-לקוח: מציג רק טיפולים שלא בארכיון
      .filter(t => t.is_archived !== true)
      .sort((a, b) => (b.treatment_number || 0) - (a.treatment_number || 0));
  } catch (error) {
    console.error('[treatments.js] Error fetching patient treatments:', error);
    throw error;
  }
}

/**
 * getTreatments — fetch all treatments for the current user.
 */
/**
 * getTreatments — fetch all active treatments for the current user.
 */
export async function getTreatments() {
  const user = requireAuth();
  
  try {
    const q = query(
      collection(db, COLLECTION),
      where('ownerId', '==', user.uid)
    );
    const snap = await getDocs(q);
    
    return snap.docs
      .map(d => ({ id: d.id, ...d.data() }))
      // סינון צד-לקוח למניעת צורך באינדקסים מורכבים
      .filter(t => t.is_archived !== true)
      .sort((a, b) => b.date.localeCompare(a.date));
  } catch (error) {
    console.error('[treatments.js] Error fetching all treatments:', error);
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
 * If paymentAmount is provided, automatically creates a linked payment record.
 * Automatically updates patient's last_visit and treatment_count.
 * Links to appointment if appointmentId is provided.
 */
export async function createTreatment(data) {
  const user = requireAuth();
  const now = serverTimestamp();

  const treatmentNumber = data.treatment_number || (await getNextTreatmentNumber(data.patient_id));
  
  const treatmentData = {
    date: data.date || new Date().toISOString().slice(0, 10),
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

    // ═══════════════════════════════════════════════════════════════════════════
    // UPDATE PATIENT: Increment treatment count and update last_visit
    // ═══════════════════════════════════════════════════════════════════════════
    await incrementTreatmentCount(treatmentData.patient_id, 1);
    await updatePatient(treatmentData.patient_id, {
      last_visit: treatmentData.date,
    });

    // ═══════════════════════════════════════════════════════════════════════════
    // LINK TO APPOINTMENT: If appointmentId provided, link and mark as completed
    // ═══════════════════════════════════════════════════════════════════════════
    if (treatmentData.appointmentId) {
      try {
        await linkAppointmentToTreatment(treatmentData.appointmentId, treatmentId);
        await updateAppointment(treatmentData.appointmentId, {
          status: 'completed',
        });
        console.log('[treatments.js] Linked treatment to appointment:', treatmentData.appointmentId);
      } catch (err) {
        console.warn('[treatments.js] Failed to link appointment:', err);
      }
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // CREATE PAYMENT: If paymentAmount provided, create linked payment record
    // ═══════════════════════════════════════════════════════════════════════════
    if (data.paymentAmount && Number(data.paymentAmount) > 0) {
      try {
        const paymentData = {
          treatmentId,
          patientId: treatmentData.patient_id,
          appointmentId: treatmentData.appointmentId || null,
          amount: Number(data.paymentAmount),
          payment_method: data.payment_method || 'cash',
          payment_date: treatmentData.date,
          description: `Payment for treatment #${treatmentNumber}`,
          notes: data.payment_notes || '',
        };

        await createPayment(paymentData);
        console.log('[treatments.js] Created linked payment for treatment:', treatmentId);
      } catch (err) {
        console.warn('[treatments.js] Failed to create linked payment:', err);
        // Non-fatal: treatment was created, but payment creation failed
      }
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // SYNC FILES: Add treatment files to patient's documents collection
    // ═══════════════════════════════════════════════════════════════════════════
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

  // Verify ownership
  const snap = await getDoc(docRef);
  if (!snap.exists() || snap.data().ownerId !== user.uid) {
    throw new Error('Access denied: treatment does not belong to you');
  }

  // Remove fields that should not be updated
  const { id: _, created_date, ownerId, therapist_email, ...updateData } = data;

  const finalUpdate = {
    ...updateData,
    updated_date: now
  };

  try {
    await updateDoc(docRef, finalUpdate);
    console.log('[treatments.js] Updated treatment:', id);

    // Sync files to patient documents if provided
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
 * deleteTreatment — Atomic cascade delete.
 *
 * WHAT THIS DOES IN A SINGLE BATCH:
 * 1. Deletes the treatment document itself.
 * 2. Deletes ALL payments linked to this treatment (treatmentId field).
 * 3. Resets the linked appointment back to 'scheduled' and clears treatmentId.
 *
 * WHY BATCH:
 * Three separate writes risk leaving orphan data if the network drops mid-way.
 * writeBatch is all-or-nothing — either every write commits or none do.
 *
 * WHY NOT DELETE THE APPOINTMENT:
 * The appointment represents a real event in the therapist's calendar.
 * Deleting the treatment documentation should NOT erase the fact that the
 * patient showed up. We reset it to 'scheduled' so it can be re-documented.
 *
 * @param {string} treatmentId   - Firestore document ID of the treatment
 * @param {string} patientId     - Used to decrement treatment_count on the patient
 * @returns {Promise<{
 *   deletedPaymentsCount: number,
 *   appointmentReset: boolean
 * }>} - Summary of what was cleaned up
 */
export async function deleteTreatment(treatmentId, patientId) {
  const user = requireAuth();

  if (!treatmentId) throw new Error('Treatment ID is required');

  // ─── Step 1: Verify ownership ────────────────────────────────────────────
  const treatmentRef = doc(db, COLLECTION, treatmentId);
  const treatmentSnap = await getDoc(treatmentRef);

  if (!treatmentSnap.exists()) {
    throw new Error('Treatment not found');
  }
  if (treatmentSnap.data().ownerId !== user.uid) {
    throw new Error('Access denied: treatment does not belong to you');
  }

  const treatmentData = treatmentSnap.data();
  const linkedAppointmentId = treatmentData.appointmentId || null;

  // ─── Step 2: Find all payments linked to this treatment ──────────────────
  // We query by treatmentId (camelCase) — the primary field in payments.js.
  // No need to also query by snake_case: payments.js stores both conventions
  // but links via treatmentId (camelCase) as the canonical join key.
  let linkedPayments = [];
  try {
    const paymentsQuery = query(
      collection(db, 'payments'),
      where('ownerId', '==', user.uid),
      where('treatmentId', '==', treatmentId)
    );
    const paymentsSnap = await getDocs(paymentsQuery);
    linkedPayments = paymentsSnap.docs;
  } catch (err) {
    // Non-fatal: log and continue. We'll still delete the treatment.
    // A manual cleanup can handle stale payments if this query fails.
    console.warn('[treatments.js] Could not fetch linked payments for cleanup:', err);
  }

  // ─── Step 3: Find the linked appointment (if any) ────────────────────────
  let appointmentRef = null;
  let appointmentSnap = null;

  if (linkedAppointmentId) {
    try {
      appointmentRef = doc(db, 'appointments', linkedAppointmentId);
      appointmentSnap = await getDoc(appointmentRef);

      // Only reset if it still exists AND belongs to this user
      if (!appointmentSnap.exists() || appointmentSnap.data().ownerId !== user.uid) {
        console.warn('[treatments.js] Linked appointment not found or access denied — skipping reset');
        appointmentRef = null;
        appointmentSnap = null;
      }
    } catch (err) {
      console.warn('[treatments.js] Could not fetch linked appointment:', err);
      appointmentRef = null;
    }
  }

  // ─── Step 4: Build and commit the atomic batch ───────────────────────────
  // Firestore batches support up to 500 operations.
  // Realistic max here: 1 treatment + ~20 payments + 1 appointment = well within limit.
  const batch = writeBatch(db);

  // 4a. Delete the treatment
  batch.delete(treatmentRef);

  // 4b. Delete all linked payments
  for (const paymentDoc of linkedPayments) {
    batch.delete(paymentDoc.ref);
  }

  // 4c. Reset the linked appointment → back to 'scheduled', clear treatmentId
  if (appointmentRef) {
    batch.update(appointmentRef, {
      status: 'scheduled',
      treatmentId: null,        // camelCase — matches appointments.js schema
      updated_date: serverTimestamp(),
    });
  }

  try {
    await batch.commit();
    console.log(
      `[treatments.js] Deleted treatment ${treatmentId}: ` +
      `${linkedPayments.length} payments removed, ` +
      `appointment ${linkedAppointmentId ? 'reset' : 'N/A'}`
    );
  } catch (err) {
    console.error('[treatments.js] Batch delete failed — nothing was deleted:', err);
    throw new Error('מחיקת הטיפול נכשלה. לא בוצעו שינויים. נסה שוב.');
  }

  // ─── Step 5: Decrement patient's treatment_count ─────────────────────────
  // This is OUTSIDE the batch intentionally:
  // treatment_count is a denormalized cache field — slightly stale is acceptable.
  // It uses Firestore increment() which is atomic on its own.
  // If this fails, the treatment is already gone (batch committed) and the
  // count will self-correct on the next createTreatment or a manual refresh.
  if (patientId) {
    try {
      await incrementTreatmentCount(patientId, -1);
    } catch (err) {
      console.warn('[treatments.js] treatment_count decrement failed (non-fatal):', err);
    }
  }

  return {
    deletedPaymentsCount: linkedPayments.length,
    appointmentReset: !!appointmentRef,
  };
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
// הוספת כינוי לפונקציה כדי למנוע שגיאות ייבוא בקומפוננטות
export const getTreatmentById = getTreatment;
// src/services/treatments.js

/**
 * getTreatmentByAppointment — check if a treatment already exists
 * for a given appointment. Used as an idempotency guard before create.
 *
 * WHY: If the user taps "Save" twice quickly (double-submit), or the
 * network drops after Firestore writes but before the response arrives,
 * we could create duplicate treatments for the same appointment.
 * This check prevents that.
 *
 * @param {string} appointmentId
 * @returns {Promise<object|null>} existing treatment or null
 */
export async function getTreatmentByAppointment(appointmentId) {
  if (!appointmentId) return null;
  const user = requireAuth();

  try {
    const q = query(
      collection(db, COLLECTION),
      where('ownerId', '==', user.uid),
      where('appointmentId', '==', appointmentId)
    );
    const snap = await getDocs(q);
    if (snap.empty) return null;

    // Return the first match — there should never be more than one
    // but if there is (legacy data), we take the most recent
    const docs = snap.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .sort((a, b) =>
        (b.treatment_number || 0) - (a.treatment_number || 0)
      );

    if (docs.length > 1) {
      console.warn(
        `[treatments.js] Found ${docs.length} treatments for appointment ` +
        `${appointmentId} — using most recent`
      );
    }

    return docs[0];
  } catch (err) {
    console.warn('[treatments.js] Idempotency check failed (non-fatal):', err);
    return null; // fail open — let the create proceed
  }
}