// src/services/notifications.js
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { db, auth } from './firebase';

export async function createNotification(data) {
  const user = auth.currentUser;
  const now = serverTimestamp();
  const ref = await addDoc(collection(db, 'notifications'), {
    ...data,
    status: 'pending',
    created_by: user?.email || '',
    therapist_email: user?.email || '',
    created_date: now,
    updated_date: now,
    sent_at: null,
  });

  // TODO: Connect to Cloud Function that actually sends the email.
  // The Cloud Function should listen to /notifications/{id} onCreate
  // and send via SendGrid / Firebase Extensions (Trigger Email).
  // For now we just store the record; the UI can poll or show pending notifications.

  return ref.id;
}
