import React, { useState, useEffect } from 'react';
import { Upload, Trash2, Eye, AlertCircle, CheckCircle, Loader } from 'lucide-react';
import { getReceiptProfile, saveReceiptProfile, uploadProfileAsset, deleteProfileAsset } from '../../services/receiptProfiles';
import { previewReceiptCall } from '../../services/receipts';

const BUSINESS_TYPES = ['עוסק מורשה', 'עוסק פטור', 'חברה בע"מ', 'עמותה', 'אחר'];

const DEFAULT_PROFILE = {
  businessName: '', businessId: '', businessType: BUSINESS_TYPES[0],
  address: '', phone: '', email: '',
  logoPath: null, logoUrl: null,
  signaturePath: null, signatureUrl: null,
  numbering: { prefix: 'REC-', padLength: 6, yearlyReset: false, next_number: 1, current_year: new Date().getFullYear() },
  pdfStyle: { themeColor: '#2563eb', showSignature: false, footerText: '' },
};

export default function ReceiptProfileForm() {
  const [profile, setProfile] = useState(DEFAULT_PROFILE);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [logoUploading, setLogoUploading] = useState(false);
  const [sigUploading, setSigUploading] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    getReceiptProfile()
      .then(p => { if (p) setProfile({ ...DEFAULT_PROFILE, ...p }); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const set = (path, value) => {
    setProfile(prev => {
      const parts = path.split('.');
      if (parts.length === 1) return { ...prev, [path]: value };
      return { ...prev, [parts[0]]: { ...prev[parts[0]], [parts[1]]: value } };
    });
  };

  const handleSave = async () => {
    if (!profile.businessName.trim()) { setError('שם העסק נדרש'); return; }
    setSaving(true);
    setError('');
    setSaved(false);
    try {
      await saveReceiptProfile(profile);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      setError(err.message || 'שגיאה בשמירה');
    } finally {
      setSaving(false);
    }
  };

  const handleAssetUpload = async (assetType, file, maxMB) => {
    if (!file) return;
    if (file.size > maxMB * 1024 * 1024) { setError(`גודל הקובץ חורג מ-${maxMB}MB`); return; }
    const setter = assetType === 'logo' ? setLogoUploading : setSigUploading;
    setter(true);
    setError('');
    try {
      const { path, url } = await uploadProfileAsset(assetType, file);
      if (assetType === 'logo') {
        if (profile.logoPath) await deleteProfileAsset(profile.logoPath);
        setProfile(p => ({ ...p, logoPath: path, logoUrl: url }));
      } else {
        if (profile.signaturePath) await deleteProfileAsset(profile.signaturePath);
        setProfile(p => ({ ...p, signaturePath: path, signatureUrl: url }));
      }
    } catch (err) {
      setError(err.message || 'שגיאה בהעלאה');
    } finally {
      setter(false);
    }
  };

  const handleDeleteAsset = async (assetType) => {
    const pathKey = assetType === 'logo' ? 'logoPath' : 'signaturePath';
    await deleteProfileAsset(profile[pathKey]);
    setProfile(p => ({ ...p, [pathKey]: null, [`${assetType}Url`]: null }));
  };

  const handlePreview = async () => {
    setPreviewing(true);
    setError('');
    try {
      const { pdfBase64 } = await previewReceiptCall();
      const dataUrl = `data:application/pdf;base64,${pdfBase64}`;
      window.open(dataUrl, '_blank');
    } catch (err) {
      setError(err.message || 'שגיאה בתצוגה מקדימה');
    } finally {
      setPreviewing(false);
    }
  };

  if (loading) return <div className="flex justify-center py-8"><Loader className="animate-spin text-gray-400" size={24} /></div>;

  return (
    <div className="space-y-6 max-w-2xl" dir="rtl">
      {error && (
        <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-lg">
          <AlertCircle size={16} className="text-red-600 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}
      {saved && (
        <div className="flex items-center gap-2 p-3 bg-green-50 border border-green-200 rounded-lg">
          <CheckCircle size={16} className="text-green-600" />
          <p className="text-sm text-green-700">הפרופיל נשמר בהצלחה</p>
        </div>
      )}

      {/* Business details */}
      <section>
        <h3 className="text-sm font-semibold text-gray-700 mb-3 border-b pb-2">פרטי עסק</h3>
        <div className="grid grid-cols-2 gap-4">
          <div className="col-span-2">
            <label className="block text-sm font-medium text-gray-700 mb-1">שם העסק <span className="text-red-500">*</span></label>
            <input type="text" value={profile.businessName} onChange={e => set('businessName', e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-right" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">ח.פ / ע.מ</label>
            <input type="text" value={profile.businessId} onChange={e => set('businessId', e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-right" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">סוג עסק</label>
            <select value={profile.businessType} onChange={e => set('businessType', e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-right">
              {BUSINESS_TYPES.map(t => <option key={t}>{t}</option>)}
            </select>
          </div>
          <div className="col-span-2">
            <label className="block text-sm font-medium text-gray-700 mb-1">כתובת</label>
            <input type="text" value={profile.address} onChange={e => set('address', e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-right" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">טלפון</label>
            <input type="tel" value={profile.phone} onChange={e => set('phone', e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-right" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">אימייל</label>
            <input type="email" value={profile.email} onChange={e => set('email', e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2" />
          </div>
        </div>
      </section>

      {/* Logo + Signature */}
      <section>
        <h3 className="text-sm font-semibold text-gray-700 mb-3 border-b pb-2">לוגו וחתימה</h3>
        <div className="grid grid-cols-2 gap-4">
          {[
            { key: 'logo',      label: 'לוגו',    urlKey: 'logoUrl',      uploading: logoUploading, maxMB: 2 },
            { key: 'signature', label: 'חתימה',   urlKey: 'signatureUrl', uploading: sigUploading,  maxMB: 1 },
          ].map(({ key, label, urlKey, uploading, maxMB }) => (
            <div key={key}>
              <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
              {profile[urlKey] ? (
                <div className="relative inline-block">
                  <img src={profile[urlKey]} alt={label} className="h-16 w-auto border border-gray-200 rounded" />
                  <button onClick={() => handleDeleteAsset(key)}
                    className="absolute -top-2 -left-2 bg-white rounded-full border border-gray-300 p-0.5 text-red-500 hover:text-red-700">
                    <Trash2 size={12} />
                  </button>
                </div>
              ) : (
                <label className={`flex items-center gap-2 cursor-pointer border border-dashed border-gray-300 rounded-lg px-3 py-2 hover:bg-gray-50 ${uploading ? 'opacity-50 pointer-events-none' : ''}`}>
                  {uploading ? <Loader size={14} className="animate-spin text-gray-400" /> : <Upload size={14} className="text-gray-400" />}
                  <span className="text-xs text-gray-500">{uploading ? 'מעלה...' : `העלה ${label}`}</span>
                  <input type="file" accept="image/*" className="hidden" onChange={e => handleAssetUpload(key, e.target.files?.[0], maxMB)} />
                </label>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* Numbering */}
      <section>
        <h3 className="text-sm font-semibold text-gray-700 mb-3 border-b pb-2">מספור קבלות</h3>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">קידומת</label>
            <input type="text" value={profile.numbering?.prefix || ''} onChange={e => set('numbering.prefix', e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-right" placeholder="REC-" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">אורך ספרות (4–8)</label>
            <input type="number" min={4} max={8} value={profile.numbering?.padLength || 6} onChange={e => set('numbering.padLength', Number(e.target.value))}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-right" />
          </div>
          <div className="col-span-2">
            <label className="flex items-center gap-3 cursor-pointer">
              <input type="checkbox" checked={profile.numbering?.yearlyReset || false} onChange={e => set('numbering.yearlyReset', e.target.checked)} />
              <span className="text-sm text-gray-700">איפוס מספור שנתי (המספור מתחיל מ-1 בכל שנה)</span>
            </label>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">המספר הבא</label>
            <input type="text" readOnly value={profile.numbering?.next_number || 1}
              className="w-full border border-gray-100 rounded-lg px-3 py-2 bg-gray-50 text-gray-500 text-right" />
          </div>
        </div>
      </section>

      {/* PDF Style */}
      <section>
        <h3 className="text-sm font-semibold text-gray-700 mb-3 border-b pb-2">עיצוב PDF</h3>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">צבע ראשי</label>
            <div className="flex items-center gap-2">
              <input type="color" value={profile.pdfStyle?.themeColor || '#2563eb'} onChange={e => set('pdfStyle.themeColor', e.target.value)}
                className="h-9 w-16 border border-gray-300 rounded cursor-pointer" />
              <span className="text-sm text-gray-500 font-mono">{profile.pdfStyle?.themeColor || '#2563eb'}</span>
            </div>
          </div>
          <div className="flex items-center">
            <label className="flex items-center gap-3 cursor-pointer mt-4">
              <input type="checkbox" checked={profile.pdfStyle?.showSignature || false} onChange={e => set('pdfStyle.showSignature', e.target.checked)} />
              <span className="text-sm text-gray-700">הצג חתימה ב-PDF</span>
            </label>
          </div>
          <div className="col-span-2">
            <label className="block text-sm font-medium text-gray-700 mb-1">טקסט כותרת תחתונה</label>
            <input type="text" value={profile.pdfStyle?.footerText || ''} onChange={e => set('pdfStyle.footerText', e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-right"
              placeholder="לדוגמה: תשלום בהתאם לחשבונית..." />
          </div>
        </div>
      </section>

      {/* Action buttons */}
      <div className="flex gap-3 pt-2">
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex-1 py-2.5 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50 transition"
        >
          {saving ? 'שומר...' : 'שמור פרופיל'}
        </button>
        <button
          onClick={handlePreview}
          disabled={previewing || saving}
          className="inline-flex items-center gap-2 px-4 py-2.5 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 disabled:opacity-50 transition"
        >
          {previewing ? <Loader size={14} className="animate-spin" /> : <Eye size={14} />}
          תצוגה מקדימה
        </button>
      </div>
    </div>
  );
}
