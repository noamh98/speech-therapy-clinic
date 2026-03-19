// src/services/storage.js — Firebase Storage integration for patient files and receipts
/**
 * STORAGE SERVICE
 * 
 * Handles file uploads to Firebase Storage with progress tracking.
 * Supports:
 * - Patient documents (progress reports, assessments)
 * - Payment receipts (images, PDFs)
 * 
 * STORAGE STRUCTURE:
 * gs://bucket/
 *   ├── patients/{patientId}/{timestamp}_{filename}
 *   └── receipts/{ownerId}/{paymentId}/{timestamp}_{filename}
 */

import {
  ref, uploadBytesResumable, getDownloadURL, deleteObject
} from 'firebase/storage';
import { storage, auth } from './firebase';

/**
 * uploadPatientFile — upload a file for a patient (progress reports, assessments).
 * @param {string} patientId - Patient ID
 * @param {File} file - File from input
 * @param {Function} onProgress - Callback for progress (0-100)
 * @returns {Promise<Object>} File metadata with download URL
 */
export async function uploadPatientFile(patientId, file, onProgress) {
  const user = auth.currentUser;
  if (!user) throw new Error('User not authenticated');
  if (!patientId) throw new Error('Patient ID is required');
  if (!file) throw new Error('File is required');
  
  // Validate file size (max 50MB)
  const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB
  if (file.size > MAX_FILE_SIZE) {
    throw new Error('File size exceeds 50MB limit');
  }
  
  // Sanitize filename
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
  const timestamp = Date.now();
  const path = `patients/${patientId}/${timestamp}_${safeName}`;
  const fileRef = ref(storage, path);
  
  const uploadTask = uploadBytesResumable(fileRef, file);
  
  return new Promise((resolve, reject) => {
    uploadTask.on(
      'state_changed',
      (snapshot) => {
        // Progress callback
        const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
        if (onProgress) {
          onProgress(Math.round(progress));
        }
      },
      (error) => {
        console.error('Firebase Storage Upload Error:', error);
        if (error.code === 'storage/unauthorized') {
          reject(new Error('Permission denied: check Firebase Storage rules'));
        } else if (error.code === 'storage/canceled') {
          reject(new Error('Upload cancelled'));
        } else {
          reject(error);
        }
      },
      async () => {
        try {
          const url = await getDownloadURL(uploadTask.snapshot.ref);
          resolve({
            url,
            path,
            filename: file.name,
            type: file.type,
            size: file.size,
            uploaded_at: new Date().toISOString(),
          });
        } catch (urlError) {
          console.error('Error getting download URL:', urlError);
          reject(urlError);
        }
      }
    );
  });
}

/**
 * uploadReceipt — upload a receipt file (image or PDF) for a payment.
 * @param {string} paymentId - Payment ID
 * @param {File} file - Receipt file from input
 * @param {Function} onProgress - Callback for progress (0-100)
 * @returns {Promise<Object>} Receipt metadata with download URL
 */
export async function uploadReceipt(paymentId, file, onProgress) {
  const user = auth.currentUser;
  if (!user) throw new Error('User not authenticated');
  if (!paymentId) throw new Error('Payment ID is required');
  if (!file) throw new Error('File is required');
  
  // Validate file type (images and PDFs only)
  const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'application/pdf'];
  if (!ALLOWED_TYPES.includes(file.type)) {
    throw new Error('Only images (JPEG, PNG, GIF, WebP) and PDFs are allowed');
  }
  
  // Validate file size (max 20MB for receipts)
  const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20MB
  if (file.size > MAX_FILE_SIZE) {
    throw new Error('Receipt file size exceeds 20MB limit');
  }
  
  // Sanitize filename
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
  const timestamp = Date.now();
  const path = `receipts/${user.uid}/${paymentId}/${timestamp}_${safeName}`;
  const fileRef = ref(storage, path);
  
  const uploadTask = uploadBytesResumable(fileRef, file);
  
  return new Promise((resolve, reject) => {
    uploadTask.on(
      'state_changed',
      (snapshot) => {
        // Progress callback
        const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
        if (onProgress) {
          onProgress(Math.round(progress));
        }
      },
      (error) => {
        console.error('Firebase Storage Upload Error:', error);
        if (error.code === 'storage/unauthorized') {
          reject(new Error('Permission denied: check Firebase Storage rules'));
        } else if (error.code === 'storage/canceled') {
          reject(new Error('Upload cancelled'));
        } else {
          reject(error);
        }
      },
      async () => {
        try {
          const url = await getDownloadURL(uploadTask.snapshot.ref);
          resolve({
            url,
            path,
            filename: file.name,
            type: file.type,
            size: file.size,
            uploaded_at: new Date().toISOString(),
          });
        } catch (urlError) {
          console.error('Error getting download URL:', urlError);
          reject(urlError);
        }
      }
    );
  });
}

/**
 * deletePatientFile — delete a patient file from Storage.
 * @param {string} filePath - File path from storage
 */
export async function deletePatientFile(filePath) {
  if (!filePath) return;
  const fileRef = ref(storage, filePath);
  try {
    await deleteObject(fileRef);
  } catch (err) {
    // If file doesn't exist, that's okay
    if (err.code !== 'storage/object-not-found') {
      console.error('Error deleting file:', err);
      throw err;
    }
  }
}

/**
 * deleteReceipt — delete a receipt file from Storage.
 * @param {string} filePath - File path from storage
 */
export async function deleteReceipt(filePath) {
  if (!filePath) return;
  const fileRef = ref(storage, filePath);
  try {
    await deleteObject(fileRef);
  } catch (err) {
    // If file doesn't exist, that's okay
    if (err.code !== 'storage/object-not-found') {
      console.error('Error deleting receipt:', err);
      throw err;
    }
  }
}

/**
 * Alias for backward compatibility
 */
export { uploadPatientFile as uploadPatientFileWithProgress };
export { uploadReceipt as uploadReceiptWithProgress };
