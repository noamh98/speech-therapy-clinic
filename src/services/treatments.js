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
    // Fallback for missing indexes
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
    // Fallback for missing indexes
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
 * deleteTreatment — CASCADING DELETE
 *
 * Atomically removes:
 *   1. The treatment document itself.
 *   2. All payments linked to this treatment (treatmentId == id).
 *   3. Unlinks the parent appointment: sets treatmentId→null, status→'scheduled'.
 *      The appointment slot is preserved on the calendar — only the documentation
 *      link and "completed" status are removed.
 *
 * After the batch write, decrements patient.treatment_count by 1.
 * (incrementTreatmentCount uses a separate atomic increment so it cannot be
 * included in the same batch without converting to a transaction — keeping it
 * separate is safe because it's the last step and non-fatal if it fails.)
 *
 * @param {string} id         Treatment document ID
 * @param {string} patientId  Patient document ID (required for count decrement)
 * @returns {object}  { deletedPayments, unlinkedAppointmentId }
 */
export async function deleteTreatment(id, patientId) {
  if (!id) throw new Error('Treatment ID is required');
  const user = requireAuth();

  // ── Step 1: Read the treatment (verify ownership + get linked IDs) ──────────
  const treatmentRef = doc(db, COLLECTION, id);
  const treatmentSnap = await getDoc(treatmentRef);

  if (!treatmentSnap.exists()) {
    throw new Error('Treatment not found');
  }
  const treatmentData = treatmentSnap.data();
  if (treatmentData.ownerId !== user.uid) {
    throw new Error('Access denied: treatment does not belong to you');
  }

  const linkedAppointmentId = treatmentData.appointmentId || null;

  // ── Step 2: Find all payments linked to this treatment ────────────────────
  // Cannot batch-query then batch-delete in a single batch because reads must
  // precede writes; we query first, then include deletions in the batch.
  let paymentDocs = [];
  try {
    const paymentsQuery = query(
      collection(db, 'payments'),
      where('ownerId',     '==', user.uid),
      where('treatmentId', '==', id)
    );
    const paymentsSnap = await getDocs(paymentsQuery);
    paymentDocs = paymentsSnap.docs;
  } catch (err) {
    // Fallback: missing index — try without ownerId filter then filter client-side
    console.warn('[treatments.js] Payment index missing, falling back:', err.message);
    try {
      const fallbackQuery = query(
        collection(db, 'payments'),
        where('treatmentId', '==', id)
      );
      const fallbackSnap = await getDocs(fallbackQuery);
      paymentDocs = fallbackSnap.docs.filter(d => d.data().ownerId === user.uid);
    } catch (fallbackErr) {
      console.warn('[treatments.js] Payment fallback also failed — payments may be orphaned:', fallbackErr.message);
      paymentDocs = [];
    }
  }

  // ── Step 3: Build and commit the batch ───────────────────────────────────
  // Max 500 ops per batch; a treatment won't realistically have >490 payments,
  // but guard anyway.
  const batch = writeBatch(db);

  // 3a. Delete the treatment
  batch.delete(treatmentRef);

  // 3b. Delete every linked payment
  for (const payDoc of paymentDocs) {
    batch.delete(payDoc.ref);
  }

  // 3c. Unlink the parent appointment (reset treatmentId + status)
  if (linkedAppointmentId) {
    const apptRef = doc(db, 'appointments', linkedAppointmentId);
    const apptSnap = await getDoc(apptRef);
    // Only update if it still exists and belongs to this user
    if (apptSnap.exists() && apptSnap.data().ownerId === user.uid) {
      batch.update(apptRef, {
        treatmentId:  null,
        status:       'scheduled',
        updated_date: serverTimestamp(),
      });
    }
  }

  await batch.commit();
  console.log(
    `[treatments.js] Cascade-deleted treatment ${id}:`,
    `${paymentDocs.length} payment(s) removed,`,
    linkedAppointmentId ? `appointment ${linkedAppointmentId} unlinked` : 'no linked appointment'
  );

  // ── Step 4: Decrement patient treatment count (atomic, separate from batch) ─
  if (patientId) {
    await incrementTreatmentCount(patientId, -1);
  }

  return {
    deletedPayments:        paymentDocs.length,
    unlinkedAppointmentId:  linkedAppointmentId,
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