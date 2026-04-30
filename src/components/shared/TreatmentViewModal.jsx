// src/components/shared/TreatmentViewModal.jsx — Read-only treatment viewer
import { Modal } from '../ui';
import { Pencil, FileText } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { CLINICAL_DOMAINS, COOPERATION_LEVELS, PROGRESS_RATINGS } from '../../utils/formatters';
import { generateTreatmentPDF } from '../../utils/generateTreatmentPDF';

// ─── Label helpers ────────────────────────────────────────────────────────────
function domainLabel(val) {
  return CLINICAL_DOMAINS.find(d => d.value === val)?.label || val;
}
function coopLabel(val) {
  if (val == null || val === '') return null;
  return COOPERATION_LEVELS.find(c => c.value === Number(val))?.label || String(val);
}
function progressLabel(val) {
  if (!val) return null;
  const found = PROGRESS_RATINGS.find(p => p.value === val);
  return found?.label?.replace('— ', '') || val;
}

// ─── Section heading ──────────────────────────────────────────────────────────
function SectionLabel({ children }) {
  return (
    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5">
      {children}
    </p>
  );
}

// ─── Read-only text block ─────────────────────────────────────────────────────
function TextBlock({ children }) {
  if (!children) return <p className="text-sm text-gray-400 italic">לא הוזן</p>;
  return (
    <div className="bg-gray-50 border border-gray-100 rounded-xl px-4 py-3 text-sm text-gray-800 leading-relaxed whitespace-pre-wrap">
      {children}
    </div>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────
export default function TreatmentViewModal({ open, onClose, treatment, patient, onEdit }) {
  const { profile } = useAuth();

  if (!treatment) return null;
  const t = treatment;

  const domains = Array.isArray(t.clinicalDomain)
    ? t.clinicalDomain.map(domainLabel)
    : [];
  const domainOther = t.clinicalDomainOther || '';
  const coop        = coopLabel(t.cooperationLevel);
  const progress    = progressLabel(t.progressRating);
  const hasFiles    = Array.isArray(t.files) && t.files.length > 0;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`טיפול #${t.treatment_number || '—'} — צפייה בלבד`}
      maxWidth="max-w-2xl"
    >
      <div className="space-y-5" dir="rtl">

        {/* ─── Patient + date bar ─── */}
        <div className="bg-teal-50 rounded-xl px-4 py-3 border border-teal-100 flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm font-bold text-teal-800">
            מטופל/ת: {patient?.full_name || '—'}
          </p>
          <div className="flex items-center gap-4 text-sm text-teal-700">
            <span>תאריך: <strong>{t.date || '—'}</strong></span>
            <span>טיפול מס׳ <strong>{t.treatment_number || '—'}</strong></span>
          </div>
        </div>

        {/* ─── Clinical summary chips ─── */}
        {(domains.length > 0 || coop || progress) && (
          <div className="grid grid-cols-3 gap-3">

            {domains.length > 0 && (
              <div className="bg-blue-50 rounded-xl p-3 border border-blue-100 col-span-1">
                <SectionLabel>תחום טיפול</SectionLabel>
                <div className="flex flex-wrap gap-1">
                  {domains.map(d => (
                    <span key={d} className="text-xs bg-blue-100 text-blue-800 px-2 py-0.5 rounded-full font-medium">
                      {d}
                    </span>
                  ))}
                  {domainOther && (
                    <span className="text-xs bg-blue-100 text-blue-800 px-2 py-0.5 rounded-full font-medium">
                      {domainOther}
                    </span>
                  )}
                </div>
              </div>
            )}

            {coop && (
              <div className="bg-purple-50 rounded-xl p-3 border border-purple-100">
                <SectionLabel>שיתוף פעולה</SectionLabel>
                <p className="text-sm font-bold text-purple-900">{coop}</p>
              </div>
            )}

            {progress && (
              <div className="bg-green-50 rounded-xl p-3 border border-green-100">
                <SectionLabel>התקדמות</SectionLabel>
                <p className="text-sm font-bold text-green-900">{progress}</p>
              </div>
            )}

          </div>
        )}

        {/* ─── Text fields ─── */}
        <div>
          <SectionLabel>מטרות הטיפול</SectionLabel>
          <TextBlock>{t.goals}</TextBlock>
        </div>

        <div>
          <SectionLabel>תיאור הטיפול</SectionLabel>
          <TextBlock>{t.description}</TextBlock>
        </div>

        <div>
          <SectionLabel>התקדמות והערות</SectionLabel>
          <TextBlock>{t.progress}</TextBlock>
        </div>

        {/* ─── Attached files ─── */}
        {hasFiles && (
          <div>
            <SectionLabel>קבצים מצורפים</SectionLabel>
            <div className="space-y-1.5">
              {t.files.map((f, i) => (
                <a
                  key={i}
                  href={f.url}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-2 px-3 py-2 bg-blue-50 border border-blue-100 rounded-lg text-sm text-blue-700 hover:bg-blue-100 transition-colors"
                >
                  <FileText className="w-4 h-4 flex-shrink-0" />
                  <span className="truncate">{f.name || f.filename || `קובץ ${i + 1}`}</span>
                </a>
              ))}
            </div>
          </div>
        )}

        {/* ─── Actions ─── */}
        <div className="flex gap-3 pt-2 border-t border-gray-100">
          <button
            type="button"
            onClick={() => generateTreatmentPDF({ treatment: t, patient, clinicName: profile?.clinic_name })}
            className="flex items-center gap-1.5 text-sm font-medium px-4 py-2.5 rounded-xl border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors flex-shrink-0"
          >
            <FileText className="w-4 h-4" /> PDF
          </button>

          <button
            type="button"
            className="btn-secondary flex-1 py-2.5"
            onClick={onClose}
          >
            סגור
          </button>

          {onEdit && (
            <button
              type="button"
              className="btn-primary flex-1 py-2.5 flex items-center justify-center gap-2"
              onClick={onEdit}
            >
              <Pencil className="w-4 h-4" /> ערוך תיעוד
            </button>
          )}
        </div>

      </div>
    </Modal>
  );
}
