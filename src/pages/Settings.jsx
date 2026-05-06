import { useState, useEffect } from 'react';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '../services/firebase';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { PageHeader, Card, Skeleton } from '../components/ui';
import { Settings as SettingsIcon, User, Building2, Loader2, Receipt } from 'lucide-react';
import ReceiptProfileForm from '../components/receipts/ReceiptProfileForm';

const TABS = [
  { id: 'general', label: 'כללי',   icon: SettingsIcon },
  { id: 'receipts', label: 'קבלות', icon: Receipt },
];

export default function Settings() {
  const { user, profile } = useAuth();
  const { showToast } = useToast();
  const [activeTab, setActiveTab] = useState('general');

  const [clinic, setClinic] = useState({
    clinic_name: '',
    phone: '',
    address: '',
  });
  const [personal, setPersonal] = useState({ name: '' });
  const [saving, setSaving] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (profile) {
      setClinic({
        clinic_name: profile.clinic_name || '',
        phone:       profile.phone       || '',
        address:     profile.address     || '',
      });
      setPersonal({ name: profile.name || '' });
      setReady(true);
    }
  }, [profile]);

  async function handleSave(e) {
    e.preventDefault();
    if (!user) return;
    setSaving(true);
    try {
      await updateDoc(doc(db, 'users', user.uid), {
        ...clinic,
        name: personal.name,
      });
      showToast('ההגדרות נשמרו בהצלחה', 'success');
    } catch (err) {
      console.error(err);
      showToast('שגיאה בשמירת ההגדרות', 'error');
    } finally {
      setSaving(false);
    }
  }

  if (!ready) {
    return (
      <div className="space-y-6 max-w-2xl">
        <Skeleton className="h-10 w-40" />
        <Skeleton className="h-48" />
        <Skeleton className="h-32" />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <PageHeader title="הגדרות" />

      {/* Tab bar */}
      <div className="flex border-b border-gray-200 gap-1" dir="rtl">
        {TABS.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px ${
              activeTab === tab.id
                ? 'border-blue-600 text-blue-700'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            <tab.icon className="w-4 h-4" />
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'general' && (
        <form onSubmit={handleSave} className="space-y-5">

          {/* ─── Clinic details ─── */}
          <Card>
            <h3 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
              <Building2 className="w-4 h-4 text-blue-600" /> פרטי קליניקה
            </h3>
            <div className="space-y-3">
              <div>
                <label className="label">שם הקליניקה</label>
                <input
                  className="input"
                  value={clinic.clinic_name}
                  onChange={e => setClinic(p => ({ ...p, clinic_name: e.target.value }))}
                  placeholder="קליניקת תקשורת"
                />
              </div>
              <div>
                <label className="label">טלפון</label>
                <input
                  className="input"
                  type="tel"
                  dir="ltr"
                  value={clinic.phone}
                  onChange={e => setClinic(p => ({ ...p, phone: e.target.value }))}
                  placeholder="050-0000000"
                />
              </div>
              <div>
                <label className="label">כתובת</label>
                <input
                  className="input"
                  value={clinic.address}
                  onChange={e => setClinic(p => ({ ...p, address: e.target.value }))}
                  placeholder="רחוב, עיר"
                />
              </div>
            </div>
          </Card>

          {/* ─── Personal details ─── */}
          <Card>
            <h3 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
              <User className="w-4 h-4 text-blue-600" /> פרטי משתמש
            </h3>
            <div className="space-y-3">
              <div>
                <label className="label">שם מלא</label>
                <input
                  className="input"
                  value={personal.name}
                  onChange={e => setPersonal({ name: e.target.value })}
                  placeholder="שם מלא"
                />
              </div>
              <div>
                <label className="label">אימייל</label>
                <input className="input bg-gray-50 cursor-not-allowed" value={user?.email || ''} readOnly dir="ltr" />
              </div>
              <div>
                <label className="label">תפקיד</label>
                <input
                  className="input bg-gray-50 cursor-not-allowed"
                  value={profile?.role === 'admin' ? 'מנהל' : 'קלינאית'}
                  readOnly
                />
              </div>
            </div>
          </Card>

          <button
            type="submit"
            disabled={saving}
            className="btn-primary w-full py-3 flex items-center justify-center gap-2"
          >
            {saving
              ? <><Loader2 className="w-4 h-4 animate-spin" /> שומר...</>
              : <><SettingsIcon className="w-4 h-4" /> שמור הגדרות</>
            }
          </button>
        </form>
      )}

      {activeTab === 'receipts' && (
        <ReceiptProfileForm />
      )}
    </div>
  );
}
