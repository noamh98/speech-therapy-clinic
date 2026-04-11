// src/services/templates.js
import { collection, addDoc, updateDoc, deleteDoc, getDocs, doc, serverTimestamp, query, where, orderBy } from 'firebase/firestore';
import { db, auth } from './firebase';

const COLLECTION = 'templates';

export async function getTemplates() {
  const user = auth.currentUser;
  if (!user?.uid) throw new Error('User not authenticated');

  const q = query(
    collection(db, COLLECTION),
    where('ownerId', '==', user.uid),
    orderBy('name', 'asc')
  );
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

export async function createTemplate(data) {
  const user = auth.currentUser;
  if (!user?.uid) throw new Error('User not authenticated');

  const now = serverTimestamp();
  const ref = await addDoc(collection(db, COLLECTION), {
    ...data,
    ownerId: user.uid,
    email: user.email,  // keep for reference but don't filter by it
    created_by_uid: user.uid,
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
