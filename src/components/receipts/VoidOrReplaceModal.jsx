import React, { useState, useEffect } from 'react';
import { AlertCircle, CheckCircle, AlertTriangle } from 'lucide-react';
import { voidReceiptWithDocument, issueReplacementReceipt } from '../../services/receipts';
import { getPaymentsByPatient } from '../../services/payments';
import { formatCurrency } from '../../utils/formatters';

export function VoidOrReplaceModal({ isOpen, onClose, onDone, receipt, patientId }) {
  const [mode, setMode] = useState('void'); // 'void' | 'replace'
  const [reason, setReason] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [newPaymentId, setNewPaymentId] = useState('');
  const [unclaimedPayments, setUnclaimedPayments] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loadingPayments, setLoadingPayments] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (isOpen && mode === 'replace' && patientId) {
      setLoadingPayments(true);
      getPaymentsByPatient(patientId)
        .then(all => setUnclaimedPayments(all.filter(p => !p.receipt_id)))
        .catch(() => {})
        .finally(() => setLoadingPayments(false));
    }
  }, [isOpen, mode, patientId]);

  if (!isOpen) return null;

  const handleSubmit = async () => {
    if (!reason.trim() || !confirmed) return;
    if (mode === 'replace' && !newPaymentId) { setError('בחר תשלום להחלפה'); return; }
    if (!receipt?.id) { setError('לא ניתן לאתר את הקבלה המקורית. רענן את הדף ונסה שנית.'); return; }
    setLoading(true);
    setError('');
    try {
      if (mode === 'void') {
        await voidReceiptWithDocument(receipt.id, reason.trim());
      } else {
        await issueReplacementReceipt(receipt.id, newPaymentId, reason.trim());
      }
      setDone(true);
      onDone?.();
    } catch (err) {
      setError(err.message || 'שגיאה בביטול הקבלה');
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setMode('void');
    setReason('');
    setConfirmed(false);
    setNewPaymentId('');
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
            <h2 className="text-xl font-bold text-gray-900">
              {mode === 'void' ? 'קבלה בוטלה בהצלחה' : 'קבלה הוחלפה בהצלחה'}
            </h2>
            <p className="text-sm text-gray-500">מסמך ביטול הוצא עם מספר ממוספר חדש.</p>
            <button onClick={handleClose} className="block w-full px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50">
              סגור
            </button>
          </div>
        ) : (
          <>
            <div className="flex items-center gap-3 mb-5">
              <AlertTriangle className="text-amber-500" size={24} />
              <h2 className="text-lg font-bold text-gray-900">ביטול קבלה {receipt?.receipt_number}</h2>
            </div>

            {/* Mode toggle */}
            <div className="flex rounded-lg border border-gray-200 overflow-hidden mb-5">
              {[{ val: 'void', label: 'ביטול בלבד' }, { val: 'replace', label: 'ביטול והחלפה' }].map(({ val, label }) => (
                <button
                  key={val}
                  onClick={() => { setMode(val); setNewPaymentId(''); setError(''); }}
                  className={`flex-1 py-2 text-sm font-medium transition ${mode === val ? 'bg-amber-500 text-white' : 'text-gray-600 hover:bg-gray-50'}`}
                >
                  {label}
                </button>
              ))}
            </div>

            {/* Original receipt info */}
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-4 text-sm text-right">
              <p className="font-medium text-amber-800">קבלה {receipt?.receipt_number}</p>
              <p className="text-amber-700">{formatCurrency(receipt?.payment_amount)} · {receipt?.payment_date}</p>
            </div>

            {/* Replacement payment selector */}
            {mode === 'replace' && (
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-1">תשלום חדש להחלפה <span className="text-red-500">*</span></label>
                {loadingPayments ? (
                  <p className="text-sm text-gray-400">טוען תשלומים...</p>
                ) : unclaimedPayments.length === 0 ? (
                  <p className="text-sm text-amber-600">אין תשלומים ללא קבלה עבור מטופל זה</p>
                ) : (
                  <select
                    value={newPaymentId}
                    onChange={e => setNewPaymentId(e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-right"
                  >
                    <option value="">בחר תשלום...</option>
                    {unclaimedPayments.map(p => (
                      <option key={p.id} value={p.id}>
                        {formatCurrency(p.amount)} — {p.payment_date}
                      </option>
                    ))}
                  </select>
                )}
              </div>
            )}

            {/* Reason */}
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">סיבת הביטול <span className="text-red-500">*</span></label>
              <textarea
                value={reason}
                onChange={e => setReason(e.target.value)}
                rows={3}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-right resize-none"
                placeholder="תאר את הסיבה לביטול..."
              />
            </div>

            {error && (
              <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-lg mb-4">
                <AlertCircle size={16} className="text-red-600 flex-shrink-0 mt-0.5" />
                <p className="text-sm text-red-700">{error}</p>
              </div>
            )}

            {/* Confirmation */}
            <label className="flex items-start gap-3 cursor-pointer mb-5">
              <input type="checkbox" checked={confirmed} onChange={e => setConfirmed(e.target.checked)} className="mt-0.5 flex-shrink-0" />
              <span className="text-sm text-gray-700">
                אני מבין כי פעולה זו אינה הפיכה. יופק מסמך ביטול ממוספר חדש.
              </span>
            </label>

            <div className="flex gap-3">
              <button
                onClick={handleSubmit}
                disabled={!reason.trim() || !confirmed || loading}
                className="flex-1 py-2.5 bg-red-600 text-white rounded-lg font-medium hover:bg-red-700 disabled:opacity-40 disabled:cursor-not-allowed transition"
              >
                {loading ? 'מבטל...' : (mode === 'void' ? 'בטל קבלה' : 'בטל והחלף')}
              </button>
              <button
                onClick={handleClose}
                disabled={loading}
                className="flex-1 py-2.5 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition"
              >
                סגור
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
