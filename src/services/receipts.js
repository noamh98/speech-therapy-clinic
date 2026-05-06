import { collection, query, where, orderBy, getDocs, getDoc, doc } from 'firebase/firestore';
import { ref, getDownloadURL } from 'firebase/storage';
import { httpsCallable } from 'firebase/functions';
import { db, storage, functions, auth } from './firebase';

const receiptsCol = () => collection(db, 'receipts');

function uid() {
  return auth.currentUser?.uid;
}

export async function getReceipts() {
  const q = query(receiptsCol(), where('ownerId', '==', uid()), orderBy('issued_at', 'desc'));
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

export async function getReceipt(id) {
  const snap = await getDoc(doc(db, 'receipts', id));
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() };
}

export async function getReceiptsByPayment(paymentId) {
  const q = query(receiptsCol(), where('ownerId', '==', uid()), where('paymentId', '==', paymentId), orderBy('issued_at', 'desc'));
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

export async function getReceiptsByPatient(patientId) {
  const q = query(receiptsCol(), where('ownerId', '==', uid()), where('patientId', '==', patientId), orderBy('issued_at', 'desc'));
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

export async function getReceiptPdfUrl(pdfPath) {
  const storageRef = ref(storage, pdfPath);
  return getDownloadURL(storageRef);
}

export async function issueReceiptInternal(paymentId, taxWithholding = 0) {
  const fn = httpsCallable(functions, 'issueReceiptInternal');
  const result = await fn({ paymentId, taxWithholding });
  const data = result.data;
  // Convert storage path to download URL using Firebase Auth credentials
  if (data.pdfPath) {
    try { data.pdfUrl = await getReceiptPdfUrl(data.pdfPath); } catch (_) {}
  }
  return data;
}

export async function registerExternalReceipt(paymentId, externalData, uploadedPdfPath = null) {
  const fn = httpsCallable(functions, 'registerExternalReceipt');
  const result = await fn({ paymentId, externalData, uploadedPdfPath });
  return result.data;
}

export async function verifyReceiptIntegrity(receiptId) {
  const fn = httpsCallable(functions, 'verifyReceipt');
  const result = await fn({ receiptId });
  return result.data;
}

export async function voidReceiptWithDocument(receiptId, reason) {
  const fn = httpsCallable(functions, 'voidReceiptWithDocument');
  const result = await fn({ receiptId, reason });
  return result.data;
}

export async function issueReplacementReceipt(originalReceiptId, newPaymentId, reason, taxWithholding = 0) {
  const fn = httpsCallable(functions, 'issueReplacementReceipt');
  const result = await fn({ originalReceiptId, newPaymentId, reason, taxWithholding });
  return result.data;
}

export async function previewReceiptCall() {
  const fn = httpsCallable(functions, 'previewReceipt');
  const result = await fn({});
  return result.data;
}
