/**
 * FEATURES:
 * 1. Quick note templates & "Copy from previous session"
 * 2. Structured clinical fields (domain, cooperation, progress)
 * 3. 1:1 payment guard (prevents duplicate payments for same treatment)
 * 4. IDEMPOTENCY GUARD: Checks if treatment exists for appointment before creating.
 * 5. GRANULAR CONTEXT SYNC: Updates treatments, appointments, payments, and patient counts
 *    optimistically for instant UI feedback.
 * 6. CASCADING DELETE: Atomically removes treatment + payments and resets appointment.
 * 7. FIX: clinicalDomain → multi-select button group
 * 8. FIX: תשלום נשמר גם בעת עריכת טיפול קיים
 */

import { useState, useEffect } from 'react';
import { Modal } from '../ui';
import { useClinicData } from '../../context/useClinicData';
import { useAuth } from '../../context/AuthContext';
import { generateTreatmentPDF } from '../../utils/generateTreatmentPDF';
import {
  createTreatment, updateTreatment, getNextTreatmentNumber,
  getTreatment, deleteTreatment, getPatientTreatments,
  getTreatmentByAppointment,
} from '../../services/treatments';
import { linkAppointmentToTreatment } from '../../services/appointments';
// ✅ שינוי 1: הוספת createPayment לייבוא
import { getPaymentsByTreatment, createPayment } from '../../services/payments';
import { getTemplates } from '../../services/templates';
import { uploadPatientFile } from '../../services/storage';
import {
  PAYMENT_METHODS, localDateStr,
  CLINICAL_DOMAINS, COOPERATION_LEVELS, PROGRESS_RATINGS, QUICK_NOTE_TEMPLATES,
} from '../../utils/formatters';
import { Upload, Loader2, FileText, X, Trash2, CheckCircle2, Zap, Copy, Pencil } from 'lucide-react';
import { PaymentModal } from './PaymentModal';

export default function TreatmentDialog({
  open, onClose, onSaved,
  appointment, patient, treatment, treatmentId, appointmentId,
}) {
  const {
    setTreatments, setPatients, setAppointments, setPayments, fetchAll
  } = useClinicData();
  const { profile } = useAuth();

  const [isEdit, setIsEdit] = useState(false);
  const today = localDateStr();
  const lockedAppointmentId = appointmentId || appointment?.id || null;

  // ── Form state ───────────────────────────────────────────────────────────
  const [form, setForm] = useState({
    date: '', treatment_number: '',
    goals: '', description: '', progress: '',
    template_id: '', files: [], appointment_id: '',
    clinicalDomain: [], clinicalDomainOther: '', cooperationLevel: '', progressRating: '',
    createPayment: false, paymentAmount: '', paymentMethod: 'cash', paymentNotes: '',
  });

  const [templates,           setTemplatesState]       = useState([]); // שינוי שם כדי לא להתנגש עם setTemplates מה-context
  const [filesToUpload,       setFilesToUpload]       = useState([]);
  const [uploadProgress,      setUploadProgress]      = useState({});
  const [loading,             setLoading]             = useState(false);
  const [initialFetchLoading, setInitialFetchLoading] = useState(false);
  const [error,               setError]               = useState('');

  const [existingPayment,  setExistingPayment]  = useState(null);
  const [paymentModalOpen, setPaymentModalOpen] = useState(false);
  const [prevTreatments,   setPrevTreatments]   = useState([]);
  const [pendingCopyFrom,  setPendingCopyFrom]  = useState(null);
  const [pendingTemplate,  setPendingTemplate]  = useState(null);

  // מזהה הטיפול הנוכחי - מחושב מכל המקורות האפשריים
  const currentTreatmentId = treatmentId || treatment?.id || form.id || appointment?.treatmentId;

  // ── Effects ──────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!open) return;

    loadTemplates();
    setFilesToUpload([]);
    setUploadProgress({});
    setError('');
    setExistingPayment(null);
    setPrevTreatments([]);
    setPendingTemplate(null);
    setPendingCopyFrom(null);

    if (currentTreatmentId) {
      fetchAndFillTreatment(currentTreatmentId);
      getPaymentsByTreatment(currentTreatmentId)
        .then(pmts => { if (pmts?.length > 0) setExistingPayment(pmts[0]); })
        .catch(() => {});
    } else {
      setIsEdit(false);
      setForm({
        date: appointment?.date || today,
        treatment_number: '',
        goals: '', description: '', progress: '',
        template_id: '', files: [],
        appointment_id: lockedAppointmentId || '',
        clinicalDomain: [], clinicalDomainOther: '', cooperationLevel: '', progressRating: '',
        createPayment: false,
        paymentAmount: appointment?.price || '',
        paymentMethod: 'cash', paymentNotes: '',
      });
      if (patient?.id) {
        getNextTreatmentNumber(patient.id)
          .then(n => setForm(f => ({ ...f, treatment_number: n })));
      }
    }

    if (patient?.id) {
      getPatientTreatments(patient.id)
        .then(ts => setPrevTreatments(ts || []))
        .catch(() => {});
    }
  }, [open, currentTreatmentId, appointment, patient]);

  async function fetchAndFillTreatment(id) {
    setInitialFetchLoading(true);
    try {
      const data = await getTreatment(id);
      if (data) {
        setForm({
          ...data,
          date:             data.date || today,
          files:            data.files || [],
          appointment_id:   data.appointment_id || appointment?.id || '',
          clinicalDomain:   Array.isArray(data.clinicalDomain)
                              ? data.clinicalDomain
                              : data.clinicalDomain ? [data.clinicalDomain] : [],
          clinicalDomainOther: data.clinicalDomainOther || '',
          cooperationLevel: data.cooperationLevel != null ? String(data.cooperationLevel) : '',
          progressRating:   data.progressRating   || '',
          createPayment: false, paymentAmount: '', paymentMethod: 'cash', paymentNotes: '',
        });
        setIsEdit(true);
      }
    } catch (err) {
      setError('לא הצלחנו לטעון את פרטי הטיפול');
    } finally {
      setInitialFetchLoading(false);
    }
  }

  async function loadTemplates() {
    try {
      const t = await getTemplates();
      setTemplatesState(t.filter(tmp => tmp.type === 'treatment_note' && tmp.active));
    } catch { /* non-fatal */ }
  }

  const applyTemplate = (tpl, confirmed = false) => {
    const hasContent = form.goals?.trim() || form.description?.trim();
    if (hasContent && !confirmed) { setPendingTemplate(tpl); return; }
    setPendingTemplate(null);
    setForm(f => ({
      ...f,
      goals:       tpl.goals,
      description: tpl.description,
      progress:    tpl.progress || f.progress,
    }));
  };

  const prevForCopy = prevTreatments.find(t => t.id !== currentTreatmentId);

  const handleCopyPrevious = (confirmed = false) => {
    if (!prevForCopy) return;
    const hasContent = form.goals?.trim() || form.description?.trim();
    if (hasContent && !confirmed) { setPendingCopyFrom(prevForCopy); return; }
    setPendingCopyFrom(null);
    setForm(f => ({
      ...f,
      goals:           prevForCopy.goals          || f.goals,
      description:     prevForCopy.description    || f.description,
      progress:        prevForCopy.progress       || f.progress,
      clinicalDomain: prevForCopy.clinicalDomain || f.clinicalDomain,
    }));
  };

  const handleFileChange = (e) => {
    if (e.target.files) setFilesToUpload(prev => [...prev, ...Array.from(e.target.files)]);
  };
  const removeFileFromQueue = (idx) =>
    setFilesToUpload(prev => prev.filter((_, i) => i !== idx));

  // ── handleDelete — Atomic Cascade ──────────────────────────────────────────
  const handleDelete = async () => {
    if (!currentTreatmentId) return;
    if (!window.confirm(
      'האם אתה בטוח שברצונך למחוק את תיעוד הטיפול?\n' +
      'כל התשלומים המקושרים ימחקו, והתור יחזור למצב "מתוכנן".'
    )) return;

    setLoading(true);
    setError('');

    try {
      const { deletedPaymentsCount, appointmentReset } = await deleteTreatment(currentTreatmentId, patient?.id);

      // Granular Sync - Delete
      setTreatments(prev => prev.filter(t => t.id !== currentTreatmentId));
      if (deletedPaymentsCount > 0) {
        setPayments(prev => prev.filter(p => p.treatmentId !== currentTreatmentId));
      }
      if (appointmentReset && lockedAppointmentId) {
        setAppointments(prev => prev.map(a =>
          a.id === lockedAppointmentId ? { ...a, status: 'scheduled', treatmentId: null } : a
        ));
      }
      if (patient?.id) {
        setPatients(prev => prev.map(p =>
          p.id === patient.id ? { ...p, treatment_count: Math.max(0, (p.treatment_count || 1) - 1) } : p
        ));
      }

      fetchAll().catch(() => {});
      onSaved();
      onClose();
    } catch (err) {
      setError(err.message || 'שגיאה במחיקת הטיפול');
    } finally {
      setLoading(false);
    }
  };

  // ── handleSubmit — Idempotency & Granular Sync ─────────────────────────────
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!patient?.id) return setError('חסר זיהוי מטופל');
    setError('');
    setLoading(true);

    try {
      const finalAppointmentId = form.appointment_id || lockedAppointmentId || null;

      // 1. Idempotency guard - Check before upload/create
      if (!isEdit && finalAppointmentId) {
        const existing = await getTreatmentByAppointment(finalAppointmentId);
        if (existing) {
          console.warn('[TreatmentDialog] Treatment exists, switching to edit mode.');
          setIsEdit(true);
          setForm(prev => ({ ...prev, id: existing.id }));
          await fetchAndFillTreatment(existing.id);
          setLoading(false);
          setError('נמצא תיעוד קיים לתור זה - המערכת עברה למצב עריכה');
          return;
        }
      }

      // 2. Upload files
      const newlyUploadedFiles = [];
      for (const file of filesToUpload) {
        const uploadedFile = await uploadPatientFile(
          patient.id, file,
          (percent) => setUploadProgress(prev => ({ ...prev, [file.name]: percent }))
        );
        newlyUploadedFiles.push(uploadedFile);
      }
      const allFiles = [...(form.files || []), ...newlyUploadedFiles];

      // 3. Build data
      const dataToSave = {
        date: form.date,
        treatment_number: form.treatment_number,
        goals: form.goals,
        description: form.description,
        progress: form.progress,
        files: allFiles,
        patient_id: patient.id,
        patient_name: patient.full_name,
        appointmentId: finalAppointmentId,
        clinicalDomain: form.clinicalDomain || null,
        clinicalDomainOther: form.clinicalDomainOther || '',
        cooperationLevel: form.cooperationLevel ? Number(form.cooperationLevel) : null,
        progressRating: form.progressRating || null,
        paymentAmount: form.createPayment ? Number(form.paymentAmount) || 0 : 0,
        payment_method: form.paymentMethod || 'cash',
        payment_notes: form.paymentNotes || '',
      };

      // 4. Save to Firestore
      let savedTreatment;
      let cid;
      if (isEdit) {
        cid = currentTreatmentId;
        savedTreatment = await updateTreatment(cid, dataToSave);
      } else {
        savedTreatment = await createTreatment(dataToSave);
        cid = savedTreatment.id;
      }

      // 5. GRANULAR CONTEXT SYNC (Optimistic)

      // 5a. Update Treatments list
      setTreatments(prev => {
        const updatedRecord = {
          ...dataToSave,
          id: cid,
          appointmentId: finalAppointmentId
        };
        const exists = prev.find(t => t.id === cid);
        if (exists) {
          return prev.map(t => t.id === cid ? updatedRecord : t);
        }
        return [updatedRecord, ...prev];
      });

      // 5b. Update Patient treatment count
      if (!isEdit && patient?.id) {
        setPatients(prev => prev.map(p =>
          p.id === patient.id ? { ...p, treatment_count: (p.treatment_count || 0) + 1 } : p
        ));
      }

      // 5c. Update Appointment status
      if (finalAppointmentId) {
        setAppointments(prev => prev.map(a =>
          a.id === finalAppointmentId ? { ...a, status: 'completed', treatmentId: cid } : a
        ));
        linkAppointmentToTreatment(finalAppointmentId, cid).catch(() => {});
      }

      // ✅ שינוי 2: תשלום נשמר גם בעריכה וגם ביצירה חדשה
      if (form.createPayment && dataToSave.paymentAmount > 0 && !existingPayment) {
        try {
          const newPayment = await createPayment({
            treatmentId: cid,
            patientId: patient.id,
            patient_id: patient.id,
            appointmentId: finalAppointmentId,
            amount: dataToSave.paymentAmount,
            payment_method: dataToSave.payment_method,
            payment_status: 'completed',
            payment_date: form.date,
            notes: dataToSave.payment_notes || '',
          });
          setPayments(prev => [newPayment, ...prev]);
        } catch (payErr) {
          console.warn('[TreatmentDialog] Payment creation failed (non-fatal):', payErr);
        }
      }

      // 6. Background reconcile
      fetchAll().catch(() => {});

      onSaved();
      onClose();
    } catch (err) {
      console.error('[TreatmentDialog] Submit error:', err);
      setError('שגיאה בשמירה: ' + (err.message || 'נסה שוב'));
    } finally {
      setLoading(false);
    }
  };

  const set    = k => e => setForm(f => ({ ...f, [k]: e.target.value }));
  const toggle = k => e => setForm(f => ({ ...f, [k]: e.target.checked }));

  return (
    <>
      <Modal open={open} onClose={onClose}
        title={isEdit ? 'עריכת תיעוד טיפול' : 'תיעוד טיפול חדש'}
        maxWidth="max-w-2xl"
      >
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
                <button type="button" onClick={handleDelete}
                  className="flex items-center gap-1 text-red-500 hover:bg-red-50 px-2 py-1 rounded-lg text-xs font-bold transition-colors">
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

            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-semibold text-gray-500 flex items-center gap-1">
                <Zap className="w-3.5 h-3.5" /> תבניות:
              </span>
              {QUICK_NOTE_TEMPLATES.map(tpl => (
                <button key={tpl.id} type="button" onClick={() => applyTemplate(tpl)}
                  className="flex items-center gap-1 px-2.5 py-1 text-xs bg-gray-100 hover:bg-teal-50 hover:text-teal-700 rounded-full border border-gray-200 hover:border-teal-200 transition-colors font-medium">
                  {tpl.icon} {tpl.label}
                </button>
              ))}
              {prevForCopy && (
                <button type="button" onClick={() => handleCopyPrevious()}
                  className="flex items-center gap-1 px-2.5 py-1 text-xs bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-full border border-blue-200 transition-colors font-medium">
                  <Copy className="w-3 h-3" /> העתק מהטיפול הקודם
                </button>
              )}
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

            <div className="border-t border-gray-100 pt-4">
              <p className="text-xs font-semibold text-gray-400 uppercase mb-3">שדות קליניים (אופציונלי)</p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">

                {/* ── תחום קליני — multi-select buttons ── */}
                <div className="sm:col-span-3">
                  <label className="label">תחום קליני</label>
                  <div className="flex flex-wrap gap-2 mt-1">
                    {CLINICAL_DOMAINS.map(domain => {
                      const selected = Array.isArray(form.clinicalDomain)
                        ? form.clinicalDomain.includes(domain.value)
                        : form.clinicalDomain === domain.value;
                      return (
                        <button
                          key={domain.value}
                          type="button"
                          onClick={() => {
                            setForm(f => {
                              const current = Array.isArray(f.clinicalDomain)
                                ? f.clinicalDomain
                                : f.clinicalDomain ? [f.clinicalDomain] : [];
                              const updated = current.includes(domain.value)
                                ? current.filter(v => v !== domain.value)
                                : [...current, domain.value];
                              return { ...f, clinicalDomain: updated };
                            });
                          }}
                          className={`px-3 py-1.5 rounded-full text-sm font-medium border transition-colors ${
                            selected
                              ? 'bg-teal-500 text-white border-teal-500'
                              : 'bg-white text-gray-600 border-gray-300 hover:border-teal-400'
                          }`}
                        >
                          {domain.label}
                        </button>
                      );
                    })}
                  </div>
                  {Array.isArray(form.clinicalDomain) && form.clinicalDomain.includes('other') && (
                    <input
                      className="input mt-2"
                      placeholder="פרט תחום קליני..."
                      value={form.clinicalDomainOther || ''}
                      onChange={e => setForm(f => ({ ...f, clinicalDomainOther: e.target.value }))}
                    />
                  )}
                </div>

                <div>
                  <label className="label">שיתוף פעולה (1–5)</label>
                  <select className="input" value={form.cooperationLevel} onChange={set('cooperationLevel')}>
                    <option value="">— בחר —</option>
                    {COOPERATION_LEVELS.map(c => <option key={c.value} value={c.value}>{c.value} — {c.label.split(' — ')[1]}</option>)}
                  </select>
                </div>
                <div>
                  <label className="label">דירוג התקדמות</label>
                  <select className="input" value={form.progressRating} onChange={set('progressRating')}>
                    <option value="">— בחר —</option>
                    {PROGRESS_RATINGS.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                  </select>
                </div>
              </div>
            </div>

            <div className="border-t-2 border-teal-100 pt-4">
              {existingPayment ? (
                <div className="p-3 bg-green-50 rounded-lg border border-green-200">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-bold text-green-800">תשלום קיים לטיפול זה</span>
                    <button type="button" onClick={() => setPaymentModalOpen(true)}
                      className="flex items-center gap-1 text-xs px-3 py-1.5 bg-white border border-green-300 text-green-700 rounded-lg hover:bg-green-50 font-medium">
                      <Pencil size={12} /> ערוך תשלום
                    </button>
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-xs text-green-700">
                    <div><span className="font-medium block">סכום</span>₪{existingPayment.amount}</div>
                    <div><span className="font-medium block">סטטוס</span>{existingPayment.payment_status === 'completed' ? 'שולם ✓' : 'ממתין'}</div>
                    <div><span className="font-medium block">תאריך</span>{existingPayment.payment_date || '—'}</div>
                  </div>
                </div>
              ) : (
                <>
                  <div className="flex items-center gap-3 mb-4 p-3 bg-teal-50 rounded-lg border border-teal-200">
                    <input type="checkbox" id="createPayment" checked={form.createPayment} onChange={toggle('createPayment')}
                      className="w-5 h-5 rounded border-teal-300 text-teal-600 cursor-pointer" />
                    <label htmlFor="createPayment" className="flex items-center gap-2 cursor-pointer flex-1">
                      <CheckCircle2 size={16} className="text-teal-600" />
                      <span className="font-bold text-teal-900">צור תשלום עבור טיפול זה</span>
                    </label>
                  </div>
                  {form.createPayment && (
                    <div className="space-y-3 p-3 bg-teal-50 rounded-lg border border-teal-200">
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="label text-teal-900 font-bold">סכום (₪) *</label>
                          <input type="number" className="input border-teal-300 bg-white" value={form.paymentAmount} onChange={set('paymentAmount')} required={form.createPayment} />
                        </div>
                        <div>
                          <label className="label text-teal-900 font-bold">אמצעי תשלום</label>
                          <select className="input border-teal-300 bg-white" value={form.paymentMethod} onChange={set('paymentMethod')}>
                            {PAYMENT_METHODS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                          </select>
                        </div>
                      </div>
                      <input type="text" className="input border-teal-300 bg-white" value={form.paymentNotes} onChange={set('paymentNotes')} placeholder="הערות תשלום..." />
                    </div>
                  )}
                </>
              )}
            </div>

            {form.files?.length > 0 && (
              <div className="space-y-2">
                <label className="block text-xs font-bold text-gray-400 uppercase">קבצים מצורפים:</label>
                <div className="flex flex-wrap gap-2">
                  {form.files.map((file, idx) => (
                    <a key={idx} href={file.url} target="_blank" rel="noreferrer" className="flex items-center gap-2 bg-white border border-teal-100 px-3 py-1.5 rounded-lg text-xs text-teal-700 hover:bg-teal-50 transition-colors">
                      <FileText size={12} /> <span className="truncate max-w-[150px]">{file.name}</span>
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
              {isEdit && (
                <button
                  type="button"
                  onClick={() => generateTreatmentPDF({ treatment: form, patient, clinicName: profile?.clinic_name })}
                  className="flex items-center gap-1.5 text-sm font-medium px-4 py-3 rounded-xl border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors flex-shrink-0"
                >
                  <FileText className="w-4 h-4" /> PDF
                </button>
              )}
              <button type="button" className="btn-secondary flex-1 py-3" onClick={onClose} disabled={loading}>ביטול</button>
              <button type="submit" disabled={loading} className="btn-primary flex-1 py-3 flex items-center justify-center gap-2">
                {loading ? <><Loader2 className="w-5 h-5 animate-spin" /> <span>שומר...</span></> : <span>{isEdit ? 'עדכן תיעוד' : 'שמור תיעוד'}</span>}
              </button>
            </div>
          </form>
        )}
      </Modal>

      {/* Modals for templates/copy confirmation */}
      {pendingTemplate && (
        <Modal open title="החלפת תוכן קיים" onClose={() => setPendingTemplate(null)} maxWidth="max-w-sm">
          <p className="text-sm text-gray-600 mb-4">יש כבר תוכן בשדות. האם להחליף עם תבנית "{pendingTemplate.label}"?</p>
          <div className="flex gap-3">
            <button className="btn-secondary flex-1" onClick={() => setPendingTemplate(null)}>ביטול</button>
            <button className="btn-primary flex-1" onClick={() => applyTemplate(pendingTemplate, true)}>החלף</button>
          </div>
        </Modal>
      )}

      {pendingCopyFrom && (
        <Modal open title="העתקת טיפול קודם" onClose={() => setPendingCopyFrom(null)} maxWidth="max-w-sm">
          <p className="text-sm text-gray-600 mb-4">יש כבר תוכן בשדות. האם להחליף עם נתונים מהטיפול מתאריך {pendingCopyFrom.date}?</p>
          <div className="flex gap-3">
            <button className="btn-secondary flex-1" onClick={() => setPendingCopyFrom(null)}>ביטול</button>
            <button className="btn-primary flex-1" onClick={() => handleCopyPrevious(true)}>העתק</button>
          </div>
        </Modal>
      )}

      {/* Payment Modal for existing payments */}
      {paymentModalOpen && existingPayment && (
        <PaymentModal
          isOpen={paymentModalOpen}
          onClose={() => setPaymentModalOpen(false)}
          onSave={() => {
            setPaymentModalOpen(false);
            if (currentTreatmentId) {
              getPaymentsByTreatment(currentTreatmentId).then(pmts => {
                if (pmts?.length > 0) setExistingPayment(pmts[0]);
              });
            }
          }}
          payment={existingPayment}
          patientId={patient?.id}
          treatmentId={currentTreatmentId}
        />
      )}
    </>
  );
}