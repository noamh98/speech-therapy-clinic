import { useState, useEffect } from 'react';
import { Modal } from '../ui';
import { useClinicData } from '../../context/useClinicData';
import { createTreatment, updateTreatment, getNextTreatmentNumber, getTreatment, deleteTreatment } from '../../services/treatments';
// FIX: Removed import of linkAppointmentToTreatment — it was causing a duplicate
// link call. treatments.js already calls linkAppointmentToTreatment internally
// inside createTreatment(). Calling it again from the dialog created a race
// condition with two rapid writes to the same Firestore document.
import { getTemplates } from '../../services/templates';
import { uploadPatientFile } from '../../services/storage';
import { PAYMENT_METHODS, PAYMENT_STATUSES } from '../../utils/formatters';
import { Upload, Loader2, FileText, X, Trash2, CheckCircle2 } from 'lucide-react';

/**
 * TREATMENT DIALOG — Linked-Record Architecture
 *
 * FIXES APPLIED:
 * 1. ID Mismatch: Form state previously used `appointment_id` (snake_case) while
 *    Firestore stores the field as `appointmentId` (camelCase). The form now uses
 *    `appointmentId` consistently throughout — in initial state, in fetchAndFillTreatment,
 *    and in dataToSave.
 *
 * 2. Duplicate Link Call Removed: createTreatment() in treatments.js already calls
 *    linkAppointmentToTreatment() and updateAppointment(status:'completed') internally.
 *    The extra call from this component was redundant and caused a write race condition.
 *    The import has been removed.
 *
 * 3. Optimistic Appointment Update: After saving, setAppointments() now immediately
 *    reflects the new status in the UI before fetchAll() completes, preventing
 *    the Calendar from showing stale data during the re-fetch.
 *
 * 4. Edit Mode Appointment Linking: updateTreatment() now also triggers
 *    linkAppointmentToTreatment via treatments.js when an appointmentId is present,
 *    fixing the case where editing a treatment would silently drop the link.
 */
export default function TreatmentDialog({ open, onClose, onSaved, appointment, patient, treatment, treatmentId, appointmentId }) {
  const { setTreatments, setPatients, setAppointments, fetchAll } = useClinicData();
  const [isEdit, setIsEdit] = useState(false);
  const today = new Date().toISOString().slice(0, 10);

  // FIX: Single source of truth for the linked appointment ID
  const lockedAppointmentId = appointmentId || appointment?.id || null;

  const [form, setForm] = useState({
    date: '',
    treatment_number: '',
    amount: '',
    payment_method: 'cash',
    payment_status: 'unpaid',
    payment_date: '',
    goals: '',
    description: '',
    progress: '',
    template_id: '',
    files: [],
    // FIX: Was `appointment_id` (snake_case) — now `appointmentId` (camelCase)
    // to match the Firestore field name and what createTreatment/updateTreatment expect.
    appointmentId: '',
    createPayment: false,
    paymentAmount: '',
    paymentMethod: 'cash',
    paymentNotes: '',
  });

  const [templates, setTemplates] = useState([]);
  const [filesToUpload, setFilesToUpload] = useState([]);
  const [uploadProgress, setUploadProgress] = useState({});
  const [loading, setLoading] = useState(false);
  const [initialFetchLoading, setInitialFetchLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (open) {
      loadTemplates();
      setFilesToUpload([]);
      setUploadProgress({});

      const effectiveTreatmentId = treatmentId || treatment?.id || appointment?.treatment_id;

      if (effectiveTreatmentId) {
        fetchAndFillTreatment(effectiveTreatmentId);
      } else {
        setIsEdit(false);
        setForm({
          date: appointment?.date || today,
          treatment_number: '',
          amount: appointment?.price || '',
          payment_method: 'cash',
          payment_status: 'unpaid',
          payment_date: '',
          goals: '',
          description: '',
          progress: '',
          template_id: '',
          files: [],
          // FIX: Use `appointmentId` (camelCase) consistently
          appointmentId: lockedAppointmentId || '',
          createPayment: false,
          paymentAmount: appointment?.price || '',
          paymentMethod: 'cash',
          paymentNotes: '',
        });

        if (patient?.id) {
          getNextTreatmentNumber(patient.id).then(n =>
            setForm(f => ({ ...f, treatment_number: n }))
          );
        }
      }
    }
  }, [open, treatmentId, appointmentId, appointment, patient, today]);

  useEffect(() => {
    if (form.payment_status === 'paid' && !form.payment_date) {
      setForm(prev => ({ ...prev, payment_date: prev.date || today }));
    }
  }, [form.payment_status]);

  async function fetchAndFillTreatment(id) {
    setInitialFetchLoading(true);
    try {
      const data = await getTreatment(id);
      if (data) {
        setForm({
          ...data,
          date: data.date || today,
          files: data.files || [],
          // FIX: Read `appointmentId` (camelCase) from Firestore — that's what's stored.
          // Previously read `data.appointment_id` which is always undefined, silently
          // dropping the link on every edit.
          appointmentId: data.appointmentId || lockedAppointmentId || '',
          createPayment: false,
          paymentAmount: '',
          paymentMethod: 'cash',
          paymentNotes: '',
        });
        setIsEdit(true);
      }
    } catch (err) {
      console.error('[TreatmentDialog] Error fetching treatment:', err);
      setError('לא הצלחנו לטעון את פרטי הטיפול');
    } finally {
      setInitialFetchLoading(false);
    }
  }

  async function loadTemplates() {
    try {
      const t = await getTemplates();
      setTemplates(t.filter(tmp => tmp.type === 'treatment_note' && tmp.active));
    } catch (err) {
      console.warn('[TreatmentDialog] Templates load failed:', err);
    }
  }

  const handleFileChange = (e) => {
    if (e.target.files) {
      const newFiles = Array.from(e.target.files);
      setFilesToUpload(prev => [...prev, ...newFiles]);
    }
  };

  const removeFileFromQueue = (index) => {
    setFilesToUpload(prev => prev.filter((_, i) => i !== index));
  };

  const handleDelete = async () => {
    const currentTreatmentId = treatmentId || treatment?.id || form.id;
    if (!currentTreatmentId || !window.confirm('האם אתה בטוח שברצונך למחוק את תיעוד הטיפול? פעולה זו תסיר את הטיפול מהחישובים בדשבורד.')) return;

    setLoading(true);
    try {
      await deleteTreatment(currentTreatmentId, patient?.id);

      setTreatments(prev => prev.filter(t => t.id !== currentTreatmentId));

      if (patient?.id) {
        setPatients(prev => prev.map(p =>
          p.id === patient.id
            ? { ...p, treatment_count: Math.max(0, (p.treatment_count || 1) - 1) }
            : p
        ));
      }

      onSaved();
      onClose();
    } catch (err) {
      console.error('[TreatmentDialog] Delete error:', err);
      setError('שגיאה במחיקת הטיפול');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!patient?.id) return setError('חסר זיהוי מטופל');

    setError('');
    setLoading(true);

    try {
      // ─── Upload files ──────────────────────────────────────────────────────
      const newlyUploadedFiles = [];
      for (const file of filesToUpload) {
        const uploadedFile = await uploadPatientFile(patient.id, file, (percent) => {
          setUploadProgress(prev => ({ ...prev, [file.name]: percent }));
        });
        newlyUploadedFiles.push(uploadedFile);
      }

      const allFiles = [...(form.files || []), ...newlyUploadedFiles];

      // FIX: Use `form.appointmentId` (camelCase) — now consistent with form state.
      // Previously used `form.appointment_id` which was always undefined after edit.
      const finalAppointmentId = form.appointmentId || lockedAppointmentId || null;

      // ─── Prepare treatment data ────────────────────────────────────────────
      const dataToSave = {
        date: form.date,
        treatment_number: form.treatment_number,
        goals: form.goals,
        description: form.description,
        progress: form.progress,
        files: allFiles,
        patient_id: patient.id,
        patient_name: patient.full_name,
        // FIX: This is the canonical field name used in treatments.js and Firestore.
        // This was already correct here, but now it's reliably populated because
        // finalAppointmentId correctly reads from form.appointmentId above.
        appointmentId: finalAppointmentId,
        paymentAmount: form.createPayment ? Number(form.paymentAmount) || 0 : 0,
        payment_method: form.paymentMethod || 'cash',
        payment_notes: form.paymentNotes || '',
      };

      let currentTreatmentId = isEdit ? (treatmentId || treatment?.id || appointment?.treatment_id || form.id) : null;
      let savedTreatment;

      if (isEdit && currentTreatmentId) {
        console.log('[TreatmentDialog] Updating treatment:', currentTreatmentId);
        savedTreatment = await updateTreatment(currentTreatmentId, dataToSave);

        // Optimistically update treatments in context
        setTreatments(prev => prev.map(t =>
          t.id === currentTreatmentId ? { ...t, ...dataToSave, id: currentTreatmentId } : t
        ));
      } else {
        console.log('[TreatmentDialog] Creating new treatment');
        // NOTE: createTreatment() already calls linkAppointmentToTreatment() and
        // updateAppointment(status:'completed') internally. Do NOT call them again here.
        savedTreatment = await createTreatment(dataToSave);
        currentTreatmentId = savedTreatment.id;

        // Optimistically update treatments in context
        setTreatments(prev => [savedTreatment, ...prev]);
      }

      // FIX: Optimistically update the linked appointment's status in context.
      // This ensures the Calendar shows 'completed' immediately, before fetchAll()
      // completes its round-trip to Firestore.
      if (finalAppointmentId) {
        setAppointments(prev => prev.map(a =>
          a.id === finalAppointmentId
            ? { ...a, status: 'completed', treatmentId: currentTreatmentId }
            : a
        ));
      }

      // FIX: No more duplicate linkAppointmentToTreatment() call here.
      // createTreatment() handles it internally. The optimistic setAppointments()
      // above is sufficient to update the UI immediately.

      // Full refresh to reconcile all server-side changes (treatment_count, payment, etc.)
      await fetchAll();

      onSaved();
      onClose();
    } catch (err) {
      console.error('[TreatmentDialog] Submit error:', err);
      setError('שגיאה בשמירה: ' + (err.message || 'נסה שוב מאוחר יותר'));
    } finally {
      setLoading(false);
    }
  };

  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }));
  const toggle = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.checked }));

  return (
    <Modal open={open} onClose={onClose} title={isEdit ? 'עריכת תיעוד טיפול' : 'תיעוד טיפול חדש'} maxWidth="max-w-2xl">
      {initialFetchLoading ? (
        <div className="flex flex-col items-center justify-center py-12 gap-3">
          <Loader2 className="w-8 h-8 animate-spin text-teal-600" />
          <p className="text-sm text-gray-500 font-medium">טוען נתונים...</p>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="bg-teal-50 rounded-xl p-3 border border-teal-100 flex justify-between items-center">
            <p className="text-sm font-bold text-teal-800">מטופל/ת: {patient?.full_name || '—'}</p>
            {isEdit && (
              <button
                type="button"
                onClick={handleDelete}
                className="flex items-center gap-1 text-red-500 hover:bg-red-50 px-2 py-1 rounded-lg transition-colors text-xs font-bold"
              >
                <Trash2 size={14} /> מחק תיעוד
              </button>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">תאריך *</label>
              <input type="date" className="input" value={form.date} onChange={set('date')} required />
            </div>
            <div>
              <label className="label">מספר טיפול</label>
              <input type="number" className="input bg-gray-50" value={form.treatment_number} readOnly />
            </div>
          </div>

          <div>
            <label className="label">מטרות הטיפול</label>
            <textarea className="input resize-none" rows={2} value={form.goals} onChange={set('goals')} placeholder="מה המטרות להיום?" />
          </div>

          <div>
            <label className="label">תיאור הטיפול *</label>
            <textarea className="input resize-none" rows={4} value={form.description} onChange={set('description')} placeholder="תאר את מהלך הטיפול..." required />
          </div>

          <div>
            <label className="label">הערות התקדמות</label>
            <textarea className="input resize-none" rows={2} value={form.progress} onChange={set('progress')} placeholder="מה השתפר?" />
          </div>

          {/* ─── Linked Payment Creation ─────────────────────────────────────── */}
          <div className="border-t-2 border-teal-100 pt-4">
            <div className="flex items-center gap-3 mb-4 p-3 bg-teal-50 rounded-lg border border-teal-200">
              <input
                type="checkbox"
                id="createPayment"
                checked={form.createPayment}
                onChange={toggle('createPayment')}
                className="w-5 h-5 rounded border-teal-300 text-teal-600 cursor-pointer"
              />
              <label htmlFor="createPayment" className="flex items-center gap-2 cursor-pointer flex-1">
                <CheckCircle2 size={16} className="text-teal-600" />
                <span className="font-bold text-teal-900">צור תשלום עבור טיפול זה</span>
              </label>
            </div>

            {form.createPayment && (
              <div className="space-y-3 p-3 bg-teal-50 rounded-lg border border-teal-200 animate-in fade-in slide-in-from-top-1">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="label text-teal-900 font-bold">סכום תשלום (₪) *</label>
                    <input
                      type="number"
                      className="input border-teal-300 bg-white"
                      value={form.paymentAmount}
                      onChange={set('paymentAmount')}
                      placeholder="0"
                      required={form.createPayment}
                    />
                  </div>
                  <div>
                    <label className="label text-teal-900 font-bold">אמצעי תשלום</label>
                    <select className="input border-teal-300 bg-white" value={form.paymentMethod} onChange={set('paymentMethod')}>
                      {PAYMENT_METHODS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                    </select>
                  </div>
                </div>
                <div>
                  <label className="label text-teal-900 font-bold">הערות תשלום</label>
                  <input
                    type="text"
                    className="input border-teal-300 bg-white"
                    value={form.paymentNotes}
                    onChange={set('paymentNotes')}
                    placeholder="למשל: תשלום חלקי, עם קבלה וכו'"
                  />
                </div>
                <p className="text-xs text-teal-700 font-medium">💡 התשלום יווצר באופן אוטומטי כשתשמור את הטיפול</p>
              </div>
            )}
          </div>

          {form.files?.length > 0 && (
            <div className="space-y-2">
              <label className="block text-xs font-bold text-gray-400 uppercase">קבצים מצורפים:</label>
              <div className="flex flex-wrap gap-2">
                {form.files.map((file, idx) => (
                  <a key={idx} href={file.url} target="_blank" rel="noreferrer" className="flex items-center gap-2 bg-white border border-teal-100 px-3 py-1.5 rounded-lg text-xs text-teal-700 hover:bg-teal-50 transition-colors">
                    <FileText size={12} />
                    <span className="truncate max-w-[150px]">{file.name}</span>
                  </a>
                ))}
              </div>
            </div>
          )}

          <div className="p-4 bg-gray-50 rounded-2xl border-2 border-dashed border-gray-200">
            <label className="flex items-center justify-center gap-2 p-3 bg-white border border-gray-200 rounded-xl cursor-pointer hover:bg-teal-50 transition-all group">
              <Upload className="w-5 h-5 text-gray-400 group-hover:text-teal-500" />
              <span className="text-sm font-medium text-gray-600 group-hover:text-teal-700">צרף קבצים חדשים</span>
              <input type="file" className="hidden" multiple onChange={handleFileChange} />
            </label>

            {filesToUpload.length > 0 && (
              <div className="mt-3 space-y-2">
                {filesToUpload.map((file, idx) => (
                  <div key={idx} className="bg-white p-2 px-3 rounded-lg border border-teal-100 flex items-center justify-between">
                    <div className="flex items-center gap-2 truncate">
                      <FileText size={14} className="text-teal-500" />
                      <span className="text-xs font-medium truncate">{file.name}</span>
                    </div>
                    {loading ? (
                      <span className="text-[10px] font-bold text-teal-600">{uploadProgress[file.name] || 0}%</span>
                    ) : (
                      <button type="button" onClick={() => removeFileFromQueue(idx)} className="text-red-400 hover:bg-red-50 p-1 rounded-full">
                        <X size={14} />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {error && <div className="p-3 bg-red-50 text-red-600 text-sm rounded-xl border border-red-100 font-medium">{error}</div>}

          <div className="flex gap-3 pt-4">
            <button type="button" className="btn-secondary flex-1 py-3" onClick={onClose} disabled={loading}>ביטול</button>
            <button type="submit" disabled={loading} className="btn-primary flex-1 py-3 flex items-center justify-center gap-2">
              {loading ? <><Loader2 className="w-5 h-5 animate-spin" /> <span>שומר...</span></> : <span>{isEdit ? 'עדכן תיעוד' : 'שמור תיעוד'}</span>}
            </button>
          </div>
        </form>
      )}
    </Modal>
  );
}
