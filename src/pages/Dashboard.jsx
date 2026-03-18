// src/pages/Dashboard.jsx — Mobile-first responsive redesign
import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { getTreatments } from '../services/treatments';
import { getAppointments } from '../services/appointments';
import { getPatients } from '../services/patients';
import { StatCard, Card, Spinner, EmptyState, PageHeader } from '../components/ui';
import TreatmentDialog from '../components/shared/TreatmentDialog';
import { formatDate, formatCurrency, APPOINTMENT_STATUSES } from '../utils/formatters';
import {
  Users, DollarSign, Activity, TrendingUp,
  Calendar, ClipboardList, BarChart2, Clock, Plus,
  ArrowLeft, CheckCircle2, AlertCircle
} from 'lucide-react';
import { motion } from 'framer-motion';

export default function Dashboard() {
  const { user, profile } = useAuth();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [patients, setPatients] = useState([]);
  const [treatments, setTreatments] = useState([]);
  const [todayAppointments, setTodayAppointments] = useState([]);
  const [upcomingAppointments, setUpcomingAppointments] = useState([]);
  const [treatmentDialog, setTreatmentDialog] = useState(null);

  const today = new Date().toISOString().slice(0, 10);

  useEffect(() => {
    if (!user?.email) return;
    loadData();
  }, [user]);

  async function loadData() {
    setLoading(true);
    try {
      const [p, t, appts] = await Promise.all([
        getPatients(user.email),
        getTreatments(user.email),
        getAppointments(user.email),
      ]);
      setPatients(p);
      setTreatments(t);

      const in30 = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
      setTodayAppointments(appts.filter(a => a.date === today && a.status === 'scheduled'));
      setUpcomingAppointments(
        appts.filter(a => a.date > today && a.date <= in30 && a.status === 'scheduled').slice(0, 6)
      );
    } finally {
      setLoading(false);
    }
  }

  // KPI calculations
  const activePatients = patients.filter(p => p.status === 'active').length;
  const thisMonth = new Date().toISOString().slice(0, 7);
  const monthTreatments = treatments.filter(t => (t.date || '').startsWith(thisMonth));
  const monthIncome = monthTreatments
    .filter(t => t.payment_status === 'paid')
    .reduce((sum, t) => sum + (Number(t.amount) || 0), 0);
  const avgAmount = treatments.length
    ? treatments.reduce((s, t) => s + (Number(t.amount) || 0), 0) / treatments.length
    : 0;
  const dailyAvg = monthTreatments.length
    ? (monthTreatments.length / new Date().getDate()).toFixed(1)
    : 0;

  const patientMap = Object.fromEntries(patients.map(p => [p.id, p]));

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

      {/* ── Header ── */}
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
          <Plus className="w-4 h-4" />
          <span className="hidden sm:inline">תור חדש</span>
        </button>
      </div>

      {/* ── KPI Stats Grid ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
        <StatCard
          icon={Users}
          label="מטופלים פעילים"
          value={`${activePatients}`}
          sub={`מתוך ${patients.length} סה"כ`}
          color="teal"
        />
        <StatCard
          icon={DollarSign}
          label="הכנסות החודש"
          value={formatCurrency(monthIncome)}
          sub="תשלומים שהתקבלו"
          color="green"
        />
        <StatCard
          icon={Activity}
          label="טיפולים החודש"
          value={monthTreatments.length}
          sub={`ממוצע יומי: ${dailyAvg}`}
          color="purple"
        />
        <StatCard
          icon={TrendingUp}
          label="ממוצע לטיפול"
          value={formatCurrency(Math.round(avgAmount))}
          sub="כל הזמנים"
          color="orange"
        />
      </div>

      {/* ── Today's Appointments ── */}
      <Card>
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold text-gray-900 flex items-center gap-2 text-base">
            <Clock className="w-5 h-5 text-blue-600" />
            טיפולים היום
            {todayAppointments.length > 0 && (
              <span className="bg-blue-100 text-blue-700 text-xs font-medium px-2 py-0.5 rounded-full">
                {todayAppointments.length}
              </span>
            )}
          </h2>
          <Link to="/calendar" className="text-sm text-blue-600 hover:text-blue-800 flex items-center gap-1 transition-colors">
            יומן
            <ArrowLeft className="w-3.5 h-3.5" />
          </Link>
        </div>

        {todayAppointments.length === 0 ? (
          <div className="text-center py-8">
            <CheckCircle2 className="w-10 h-10 text-gray-200 mx-auto mb-2" />
            <p className="text-sm text-gray-400">אין טיפולים מתוכננים להיום</p>
            <button
              onClick={() => navigate('/calendar')}
              className="mt-3 text-sm text-blue-600 hover:underline"
            >
              קבע תור חדש
            </button>
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

      {/* ── Upcoming + Quick Actions ── */}
      <div className="grid lg:grid-cols-3 gap-4 md:gap-5">
        {/* Upcoming appointments (takes 2 cols) */}
        <Card className="lg:col-span-2">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-gray-900 flex items-center gap-2 text-base">
              <Calendar className="w-5 h-5 text-purple-600" />
              טיפולים קרובים
            </h2>
            <Link to="/calendar" className="text-sm text-blue-600 hover:text-blue-800 flex items-center gap-1 transition-colors">
              הכל
              <ArrowLeft className="w-3.5 h-3.5" />
            </Link>
          </div>

          {upcomingAppointments.length === 0 ? (
            <div className="text-center py-8">
              <Calendar className="w-10 h-10 text-gray-200 mx-auto mb-2" />
              <p className="text-sm text-gray-400">אין טיפולים קרובים ב-30 ימים הקרובים</p>
            </div>
          ) : (
            <div className="space-y-1">
              {upcomingAppointments.map((appt, idx) => (
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
          )}
        </Card>

        {/* Quick actions */}
        <div className="space-y-3">
          <h2 className="font-semibold text-gray-900 text-base px-1">קישורים מהירים</h2>
          {[
            { icon: Users,       label: 'מטופלים',      sub: `${activePatients} פעילים`,    to: '/patients',   color: 'bg-blue-50 text-blue-600' },
            { icon: Calendar,    label: 'יומן',          sub: 'קבע תור חדש',                 to: '/calendar',   color: 'bg-purple-50 text-purple-600' },
            { icon: BarChart2,   label: 'דוחות',         sub: 'סיכומי חודש',                 to: '/reports',    color: 'bg-green-50 text-green-600' },
            { icon: ClipboardList, label: 'שאלונים',    sub: 'טפסי קבלה',                   to: '/intake-forms', color: 'bg-orange-50 text-orange-600' },
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
      </div>

      {/* Treatment Dialog */}
      {treatmentDialog && (
        <TreatmentDialog
          open={!!treatmentDialog}
          appointment={treatmentDialog}
          patient={patientMap[treatmentDialog.patient_id]}
          onClose={() => setTreatmentDialog(null)}
          onSaved={() => { setTreatmentDialog(null); loadData(); }}
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

      {/* Divider */}
      <div className="w-px h-8 bg-gray-200 flex-shrink-0" />

      {/* Patient info */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-gray-900 truncate">
          {patient?.full_name || 'מטופל לא ידוע'}
        </p>
        {appt.notes && (
          <p className="text-xs text-gray-400 truncate mt-0.5">{appt.notes}</p>
        )}
      </div>

      {/* Document button */}
      <button
        onClick={onDocument}
        className="opacity-0 group-hover:opacity-100 flex items-center gap-1.5 text-xs font-medium text-blue-600 bg-blue-50 hover:bg-blue-100 px-3 py-1.5 rounded-full transition-all flex-shrink-0"
      >
        <Plus className="w-3.5 h-3.5" />
        תעד
      </button>
    </motion.div>
  );
}
