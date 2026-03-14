// src/pages/Settings.jsx
import { PageHeader, Card } from '../components/ui';
import { useAuth } from '../context/AuthContext';
import { Settings as SettingsIcon } from 'lucide-react';

export default function Settings() {
  const { user, profile } = useAuth();
  return (
    <div className="space-y-6">
      <PageHeader title="הגדרות" />
      <Card>
        <h3 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
          <SettingsIcon className="w-4 h-4" /> פרטי קליניקה
        </h3>
        <div className="space-y-3">
          <div>
            <label className="label">שם הקליניקה</label>
            <input className="input" placeholder="קליניקת תקשורת" />
          </div>
          <div>
            <label className="label">טלפון</label>
            <input className="input" type="tel" dir="ltr" />
          </div>
          <div>
            <label className="label">כתובת</label>
            <input className="input" />
          </div>
          <button className="btn-primary">שמור הגדרות</button>
        </div>
      </Card>
      <Card>
        <h3 className="font-semibold text-gray-900 mb-3">פרטי משתמש</h3>
        <p className="text-sm text-gray-600">מחובר כ: <strong>{user?.email}</strong></p>
        <p className="text-sm text-gray-600 mt-1">תפקיד: <strong>{profile?.role === 'admin' ? 'מנהל' : 'קלינאית'}</strong></p>
      </Card>
    </div>
  );
}
