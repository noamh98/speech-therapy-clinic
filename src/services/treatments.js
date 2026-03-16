// src/services/treatments.js
import {
  collection, doc, addDoc, updateDoc, deleteDoc,
  getDocs, query, where, serverTimestamp, orderBy, getCountFromServer
} from 'firebase/firestore';
import { db, auth } from './firebase';
import { updateAppointment } from './appointments';
import { createNotification } from './notifications';

const COLLECTION = 'treatments';

/** * פונקציית עזר לקבלת המייל של המשתמש המחובר 
 */
const getCurrentUserEmail = () => auth.currentUser?.email || '';

export async function getPatientTreatments(patientId) {
  const email = getCurrentUserEmail();
  const q = query(
    collection(db, COLLECTION),
    where('patient_id', '==', patientId),
    where('therapist_email', '==', email), // הוספת אבטחה
    orderBy('treatment_number', 'desc')
  );
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

export async function getTreatments(therapistEmail) {
  const q = query(
    collection(db, COLLECTION),
    where('therapist_email', '==', therapistEmail),
    orderBy('date', 'desc')
  );
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

export async function getNextTreatmentNumber(patientId) {
  const email = getCurrentUserEmail();
  const q = query(
    collection(db, COLLECTION),
    where('patient_id', '==', patientId),
    where('therapist_email', '==', email) // הוספת אבטחה
  );
  const snap = await getDocs(q);
  return snap.size + 1;
}

export async function createTreatment(data) {
  const user = auth.currentUser;
  const now = serverTimestamp();

  // Auto-calculate treatment number
  const treatmentNumber = data.treatment_number || (await getNextTreatmentNumber(data.patient_id));

  const ref = await addDoc(collection(db, COLLECTION), {
    ...data,
    treatment_number: treatmentNumber,
    created_by: user?.email || '',
    therapist_email: user?.email || '',
    created_date: now,
    updated_date: now,
  });

  if (data.appointment_id) {
    await updateAppointment(data.appointment_id, { status: 'completed' });
  } else if (data.patient_id && data.date) {
    await autoLinkAppointment(data.patient_id, data.date, ref.id, user?.email);
  }

  if (treatmentNumber === 9) {
    await createNotification({
      type: 'follow_up',
      recipient_email: user?.email,
      patient_id: data.patient_id,
      patient_name: data.patient_name,
      subject: `מטופל ${data.patient_name} הגיע לטיפול ה-9`,
      message: `המטופל/ת ${data.patient_name} השלים/ה 9 טיפולים. מומלץ לבחון צרכים ויעדים לקראת המשך הטיפול.`,
      channel: 'email',
    });
  }

  return ref.id;
}

async function autoLinkAppointment(patientId, date, treatmentId, therapistEmail) {
  try {
    const { getDocs: gd, query: q, collection: col, where: w } = await import('firebase/firestore');
    const apptQuery = q(
      col(db, 'appointments'),
      w('patient_id', '==', patientId),
      w('therapist_email', '==', therapistEmail), // הוספת אבטחה לאוטומציה
      w('date', '==', date),
      w('status', '==', 'scheduled')
    );
    const apptSnap = await getDocs(apptQuery);
    if (!apptSnap.empty) {
      const appt = apptSnap.docs[0];
      await updateAppointment(appt.id, {
        status: 'completed',
        linked_treatment_id: treatmentId,
      });
    }
  } catch (e) {
    console.warn('Auto-link appointment failed:', e);
  }
}

export async function updateTreatment(id, data) {
  await updateDoc(doc(db, COLLECTION, id), {
    ...data,
    updated_date: serverTimestamp(),
  });
}

export async function deleteTreatment(id) {
  await deleteDoc(doc(db, COLLECTION, id));
}

/** * השאילתה שגרמה לשגיאת AggregationQuery
 */
export async function getPatientTreatmentCount(patientId) {
  const email = getCurrentUserEmail();
  const q = query(
    collection(db, COLLECTION),
    where('patient_id', '==', patientId),
    where('therapist_email', '==', email) // התיקון הקריטי כאן
  );
  const snap = await getCountFromServer(q);
  return snap.data().count;
}