// src/pages/PatientProfile/PatientProgress.jsx
import { useState, useEffect } from 'react';
import { collection, addDoc, getDocs, query, where, orderBy, serverTimestamp } from 'firebase/firestore';
import { db, auth } from '../../services/firebase';
import { EmptyState, Modal, Spinner } from '../../components/ui';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { TrendingUp, Plus } from 'lucide-react';
import { formatDate, localDateStr, PROGRESS_TYPES, PROGRESS_DOMAINS } from '../../utils/formatters';
import { motion } from 'framer-motion';

export default function PatientProgress({ patient }) {
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  // FIX: localDateStr() instead of new Date().toISOString().slice(0,10).
  // toISOString() converts to UTC — in Israel (UTC+2/+3) this returns yesterday's
  // date for any local time before 02:00/03:00 AM, so new progress records would
  // be pre-filled with the wrong date and saved with the wrong date to Firestore.
  const [form, setForm] = useState({
    date: localDateStr(),
    type: 'goal',
    title: '',
    domain: 'speech',
    score: 5,
    description: '',
    notes: '',
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => { load(); }, [patient.id]);

  async function load() {
    setLoading(true);
    try {
      const q = query(
        collection(db, 'progress'),
        where('patient_id', '==', patient.id),
        orderBy('date', 'asc')
      );
      const snap = await getDocs(q);
      setRecords(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    } finally { setLoading(false); }
  }

  const chartData = records
    .filter(r => r.score)
    .map(r => ({ date: formatDate(r.date), score: r.score, name: r.title }));

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const user = auth.currentUser;
      await addDoc(collection(db, 'progress'), {
        ...form,
        score: Number(form.score),
        patient_id: patient.id,
        // ownerId added for multi-tenancy (matches the pattern of other collections)
        ownerId: user?.uid || '',
        therapist_email: user?.email || '',
        created_by: user?.email || '',
        created_date: serverTimestamp(),
        updated_date: serverTimestamp(),
      });
      setFormOpen(false);
      // Reset date to today (recalculated fresh at open time)
      setForm(f => ({ ...f, date: localDateStr(), title: '', description: '', notes: '' }));
      load();
    } finally { setSaving(false); }
  };

  const set = k => e => setForm(f => ({ ...f, [k]: e.target.value }));

  // Reset form date each time modal opens so it always defaults to actual today
  const openForm = () => {
    setForm(f => ({ ...f, date: localDateStr() }));
    setFormOpen(true);
  };

  if (loading) return <div className="flex justify-center py-8"><Spinner /></div>;

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <button onClick={openForm} className="btn-primary flex items-center gap-2">
          <Plus className="w-4 h-4" /> הוסף רשומה
        </button>
      </div>

      {/* Progress chart */}
      {chartData.length > 1 && (
        <div className="p-4 bg-gray-50 rounded-xl">
          <p className="text-sm font-semibold text-gray-700 mb-3">גרף התקדמות</p>
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis dataKey="date" tick={{ fontSize: 11 }} />
              <YAxis domain={[0, 10]} tick={{ fontSize: 11 }} />
              <Tooltip />
              <Line
                type="monotone"
                dataKey="score"
                stroke="#14b8a6"
                strokeWidth={2}
                dot={{ r: 4, fill: '#14b8a6' }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {records.length === 0 ? (
        <EmptyState icon={TrendingUp} title="אין רשומות התקדמות" description="הוסף רשומה ראשונה" />
      ) : (
        <div className="space-y-2">
          {[...records].reverse().map(r => {
            const typeInfo = PROGRESS_TYPES.find(t => t.value === r.type);
            const domainLabel = PROGRESS_DOMAINS.find(d => d.value === r.domain)?.label;
            return (
              <motion.div
                key={r.id}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="p-3 border border-gray-100 rounded-xl"
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-lg">{typeInfo?.icon}</span>
                    <div>
                      <p className="text-sm font-medium">{r.title}</p>
                      <p className="text-xs text-gray-400">{formatDate(r.date)} · {domainLabel}</p>
                    </div>
                  </div>
                  {r.score && (
                    <div className="flex items-center gap-1 bg-teal-50 px-2 py-0.5 rounded-full">
                      <span className="text-sm font-bold text-teal-700">{r.score}</span>
                      <span className="text-xs text-teal-500">/10</span>
                    </div>
                  )}
                </div>
                {r.description && <p className="text-xs text-gray-600 mt-2">{r.description}</p>}
              </motion.div>
            );
          })}
        </div>
      )}

      <Modal open={formOpen} onClose={() => setFormOpen(false)} title="הוסף רשומת התקדמות">
        <form onSubmit={handleSave} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">תאריך</label>
              {/* User can always override the date manually in the input */}
              <input type="date" className="input" value={form.date} onChange={set('date')} />
            </div>
            <div>
              <label className="label">סוג</label>
              <select className="input" value={form.type} onChange={set('type')}>
                {PROGRESS_TYPES.map(t => (
                  <option key={t.value} value={t.value}>{t.icon} {t.label}</option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <label className="label">כותרת *</label>
            <input className="input" value={form.title} onChange={set('title')} required />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">תחום</label>
              <select className="input" value={form.domain} onChange={set('domain')}>
                {PROGRESS_DOMAINS.map(d => (
                  <option key={d.value} value={d.value}>{d.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">ציון (1–10)</label>
              <input
                type="number" className="input"
                min={1} max={10}
                value={form.score} onChange={set('score')}
              />
            </div>
          </div>
          <div>
            <label className="label">תיאור</label>
            <textarea
              className="input resize-none" rows={3}
              value={form.description} onChange={set('description')}
            />
          </div>
          <div className="flex gap-2">
            <button
              type="button" className="btn-secondary flex-1"
              onClick={() => setFormOpen(false)}
            >
              ביטול
            </button>
            <button type="submit" disabled={saving} className="btn-primary flex-1">
              {saving ? 'שומר...' : 'שמור'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
