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

/** שליפת תורים לפי טווח תאריכים */
export async function getAppointments(therapistEmail, startDate, endDate) {
  try {
    let q = query(
      collection(db, COLLECTION),
      where('therapist_email', '==', therapistEmail),
      orderBy('date', 'asc')
    );
    
    if (startDate) q = query(q, where('date', '>=', startDate));
    if (endDate)   q = query(q, where('date', '<=', endDate));
    
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch (error) {
    console.error("Error fetching appointments:", error);
    throw error;
  }
}

/** שליפת היסטוריית תורים של מטופל */
export async function getPatientAppointments(patientId) {
  const user = auth.currentUser;
  const q = query(
    collection(db, COLLECTION),
    where('patient_id', '==', patientId),
    where('therapist_email', '==', user?.email || ''),
    orderBy('date', 'desc')
  );
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

/** בדיקת חפיפת תורים */
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
  const newEnd = newStart + Number(durationMins);

  return appointments.filter(a => {
    const [ah, am] = a.start_time.split(':').map(Number);
    const aStart = ah * 60 + am;
    const aEnd = aStart + (Number(a.duration_minutes) || 45);
    return newStart < aEnd && newEnd > aStart;
  });
}

/** יצירת תור בודד */
export async function createAppointment(data) {
  const now = serverTimestamp();
  
  // ניקוי הנתונים לפני שמירה
  const appointmentData = {
    ...data,
    ...systemFields(),
    duration_minutes: Number(data.duration_minutes) || 45,
    price: Number(data.price) || 0,
    created_date: now,
    updated_date: now,
    status: data.status || 'scheduled',
  };

  const ref = await addDoc(collection(db, COLLECTION), appointmentData);
  return ref.id;
}

/** יצירת סדרת תורים חוזרים */
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
      therapist_email: user?.email || '',
      created_by: user?.email || '',
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

/** עדכון תור */
export async function updateAppointment(id, data) {
  const docRef = doc(db, COLLECTION, id);
  
  // ניקוי הנתונים למניעת שליחת אובייקטים של Firebase לתוך עצמם
  const { id: _, created_date, ...cleanData } = data;

  const updateFields = {
    ...cleanData,
    updated_date: serverTimestamp(),
  };

  // הבטחת סוגי נתונים תקינים אם הם קיימים
  if (updateFields.price !== undefined) updateFields.price = Number(updateFields.price);
  if (updateFields.duration_minutes !== undefined) updateFields.duration_minutes = Number(updateFields.duration_minutes);

  await updateDoc(docRef, updateFields);
}

/** מחיקת תור */
export async function deleteAppointment(id) {
  await deleteDoc(doc(db, COLLECTION, id));
}

/** מחיקת סדרה עתידית */
export async function deleteFutureSeries(seriesId, fromDate) {
  const user = auth.currentUser;
  const q = query(
    collection(db, COLLECTION),
    where('series_id', '==', seriesId),
    where('therapist_email', '==', user?.email || ''),
    where('status', '==', 'scheduled'),
    where('date', '>=', fromDate)
  );
  
  const snap = await getDocs(q);
  const batch = writeBatch(db);
  snap.docs.forEach(d => batch.delete(d.ref));
  await batch.commit();
  return snap.size;
}