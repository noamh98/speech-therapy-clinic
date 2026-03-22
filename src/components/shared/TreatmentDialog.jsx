// src/components/shared/TreatmentDialog.jsx
/**
 * WHAT'S NEW vs BASELINE:
 *
 * 1. Quick note templates (טיפול שגרתי / הערכה / הדרכת הורים)
 *    Three buttons above the goals field. Clicking one pre-fills goals +
 *    description. If fields already have content, a confirmation is shown.
 *
 * 2. "Copy from previous session" button
 *    Appears when editing or creating for a patient who has prior treatments.
 *    Fetches the most recent treatment via getPatientTreatments (already
 *    available in services). Shows a preview and copies on confirmation.
 *
 * 3. Structured clinical fields (all optional, backward-compatible)
 *    clinicalDomain, cooperationLevel, progressRating — quick selects below
 *    the progress notes field.
 *
 * 4. 1:1 payment guard
 *    When opening an existing treatment, fires ONE targeted
 *    getPaymentsByTreatment(treatmentId) call. If a payment is found, the
 *    "create payment" checkbox is replaced by a read-only summary + "Edit"
 *    button (opens PaymentModal). This prevents duplicate payment creation.
 *    No payments are loaded into global context.
 *
 * 5. localDateStr() replaces toISOString().slice(0,10) for the today default.
 *
 * PERFORMANCE: No changes to useClinicData. The two new network calls
 * (getPaymentsByTreatment, getPatientTreatments for copy-prev) fire only
 * when the dialog opens for an existing treatment — a rare, user-initiated
 * action, not a background load.
 */

import { useState, useEffect } from 'react';
import { Modal } from '../ui';
import { useClinicData } from '../../context/useClinicData';
import {
  createTreatment, updateTreatment, getNextTreatmentNumber,
  getTreatment, deleteTreatment, getPatientTreatments,
} from '../../services/treatments';
import { linkAppointmentToTreatment } from '../../services/appointments';
import { getPaymentsByTreatment } from '../../services/payments';
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
  const { setTreatments, setPatients, fetchAll } = useClinicData();
  const [isEdit, setIsEdit] = useState(false);

  const today = localDateStr(); // timezone-safe

  const lockedAppointmentId = appointmentId || appointment?.id || null;

  // ── Form state ───────────────────────────────────────────────────────────
  const [form, setForm] = useState({
    date: '', treatment_number: '',
    goals: '', description: '', progress: '',
    template_id: '', files: [], appointment_id: '',
    // Structured clinical fields
    clinicalDomain: '', cooperationLevel: '', progressRating: '',
    // Payment creation
    createPayment: false, paymentAmount: '', paymentMethod: 'cash', paymentNotes: '',
  });

  // ── Loading states ───────────────────────────────────────────────────────
  const [templates,           setTemplates]           = useState([]);
  const [filesToUpload,       setFilesToUpload]       = useState([]);
  const [uploadProgress,      setUploadProgress]      = useState({});
  const [loading,             setLoading]             = useState(false);
  const [initialFetchLoading, setInitialFetchLoading] = useState(false);
  const [error,               setError]               = useState('');

  // ── 1:1 Payment guard state ──────────────────────────────────────────────
  const [existingPayment,   setExistingPayment]   = useState(null);
  const [paymentModalOpen,  setPaymentModalOpen]  = useState(false);

  // ── Copy-previous state ──────────────────────────────────────────────────
  const [prevTreatments,    setPrevTreatments]    = useState([]);
  const [pendingCopyFrom,   setPendingCopyFrom]   = useState(null); // treatment to copy from

  // ── Template overwrite confirmation ─────────────────────────────────────
  const [pendingTemplate,   setPendingTemplate]   = useState(null);

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

    const effectiveTreatmentId = treatmentId || treatment?.id || appointment?.treatmentId;

    if (effectiveTreatmentId) {
      fetchAndFillTreatment(effectiveTreatmentId);
      // 1:1 check: load existing payment for this treatment
      getPaymentsByTreatment(effectiveTreatmentId)
        .then(pmts => { if (pmts?.length > 0) setExistingPayment(pmts[0]); })
        .catch(() => {}); // non-fatal
    } else {
      setIsEdit(false);
      setForm({
        date: appointment?.date || today,
        treatment_number: '',
        goals: '', description: '', progress: '',
        template_id: '', files: [],
        appointment_id: lockedAppointmentId || '',
        clinicalDomain: '', cooperationLevel: '', progressRating: '',
        createPayment: false,
        paymentAmount: appointment?.price || '',
        paymentMethod: 'cash', paymentNotes: '',
      });
      if (patient?.id) {
        getNextTreatmentNumber(patient.id)
          .then(n => setForm(f => ({ ...f, treatment_number: n })));
      }
    }

    // Load previous treatments for copy-prev feature
    if (patient?.id) {
      getPatientTreatments(patient.id)
        .then(ts => setPrevTreatments(ts || []))
        .catch(() => {});
    }
  }, [open, treatmentId, appointmentId, appointment, patient]); // eslint-disable-line

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
          clinicalDomain:   data.clinicalDomain   || '',
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
      setTemplates(t.filter(tmp => tmp.type === 'treatment_note' && tmp.active));
    } catch { /* non-fatal */ }
  }

  // ── Template application ──────────────────────────────────────────────────
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

  // ── Copy-previous ─────────────────────────────────────────────────────────
  const currentTreatmentId = treatmentId || treatment?.id;
  const prevForCopy = prevTreatments.find(t => t.id !== currentTreatmentId);

  const handleCopyPrevious = (confirmed = false) => {
    if (!prevForCopy) return;
    const hasContent = form.goals?.trim() || form.description?.trim();
    if (hasContent && !confirmed) { setPendingCopyFrom(prevForCopy); return; }
    setPendingCopyFrom(null);
    setForm(f => ({
      ...f,
      goals:          prevForCopy.goals       || f.goals,
      description:    prevForCopy.description || f.description,
      progress:       prevForCopy.progress    || f.progress,
      clinicalDomain: prevForCopy.clinicalDomain || f.clinicalDomain,
    }));
  };

  // ── File handling ─────────────────────────────────────────────────────────
  const handleFileChange = (e) => {
    if (e.target.files) setFilesToUpload(prev => [...prev, ...Array.from(e.target.files)]);
  };
  const removeFileFromQueue = (idx) =>
    setFilesToUpload(prev => prev.filter((_, i) => i !== idx));

  // ── Delete treatment ──────────────────────────────────────────────────────
  const handleDelete = async () => {
    const id = currentTreatmentId || form.id;
    if (!id || !window.confirm('האם אתה בטוח שברצונך למחוק את תיעוד הטיפול?')) return;
    setLoading(true);
    try {
      await deleteTreatment(id, patient?.id);
      setTreatments(prev => prev.filter(t => t.id !== id));
      if (patient?.id) {
        setPatients(prev => prev.map(p =>
          p.id === patient.id
            ? { ...p, treatment_count: Math.max(0, (p.treatment_count || 1) - 1) }
            : p
        ));
      }
      onSaved(); onClose();
    } catch (err) {
      setError('שגיאה במחיקת הטיפול');
    } finally { setLoading(false); }
  };

  // ── Submit ────────────────────────────────────────────────────────────────
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!patient?.id) return setError('חסר זיהוי מטופל');
    setError('');
    setLoading(true);
    try {
      // Upload files
      const newFiles = [];
      for (const file of filesToUpload) {
        const uploaded = await uploadPatientFile(patient.id, file, pct =>
          setUploadProgress(prev => ({ ...prev, [file.name]: pct }))
        );
        newFiles.push(uploaded);
      }
      const allFiles           = [...(form.files || []), ...newFiles];
      const finalAppointmentId = form.appointment_id || lockedAppointmentId || null;

      const dataToSave = {
        date:             form.date,
        treatment_number: form.treatment_number,
        goals:            form.goals,
        description:      form.description,
        progress:         form.progress,
        files:            allFiles,
        patient_id:       patient.id,
        patient_name:     patient.full_name,
        appointmentId:    finalAppointmentId,
        // Structured clinical fields (null when blank)
        clinicalDomain:   form.clinicalDomain   || null,
        cooperationLevel: form.cooperationLevel ? Number(form.cooperationLevel) : null,
        progressRating:   form.progressRating   || null,
        // Payment creation
        paymentAmount:    form.createPayment ? Number(form.paymentAmount) || 0 : 0,
        payment_method:   form.paymentMethod || 'cash',
        payment_notes:    form.paymentNotes  || '',
      };

      let savedTreatmentId = isEdit ? (currentTreatmentId || form.id) : null;
      let savedTreatment;

      if (isEdit && savedTreatmentId) {
        savedTreatment = await updateTreatment(savedTreatmentId, dataToSave);
        setTreatments(prev => prev.map(t =>
          t.id === savedTreatmentId ? { ...t, ...dataToSave, id: savedTreatmentId } : t
        ));
      } else {
        savedTreatment = await createTreatment(dataToSave);
        savedTreatmentId = savedTreatment.id;
        setTreatments(prev => [savedTreatment, ...prev]);
      }

      // Link appointment
      if (finalAppointmentId && savedTreatmentId) {
        try { await linkAppointmentToTreatment(finalAppointmentId, savedTreatmentId); }
        catch { /* non-fatal */ }
      }

      if (fetchAll) await fetchAll();
      onSaved(); onClose();
    } catch (err) {
      setError('שגיאה בשמירה: ' + (err.message || 'נסה שוב'));
    } finally { setLoading(false); }
  };

  const set    = k => e => setForm(f => ({ ...f, [k]: e.target.value }));
  const toggle = k => e => setForm(f => ({ ...f, [k]: e.target.checked }));

  // ── Render ────────────────────────────────────────────────────────────────
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

            {/* Patient header */}
            <div className="bg-teal-50 rounded-xl p-3 border border-teal-100 flex justify-between items-center">
              <p className="text-sm font-bold text-teal-800">מטופל/ת: {patient?.full_name || '—'}</p>
              {isEdit && (
                <button type="button" onClick={handleDelete}
                  className="flex items-center gap-1 text-red-500 hover:bg-red-50 px-2 py-1 rounded-lg text-xs font-bold transition-colors">
                  <Trash2 size={14} /> מחק תיעוד
                </button>
              )}
            </div>

            {/* Date + number */}
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

            {/* ── Quick templates + Copy previous ── */}
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-semibold text-gray-500 flex items-center gap-1">
                <Zap className="w-3.5 h-3.5" /> תבניות:
              </span>
              {QUICK_NOTE_TEMPLATES.map(tpl => (
                <button
                  key={tpl.id}
                  type="button"
                  onClick={() => applyTemplate(tpl)}
                  className="flex items-center gap-1 px-2.5 py-1 text-xs bg-gray-100 hover:bg-teal-50 hover:text-teal-700 rounded-full border border-gray-200 hover:border-teal-200 transition-colors font-medium"
                >
                  {tpl.icon} {tpl.label}
                </button>
              ))}
              {prevForCopy && (
                <button
                  type="button"
                  onClick={() => handleCopyPrevious()}
                  className="flex items-center gap-1 px-2.5 py-1 text-xs bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-full border border-blue-200 transition-colors font-medium"
                >
                  <Copy className="w-3 h-3" /> העתק מהטיפול הקודם
                </button>
              )}
            </div>

            {/* Goals */}
            <div>
              <label className="label">מטרות הטיפול</label>
              <textarea className="input resize-none" rows={2}
                value={form.goals} onChange={set('goals')} placeholder="מה המטרות להיום?" />
            </div>

            {/* Description */}
            <div>
              <label className="label">תיאור הטיפול *</label>
              <textarea className="input resize-none" rows={4}
                value={form.description} onChange={set('description')}
                placeholder="תאר את מהלך הטיפול..." required />
            </div>

            {/* Progress */}
            <div>
              <label className="label">הערות התקדמות</label>
              <textarea className="input resize-none" rows={2}
                value={form.progress} onChange={set('progress')} placeholder="מה השתפר?" />
            </div>

            {/* ── Structured clinical fields ── */}
            <div className="border-t border-gray-100 pt-4">
              <p className="text-xs font-semibold text-gray-400 uppercase mb-3">שדות קליניים (אופציונלי)</p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="label">תחום קליני</label>
                  <select className="input" value={form.clinicalDomain} onChange={set('clinicalDomain')}>
                    {CLINICAL_DOMAINS.map(d => (
                      <option key={d.value} value={d.value}>{d.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="label">שיתוף פעולה (1–5)</label>
                  <select className="input" value={form.cooperationLevel} onChange={set('cooperationLevel')}>
                    <option value="">— בחר —</option>
                    {COOPERATION_LEVELS.map(c => (
                      <option key={c.value} value={c.value}>{c.value} — {c.label.split(' — ')[1]}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="label">דירוג התקדמות</label>
                  <select className="input" value={form.progressRating} onChange={set('progressRating')}>
                    {PROGRESS_RATINGS.map(r => (
                      <option key={r.value} value={r.value}>{r.label}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            {/* ── Payment section — 1:1 guard ── */}
            <div className="border-t-2 border-teal-100 pt-4">
              {existingPayment ? (
                // Existing payment found → show it, block new creation
                <div className="p-3 bg-green-50 rounded-lg border border-green-200">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-bold text-green-800">תשלום קיים לטיפול זה</span>
                    <button
                      type="button"
                      onClick={() => setPaymentModalOpen(true)}
                      className="flex items-center gap-1 text-xs px-3 py-1.5 bg-white border border-green-300 text-green-700 rounded-lg hover:bg-green-50 font-medium"
                    >
                      <Pencil size={12} /> ערוך תשלום
                    </button>
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-xs text-green-700">
                    <div><span className="font-medium block">סכום</span>₪{existingPayment.amount}</div>
                    <div>
                      <span className="font-medium block">סטטוס</span>
                      {existingPayment.payment_status === 'completed' ? 'שולם ✓' : 'ממתין'}
                    </div>
                    <div><span className="font-medium block">תאריך</span>{existingPayment.payment_date || '—'}</div>
                  </div>
                  <p className="text-[10px] text-green-600 mt-2">
                    כבר קיים תשלום אחד לטיפול זה — לא ניתן ליצור תשלום נוסף.
                  </p>
                </div>
              ) : (
                // No payment yet → show create flow
                <>
                  <div className="flex items-center gap-3 mb-4 p-3 bg-teal-50 rounded-lg border border-teal-200">
                    <input type="checkbox" id="createPayment"
                      checked={form.createPayment} onChange={toggle('createPayment')}
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
                          <input type="number" className="input border-teal-300 bg-white"
                            value={form.paymentAmount} onChange={set('paymentAmount')}
                            placeholder="0" required={form.createPayment} />
                        </div>
                        <div>
                          <label className="label text-teal-900 font-bold">אמצעי תשלום</label>
                          <select className="input border-teal-300 bg-white"
                            value={form.paymentMethod} onChange={set('paymentMethod')}>
                            {PAYMENT_METHODS.map(m => (
                              <option key={m.value} value={m.value}>{m.label}</option>
                            ))}
                          </select>
                        </div>
                      </div>
                      <div>
                        <label className="label text-teal-900 font-bold">הערות תשלום</label>
                        <input type="text" className="input border-teal-300 bg-white"
                          value={form.paymentNotes} onChange={set('paymentNotes')}
                          placeholder="למשל: תשלום חלקי, עם קבלה..." />
                      </div>
                      <p className="text-xs text-teal-700 font-medium">
                        💡 התשלום יווצר אוטומטית כשתשמור את הטיפול
                      </p>
                    </div>
                  )}
                </>
              )}
            </div>

            {/* Existing files */}
            {form.files?.length > 0 && (
              <div className="space-y-2">
                <label className="block text-xs font-bold text-gray-400 uppercase">קבצים מצורפים:</label>
                <div className="flex flex-wrap gap-2">
                  {form.files.map((file, idx) => (
                    <a key={idx} href={file.url} target="_blank" rel="noreferrer"
                      className="flex items-center gap-2 bg-white border border-teal-100 px-3 py-1.5 rounded-lg text-xs text-teal-700 hover:bg-teal-50 transition-colors">
                      <FileText size={12} />
                      <span className="truncate max-w-[150px]">{file.name}</span>
                    </a>
                  ))}
                </div>
              </div>
            )}

            {/* File upload */}
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
                      {loading
                        ? <span className="text-[10px] font-bold text-teal-600">{uploadProgress[file.name] || 0}%</span>
                        : <button type="button" onClick={() => removeFileFromQueue(idx)}
                            className="text-red-400 hover:bg-red-50 p-1 rounded-full">
                            <X size={14} />
                          </button>
                      }
                    </div>
                  ))}
                </div>
              )}
            </div>

            {error && (
              <div className="p-3 bg-red-50 text-red-600 text-sm rounded-xl border border-red-100 font-medium">
                {error}
              </div>
            )}

            <div className="flex gap-3 pt-4">
              <button type="button" className="btn-secondary flex-1 py-3"
                onClick={onClose} disabled={loading}>ביטול</button>
              <button type="submit" disabled={loading}
                className="btn-primary flex-1 py-3 flex items-center justify-center gap-2">
                {loading
                  ? <><Loader2 className="w-5 h-5 animate-spin" /> <span>שומר...</span></>
                  : <span>{isEdit ? 'עדכן תיעוד' : 'שמור תיעוד'}</span>
                }
              </button>
            </div>
          </form>
        )}
      </Modal>

      {/* Template overwrite confirmation */}
      {pendingTemplate && (
        <Modal open title="החלפת תוכן קיים" onClose={() => setPendingTemplate(null)} maxWidth="max-w-sm">
          <p className="text-sm text-gray-600 mb-4">
            יש כבר תוכן בשדות המטרות / התיאור. האם להחליף עם תבנית "{pendingTemplate.label}"?
          </p>
          <div className="flex gap-3">
            <button className="btn-secondary flex-1" onClick={() => setPendingTemplate(null)}>ביטול</button>
            <button className="btn-primary flex-1" onClick={() => applyTemplate(pendingTemplate, true)}>החלף</button>
          </div>
        </Modal>
      )}

      {/* Copy-previous confirmation */}
      {pendingCopyFrom && (
        <Modal open title="העתקת טיפול קודם" onClose={() => setPendingCopyFrom(null)} maxWidth="max-w-sm">
          <p className="text-sm text-gray-600 mb-2">
            יש כבר תוכן בשדות. האם להחליף עם נתונים מהטיפול מתאריך {pendingCopyFrom.date}?
          </p>
          <div className="p-3 bg-gray-50 rounded-lg text-xs text-gray-500 mb-4 space-y-1">
            <p><strong>מטרות:</strong> {pendingCopyFrom.goals?.slice(0, 80) || '—'}</p>
            <p><strong>תיאור:</strong> {pendingCopyFrom.description?.slice(0, 80) || '—'}{pendingCopyFrom.description?.length > 80 ? '...' : ''}</p>
          </div>
          <div className="flex gap-3">
            <button className="btn-secondary flex-1" onClick={() => setPendingCopyFrom(null)}>ביטול</button>
            <button className="btn-primary flex-1" onClick={() => handleCopyPrevious(true)}>העתק</button>
          </div>
        </Modal>
      )}

      {/* Edit existing payment */}
      {paymentModalOpen && existingPayment && (
        <PaymentModal
          isOpen={paymentModalOpen}
          onClose={() => setPaymentModalOpen(false)}
          onSave={() => {
            setPaymentModalOpen(false);
            // Refresh the local existingPayment display
            if (currentTreatmentId) {
              getPaymentsByTreatment(currentTreatmentId)
                .then(pmts => { if (pmts?.length > 0) setExistingPayment(pmts[0]); })
                .catch(() => {});
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
