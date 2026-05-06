// src/pages/PatientPortal.jsx
// Accessible at /portal/:patientId
// Requires portal_access_enabled: true on the patient record

import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { getPatient } from '../services/patients';
import { getPatientTreatments } from '../services/treatments';
import { getPatientAppointments } from '../services/appointments';
import { Spinner, Badge } from '../components/ui';
import { formatDate, formatCurrency, localDateStr, APPOINTMENT_STATUSES } from '../utils/formatters';
import { Stethoscope, Calendar, ClipboardList } from 'lucide-react';

export default function PatientPortal() {
  const { patientId } = useParams();
  const [patient, setPatient] = useState(null);
  const [treatments, setTreatments] = useState([]);
  const [appointments, setAppointments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // FIX: localDateStr() — timezone-safe. toISOString() returns yesterday before
  // 02:00/03:00 AM local time in Israel, causing upcoming appointments on the
  // real today to be excluded from the portal's "תורים קרובים" list.
  const today = localDateStr();

  useEffect(() => { load(); }, [patientId]);

  async function load() {
    setLoading(true);
    try {
      const p = await getPatient(patientId);
      if (!p.portal_access_enabled) {
        setError('גישה לפורטל אינה מאופשרת עבור מטופל זה');
        return;
      }
      setPatient(p);
      const [t, a] = await Promise.all([
        getPatientTreatments(patientId),
        getPatientAppointments(patientId),
      ]);
      setTreatments(t);
      setAppointments(a);
    } catch {
      setError('לא נמצא מטופל');
    } finally { setLoading(false); }
  }

  const upcoming = appointments.filter(a => a.date >= today && a.status === 'scheduled');
  const totalPaid = treatments.filter(t => t.payment_status === 'paid').reduce((s, t) => s + (Number(t.amount) || 0), 0);

  if (loading) return <div className="flex items-center justify-center h-screen"><Spinner size="lg" /></div>;

  if (error) return (
    <div className="flex items-center justify-center h-screen flex-col gap-2 text-gray-500">
      <Stethoscope className="w-12 h-12" />
      <p className="text-lg font-semibold">{error}</p>
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-50 p-4 max-w-2xl mx-auto" dir="rtl">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-teal-500 to-blue-600 flex items-center justify-center">
          <Stethoscope className="w-6 h-6 text-white" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-gray-900">פורטל מטופלים</h1>
          <p className="text-sm text-gray-500">{patient.full_name}</p>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3 mb-6">
        <div className="bg-white rounded-xl p-3 text-center shadow-sm">
          <p className="text-2xl font-bold text-teal-700">{treatments.length}</p>
          <p className="text-xs text-gray-400">טיפולים</p>
        </div>
        <div className="bg-white rounded-xl p-3 text-center shadow-sm">
          <p className="text-xl font-bold text-green-700">{formatCurrency(totalPaid)}</p>
          <p className="text-xs text-gray-400">שולם</p>
        </div>
        <div className="bg-white rounded-xl p-3 text-center shadow-sm">
          <p className="text-2xl font-bold text-blue-700">{upcoming.length}</p>
          <p className="text-xs text-gray-400">תורים קרובים</p>
        </div>
      </div>

      {/* Upcoming appointments */}
      {upcoming.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm p-4 mb-4">
          <h2 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
            <Calendar className="w-4 h-4 text-blue-600" /> תורים קרובים
          </h2>
          <div className="space-y-2">
            {upcoming.slice(0, 3).map(a => (
              <div key={a.id} className="flex items-center justify-between p-2 bg-blue-50 rounded-lg">
                <span className="text-sm font-medium">{formatDate(a.date)}</span>
                <span className="text-sm text-gray-500">{a.start_time}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recent treatments (read-only, no amount) */}
      <div className="bg-white rounded-xl shadow-sm p-4">
        <h2 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
          <ClipboardList className="w-4 h-4 text-teal-600" /> טיפולים אחרונים
        </h2>
        <div className="space-y-2">
          {treatments.slice(0, 10).map(t => (
            <div key={t.id} className="flex items-center justify-between p-2 border border-gray-100 rounded-lg">
              <div>
                <p className="text-sm font-medium">טיפול {t.treatment_number}</p>
                <p className="text-xs text-gray-400">{formatDate(t.date)}</p>
              </div>
              {t.description && <p className="text-xs text-gray-500 max-w-32 text-left truncate">{t.description}</p>}
            </div>
          ))}
          {treatments.length === 0 && <p className="text-sm text-gray-400 text-center py-4">אין טיפולים רשומים</p>}
        </div>
      </div>
    </div>
  );
}
