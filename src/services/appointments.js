// src/services/appointments.js — Multi-tenant appointments service with linked treatment support
/**
 * APPOINTMENTS SERVICE — Linked-Record Architecture
 *
 * DATE HANDLING FIX — createRecurringSeries:
 *
 * ROOT CAUSE OF THE DATE-SHIFT BUG:
 * The loop in createRecurringSeries built each date string with:
 *   const dateStr = current.toISOString().slice(0, 10);
 *
 * `new Date(y, m-1, d)` creates a Date at LOCAL midnight (e.g. 2025-03-20 00:00 Israel time).
 * `.toISOString()` converts that to UTC before formatting:
 *   2025-03-20 00:00 Israel (UTC+2) → 2025-03-19 22:00 UTC → "2025-03-19"
 *
 * Every appointment in a recurring series was therefore saved one day EARLIER
 * than the date the user selected. A user clicking "March 20" always got "March 19"
 * stored in Firestore.
 *
 * THE FIX:
 * Replace toISOString().slice(0,10) with localDateStr(current), which reads
 * getFullYear() / getMonth() / getDate() — all local-clock based, never UTC.
 *
 * STRUCTURE:
 * - appointments collection
 *   ├── ownerId (therapist's UID)
 *   ├── patient_id (patient reference)
 *   ├── treatmentId (optional, linked treatment)
 *   ├── date (appointment date YYYY-MM-DD — always local)
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
 * localDateStr — timezone-safe YYYY-MM-DD from a Date object.
 *
 * WHY: toISOString() converts to UTC before formatting. In Israel (UTC+2/+3),
 * local midnight is 22:00/21:00 the previous UTC day, so toISOString().slice(0,10)
 * returns yesterday's date for any local time before 02:00/03:00 AM.
 * This function reads the local clock directly via getFullYear/getMonth/getDate.
 */
function localDateStr(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * getAppointments — fetch appointments for the current user within a date range.
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
    if (error.code === 'failed-precondition') {
      console.warn('[appointments.js] Missing Firestore index, using client-side filter');
      try {
        const q = query(collection(db, COLLECTION), where('ownerId', '==', user.uid));
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
 * The date field is passed directly from the UI's <input type="date"> value,
 * which is already a YYYY-MM-DD local string. No Date object conversion needed.
 */
export async function createAppointment(data) {
  const user = requireAuth();
  const now = serverTimestamp();

  const appointmentData = {
    patient_id: data.patient_id,
    // date comes directly from the form input as YYYY-MM-DD — no conversion needed.
    // Never wrap it in new Date() here; that would introduce timezone shifts.
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
 *
 * FIX: The previous implementation used:
 *   const dateStr = current.toISOString().slice(0, 10);
 *
 * `new Date(y, m-1, d)` creates local midnight. In Israel (UTC+2), that is
 * 22:00 UTC the night before. toISOString() formats in UTC, so the resulting
 * YYYY-MM-DD string was always one day EARLIER than intended.
 *
 * Fix: use localDateStr(current) which reads getFullYear/getMonth/getDate
 * directly from the local clock, bypassing UTC conversion entirely.
 */
export async function createRecurringSeries(data, count, intervalDays) {
  const batch = writeBatch(db);
  const now = serverTimestamp();
  const seriesId = crypto.randomUUID();
  const user = requireAuth();

  // Parse the input date parts and build a local-midnight Date.
  // new Date(y, m-1, d) gives local midnight — correct anchor point.
  const [y, m, d] = data.date.split('-').map(Number);
  let current = new Date(y, m - 1, d);

  const ids = [];
  for (let i = 0; i < count; i++) {
    // FIX: localDateStr() reads local getDate() — not UTC.
    // The old toISOString().slice(0,10) returned the UTC date (yesterday in UTC+2).
    const dateStr = localDateStr(current);
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
    // Advance by intervalDays using setDate — stays in local time, no UTC shift.
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

  const snap = await getDoc(docRef);
  if (!snap.exists() || snap.data().ownerId !== user.uid) {
    throw new Error('Access denied: appointment does not belong to you');
  }

  const { id: _, created_date, ownerId, ...cleanData } = data;
  const updateFields = { ...cleanData, updated_date: serverTimestamp() };

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
 * completeAppointment — mark appointment as completed and link to treatment.
 * Single atomic write — prevents the race condition of two sequential updateDoc calls.
 */
export async function completeAppointment(id, treatmentId = null) {
  if (!id) throw new Error('Appointment ID is required');
  const user = requireAuth();
  const docRef = doc(db, COLLECTION, id);

  const snap = await getDoc(docRef);
  if (!snap.exists() || snap.data().ownerId !== user.uid) {
    throw new Error('Access denied: appointment does not belong to you');
  }

  try {
    const updateData = { status: 'completed', updated_date: serverTimestamp() };
    if (treatmentId) updateData.treatmentId = treatmentId;
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

  const snap = await getDoc(docRef);
  if (!snap.exists() || snap.data().ownerId !== user.uid) {
    throw new Error('Access denied: appointment does not belong to you');
  }

  try {
    await updateDoc(docRef, { treatmentId, updated_date: serverTimestamp() });
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

  const snap = await getDoc(docRef);
  if (!snap.exists() || snap.data().ownerId !== user.uid) {
    throw new Error('Access denied: appointment does not belong to you');
  }

  try {
    await updateDoc(docRef, { treatmentId: null, updated_date: serverTimestamp() });
    console.log('[appointments.js] Unlinked appointment from treatment:', appointmentId);
    return true;
  } catch (error) {
    console.error('[appointments.js] Error unlinking appointment from treatment:', error);
    throw error;
  }
}
