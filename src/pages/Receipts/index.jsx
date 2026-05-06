import React, { useState, useEffect, useMemo } from 'react';
import { Download, ExternalLink, Search, Filter } from 'lucide-react';
import { getReceipts, getReceiptPdfUrl } from '../../services/receipts';
import { useClinicData } from '../../context/useClinicData';
import { formatCurrency, formatDate } from '../../utils/formatters';

const STATUS_LABELS = { ISSUED: 'שולם', VOIDED: 'בוטל', REPLACED: 'הוחלף', DRAFT: 'טיוטה' };
const STATUS_COLORS = {
  ISSUED:   'bg-teal-100 text-teal-800',
  VOIDED:   'bg-gray-100 text-gray-600',
  REPLACED: 'bg-gray-100 text-gray-600',
  DRAFT:    'bg-yellow-100 text-yellow-800',
};
const MODE_LABELS  = { internal: 'פנימי', external: 'חיצוני' };
const DOCTYPE_LABELS = { ORIGINAL: 'מקור', CANCELLATION: 'ביטול', REPLACEMENT: 'מחליפה' };

function escapeCSV(val) {
  if (val === null || val === undefined) return '';
  const s = String(val);
  if (s.includes(',') || s.includes('"') || s.includes('\n')) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export default function Receipts() {
  const { patients } = useClinicData();
  const [receipts, setReceipts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [filterMode, setFilterMode] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  useEffect(() => {
    setLoading(true);
    getReceipts()
      .then(setReceipts)
      .catch(err => setError(err.message || 'שגיאה בטעינת קבלות'))
      .finally(() => setLoading(false));
  }, []);

  const patientMap = useMemo(() => {
    const m = {};
    (patients || []).forEach(p => { m[p.id] = p.full_name || p.name || ''; });
    return m;
  }, [patients]);

  const filtered = useMemo(() => {
    let list = receipts;
    if (filterMode !== 'all')   list = list.filter(r => r.mode === filterMode);
    if (filterStatus !== 'all') list = list.filter(r => r.status === filterStatus);
    if (dateFrom) list = list.filter(r => (r.payment_date || '') >= dateFrom);
    if (dateTo)   list = list.filter(r => (r.payment_date || '') <= dateTo);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(r =>
        r.receipt_number?.toLowerCase().includes(q) ||
        patientMap[r.patientId]?.toLowerCase().includes(q)
      );
    }
    return list;
  }, [receipts, filterMode, filterStatus, dateFrom, dateTo, search, patientMap]);

  const exportCSV = () => {
    const BOM = '﻿';
    const headers = ['מספר קבלה', 'תאריך הוצאה', 'תאריך תשלום', 'שם מטופל', 'סכום', 'אמצעי תשלום', 'סוג', 'סטטוס', 'מסמך'];
    const rows = filtered.map(r => [
      r.receipt_number, r.payment_date, r.payment_date,
      patientMap[r.patientId] || '',
      r.payment_amount,
      r.payment_method,
      MODE_LABELS[r.mode] || r.mode,
      STATUS_LABELS[r.status] || r.status,
      DOCTYPE_LABELS[r.doc_type] || r.doc_type,
    ].map(escapeCSV).join(','));
    const csv = BOM + [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url  = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = 'receipts.csv'; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="p-6 max-w-6xl mx-auto" dir="rtl">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">קבלות</h1>
        <button
          onClick={exportCSV}
          className="inline-flex items-center gap-2 px-4 py-2 border border-gray-300 rounded-lg text-sm hover:bg-gray-50"
        >
          <Download size={16} /> ייצוא CSV
        </button>
      </div>

      {/* Filters */}
      <div className="bg-white border border-gray-200 rounded-xl p-4 mb-4 flex flex-wrap gap-3 items-end">
        <div className="flex-1 min-w-48">
          <label className="block text-xs text-gray-500 mb-1">חיפוש</label>
          <div className="relative">
            <Search size={14} className="absolute right-3 top-2.5 text-gray-400" />
            <input
              value={search} onChange={e => setSearch(e.target.value)}
              className="w-full border border-gray-300 rounded-lg pr-8 pl-3 py-2 text-sm text-right"
              placeholder="מספר קבלה, שם מטופל..."
            />
          </div>
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">מ-תאריך</label>
          <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">עד-תאריך</label>
          <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">סוג</label>
          <select value={filterMode} onChange={e => setFilterMode(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm">
            <option value="all">הכל</option>
            <option value="internal">פנימי</option>
            <option value="external">חיצוני</option>
          </select>
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">סטטוס</label>
          <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm">
            <option value="all">הכל</option>
            <option value="ISSUED">שולם</option>
            <option value="VOIDED">בוטל</option>
            <option value="REPLACED">הוחלף</option>
          </select>
        </div>
      </div>

      {/* Table */}
      {loading ? (
        <div className="text-center py-12 text-gray-400">טוען קבלות...</div>
      ) : error ? (
        <div className="text-center py-12 text-red-500">{error}</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 text-gray-400">לא נמצאו קבלות</div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                {['מספר קבלה', 'תאריך תשלום', 'מטופל', 'סכום', 'אמצעי תשלום', 'סוג', 'מסמך', 'סטטוס', 'PDF'].map(h => (
                  <th key={h} className="px-4 py-3 text-right text-xs font-semibold text-gray-600">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.map(r => (
                <ReceiptRow key={r.id} receipt={r} patientName={patientMap[r.patientId] || '—'} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function ReceiptRow({ receipt: r, patientName }) {
  const [pdfUrl, setPdfUrl] = useState(null);

  useEffect(() => {
    if (r.pdf_path) {
      getReceiptPdfUrl(r.pdf_path).then(setPdfUrl).catch(() => {});
    }
  }, [r.pdf_path]);

  const METHOD_HE = {
    cash: 'מזומן', credit: 'אשראי', bank_transfer: 'העברה', check: "צ'ק", bit: 'ביט', paybox: 'פייבוקס', card: 'כרטיס', other: 'אחר',
  };

  return (
    <tr className="hover:bg-gray-50 transition">
      <td className="px-4 py-3 font-mono text-teal-700 font-medium">{r.receipt_number}</td>
      <td className="px-4 py-3 text-gray-700">{r.payment_date}</td>
      <td className="px-4 py-3 text-gray-800">{patientName}</td>
      <td className="px-4 py-3 font-medium">{formatCurrency(r.payment_amount)}</td>
      <td className="px-4 py-3 text-gray-600">{METHOD_HE[r.payment_method] || r.payment_method}</td>
      <td className="px-4 py-3">
        <span className="text-xs bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded">{MODE_LABELS[r.mode] || r.mode}</span>
      </td>
      <td className="px-4 py-3">
        <span className="text-xs bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded">{DOCTYPE_LABELS[r.doc_type] || r.doc_type}</span>
      </td>
      <td className="px-4 py-3">
        <span className={`text-xs px-2 py-0.5 rounded font-medium ${STATUS_COLORS[r.status] || 'bg-gray-100 text-gray-600'}`}>
          {STATUS_LABELS[r.status] || r.status}
        </span>
      </td>
      <td className="px-4 py-3">
        {pdfUrl && (
          <a href={pdfUrl} target="_blank" rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-teal-600 hover:text-teal-700 text-xs">
            <ExternalLink size={12} /> פתח
          </a>
        )}
      </td>
    </tr>
  );
}
