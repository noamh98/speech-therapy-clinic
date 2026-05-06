import React, { useState, useEffect } from 'react';
import { FileText, ExternalLink, XCircle, RefreshCw, Link, Loader } from 'lucide-react';
import { getReceiptsByPayment, getReceiptPdfUrl } from '../../services/receipts';
import { IssueReceiptModal } from './IssueReceiptModal';
import { ExternalReceiptModal } from './ExternalReceiptModal';
import { VoidOrReplaceModal } from './VoidOrReplaceModal';

const STATUS_CONFIG = {
  ISSUED:   { label: 'קבלה הוצאה',  bg: 'bg-teal-100',  text: 'text-teal-800'  },
  VOIDED:   { label: 'קבלה בוטלה',  bg: 'bg-gray-100',  text: 'text-gray-600'  },
  REPLACED: { label: 'קבלה הוחלפה', bg: 'bg-gray-100',  text: 'text-gray-600'  },
  DRAFT:    { label: 'טיוטה',        bg: 'bg-yellow-100',text: 'text-yellow-800'},
};

export default function ReceiptSection({ payment, onReceiptIssued }) {
  const [receipt, setReceipt] = useState(null);
  const [pdfUrl, setPdfUrl] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showIssue, setShowIssue] = useState(false);
  const [showExternal, setShowExternal] = useState(false);
  const [showVoidReplace, setShowVoidReplace] = useState(false);

  useEffect(() => {
    if (!payment?.id) { setLoading(false); return; }
    setLoading(true);
    getReceiptsByPayment(payment.id)
      .then(async docs => {
        const latest = docs[0] || null;
        setReceipt(latest);
        if (latest?.pdf_path) {
          try {
            const url = await getReceiptPdfUrl(latest.pdf_path);
            setPdfUrl(url);
          } catch (_) { setPdfUrl(null); }
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [payment?.id, payment?.receipt_id]);

  const handleIssued = (data) => {
    setShowIssue(false);
    setPdfUrl(data.pdfUrl || null);
    onReceiptIssued?.();
  };

  const handleRegistered = () => {
    setShowExternal(false);
    onReceiptIssued?.();
  };

  const handleVoidDone = () => {
    setShowVoidReplace(false);
    onReceiptIssued?.();
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-3 text-xs text-gray-400">
        <Loader size={14} className="animate-spin" /> טוען מידע קבלה...
      </div>
    );
  }

  return (
    <div className="border-t border-gray-100 pt-4 mt-2" dir="rtl">
      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">קבלה</p>

      {!receipt ? (
        // No receipt yet — offer issuance options
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setShowIssue(true)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition"
          >
            <FileText size={14} /> הוצאת קבלה פנימית
          </button>
          <button
            onClick={() => setShowExternal(true)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition"
          >
            <Link size={14} /> רישום קבלה חיצונית
          </button>
        </div>
      ) : (
        // Receipt exists — show status + actions
        <div className="space-y-2">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2">
              {/* Status badge */}
              {(() => {
                const cfg = STATUS_CONFIG[receipt.status] || STATUS_CONFIG.ISSUED;
                return (
                  <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${cfg.bg} ${cfg.text}`}>
                    {cfg.label}
                  </span>
                );
              })()}
              <span className="text-sm font-bold text-gray-800">{receipt.receipt_number}</span>
              {receipt.mode === 'external' && (
                <span className="text-xs text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded">חיצוני</span>
              )}
            </div>

            {/* PDF link */}
            {(pdfUrl || receipt.external_pdf_path) && (
              <a
                href={pdfUrl || receipt.external_pdf_path}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-xs text-teal-600 hover:text-teal-700"
              >
                <ExternalLink size={12} /> פתח קבלה
              </a>
            )}
          </div>

          {/* Void / replace buttons (only for ISSUED ORIGINAL receipts) */}
          {receipt.status === 'ISSUED' && receipt.doc_type === 'ORIGINAL' && (
            <div className="flex gap-2 mt-2">
              <button
                onClick={() => setShowVoidReplace(true)}
                className="inline-flex items-center gap-1 text-xs text-red-600 hover:text-red-700 border border-red-200 rounded px-2 py-1 hover:bg-red-50 transition"
              >
                <XCircle size={12} /> ביטול קבלה
              </button>
              <button
                onClick={() => setShowVoidReplace(true)}
                className="inline-flex items-center gap-1 text-xs text-amber-600 hover:text-amber-700 border border-amber-200 rounded px-2 py-1 hover:bg-amber-50 transition"
              >
                <RefreshCw size={12} /> ביטול והחלפה
              </button>
            </div>
          )}

          {/* Show linked docs */}
          {receipt.links?.cancellation_receipt_id && (
            <p className="text-xs text-gray-400">מסמך ביטול: {receipt.links.cancellation_receipt_id}</p>
          )}
          {receipt.links?.replacement_receipt_id && (
            <p className="text-xs text-gray-400">קבלה מחליפה: {receipt.links.replacement_receipt_id}</p>
          )}
        </div>
      )}

      {/* Modals */}
      <IssueReceiptModal
        isOpen={showIssue}
        onClose={() => setShowIssue(false)}
        onIssued={handleIssued}
        payment={payment}
      />
      <ExternalReceiptModal
        isOpen={showExternal}
        onClose={() => setShowExternal(false)}
        onRegistered={handleRegistered}
        payment={payment}
      />
      <VoidOrReplaceModal
        isOpen={showVoidReplace}
        onClose={() => setShowVoidReplace(false)}
        onDone={handleVoidDone}
        receipt={receipt}
        patientId={payment?.patientId || payment?.patient_id}
      />
    </div>
  );
}
