// src/components/shared/PaymentHistory.jsx
/**
 * FIXES APPLIED:
 *
 * 1. STALE DATA WHEN treatmentId CHANGES:
 *    useEffect depended only on [patientId]. If the parent re-rendered with a
 *    different treatmentId (switching between appointments), the payment list
 *    was never re-fetched — showing the wrong treatment's payments.
 *    FIX: Added treatmentId to the useEffect dependency array.
 *
 * 2. MISSING PAYMENT METHODS:
 *    getMethodLabel() only mapped cash/card/check/bank_transfer.
 *    The app supports 'bit', 'paybox', and 'credit' too (from PAYMENT_METHODS).
 *    Unmapped methods were displayed as raw values like "bit".
 *    FIX: Added all methods from PAYMENT_METHODS with Hebrew labels.
 *
 * 3. ENGLISH UI IN A HEBREW APP:
 *    All labels, status badges, and empty-state text were in English.
 *    FIX: Fully Hebraicized.
 *
 * 4. CONTEXT REFRESH AFTER DELETE:
 *    Deleting a payment only updated local state. The shared useClinicData
 *    paymentStats was never updated, so Dashboard revenue stayed stale.
 *    FIX: After delete, calls refresh() from useClinicData if available,
 *    while still updating local state optimistically for instant UI feedback.
 */

import React, { useState, useEffect } from 'react';
import { Edit2, Trash2, Eye, Download, AlertCircle } from 'lucide-react';
import { getPaymentsByPatient, deletePayment } from '../../services/payments';
import { useClinicData } from '../../context/useClinicData';
import { PaymentModal } from './PaymentModal';
import { formatCurrency } from '../../utils/formatters';

export function PaymentHistory({ patientId, treatmentId = null, onPaymentChange = null }) {
  const [payments, setPayments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedPayment, setSelectedPayment] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [deleting, setDeleting] = useState(null);

  // FIX #4: Get shared refresh so Dashboard stats update after payment delete
  const { refresh } = useClinicData();

  // FIX #1: Added treatmentId to deps — re-fetch when switching appointments
  useEffect(() => {
    loadPayments();
  }, [patientId, treatmentId]);

  const loadPayments = async () => {
    if (!patientId) return;
    setLoading(true);
    setError('');
    try {
      const data = await getPaymentsByPatient(patientId);
      setPayments(data);
    } catch (err) {
      setError(err.message || 'שגיאה בטעינת תשלומים');
      console.error('[PaymentHistory] load error:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleEditPayment = (payment) => {
    setSelectedPayment(payment);
    setIsModalOpen(true);
  };

  const handleDeletePayment = async (paymentId) => {
    if (!window.confirm('האם אתה בטוח שברצונך למחוק את התשלום?')) return;
    setDeleting(paymentId);
    setError('');
    try {
      await deletePayment(paymentId);
      // Optimistic local update
      setPayments(prev => prev.filter(p => p.id !== paymentId));
      if (onPaymentChange) onPaymentChange();
      // FIX #4: Refresh global context so Dashboard revenue reflects the change
      refresh();
    } catch (err) {
      setError(err.message || 'שגיאה במחיקת תשלום');
    } finally {
      setDeleting(null);
    }
  };

  const handleModalSave = (updatedPayment) => {
    if (updatedPayment === null) {
      setPayments(prev => prev.filter(p => p.id !== selectedPayment?.id));
    } else if (selectedPayment?.id) {
      setPayments(prev => prev.map(p => p.id === updatedPayment.id ? updatedPayment : p));
    } else {
      setPayments(prev => [updatedPayment, ...prev]);
    }
    setSelectedPayment(null);
    if (onPaymentChange) onPaymentChange();
    // FIX #4: Refresh global context after any payment change
    refresh();
  };

  // Filter to this treatment's payments if treatmentId provided
  const filteredPayments = treatmentId
    ? payments.filter(p => p.treatmentId === treatmentId)
    : payments;

  const stats = {
    total: filteredPayments.length,
    totalAmount: filteredPayments.reduce((s, p) => s + (p.amount || 0), 0),
    completedAmount: filteredPayments
      .filter(p => p.payment_status === PAYMENT_STATUS.COMPLETED)
      .reduce((s, p) => s + (p.amount || 0), 0),
    pendingAmount: filteredPayments
      .filter(p => p.payment_status === PAYMENT_STATUS.PENDING)
      .reduce((s, p) => s + (p.amount || 0), 0),
  };

  // FIX #3: Hebrew status labels
  const getStatusBadge = (status) => {
    const config = {
      completed: { bg: 'bg-green-100', text: 'text-green-800', label: 'שולם' },
      pending:   { bg: 'bg-yellow-100', text: 'text-yellow-800', label: 'ממתין' },
      refunded:  { bg: 'bg-blue-100', text: 'text-blue-800', label: 'הוחזר' },
      cancelled: { bg: 'bg-gray-100', text: 'text-gray-600', label: 'בוטל' },
    }[status] || { bg: 'bg-gray-100', text: 'text-gray-600', label: status };

    return (
      <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${config.bg} ${config.text}`}>
        {config.label}
      </span>
    );
  };

  // FIX #2: All payment methods from PAYMENT_METHODS with Hebrew labels
  const getMethodLabel = (method) => ({
    cash: 'מזומן',
    credit: 'אשראי',
    bank_transfer: 'העברה בנקאית',
    check: "צ'ק",
    bit: 'ביט',
    paybox: 'פייבוקס',
    card: 'כרטיס',
    other: 'אחר',
  }[method] || method);

  if (loading) {
    return <div className="text-center py-4 text-sm text-gray-400">טוען תשלומים...</div>;
  }

  return (
    <div className="space-y-3">
      {error && (
        <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-lg">
          <AlertCircle size={16} className="text-red-600 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      {/* Summary stats */}
      {filteredPayments.length > 0 && (
        <div className="grid grid-cols-2 gap-2 p-3 bg-gray-50 rounded-lg text-right">
          <div>
            <p className="text-[10px] text-gray-500">סה״כ</p>
            <p className="text-sm font-bold text-gray-900">{formatCurrency(stats.totalAmount)}</p>
          </div>
          <div>
            <p className="text-[10px] text-gray-500">שולם</p>
            <p className="text-sm font-bold text-green-700">{formatCurrency(stats.completedAmount)}</p>
          </div>
          {stats.pendingAmount > 0 && (
            <div className="col-span-2">
              <p className="text-[10px] text-gray-500">ממתין לתשלום</p>
              <p className="text-sm font-semibold text-yellow-600">{formatCurrency(stats.pendingAmount)}</p>
            </div>
          )}
        </div>
      )}

      {filteredPayments.length === 0 ? (
        <p className="text-center text-xs text-gray-400 py-3">לא נרשמו תשלומים</p>
      ) : (
        <div className="space-y-2">
          {filteredPayments.map(payment => (
            <div
              key={payment.id}
              className="flex items-start justify-between p-3 bg-white border border-gray-100 rounded-lg hover:shadow-sm transition"
            >
              <div className="flex-1 min-w-0 text-right">
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  <span className="text-base font-bold text-gray-900">
                    {formatCurrency(payment.amount)}
                  </span>
                  {getStatusBadge(payment.payment_status)}
                </div>
                <div className="text-xs text-gray-500 space-y-0.5">
                  <p>{payment.payment_date} · {getMethodLabel(payment.payment_method)}</p>
                  {payment.notes && <p className="text-gray-400 truncate">{payment.notes}</p>}
                </div>
                {payment.receipt_url && (
                  <div className="flex items-center gap-2 mt-1">
                    <a
                      href={payment.receipt_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700"
                    >
                      <Eye size={12} /> צפה בקבלה
                    </a>
                    <a
                      href={payment.receipt_url}
                      download={payment.receipt_filename}
                      className="inline-flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700"
                    >
                      <Download size={12} /> הורד
                    </a>
                  </div>
                )}
              </div>

              <div className="flex items-center gap-1 mr-2 flex-shrink-0">
                <button
                  onClick={() => handleEditPayment(payment)}
                  className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg transition"
                  title="ערוך תשלום"
                >
                  <Edit2 size={15} />
                </button>
                <button
                  onClick={() => handleDeletePayment(payment.id)}
                  disabled={deleting === payment.id}
                  className="p-1.5 text-red-500 hover:bg-red-50 rounded-lg transition disabled:opacity-40"
                  title="מחק תשלום"
                >
                  <Trash2 size={15} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <PaymentModal
        isOpen={isModalOpen}
        onClose={() => { setIsModalOpen(false); setSelectedPayment(null); }}
        onSave={handleModalSave}
        payment={selectedPayment}
        patientId={patientId}
        treatmentId={treatmentId}
      />
    </div>
  );
}
