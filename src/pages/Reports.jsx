// src/pages/Reports.jsx
import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { getTreatments } from '../services/treatments';
import { getAppointments } from '../services/appointments';
import { getPatients } from '../services/patients';
import { PageHeader, StatCard, Card, Spinner } from '../components/ui';
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer
} from 'recharts';
import { DollarSign, Activity, Users, TrendingUp, Download } from 'lucide-react';
import { formatCurrency, PAYMENT_METHODS } from '../utils/formatters';

const PERIODS = [
  { value: '1', label: 'חודש אחרון' },
  { value: '3', label: '3 חודשים' },
  { value: '6', label: '6 חודשים' },
  { value: '12', label: 'שנה' },
  { value: 'all', label: 'הכל' },
];

const COLORS = ['#14b8a6', '#3b82f6', '#8b5cf6', '#f59e0b', '#ef4444', '#10b981'];

export default function Reports() {
  const { user } = useAuth();
  const [period, setPeriod] = useState('3');
  const [treatments, setTreatments] = useState([]);
  const [appointments, setAppointments] = useState([]);
  const [patients, setPatients] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { load(); }, [user]);

  async function load() {
    if (!user?.email) return;
    setLoading(true);
    try {
      const [t, a, p] = await Promise.all([
        getTreatments(user.email),
        getAppointments(user.email),
        getPatients(user.email),
      ]);
      setTreatments(t);
      setAppointments(a);
      setPatients(p);
    } finally { setLoading(false); }
  }

  function filterByPeriod(items) {
    if (period === 'all') return items;
    const months = parseInt(period);
    const cutoff = new Date();
    cutoff.setMonth(cutoff.getMonth() - months);
    const cutoffStr = cutoff.toISOString().slice(0, 10);
    return items.filter(i => (i.date || '') >= cutoffStr);
  }

  const filteredTreatments  = filterByPeriod(treatments);
  const filteredAppointments = filterByPeriod(appointments);

  // KPIs
  const totalIncome = filteredTreatments.filter(t => t.payment_status === 'paid').reduce((s, t) => s + (Number(t.amount) || 0), 0);
  const avgAmount = filteredTreatments.length ? totalIncome / filteredTreatments.filter(t => t.payment_status === 'paid').length : 0;
  const unpaid = filteredTreatments.filter(t => t.payment_status !== 'paid').reduce((s, t) => s + (Number(t.amount) || 0), 0);
  const cancelRate = filteredAppointments.length ? (filteredAppointments.filter(a => a.status === 'cancelled').length / filteredAppointments.length * 100).toFixed(1) : 0;

  // Monthly income chart
  function getMonthlyData() {
    const map = {};
    filteredTreatments.forEach(t => {
      const m = (t.date || '').slice(0, 7);
      if (!m) return;
      if (!map[m]) map[m] = { month: m, income: 0, count: 0 };
      if (t.payment_status === 'paid') map[m].income += Number(t.amount) || 0;
      map[m].count++;
    });
    return Object.values(map).sort((a, b) => a.month.localeCompare(b.month)).map(m => ({
      ...m, month: m.month.slice(5, 7) + '/' + m.month.slice(0, 4)
    }));
  }

  // Payment method pie
  function getPaymentPieData() {
    const map = {};
    filteredTreatments.forEach(t => {
      const m = t.payment_method || 'other';
      map[m] = (map[m] || 0) + 1;
    });
    return Object.entries(map).map(([k, v]) => ({
      name: PAYMENT_METHODS.find(pm => pm.value === k)?.label || k,
      value: v,
    }));
  }

  // Top patients
  function getTopPatients() {
    const map = {};
    filteredTreatments.forEach(t => {
      if (!t.patient_id) return;
      if (!map[t.patient_id]) map[t.patient_id] = { name: t.patient_name || t.patient_id, income: 0, count: 0 };
      map[t.patient_id].income += Number(t.amount) || 0;
      map[t.patient_id].count++;
    });
    return Object.values(map).sort((a, b) => b.income - a.income).slice(0, 5);
  }

  // Export CSV
  const exportCSV = () => {
    const headers = 'תאריך,מטופל,מספר טיפול,סכום,אמצעי תשלום,סטטוס תשלום';
    const rows = filteredTreatments.map(t =>
      `${t.date},${t.patient_name || ''},${t.treatment_number || ''},${t.amount || 0},${t.payment_method || ''},${t.payment_status || ''}`
    );
    const csv = [headers, ...rows].join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'clinic-report.csv'; a.click();
  };

  const monthlyData = getMonthlyData();
  const pieData = getPaymentPieData();
  const topPatients = getTopPatients();

  if (loading) return <div className="flex justify-center py-12"><Spinner size="lg" /></div>;

  return (
    <div className="space-y-6">
      <PageHeader
        title="דוחות"
        actions={
          <div className="flex gap-2">
            <select className="input w-auto" value={period} onChange={e => setPeriod(e.target.value)}>
              {PERIODS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
            </select>
            <button onClick={exportCSV} className="btn-secondary flex items-center gap-2">
              <Download className="w-4 h-4" /> ייצוא CSV
            </button>
          </div>
        }
      />

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard icon={DollarSign} label="סה״כ הכנסות"      value={formatCurrency(totalIncome)} color="green" />
        <StatCard icon={TrendingUp} label="ממוצע לטיפול"     value={formatCurrency(Math.round(avgAmount))} color="teal" />
        <StatCard icon={Activity}   label="חוב פתוח"         value={formatCurrency(unpaid)} color="orange" />
        <StatCard icon={Users}      label="אחוז ביטולים"     value={`${cancelRate}%`} color="purple" />
      </div>

      {/* Charts */}
      <div className="grid lg:grid-cols-2 gap-6">
        {/* Monthly income bar */}
        <Card>
          <h3 className="font-semibold text-gray-900 mb-4">הכנסות חודשיות</h3>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={monthlyData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="month" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} tickFormatter={v => `₪${v.toLocaleString()}`} />
              <Tooltip formatter={v => formatCurrency(v)} />
              <Bar dataKey="income" fill="#14b8a6" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Card>

        {/* Monthly count line */}
        <Card>
          <h3 className="font-semibold text-gray-900 mb-4">טיפולים לפי חודש</h3>
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={monthlyData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="month" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip />
              <Line type="monotone" dataKey="count" stroke="#3b82f6" strokeWidth={2} dot={{ r: 4 }} />
            </LineChart>
          </ResponsiveContainer>
        </Card>

        {/* Payment pie */}
        <Card>
          <h3 className="font-semibold text-gray-900 mb-4">אמצעי תשלום</h3>
          <ResponsiveContainer width="100%" height={220}>
            <PieChart>
              <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}>
                {pieData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </Card>

        {/* Top patients horizontal bar */}
        <Card>
          <h3 className="font-semibold text-gray-900 mb-4">מטופלים מובילים</h3>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={topPatients} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis type="number" tickFormatter={v => `₪${v.toLocaleString()}`} tick={{ fontSize: 11 }} />
              <YAxis type="category" dataKey="name" width={80} tick={{ fontSize: 11 }} />
              <Tooltip formatter={v => formatCurrency(v)} />
              <Bar dataKey="income" fill="#8b5cf6" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Card>
      </div>
    </div>
  );
}
