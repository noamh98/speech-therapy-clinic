// src/pages/Dashboard.jsx — Multi-tenant dashboard with strict user isolation
/**
 * FIXES APPLIED IN THIS FILE:
 *
 * 1. BROKEN INCOME CALCULATION:
 *    `monthIncome` was reading `t.payment_status` and `t.amount` from the
 *    **treatments** collection — but those fields don't exist on treatment
 *    documents. Payments live in a separate `payments` collection.
 *    The calculation always returned ₪0.
 *    FIX: Dashboard now reads `paymentStats.completed_amount` from
 *    `useClinicData`, which is pre-computed from the payments collection.
 *
 * 2. ISOLATED STATE — Dashboard did not use useClinicData:
 *    Dashboard called `getPatients()`, `getTreatments()`, `getAppointments()`,
 *    and `getPaymentStats()` independently on every mount. After a treatment
 *    was saved via TreatmentDialog, only `loadData()` was called — which
 *    re-fetched everything for Dashboard but had zero effect on the Calendar,
 *    PatientProfile, or any other view. Payment stats required a separate
 *    round-trip, meaning revenue was always one cycle behind.
 *    FIX: Dashboard now consumes `useClinicData()` for patients, treatments,
 *    appointments, and the pre-computed paymentStats. After any save, the
 *    shared `refresh()` updates all views simultaneously.
 *
 * 3. MISSING TreatmentDialog PROPS:
 *    The TreatmentDialog opened from Dashboard was missing `treatmentId` and
 *    `appointmentId` props. It always opened in create-mode, even for
 *    appointments that already had a linked treatment.
 *    FIX: Pass `treatmentId={treatmentDialog.treatmentId}` and
 *    `appointmentId={treatmentDialog.id}` correctly.
 *
 * 4. UTC DATE OFFSET:
 *    `new Date().toISOString().slice(0, 10)` was used for `today`, which
 *    returns UTC date. In Israel (UTC+2/+3) this shifts the date back one
 *    day before 02:00/03:00 AM local time.
 *    FIX: Use `localDateStr(new Date())` from formatters.js.
 *
 * 5. PENDING TASKS — appointments without treatments:
 *    The "Today's Appointments" list showed all scheduled appointments but
 *    gave no visual indication of which ones were already documented.
 *    FIX: AppointmentRow now shows a "מתועד" badge when `appt.treatmentId`
 *    exists, and the document button switches between "תעד" and "ערוך תיעוד".
 */

import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useClinicData } from '../context/useClinicData';
import { StatCard, Card, Spinner, PageHeader } from '../components/ui';
import TreatmentDialog from '../components/shared/TreatmentDialog';
import { formatDate, formatCurrency, localDateStr } from '../utils/formatters';
import {
  Users, DollarSign, Activity, TrendingUp,
  Calendar, ClipboardList, BarChart2, Clock, Plus,
  ArrowLeft, CheckCircle2, AlertCircle, FileText, Pencil
} from 'lucide-react';
import { motion } from 'framer-motion';

export default function Dashboard() {
  const navigate = useNavigate();

  // FIX #2: Consume shared context instead of maintaining isolated local state.
  // paymentStats, patients, treatments, appointments all come from the same
  // data store that Calendar and PatientProfile use.
  const {
    patients,
    treatments,
    appointments,
    paymentStats,
    patientMap,
    todayAppointments,
    activePatients,
    loading,
    error,
    refresh,
  } = useClinicData();

  const [treatmentDialog, setTreatmentDialog] = useState(null);

  // FIX #4: Use localDateStr() — timezone-safe local date string.
  const today = localDateStr(new Date());

  // ─── KPI Calculations ──────────────────────────────────────────────────────
  const thisMonth = today.slice(0, 7); // YYYY-MM

  const monthTreatments = treatments.filter(t => (t.date || '').startsWith(thisMonth));

  // FIX #1: monthIncome now comes from paymentStats.completed_amount (payments collection).
  // Previously computed from t.payment_status / t.amount on treatment docs — fields that
  // don't exist there, so the total was always ₪0.
  const monthIncome = paymentStats?.completed_amount ?? 0;

  const avgTreatmentIncome = monthTreatments.length && monthIncome
    ? monthIncome / monthTreatments.length
    : 0;

  // Pending: today's scheduled appointments that have no linked treatment
  const undocumentedToday = todayAppointments.filter(a => !a.treatmentId);

  const displayName = '';
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'בוקר טוב' : hour < 17 ? 'צהריים טובים' : 'ערב טוב';

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Spinner size="lg" />
      </div>
    );
  }

  return (
    <div className="space-y-5 max-w-6xl mx-auto">
      {/* ─── Header ─── */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl md:text-2xl font-bold text-gray-900">
            {greeting}! 👋
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">{formatDate(today)}</p>
        </div>
        <button
          onClick={() => navigate('/calendar')}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-full hover:bg-blue-700 transition-colors shadow-sm flex-shrink-0"
        >
          <Calendar className="w-4 h-4" />
          לוח שנה
        </button>
      </div>

      {/* ─── Error Message ─── */}
      {error && (
        <div className="flex items-start gap-3 p-4 bg-red-50 border border-red-200 rounded-lg">
          <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      {/* ─── KPI Cards ─── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard
          icon={Users}
          label="מטופלים פעילים"
          value={activePatients.length}
          color="blue"
        />
        <StatCard
          icon={Activity}
          label="טיפולים החודש"
          value={monthTreatments.length}
          color="green"
        />
        {/* FIX #1: Use monthIncome from payments collection */}
        <StatCard
          icon={DollarSign}
          label="הכנסה החודש"
          value={formatCurrency(monthIncome)}
          color="purple"
        />
        <StatCard
          icon={TrendingUp}
          label="ממוצע לטיפול"
          value={formatCurrency(avgTreatmentIncome)}
          color="orange"
        />
      </div>

      {/* ─── Financial Summary (from payments collection) ─── */}
      {paymentStats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="bg-gradient-to-br from-green-50 to-green-100 p-4 rounded-xl border border-green-200">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-green-600 font-medium">סך הכנסות החודש</p>
                <p className="text-lg md:text-xl font-bold text-green-900 mt-1">
                  {formatCurrency(paymentStats.total_amount)}
                </p>
              </div>
              <DollarSign className="w-8 h-8 text-green-600 opacity-20" />
            </div>
          </div>

          <div className="bg-gradient-to-br from-blue-50 to-blue-100 p-4 rounded-xl border border-blue-200">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-blue-600 font-medium">תשלומים שהושלמו</p>
                <p className="text-lg md:text-xl font-bold text-blue-900 mt-1">
                  {formatCurrency(paymentStats.completed_amount)}
                </p>
              </div>
              <CheckCircle2 className="w-8 h-8 text-blue-600 opacity-20" />
            </div>
          </div>

          <div className="bg-gradient-to-br from-yellow-50 to-yellow-100 p-4 rounded-xl border border-yellow-200">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-yellow-600 font-medium">תשלומים בהמתנה</p>
                <p className="text-lg md:text-xl font-bold text-yellow-900 mt-1">
                  {formatCurrency(paymentStats.pending_amount)}
                </p>
              </div>
              <Clock className="w-8 h-8 text-yellow-600 opacity-20" />
            </div>
          </div>

          <div className="bg-gradient-to-br from-orange-50 to-orange-100 p-4 rounded-xl border border-orange-200">
            <div className="flex items-center justify-between">
              <div>
                {/* FIX #5: Show undocumented appointments as "pending tasks" */}
                <p className="text-xs text-orange-600 font-medium">תורים ללא תיעוד היום</p>
                <p className="text-lg md:text-xl font-bold text-orange-900 mt-1">
                  {undocumentedToday.length}
                </p>
              </div>
              <AlertCircle className="w-8 h-8 text-orange-600 opacity-20" />
            </div>
          </div>
        </div>
      )}

      {/* ─── Main Content Grid ─── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Today's Appointments */}
        <Card className="lg:col-span-2">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-gray-900 text-base flex items-center gap-2">
              <Clock className="w-4 h-4 text-blue-600" />
              טיפולים היום
              {undocumentedToday.length > 0 && (
                <span className="text-xs bg-orange-100 text-orange-700 px-2 py-0.5 rounded-full font-medium">
                  {undocumentedToday.length} ממתינים לתיעוד
                </span>
              )}
            </h2>
            <Link to="/calendar" className="text-sm text-blue-600 hover:text-blue-800 flex items-center gap-1 transition-colors">
              הצג הכל
              <ArrowLeft className="w-3.5 h-3.5" />
            </Link>
          </div>
          {todayAppointments.length === 0 ? (
            <div className="text-center py-8">
              <Calendar className="w-10 h-10 text-gray-200 mx-auto mb-2" />
              <p className="text-sm text-gray-400">אין טיפולים מתוכננים היום</p>
            </div>
          ) : (
            <div className="space-y-1">
              {todayAppointments.map((appt, idx) => (
                <AppointmentRow
                  key={appt.id}
                  appt={appt}
                  patient={patientMap[appt.patient_id]}
                  onDocument={() => setTreatmentDialog(appt)}
                  index={idx}
                />
              ))}
            </div>
          )}
        </Card>

        {/* Upcoming Appointments (next 30 days) */}
        <Card>
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-gray-900 text-base flex items-center gap-2">
              <Calendar className="w-4 h-4 text-blue-600" />
              טיפולים קרובים
            </h2>
            <Link to="/calendar" className="text-sm text-blue-600 hover:text-blue-800 flex items-center gap-1 transition-colors">
              הצג הכל
              <ArrowLeft className="w-3.5 h-3.5" />
            </Link>
          </div>
          {(() => {
            const in30 = localDateStr(new Date(Date.now() + 30 * 24 * 60 * 60 * 1000));
            const upcoming = appointments
              .filter(a => a.date > today && a.date <= in30 && a.status === 'scheduled')
              .slice(0, 6);
            return upcoming.length === 0 ? (
              <div className="text-center py-8">
                <Calendar className="w-10 h-10 text-gray-200 mx-auto mb-2" />
                <p className="text-sm text-gray-400">אין טיפולים מתוכננים ב-30 הימים הקרובים</p>
              </div>
            ) : (
              <div className="space-y-1">
                {upcoming.map((appt, idx) => (
                  <AppointmentRow
                    key={appt.id}
                    appt={appt}
                    patient={patientMap[appt.patient_id]}
                    onDocument={() => setTreatmentDialog(appt)}
                    index={idx}
                    showDate
                  />
                ))}
              </div>
            );
          })()}
        </Card>
      </div>

      {/* Quick Actions */}
      <div className="space-y-3">
        <h2 className="font-semibold text-gray-900 text-base px-1">קישורים מהירים</h2>
        {[
          { icon: Users, label: 'מטופלים', sub: `${activePatients.length} מטופלים פעילים`, to: '/patients', color: 'bg-blue-50 text-blue-600' },
          { icon: Calendar, label: 'יומן', sub: 'צפה בטיפולים', to: '/calendar', color: 'bg-purple-50 text-purple-600' },
          { icon: BarChart2, label: 'דוחות', sub: 'סטטיסטיקות וניתוחים', to: '/reports', color: 'bg-green-50 text-green-600' },
          { icon: ClipboardList, label: 'טפסי קבלה', sub: 'טפסים וטפסים', to: '/intake-forms', color: 'bg-orange-50 text-orange-600' },
        ].map(q => (
          <Link
            key={q.to}
            to={q.to}
            className="flex items-center gap-3 p-3 bg-white border border-gray-100 rounded-xl hover:border-gray-200 hover:shadow-sm transition-all group"
          >
            <div className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${q.color}`}>
              <q.icon className="w-4 h-4" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-900">{q.label}</p>
              <p className="text-xs text-gray-400">{q.sub}</p>
            </div>
            <ArrowLeft className="w-4 h-4 text-gray-300 group-hover:text-gray-500 transition-colors flex-shrink-0" />
          </Link>
        ))}
      </div>

      {/* Treatment Dialog */}
      {treatmentDialog && (
        <TreatmentDialog
          open={!!treatmentDialog}
          appointment={treatmentDialog}
          patient={patientMap[treatmentDialog.patient_id]}
          // FIX #3: Pass treatmentId and appointmentId so the dialog opens in
          // edit-mode for already-documented appointments instead of always
          // creating a new treatment.
          treatmentId={treatmentDialog.treatmentId || null}
          appointmentId={treatmentDialog.id}
          treatment={treatmentDialog.treatmentId ? { id: treatmentDialog.treatmentId } : null}
          onClose={() => setTreatmentDialog(null)}
          // FIX #2: Call shared refresh() — updates Calendar, PatientProfile,
          // and payment stats everywhere at once.
          onSaved={() => { setTreatmentDialog(null); refresh(); }}
        />
      )}
    </div>
  );
}

// ─── Appointment Row ──────────────────────────────────────────────────────────
function AppointmentRow({ appt, patient, onDocument, index = 0, showDate = false }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.05 }}
      className="flex items-center gap-3 p-3 rounded-xl hover:bg-gray-50 group transition-all cursor-default"
    >
      {/* Time */}
      <div className="text-center flex-shrink-0 w-16">
        {showDate ? (
          <>
            <p className="text-xs font-semibold text-gray-700">{formatDate(appt.date)}</p>
            <p className="text-xs text-blue-600 font-medium">{appt.start_time || '—'}</p>
          </>
        ) : (
          <>
            <p className="text-sm font-bold text-blue-700">{appt.start_time || '—'}</p>
            <p className="text-xs text-gray-400">{appt.duration_minutes || 45} דק'</p>
          </>
        )}
      </div>

      <div className="w-px h-8 bg-gray-200 flex-shrink-0" />

      {/* Patient info */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-gray-900 truncate">
          {patient?.full_name || 'מטופל לא ידוע'}
        </p>
        <div className="flex items-center gap-1.5 mt-0.5">
          {/* FIX #5: Show documented badge when treatment exists */}
          {appt.treatmentId ? (
            <span className="text-[10px] bg-green-100 text-green-700 px-1.5 py-0.5 rounded-full font-medium flex items-center gap-0.5">
              <CheckCircle2 className="w-2.5 h-2.5" /> מתועד
            </span>
          ) : (
            <span className="text-[10px] bg-orange-100 text-orange-700 px-1.5 py-0.5 rounded-full font-medium">
              ממתין לתיעוד
            </span>
          )}
          {appt.notes && (
            <p className="text-xs text-gray-400 truncate">{appt.notes}</p>
          )}
        </div>
      </div>

      {/* Document button — FIX #5: shows correct icon based on treatmentId */}
      <button
        onClick={onDocument}
        className={`opacity-0 group-hover:opacity-100 flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-full transition-all flex-shrink-0
          ${appt.treatmentId
            ? 'text-blue-600 bg-blue-50 hover:bg-blue-100'
            : 'text-teal-600 bg-teal-50 hover:bg-teal-100'
          }`}
      >
        {appt.treatmentId
          ? <><Pencil className="w-3.5 h-3.5" /> ערוך תיעוד</>
          : <><Plus className="w-3.5 h-3.5" /> תעד</>
        }
      </button>
    </motion.div>
  );
}
