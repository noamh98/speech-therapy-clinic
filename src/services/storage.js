// src/services/storage.js
import { ref, uploadBytesResumable, getDownloadURL, deleteObject } from 'firebase/storage';
import { storage, auth } from './firebase';

/**
 * העלאת קובץ עם תמיכה במעקב התקדמות (Progress)
 * @param {string} patientId - מזהה המטופל
 * @param {File} file - אובייקט הקובץ מה-input
 * @param {Function} onProgress - פונקציית Callback שמקבלת את אחוז ההעלאה (0-100)
 */
export async function uploadFileWithProgress(patientId, file, onProgress) {
  const user = auth.currentUser;
  if (!user) throw new Error("חובה להיות מחובר למערכת כדי להעלות קבצים");

  // ניקוי שם הקובץ מתווים בעייתיים כדי למנוע שגיאות ב-URL
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
  const path = `patients/${patientId}/${Date.now()}_${safeName}`;
  const fileRef = ref(storage, path);
  
  const uploadTask = uploadBytesResumable(fileRef, file);

  return new Promise((resolve, reject) => {
    uploadTask.on(
      'state_changed',
      (snapshot) => {
        // חישוב אחוזי ההתקדמות בצורה בטוחה
        const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
        if (onProgress) {
          onProgress(Math.round(progress));
        }
      },
      (error) => {
        console.error("Firebase Storage Upload Error:", error);
        // תרגום שגיאות נפוצות
        if (error.code === 'storage/unauthorized') {
          reject(new Error("אין הרשאה להעלות קבצים. בדוק את חוקי ה-Storage."));
        } else {
          reject(error);
        }
      },
      async () => {
        try {
          // קבלת ה-URL הציבורי לאחר סיום מוצלח
          const url = await getDownloadURL(uploadTask.snapshot.ref);
          resolve({
            url,
            path, 
            name: file.name, // משאירים את השם המקורי לתצוגה
            type: file.type,
            size: file.size,
            created_at: new Date().toISOString()
          });
        } catch (urlError) {
          console.error("Error getting download URL:", urlError);
          reject(urlError);
        }
      }
    );
  });
}

// כינוי לשם הישן כדי לשמור על תאימות לאחור בשאר המערכת
export { uploadFileWithProgress as uploadPatientFile };

/**
 * מחיקת קובץ מה-Storage
 */
export async function deletePatientFile(filePath) {
  if (!filePath) return;
  const fileRef = ref(storage, filePath);
  try {
    await deleteObject(fileRef);
  } catch (err) {
    // אם הקובץ לא נמצא, אנחנו לא רוצים שהאפליקציה תקרוס
    if (err.code !== 'storage/object-not-found') {
      console.error("Error deleting file:", err);
      throw err;
    }
  }
}