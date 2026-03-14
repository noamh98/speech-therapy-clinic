// src/pages/Calendar.jsx
import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import {
  getAppointments, createAppointment, updateAppointment,
  deleteAppointment, checkOverlap, createRecurringSeries, deleteFutureSeries
} from '../services/appointments';
import { getPatients } from '../services/patients';
import { exportToICS, parseICS, downloadFile } from '../utils/icsUtils';
import { getHolidayName, isJewishHoliday } from '../utils/jewishHolidays';
import { PageHeader, Modal, ConfirmDialog, Badge, Spinner } from '../components/ui';
import TreatmentDialog from '../components/shared/TreatmentDialog';
import { formatDate, APPOINTMENT_STATUSES } from '../utils/formatters';
import {
  ChevronRight, ChevronLeft, Plus, Download, Upload,
  Calendar as CalIcon, Clock, X, Pencil, Trash2, FileText
} from 'lucide-react';
import { motion } from 'framer-motion';

const VIEWS = ['day', 'week', 'month'];
const VIEW_LABELS = { day: 'יום', week: 'שבוע', month: 'חודש' };
const HOURS = Array.from({ length: 14 }, (_, i) => i + 7); // 07:00 – 20:00
const DAYS_HE = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];
const MONTHS_HE = ['ינואר','פברואר','מרץ','אפריל','מאי','יוני','יולי','אוגוסט','ספטמבר','אוקטובר','נובמבר','דצמבר'];

function toDateStr(d) { return d.toISOString().slice(0, 10); }
function isoToDate(s) { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); }

export default function CalendarPage() {
  const { user } = useAuth();
  const [view, setView] = useState('week');
  const [cursor, setCursor] = useState(new Date());
  const [appointments, setAppointments] = useState([]);
  const [patients, setPatients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [apptModal, setApptModal] = useState(null); // {date, appt}
  const [treatModal, setTreatModal] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);

  useEffect(() => { loadAll(); }, [user]);

  async function loadAll() {
    if (!user?.email) return;
    setLoading(true);
    try {
      const [a, p] = await Promise.all([
        getAppointments(user.email),
        getPatients(user.email),
      ]);
      setAppointments(a);
      setPatients(p);
    } finally { setLoading(false); }
  }

  const patientMap = Object.fromEntries(patients.map(p => [p.id, p]));

  // Navigation
  const navigate = (dir) => {
    const d = new Date(cursor);
    if (view === 'day')   d.setDate(d.getDate() + dir);
    if (view === 'week')  d.setDate(d.getDate() + dir * 7);
    if (view === 'month') d.setMonth(d.getMonth() + dir);
    setCursor(d);
  };

  // Get visible dates
  function getWeekDates(d) {
    const day = d.getDay();
    const sunday = new Date(d); sunday.setDate(d.getDate() - day);
    return Array.from({ length: 7 }, (_, i) => { const x = new Date(sunday); x.setDate(sunday.getDate() + i); return x; });
  }

  function getMonthDates(d) {
    const first = new Date(d.getFullYear(), d.getMonth(), 1);
    const last  = new Date(d.getFullYear(), d.getMonth() + 1, 0);
    const startDay = first.getDay();
    const days = [];
    for (let i = 0; i < startDay; i++) { const x = new Date(first); x.setDate(x.getDate() - (startDay - i)); days.push(x); }
    for (let i = 1; i <= last.getDate(); i++) days.push(new Date(d.getFullYear(), d.getMonth(), i));
    const remaining = 42 - days.length;
    for (let i = 1; i <= remaining; i++) { const x = new Date(last); x.setDate(last.getDate() + i); days.push(x); }
    return days;
  }

  function getAppointmentsForDate(dateStr) {
    return appointments.filter(a => a.date === dateStr).sort((a, b) => (a.start_time || '').localeCompare(b.start_time || ''));
  }

  // Export ICS
  const handleExport = () => {
    const content = exportToICS(appointments, patients);
    downloadFile(content, 'clinic-appointments.ics');
  };

  // Import ICS
  const handleImport = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const text = await file.text();
    const events = parseICS(text);
    let created = 0;
    for (const ev of events) {
      // Try to match patient by name
      const patient = patients.find(p =>
        p.full_name?.toLowerCase().includes(ev.patient_name_hint?.toLowerCase() || '')
      );
      if (ev.date) {
        await createAppointment({
          date: ev.date,
          start_time: ev.start_time || '09:00',
          duration_minutes: 45,
          status: 'scheduled',
          patient_id: patient?.id || null,
          notes: ev.description || ev.summary || '',
        });
        created++;
      }
    }
    alert(`יובאו ${created} תורים`);
    loadAll();
  };

  const handleDeleteAppt = async () => {
    await deleteAppointment(deleteTarget.id);
    loadAll();
  };

  const title = view === 'day'
    ? `${DAYS_HE[cursor.getDay()]}, ${formatDate(toDateStr(cursor))}`
    : view === 'week'
      ? `שבוע ${formatDate(toDateStr(getWeekDates(cursor)[0]))} – ${formatDate(toDateStr(getWeekDates(cursor)[6]))}`
      : `${MONTHS_HE[cursor.getMonth()]} ${cursor.getFullYear()}`;

  return (
    <div className="space-y-4 h-full flex flex-col">
      <PageHeader
        title="יומן טיפולים"
        actions={
          <div className="flex gap-2">
            <button onClick={handleExport} className="btn-secondary flex items-center gap-1.5 text-sm">
              <Download className="w-4 h-4" /> ייצוא ICS
            </button>
            <label className="btn-secondary flex items-center gap-1.5 text-sm cursor-pointer">
              <Upload className="w-4 h-4" /> ייבוא ICS
              <input type="file" accept=".ics" className="hidden" onChange={handleImport} />
            </label>
            <button onClick={() => setApptModal({ date: toDateStr(cursor) })} className="btn-primary flex items-center gap-2">
              <Plus className="w-4 h-4" /> תור חדש
            </button>
          </div>
        }
      />

      {/* View switcher + navigation */}
      <div className="card flex items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <button onClick={() => navigate(-1)} className="p-1.5 hover:bg-gray-100 rounded-lg"><ChevronRight className="w-5 h-5" /></button>
          <span className="text-sm font-semibold text-gray-900 min-w-48 text-center">{title}</span>
          <button onClick={() => navigate(1)} className="p-1.5 hover:bg-gray-100 rounded-lg"><ChevronLeft className="w-5 h-5" /></button>
          <button onClick={() => setCursor(new Date())} className="text-xs text-teal-600 hover:underline px-2">היום</button>
        </div>

        <div className="flex gap-1 bg-gray-100 p-1 rounded-xl">
          {VIEWS.map(v => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={`px-3 py-1.5 text-sm rounded-lg transition-all ${view === v ? 'bg-white shadow-sm font-medium text-teal-700' : 'text-gray-500 hover:text-gray-700'}`}
            >
              {VIEW_LABELS[v]}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><Spinner size="lg" /></div>
      ) : (
        <>
          {view === 'day' && (
            <DayView
              date={cursor}
              appts={getAppointmentsForDate(toDateStr(cursor))}
              patientMap={patientMap}
              onNew={(time) => setApptModal({ date: toDateStr(cursor), time })}
              onEdit={(a) => setApptModal({ date: a.date, appt: a })}
              onTreat={(a) => setTreatModal(a)}
              onDelete={(a) => setDeleteTarget(a)}
            />
          )}
          {view === 'week' && (
            <WeekView
              dates={getWeekDates(cursor)}
              getAppts={getAppointmentsForDate}
              patientMap={patientMap}
              onNew={(date) => setApptModal({ date })}
              onEdit={(a) => setApptModal({ date: a.date, appt: a })}
              onTreat={(a) => setTreatModal(a)}
              onDelete={(a) => setDeleteTarget(a)}
            />
          )}
          {view === 'month' && (
            <MonthView
              dates={getMonthDates(cursor)}
              currentMonth={cursor.getMonth()}
              getAppts={getAppointmentsForDate}
              patientMap={patientMap}
              onNew={(date) => setApptModal({ date })}
              onEdit={(a) => setApptModal({ date: a.date, appt: a })}
            />
          )}
        </>
      )}

      {/* Appointment Form Modal */}
      {apptModal !== null && (
        <AppointmentModal
          open={true}
          initialDate={apptModal.date}
          initialTime={apptModal.time}
          appointment={apptModal.appt}
          patients={patients}
          therapistEmail={user?.email}
          onClose={() => setApptModal(null)}
          onSaved={() => { setApptModal(null); loadAll(); }}
        />
      )}

      {/* Treatment Modal */}
      {treatModal && (
        <TreatmentDialog
          open={!!treatModal}
          appointment={treatModal}
          patient={patientMap[treatModal.patient_id]}
          onClose={() => setTreatModal(null)}
          onSaved={() => { setTreatModal(null); loadAll(); }}
        />
      )}

      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDeleteAppt}
        title="מחיקת תור"
        message="האם למחוק את התור? לא ניתן לבטל פעולה זו."
        confirmLabel="מחק"
        danger
      />
    </div>
  );
}

/* ── Day View ──────────────────────────────────────────── */
function DayView({ date, appts, patientMap, onNew, onEdit, onTreat, onDelete }) {
  const dateStr = toDateStr(date);
  const holiday = getHolidayName(dateStr);
  const today = toDateStr(new Date());

  return (
    <div className="card flex-1 overflow-y-auto">
      {holiday && (
        <div className="mb-3 text-center text-sm text-orange-700 bg-orange-50 rounded-lg py-1.5">
          🎉 {holiday}
        </div>
      )}
      <div className="space-y-1">
        {HOURS.map(h => {
          const time = `${String(h).padStart(2, '0')}:00`;
          const slotAppts = appts.filter(a => (a.start_time || '').startsWith(String(h).padStart(2, '0')));
          return (
            <div key={h} className="flex gap-2 min-h-12">
              <span className="text-xs text-gray-400 w-12 text-left pt-1 flex-shrink-0" dir="ltr">{time}</span>
              <div
                className="flex-1 border-t border-gray-100 relative cursor-pointer hover:bg-gray-50 rounded-lg transition-all"
                onClick={() => onNew(time)}
              >
                {slotAppts.map(a => (
                  <ApptChip key={a.id} a={a} patient={patientMap[a.patient_id]} onEdit={onEdit} onTreat={onTreat} onDelete={onDelete} />
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ── Week View ─────────────────────────────────────────── */
function WeekView({ dates, getAppts, patientMap, onNew, onEdit, onTreat, onDelete }) {
  const today = toDateStr(new Date());
  return (
    <div className="card overflow-x-auto">
      <div className="grid grid-cols-7 gap-1 min-w-[700px]">
        {dates.map(d => {
          const ds = toDateStr(d);
          const holiday = getHolidayName(ds);
          const isToday = ds === today;
          const appts = getAppts(ds);
          return (
            <div key={ds} className="min-h-32">
              <div
                className={`p-1.5 text-center rounded-lg mb-1 cursor-pointer hover:bg-gray-50
                  ${isToday ? 'bg-teal-50' : ''}
                  ${holiday ? 'bg-orange-50' : ''}
                `}
                onClick={() => onNew(ds)}
              >
                <p className="text-xs text-gray-400">{DAYS_HE[d.getDay()]}</p>
                <p className={`text-sm font-bold ${isToday ? 'text-teal-700' : 'text-gray-900'}`}>{d.getDate()}</p>
                {holiday && <p className="text-xs text-orange-600 truncate">{holiday}</p>}
              </div>
              <div className="space-y-0.5">
                {appts.map(a => (
                  <div
                    key={a.id}
                    className="text-xs p-1 bg-teal-100 text-teal-800 rounded cursor-pointer hover:bg-teal-200 truncate"
                    onClick={() => onEdit(a)}
                    title={patientMap[a.patient_id]?.full_name}
                  >
                    {a.start_time} {patientMap[a.patient_id]?.full_name || '—'}
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ── Month View ────────────────────────────────────────── */
function MonthView({ dates, currentMonth, getAppts, patientMap, onNew, onEdit }) {
  const today = toDateStr(new Date());
  return (
    <div className="card">
      <div className="grid grid-cols-7 mb-1">
        {DAYS_HE.map(d => (
          <div key={d} className="text-center text-xs text-gray-400 py-1">{d}</div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {dates.map((d, i) => {
          const ds = toDateStr(d);
          const isCurrent = d.getMonth() === currentMonth;
          const isToday = ds === today;
          const holiday = getHolidayName(ds);
          const appts = getAppts(ds);
          return (
            <div
              key={i}
              className={`min-h-20 p-1 rounded-lg border cursor-pointer hover:bg-gray-50 transition-all
                ${isCurrent ? 'border-gray-100' : 'border-transparent opacity-40'}
                ${isToday ? 'border-teal-300 bg-teal-50' : ''}
                ${holiday ? 'border-orange-200 bg-orange-50' : ''}
              `}
              onClick={() => onNew(ds)}
            >
              <p className={`text-xs font-medium text-center ${isToday ? 'text-teal-700' : 'text-gray-700'}`}>{d.getDate()}</p>
              {holiday && <p className="text-xs text-orange-600 truncate">{holiday}</p>}
              {appts.slice(0, 2).map(a => (
                <div key={a.id} className="text-xs truncate text-teal-700 hover:underline" onClick={e => { e.stopPropagation(); onEdit(a); }}>
                  · {patientMap[a.patient_id]?.full_name || '—'}
                </div>
              ))}
              {appts.length > 2 && <p className="text-xs text-gray-400">+{appts.length - 2} נוספים</p>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ── Appointment Chip (Day view) ───────────────────────── */
function ApptChip({ a, patient, onEdit, onTreat, onDelete }) {
  const colors = {
    scheduled: 'bg-blue-100 border-blue-300 text-blue-900',
    completed: 'bg-green-100 border-green-300 text-green-900',
    cancelled: 'bg-red-100 border-red-300 text-red-900',
    missed:    'bg-orange-100 border-orange-300 text-orange-900',
  };
  return (
    <div className={`mb-1 p-2 rounded-lg border text-xs group relative ${colors[a.status] || colors.scheduled}`}>
      <div className="flex items-center justify-between">
        <span className="font-semibold">{patient?.full_name || '—'}</span>
        <span>{a.start_time}</span>
      </div>
      <div className="flex gap-1 mt-1 opacity-0 group-hover:opacity-100 transition-all">
        <button onClick={() => onEdit(a)} className="hover:bg-white/50 rounded p-0.5"><Pencil className="w-3 h-3" /></button>
        {a.status === 'scheduled' && (
          <button onClick={() => onTreat(a)} className="hover:bg-white/50 rounded p-0.5"><FileText className="w-3 h-3" /></button>
        )}
        <button onClick={() => onDelete(a)} className="hover:bg-white/50 rounded p-0.5"><Trash2 className="w-3 h-3" /></button>
      </div>
    </div>
  );
}

/* ── Appointment Create/Edit Modal ─────────────────────── */
function AppointmentModal({ open, onClose, onSaved, initialDate, initialTime, appointment, patients, therapistEmail }) {
  const isEdit = !!appointment;
  const [form, setForm] = useState({
    patient_id: '', date: initialDate || '', start_time: initialTime || '09:00',
    duration_minutes: 45, notes: '', status: 'scheduled', cancel_reason: '',
  });
  const [recurring, setRecurring] = useState(false);
  const [recurCount, setRecurCount] = useState(4);
  const [recurDays, setRecurDays] = useState(7);
  const [saving, setSaving] = useState(false);
  const [overlapWarn, setOverlapWarn] = useState([]);

  useEffect(() => {
    if (appointment) {
      setForm({
        patient_id: appointment.patient_id || '',
        date: appointment.date || initialDate || '',
        start_time: appointment.start_time || initialTime || '09:00',
        duration_minutes: appointment.duration_minutes || 45,
        notes: appointment.notes || '',
        status: appointment.status || 'scheduled',
        cancel_reason: appointment.cancel_reason || '',
      });
    } else {
      setForm(f => ({ ...f, date: initialDate || '', start_time: initialTime || '09:00' }));
    }
  }, [open]);

  const set = k => e => setForm(f => ({ ...f, [k]: e.target.value }));

  const checkAndSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      // Check overlap
      const overlaps = await checkOverlap(therapistEmail, form.date, form.start_time, Number(form.duration_minutes), appointment?.id);
      if (overlaps.length > 0) {
        setOverlapWarn(overlaps);
        setSaving(false);
        return;
      }

      if (isEdit) {
        await updateAppointment(appointment.id, form);
      } else if (recurring) {
        await createRecurringSeries({ ...form }, recurCount, recurDays);
      } else {
        await createAppointment(form);
      }
      onSaved();
    } finally { setSaving(false); }
  };

  return (
    <Modal open={open} onClose={onClose} title={isEdit ? 'עריכת תור' : 'תור חדש'}>
      <form onSubmit={checkAndSave} className="space-y-4">
        {overlapWarn.length > 0 && (
          <div className="bg-orange-50 border border-orange-200 rounded-xl p-3 text-sm text-orange-800">
            ⚠️ יש חפיפה עם {overlapWarn.length} תור/ים קיים/ים באותו זמן!
          </div>
        )}

        <div>
          <label className="label">מטופל *</label>
          <select className="input" value={form.patient_id} onChange={set('patient_id')} required>
            <option value="">בחר מטופל...</option>
            {patients.map(p => <option key={p.id} value={p.id}>{p.full_name}</option>)}
          </select>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label">תאריך *</label>
            <input type="date" className="input" value={form.date} onChange={set('date')} required />
          </div>
          <div>
            <label className="label">שעה</label>
            <input type="time" className="input" value={form.start_time} onChange={set('start_time')} dir="ltr" />
          </div>
        </div>

        <div>
          <label className="label">משך (דקות)</label>
          <select className="input" value={form.duration_minutes} onChange={set('duration_minutes')}>
            {[30, 45, 60, 90].map(d => <option key={d} value={d}>{d} דקות</option>)}
          </select>
        </div>

        {isEdit && (
          <div>
            <label className="label">סטטוס</label>
            <select className="input" value={form.status} onChange={set('status')}>
              <option value="scheduled">מתוכנן</option>
              <option value="completed">הושלם</option>
              <option value="cancelled">בוטל</option>
              <option value="missed">החמצה</option>
            </select>
          </div>
        )}

        {(form.status === 'cancelled') && (
          <div>
            <label className="label">סיבת ביטול</label>
            <input className="input" value={form.cancel_reason} onChange={set('cancel_reason')} />
          </div>
        )}

        <div>
          <label className="label">הערות</label>
          <textarea className="input resize-none" rows={2} value={form.notes} onChange={set('notes')} />
        </div>

        {!isEdit && (
          <div className="border-t border-gray-100 pt-3">
            <div className="flex items-center gap-2 mb-3">
              <input type="checkbox" id="recurring" checked={recurring} onChange={e => setRecurring(e.target.checked)} />
              <label htmlFor="recurring" className="text-sm font-medium text-gray-700">סדרת תורים חוזרים</label>
            </div>
            {recurring && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">מספר תורים</label>
                  <input type="number" className="input" min={2} max={52} value={recurCount} onChange={e => setRecurCount(e.target.value)} />
                </div>
                <div>
                  <label className="label">כל כמה ימים</label>
                  <input type="number" className="input" min={1} max={60} value={recurDays} onChange={e => setRecurDays(e.target.value)} />
                </div>
              </div>
            )}
          </div>
        )}

        <div className="flex gap-2">
          <button type="button" className="btn-secondary flex-1" onClick={onClose}>ביטול</button>
          <button type="submit" disabled={saving} className="btn-primary flex-1">
            {saving ? 'שומר...' : isEdit ? 'עדכן' : recurring ? `צור ${recurCount} תורים` : 'שמור'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
