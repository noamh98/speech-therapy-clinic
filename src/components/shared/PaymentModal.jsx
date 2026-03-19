// src/components/shared/PaymentModal.jsx
/**
 * FIXES APPLIED:
 *
 * 1. UTC DATE OFFSET:
 *    `new Date().toISOString().slice(0, 10)` produces a UTC date. In Israel
 *    this can shift to yesterday before 02:00/03:00 AM local time.
 *    FIX: Uses localDateStr() helper throughout.
 *
 * 2. ENGLISH UI IN A HEBREW APP:
 *    All labels, buttons, status options, and method options were in English.
 *    FIX: Fully Hebraicized to match the rest of the application.
 *
 * 3. MISSING PAYMENT METHODS:
 *    Only cash/card/check/bank_transfer were available. The app's PAYMENT_METHODS
 *    constant also includes 'bit', 'paybox', and 'credit'.
 *    FIX: All methods added with Hebrew labels.
 *
 * 4. WRONG DEFAULT payment_status:
 *    Initial form state defaulted to 'pending'. When a therapist opens the
 *    payment modal to record a payment they've just received, the correct
 *    default is 'completed'.
 *    FIX: Default changed to 'completed'.
 *
 * 5. CONTEXT NOT REFRESHED AFTER SAVE:
 *    After creating or updating a payment, the shared useClinicData context
 *    was never notified. Dashboard revenue stats stayed stale.
 *    FIX: Calls refresh() from useClinicData after every successful save/delete.
 */

import React, { useState, useEffect } from 'react';
import { X, Upload, Trash2, Eye, AlertCircle, CheckCircle, Loader2 } from 'lucide-react';
import {
  createPayment, updatePayment, deletePayment,
  updatePaymentReceipt, deletePaymentReceipt,
} from '../../services/payments';
import { uploadReceipt, deleteReceipt } from '../../services/storage';
import { useClinicData } from '../../context/useClinicData';

// FIX #1: Local-date helper — avoids UTC midnight offset in Israel
function localDateStr(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

// FIX #3: All methods from PAYMENT_METHODS with Hebrew labels
const PAYMENT_METHOD_OPTIONS = [
  { value: 'cash',          label: 'מזומן' },
  { value: 'credit',        label: 'אשראי' },
  { value: 'bank_transfer', label: 'העברה בנקאית' },
  { value: 'check',         label: "צ'ק" },
  { value: 'bit',           label: 'ביט' },
  { value: 'paybox',        label: 'פייבוקס' },
];

// FIX #2 + #4: Hebrew status options, default is 'completed'
const PAYMENT_STATUS_OPTIONS = [
  { value: 'completed', label: 'שולם' },
  { value: 'pending',   label: 'ממתין לתשלום' },
  { value: 'refunded',  label: 'הוחזר' },
  { value: 'cancelled', label: 'בוטל' },
];

export function PaymentModal({
  isOpen,
  onClose,
  onSave,
  payment = null,
  patientId = null,
  treatmentId = null,
}) {
  // FIX #5: Get shared refresh so Dashboard stats update immediately after save
  const { refresh } = useClinicData();

  const [formData, setFormData] = useState({
    treatmentId: treatmentId || '',
    patientId: patientId || '',
    amount: '',
    payment_method: 'cash',
    // FIX #4: Default to 'completed' — payments are recorded when money is received
    payment_status: 'completed',
    // FIX #1: Use local date, not UTC
    payment_date: localDateStr(),
    notes: '',
  });

  const [receipt, setReceipt] = useState(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isUploading, setIsUploading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    if (payment) {
      setFormData({
        treatmentId: payment.treatmentId || treatmentId || '',
        patientId: payment.patientId || patientId || '',
        amount: payment.amount || '',
        payment_method: payment.payment_method || 'cash',
        payment_status: payment.payment_status || 'completed',
        // FIX #1: Use the stored date directly (already YYYY-MM-DD)
        payment_date: payment.payment_date || localDateStr(),
        notes: payment.notes || '',
      });
      if (payment.receipt_url) {
        setReceipt({
          url: payment.receipt_url,
          filename: payment.receipt_filename,
          type: payment.receipt_type,
          size: payment.receipt_size,
        });
      } else {
        setReceipt(null);
      }
    } else {
      setFormData({
        treatmentId: treatmentId || '',
        patientId: patientId || '',
        amount: '',
        payment_method: 'cash',
        payment_status: 'completed',
        payment_date: localDateStr(),
        notes: '',
      });
      setReceipt(null);
    }
    setError('');
    setSuccess('');
    setShowDeleteConfirm(false);
  }, [isOpen, payment, patientId, treatmentId]);

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
    setError('');
  };

  const handleReceiptUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'application/pdf'];
    if (!ALLOWED_TYPES.includes(file.type)) {
      setError('קבצים מותרים: תמונות (JPEG, PNG, GIF, WebP) או PDF');
      return;
    }
    if (file.size > 20 * 1024 * 1024) {
      setError('גודל הקובץ חורג מ-20MB');
      return;
    }

    setIsUploading(true);
    setError('');
    setUploadProgress(0);

    try {
      const tempId = payment?.id || `temp_${Date.now()}`;
      const uploaded = await uploadReceipt(tempId, file, (p) => setUploadProgress(p));
      setReceipt({ url: uploaded.url, filename: uploaded.filename, type: uploaded.type, size: uploaded.size, path: uploaded.path });
      setSuccess('הקבלה הועלתה בהצלחה');
      setTimeout(() => setSuccess(''), 3000);
    } catch (err) {
      setError(err.message || 'שגיאה בהעלאת קבלה');
    } finally {
      setIsUploading(false);
      setUploadProgress(0);
    }
  };

  const handleDeleteReceipt = async () => {
    if (!receipt) return;
    setIsUploading(true);
    try {
      if (receipt.path) await deleteReceipt(receipt.path);
      setReceipt(null);
    } catch (err) {
      setError(err.message || 'שגיאה במחיקת קבלה');
    } finally {
      setIsUploading(false);
    }
  };

  const validate = () => {
    if (!formData.amount || Number(formData.amount) <= 0) {
      setError('יש להזין סכום גדול מ-0');
      return false;
    }
    if (!formData.payment_date) {
      setError('יש לבחור תאריך תשלום');
      return false;
    }
    if (!formData.patientId && !patientId) {
      setError('חסר זיהוי מטופל');
      return false;
    }
    return true;
  };

  const handleSave = async () => {
    if (!validate()) return;
    setIsSaving(true);
    setError('');

    try {
      const paymentData = {
        ...formData,
        patientId: formData.patientId || patientId,
        amount: Number(formData.amount),
      };

      if (receipt?.url) {
        paymentData.receipt_url = receipt.url;
        paymentData.receipt_filename = receipt.filename;
        paymentData.receipt_type = receipt.type;
        paymentData.receipt_size = receipt.size;
      }

      let result;
      if (payment?.id) {
        result = await updatePayment(payment.id, paymentData);
        if (receipt?.url && !payment.receipt_url) {
          await updatePaymentReceipt(payment.id, { url: receipt.url, filename: receipt.filename, type: receipt.type, size: receipt.size });
        }
      } else {
        result = await createPayment(paymentData);
        if (receipt?.url && receipt?.path) {
          await updatePaymentReceipt(result.id, { url: receipt.url, filename: receipt.filename, type: receipt.type, size: receipt.size });
        }
      }

      setSuccess(payment?.id ? 'התשלום עודכן בהצלחה' : 'התשלום נשמר בהצלחה');

      // FIX #5: Refresh shared context so Dashboard revenue updates immediately
      refresh();

      setTimeout(() => {
        onSave(result);
        onClose();
      }, 800);
    } catch (err) {
      setError(err.message || 'שגיאה בשמירת תשלום');
      console.error('[PaymentModal] save error:', err);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!payment?.id) return;
    setIsDeleting(true);
    setError('');

    try {
      if (receipt?.path) {
        try { await deleteReceipt(receipt.path); } catch (e) { console.warn(e); }
      }
      await deletePayment(payment.id);
      setSuccess('התשלום נמחק');

      // FIX #5: Refresh shared context after delete
      refresh();

      setTimeout(() => {
        onSave(null);
        onClose();
      }, 800);
    } catch (err) {
      setError(err.message || 'שגיאה במחיקת תשלום');
    } finally {
      setIsDeleting(false);
      setShowDeleteConfirm(false);
    }
  };

  if (!isOpen) return null;

  const busy = isSaving || isUploading || isDeleting;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" dir="rtl">
      <div className="bg-white rounded-2xl shadow-xl max-w-md w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b">
          <h2 className="text-lg font-bold text-gray-900">
            {payment?.id ? 'עריכת תשלום' : 'תשלום חדש'}
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600" disabled={busy}>
            <X size={22} />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 space-y-4">
          {error && (
            <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-lg">
              <AlertCircle size={18} className="text-red-600 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-red-700">{error}</p>
            </div>
          )}
          {success && (
            <div className="flex items-start gap-2 p-3 bg-green-50 border border-green-200 rounded-lg">
              <CheckCircle size={18} className="text-green-600 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-green-700">{success}</p>
            </div>
          )}

          {/* Amount */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">סכום (₪) *</label>
            <input
              type="number" name="amount" value={formData.amount}
              onChange={handleInputChange} placeholder="0" step="1" min="0"
              className="input" disabled={busy}
            />
          </div>

          {/* Date */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">תאריך תשלום *</label>
            <input
              type="date" name="payment_date" value={formData.payment_date}
              onChange={handleInputChange} className="input" disabled={busy}
            />
          </div>

          {/* Method + Status */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              {/* FIX #2+#3: Hebrew labels, all methods */}
              <label className="block text-sm font-medium text-gray-700 mb-1">אמצעי תשלום</label>
              <select name="payment_method" value={formData.payment_method} onChange={handleInputChange} className="input" disabled={busy}>
                {PAYMENT_METHOD_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
            <div>
              {/* FIX #2+#4: Hebrew labels, default 'completed' */}
              <label className="block text-sm font-medium text-gray-700 mb-1">סטטוס</label>
              <select name="payment_status" value={formData.payment_status} onChange={handleInputChange} className="input" disabled={busy}>
                {PAYMENT_STATUS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">הערות</label>
            <textarea
              name="notes" value={formData.notes} onChange={handleInputChange}
              placeholder="הערות אופציונליות על התשלום..."
              rows={2} className="input resize-none" disabled={busy}
            />
          </div>

          {/* Receipt */}
          <div className="border-t pt-4">
            <h3 className="text-sm font-semibold text-gray-700 mb-3">קבלה</h3>
            {receipt ? (
              <div className="bg-gray-50 p-3 rounded-lg">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <div className={`w-8 h-8 rounded flex items-center justify-center flex-shrink-0 ${receipt.type?.includes('pdf') ? 'bg-red-100' : 'bg-blue-100'}`}>
                      <span className={`text-xs font-bold ${receipt.type?.includes('pdf') ? 'text-red-700' : 'text-blue-700'}`}>
                        {receipt.type?.includes('pdf') ? 'PDF' : 'IMG'}
                      </span>
                    </div>
                    <p className="text-xs text-gray-700 truncate">{receipt.filename}</p>
                  </div>
                  <button onClick={handleDeleteReceipt} className="text-red-500 hover:text-red-700" disabled={busy}>
                    <Trash2 size={15} />
                  </button>
                </div>
                <a href={receipt.url} target="_blank" rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700">
                  <Eye size={13} /> צפה בקבלה
                </a>
              </div>
            ) : (
              <div>
                <label className="flex items-center justify-center w-full px-4 py-3 border-2 border-dashed border-gray-200 rounded-lg cursor-pointer hover:border-teal-300 transition">
                  <div className="flex items-center gap-2">
                    <Upload size={16} className="text-gray-500" />
                    <span className="text-sm text-gray-500">{isUploading ? 'מעלה...' : 'העלה קבלה'}</span>
                  </div>
                  <input type="file" onChange={handleReceiptUpload} accept="image/jpeg,image/png,image/gif,image/webp,application/pdf" className="hidden" disabled={busy} />
                </label>
                {isUploading && (
                  <div className="mt-2">
                    <div className="w-full bg-gray-200 rounded-full h-1.5">
                      <div className="bg-teal-500 h-1.5 rounded-full transition-all" style={{ width: `${uploadProgress}%` }} />
                    </div>
                    <p className="text-xs text-gray-500 mt-1 text-center">{uploadProgress}%</p>
                  </div>
                )}
                <p className="text-xs text-gray-400 mt-1">תמונות או PDF, עד 20MB</p>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex gap-3 p-5 border-t bg-gray-50 rounded-b-2xl">
          {payment?.id && !showDeleteConfirm && (
            <button
              onClick={() => setShowDeleteConfirm(true)}
              className="px-4 py-2 bg-red-50 text-red-600 rounded-xl hover:bg-red-100 font-medium text-sm transition"
              disabled={busy}
            >
              מחק
            </button>
          )}

          {showDeleteConfirm && (
            <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
              <div className="bg-white rounded-2xl p-5 max-w-xs w-full shadow-xl" dir="rtl">
                <h3 className="text-base font-bold text-gray-900 mb-2">מחיקת תשלום</h3>
                <p className="text-sm text-gray-500 mb-4">פעולה זו אינה ניתנת לביטול. האם להמשיך?</p>
                <div className="flex gap-2">
                  <button onClick={() => setShowDeleteConfirm(false)} className="flex-1 px-4 py-2 bg-gray-100 text-gray-700 rounded-xl hover:bg-gray-200 text-sm font-medium" disabled={isDeleting}>
                    ביטול
                  </button>
                  <button onClick={handleDelete} className="flex-1 px-4 py-2 bg-red-600 text-white rounded-xl hover:bg-red-700 text-sm font-medium disabled:opacity-50" disabled={isDeleting}>
                    {isDeleting ? 'מוחק...' : 'מחק'}
                  </button>
                </div>
              </div>
            </div>
          )}

          <button onClick={onClose} className="flex-1 px-4 py-2 bg-gray-100 text-gray-700 rounded-xl hover:bg-gray-200 font-medium text-sm transition" disabled={busy}>
            ביטול
          </button>
          <button onClick={handleSave} className="flex-1 px-4 py-2 bg-teal-600 text-white rounded-xl hover:bg-teal-700 font-medium text-sm transition disabled:opacity-50 flex items-center justify-center gap-2" disabled={busy}>
            {isSaving ? <><Loader2 size={15} className="animate-spin" /> שומר...</> : 'שמור תשלום'}
          </button>
        </div>
      </div>
    </div>
  );
}
