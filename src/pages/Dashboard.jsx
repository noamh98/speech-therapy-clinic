// src/pages/Dashboard.jsx — Multi-tenant dashboard with strict user isolation
import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useClinicData } from '../context/useClinicData';
import { getPaymentStats } from '../services/payments';
import { StatCard, Card, Spinner, EmptyState, PageHeader } from '../components/ui';
import TreatmentDialog from '../components/shared/TreatmentDialog';
import { formatDate, formatCurrency, localDateStr, APPOINTMENT_STATUSES } from '../utils/formatters';
import {
  Users, DollarSign, Activity, TrendingUp,
  Calendar, ClipboardList, BarChart2, Clock, Plus,
  ArrowLeft, CheckCircle2, AlertCircle
} from 'lucide-react';
import { motion } from 'framer-motion';

export default function Dashboard() {
  const { user, profile } = useAuth();
  const navigate = useNavigate();

  // Pull shared data from context — zero extra Firestore reads on navigation
  const {
    patients, treatments, appointments,
    activePatients, todayAppointments, patientMap,
    docStatusMap, loading, error, refresh,
  } = useClinicData();

  const [paymentStats,    setPaymentStats]    = useState(null);
  const [treatmentDialog, setTreatmentDialog] = useState(null);

  const today = localDateStr(); // timezone-safe

  // Payment stats are the only thing not in context — one targeted monthly query
  useEffect(() => {
    if (!user?.uid) return;
    const startOfMonth = localDateStr(new Date(new Date().getFullYear(), new Date().getMonth(), 1));
    const endOfMonth   = localDateStr(new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0));
    getPaymentStats(startOfMonth, endOfMonth)
      .then(setPaymentStats)
      .catch(err => console.warn('[Dashboard] Payment stats failed:', err));
  }, [user?.uid]);

  // Upcoming appointments: next 30 days from context appointments
  const in30 = localDateStr(new Date(Date.now() + 30 * 24 * 60 * 60 * 1000));
  const upcomingAppointments = appointments
    .filter(a => a.date > today && a.date <= in30 && a.status === 'scheduled')
    .slice(0, 6);

  // ── KPI calculations ──────────────────────────────────────────────────────
  const thisMonth       = today.slice(0, 7);
  const monthTreatments = treatments.filter(t => (t.date || '').startsWith(thisMonth));
  const dailyAvg        = monthTreatments.length
    ? (monthTreatments.length / new Date().getDate()).toFixed(1)
    : 0;

  // Undocumented count from context docStatusMap
  const undocumentedTodayCount = todayAppointments.filter(
    a => docStatusMap[a.id] === 'needs_doc'
  ).length;

  // Greeting based on time of day
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'בוקר טוב' : hour < 17 ? 'צהריים טובים' : 'ערב טוב';
  const displayName = profile?.name?.split(' ')[0] || '';

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
            {greeting}{displayName ? `, ${displayName}` : ''}! 👋
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
        <StatCard
          icon={DollarSign}
          label="הכנסה החודש"
          value={formatCurrency(paymentStats?.completed_amount ?? 0)}
          color="purple"
        />
        <StatCard
          icon={TrendingUp}
          label="ממוצע לטיפול"
          value={monthTreatments.length
            ? formatCurrency(Math.round((paymentStats?.completed_amount ?? 0) / monthTreatments.length))
            : '—'}
          color="orange"
        />
      </div>

      {/* ─── Financial Summary ─── */}
      {paymentStats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="bg-gradient-to-br from-green-50 to-green-100 p-4 rounded-xl border border-green-200">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-green-600 font-medium">סך הכנסות</p>
                <p className="text-lg md:text-xl font-bold text-green-900 mt-1">
                  ₪{paymentStats.total_amount.toFixed(2)}
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
                  ₪{paymentStats.completed_amount.toFixed(2)}
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
                  ₪{paymentStats.pending_amount.toFixed(2)}
                </p>
              </div>
              <Clock className="w-8 h-8 text-yellow-600 opacity-20" />
            </div>
          </div>

          <div className="bg-gradient-to-br from-purple-50 to-purple-100 p-4 rounded-xl border border-purple-200">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-purple-600 font-medium">מספר תשלומים</p>
                <p className="text-lg md:text-xl font-bold text-purple-900 mt-1">
                  {paymentStats.total_payments}
                </p>
              </div>
              <TrendingUp className="w-8 h-8 text-purple-600 opacity-20" />
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
              <Clock className="w-4.5 h-4.5 text-blue-600" />
              טיפולים היום
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
                  docStatus={docStatusMap[appt.id]}
                  index={idx}
                />
              ))}
            </div>
          )}
        </Card>

        {/* Upcoming Appointments */}
        <Card>
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-gray-900 text-base flex items-center gap-2">
              <Calendar className="w-4.5 h-4.5 text-blue-600" />
              טיפולים קרובים
            </h2>
            <Link to="/calendar" className="text-sm text-blue-600 hover:text-blue-800 flex items-center gap-1 transition-colors">
              הצג הכל
              <ArrowLeft className="w-3.5 h-3.5" />
            </Link>
          </div>
          {upcomingAppointments.length === 0 ? (
            <div className="text-center py-8">
              <Calendar className="w-10 h-10 text-gray-200 mx-auto mb-2" />
              <p className="text-sm text-gray-400">אין טיפולים מתוכננים ב-30 הימים הקרובים</p>
            </div>
          ) : (
            <div className="space-y-1">
              {upcomingAppointments.map((appt, idx) => (
                <AppointmentRow
                  key={appt.id}
                  appt={appt}
                  patient={patientMap[appt.patient_id]}
                  onDocument={() => setTreatmentDialog(appt)}
                  docStatus={docStatusMap[appt.id]}
                  index={idx}
                  showDate
                />
              ))}
            </div>
          )}
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
              <q.icon className="w-4.5 h-4.5" />
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
          onClose={() => setTreatmentDialog(null)}
          onSaved={() => { setTreatmentDialog(null); refresh(); }}
        />
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// APPOINTMENT ROW COMPONENT
// ═══════════════════════════════════════════════════════════════════════════
function AppointmentRow({ appt, patient, onDocument, docStatus, index = 0, showDate = false }) {
  const isDocumented = docStatus === 'documented';
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

      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-gray-900 truncate">
          {patient?.full_name || 'מטופל לא ידוע'}
        </p>
        <div className="flex items-center gap-1.5 mt-0.5">
          {isDocumented
            ? <span className="text-[10px] bg-green-100 text-green-700 px-1.5 py-0.5 rounded-full font-medium">✅ מתועד</span>
            : <span className="text-[10px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full font-medium">⏳ ממתין לתיעוד</span>
          }
        </div>
      </div>

      <button
        onClick={onDocument}
        className="opacity-0 group-hover:opacity-100 flex items-center gap-1.5 text-xs font-medium text-blue-600 bg-blue-50 hover:bg-blue-100 px-3 py-1.5 rounded-full transition-all flex-shrink-0"
      >
        <Plus className="w-3.5 h-3.5" />
        {isDocumented ? 'ערוך' : 'תעד'}
      </button>
    </motion.div>
  );
}
