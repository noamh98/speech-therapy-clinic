// src/pages/Dashboard.jsx
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
  Calendar, ClipboardList, BarChart2, Clock, Plus
} from 'lucide-react';
import { motion } from 'framer-motion';

export default function Dashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [patients, setPatients] = useState([]);
  const [treatments, setTreatments] = useState([]);
  const [todayAppointments, setTodayAppointments] = useState([]);
  const [upcomingAppointments, setUpcomingAppointments] = useState([]);
  const [treatmentDialog, setTreatmentDialog] = useState(null); // appointment object

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

      const now = new Date();
      const in30 = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

      setTodayAppointments(appts.filter(a => a.date === today && a.status === 'scheduled'));
      setUpcomingAppointments(
        appts
          .filter(a => a.date > today && a.date <= in30 && a.status === 'scheduled')
          .slice(0, 5)
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

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Spinner size="lg" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="דשבורד"
        subtitle={`שלום! היום ${formatDate(today)}`}
        actions={
          <button
            onClick={() => navigate('/calendar')}
            className="btn-primary flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            תור חדש
          </button>
        }
      />

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard icon={Users}      label="מטופלים פעילים"     value={`${activePatients} / ${patients.length}`} color="teal" />
        <StatCard icon={DollarSign} label="הכנסות החודש"       value={formatCurrency(monthIncome)} color="green" />
        <StatCard icon={Activity}   label="טיפולים החודש"      value={monthTreatments.length} sub={`ממוצע יומי: ${dailyAvg}`} color="purple" />
        <StatCard icon={TrendingUp} label="ממוצע לטיפול"       value={formatCurrency(Math.round(avgAmount))} color="orange" />
      </div>

      {/* Quick actions */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { icon: Users,         label: 'מטופלים',         to: '/patients' },
          { icon: Calendar,      label: 'יומן טיפולים',    to: '/calendar' },
          { icon: BarChart2,     label: 'דוחות',           to: '/reports' },
        ].map(q => (
          <Link
            key={q.to}
            to={q.to}
            className="card flex flex-col items-center gap-2 py-4 hover:shadow-md transition-shadow text-center group"
          >
            <div className="w-10 h-10 bg-gradient-to-br from-teal-50 to-blue-50 rounded-xl flex items-center justify-center group-hover:from-teal-100 group-hover:to-blue-100 transition-all">
              <q.icon className="w-5 h-5 text-teal-600" />
            </div>
            <span className="text-sm font-medium text-gray-700">{q.label}</span>
          </Link>
        ))}
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        {/* Today's appointments */}
        <Card>
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-bold text-gray-900 flex items-center gap-2">
              <Clock className="w-5 h-5 text-teal-600" />
              טיפולים היום
            </h2>
            <span className="text-xs text-gray-400">{today}</span>
          </div>

          {todayAppointments.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-6">אין טיפולים מתוכננים להיום</p>
          ) : (
            <div className="space-y-2">
              {todayAppointments.map(appt => (
                <AppointmentRow
                  key={appt.id}
                  appt={appt}
                  patient={patientMap[appt.patient_id]}
                  onDocument={() => setTreatmentDialog(appt)}
                />
              ))}
            </div>
          )}
        </Card>

        {/* Upcoming appointments */}
        <Card>
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-bold text-gray-900 flex items-center gap-2">
              <Calendar className="w-5 h-5 text-blue-600" />
              טיפולים קרובים
            </h2>
            <Link to="/calendar" className="text-xs text-teal-600 hover:underline">הכל</Link>
          </div>

          {upcomingAppointments.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-6">אין טיפולים קרובים ב-30 ימים הקרובים</p>
          ) : (
            <div className="space-y-2">
              {upcomingAppointments.map(appt => (
                <AppointmentRow
                  key={appt.id}
                  appt={appt}
                  patient={patientMap[appt.patient_id]}
                  onDocument={() => setTreatmentDialog(appt)}
                />
              ))}
            </div>
          )}
        </Card>
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

function AppointmentRow({ appt, patient, onDocument }) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="flex items-center gap-3 p-3 rounded-xl hover:bg-gray-50 group transition-all"
    >
      <div className="text-center flex-shrink-0 w-14">
        <p className="text-sm font-bold text-teal-700">{appt.start_time || '—'}</p>
        <p className="text-xs text-gray-400">{appt.duration_minutes || 45} דק</p>
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-gray-900 truncate">
          {patient?.full_name || 'מטופל לא ידוע'}
        </p>
        {appt.notes && (
          <p className="text-xs text-gray-400 truncate">{appt.notes}</p>
        )}
      </div>
      <button
        onClick={onDocument}
        className="opacity-0 group-hover:opacity-100 btn-primary text-xs py-1 px-3 transition-all"
      >
        תעד טיפול
      </button>
    </motion.div>
  );
}
