import { doc, getDoc, setDoc } from 'firebase/firestore';
import { ref, uploadBytesResumable, getDownloadURL, deleteObject } from 'firebase/storage';
import { db, storage, auth } from './firebase';

function uid() {
  return auth.currentUser?.uid;
}

export async function getReceiptProfile() {
  const snap = await getDoc(doc(db, 'receiptProfiles', uid()));
  if (!snap.exists()) return null;
  return snap.data();
}

export async function saveReceiptProfile(profileData) {
  await setDoc(doc(db, 'receiptProfiles', uid()), profileData, { merge: true });
}

export async function uploadProfileAsset(assetType, file, onProgress) {
  const timestamp = Date.now();
  const ext = file.name.split('.').pop();
  const path = `receiptProfiles/${uid()}/${assetType}_${timestamp}.${ext}`;
  const storageRef = ref(storage, path);
  const task = uploadBytesResumable(storageRef, file);

  return new Promise((resolve, reject) => {
    task.on('state_changed',
      snap => onProgress?.(Math.round(snap.bytesTransferred / snap.totalBytes * 100)),
      reject,
      async () => {
        const url = await getDownloadURL(task.snapshot.ref);
        resolve({ path, url });
      },
    );
  });
}

export async function deleteProfileAsset(assetPath) {
  if (!assetPath) return;
  try {
    await deleteObject(ref(storage, assetPath));
  } catch (_) { /* ignore missing file */ }
}
