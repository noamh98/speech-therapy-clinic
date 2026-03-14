// src/pages/PatientProfile/PatientTreatments.jsx
import { useState, useEffect } from 'react';
import { getPatientTreatments, deleteTreatment } from '../../services/treatments';
import TreatmentDialog from '../../components/shared/TreatmentDialog';
import { Badge, EmptyState, ConfirmDialog, Spinner } from '../../components/ui';
import { ClipboardList, Plus, Pencil, Trash2, Search, ExternalLink } from 'lucide-react';
import { formatDate, formatCurrency, PAYMENT_METHODS } from '../../utils/formatters';
import { motion } from 'framer-motion';

export default function PatientTreatments({ patient }) {
  const [treatments, setTreatments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [payFilter, setPayFilter] = useState('all');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editTreatment, setEditTreatment] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);

  useEffect(() => { load(); }, [patient.id]);

  async function load() {
    setLoading(true);
    try {
      const t = await getPatientTreatments(patient.id);
      setTreatments(t);
    } finally { setLoading(false); }
  }

  const filtered = treatments.filter(t => {
    const q = search.toLowerCase();
    const matchSearch = !search ||
      t.description?.toLowerCase().includes(q) ||
      t.goals?.toLowerCase().includes(q) ||
      String(t.treatment_number).includes(q);
    const matchPay = payFilter === 'all' || t.payment_status === payFilter;
    return matchSearch && matchPay;
  });

  const totalPaid   = treatments.filter(t => t.payment_status === 'paid').reduce((s, t) => s + (Number(t.amount) || 0), 0);
  const totalUnpaid = treatments.filter(t => t.payment_status !== 'paid').reduce((s, t) => s + (Number(t.amount) || 0), 0);

  const handleDelete = async () => {
    await deleteTreatment(deleteTarget.id);
    load();
  };

  if (loading) return <div className="flex justify-center py-8"><Spinner /></div>;

  return (
    <div className="space-y-4">
      {/* Summary */}
      <div className="grid grid-cols-3 gap-3">
        <div className="p-3 bg-gray-50 rounded-xl text-center">
          <p className="text-2xl font-bold text-gray-900">{treatments.length}</p>
          <p className="text-xs text-gray-500">סה"כ טיפולים</p>
        </div>
        <div className="p-3 bg-green-50 rounded-xl text-center">
          <p className="text-xl font-bold text-green-700">{formatCurrency(totalPaid)}</p>
          <p className="text-xs text-green-600">שולם</p>
        </div>
        <div className="p-3 bg-orange-50 rounded-xl text-center">
          <p className="text-xl font-bold text-orange-700">{formatCurrency(totalUnpaid)}</p>
          <p className="text-xs text-orange-600">טרם שולם</p>
        </div>
      </div>

      {/* Controls */}
      <div className="flex gap-2 flex-wrap">
        <div className="relative flex-1 min-w-40">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input className="input pr-9" placeholder="חפש..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <select className="input w-auto" value={payFilter} onChange={e => setPayFilter(e.target.value)}>
          <option value="all">כל התשלומים</option>
          <option value="paid">שולם</option>
          <option value="unpaid">לא שולם</option>
        </select>
        <button onClick={() => { setEditTreatment(null); setDialogOpen(true); }} className="btn-primary flex items-center gap-2">
          <Plus className="w-4 h-4" /> טיפול חדש
        </button>
      </div>

      {filtered.length === 0 ? (
        <EmptyState icon={ClipboardList} title="אין טיפולים" description="תעד טיפול ראשון" />
      ) : (
        <div className="space-y-2">
          {filtered.map(t => (
            <TreatmentCard
              key={t.id}
              treatment={t}
              onEdit={() => { setEditTreatment(t); setDialogOpen(true); }}
              onDelete={() => setDeleteTarget(t)}
            />
          ))}
        </div>
      )}

      <TreatmentDialog
        open={dialogOpen}
        onClose={() => { setDialogOpen(false); setEditTreatment(null); }}
        onSaved={() => { setDialogOpen(false); setEditTreatment(null); load(); }}
        patient={patient}
        treatment={editTreatment}
      />

      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title="מחיקת טיפול"
        message={`האם למחוק טיפול מספר ${deleteTarget?.treatment_number}?`}
        confirmLabel="מחק"
        danger
      />
    </div>
  );
}

function TreatmentCard({ treatment: t, onEdit, onDelete }) {
  const methodLabel = PAYMENT_METHODS.find(m => m.value === t.payment_method)?.label;
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="p-4 border border-gray-100 rounded-xl hover:shadow-sm group transition-all"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-teal-100 flex items-center justify-center text-teal-700 font-bold text-sm flex-shrink-0">
            {t.treatment_number}
          </div>
          <div>
            <p className="text-sm font-medium text-gray-900">{formatDate(t.date)}</p>
            <div className="flex items-center gap-2 mt-0.5">
              <Badge color={t.payment_status === 'paid' ? 'green' : 'orange'}>
                {t.payment_status === 'paid' ? 'שולם' : 'לא שולם'}
              </Badge>
              {methodLabel && <span className="text-xs text-gray-400">{methodLabel}</span>}
              <span className="text-sm font-semibold text-gray-800">{formatCurrency(t.amount)}</span>
            </div>
          </div>
        </div>
        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-all">
          <button onClick={onEdit} className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-400 hover:text-gray-700">
            <Pencil className="w-3.5 h-3.5" />
          </button>
          <button onClick={onDelete} className="p-1.5 hover:bg-red-50 rounded-lg text-gray-400 hover:text-red-500">
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {t.goals && <p className="text-xs text-teal-700 mt-2 font-medium">מטרות: {t.goals}</p>}
      {t.description && <p className="text-xs text-gray-600 mt-1 line-clamp-2">{t.description}</p>}
      {t.receipt_url && (
        <a href={t.receipt_url} target="_blank" rel="noreferrer" className="text-xs text-blue-600 hover:underline flex items-center gap-1 mt-1">
          <ExternalLink className="w-3 h-3" /> קבלה
        </a>
      )}
    </motion.div>
  );
}
