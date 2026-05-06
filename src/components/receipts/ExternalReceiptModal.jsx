import React, { useState } from 'react';
import { AlertCircle, Upload, CheckCircle, Link } from 'lucide-react';
import { registerExternalReceipt } from '../../services/receipts';
import { uploadReceipt } from '../../services/storage';

export function ExternalReceiptModal({ isOpen, onClose, onRegistered, payment }) {
  const [form, setForm] = useState({ provider: '', external_receipt_number: '', external_issued_date: '' });
  const [pdfFile, setPdfFile] = useState(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async () => {
    if (!form.external_receipt_number.trim()) {
      setError('נדרש מספר קבלה חיצונית');
      return;
    }
    setLoading(true);
    setError('');
    try {
      let uploadedPdfPath = null;
      if (pdfFile) {
        const uploaded = await uploadReceipt(payment.id, pdfFile, pct => setUploadProgress(pct));
        uploadedPdfPath = uploaded.path || null;
      }
      await registerExternalReceipt(payment.id, form, uploadedPdfPath);
      setDone(true);
      onRegistered?.();
    } catch (err) {
      setError(err.message || 'שגיאה ברישום הקבלה');
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setForm({ provider: '', external_receipt_number: '', external_issued_date: '' });
    setPdfFile(null);
    setUploadProgress(0);
    setError('');
    setDone(false);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" dir="rtl">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md mx-4 p-6">
        {done ? (
          <div className="text-center space-y-4">
            <CheckCircle className="mx-auto text-green-500" size={48} />
            <h2 className="text-xl font-bold text-gray-900">קבלה חיצונית נרשמה</h2>
            <button onClick={handleClose} className="block w-full px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50">
              סגור
            </button>
          </div>
        ) : (
          <>
            <div className="flex items-center gap-3 mb-5">
              <Link className="text-blue-600" size={24} />
              <h2 className="text-lg font-bold text-gray-900">רישום קבלה חיצונית</h2>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">מספר קבלה <span className="text-red-500">*</span></label>
                <input
                  type="text"
                  value={form.external_receipt_number}
                  onChange={e => setForm(f => ({ ...f, external_receipt_number: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-right"
                  placeholder="למשל 1234"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">ספק / מנפיק</label>
                <input
                  type="text"
                  value={form.provider}
                  onChange={e => setForm(f => ({ ...f, provider: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-right"
                  placeholder="שם הספק (אופציונלי)"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">תאריך הוצאה</label>
                <input
                  type="date"
                  value={form.external_issued_date}
                  onChange={e => setForm(f => ({ ...f, external_issued_date: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">צרף קובץ PDF (אופציונלי)</label>
                <label className="flex items-center gap-2 cursor-pointer border border-dashed border-gray-300 rounded-lg px-4 py-3 hover:bg-gray-50">
                  <Upload size={16} className="text-gray-400" />
                  <span className="text-sm text-gray-500">{pdfFile ? pdfFile.name : 'בחר קובץ PDF'}</span>
                  <input
                    type="file"
                    accept="application/pdf"
                    className="hidden"
                    onChange={e => setPdfFile(e.target.files?.[0] || null)}
                  />
                </label>
                {loading && pdfFile && (
                  <div className="mt-2 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                    <div className="h-full bg-blue-500 rounded-full transition-all" style={{ width: `${uploadProgress}%` }} />
                  </div>
                )}
              </div>
            </div>

            {error && (
              <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-lg mt-4">
                <AlertCircle size={16} className="text-red-600 flex-shrink-0 mt-0.5" />
                <p className="text-sm text-red-700">{error}</p>
              </div>
            )}

            <div className="flex gap-3 mt-6">
              <button
                onClick={handleSubmit}
                disabled={loading}
                className="flex-1 py-2.5 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 disabled:opacity-40 transition"
              >
                {loading ? 'שומר...' : 'שמור קבלה חיצונית'}
              </button>
              <button
                onClick={handleClose}
                disabled={loading}
                className="flex-1 py-2.5 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition"
              >
                ביטול
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
