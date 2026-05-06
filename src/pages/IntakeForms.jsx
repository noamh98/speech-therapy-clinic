// src/pages/IntakeForms.jsx
import { useState, useEffect } from 'react';
import { collection, addDoc, getDocs, updateDoc, doc, query, where, serverTimestamp } from 'firebase/firestore';
import { db, auth } from '../services/firebase';
import { useAuth } from '../context/AuthContext';
import { getPatients } from '../services/patients';
import { PageHeader, Card, Modal, Badge, EmptyState } from '../components/ui';
import { FileText, Plus, Pencil } from 'lucide-react';
import { formatDate, localDateStr } from '../utils/formatters';

export default function IntakeForms() {
  const { user } = useAuth();
  const [forms, setForms] = useState([]);
  const [patients, setPatients] = useState([]);
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState({
    patient_id: '', filled_by: '', date: localDateStr(),
    status: 'draft', chief_complaint: '', medical_history: '',
    medications: '', allergies: '', developmental_history: '',
    previous_treatments: '', family_history: '', education: '',
    additional_info: '', treatment_goals: '',
  });

  useEffect(() => { if (user) load(); }, [user]);

  async function load() {
    const [p] = await Promise.all([getPatients(user.email)]);
    setPatients(p);
    const q = query(collection(db, 'intakeForms'), where('therapist_email', '==', user.email));
    const snap = await getDocs(q);
    setForms(snap.docs.map(d => ({ id: d.id, ...d.data() })));
  }

  const set = k => e => setForm(f => ({ ...f, [k]: e.target.value }));
  const patientMap = Object.fromEntries(patients.map(p => [p.id, p.full_name]));

  const handleSave = async (e) => {
    e.preventDefault();
    await addDoc(collection(db, 'intakeForms'), {
      ...form,
      therapist_email: user.email,
      created_by: user.email,
      created_date: serverTimestamp(),
      updated_date: serverTimestamp(),
    });
    setFormOpen(false);
    load();
  };

  return (
    <div className="space-y-4">
      <PageHeader title="שאלוני קבלה" actions={
        <button onClick={() => setFormOpen(true)} className="btn-primary flex items-center gap-2">
          <Plus className="w-4 h-4" /> שאלון חדש
        </button>
      } />

      {forms.length === 0 ? (
        <EmptyState icon={FileText} title="אין שאלוני קבלה" description="צור שאלון ראשון" />
      ) : (
        <div className="space-y-2">
          {forms.map(f => (
            <Card key={f.id} className="flex items-center gap-4">
              <FileText className="w-5 h-5 text-teal-600 flex-shrink-0" />
              <div className="flex-1">
                <p className="font-medium text-gray-900">{patientMap[f.patient_id] || f.patient_id}</p>
                <p className="text-xs text-gray-400">{formatDate(f.date)} · {f.filled_by}</p>
              </div>
              <Badge color={f.status === PAYMENT_STATUS.COMPLETED ? 'green' : 'gray'}>
                {f.status === PAYMENT_STATUS.COMPLETED ? 'הושלם' : 'טיוטה'}
              </Badge>
            </Card>
          ))}
        </div>
      )}

      <Modal open={formOpen} onClose={() => setFormOpen(false)} title="שאלון קבלה חדש" maxWidth="max-w-2xl">
        <form onSubmit={handleSave} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">מטופל *</label>
              <select className="input" value={form.patient_id} onChange={set('patient_id')} required>
                <option value="">בחר...</option>
                {patients.map(p => <option key={p.id} value={p.id}>{p.full_name}</option>)}
              </select>
            </div>
            <div>
              <label className="label">מילא/ה</label>
              <input className="input" value={form.filled_by} onChange={set('filled_by')} />
            </div>
          </div>
          {[
            ['chief_complaint', 'תלונה עיקרית'],
            ['medical_history', 'היסטוריה רפואית'],
            ['medications', 'תרופות'],
            ['allergies', 'אלרגיות'],
            ['developmental_history', 'היסטוריה התפתחותית'],
            ['previous_treatments', 'טיפולים קודמים'],
            ['treatment_goals', 'יעדי הטיפול'],
          ].map(([k, l]) => (
            <div key={k}>
              <label className="label">{l}</label>
              <textarea className="input resize-none" rows={2} value={form[k]} onChange={set(k)} />
            </div>
          ))}
          <div>
            <label className="label">סטטוס</label>
            <select className="input" value={form.status} onChange={set('status')}>
              <option value="draft">טיוטה</option>
              <option value={PAYMENT_STATUS.COMPLETED}>הושלם</option>
            </select>
          </div>
          <div className="flex gap-2 pt-2">
            <button type="button" className="btn-secondary flex-1" onClick={() => setFormOpen(false)}>ביטול</button>
            <button type="submit" className="btn-primary flex-1">שמור</button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
