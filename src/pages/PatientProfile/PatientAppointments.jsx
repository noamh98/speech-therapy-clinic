// src/pages/PatientProfile/PatientAppointments.jsx
import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { getPatientAppointments } from '../../services/appointments';
import { Badge, EmptyState, Spinner } from '../../components/ui';
import { Calendar, Plus } from 'lucide-react';
import { formatDate, APPOINTMENT_STATUSES } from '../../utils/formatters';

export default function PatientAppointments({ patient }) {
  const [appointments, setAppointments] = useState([]);
  const [loading, setLoading] = useState(true);

  const today = new Date().toISOString().slice(0, 10);

  useEffect(() => {
    load();
  }, [patient.id]);

  async function load() {
    setLoading(true);
    try {
      const a = await getPatientAppointments(patient.id);
      setAppointments(a);
    } finally { setLoading(false); }
  }

  const upcoming = appointments.filter(a => a.date >= today && a.status === 'scheduled');
  const past = appointments.filter(a => a.date < today || a.status !== 'scheduled');

  if (loading) return <div className="flex justify-center py-8"><Spinner /></div>;

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Link to="/calendar" className="btn-primary flex items-center gap-2 text-sm">
          <Plus className="w-4 h-4" /> קבע תור
        </Link>
      </div>

      {appointments.length === 0 ? (
        <EmptyState icon={Calendar} title="אין פגישות" description="קבע תור ראשון דרך היומן" />
      ) : (
        <>
          {upcoming.length > 0 && (
            <div>
              <p className="text-sm font-semibold text-gray-700 mb-2">תורים עתידיים</p>
              <div className="space-y-2">
                {upcoming.map(a => <AppointmentRow key={a.id} a={a} />)}
              </div>
            </div>
          )}
          {past.length > 0 && (
            <div>
              <p className="text-sm font-semibold text-gray-700 mb-2">היסטוריית פגישות</p>
              <div className="space-y-2">
                {past.map(a => <AppointmentRow key={a.id} a={a} />)}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function AppointmentRow({ a }) {
  const statusInfo = APPOINTMENT_STATUSES[a.status] || APPOINTMENT_STATUSES.scheduled;
  const colorMap = {
    'bg-blue-100 text-blue-800': 'blue',
    'bg-green-100 text-green-800': 'green',
    'bg-red-100 text-red-800': 'red',
    'bg-orange-100 text-orange-800': 'orange',
  };
  const badgeColor = colorMap[statusInfo.color] || 'gray';

  return (
    <div className="flex items-center gap-3 p-3 border border-gray-100 rounded-xl">
      <div className="text-center flex-shrink-0 w-16">
        <p className="text-sm font-bold text-gray-900">{formatDate(a.date)}</p>
        <p className="text-xs text-gray-400">{a.start_time || ''}</p>
      </div>
      <div className="flex-1">
        {a.notes && <p className="text-xs text-gray-500">{a.notes}</p>}
        {a.cancel_reason && <p className="text-xs text-red-400">סיבת ביטול: {a.cancel_reason}</p>}
      </div>
      <Badge color={badgeColor}>{statusInfo.label}</Badge>
    </div>
  );
}
