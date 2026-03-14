// src/services/templates.js
import { collection, addDoc, updateDoc, deleteDoc, getDocs, doc, serverTimestamp, query, where, orderBy } from 'firebase/firestore';
import { db, auth } from './firebase';

const COLLECTION = 'templates';

export async function getTemplates() {
  const user = auth.currentUser;
  const q = query(
    collection(db, COLLECTION),
    where('therapist_email', '==', user?.email || ''),
    orderBy('name', 'asc')
  );
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

export async function createTemplate(data) {
  const user = auth.currentUser;
  const now = serverTimestamp();
  const ref = await addDoc(collection(db, COLLECTION), {
    ...data,
    therapist_email: user?.email || '',
    created_by: user?.email || '',
    created_date: now,
    updated_date: now,
    active: true,
  });
  return ref.id;
}

export async function updateTemplate(id, data) {
  await updateDoc(doc(db, COLLECTION, id), { ...data, updated_date: serverTimestamp() });
}

export async function deleteTemplate(id) {
  await deleteDoc(doc(db, COLLECTION, id));
}
