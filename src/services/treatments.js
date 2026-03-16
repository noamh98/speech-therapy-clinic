// src/services/treatments.js
import {
  collection, doc, addDoc, updateDoc, deleteDoc, getDoc,
  getDocs, query, where, serverTimestamp, orderBy, getCountFromServer
} from 'firebase/firestore';
import { db, auth } from './firebase';
import { updateAppointment } from './appointments';
import { createNotification } from './notifications';
import { updatePatient, getPatientById } from './patients';

const COLLECTION = 'treatments';

const getCurrentUserEmail = () => auth.currentUser?.email || '';

/** שליפת טיפול ספציפי לפי ה-ID שלו */
export async function getTreatment(id) {
  try {
    if (!id) return null;
    const docRef = doc(db, COLLECTION, id);
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
      return { id: docSnap.id, ...docSnap.data() };
    }
    return null;
  } catch (error) {
    console.error("Error fetching treatment:", error);
    throw error;
  }
}

/** שליפת כל הטיפולים של מטופל ספציפי */
export async function getPatientTreatments(patientId) {
  const email = getCurrentUserEmail();
  const q = query(
    collection(db, COLLECTION),
    where('patient_id', '==', patientId),
    where('therapist_email', '==', email),
    orderBy('treatment_number', 'desc')
  );
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

/** שליפת כל הטיפולים של המטפל */
export async function getTreatments(therapistEmail) {
  const q = query(
    collection(db, COLLECTION),
    where('therapist_email', '==', therapistEmail),
    orderBy('date', 'desc')
  );
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

/** חישוב מספר הטיפול הבא בתור למטופל */
export async function getNextTreatmentNumber(patientId) {
  const email = getCurrentUserEmail();
  const q = query(
    collection(db, COLLECTION),
    where('patient_id', '==', patientId),
    where('therapist_email', '==', email)
  );
  const snap = await getDocs(q);
  return snap.size + 1;
}

/** יצירת תיעוד טיפול חדש */
export async function createTreatment(data) {
  const user = auth.currentUser;
  const now = serverTimestamp();

  // אם לא סופק מספר טיפול, נחשב אותו אוטומטית
  const treatmentNumber = data.treatment_number || (await getNextTreatmentNumber(data.patient_id));

  const ref = await addDoc(collection(db, COLLECTION), {
    ...data,
    treatment_number: treatmentNumber,
    created_by: user?.email || '',
    therapist_email: user?.email || '',
    created_date: now,
    updated_date: now,
  });

  // סנכרון הקובץ לתיק המסמכים של המטופל במידה וקיים
  if (data.fileData) {
    try {
      const patient = await getPatientById(data.patient_id);
      const currentDocs = patient.documents || [];
      
      await updatePatient(data.patient_id, {
        documents: [...currentDocs, {
          ...data.fileData,
          treatment_id: ref.id,
          source: 'treatment',
          created_at: new Date().toISOString()
        }]
      });
    } catch (err) {
      console.warn('Document sync to patient failed:', err);
    }
  }

  // עדכון הסטטוס של התור המקושר
  if (data.appointment_id) {
    await updateAppointment(data.appointment_id, { 
      status: 'completed',
      treatment_id: ref.id 
    });
  } else if (data.patient_id && data.date) {
    // אם לא נשלח ID של תור, ננסה למצוא תור מתאים לפי תאריך ולחבר ביניהם
    await autoLinkAppointment(data.patient_id, data.date, ref.id, user?.email);
  }

  // התראה בטיפול ה-9 (לצורך הערכת מצב לקראת הטיפול ה-10)
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

  return { id: ref.id, treatment_number: treatmentNumber };
}

/** חיבור אוטומטי של טיפול לתור קיים ביומן */
async function autoLinkAppointment(patientId, date, treatmentId, therapistEmail) {
  try {
    const apptQuery = query(
      collection(db, 'appointments'),
      where('patient_id', '==', patientId),
      where('therapist_email', '==', therapistEmail),
      where('date', '==', date),
      where('status', '==', 'scheduled')
    );
    const apptSnap = await getDocs(apptQuery);
    if (!apptSnap.empty) {
      const appt = apptSnap.docs[0];
      await updateAppointment(appt.id, {
        status: 'completed',
        treatment_id: treatmentId, // תיקון ל-treatment_id במקום linked_treatment_id לעקביות
      });
    }
  } catch (e) {
    console.warn('Auto-link appointment failed:', e);
  }
}

/** עדכון תיעוד קיים */
export async function updateTreatment(id, data) {
  const docRef = doc(db, COLLECTION, id);
  await updateDoc(docRef, {
    ...data,
    updated_date: serverTimestamp(),
  });
}

/** מחיקת תיעוד */
export async function deleteTreatment(id) {
  await deleteDoc(doc(db, COLLECTION, id));
}

/** קבלת כמות הטיפולים הכוללת של מטופל */
export async function getPatientTreatmentCount(patientId) {
  const email = getCurrentUserEmail();
  const q = query(
    collection(db, COLLECTION),
    where('patient_id', '==', patientId),
    where('therapist_email', '==', email)
  );
  const snap = await getCountFromServer(q);
  return snap.data().count;
}
export const getTreatmentById = getTreatment;