// src/services/patients.js
import {
  collection, doc, addDoc, updateDoc, deleteDoc,
  getDocs, getDoc, query, where, serverTimestamp, orderBy
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

export async function getPatients(therapistEmail) {
  const q = query(
    collection(db, COLLECTION),
    where('therapist_email', '==', therapistEmail),
    orderBy('full_name', 'asc')
  );
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
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

export async function deletePatient(id) {
  // Business rule: check if treatments exist before deleting
  const treatmentsQ = query(
    collection(db, 'treatments'),
    where('patient_id', '==', id)
  );
  const treatmentsSnap = await getDocs(treatmentsQ);
  if (!treatmentsSnap.empty) {
    throw new Error('לא ניתן למחוק מטופל עם טיפולים קיימים. מחק קודם את כל הטיפולים.');
  }
  await deleteDoc(doc(db, COLLECTION, id));
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
