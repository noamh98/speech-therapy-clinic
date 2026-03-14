// src/services/appointments.js
import {
  collection, doc, addDoc, updateDoc, deleteDoc,
  getDocs, query, where, serverTimestamp, orderBy, writeBatch
} from 'firebase/firestore';
import { db, auth } from './firebase';

const COLLECTION = 'appointments';

function systemFields() {
  const user = auth.currentUser;
  return {
    created_by: user?.email || '',
    therapist_email: user?.email || '',
  };
}

export async function getAppointments(therapistEmail, startDate, endDate) {
  let q = query(
    collection(db, COLLECTION),
    where('therapist_email', '==', therapistEmail),
    orderBy('date', 'asc')
  );
  if (startDate) q = query(q, where('date', '>=', startDate));
  if (endDate)   q = query(q, where('date', '<=', endDate));
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

export async function getPatientAppointments(patientId) {
  const q = query(
    collection(db, COLLECTION),
    where('patient_id', '==', patientId),
    orderBy('date', 'desc')
  );
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

/** Check for overlapping appointments */
export async function checkOverlap(therapistEmail, date, startTime, durationMins, excludeId = null) {
  const q = query(
    collection(db, COLLECTION),
    where('therapist_email', '==', therapistEmail),
    where('date', '==', date),
    where('status', '==', 'scheduled')
  );
  const snap = await getDocs(q);
  const appointments = snap.docs
    .map(d => ({ id: d.id, ...d.data() }))
    .filter(a => a.id !== excludeId);

  const [sh, sm] = startTime.split(':').map(Number);
  const newStart = sh * 60 + sm;
  const newEnd = newStart + durationMins;

  return appointments.filter(a => {
    const [ah, am] = a.start_time.split(':').map(Number);
    const aStart = ah * 60 + am;
    const aEnd = aStart + (a.duration_minutes || 45);
    return newStart < aEnd && newEnd > aStart;
  });
}

export async function createAppointment(data) {
  const now = serverTimestamp();
  const ref = await addDoc(collection(db, COLLECTION), {
    ...data,
    ...systemFields(),
    created_date: now,
    updated_date: now,
    status: 'scheduled',
  });
  return ref.id;
}

/** Create a recurring series of appointments */
export async function createRecurringSeries(data, count, intervalDays) {
  const batch = writeBatch(db);
  const now = serverTimestamp();
  const seriesId = crypto.randomUUID();
  const user = auth.currentUser;

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
      created_by: user?.email || '',
      therapist_email: user?.email || '',
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

export async function updateAppointment(id, data) {
  await updateDoc(doc(db, COLLECTION, id), {
    ...data,
    updated_date: serverTimestamp(),
  });
}

export async function deleteAppointment(id) {
  await deleteDoc(doc(db, COLLECTION, id));
}

/** Delete all future scheduled appointments in a series */
export async function deleteFutureSeries(seriesId, fromDate) {
  const q = query(
    collection(db, COLLECTION),
    where('series_id', '==', seriesId),
    where('status', '==', 'scheduled'),
    where('date', '>=', fromDate)
  );
  const snap = await getDocs(q);
  const batch = writeBatch(db);
  snap.docs.forEach(d => batch.delete(d.ref));
  await batch.commit();
  return snap.size;
}
