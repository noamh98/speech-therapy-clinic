import {
  collection, doc, addDoc, updateDoc, deleteDoc, getDoc,
  getDocs, query, where, serverTimestamp, orderBy, getCountFromServer
} from 'firebase/firestore';
import { db, auth } from './firebase';
import { updateAppointment } from './appointments';
import { updatePatient, getPatientById } from './patients';

const COLLECTION = 'treatments';

const getCurrentUserEmail = () => auth.currentUser?.email || '';

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
  if (!patientId) return 1;
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
  if (!user) throw new Error("User not authenticated");
  const now = serverTimestamp();

  const treatmentNumber = data.treatment_number || (await getNextTreatmentNumber(data.patient_id));
  
  // בנייה בטוחה של האובייקט
  const treatmentData = {
    date: data.date || new Date().toISOString().slice(0, 10),
    treatment_number: Number(treatmentNumber) || 1,
    patient_id: data.patient_id,
    patient_name: data.patient_name || '',
    appointment_id: data.appointment_id || null, // מקבל את ה-ID מהדיאלוג
    amount: Number(data.amount) || 0,
    payment_method: data.payment_method || 'cash',
    payment_status: data.payment_status || 'unpaid',
    payment_date: data.payment_date || '', // תוקן! תאריך התשלום נשמר
    goals: data.goals || '',
    description: data.description || '',
    progress: data.progress || '',
    files: data.files || [],
    therapist_email: user.email,
    created_date: now,
    updated_date: now,
  };

  try {
    const ref = await addDoc(collection(db, COLLECTION), treatmentData);

    // עדכון התור ביומן אם קיים ID
    if (treatmentData.appointment_id) {
      await updateAppointment(treatmentData.appointment_id, {
        treatment_id: ref.id,
        status: 'completed'
      });
    }

    if (treatmentData.files.length > 0) {
      for (const file of treatmentData.files) {
        await syncFileToPatient(treatmentData.patient_id, { ...file, treatment_id: ref.id });
      }
    }

    return { id: ref.id, ...treatmentData };
  } catch (error) {
    console.error("Error in createTreatment:", error);
    throw error;
  }
}

/** עדכון תיעוד קיים */
export async function updateTreatment(id, data) {
  const docRef = doc(db, COLLECTION, id);
  const now = serverTimestamp();

  const { id: _, created_date, therapist_email, ...updateData } = data;

  const finalUpdate = {
    ...updateData,
    amount: Number(updateData.amount) || 0,
    updated_date: now
  };

  try {
    await updateDoc(docRef, finalUpdate);

    if (data.files && data.files.length > 0) {
      for (const file of data.files) {
        await syncFileToPatient(data.patient_id, { ...file, treatment_id: id });
      }
    }

    return { id, ...data };
  } catch (error) {
    console.error("Error in updateTreatment:", error);
    throw error;
  }
}

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
    console.warn('Document sync failed:', err);
  }
}

export async function deleteTreatment(id) {
  await deleteDoc(doc(db, COLLECTION, id));
}

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