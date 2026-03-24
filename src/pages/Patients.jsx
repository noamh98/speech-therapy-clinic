// src/pages/Patients.jsx
/**
 * FIXES IN THIS VERSION:
 *
 * FIX 1 — DUAL FIELD PAYMENT FILTER:
 *   setPayments() filter was only checking patientId (camelCase).
 *   Payments created by older code stored ONLY patient_id (snake_case).
 *   Those payments survived the filter and remained in context, keeping
 *   the Dashboard income inflated after archiving.
 *   FIX: Filter now checks BOTH p.patientId AND p.patient_id.
 *
 * FIX 2 — UTC DATE BUG IN APPOINTMENT FILTER:
 *   setAppointments used new Date().toISOString().split('T')[0] for today,
 *   which returns UTC date — in Israel this shifts to yesterday before 02:00 AM.
 *   FIX: Use localDateStr() from formatters.
 *
 * FIX 3 — handleSave MISSING CONTEXT SYNC:
 *   After creating/updating a patient, only the local list was refreshed.
 *   The global context (used by Dashboard patient count) was never updated.
 *   FIX: Call fetchAll() in the background after every save.
 *
 * FIX 4 — handleRestore NOW CALLS fetchAll:
 *   restorePatient() un-archives treatments + payments in Firestore, but
 *   the context still had empty arrays for them (they were removed on archive).
 *   FIX: fetchAll() after restore brings everything back into context.
 */

import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useClinicData } from '../context/useClinicData';
import { useAuth } from '../context/AuthContext';
import {
  getPatients,
  createPatient,
  updatePatient,
  deletePatient,
  validateIsraeliId,
  restorePatient,
} from '../services/patients';
import { PageHeader, EmptyState, Modal, ConfirmDialog, Spinner, Badge } from '../components/ui';
import {
  Users, Plus, Search, Pencil, Archive, ChevronLeft,
  Phone, UserCheck, AlertCircle,
} from 'lucide-react';
import { motion } from 'framer-motion';
import { PATIENT_STATUSES, localDateStr } from '../utils/formatters';

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

  // Global context setters — used to sync all views after mutations
  const {
    setPatients: setContextPatients,
    setTreatments,
    setPayments,
    setAppointments,
    fetchAll,
  } = useClinicData();

  const [patients,      setPatients]      = useState([]);
  const [loading,       setLoading]       = useState(true);
  const [search,        setSearch]        = useState('');
  const [statusFilter,  setStatusFilter]  = useState('all');
  const [showArchived,  setShowArchived]  = useState(false);
  const [formOpen,      setFormOpen]      = useState(false);
  const [editPatient,   setEditPatient]   = useState(null);
  const [deleteTarget,  setDeleteTarget]  = useState(null);
  const [form,          setForm]          = useState(EMPTY_FORM);
  const [errors,        setErrors]        = useState({});
  const [saving,        setSaving]        = useState(false);
  const [pageError,     setPageError]     = useState('');

  useEffect(() => {
    if (!user?.uid) { setLoading(true); return; }
    load();
  }, [user?.uid, showArchived]);

  async function load() {
    setLoading(true);
    setPageError('');
    try {
      const p = await getPatients(showArchived);
      const userPatients = p.filter(pat => pat.ownerId === user.uid);
      setPatients(userPatients);
    } catch (err) {
      console.error('[Patients] Load error:', err);
      setPageError(err.message || 'שגיאה בטעינת רשימת המטופלים. נסה שוב.');
      setPatients([]);
    } finally {
      setLoading(false);
    }
  }

  const filtered = useMemo(() => patients.filter(p => {
    const matchSearch = !search ||
      p.full_name?.toLowerCase().includes(search.toLowerCase()) ||
      p.phone?.includes(search);
    const matchStatus = statusFilter === 'all' || p.status === statusFilter;
    return matchSearch && matchStatus;
  }), [patients, search, statusFilter]);

  const openAdd  = () => { setEditPatient(null); setForm(EMPTY_FORM); setErrors({}); setFormOpen(true); };
  const openEdit = (pt) => { setEditPatient(pt); setForm({ ...EMPTY_FORM, ...pt }); setErrors({}); setFormOpen(true); };

  const validate = () => {
    const e = {};
    if (!form.full_name.trim()) e.full_name = 'שם חובה';
    if (form.id_number && !validateIsraeliId(form.id_number)) e.id_number = 'ת.ז. לא תקינה';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  // FIX 3: sync global context after every save
  const handleSave = async (e) => {
    e.preventDefault();
    if (!validate()) return;
    setSaving(true);
    try {
      if (editPatient) {
        await updatePatient(editPatient.id, form);
        // Optimistic update in context
        setContextPatients(prev => prev.map(p =>
          p.id === editPatient.id ? { ...p, ...form } : p
        ));
      } else {
        await createPatient(form);
      }
      setFormOpen(false);
      await load();
      // Background sync — updates Dashboard patient count, etc.
      fetchAll().catch(err => console.warn('[Patients] fetchAll after save:', err));
    } catch (err) {
      setErrors({ _: err.message });
    } finally {
      setSaving(false);
    }
  };

  // FIX 1 + FIX 2: correct dual-field filter and timezone-safe date
  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await deletePatient(deleteTarget.id);
      setDeleteTarget(null);

      // ── Local list update ──────────────────────────────────────────────
      setPatients(prev => prev.filter(p => p.id !== deleteTarget.id));

      // ── Global context sync ────────────────────────────────────────────
      // Remove the patient
      setContextPatients(prev => prev.filter(p => p.id !== deleteTarget.id));

      // Remove their treatments
      setTreatments(prev => prev.filter(t => t.patient_id !== deleteTarget.id));

      // FIX 1: check BOTH patientId (camelCase) AND patient_id (snake_case)
      // Older payment records may only have patient_id stored.
      setPayments(prev => prev.filter(p =>
        p.patientId  !== deleteTarget.id &&
        p.patient_id !== deleteTarget.id
      ));

      // FIX 2: use localDateStr() — not toISOString() which returns UTC date
      const todayStr = localDateStr();
      setAppointments(prev => prev.filter(a =>
        !(a.patient_id === deleteTarget.id &&
          a.status === 'scheduled' &&
          a.date >= todayStr)
      ));

      // Background reconcile — ensures paymentStats recomputes in useClinicData
      fetchAll().catch(err => console.warn('[Patients] fetchAll after delete:', err));

    } catch (err) {
      setPageError(err.message || 'שגיאה בהעברה לארכיון. נסה שוב.');
      setDeleteTarget(null);
    }
  };

  // FIX 4: fetchAll after restore brings treatments + payments back into context
  const handleRestore = async (id) => {
    try {
      await restorePatient(id);
      setShowArchived(false);
      // fetchAll re-fetches everything including restored treatments + payments
      await fetchAll();
    } catch (err) {
      setPageError(err.message || 'שגיאה בשחזור מטופל. נסה שוב.');
    }
  };

  const set = k => e => setForm(f => ({
    ...f,
    [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value,
  }));

  return (
    <div className="space-y-4">
      <PageHeader
        title={showArchived ? 'ארכיון מטופלים' : 'מטופלים'}
        subtitle={showArchived ? 'מטופלים שהועברו לארכיון' : `${patients.length} מטופלים פעילים`}
        actions={
          <div className="flex gap-2">
            <button
              onClick={() => setShowArchived(!showArchived)}
              className={`btn-secondary flex items-center gap-2 ${showArchived ? 'bg-teal-50 border-teal-200 text-teal-700' : ''}`}
            >
              {showArchived ? <Users className="w-4 h-4" /> : <Archive className="w-4 h-4" />}
              {showArchived ? 'חזרה למטופלים' : 'צפה בארכיון'}
            </button>
            {!showArchived && (
              <button onClick={openAdd} className="btn-primary flex items-center gap-2">
                <Plus className="w-4 h-4" /> מטופל חדש
              </button>
            )}
          </div>
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
        {!showArchived && (
          <select className="input w-auto" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
            <option value="all">הכל</option>
            <option value="active">פעיל</option>
            <option value="inactive">לא פעיל</option>
          </select>
        )}
      </div>

      {/* Inline error */}
      {pageError && (
        <div className="flex items-center gap-3 p-4 bg-red-50 border border-red-100 rounded-xl text-red-700 text-sm">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          <span>{pageError}</span>
          <button onClick={() => setPageError('')} className="mr-auto text-red-400 hover:text-red-600 text-xs underline">סגור</button>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-12"><Spinner size="lg" /></div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={showArchived ? Archive : Users}
          title={showArchived ? 'הארכיון ריק' : 'אין מטופלים'}
          description={showArchived ? '' : 'הוסף מטופל חדש כדי להתחיל'}
          action={!showArchived && <button onClick={openAdd} className="btn-primary">הוסף מטופל</button>}
        />
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {filtered.map(pt => (
            <PatientCard
              key={pt.id}
              patient={pt}
              onEdit={() => openEdit(pt)}
              onDelete={() => setDeleteTarget(pt)}
              onRestore={() => handleRestore(pt.id)}
              onNavigate={() => navigate(`/patients/${pt.id}`)}
              isArchivedView={showArchived}
            />
          ))}
        </div>
      )}

      {/* Form Modal */}
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
        title="העברה לארכיון"
        message={`האם להעביר את ${deleteTarget?.full_name} לארכיון? כל התורים העתידיים שלו יימחקו, אך התיעודים יישמרו.`}
        confirmLabel="העבר לארכיון"
        danger
      />
    </div>
  );
}

// ─── Patient Card ─────────────────────────────────────────────────────────────
function PatientCard({ patient, onEdit, onDelete, onRestore, onNavigate, isArchivedView }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className={`card hover:shadow-md transition-all group cursor-pointer ${isArchivedView ? 'opacity-75 bg-gray-50 border-dashed' : ''}`}
      onClick={onNavigate}
    >
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className={`w-10 h-10 rounded-full flex items-center justify-center text-white font-bold text-sm flex-shrink-0 ${isArchivedView ? 'bg-gray-400' : 'bg-gradient-to-br from-teal-400 to-blue-500'}`}>
            {patient.full_name?.[0] || '?'}
          </div>
          <div>
            <p className="font-semibold text-gray-900">{patient.full_name}</p>
            <div className="flex items-center gap-2 mt-0.5">
              <Badge color={isArchivedView ? 'gray' : (patient.status === 'active' ? 'green' : 'gray')}>
                {isArchivedView ? 'בארכיון' : (patient.status === 'active' ? 'פעיל' : 'לא פעיל')}
              </Badge>
              <span className="text-xs text-gray-400">{patient.treatment_count || 0} טיפולים</span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-all" onClick={e => e.stopPropagation()}>
          <button onClick={onEdit} className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-400 hover:text-gray-700">
            <Pencil className="w-3.5 h-3.5" />
          </button>
          {isArchivedView ? (
            <button onClick={onRestore} className="p-1.5 hover:bg-green-50 rounded-lg text-gray-400 hover:text-green-600" title="שחזר">
              <UserCheck className="w-3.5 h-3.5" />
            </button>
          ) : (
            <button onClick={onDelete} className="p-1.5 hover:bg-red-50 rounded-lg text-gray-400 hover:text-red-500" title="ארכיון">
              <Archive className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      <div className="mt-3 space-y-1">
        {patient.phone && (
          <div className="flex items-center gap-2 text-xs text-gray-500">
            <Phone className="w-3.5 h-3.5" />
            <span dir="ltr">{patient.phone}</span>
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
