// src/pages/PatientProfile/PatientDetails.jsx
import { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { updatePatient, deletePatient } from '../../services/patients';
import { uploadPatientFile, deletePatientFile } from '../../services/storage'; // וודא שייצאת את deletePatientFile
import { ConfirmDialog, Spinner } from '../../components/ui';
import { 
  Phone, Mail, MapPin, Calendar, User, Pencil, 
  Trash2, FileText, Upload, Download, ExternalLink, X 
} from 'lucide-react';
import { formatDate } from '../../utils/formatters';

export default function PatientDetails({ patient, onPatientUpdated }) {
  const navigate = useNavigate();
  const fileInputRef = useRef(null);
  const [editing, setEditing] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [form, setForm] = useState({ ...patient });
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  // פונקציה להעלאת קובץ כללי למטופל
  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setUploading(true);
    try {
      const fileData = await uploadPatientFile(patient.id, file);
      
      const updatedDocs = [...(patient.documents || []), fileData];
      await updatePatient(patient.id, { documents: updatedDocs });
      
      onPatientUpdated();
    } catch (err) {
      alert("שגיאה בהעלאת הקובץ: " + err.message);
    } finally {
      setUploading(false);
    }
  };

  // פונקציה למחיקת קובץ
  const handleDeleteFile = async (index, filePath) => {
    if (!window.confirm("האם אתה בטוח שברצונך למחוק את הקובץ?")) return;

    try {
      // 1. מחיקה מה-Storage (אם קיים נתיב)
      if (filePath) {
        await deletePatientFile(filePath);
      }

      // 2. עדכון ה-Firestore - הסרה מהמערך
      const updatedDocs = patient.documents.filter((_, i) => i !== index);
      await updatePatient(patient.id, { documents: updatedDocs });
      
      onPatientUpdated();
    } catch (err) {
      alert("שגיאה במחיקת הקובץ: " + err.message);
    }
  };

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
        {/* ... (קוד העריכה נשאר ללא שינוי) ... */}
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
    <div className="space-y-6">
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
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <InfoItem icon={Phone}    label="טלפון"       value={patient.phone} dir="ltr" />
        <InfoItem icon={Mail}     label="מייל"        value={patient.email} dir="ltr" />
        <InfoItem icon={Calendar} label="תאריך לידה"  value={formatDate(patient.birth_date)} />
        <InfoItem icon={MapPin}   label="כתובת"       value={patient.address} />
        <InfoItem icon={User}     label="ת.ז."         value={patient.id_number} dir="ltr" />
      </div>

      {/* Parents & Notes ... (נשאר ללא שינוי) */}
      {(patient.parent1_name || patient.parent2_name) && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
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

      {/* מסמכים */}
      <div className="pt-4 border-t border-gray-100">
        <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-black text-gray-800 flex items-center gap-2">
                <FileText className="w-5 h-5 text-teal-600" />
                מסמכים וקבצים
            </h3>
            <button 
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                className="text-xs font-bold bg-teal-50 text-teal-700 px-3 py-2 rounded-xl hover:bg-teal-100 transition-colors flex items-center gap-2"
            >
                {uploading ? <Spinner size="sm" /> : <Upload className="w-4 h-4" />}
                העלאת מסמך
            </button>
            <input 
                type="file" 
                ref={fileInputRef} 
                className="hidden" 
                onChange={handleFileUpload}
            />
        </div>

        <div className="grid grid-cols-1 gap-2">
            {patient.documents && patient.documents.length > 0 ? (
                patient.documents.map((doc, idx) => (
                    <div key={idx} className="flex items-center justify-between p-3 bg-white border border-gray-100 rounded-2xl hover:shadow-sm transition-all group">
                        <div className="flex items-center gap-3">
                            <div className="p-2 bg-gray-50 rounded-lg">
                                <FileText className="w-4 h-4 text-gray-400" />
                            </div>
                            <div>
                                <p className="text-sm font-bold text-gray-700 truncate max-w-[150px] md:max-w-xs">{doc.name}</p>
                                <p className="text-[10px] text-gray-400">{formatDate(doc.created_at)}</p>
                            </div>
                        </div>
                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <a 
                                href={doc.url} 
                                target="_blank" 
                                rel="noreferrer" 
                                className="p-2 text-teal-600 hover:bg-teal-50 rounded-lg transition-colors"
                                title="צפייה במסמך"
                            >
                                <ExternalLink className="w-4 h-4" />
                            </a>
                            <button 
                                onClick={() => handleDeleteFile(idx, doc.path)}
                                className="p-2 text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                                title="מחיקת מסמך"
                            >
                                <Trash2 className="w-4 h-4" />
                            </button>
                        </div>
                    </div>
                ))
            ) : (
                <div className="text-center py-8 bg-gray-50/50 rounded-[2rem] border-2 border-dashed border-gray-100">
                    <p className="text-xs text-gray-400 font-medium">אין עדיין מסמכים שמורים למטופל זה</p>
                </div>
            )}
        </div>
      </div>

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