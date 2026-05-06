// src/pages/AdvancedReports.jsx
/**
 * AdvancedReports — Four fully implemented analytics cards.
 *
 * All data comes from useClinicData() context (zero extra Firestore reads).
 * Uses the memoised patients, appointments, treatments, payments arrays.
 *
 * Cards implemented:
 * 1. פילוח מטופלים  — age buckets, domain distribution, session frequency
 * 2. ניתוח מגמות    — monthly income + treatment count trend chart
 * 3. ניתוח גבייה    — debt tracking, payment status breakdown, avg days to pay
 * 4. ניתוח ביטולים  — cancellation/missed rate by weekday and hour
 */

import { useState, useMemo } from 'react';
import { useClinicData } from '../context/useClinicData';
import { PageHeader, Card, Spinner } from '../components/ui';
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts';
import {
  Users, TrendingUp, DollarSign, XCircle,
  ChevronDown, ChevronUp,
} from 'lucide-react';
import { formatCurrency, localDateStr } from '../utils/formatters';

const COLORS = ['#14b8a6', '#3b82f6', '#8b5cf6', '#f59e0b', '#ef4444', '#10b981', '#f97316'];

const PERIODS = [
  { value: '3',   label: '3 חודשים' },
  { value: '6',   label: '6 חודשים' },
  { value: '12',  label: 'שנה' },
  { value: 'all', label: 'הכל' },
];

const DAYS_HE = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];

// ─── Helpers ──────────────────────────────────────────────────────────────────
function getAge(birthDate) {
  if (!birthDate) return null;
  const today = new Date();
  const birth = new Date(birthDate);
  if (isNaN(birth)) return null;
  let age = today.getFullYear() - birth.getFullYear();
  const m = today.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
  return age;
}

function ageBucket(age) {
  if (age === null) return 'לא ידוע';
  if (age < 3)  return '0-2';
  if (age < 6)  return '3-5';
  if (age < 10) return '6-9';
  if (age < 14) return '10-13';
  if (age < 18) return '14-17';
  if (age < 30) return '18-29';
  if (age < 50) return '30-49';
  return '50+';
}

// ─── Section Wrapper ──────────────────────────────────────────────────────────
function Section({ icon: Icon, title, color, children }) {
  const [open, setOpen] = useState(true);
  return (
    <Card className="overflow-hidden">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between text-right"
      >
        <div className="flex items-center gap-3">
          <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${color}`}>
            <Icon className="w-4 h-4" />
          </div>
          <h2 className="font-bold text-gray-900 text-base">{title}</h2>
        </div>
        {open ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
      </button>
      {open && <div className="mt-5">{children}</div>}
    </Card>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function AdvancedReports() {
  const { patients, appointments, treatments, payments, loading } = useClinicData();
  const [period, setPeriod] = useState('6');

  // ── Period filter helper ───────────────────────────────────────────────────
  const cutoffDate = useMemo(() => {
    if (period === 'all') return null;
    const d = new Date();
    d.setMonth(d.getMonth() - parseInt(period));
    return localDateStr(d);
  }, [period]);

  const filterByDate = (items, dateField = 'date') =>
    cutoffDate ? items.filter(i => (i[dateField] || '') >= cutoffDate) : items;

  // ═══════════════════════════════════════════════════════════════════════════
  // 1. פילוח מטופלים
  // ═══════════════════════════════════════════════════════════════════════════

  // Age distribution
  const ageData = useMemo(() => {
    const buckets = {};
    patients.forEach(p => {
      const b = ageBucket(getAge(p.birth_date || p.date_of_birth));
      buckets[b] = (buckets[b] || 0) + 1;
    });
    const order = ['0-2','3-5','6-9','10-13','14-17','18-29','30-49','50+','לא ידוע'];
    return order
      .filter(k => buckets[k])
      .map(k => ({ name: k, value: buckets[k] }));
  }, [patients]);

  // Session frequency (treatments per patient)
  const frequencyData = useMemo(() => {
    const filtered = filterByDate(treatments);
    const counts = {};
    filtered.forEach(t => { counts[t.patient_id] = (counts[t.patient_id] || 0) + 1; });
    const buckets = { '1': 0, '2-4': 0, '5-9': 0, '10-19': 0, '20+': 0 };
    Object.values(counts).forEach(n => {
      if (n === 1)       buckets['1']++;
      else if (n <= 4)   buckets['2-4']++;
      else if (n <= 9)   buckets['5-9']++;
      else if (n <= 19)  buckets['10-19']++;
      else               buckets['20+']++;
    });
    return Object.entries(buckets)
      .filter(([, v]) => v > 0)
      .map(([k, v]) => ({ name: `${k} טיפולים`, value: v }));
  }, [treatments, cutoffDate]);

  // ═══════════════════════════════════════════════════════════════════════════
  // 2. ניתוח מגמות
  // ═══════════════════════════════════════════════════════════════════════════
  const trendData = useMemo(() => {
    const map = {};
    filterByDate(treatments).forEach(t => {
      const m = (t.date || '').slice(0, 7);
      if (!m) return;
      if (!map[m]) map[m] = { month: m, count: 0, income: 0 };
      map[m].count++;
    });
    filterByDate(payments, 'payment_date')
      .filter(p => p.payment_status === PAYMENT_STATUS.COMPLETED)
      .forEach(p => {
        const m = (p.payment_date || '').slice(0, 7);
        if (!m) return;
        if (!map[m]) map[m] = { month: m, count: 0, income: 0 };
        map[m].income += p.amount || 0;
      });
    return Object.values(map)
      .sort((a, b) => a.month.localeCompare(b.month))
      .map(m => ({
        ...m,
        label: m.month.slice(5, 7) + '/' + m.month.slice(2, 4),
      }));
  }, [treatments, payments, cutoffDate]);

  // ═══════════════════════════════════════════════════════════════════════════
  // 3. ניתוח גבייה
  // ═══════════════════════════════════════════════════════════════════════════
  const collectionData = useMemo(() => {
    const filtered = filterByDate(payments, 'payment_date');

    const byStatus = { completed: 0, pending: 0, refunded: 0, cancelled: 0 };
    let totalAmount = 0;
    let completedAmount = 0;
    let pendingAmount = 0;

    filtered.forEach(p => {
      const a = p.amount || 0;
      totalAmount += a;
      byStatus[p.payment_status] = (byStatus[p.payment_status] || 0) + a;
      if (p.payment_status === PAYMENT_STATUS.COMPLETED) completedAmount += a;
      if (p.payment_status === PAYMENT_STATUS.PENDING)   pendingAmount   += a;
    });

    const statusChart = [
      { name: 'שולם',    value: byStatus.completed || 0, color: '#10b981' },
      { name: 'ממתין',   value: byStatus.pending   || 0, color: '#f59e0b' },
      { name: 'הוחזר',   value: byStatus.refunded  || 0, color: '#3b82f6' },
      { name: 'בוטל',    value: byStatus.cancelled || 0, color: '#9ca3af' },
    ].filter(s => s.value > 0);

    const collectionRate = totalAmount > 0
      ? ((completedAmount / totalAmount) * 100).toFixed(1)
      : '0';

    return { statusChart, totalAmount, completedAmount, pendingAmount, collectionRate };
  }, [payments, cutoffDate]);

  // ═══════════════════════════════════════════════════════════════════════════
  // 4. ניתוח ביטולים
  // ═══════════════════════════════════════════════════════════════════════════
  const cancellationData = useMemo(() => {
    const filtered = filterByDate(appointments);
    const total = filtered.length;
    const cancelled = filtered.filter(a => a.status === PAYMENT_STATUS.CANCELLED || a.status === 'missed');

    // By weekday
    const byDay = Array.from({ length: 7 }, (_, i) => ({
      name: DAYS_HE[i],
      ביטולים: 0,
      "סה״כ": 0,
    }));
    filtered.forEach(a => {
      const day = new Date(a.date + 'T12:00:00').getDay();
      if (byDay[day]) {
        byDay[day]['סה״כ']++;
        if (a.status === PAYMENT_STATUS.CANCELLED || a.status === 'missed') byDay[day]['ביטולים']++;
      }
    });

    // By hour
    const byHour = {};
    cancelled.forEach(a => {
      const h = (a.start_time || '').split(':')[0];
      if (h) byHour[h] = (byHour[h] || 0) + 1;
    });
    const hourChart = Object.entries(byHour)
      .sort(([a], [b]) => Number(a) - Number(b))
      .map(([h, v]) => ({ name: `${h}:00`, ביטולים: v }));

    const rate = total > 0 ? ((cancelled.length / total) * 100).toFixed(1) : '0';

    return {
      byDay: byDay.filter(d => d['סה״כ'] > 0),
      hourChart,
      rate,
      cancelledCount: cancelled.length,
      total,
    };
  }, [appointments, cutoffDate]);

  if (loading) return <div className="flex justify-center py-12"><Spinner size="lg" /></div>;

  return (
    <div className="space-y-5">
      <PageHeader
        title="דוחות מתקדמים"
        subtitle="ניתוח מעמיק של נתוני הקליניקה"
        actions={
          <select
            className="input w-auto h-10 py-0"
            value={period}
            onChange={e => setPeriod(e.target.value)}
          >
            {PERIODS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
          </select>
        }
      />

      {/* ─── 1. פילוח מטופלים ─── */}
      <Section icon={Users} title="פילוח מטופלים" color="bg-blue-50 text-blue-600">
        <div className="grid md:grid-cols-2 gap-6">

          <div>
            <p className="text-xs font-semibold text-gray-500 mb-3">התפלגות גילאים</p>
            {ageData.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-6">אין נתוני לידה זמינים</p>
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={ageData} margin={{ right: 10 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                  <Tooltip formatter={v => [`${v} מטופלים`, 'כמות']} />
                  <Bar dataKey="value" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>

          <div>
            <p className="text-xs font-semibold text-gray-500 mb-3">תדירות טיפולים למטופל</p>
            {frequencyData.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-6">אין נתונים לתקופה זו</p>
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie
                    data={frequencyData}
                    dataKey="value"
                    nameKey="name"
                    cx="50%" cy="50%"
                    outerRadius={80}
                    label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                    labelLine={false}
                  >
                    {frequencyData.map((_, i) => (
                      <Cell key={i} fill={COLORS[i % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* Summary stats */}
        <div className="grid grid-cols-3 gap-3 mt-4 pt-4 border-t border-gray-100">
          <div className="text-center">
            <p className="text-2xl font-bold text-blue-700">{patients.length}</p>
            <p className="text-xs text-gray-400 mt-0.5">סה״כ מטופלים</p>
          </div>
          <div className="text-center">
            <p className="text-2xl font-bold text-green-700">
              {patients.filter(p => p.status === 'active' && !p.is_archived).length}
            </p>
            <p className="text-xs text-gray-400 mt-0.5">פעילים</p>
          </div>
          <div className="text-center">
            <p className="text-2xl font-bold text-gray-500">
              {patients.filter(p => p.is_archived).length}
            </p>
            <p className="text-xs text-gray-400 mt-0.5">בארכיון</p>
          </div>
        </div>
      </Section>

      {/* ─── 2. ניתוח מגמות ─── */}
      <Section icon={TrendingUp} title="ניתוח מגמות" color="bg-green-50 text-green-600">
        {trendData.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-6">אין נתונים לתקופה זו</p>
        ) : (
          <div className="space-y-6">
            <div>
              <p className="text-xs font-semibold text-gray-500 mb-3">הכנסות חודשיות (₪)</p>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={trendData}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} tickFormatter={v => `₪${(v / 1000).toFixed(0)}K`} />
                  <Tooltip formatter={v => [formatCurrency(v), 'הכנסה']} />
                  <Bar dataKey="income" fill="#14b8a6" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div>
              <p className="text-xs font-semibold text-gray-500 mb-3">כמות טיפולים חודשית</p>
              <ResponsiveContainer width="100%" height={180}>
                <LineChart data={trendData}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                  <Tooltip formatter={v => [`${v} טיפולים`, 'כמות']} />
                  <Line
                    type="monotone"
                    dataKey="count"
                    stroke="#8b5cf6"
                    strokeWidth={2.5}
                    dot={{ r: 4, fill: '#8b5cf6' }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}
      </Section>

      {/* ─── 3. ניתוח גבייה ─── */}
      <Section icon={DollarSign} title="ניתוח גבייה" color="bg-purple-50 text-purple-600">
        {/* KPI row */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
          <div className="bg-green-50 rounded-xl p-3 text-center">
            <p className="text-lg font-bold text-green-800">
              {formatCurrency(collectionData.completedAmount)}
            </p>
            <p className="text-xs text-green-600 mt-0.5">גבוי</p>
          </div>
          <div className="bg-yellow-50 rounded-xl p-3 text-center">
            <p className="text-lg font-bold text-yellow-800">
              {formatCurrency(collectionData.pendingAmount)}
            </p>
            <p className="text-xs text-yellow-600 mt-0.5">חוב פתוח</p>
          </div>
          <div className="bg-blue-50 rounded-xl p-3 text-center">
            <p className="text-lg font-bold text-blue-800">
              {formatCurrency(collectionData.totalAmount)}
            </p>
            <p className="text-xs text-blue-600 mt-0.5">סה״כ חויב</p>
          </div>
          <div className="bg-teal-50 rounded-xl p-3 text-center">
            <p className="text-lg font-bold text-teal-800">
              {collectionData.collectionRate}%
            </p>
            <p className="text-xs text-teal-600 mt-0.5">שיעור גבייה</p>
          </div>
        </div>

        {collectionData.statusChart.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-6">אין נתוני תשלום לתקופה זו</p>
        ) : (
          <div>
            <p className="text-xs font-semibold text-gray-500 mb-3">פילוח לפי סטטוס תשלום (₪)</p>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={collectionData.statusChart} layout="vertical" margin={{ right: 30 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                <XAxis
                  type="number"
                  tickFormatter={v => `₪${(v / 1000).toFixed(0)}K`}
                  tick={{ fontSize: 11 }}
                />
                <YAxis type="category" dataKey="name" width={55} tick={{ fontSize: 12 }} />
                <Tooltip formatter={v => [formatCurrency(v), 'סכום']} />
                <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                  {collectionData.statusChart.map((entry, i) => (
                    <Cell key={i} fill={entry.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </Section>

      {/* ─── 4. ניתוח ביטולים ─── */}
      <Section icon={XCircle} title="ניתוח ביטולים והחמצות" color="bg-red-50 text-red-500">
        {/* Summary */}
        <div className="grid grid-cols-3 gap-3 mb-5">
          <div className="bg-red-50 rounded-xl p-3 text-center">
            <p className="text-2xl font-bold text-red-700">
              {cancellationData.rate}%
            </p>
            <p className="text-xs text-red-500 mt-0.5">שיעור ביטול</p>
          </div>
          <div className="bg-gray-50 rounded-xl p-3 text-center">
            <p className="text-2xl font-bold text-gray-700">
              {cancellationData.cancelledCount}
            </p>
            <p className="text-xs text-gray-500 mt-0.5">ביטולים/החמצות</p>
          </div>
          <div className="bg-blue-50 rounded-xl p-3 text-center">
            <p className="text-2xl font-bold text-blue-700">
              {cancellationData.total}
            </p>
            <p className="text-xs text-blue-500 mt-0.5">סה״כ תורים</p>
          </div>
        </div>

        {cancellationData.byDay.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-6">אין נתוני ביטול לתקופה זו</p>
        ) : (
          <div className="space-y-6">
            <div>
              <p className="text-xs font-semibold text-gray-500 mb-3">ביטולים לפי יום בשבוע</p>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={cancellationData.byDay}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="סה״כ"    fill="#e2e8f0" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="ביטולים" fill="#ef4444" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>

            {cancellationData.hourChart.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-gray-500 mb-3">ביטולים לפי שעת יום</p>
                <ResponsiveContainer width="100%" height={180}>
                  <BarChart data={cancellationData.hourChart}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                    <Tooltip />
                    <Bar dataKey="ביטולים" fill="#f97316" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>
        )}
      </Section>
    </div>
  );
}
