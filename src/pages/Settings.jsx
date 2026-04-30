import { useState, useEffect } from 'react';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '../services/firebase';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { PageHeader, Card, Skeleton } from '../components/ui';
import { Settings as SettingsIcon, User, Building2, Loader2 } from 'lucide-react';

export default function Settings() {
  const { user, profile } = useAuth();
  const { showToast } = useToast();

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
    </div>
  );
}
