// src/components/shared/PaymentModal.jsx
/**
 * FIXES APPLIED:
 * 1. UTC DATE OFFSET — uses localDateStr() throughout
 * 2. ENGLISH UI — fully Hebraicized
 * 3. MISSING PAYMENT METHODS — bit, paybox, credit added
 * 4. WRONG DEFAULT payment_status — changed to PAYMENT_STATUS.COMPLETED
 * 5. CONTEXT NOT REFRESHED — calls refresh() after every save/delete
 * 6. handleSave & handleDelete fully implemented
 */

import React, { useState, useEffect } from 'react';
import { X, Upload, Trash2, Eye, AlertCircle, CheckCircle, Loader2 } from 'lucide-react';
import {
  createPayment, updatePayment, deletePayment,
  updatePaymentReceipt, deletePaymentReceipt,
} from '../../services/payments';
import { uploadReceipt, deleteReceipt } from '../../services/storage';
import { useClinicData } from '../../context/useClinicData';

function localDateStr(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

const PAYMENT_METHOD_OPTIONS = [
  { value: 'cash',          label: 'מזומן' },
  { value: 'credit',        label: 'אשראי' },
  { value: 'bank_transfer', label: 'העברה בנקאית' },
  { value: 'check',         label: "צ'ק" },
  { value: 'bit',           label: 'ביט' },
  { value: 'paybox',        label: 'פייבוקס' },
];

const PAYMENT_STATUS_OPTIONS = [
  { value: PAYMENT_STATUS.COMPLETED, label: 'שולם' },
  { value: PAYMENT_STATUS.PENDING,   label: 'ממתין לתשלום' },
  { value: PAYMENT_STATUS.REFUNDED,  label: 'הוחזר' },
  { value: PAYMENT_STATUS.CANCELLED, label: 'בוטל' },
];

export function PaymentModal({
  isOpen,
  onClose,
  onSave,
  payment = null,
  patientId = null,
  treatmentId = null,
}) {
  const { refresh } = useClinicData();

  const [formData, setFormData] = useState({
    treatmentId:    treatmentId || '',
    patientId:      patientId  || '',
    amount:         '',
    payment_method: 'cash',
    payment_status: PAYMENT_STATUS.COMPLETED,
    payment_date:   localDateStr(),
    notes:          '',
  });

  const [receipt,         setReceipt]         = useState(null);
  const [uploadProgress,  setUploadProgress]  = useState(0);
  const [isUploading,     setIsUploading]     = useState(false);
  const [isSaving,        setIsSaving]        = useState(false);
  const [isDeleting,      setIsDeleting]      = useState(false);
  const [error,           setError]           = useState('');
  const [success,         setSuccess]         = useState('');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    if (payment) {
      setFormData({
        treatmentId:    payment.treatmentId    || treatmentId || '',
        patientId:      payment.patientId      || patientId  || '',
        amount:         payment.amount         || '',
        payment_method: payment.payment_method || 'cash',
        payment_status: payment.payment_status || PAYMENT_STATUS.COMPLETED,
        payment_date:   payment.payment_date   || localDateStr(),
        notes:          payment.notes          || '',
      });
      if (payment.receipt_url) {
        setReceipt({
          url:      payment.receipt_url,
          filename: payment.receipt_filename,
          type:     payment.receipt_type,
          size:     payment.receipt_size,
        });
      } else {
        setReceipt(null);
      }
    } else {
      setFormData({
        treatmentId:    treatmentId || '',
        patientId:      patientId  || '',
        amount:         '',
        payment_method: 'cash',
        payment_status: PAYMENT_STATUS.COMPLETED,
        payment_date:   localDateStr(),
        notes:          '',
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
    setIsUploading(true);
    setError('');
    try {
      const paymentIdForUpload = payment?.id || 'temp_' + Date.now();
      const result = await uploadReceipt(paymentIdForUpload, file, (pct) => {
        setUploadProgress(pct);
      });
      setReceipt(result);
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

  // ── handleSave — fully implemented ──────────────────────────────────────
  const handleSave = async () => {
    if (!validate()) return;
    setIsSaving(true);
    setError('');

    try {
      const paymentData = {
        ...formData,
        patientId: formData.patientId || patientId,
        amount:    Number(formData.amount),
      };

      if (receipt?.url) {
        paymentData.receipt_url      = receipt.url;
        paymentData.receipt_filename = receipt.filename;
        paymentData.receipt_type     = receipt.type;
        paymentData.receipt_size     = receipt.size;
      }

      let result;
      if (payment?.id) {
        result = await updatePayment(payment.id, paymentData);
        if (receipt?.url && !payment.receipt_url) {
          await updatePaymentReceipt(payment.id, {
            url: receipt.url, filename: receipt.filename,
            type: receipt.type, size: receipt.size,
          });
        }
      } else {
        result = await createPayment(paymentData);
        if (receipt?.url && receipt?.path) {
          await updatePaymentReceipt(result.id, {
            url: receipt.url, filename: receipt.filename,
            type: receipt.type, size: receipt.size,
          });
        }
      }

      setSuccess(payment?.id ? 'התשלום עודכן בהצלחה' : 'התשלום נשמר בהצלחה');

      // Refresh global context so Dashboard revenue updates immediately
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

  // ── handleDelete — fully implemented ────────────────────────────────────
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

      // Refresh global context after delete
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
          <button onClick={onClose} disabled={busy} className="p-1 hover:bg-gray-100 rounded-lg transition-colors disabled:opacity-50">
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {/* Success message */}
          {success && (
            <div className="flex items-center gap-2 p-3 bg-green-50 border border-green-200 rounded-xl text-sm text-green-700">
              <CheckCircle className="w-4 h-4 shrink-0" />
              {success}
            </div>
          )}

          {/* Error message */}
          {error && (
            <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
              <AlertCircle className="w-4 h-4 shrink-0" />
              {error}
            </div>
          )}

          {/* Amount */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">סכום (₪) *</label>
            <input
              type="number"
              name="amount"
              className="w-full px-3 py-2 border border-gray-300 rounded-xl focus:ring-2 focus:ring-teal-500 focus:border-transparent text-sm"
              value={formData.amount}
              onChange={handleInputChange}
              min={0}
              placeholder="0"
              disabled={busy}
            />
          </div>

          {/* Payment date */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">תאריך תשלום *</label>
            <input
              type="date"
              name="payment_date"
              className="w-full px-3 py-2 border border-gray-300 rounded-xl focus:ring-2 focus:ring-teal-500 focus:border-transparent text-sm"
              value={formData.payment_date}
              onChange={handleInputChange}
              disabled={busy}
            />
          </div>

          {/* Payment method */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">אמצעי תשלום</label>
            <select
              name="payment_method"
              className="w-full px-3 py-2 border border-gray-300 rounded-xl focus:ring-2 focus:ring-teal-500 focus:border-transparent text-sm"
              value={formData.payment_method}
              onChange={handleInputChange}
              disabled={busy}
            >
              {PAYMENT_METHOD_OPTIONS.map(opt => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>

          {/* Payment status */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">סטטוס</label>
            <select
              name="payment_status"
              className="w-full px-3 py-2 border border-gray-300 rounded-xl focus:ring-2 focus:ring-teal-500 focus:border-transparent text-sm"
              value={formData.payment_status}
              onChange={handleInputChange}
              disabled={busy}
            >
              {PAYMENT_STATUS_OPTIONS.map(opt => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">הערות</label>
            <textarea
              name="notes"
              className="w-full px-3 py-2 border border-gray-300 rounded-xl focus:ring-2 focus:ring-teal-500 focus:border-transparent text-sm resize-none"
              rows={2}
              value={formData.notes}
              onChange={handleInputChange}
              placeholder="הערות לתשלום..."
              disabled={busy}
            />
          </div>

          {/* Receipt upload */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">קבלה</label>
            {receipt ? (
              <div className="flex items-center gap-2 p-3 bg-gray-50 border border-gray-200 rounded-xl">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-800 truncate">{receipt.filename}</p>
                  {receipt.size && (
                    <p className="text-xs text-gray-500">{(receipt.size / 1024).toFixed(1)} KB</p>
                  )}
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  {receipt.url && (
                    <a href={receipt.url} target="_blank" rel="noreferrer"
                      className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors">
                      <Eye className="w-4 h-4" />
                    </a>
                  )}
                  <button onClick={handleDeleteReceipt} className="text-red-500 hover:text-red-700" disabled={busy}>
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ) : (
              <label className={`flex items-center gap-2 p-3 border-2 border-dashed border-gray-300 rounded-xl cursor-pointer hover:border-teal-400 hover:bg-teal-50 transition-colors ${busy ? 'opacity-50 pointer-events-none' : ''}`}>
                {isUploading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin text-teal-500" />
                    <span className="text-sm text-teal-600">מעלה... {uploadProgress}%</span>
                  </>
                ) : (
                  <>
                    <Upload className="w-4 h-4 text-gray-400" />
                    <span className="text-sm text-gray-500">העלה קבלה (תמונה או PDF)</span>
                  </>
                )}
                <input type="file" className="hidden" accept="image/*,.pdf" onChange={handleReceiptUpload} disabled={busy} />
              </label>
            )}
          </div>

          {/* Delete confirmation */}
          {showDeleteConfirm && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-xl">
              <p className="text-sm text-red-700 mb-3 font-medium">האם אתה בטוח שברצונך למחוק את התשלום?</p>
              <div className="flex gap-2">
                <button
                  onClick={() => setShowDeleteConfirm(false)}
                  className="flex-1 px-3 py-2 text-sm bg-white border border-gray-300 text-gray-700 rounded-xl hover:bg-gray-50"
                  disabled={isDeleting}
                >
                  ביטול
                </button>
                <button
                  onClick={handleDelete}
                  className="flex-1 px-4 py-2 bg-red-600 text-white rounded-xl hover:bg-red-700 text-sm font-medium disabled:opacity-50"
                  disabled={isDeleting}
                >
                  {isDeleting ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : 'מחק תשלום'}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-5 border-t flex gap-2">
          {payment?.id && !showDeleteConfirm && (
            <button
              onClick={() => setShowDeleteConfirm(true)}
              className="px-4 py-2 text-sm text-red-600 border border-red-200 rounded-xl hover:bg-red-50 transition-colors disabled:opacity-50"
              disabled={busy}
            >
              <Trash2 className="w-4 h-4 inline ml-1" />
              מחק
            </button>
          )}
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2 text-sm bg-gray-100 text-gray-700 rounded-xl hover:bg-gray-200 transition-colors disabled:opacity-50"
            disabled={busy}
          >
            ביטול
          </button>
          <button
            onClick={handleSave}
            className="flex-1 px-4 py-2 bg-teal-600 text-white rounded-xl hover:bg-teal-700 font-medium text-sm transition disabled:opacity-50 flex items-center justify-center gap-2"
            disabled={busy}
          >
            {isSaving ? <><Loader2 className="w-4 h-4 animate-spin" /> שומר...</> : 'שמור תשלום'}
          </button>
        </div>
      </div>
    </div>
  );
}