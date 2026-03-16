import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import { storage, auth } from './firebase';

export async function uploadPatientFile(patientId, file) {
  const user = auth.currentUser;
  if (!user) throw new Error("חובה להיות מחובר למערכת");

  // יצירת נתיב לקובץ
  const path = `patients/${patientId}/${Date.now()}_${file.name}`;
  const fileRef = ref(storage, path);
  
  const snapshot = await uploadBytes(fileRef, file);
  const url = await getDownloadURL(snapshot.ref);
  
  return {
    url,
    path, // חשוב לשמור את הנתיב כדי שנוכל למחוק אותו בעתיד
    name: file.name,
    created_at: new Date().toISOString()
  };
}

/**
 * פונקציה למחיקת קובץ פיזי מה-Storage
 * @param {string} filePath - הנתיב המלא של הקובץ בתוך ה-Storage
 */
export async function deletePatientFile(filePath) {
  if (!filePath) return;
  
  const fileRef = ref(storage, filePath);
  try {
    await deleteObject(fileRef);
  } catch (err) {
    console.error("Error deleting file from storage:", err);
    // אנחנו לא עוצרים את התהליך אם הקובץ כבר לא קיים בשרת
    if (err.code !== 'storage/object-not-found') {
      throw err;
    }
  }
}