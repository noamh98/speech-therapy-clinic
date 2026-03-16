// src/services/patients.js
import {
  collection, doc, addDoc, updateDoc, deleteDoc,
  getDocs, getDoc, query, where, serverTimestamp, orderBy, writeBatch
} from 'firebase/firestore';
import { db } from './firebase';
import { auth } from './firebase';

const COLLECTION = 'patients';

function systemFields(extra = {}) {
  const user = auth.currentUser;
  return {
    created_by: user?.email || '',
    therapist_email: user?.email || '',
    ...extra,
  };
}

// עדכון: מושך רק מטופלים שלא בארכיון כברירת מחדל
export async function getPatients(therapistEmail, includeArchived = false) {
  let q = query(
    collection(db, COLLECTION),
    where('therapist_email', '==', therapistEmail),
    orderBy('full_name', 'asc')
  );

  const snap = await getDocs(q);
  const results = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  
  // סינון מקומי כדי לא לסבך את ה-Index של פיירבייס בשלב זה
  if (!includeArchived) {
    return results.filter(p => !p.is_archived);
  }
  return results;
}

export async function getPatient(id) {
  const snap = await getDoc(doc(db, COLLECTION, id));
  if (!snap.exists()) throw new Error('Patient not found');
  return { id: snap.id, ...snap.data() };
}

export async function createPatient(data) {
  const now = serverTimestamp();
  const ref = await addDoc(collection(db, COLLECTION), {
    ...data,
    ...systemFields(),
    created_date: now,
    updated_date: now,
    status: data.status || 'active',
    is_archived: false,
    portal_access_enabled: data.portal_access_enabled || false,
  });
  return ref.id;
}

export async function updatePatient(id, data) {
  await updateDoc(doc(db, COLLECTION, id), {
    ...data,
    updated_date: serverTimestamp(),
  });
}

/**
 * מחיקת מטופל (העברה לארכיון) וניקוי תורים עתידיים
 */
export async function deletePatient(patientId) {
  const user = auth.currentUser;
  if (!user) throw new Error("User not authenticated");

  try {
    const batch = writeBatch(db);

    // 1. העברה לארכיון (Soft Delete)
    const patientRef = doc(db, COLLECTION, patientId);
    batch.update(patientRef, { 
      is_archived: true,
      archived_date: serverTimestamp(),
      updated_date: serverTimestamp()
    });

    // 2. מציאת כל התורים העתידיים של המטופל למחיקה
    const today = new Date().toISOString().slice(0, 10);
    const apptsRef = collection(db, 'appointments');
    
    // התיקון כאן: הוספנו את therapist_email כדי לעמוד בחוקי האבטחה
    const q = query(
      apptsRef, 
      where('patient_id', '==', patientId),
      where('therapist_email', '==', user.email),
      where('date', '>=', today)
    );
    
    const apptsSnap = await getDocs(q);
    apptsSnap.forEach((d) => {
      batch.delete(doc(db, 'appointments', d.id));
    });

    // 3. ביצוע הפעולה (העברה לארכיון + מחיקת תורים)
    await batch.commit();
  } catch (error) {
    console.error("Error in deletePatient process:", error);
    throw error;
  }
}

/** Validate Israeli ID (Luhn-like algorithm) */
export function validateIsraeliId(id) {
  if (!id || id.length !== 9 || !/^\d{9}$/.test(id)) return false;
  let sum = 0;
  for (let i = 0; i < 9; i++) {
    let digit = parseInt(id[i]) * ((i % 2) + 1);
    if (digit > 9) digit -= 9;
    sum += digit;
  }
  return sum % 10 === 0;
}

/**
 * שחזור מטופל מהארכיון
 */
export async function restorePatient(patientId) {
  try {
    await updateDoc(doc(db, COLLECTION, patientId), {
      is_archived: false,
      updated_date: serverTimestamp()
    });
    return true;
  } catch (error) {
    console.error("Error restoring patient:", error);
    throw error;
  }
}