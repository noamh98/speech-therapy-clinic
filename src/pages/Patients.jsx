// src/pages/Patients.jsx
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { getPatients, createPatient, updatePatient, deletePatient, validateIsraeliId } from '../services/patients';
import { getPatientTreatmentCount } from '../services/treatments';
import { PageHeader, EmptyState, Modal, ConfirmDialog, Spinner, Badge } from '../components/ui';
import { Users, Plus, Search, Pencil, Trash2, ChevronLeft, Phone, Mail } from 'lucide-react';
import { motion } from 'framer-motion';
import { PATIENT_STATUSES } from '../utils/formatters';

const EMPTY_FORM = {
  full_name: '', id_number: '', phone: '', email: '', birth_date: '',
  address: '', status: 'active', portal_access_enabled: false,
  parent1_name: '', parent1_phone: '',
  parent2_name: '', parent2_phone: '',
  notes: '',
};

export default function Patients() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [patients, setPatients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [formOpen, setFormOpen] = useState(false);
  const [editPatient, setEditPatient] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);

  useEffect(() => { load(); }, [user]);

  async function load() {
    if (!user?.email) return;
    setLoading(true);
    try {
      const p = await getPatients(user.email);
      // Fetch treatment count for each patient
      const withCounts = await Promise.all(p.map(async pt => ({
        ...pt,
        treatment_count: await getPatientTreatmentCount(pt.id),
      })));
      setPatients(withCounts);
    } finally { setLoading(false); }
  }

  const filtered = patients.filter(p => {
    const matchSearch = !search ||
      p.full_name?.toLowerCase().includes(search.toLowerCase()) ||
      p.phone?.includes(search);
    const matchStatus = statusFilter === 'all' || p.status === statusFilter;
    return matchSearch && matchStatus;
  });

  const openAdd = () => { setEditPatient(null); setForm(EMPTY_FORM); setErrors({}); setFormOpen(true); };
  const openEdit = (pt) => { setEditPatient(pt); setForm({ ...EMPTY_FORM, ...pt }); setErrors({}); setFormOpen(true); };

  const validate = () => {
    const e = {};
    if (!form.full_name.trim()) e.full_name = 'שם חובה';
    if (form.id_number && !validateIsraeliId(form.id_number)) e.id_number = 'ת.ז. לא תקינה';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (!validate()) return;
    setSaving(true);
    try {
      if (editPatient) {
        await updatePatient(editPatient.id, form);
      } else {
        await createPatient(form);
      }
      setFormOpen(false);
      load();
    } catch (err) {
      setErrors({ _: err.message });
    } finally { setSaving(false); }
  };

  const handleDelete = async () => {
    try {
      await deletePatient(deleteTarget.id);
      load();
    } catch (err) {
      alert(err.message);
    }
  };

  const set = k => e => setForm(f => ({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));

  return (
    <div className="space-y-4">
      <PageHeader
        title="מטופלים"
        subtitle={`${patients.length} מטופלים סה"כ`}
        actions={
          <button onClick={openAdd} className="btn-primary flex items-center gap-2">
            <Plus className="w-4 h-4" />
            מטופל חדש
          </button>
        }
      />

      {/* Filters */}
      <div className="flex gap-3 flex-wrap">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            className="input pr-9"
            placeholder="חפש לפי שם או טלפון..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <select className="input w-auto" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
          <option value="all">הכל</option>
          <option value="active">פעיל</option>
          <option value="inactive">לא פעיל</option>
        </select>
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><Spinner size="lg" /></div>
      ) : filtered.length === 0 ? (
        <EmptyState icon={Users} title="אין מטופלים" description="הוסף מטופל חדש כדי להתחיל" action={
          <button onClick={openAdd} className="btn-primary">הוסף מטופל</button>
        } />
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {filtered.map(pt => (
            <PatientCard
              key={pt.id}
              patient={pt}
              onEdit={() => openEdit(pt)}
              onDelete={() => setDeleteTarget(pt)}
              onNavigate={() => navigate(`/patients/${pt.id}`)}
            />
          ))}
        </div>
      )}

      {/* Patient Form Modal */}
      <Modal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        title={editPatient ? 'עריכת מטופל' : 'מטופל חדש'}
        maxWidth="max-w-2xl"
      >
        <form onSubmit={handleSave} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">שם מלא *</label>
              <input className="input" value={form.full_name} onChange={set('full_name')} />
              {errors.full_name && <p className="text-red-500 text-xs mt-1">{errors.full_name}</p>}
            </div>
            <div>
              <label className="label">מספר ת.ז.</label>
              <input className="input" value={form.id_number} onChange={set('id_number')} maxLength={9} dir="ltr" placeholder="9 ספרות" />
              {errors.id_number && <p className="text-red-500 text-xs mt-1">{errors.id_number}</p>}
            </div>
            <div>
              <label className="label">טלפון</label>
              <input className="input" type="tel" value={form.phone} onChange={set('phone')} dir="ltr" />
            </div>
            <div>
              <label className="label">מייל</label>
              <input className="input" type="email" value={form.email} onChange={set('email')} dir="ltr" />
            </div>
            <div>
              <label className="label">תאריך לידה</label>
              <input className="input" type="date" value={form.birth_date} onChange={set('birth_date')} />
            </div>
            <div>
              <label className="label">סטטוס</label>
              <select className="input" value={form.status} onChange={set('status')}>
                {PATIENT_STATUSES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
            </div>
          </div>

          <div>
            <label className="label">כתובת</label>
            <input className="input" value={form.address} onChange={set('address')} />
          </div>

          {/* Parents */}
          <div className="border-t border-gray-100 pt-4">
            <p className="text-sm font-semibold text-gray-700 mb-3">פרטי הורים</p>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="label">הורה 1 – שם</label>
                <input className="input" value={form.parent1_name} onChange={set('parent1_name')} />
              </div>
              <div>
                <label className="label">הורה 1 – טלפון</label>
                <input className="input" type="tel" value={form.parent1_phone} onChange={set('parent1_phone')} dir="ltr" />
              </div>
              <div>
                <label className="label">הורה 2 – שם</label>
                <input className="input" value={form.parent2_name} onChange={set('parent2_name')} />
              </div>
              <div>
                <label className="label">הורה 2 – טלפון</label>
                <input className="input" type="tel" value={form.parent2_phone} onChange={set('parent2_phone')} dir="ltr" />
              </div>
            </div>
          </div>

          <div>
            <label className="label">הערות</label>
            <textarea className="input resize-none" rows={3} value={form.notes} onChange={set('notes')} />
          </div>

          <div className="flex items-center gap-2">
            <input type="checkbox" id="portal" checked={form.portal_access_enabled} onChange={set('portal_access_enabled')} className="rounded" />
            <label htmlFor="portal" className="text-sm text-gray-700">אפשר גישה לפורטל מטופלים</label>
          </div>

          {errors._ && <p className="text-red-500 text-sm">{errors._}</p>}

          <div className="flex gap-2 pt-2">
            <button type="button" className="btn-secondary flex-1" onClick={() => setFormOpen(false)}>ביטול</button>
            <button type="submit" disabled={saving} className="btn-primary flex-1">
              {saving ? 'שומר...' : editPatient ? 'עדכן' : 'הוסף מטופל'}
            </button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title="מחיקת מטופל"
        message={`האם למחוק את ${deleteTarget?.full_name}? לא ניתן לבטל פעולה זו.`}
        confirmLabel="מחק"
        danger
      />
    </div>
  );
}

function PatientCard({ patient, onEdit, onDelete, onNavigate }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="card hover:shadow-md transition-all group cursor-pointer"
      onClick={onNavigate}
    >
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-teal-400 to-blue-500 flex items-center justify-center text-white font-bold text-sm flex-shrink-0">
            {patient.full_name?.[0] || '?'}
          </div>
          <div>
            <p className="font-semibold text-gray-900">{patient.full_name}</p>
            <div className="flex items-center gap-2 mt-0.5">
              <Badge color={patient.status === 'active' ? 'green' : 'gray'}>
                {patient.status === 'active' ? 'פעיל' : 'לא פעיל'}
              </Badge>
              <span className="text-xs text-gray-400">{patient.treatment_count || 0} טיפולים</span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-all" onClick={e => e.stopPropagation()}>
          <button onClick={onEdit} className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-400 hover:text-gray-700">
            <Pencil className="w-3.5 h-3.5" />
          </button>
          <button onClick={onDelete} className="p-1.5 hover:bg-red-50 rounded-lg text-gray-400 hover:text-red-500">
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      <div className="mt-3 space-y-1">
        {patient.phone && (
          <div className="flex items-center gap-2 text-xs text-gray-500">
            <Phone className="w-3.5 h-3.5" />
            <span dir="ltr">{patient.phone}</span>
          </div>
        )}
        {patient.email && (
          <div className="flex items-center gap-2 text-xs text-gray-500">
            <Mail className="w-3.5 h-3.5" />
            <span dir="ltr">{patient.email}</span>
          </div>
        )}
      </div>

      <div className="flex items-center justify-end mt-3">
        <span className="text-xs text-teal-600 group-hover:underline flex items-center gap-1">
          פרופיל מלא <ChevronLeft className="w-3 h-3" />
        </span>
      </div>
    </motion.div>
  );
}
