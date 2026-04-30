// src/pages/Reports.jsx
import { useState, useMemo } from 'react';
import { useClinicData } from '../context/useClinicData';
import { PageHeader, StatCard, Card, Spinner } from '../components/ui';
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer
} from 'recharts';
import { DollarSign, Activity, Users, TrendingUp, Download } from 'lucide-react';
import { formatCurrency, localDateStr, PAYMENT_METHODS } from '../utils/formatters';

const PERIODS = [
  { value: '1', label: 'חודש אחרון' },
  { value: '3', label: '3 חודשים' },
  { value: '6', label: '6 חודשים' },
  { value: '12', label: 'שנה' },
  { value: 'all', label: 'הכל' },
];

const COLORS = ['#14b8a6', '#3b82f6', '#8b5cf6', '#f59e0b', '#ef4444', '#10b981'];

export default function Reports() {
  const { treatments, appointments, payments, loading, patientMap } = useClinicData();
  const [period, setPeriod] = useState('3');

  // פונקציית עזר לסינון לפי תקופה
  const filterByPeriod = (items, dateKey = 'date') => {
    if (period === 'all') return items;
    const months = parseInt(period);
    const cutoff = new Date();
    cutoff.setMonth(cutoff.getMonth() - months);
    const cutoffStr = localDateStr(cutoff);
    return items.filter(i => (i[dateKey] || '') >= cutoffStr);
  };

  // נתונים מסוננים לפי תקופה
  const filteredTreatments = useMemo(() => filterByPeriod(treatments), [treatments, period]);
  const filteredAppointments = useMemo(() => filterByPeriod(appointments), [appointments, period]);
  const filteredPayments = useMemo(() => filterByPeriod(payments, 'payment_date'), [payments, period]);

  // חישוב KPIs מבוסס תשלומים (כמו בדאשבורד)
  const stats = useMemo(() => {
    const completedPayments = filteredPayments.filter(p => p.payment_status === 'completed');
    const totalIncome = completedPayments.reduce((s, p) => s + (Number(p.amount) || 0), 0);
    const pendingIncome = filteredPayments.filter(p => p.payment_status === 'pending').reduce((s, p) => s + (Number(p.amount) || 0), 0);
    
    const avgAmount = filteredTreatments.length ? totalIncome / filteredTreatments.length : 0;
    
    const cancelRate = filteredAppointments.length 
      ? ((filteredAppointments.filter(a => a.status === 'cancelled' || a.status === 'missed').length / filteredAppointments.length) * 100).toFixed(1) 
      : 0;

    return { totalIncome, pendingIncome, avgAmount, cancelRate };
  }, [filteredPayments, filteredTreatments, filteredAppointments]);

  // נתוני גרף הכנסות חודשי - מבוסס תשלומים
  const monthlyData = useMemo(() => {
    const dataMap = {};
    
    // הכנסות מתשלומים
    filteredPayments.forEach(p => {
      const m = (p.payment_date || '').slice(0, 7);
      if (!m) return;
      if (!dataMap[m]) dataMap[m] = { month: m, income: 0, count: 0 };
      if (p.payment_status === 'completed') {
        dataMap[m].income += Number(p.amount) || 0;
      }
    });

    // כמות טיפולים מהטבלה הרלוונטית
    filteredTreatments.forEach(t => {
      const m = (t.date || '').slice(0, 7);
      if (!m || !dataMap[m]) return;
      dataMap[m].count++;
    });

    return Object.values(dataMap)
      .sort((a, b) => a.month.localeCompare(b.month))
      .map(m => ({
        ...m, 
        month: m.month.slice(5, 7) + '/' + m.month.slice(0, 4)
      }));
  }, [filteredPayments, filteredTreatments]);

  // פילוח אמצעי תשלום - מבוסס תשלומים
  const pieData = useMemo(() => {
    const map = {};
    filteredPayments.forEach(p => {
      if (p.payment_status !== 'completed') return;
      const method = p.payment_method || 'other';
      map[method] = (map[method] || 0) + 1;
    });
    return Object.entries(map).map(([k, v]) => ({
      name: PAYMENT_METHODS.find(pm => pm.value === k)?.label || k,
      value: v,
    }));
  }, [filteredPayments]);

  // מטופלים מובילים - מבוסס תשלומים
  const topPatients = useMemo(() => {
    const map = {};
    filteredPayments.forEach(p => {
      if (p.payment_status !== 'completed') return;
      const pId = p.patientId || p.patient_id; // תמיכה בשני הפורמטים
      if (!pId) return;
      
      if (!map[pId]) {
        map[pId] = { 
          name: patientMap[pId]?.full_name || 'מטופל כללי', 
          income: 0 
        };
      }
      map[pId].income += Number(p.amount) || 0;
    });
    return Object.values(map).sort((a, b) => b.income - a.income).slice(0, 5);
  }, [filteredPayments, patientMap]);

  const exportCSV = () => {
    const headers = 'תאריך תשלום,מטופל,סכום,אמצעי תשלום,סטטוס';
    const rows = filteredPayments.map(p => {
      const pId = p.patientId || p.patient_id;
      return `${p.payment_date || ''},${patientMap[pId]?.full_name || ''},${p.amount || 0},${p.payment_method || ''},${p.payment_status || ''}`;
    });
    const csv = [headers, ...rows].join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `clinic-report-${localDateStr()}.csv`; a.click();
  };

  if (loading) return <div className="flex justify-center py-12"><Spinner size="lg" /></div>;

  return (
    <div className="space-y-6">
      <PageHeader
        title="דוחות וניתוחים"
        actions={
          <div className="flex gap-2">
            <select className="input w-auto h-10 py-0" value={period} onChange={e => setPeriod(e.target.value)}>
              {PERIODS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
            </select>
            <button onClick={exportCSV} className="btn-secondary flex items-center gap-2 h-10">
              <Download className="w-4 h-4" /> ייצוא
            </button>
          </div>
        }
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard icon={DollarSign} label="סה״כ הכנסות" value={formatCurrency(stats.totalIncome)} color="green" />
        <StatCard icon={TrendingUp} label="ממוצע לטיפול" value={formatCurrency(Math.round(stats.avgAmount))} color="teal" />
        <StatCard icon={Activity} label="חוב בהמתנה" value={formatCurrency(stats.pendingIncome)} color="orange" />
        <StatCard icon={Users} label="אחוז ביטולים" value={`${stats.cancelRate}%`} color="purple" />
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        <Card>
          <h3 className="font-semibold text-gray-900 mb-4 text-sm">הכנסות חודשיות (תשלומים שבוצעו)</h3>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={monthlyData}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="month" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} tickFormatter={v => `₪${v.toLocaleString()}`} />
              <Tooltip formatter={v => formatCurrency(v)} labelStyle={{direction: 'ltr'}} />
              <Bar dataKey="income" fill="#10b981" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Card>

        <Card>
          <h3 className="font-semibold text-gray-900 mb-4 text-sm">כמות טיפולים</h3>
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={monthlyData}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="month" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip labelStyle={{direction: 'ltr'}} />
              <Line type="monotone" dataKey="count" stroke="#3b82f6" strokeWidth={2} dot={{ r: 4, fill: '#3b82f6' }} />
            </LineChart>
          </ResponsiveContainer>
        </Card>

        <Card>
          <h3 className="font-semibold text-gray-900 mb-4 text-sm">אמצעי תשלום מועדפים</h3>
          <ResponsiveContainer width="100%" height={220}>
            <PieChart>
              <Pie 
                data={pieData} 
                dataKey="value" 
                nameKey="name" 
                cx="50%" 
                cy="50%" 
                outerRadius={80} 
                label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
              >
                {pieData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </Card>

        <Card>
          <h3 className="font-semibold text-gray-900 mb-4 text-sm">מטופלים מובילים</h3>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={topPatients} layout="vertical" margin={{ right: 30 }}>
              <CartesianGrid strokeDasharray="3 3" horizontal={false} />
              <XAxis type="number" tickFormatter={v => `₪${v.toLocaleString()}`} tick={{ fontSize: 11 }} />
              <YAxis type="category" dataKey="name" width={90} tick={{ fontSize: 11 }} />
              <Tooltip formatter={v => formatCurrency(v)} />
              <Bar dataKey="income" fill="#8b5cf6" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Card>
      </div>
    </div>
  );
}