// src/pages/PatientProfile/PatientDetails.jsx
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { updatePatient, deletePatient } from '../../services/patients';
import { ConfirmDialog } from '../../components/ui';
import { Phone, Mail, MapPin, Calendar, User, Pencil, Trash2 } from 'lucide-react';
import { formatDate } from '../../utils/formatters';

export default function PatientDetails({ patient, onPatientUpdated }) {
  const navigate = useNavigate();
  const [editing, setEditing] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [form, setForm] = useState({ ...patient });
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      await updatePatient(patient.id, form);
      onPatientUpdated();
      setEditing(false);
    } finally { setSaving(false); }
  };

  const handleDelete = async () => {
    try {
      await deletePatient(patient.id);
      navigate('/patients');
    } catch (err) {
      alert(err.message);
    }
  };

  const set = k => e => setForm(f => ({ ...f, [k]: e.target.value }));

  if (editing) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label">שם מלא</label>
            <input className="input" value={form.full_name || ''} onChange={set('full_name')} />
          </div>
          <div>
            <label className="label">ת.ז.</label>
            <input className="input" value={form.id_number || ''} onChange={set('id_number')} dir="ltr" />
          </div>
          <div>
            <label className="label">טלפון</label>
            <input className="input" value={form.phone || ''} onChange={set('phone')} dir="ltr" />
          </div>
          <div>
            <label className="label">מייל</label>
            <input className="input" value={form.email || ''} onChange={set('email')} dir="ltr" />
          </div>
          <div>
            <label className="label">תאריך לידה</label>
            <input className="input" type="date" value={form.birth_date || ''} onChange={set('birth_date')} />
          </div>
          <div>
            <label className="label">סטטוס</label>
            <select className="input" value={form.status} onChange={set('status')}>
              <option value="active">פעיל</option>
              <option value="inactive">לא פעיל</option>
            </select>
          </div>
        </div>
        <div>
          <label className="label">כתובת</label>
          <input className="input" value={form.address || ''} onChange={set('address')} />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label">הורה 1 – שם</label>
            <input className="input" value={form.parent1_name || ''} onChange={set('parent1_name')} />
          </div>
          <div>
            <label className="label">הורה 1 – טלפון</label>
            <input className="input" value={form.parent1_phone || ''} onChange={set('parent1_phone')} dir="ltr" />
          </div>
          <div>
            <label className="label">הורה 2 – שם</label>
            <input className="input" value={form.parent2_name || ''} onChange={set('parent2_name')} />
          </div>
          <div>
            <label className="label">הורה 2 – טלפון</label>
            <input className="input" value={form.parent2_phone || ''} onChange={set('parent2_phone')} dir="ltr" />
          </div>
        </div>
        <div>
          <label className="label">הערות</label>
          <textarea className="input resize-none" rows={3} value={form.notes || ''} onChange={set('notes')} />
        </div>
        <div className="flex gap-2">
          <button className="btn-secondary" onClick={() => setEditing(false)}>ביטול</button>
          <button className="btn-primary" onClick={handleSave} disabled={saving}>
            {saving ? 'שומר...' : 'שמור שינויים'}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Actions */}
      <div className="flex gap-2 justify-end">
        <button onClick={() => setEditing(true)} className="btn-secondary flex items-center gap-2 text-sm">
          <Pencil className="w-4 h-4" /> עריכה
        </button>
        <button onClick={() => setDeleteOpen(true)} className="btn-danger flex items-center gap-2 text-sm">
          <Trash2 className="w-4 h-4" /> מחיקה
        </button>
      </div>

      {/* Info grid */}
      <div className="grid grid-cols-2 gap-3">
        <InfoItem icon={Phone}    label="טלפון"       value={patient.phone} dir="ltr" />
        <InfoItem icon={Mail}     label="מייל"        value={patient.email} dir="ltr" />
        <InfoItem icon={Calendar} label="תאריך לידה"  value={formatDate(patient.birth_date)} />
        <InfoItem icon={MapPin}   label="כתובת"       value={patient.address} />
        <InfoItem icon={User}     label="ת.ז."         value={patient.id_number} dir="ltr" />
      </div>

      {/* Parents */}
      {(patient.parent1_name || patient.parent2_name) && (
        <div className="grid grid-cols-2 gap-3">
          {patient.parent1_name && (
            <div className="p-3 bg-gray-50 rounded-xl">
              <p className="text-xs text-gray-400 mb-1">הורה 1</p>
              <p className="font-medium text-sm">{patient.parent1_name}</p>
              {patient.parent1_phone && <p className="text-xs text-gray-500" dir="ltr">{patient.parent1_phone}</p>}
            </div>
          )}
          {patient.parent2_name && (
            <div className="p-3 bg-gray-50 rounded-xl">
              <p className="text-xs text-gray-400 mb-1">הורה 2</p>
              <p className="font-medium text-sm">{patient.parent2_name}</p>
              {patient.parent2_phone && <p className="text-xs text-gray-500" dir="ltr">{patient.parent2_phone}</p>}
            </div>
          )}
        </div>
      )}

      {patient.notes && (
        <div className="p-3 bg-yellow-50 rounded-xl border border-yellow-100">
          <p className="text-xs font-medium text-yellow-700 mb-1">הערות</p>
          <p className="text-sm text-gray-700 whitespace-pre-line">{patient.notes}</p>
        </div>
      )}

      <ConfirmDialog
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        onConfirm={handleDelete}
        title="מחיקת מטופל"
        message={`האם למחוק לצמיתות את ${patient.full_name}? לא ניתן לבטל פעולה זו.`}
        confirmLabel="מחק"
        danger
      />
    </div>
  );
}

function InfoItem({ icon: Icon, label, value, dir }) {
  if (!value) return null;
  return (
    <div className="flex items-start gap-3 p-3 bg-gray-50 rounded-xl">
      <Icon className="w-4 h-4 text-teal-600 mt-0.5 flex-shrink-0" />
      <div>
        <p className="text-xs text-gray-400">{label}</p>
        <p className="text-sm font-medium text-gray-800" dir={dir}>{value}</p>
      </div>
    </div>
  );
}
