import { useState, useEffect } from 'react';
import { Modal } from '../ui';
import { createTreatment, updateTreatment, getNextTreatmentNumber, getTreatment } from '../../services/treatments';
import { updateAppointment } from '../../services/appointments'; 
import { getTemplates } from '../../services/templates';
import { uploadPatientFile } from '../../services/storage';
import { PAYMENT_METHODS, PAYMENT_STATUSES } from '../../utils/formatters';
import { Upload, Loader2, FileText, X, CheckCircle2 } from 'lucide-react';

export default function TreatmentDialog({ open, onClose, onSaved, appointment, patient, treatment, treatmentId }) {
  // קביעה אם מדובר בעריכה: או שיש אובייקט מלא, או שיש לנו ID לשליפה
  const [isEdit, setIsEdit] = useState(false);
  const today = new Date().toISOString().slice(0, 10);

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
  });

  const [templates, setTemplates] = useState([]);
  const [selectedFile, setSelectedFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [initialFetchLoading, setInitialFetchLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (open) {
      loadTemplates();
      setSelectedFile(null);
      
      const effectiveTreatmentId = treatmentId || treatment?.id;

      if (effectiveTreatmentId) {
        // מצב עריכה - טעינת נתונים מהשרת
        fetchAndFillTreatment(effectiveTreatmentId);
      } else {
        // מצב חדש
        setIsEdit(false);
        setForm({
          date: appointment?.date || today,
          treatment_number: '',
          amount: '',
          payment_method: 'cash',
          payment_status: 'unpaid',
          payment_date: '',
          goals: '',
          description: '',
          progress: '',
          template_id: '',
        });
        
        if (patient?.id) {
          getNextTreatmentNumber(patient.id).then(n =>
            setForm(f => ({ ...f, treatment_number: n }))
          );
        }
      }
    }
  }, [open, treatment, treatmentId, appointment, patient]);

  async function fetchAndFillTreatment(id) {
    setInitialFetchLoading(true);
    try {
      const data = await getTreatment(id);
      if (data) {
        setForm({
          date: data.date || today,
          treatment_number: data.treatment_number || '',
          amount: data.amount || '',
          payment_method: data.payment_method || 'cash',
          payment_status: data.payment_status || 'unpaid',
          payment_date: data.payment_date || '',
          goals: data.goals || '',
          description: data.description || '',
          progress: data.progress || '',
          template_id: '',
        });
        setIsEdit(true);
      }
    } catch (err) {
      console.error("Error fetching treatment:", err);
    } finally {
      setInitialFetchLoading(false);
    }
  }

  async function loadTemplates() {
    try {
      const t = await getTemplates();
      setTemplates(t.filter(t => t.type === 'treatment_note' && t.active));
    } catch {}
  }

  const handleTemplateSelect = (templateId) => {
    const tmpl = templates.find(t => t.id === templateId);
    if (!tmpl) return;
    setForm(f => ({
      ...f,
      template_id: templateId,
      goals: tmpl.default_goals || f.goals,
      description: tmpl.default_description || f.description,
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      let fileData = null;
      if (selectedFile) {
        fileData = await uploadPatientFile(patient?.id, selectedFile);
      }

      const data = {
        ...form,
        amount: Number(form.amount) || 0,
        patient_id: patient?.id,
        patient_name: patient?.full_name,
        appointment_id: appointment?.id || null,
        fileData: fileData,
        receipt_url: fileData ? fileData.url : (treatment?.receipt_url || null)
      };

      let finalId = treatmentId || treatment?.id;

      if (isEdit && finalId) {
        await updateTreatment(finalId, data);
      } else {
        const result = await createTreatment(data);
        finalId = result.id;
      }

      if (appointment?.id && finalId) {
        await updateAppointment(appointment.id, {
          treatment_id: finalId,
          status: 'completed'
        });
      }

      onSaved();
    } catch (err) {
      console.error("Submit error:", err);
      setError(err.message || 'שגיאה בשמירה');
    } finally {
      setLoading(false);
    }
  };

  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }));

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isEdit ? 'עריכת תיעוד טיפול' : 'תיעוד טיפול חדש'}
      maxWidth="max-w-2xl"
    >
      {initialFetchLoading ? (
        <div className="flex flex-col items-center justify-center py-12 gap-3">
          <Loader2 className="w-8 h-8 animate-spin text-teal-600" />
          <p className="text-sm text-gray-500 font-medium">טוען נתוני תיעוד...</p>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="bg-teal-50 rounded-xl p-3 border border-teal-100 flex justify-between items-center">
            <p className="text-sm font-bold text-teal-800">מטופל/ת: {patient?.full_name || '—'}</p>
            <span className="text-[10px] bg-white text-teal-600 px-2 py-1 rounded-full border border-teal-200 uppercase font-bold">
              ID: {patient?.id_number || 'N/A'}
            </span>
          </div>

          {!isEdit && templates.length > 0 && (
            <div>
              <label className="label">תבנית (אופציונלי)</label>
              <select
                className="input"
                value={form.template_id}
                onChange={e => handleTemplateSelect(e.target.value)}
              >
                <option value="">בחר תבנית...</option>
                {templates.map(t => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">תאריך *</label>
              <input type="date" className="input" value={form.date} onChange={set('date')} required />
            </div>
            <div>
              <label className="label">מספר טיפול</label>
              <input type="number" className="input bg-gray-50" value={form.treatment_number} onChange={set('treatment_number')} readOnly={!isEdit} />
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
            <div>
              <label className="label">תאריך תשלום</label>
              <input type="date" className="input" value={form.payment_date} onChange={set('payment_date')} />
            </div>
          )}

          <div>
            <label className="label">מטרות הטיפול</label>
            <textarea
              className="input resize-none"
              rows={2}
              value={form.goals}
              onChange={set('goals')}
              placeholder="מה המטרות להיום?"
            />
          </div>

          <div>
            <label className="label">תיאור הטיפול *</label>
            <textarea
              className="input resize-none"
              rows={4}
              value={form.description}
              onChange={set('description')}
              placeholder="תאר את מהלך הטיפול..."
              required
            />
          </div>

          <div>
            <label className="label">הערות התקדמות</label>
            <textarea
              className="input resize-none"
              rows={2}
              value={form.progress}
              onChange={set('progress')}
              placeholder="איך הייתה ההיענות? מה השתפר?"
            />
          </div>

          <div className="p-4 bg-gray-50 rounded-2xl border-2 border-dashed border-gray-200">
            <label className="block text-xs font-bold text-gray-500 mb-2 uppercase tracking-wider">קבצים ומסמכים</label>
            
            {!selectedFile ? (
              <div className="flex flex-col gap-2">
                <label className="flex items-center justify-center gap-2 p-3 bg-white border border-gray-200 rounded-xl cursor-pointer hover:bg-teal-50 hover:border-teal-300 transition-all group">
                  <Upload className="w-5 h-5 text-gray-400 group-hover:text-teal-500" />
                  <span className="text-sm font-medium text-gray-600 group-hover:text-teal-700">צרף קובץ, תמונה או סיכום טיפול</span>
                  <input
                    type="file"
                    className="hidden"
                    onChange={e => setSelectedFile(e.target.files[0])}
                  />
                </label>
                {(treatment?.receipt_url || form.receipt_url) && (
                  <div className="flex items-center gap-2 text-[11px] text-teal-600 bg-teal-50/50 p-2 rounded-lg">
                    <CheckCircle2 className="w-3 h-3" />
                    <span>קיים קובץ שמור במערכת. העלאה חדשה תחליף אותו.</span>
                  </div>
                )}
              </div>
            ) : (
              <div className="flex items-center justify-between bg-white p-3 rounded-xl border border-teal-200 shadow-sm">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-teal-50 rounded-lg">
                    <FileText className="w-5 h-5 text-teal-600" />
                  </div>
                  <div className="max-w-[200px]">
                    <p className="text-sm font-bold text-gray-700 truncate">{selectedFile.name}</p>
                    <p className="text-[10px] text-gray-400">{(selectedFile.size / 1024).toFixed(1)} KB</p>
                  </div>
                </div>
                <button 
                  type="button"
                  onClick={() => setSelectedFile(null)} 
                  className="p-2 hover:bg-red-50 text-gray-400 hover:text-red-500 rounded-full transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            )}
          </div>

          {error && <p className="text-red-500 text-sm font-medium bg-red-50 p-2 rounded-lg">{error}</p>}

          <div className="flex gap-3 pt-4">
            <button type="button" className="btn-secondary flex-1 py-3" onClick={onClose}>ביטול</button>
            <button 
              type="submit" 
              disabled={loading} 
              className="btn-primary flex-1 py-3 flex items-center justify-center gap-2 shadow-lg shadow-teal-100"
            >
              {loading ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  <span>שומר נתונים...</span>
                </>
              ) : (
                <span>{isEdit ? 'עדכן תיעוד קיים' : 'שמור תיעוד'}</span>
              )}
            </button>
          </div>
        </form>
      )}
    </Modal>
  );
}