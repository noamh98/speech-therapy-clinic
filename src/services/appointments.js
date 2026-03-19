// src/services/appointments.js — Multi-tenant appointments service with linked treatment support
/**
 * APPOINTMENTS SERVICE — Linked-Record Architecture
 * 
 * Each appointment can be linked to a treatment via treatmentId.
 * When an appointment is marked as 'Completed', it can trigger treatment creation.
 * 
 * STRUCTURE:
 * - appointments collection
 *   ├── ownerId (therapist's UID)
 *   ├── patient_id (patient reference)
 *   ├── treatmentId (optional, linked treatment)
 *   ├── date (appointment date)
 *   ├── start_time (HH:MM format)
 *   ├── duration_minutes (session length)
 *   ├── status (scheduled, completed, cancelled)
 *   ├── notes (session notes)
 *   └── created_date, updated_date (timestamps)
 */

import {
  collection, doc, addDoc, updateDoc, deleteDoc, getDoc,
  getDocs, query, where, serverTimestamp, orderBy, writeBatch
} from 'firebase/firestore';
import { db, auth } from './firebase';

const COLLECTION = 'appointments';

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
 * getAppointments — fetch appointments for the current user within a date range.
 * Now uses ownerId for multi-tenancy instead of therapist_email.
 */
export async function getAppointments(startDate, endDate) {
  const user = requireAuth();
  try {
    let constraints = [
      collection(db, COLLECTION),
      where('ownerId', '==', user.uid),
      orderBy('date', 'asc')
    ];
    
    if (startDate) constraints.push(where('date', '>=', startDate));
    if (endDate) constraints.push(where('date', '<=', endDate));
    
    const q = query(...constraints);
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch (error) {
    // Fallback for missing indexes
    if (error.code === 'failed-precondition') {
      console.warn('[appointments.js] Missing Firestore index, using client-side filter');
      try {
        const q = query(
          collection(db, COLLECTION),
          where('ownerId', '==', user.uid)
        );
        const snap = await getDocs(q);
        let results = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        
        if (startDate) results = results.filter(a => a.date >= startDate);
        if (endDate) results = results.filter(a => a.date <= endDate);
        
        return results.sort((a, b) => a.date.localeCompare(b.date));
      } catch (fallbackErr) {
        console.error('[appointments.js] Fallback query failed:', fallbackErr);
        throw fallbackErr;
      }
    }
    console.error('[appointments.js] Error fetching appointments:', error);
    throw error;
  }
}

/**
 * getPatientAppointments — fetch appointment history for a specific patient.
 */
export async function getPatientAppointments(patientId) {
  const user = requireAuth();
  
  try {
    const q = query(
      collection(db, COLLECTION),
      where('ownerId', '==', user.uid),
      where('patient_id', '==', patientId),
      orderBy('date', 'desc')
    );
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch (error) {
    // Fallback for missing indexes
    if (error.code === 'failed-precondition') {
      console.warn('[appointments.js] Missing Firestore index, using client-side filter');
      try {
        const q = query(
          collection(db, COLLECTION),
          where('ownerId', '==', user.uid),
          where('patient_id', '==', patientId)
        );
        const snap = await getDocs(q);
        return snap.docs
          .map(d => ({ id: d.id, ...d.data() }))
          .sort((a, b) => b.date.localeCompare(a.date));
      } catch (fallbackErr) {
        console.error('[appointments.js] Fallback query failed:', fallbackErr);
        throw fallbackErr;
      }
    }
    throw error;
  }
}

/**
 * getAppointmentsByTreatment — fetch all appointments linked to a treatment.
 */
export async function getAppointmentsByTreatment(treatmentId) {
  if (!treatmentId) return [];
  const user = requireAuth();
  
  try {
    const q = query(
      collection(db, COLLECTION),
      where('ownerId', '==', user.uid),
      where('treatmentId', '==', treatmentId)
    );
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch (error) {
    console.warn('[appointments.js] Error fetching appointments by treatment:', error);
    return [];
  }
}

/**
 * checkOverlap — check for conflicting appointments on a given date/time.
 */
export async function checkOverlap(date, startTime, durationMins, excludeId = null) {
  const user = requireAuth();
  
  try {
    const q = query(
      collection(db, COLLECTION),
      where('ownerId', '==', user.uid),
      where('date', '==', date),
      where('status', '==', 'scheduled')
    );
    
    const snap = await getDocs(q);
    const appointments = snap.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .filter(a => a.id !== excludeId);

    const [sh, sm] = startTime.split(':').map(Number);
    const newStart = sh * 60 + sm;
    const newEnd = newStart + Number(durationMins);

    return appointments.filter(a => {
      const [ah, am] = a.start_time.split(':').map(Number);
      const aStart = ah * 60 + am;
      const aEnd = aStart + (Number(a.duration_minutes) || 45);
      return newStart < aEnd && newEnd > aStart;
    });
  } catch (error) {
    console.error('[appointments.js] Error checking overlap:', error);
    throw error;
  }
}

/**
 * createAppointment — create a single appointment.
 */
export async function createAppointment(data) {
  const user = requireAuth();
  const now = serverTimestamp();
  
  const appointmentData = {
    patient_id: data.patient_id,
    date: data.date,
    start_time: data.start_time,
    duration_minutes: Number(data.duration_minutes) || 45,
    status: data.status || 'scheduled',
    notes: data.notes || '',
    treatmentId: data.treatmentId || null,
    price: Number(data.price) || 0,
    ...systemFields(),
    created_date: now,
    updated_date: now,
  };

  try {
    const ref = await addDoc(collection(db, COLLECTION), appointmentData);
    console.log('[appointments.js] Created appointment:', ref.id);
    return ref.id;
  } catch (error) {
    console.error('[appointments.js] Error creating appointment:', error);
    throw error;
  }
}

/**
 * createRecurringSeries — create a series of recurring appointments.
 */
export async function createRecurringSeries(data, count, intervalDays) {
  const batch = writeBatch(db);
  const now = serverTimestamp();
  const seriesId = crypto.randomUUID();
  const user = requireAuth();

  const [y, m, d] = data.date.split('-').map(Number);
  let current = new Date(y, m - 1, d);

  const ids = [];
  for (let i = 0; i < count; i++) {
    const dateStr = current.toISOString().slice(0, 10);
    const ref = doc(collection(db, COLLECTION));
    
    batch.set(ref, {
      ...data,
      date: dateStr,
      series_id: seriesId,
      treatmentId: null,
      ownerId: user.uid,
      therapist_email: user.email || '',
      created_by: user.email || '',
      duration_minutes: Number(data.duration_minutes) || 45,
      price: Number(data.price) || 0,
      created_date: now,
      updated_date: now,
      status: 'scheduled',
    });
    
    ids.push(ref.id);
    current.setDate(current.getDate() + intervalDays);
  }
  
  await batch.commit();
  return ids;
}

/**
 * updateAppointment — update an existing appointment.
 */
export async function updateAppointment(id, data) {
  const user = requireAuth();
  const docRef = doc(db, COLLECTION, id);
  
  // Verify ownership
  const snap = await getDoc(docRef);
  if (!snap.exists() || snap.data().ownerId !== user.uid) {
    throw new Error('Access denied: appointment does not belong to you');
  }
  
  // Clean data to prevent Firebase objects from being saved
  const { id: _, created_date, ownerId, ...cleanData } = data;

  const updateFields = {
    ...cleanData,
    updated_date: serverTimestamp(),
  };

  // Ensure correct data types
  if (updateFields.price !== undefined) updateFields.price = Number(updateFields.price);
  if (updateFields.duration_minutes !== undefined) updateFields.duration_minutes = Number(updateFields.duration_minutes);

  try {
    await updateDoc(docRef, updateFields);
    console.log('[appointments.js] Updated appointment:', id);
  } catch (error) {
    console.error('[appointments.js] Error updating appointment:', error);
    throw error;
  }
}

/**
 * completeAppointment — mark appointment as completed and optionally link to treatment.
 */
export async function completeAppointment(id, treatmentId = null) {
  if (!id) throw new Error('Appointment ID is required');
  const user = requireAuth();
  const docRef = doc(db, COLLECTION, id);

  // Verify ownership
  const snap = await getDoc(docRef);
  if (!snap.exists() || snap.data().ownerId !== user.uid) {
    throw new Error('Access denied: appointment does not belong to you');
  }

  try {
    const updateData = {
      status: 'completed',
      updated_date: serverTimestamp(),
    };
    
    if (treatmentId) {
      updateData.treatmentId = treatmentId;
    }

    await updateDoc(docRef, updateData);
    console.log('[appointments.js] Completed appointment:', id);
    return true;
  } catch (error) {
    console.error('[appointments.js] Error completing appointment:', error);
    throw error;
  }
}

/**
 * deleteAppointment — delete a single appointment.
 */
export async function deleteAppointment(id) {
  const user = requireAuth();
  const docRef = doc(db, COLLECTION, id);
  
  // Verify ownership
  const snap = await getDoc(docRef);
  if (!snap.exists() || snap.data().ownerId !== user.uid) {
    throw new Error('Access denied: appointment does not belong to you');
  }
  
  try {
    await deleteDoc(docRef);
    console.log('[appointments.js] Deleted appointment:', id);
  } catch (error) {
    console.error('[appointments.js] Error deleting appointment:', error);
    throw error;
  }
}

/**
 * deleteFutureSeries — delete all future appointments in a recurring series.
 */
export async function deleteFutureSeries(seriesId, fromDate) {
  const user = requireAuth();
  
  try {
    const q = query(
      collection(db, COLLECTION),
      where('ownerId', '==', user.uid),
      where('series_id', '==', seriesId),
      where('status', '==', 'scheduled'),
      where('date', '>=', fromDate)
    );
    
    const snap = await getDocs(q);
    const batch = writeBatch(db);
    snap.docs.forEach(d => batch.delete(d.ref));
    await batch.commit();
    return snap.size;
  } catch (error) {
    console.error('[appointments.js] Error deleting future series:', error);
    throw error;
  }
}

/**
 * getAppointment — fetch a single appointment by ID.
 */
export async function getAppointment(id) {
  if (!id) throw new Error('Appointment ID is required');
  const user = requireAuth();
  const docRef = doc(db, COLLECTION, id);

  try {
    const snap = await getDoc(docRef);
    if (!snap.exists()) throw new Error('Appointment not found');

    const data = snap.data();
    if (data.ownerId !== user.uid) {
      throw new Error('Access denied: appointment does not belong to you');
    }

    return { id: snap.id, ...data };
  } catch (error) {
    console.error('[appointments.js] Error fetching appointment:', error);
    throw error;
  }
}

/**
 * linkAppointmentToTreatment — link an appointment to a treatment.
 */
export async function linkAppointmentToTreatment(appointmentId, treatmentId) {
  if (!appointmentId || !treatmentId) {
    throw new Error('Both appointmentId and treatmentId are required');
  }

  const user = requireAuth();
  const docRef = doc(db, COLLECTION, appointmentId);

  // Verify ownership
  const snap = await getDoc(docRef);
  if (!snap.exists() || snap.data().ownerId !== user.uid) {
    throw new Error('Access denied: appointment does not belong to you');
  }

  try {
    await updateDoc(docRef, {
      treatmentId,
      updated_date: serverTimestamp(),
    });
    console.log('[appointments.js] Linked appointment to treatment:', appointmentId, treatmentId);
    return true;
  } catch (error) {
    console.error('[appointments.js] Error linking appointment to treatment:', error);
    throw error;
  }
}

/**
 * unlinkAppointmentFromTreatment — remove treatment link from appointment.
 */
export async function unlinkAppointmentFromTreatment(appointmentId) {
  if (!appointmentId) throw new Error('Appointment ID is required');

  const user = requireAuth();
  const docRef = doc(db, COLLECTION, appointmentId);

  // Verify ownership
  const snap = await getDoc(docRef);
  if (!snap.exists() || snap.data().ownerId !== user.uid) {
    throw new Error('Access denied: appointment does not belong to you');
  }

  try {
    await updateDoc(docRef, {
      treatmentId: null,
      updated_date: serverTimestamp(),
    });
    console.log('[appointments.js] Unlinked appointment from treatment:', appointmentId);
    return true;
  } catch (error) {
    console.error('[appointments.js] Error unlinking appointment from treatment:', error);
    throw error;
  }
}
