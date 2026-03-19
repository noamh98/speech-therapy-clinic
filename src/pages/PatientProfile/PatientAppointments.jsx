// src/pages/PatientProfile/PatientAppointments.jsx
/**
 * FIXES APPLIED:
 *
 * 1. FIELD NAME MISMATCH — treatment_id vs treatmentId:
 *    AppointmentRow checked `a.treatment_id` for icon color and title.
 *    TreatmentDialog was passed `treatmentId={selectedAppt?.treatment_id}`
 *    and `treatment={selectedAppt?.treatment_id ? {...} : null}`.
 *    Since Firestore stores the field as `treatmentId` (camelCase),
 *    `treatment_id` was always undefined — the edit pencil never appeared
 *    and TreatmentDialog always opened in create-mode.
 *    FIX: All `treatment_id` → `treatmentId` throughout.
 *
 * 2. UTC DATE OFFSET:
 *    `today` used `toISOString().slice(0,10)` — UTC-based.
 *    FIX: Use `localDateStr(new Date())`.
 */

import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { getPatientAppointments } from '../../services/appointments';
import { Badge, EmptyState, Spinner } from '../../components/ui';
import { Calendar, Plus, Pencil, FileText, Clock } from 'lucide-react';
import { formatDate, localDateStr, APPOINTMENT_STATUSES } from '../../utils/formatters';
import TreatmentDialog from '../../components/shared/TreatmentDialog';

export default function PatientAppointments({ patient }) {
  const [appointments, setAppointments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [treatmentDialogOpen, setTreatmentDialogOpen] = useState(false);
  const [selectedAppt, setSelectedAppt] = useState(null);

  // FIX #2: localDateStr avoids UTC offset — no more "yesterday" at midnight
  const today = localDateStr(new Date());

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
                {upcoming.map(a => (
                  <AppointmentRow
                    key={a.id}
                    a={a}
                    onAction={() => { setSelectedAppt(a); setTreatmentDialogOpen(true); }}
                  />
                ))}
              </div>
            </div>
          )}
          {past.length > 0 && (
            <div>
              <p className="text-sm font-semibold text-gray-700 mb-2">היסטוריית פגישות</p>
              <div className="space-y-2">
                {past.map(a => (
                  <AppointmentRow
                    key={a.id}
                    a={a}
                    onAction={() => { setSelectedAppt(a); setTreatmentDialogOpen(true); }}
                  />
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {treatmentDialogOpen && (
        <TreatmentDialog
          open={treatmentDialogOpen}
          onClose={() => { setTreatmentDialogOpen(false); setSelectedAppt(null); }}
          onSaved={() => { setTreatmentDialogOpen(false); setSelectedAppt(null); load(); }}
          patient={patient}
          // FIX #1: Read treatmentId (camelCase) — was treatment_id (always undefined)
          treatmentId={selectedAppt?.treatmentId || null}
          appointmentId={selectedAppt?.id}
          treatment={selectedAppt?.treatmentId ? { id: selectedAppt.treatmentId } : null}
        />
      )}
    </div>
  );
}

function AppointmentRow({ a, onAction }) {
  const statusInfo = APPOINTMENT_STATUSES[a.status] || APPOINTMENT_STATUSES.scheduled;

  const colorMap = {
    'bg-blue-100 text-blue-800': 'blue',
    'bg-green-100 text-green-800': 'green',
    'bg-red-100 text-red-800': 'red',
    'bg-orange-100 text-orange-800': 'orange',
  };
  const badgeColor = colorMap[statusInfo.color] || 'gray';

  return (
    <div className="flex items-center gap-3 p-3 border border-gray-100 rounded-xl hover:bg-gray-50 transition-colors">
      <div className="text-center flex-shrink-0 w-16">
        <p className="text-sm font-bold text-gray-900">{formatDate(a.date)}</p>
        <p className="text-xs text-gray-400">{a.start_time || ''}</p>
      </div>

      <div className="flex-1">
        {a.notes && <p className="text-[11px] text-gray-500 line-clamp-1">{a.notes}</p>}
        {a.cancel_reason && <p className="text-xs text-red-400">סיבת ביטול: {a.cancel_reason}</p>}
      </div>

      <div className="flex items-center gap-2">
        <Badge color={badgeColor}>{statusInfo.label}</Badge>

        {/* FIX #1: Read a.treatmentId (camelCase) — was a.treatment_id (always undefined) */}
        <button
          onClick={onAction}
          className={`p-1.5 rounded-lg transition-colors ${a.treatmentId ? 'text-blue-600 hover:bg-blue-100' : 'text-teal-600 hover:bg-teal-100'}`}
          title={a.treatmentId ? 'ערוך תיעוד' : 'תעד טיפול'}
        >
          {a.treatmentId ? <Pencil className="w-4 h-4" /> : <FileText className="w-4 h-4" />}
        </button>

        <Link
          to={`/calendar?edit=${a.id}`}
          className="p-1.5 text-gray-400 hover:bg-gray-200 rounded-lg transition-colors"
          title="ערוך זמן ביומן"
        >
          <Clock className="w-4 h-4" />
        </Link>
      </div>
    </div>
  );
}
