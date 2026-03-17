// src/components/treatments/TreatmentDialog.jsx
import { useState, useEffect } from 'react';
import { Modal } from '../ui';
import { useClinicData } from '../../context/useClinicData'; // הוספת ה-Hook לניהול הסטייט הגלובלי
import { createTreatment, updateTreatment, getNextTreatmentNumber, getTreatment, deleteTreatment } from '../../services/treatments';
import { updateAppointment } from '../../services/appointments'; 
import { getTemplates } from '../../services/templates';
import { uploadFileWithProgress } from '../../services/storage'; 
import { PAYMENT_METHODS, PAYMENT_STATUSES } from '../../utils/formatters';
import { Upload, Loader2, FileText, X, Trash2 } from 'lucide-react'; // הוספת Trash2 למחיקה

export default function TreatmentDialog({ open, onClose, onSaved, appointment, patient, treatment, treatmentId, appointmentId }) {
  const { setTreatments, setPatients } = useClinicData(); // גישה לעדכון הנתונים בזמן אמת
  const [isEdit, setIsEdit] = useState(false);
  const today = new Date().toISOString().slice(0, 10);

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
    appointment_id: ''
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
          appointment_id: lockedAppointmentId || ''
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
          appointment_id: data.appointment_id || appointment?.id || ''
        });
        setIsEdit(true);
      }
    } catch (err) {
      console.error("Error fetching treatment:", err);
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
      console.warn("Templates load failed");
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

  // פונקציית מחיקה חדשה ומסונכרנת
  const handleDelete = async () => {
    const currentTreatmentId = treatmentId || treatment?.id || form.id;
    if (!currentTreatmentId || !window.confirm('האם אתה בטוח שברצונך למחוק את תיעוד הטיפול? פעולה זו תסיר את הטיפול מהחישובים בדשבורד.')) return;

    setLoading(true);
    try {
      await deleteTreatment(currentTreatmentId, patient?.id);

      // עדכון ה-State הגלובלי - זה מה שמתקן את הדשבורד!
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
      console.error("Delete error:", err);
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
      const newlyUploadedFiles = [];
      for (const file of filesToUpload) {
        const uploadedFile = await uploadFileWithProgress(patient.id, file, (percent) => {
          setUploadProgress(prev => ({ ...prev, [file.name]: percent }));
        });
        newlyUploadedFiles.push(uploadedFile);
      }

      const allFiles = [...(form.files || []), ...newlyUploadedFiles];
      const finalAppointmentId = form.appointment_id || lockedAppointmentId || null;

      const dataToSave = {
        ...form,
        amount: Number(form.amount) || 0,
        files: allFiles,
        patient_id: patient.id,
        patient_name: patient.full_name,
        appointment_id: finalAppointmentId,
      };

      let currentTreatmentId = isEdit ? (treatmentId || treatment?.id || appointment?.treatment_id || form.id) : null;
      let savedTreatment;

      if (isEdit && currentTreatmentId) {
        savedTreatment = await updateTreatment(currentTreatmentId, dataToSave);
        // עדכון אופטימי ב-Context
        setTreatments(prev => prev.map(t => t.id === currentTreatmentId ? { ...t, ...dataToSave, id: currentTreatmentId } : t));
      } else {
        savedTreatment = await createTreatment(dataToSave);
        // הוספה אופטימית ב-Context
        setTreatments(prev => [savedTreatment, ...prev]);
      }

      if (finalAppointmentId && currentTreatmentId) {
        await updateAppointment(finalAppointmentId, {
          treatment_id: currentTreatmentId,
          status: 'completed'
        });
      }

      onSaved();
      onClose();
    } catch (err) {
      console.error("Submit error:", err);
      setError('שגיאה בשמירה: ' + (err.message || 'נסה שוב מאוחר יותר'));
    } finally {
      setLoading(false);
    }
  };

  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }));

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

          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="label">סכום (₪)</label>
              <input type="number" className="input" value={form.amount} onChange={set('amount')} placeholder="0" />
            </div>
            <div>
              <label className="label">אמצעי תשלום</label>
              <select className="input" value={form.payment_method} onChange={set('payment_method')}>
                {PAYMENT_METHODS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
              </select>
            </div>
            <div>
              <label className="label">סטטוס תשלום</label>
              <select className="input" value={form.payment_status} onChange={set('payment_status')}>
                {PAYMENT_STATUSES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
            </div>
          </div>

          {form.payment_status === 'paid' && (
            <div className="animate-in fade-in slide-in-from-top-1">
              <label className="label text-teal-700 font-bold">תאריך תשלום</label>
              <input type="date" className="input border-teal-200 bg-teal-50/30" value={form.payment_date} onChange={set('payment_date')} required />
            </div>
          )}

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