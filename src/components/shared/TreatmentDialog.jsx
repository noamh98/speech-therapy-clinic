// src/components/shared/TreatmentDialog.jsx
import { useState, useEffect } from 'react';
import { Modal } from '../ui';
import { createTreatment, updateTreatment, getNextTreatmentNumber } from '../../services/treatments';
import { getTemplates } from '../../services/templates';
import { storage } from '../../services/firebase';
import { ref as storageRef, uploadBytes, getDownloadURL } from 'firebase/storage';
import { PAYMENT_METHODS, PAYMENT_STATUSES } from '../../utils/formatters';
import { Upload, Loader2 } from 'lucide-react';

export default function TreatmentDialog({ open, onClose, onSaved, appointment, patient, treatment }) {
  const isEdit = !!treatment;
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
  const [receiptFile, setReceiptFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (open) {
      loadTemplates();
      if (isEdit) {
        setForm({
          date: treatment.date || today,
          treatment_number: treatment.treatment_number || '',
          amount: treatment.amount || '',
          payment_method: treatment.payment_method || 'cash',
          payment_status: treatment.payment_status || 'unpaid',
          payment_date: treatment.payment_date || '',
          goals: treatment.goals || '',
          description: treatment.description || '',
          progress: treatment.progress || '',
          template_id: '',
        });
      } else {
        setForm(f => ({
          ...f,
          date: appointment?.date || today,
          treatment_number: '',
        }));
        // Auto-fill treatment number
        if (patient?.id) {
          getNextTreatmentNumber(patient.id).then(n =>
            setForm(f => ({ ...f, treatment_number: n }))
          );
        }
      }
    }
  }, [open, treatment, appointment, patient]);

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
      let receipt_url = treatment?.receipt_url || null;

      if (receiptFile) {
        const path = `receipts/${patient?.id}/${Date.now()}_${receiptFile.name}`;
        const fileRef = storageRef(storage, path);
        await uploadBytes(fileRef, receiptFile);
        receipt_url = await getDownloadURL(fileRef);
      }

      const data = {
        ...form,
        amount: Number(form.amount) || 0,
        patient_id: patient?.id,
        patient_name: patient?.full_name,
        appointment_id: appointment?.id || null,
        receipt_url,
      };

      if (isEdit) {
        await updateTreatment(treatment.id, data);
      } else {
        await createTreatment(data);
      }
      onSaved();
    } catch (err) {
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
      title={isEdit ? 'עריכת טיפול' : 'תיעוד טיפול'}
      maxWidth="max-w-2xl"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Patient name */}
        <div className="bg-teal-50 rounded-xl p-3">
          <p className="text-sm font-medium text-teal-800">מטופל/ת: {patient?.full_name || '—'}</p>
        </div>

        {/* Template selector */}
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
            <input type="number" className="input" value={form.treatment_number} onChange={set('treatment_number')} readOnly={!isEdit} />
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
          <label className="label">מטרות</label>
          <textarea
            className="input resize-none"
            rows={3}
            value={form.goals}
            onChange={set('goals')}
            placeholder="מטרות הטיפול..."
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
          <label className="label">התקדמות</label>
          <textarea
            className="input resize-none"
            rows={2}
            value={form.progress}
            onChange={set('progress')}
            placeholder="הערות התקדמות..."
          />
        </div>

        {/* Receipt upload */}
        <div>
          <label className="label">קבלה (אופציונלי)</label>
          <label className="flex items-center gap-2 cursor-pointer border-2 border-dashed border-gray-200 rounded-xl p-3 hover:border-teal-400 transition-colors">
            <Upload className="w-4 h-4 text-gray-400" />
            <span className="text-sm text-gray-500">
              {receiptFile ? receiptFile.name : 'לחץ להעלאת קבלה'}
            </span>
            <input
              type="file"
              className="hidden"
              accept="image/*,.pdf"
              onChange={e => setReceiptFile(e.target.files[0])}
            />
          </label>
          {treatment?.receipt_url && !receiptFile && (
            <a href={treatment.receipt_url} target="_blank" rel="noreferrer" className="text-xs text-teal-600 hover:underline mt-1 block">
              צפה בקבלה קיימת
            </a>
          )}
        </div>

        {error && <p className="text-red-500 text-sm">{error}</p>}

        <div className="flex gap-2 pt-2">
          <button type="button" className="btn-secondary flex-1" onClick={onClose}>ביטול</button>
          <button type="submit" disabled={loading} className="btn-primary flex-1 flex items-center justify-center gap-2">
            {loading && <Loader2 className="w-4 h-4 animate-spin" />}
            {isEdit ? 'עדכן טיפול' : 'שמור טיפול'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
