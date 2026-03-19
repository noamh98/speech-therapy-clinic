// src/pages/PatientProfile/PatientDetails.jsx — Multi-tenant patient details with security
import { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { updatePatient, deletePatient } from '../../services/patients';
import { uploadPatientFile, deletePatientFile } from '../../services/storage';
import { ConfirmDialog, Spinner } from '../../components/ui';
import { 
  Phone, Mail, MapPin, Calendar, User, Pencil, 
  Trash2, FileText, Upload, Download, ExternalLink, X, AlertCircle
} from 'lucide-react';
import { formatDate } from '../../utils/formatters';

export default function PatientDetails({ patient, onPatientUpdated }) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const fileInputRef = useRef(null);
  const [editing, setEditing] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [form, setForm] = useState({ ...patient });
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');

  // ═══════════════════════════════════════════════════════════════════════════
  // MULTI-TENANCY SECURITY: Verify patient belongs to current user
  // ═══════════════════════════════════════════════════════════════════════════
  if (!user?.uid) {
    return (
      <div className="flex items-start gap-3 p-4 bg-red-50 border border-red-200 rounded-lg">
        <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
        <p className="text-sm text-red-700">User not authenticated</p>
      </div>
    );
  }

  if (patient.ownerId !== user.uid) {
    return (
      <div className="flex items-start gap-3 p-4 bg-red-50 border border-red-200 rounded-lg">
        <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
        <p className="text-sm text-red-700">Access denied: patient does not belong to you</p>
      </div>
    );
  }

  // Upload patient file
  const handleFileUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    setError('');
    try {
      const fileData = await uploadPatientFile(patient.id, file);
      
      const updatedDocs = [...(patient.documents || []), fileData];
      await updatePatient(patient.id, { documents: updatedDocs });
      
      onPatientUpdated();
    } catch (err) {
      setError(err.message || 'Failed to upload file');
      console.error('[PatientDetails] Upload error:', err);
    } finally {
      setUploading(false);
    }
  };

  // Delete patient file
  const handleDeleteFile = async (index, filePath) => {
    if (!window.confirm('האם אתה בטוח שברצונך למחוק את הקובץ?')) return;

    try {
      setError('');
      
      // SECURITY: Verify file belongs to current user's patient
      if (filePath && !filePath.includes(patient.id)) {
        throw new Error('Access denied: file does not belong to this patient');
      }

      // Delete from Storage
      if (filePath) {
        await deletePatientFile(filePath);
      }

      // Update Firestore
      const updatedDocs = patient.documents.filter((_, i) => i !== index);
      await updatePatient(patient.id, { documents: updatedDocs });
      
      onPatientUpdated();
    } catch (err) {
      setError(err.message || 'Failed to delete file');
      console.error('[PatientDetails] Delete file error:', err);
    }
  };

  // Save patient details
  const handleSave = async () => {
    setSaving(true);
    setError('');
    try {
      // SECURITY: Ensure ownerId is not changed
      const { ownerId, ...safeData } = form;
      
      await updatePatient(patient.id, safeData);
      onPatientUpdated();
      setEditing(false);
    } catch (err) {
      setError(err.message || 'Failed to save patient');
      console.error('[PatientDetails] Save error:', err);
    } finally {
      setSaving(false);
    }
  };

  // Delete patient
  const handleDelete = async () => {
    try {
      setError('');
      
      // SECURITY: Verify patient belongs to current user before deletion
      if (patient.ownerId !== user.uid) {
        throw new Error('Access denied: patient does not belong to you');
      }
      
      await deletePatient(patient.id);
      navigate('/patients');
    } catch (err) {
      setError(err.message || 'Failed to delete patient');
      console.error('[PatientDetails] Delete error:', err);
    }
  };

  const set = k => e => setForm(f => ({ ...f, [k]: e.target.value }));

  return (
    <div className="space-y-4">
      {/* Error Message */}
      {error && (
        <div className="flex items-start gap-3 p-3 bg-red-50 border border-red-200 rounded-lg">
          <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-gray-900">פרטי המטופל</h2>
        <div className="flex items-center gap-2">
          {!editing ? (
            <>
              <button
                onClick={() => setEditing(true)}
                className="flex items-center gap-2 px-3 py-1.5 text-sm bg-blue-100 text-blue-700 rounded-lg hover:bg-blue-200 font-medium transition-colors"
              >
                <Pencil className="w-4 h-4" />
                עריכה
              </button>
              <button
                onClick={() => setDeleteOpen(true)}
                className="flex items-center gap-2 px-3 py-1.5 text-sm bg-red-100 text-red-700 rounded-lg hover:bg-red-200 font-medium transition-colors"
              >
                <Trash2 className="w-4 h-4" />
                מחיקה
              </button>
            </>
          ) : (
            <>
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex items-center gap-2 px-3 py-1.5 text-sm bg-green-100 text-green-700 rounded-lg hover:bg-green-200 font-medium transition-colors disabled:opacity-50"
              >
                {saving ? <Spinner className="w-4 h-4" /> : '✓'}
                שמור
              </button>
              <button
                onClick={() => {
                  setEditing(false);
                  setForm({ ...patient });
                }}
                disabled={saving}
                className="flex items-center gap-2 px-3 py-1.5 text-sm bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 font-medium transition-colors disabled:opacity-50"
              >
                ביטול
              </button>
            </>
          )}
        </div>
      </div>

      {/* Patient Info */}
      <div className="bg-white rounded-lg border p-4 space-y-3">
        {/* Full Name */}
        <div>
          <label className="text-xs font-semibold text-gray-600">שם מלא</label>
          <input
            type="text"
            value={form.full_name || ''}
            onChange={set('full_name')}
            disabled={!editing}
            className="w-full mt-1 px-3 py-2 border border-gray-200 rounded-lg text-sm disabled:bg-gray-50"
          />
        </div>

        {/* Phone */}
        <div>
          <label className="text-xs font-semibold text-gray-600 flex items-center gap-1">
            <Phone className="w-3.5 h-3.5" />
            טלפון
          </label>
          <input
            type="tel"
            value={form.phone || ''}
            onChange={set('phone')}
            disabled={!editing}
            className="w-full mt-1 px-3 py-2 border border-gray-200 rounded-lg text-sm disabled:bg-gray-50"
          />
        </div>

        {/* Email */}
        <div>
          <label className="text-xs font-semibold text-gray-600 flex items-center gap-1">
            <Mail className="w-3.5 h-3.5" />
            דוא"ל
          </label>
          <input
            type="email"
            value={form.email || ''}
            onChange={set('email')}
            disabled={!editing}
            className="w-full mt-1 px-3 py-2 border border-gray-200 rounded-lg text-sm disabled:bg-gray-50"
          />
        </div>

        {/* Address */}
        <div>
          <label className="text-xs font-semibold text-gray-600 flex items-center gap-1">
            <MapPin className="w-3.5 h-3.5" />
            כתובת
          </label>
          <input
            type="text"
            value={form.address || ''}
            onChange={set('address')}
            disabled={!editing}
            className="w-full mt-1 px-3 py-2 border border-gray-200 rounded-lg text-sm disabled:bg-gray-50"
          />
        </div>

        {/* Date of Birth */}
        <div>
          <label className="text-xs font-semibold text-gray-600 flex items-center gap-1">
            <Calendar className="w-3.5 h-3.5" />
            תאריך לידה
          </label>
          <input
            type="date"
            value={form.date_of_birth || ''}
            onChange={set('date_of_birth')}
            disabled={!editing}
            className="w-full mt-1 px-3 py-2 border border-gray-200 rounded-lg text-sm disabled:bg-gray-50"
          />
        </div>

        {/* Status */}
        <div>
          <label className="text-xs font-semibold text-gray-600 flex items-center gap-1">
            <User className="w-3.5 h-3.5" />
            סטטוס
          </label>
          <select
            value={form.status || 'active'}
            onChange={set('status')}
            disabled={!editing}
            className="w-full mt-1 px-3 py-2 border border-gray-200 rounded-lg text-sm disabled:bg-gray-50"
          >
            <option value="active">פעיל</option>
            <option value="inactive">לא פעיל</option>
            <option value="archived">בארכיון</option>
          </select>
        </div>

        {/* Notes */}
        <div>
          <label className="text-xs font-semibold text-gray-600">הערות</label>
          <textarea
            value={form.notes || ''}
            onChange={set('notes')}
            disabled={!editing}
            rows="3"
            className="w-full mt-1 px-3 py-2 border border-gray-200 rounded-lg text-sm disabled:bg-gray-50 resize-none"
          />
        </div>
      </div>

      {/* Documents Section */}
      <div className="bg-white rounded-lg border p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-bold text-gray-900 flex items-center gap-2">
            <FileText className="w-4 h-4 text-blue-600" />
            קבצים
          </h3>
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="flex items-center gap-1.5 text-xs px-2 py-1 bg-blue-100 text-blue-700 rounded hover:bg-blue-200 font-medium transition-colors disabled:opacity-50"
          >
            <Upload className="w-3.5 h-3.5" />
            {uploading ? 'מעלה...' : 'העלה קובץ'}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            onChange={handleFileUpload}
            disabled={uploading}
            className="hidden"
          />
        </div>

        {patient.documents && patient.documents.length > 0 ? (
          <div className="space-y-2">
            {patient.documents.map((doc, idx) => (
              <div key={idx} className="flex items-center justify-between p-2 bg-gray-50 rounded-lg">
                <div className="flex items-center gap-2 min-w-0">
                  <FileText className="w-4 h-4 text-gray-400 flex-shrink-0" />
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-gray-900 truncate">{doc.filename}</p>
                    <p className="text-[10px] text-gray-500">{(doc.size / 1024).toFixed(2)} KB</p>
                  </div>
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  {doc.url && (
                    <a
                      href={doc.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="p-1 text-blue-600 hover:bg-blue-50 rounded transition-colors"
                      title="הורד"
                    >
                      <Download className="w-3.5 h-3.5" />
                    </a>
                  )}
                  <button
                    onClick={() => handleDeleteFile(idx, doc.path)}
                    className="p-1 text-red-600 hover:bg-red-50 rounded transition-colors"
                    title="מחק"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-xs text-gray-500 text-center py-4">אין קבצים</p>
        )}
      </div>

      {/* Delete Confirmation Dialog */}
      <ConfirmDialog
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        onConfirm={handleDelete}
        title="מחיקת מטופל"
        message="האם אתה בטוח שברצונך למחוק את המטופל? פעולה זו לא ניתנת לביטול."
        confirmLabel="מחק"
        danger
      />
    </div>
  );
}
