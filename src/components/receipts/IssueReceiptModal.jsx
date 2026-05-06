import React, { useState } from 'react';
import { AlertCircle, CheckCircle, FileText, ExternalLink } from 'lucide-react';
import { issueReceiptInternal } from '../../services/receipts';
import { formatCurrency } from '../../utils/formatters';

const METHOD_HE = {
  cash: 'מזומן', credit: 'אשראי', bank_transfer: 'העברה בנקאית',
  check: "צ'ק", bit: 'ביט', paybox: 'פייבוקס', card: 'כרטיס', other: 'אחר',
};

export function IssueReceiptModal({ isOpen, onClose, onIssued, payment }) {
  const [taxWithholding, setTaxWithholding] = useState(0);
  const [remarks, setRemarks] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);

  if (!isOpen) return null;

  const handleIssue = async () => {
    if (!confirmed) return;
    setLoading(true);
    setError('');
    try {
      const data = await issueReceiptInternal(payment.id, taxWithholding, remarks);
      setResult(data);
      onIssued?.(data);
    } catch (err) {
      setError(err.message || 'שגיאה בהוצאת הקבלה');
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setTaxWithholding(0);
    setRemarks('');
    setConfirmed(false);
    setError('');
    setResult(null);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" dir="rtl">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md mx-4 p-6">
        {result ? (
          // Success state
          <div className="text-center space-y-4">
            <CheckCircle className="mx-auto text-green-500" size={48} />
            <h2 className="text-xl font-bold text-gray-900">קבלה הוצאה בהצלחה</h2>
            <p className="text-gray-600">מספר קבלה: <span className="font-bold text-teal-700">{result.receiptNumber}</span></p>
            {result.pdfUrl && (
              <a
                href={result.pdfUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700"
              >
                <ExternalLink size={16} /> פתח קבלה PDF
              </a>
            )}
            <button onClick={handleClose} className="block w-full mt-2 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50">
              סגור
            </button>
          </div>
        ) : (
          <>
            <div className="flex items-center gap-3 mb-5">
              <FileText className="text-teal-600" size={24} />
              <h2 className="text-lg font-bold text-gray-900">הוצאת קבלה</h2>
            </div>

            {/* Payment summary */}
            <div className="bg-gray-50 rounded-lg p-4 mb-5 space-y-1 text-sm text-right">
              <div className="flex justify-between">
                <span className="text-gray-500">סכום</span>
                <span className="font-bold text-gray-900">{formatCurrency(payment?.amount)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">תאריך</span>
                <span className="text-gray-700">{payment?.payment_date}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">אמצעי תשלום</span>
                <span className="text-gray-700">{METHOD_HE[payment?.payment_method] || payment?.payment_method}</span>
              </div>
            </div>

            {/* Tax withholding */}
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">ניכוי מס במקור (%)</label>
              <input
                type="number"
                min={0}
                max={100}
                step={0.1}
                value={taxWithholding}
                onChange={e => setTaxWithholding(Number(e.target.value))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-right"
              />
              <p className="text-xs text-gray-400 mt-1">השאר 0 אם לא חל ניכוי מס</p>
            </div>

            {/* Remarks */}
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">הערות (אופציונלי)</label>
              <textarea
                value={remarks}
                onChange={e => setRemarks(e.target.value)}
                rows={3}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-right"
                placeholder="הערות שיופיעו על הקבלה..."
              />
            </div>

            {error && (
              <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-lg mb-4">
                <AlertCircle size={16} className="text-red-600 flex-shrink-0 mt-0.5" />
                <p className="text-sm text-red-700">{error}</p>
              </div>
            )}

            {/* Confirmation checkbox */}
            <label className="flex items-start gap-3 cursor-pointer mb-5">
              <input
                type="checkbox"
                checked={confirmed}
                onChange={e => setConfirmed(e.target.checked)}
                className="mt-0.5 flex-shrink-0"
              />
              <span className="text-sm text-gray-700">
                אני מאשר הוצאת קבלה ממוספרת בלתי חוזרת. לאחר ההוצאה לא ניתן לערוך או למחוק קבלה זו.
              </span>
            </label>

            <div className="flex gap-3">
              <button
                onClick={handleIssue}
                disabled={!confirmed || loading}
                className="flex-1 py-2.5 bg-teal-600 text-white rounded-lg font-medium hover:bg-teal-700 disabled:opacity-40 disabled:cursor-not-allowed transition"
              >
                {loading ? 'מוציא קבלה...' : 'הוצא קבלה'}
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
