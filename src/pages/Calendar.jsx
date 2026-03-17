// src/pages/Calendar.jsx
import { useState, useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import {
  getAppointments, createAppointment, updateAppointment,
  deleteAppointment, checkOverlap, createRecurringSeries
} from '../services/appointments';
import { getPatients } from '../services/patients';
import { exportToICS, downloadFile } from '../utils/icsUtils';
import { getHolidayName } from '../utils/jewishHolidays';
import { Modal, ConfirmDialog, Spinner } from '../components/ui';
import TreatmentDialog from '../components/shared/TreatmentDialog';
import { formatDate } from '../utils/formatters';
import {
  ChevronRight, ChevronLeft, Plus, Download,
  Calendar as CalIcon, Clock, Target, PlusCircle, Pencil
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

const VIEWS = ['day', 'week', 'month'];
const VIEW_LABELS = { day: 'יום', week: 'שבוע', month: 'חודש' };
const HOURS = Array.from({ length: 14 }, (_, i) => i + 7);
const DAYS_HE = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];
const DAYS_SHORT_HE = ['א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ש'];
const MONTHS_HE = ['ינואר','פברואר','מרץ','אפריל','מאי','יוני','יולי','אוגוסט','ספטמבר','אוקטובר','נובמבר','דצמבר'];

function toDateStr(d) { return d.toISOString().slice(0, 10); }

function getHebrewDateParts(date) {
  const formatter = new Intl.DateTimeFormat('he-u-ca-hebrew', { day: 'numeric', month: 'long' });
  const parts = formatter.format(date).split(' ');
  return { day: parts[0], month: parts[1] };
}

export default function CalendarPage() {
  const { user } = useAuth();
  const [view, setView] = useState(window.innerWidth < 768 ? 'month' : 'week');
  const [cursor, setCursor] = useState(new Date());
  const [appointments, setAppointments] = useState([]);
  const [patients, setPatients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [apptModal, setApptModal] = useState(null); 
  const [treatModal, setTreatModal] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const dateInputRef = useRef(null);

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

  const navigate = (dir) => {
    const d = new Date(cursor);
    if (view === 'day') d.setDate(d.getDate() + dir);
    else if (view === 'week') d.setDate(d.getDate() + dir * 7);
    else d.setMonth(d.getMonth() + dir);
    setCursor(d);
  };

  const handleDaySelect = (date) => {
    setCursor(date);
    setView('day');
  };

  const getWeekDates = (d) => {
    const day = d.getDay();
    const sunday = new Date(d); sunday.setDate(d.getDate() - day);
    return Array.from({ length: 7 }, (_, i) => { const x = new Date(sunday); x.setDate(sunday.getDate() + i); return x; });
  };

  const getMonthDates = (d) => {
    const first = new Date(d.getFullYear(), d.getMonth(), 1);
    const startDay = first.getDay();
    const days = [];
    for (let i = 0; i < startDay; i++) {
        const x = new Date(first); x.setDate(x.getDate() - (startDay - i)); days.push(x);
    }
    const last = new Date(d.getFullYear(), d.getMonth() + 1, 0);
    for (let i = 1; i <= last.getDate(); i++) days.push(new Date(d.getFullYear(), d.getMonth(), i));
    while(days.length < 42) {
        const x = new Date(days[days.length-1]); x.setDate(x.getDate() + 1); days.push(x);
    }
    return days;
  };

  const getAppointmentsForDate = (dateStr) => {
    return appointments.filter(a => a.date === dateStr).sort((a, b) => (a.start_time || '').localeCompare(b.start_time || ''));
  };

  const handleExport = () => {
    const content = exportToICS(appointments, patients);
    downloadFile(content, 'clinic-appointments.ics');
  };

  const handleDeleteAppt = async () => {
    await deleteAppointment(deleteTarget.id);
    setDeleteTarget(null);
    loadAll();
  };

  const title = view === 'day'
    ? `${DAYS_HE[cursor.getDay()]}, ${formatDate(toDateStr(cursor))}`
    : view === 'week'
      ? `שבוע ${formatDate(toDateStr(getWeekDates(cursor)[0]))}`
      : `${MONTHS_HE[cursor.getMonth()]} ${cursor.getFullYear()}`;

  return (
    <div className="flex flex-col min-h-screen bg-gray-50 p-2 md:p-6 pb-20">
      <div className="flex items-center justify-between mb-6 px-2 max-w-7xl mx-auto w-full">
        <div className="flex items-center gap-3">
            <div className="p-2.5 bg-teal-500 rounded-2xl text-white shadow-lg shadow-teal-100">
                <CalIcon className="w-5 h-5" />
            </div>
            <div>
                <h1 className="text-xl md:text-2xl font-black text-gray-800 leading-none">יומן טיפולים</h1>
                <p className="text-[10px] text-gray-400 font-bold mt-1 uppercase tracking-widest">Workspace</p>
            </div>
        </div>
        <div className="flex gap-2">
            <button onClick={handleExport} className="hidden md:flex items-center gap-2 p-3 text-gray-500 hover:bg-white rounded-xl border border-transparent hover:border-gray-200 transition-all">
                <Download className="w-5 h-5"/>
                <span className="text-xs font-bold">ייצוא</span>
            </button>
            <button 
                onClick={() => setApptModal({ date: toDateStr(cursor) })}
                className="bg-teal-500 text-white px-4 md:px-6 h-12 rounded-2xl shadow-lg shadow-teal-200 flex items-center gap-2 active:scale-95 transition-all"
            >
                <Plus className="w-6 h-6" />
                <span className="hidden md:inline font-bold">תור חדש</span>
            </button>
        </div>
      </div>

      <div className="max-w-7xl mx-auto w-full space-y-4 flex-1 flex flex-col">
        <div className="bg-white rounded-[2rem] p-4 shadow-sm border border-gray-100 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center justify-between md:justify-start md:gap-8 flex-1">
              <button onClick={() => navigate(-1)} className="p-2 hover:bg-gray-50 rounded-full transition-colors text-gray-400 hover:text-teal-500"><ChevronRight className="w-6 h-6" /></button>
              
              <div className="text-center relative">
                  <button 
                    onClick={() => dateInputRef.current?.showPicker()} 
                    className="group flex flex-col items-center min-w-[160px]"
                  >
                      <div className="text-lg md:text-xl font-black text-gray-800 leading-tight group-hover:text-teal-600 transition-colors flex items-center gap-2">
                          {title}
                          <CalIcon className="w-4 h-4 text-gray-300 group-hover:text-teal-400" />
                      </div>
                      <div className="text-[11px] font-bold text-teal-600 uppercase tracking-widest mt-0.5">
                          {getHebrewDateParts(cursor).day} {getHebrewDateParts(cursor).month}
                      </div>
                      <input 
                        ref={dateInputRef}
                        type="date" 
                        className="absolute inset-0 opacity-0 pointer-events-none" 
                        onChange={(e) => e.target.value && setCursor(new Date(e.target.value))}
                      />
                  </button>
              </div>

              <button onClick={() => navigate(1)} className="p-2 hover:bg-gray-50 rounded-full transition-colors text-gray-400 hover:text-teal-500"><ChevronLeft className="w-6 h-6" /></button>
          </div>
          
          <div className="flex items-center gap-2 bg-gray-100/60 p-1.5 rounded-2xl md:min-w-[350px]">
            {VIEWS.map(v => (
              <button
                key={v}
                onClick={() => setView(v)}
                className={`flex-1 py-2 text-xs font-black rounded-xl transition-all ${view === v ? 'bg-white shadow-sm text-teal-600' : 'text-gray-400'}`}
              >
                {VIEW_LABELS[v]}
              </button>
            ))}
            <button 
              onClick={() => setCursor(new Date())} 
              className="p-2 text-teal-600 hover:bg-white rounded-xl transition-all shadow-sm bg-white/50"
            >
              <Target className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="flex-1 relative min-h-[600px]">
          <AnimatePresence mode="wait">
            {loading ? (
              <div className="flex justify-center p-20"><Spinner size="lg" /></div>
            ) : (
              <motion.div 
                key={view + cursor.toISOString()}
                initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}
                className="h-full"
              >
                {view === 'day' && (
                  <DayView 
                      date={cursor} appts={getAppointmentsForDate(toDateStr(cursor))} patientMap={patientMap}
                      onNew={(time) => setApptModal({ date: toDateStr(cursor), time })}
                      onEdit={(a) => setApptModal({ date: a.date, appt: a })}
                      onTreat={(a) => setTreatModal(a)} onDelete={(a) => setDeleteTarget(a)}
                  />
                )}
                {view === 'week' && (
                  <WeekView 
                      dates={getWeekDates(cursor)} getAppts={getAppointmentsForDate} patientMap={patientMap}
                      onNew={(date) => setApptModal({ date })} onEdit={(a) => setApptModal({ date: a.date, appt: a })}
                  />
                )}
                {view === 'month' && (
                  <MonthView 
                      dates={getMonthDates(cursor)} currentMonth={cursor.getMonth()} getAppts={getAppointmentsForDate} patientMap={patientMap}
                      onSelectDay={handleDaySelect}
                  />
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {apptModal && (
        <AppointmentModal
          open={true} initialDate={apptModal.date} initialTime={apptModal.time}
          appointment={apptModal.appt} patients={patients} therapistEmail={user?.email}
          onClose={() => setApptModal(null)} onSaved={() => { setApptModal(null); loadAll(); }}
        />
      )}
      
      {treatModal && (
        <TreatmentDialog
          open={!!treatModal} 
          appointment={treatModal}
          appointmentId={treatModal.id}
          treatmentId={treatModal.treatment_id}
          treatment={treatModal.treatment_id ? { id: treatModal.treatment_id } : null}
          patient={patientMap[treatModal.patient_id]}
          onClose={() => setTreatModal(null)} 
          onSaved={() => { setTreatModal(null); loadAll(); }}
        />
      )}
      
      <ConfirmDialog
        open={!!deleteTarget} onClose={() => setDeleteTarget(null)} onConfirm={handleDeleteAppt}
        title="מחיקת תור" message="האם למחוק את התור?" confirmLabel="מחק" danger
      />
    </div>
  );
}

/* ── Day View ──────────────────────────────────────────── */
function DayView({ date, appts, patientMap, onNew, onEdit, onTreat }) {
  const dateStr = toDateStr(date);
  const holiday = getHolidayName(dateStr);
  return (
    <div className="bg-white rounded-[2.5rem] p-6 h-full shadow-sm border border-gray-100 overflow-y-auto max-h-[80vh]">
      {holiday && <div className="mb-6 text-center text-xs font-bold text-orange-600 bg-orange-50 rounded-2xl py-3 uppercase tracking-wide">🎉 {holiday}</div>}
      <div className="space-y-4">
        {HOURS.map(h => {
          const time = `${String(h).padStart(2, '0')}:00`;
          const slotAppts = appts.filter(a => (a.start_time || '').startsWith(String(h).padStart(2, '0')));
          return (
            <div key={h} className="flex gap-6 min-h-[80px] border-b border-gray-50 last:border-0 group">
              <span className="text-xs font-black text-gray-300 w-12 pt-1 transition-colors group-hover:text-teal-400" dir="ltr">{time}</span>
              <div className="flex-1 pb-4" onClick={() => onNew(time)}>
                {slotAppts.length > 0 ? slotAppts.map(a => (
                  <div key={a.id} className="mb-2 p-4 bg-teal-50/50 rounded-3xl border-r-4 border-teal-500 flex justify-between items-center group/item shadow-sm hover:shadow-md transition-all cursor-pointer" onClick={(e) => { e.stopPropagation(); onEdit(a); }}>
                    <div>
                        <div className="font-black text-teal-900 text-base">{patientMap[a.patient_id]?.full_name || '—'}</div>
                        <div className="text-xs text-teal-600 font-bold mt-1 flex items-center gap-1.5"><Clock className="w-3.5 h-3.5"/> {a.start_time} ({a.duration_minutes || 45} דק')</div>
                    </div>
                    <div className="flex gap-2">
                        <button 
                            onClick={(e) => { e.stopPropagation(); onTreat(a); }} 
                            className={`p-3 rounded-2xl shadow-sm border transition-all flex items-center gap-2 ${
                              a.treatment_id 
                              ? 'bg-amber-50 text-amber-600 border-amber-100 hover:bg-amber-600 hover:text-white' 
                              : 'bg-white text-teal-600 border-teal-100 hover:bg-teal-600 hover:text-white'
                            }`}
                            title={a.treatment_id ? "ערוך תיעוד" : "התחל טיפול"}
                        >
                            {a.treatment_id ? <Pencil className="w-5 h-5"/> : <PlusCircle className="w-5 h-5"/>}
                            <span className="hidden md:inline text-xs font-bold">
                              {a.treatment_id ? 'ערוך תיעוד' : 'התחל טיפול'}
                            </span>
                        </button>
                    </div>
                  </div>
                )) : (
                  <div className="h-full w-full rounded-2xl border-2 border-dashed border-transparent hover:border-gray-100 transition-colors cursor-pointer" />
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ── Week View ─────────────────────────────────────────── */
function WeekView({ dates, getAppts, patientMap, onNew, onEdit }) {
  const today = toDateStr(new Date());
  return (
    <div className="bg-white rounded-[2.5rem] overflow-hidden h-full shadow-sm border border-gray-100 flex flex-col">
      <div className="grid grid-cols-7 gap-px bg-gray-100 flex-1">
        {dates.map(d => {
          const ds = toDateStr(d);
          const isToday = ds === today;
          const appts = getAppts(ds);
          return (
            <div key={ds} className={`bg-white min-h-[500px] flex flex-col ${isToday ? 'bg-teal-50/10' : ''}`}>
              <div className="p-4 text-center border-b border-gray-50 cursor-pointer hover:bg-gray-50 transition-colors" onClick={() => onNew(ds)}>
                <p className="text-[10px] text-gray-400 font-black uppercase tracking-widest">{DAYS_SHORT_HE[d.getDay()]}</p>
                <p className={`text-lg font-black mt-1 ${isToday ? 'text-teal-600' : 'text-gray-800'}`}>{d.getDate()}</p>
              </div>
              <div className="flex-1 p-2 space-y-2 overflow-y-auto">
                {appts.map(a => (
                  <div key={a.id} className="p-3 bg-teal-50/40 rounded-2xl border border-teal-100/50 text-[11px] cursor-pointer hover:shadow-sm hover:bg-teal-50 transition-all" onClick={() => onEdit(a)}>
                    <div className="font-black text-teal-900 truncate">{patientMap[a.patient_id]?.full_name || '—'}</div>
                    <div className="text-teal-500 font-bold mt-1">{a.start_time}</div>
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

/* ── Month View ─────────────────── */
function MonthView({ dates, currentMonth, getAppts, onSelectDay }) {
  const today = toDateStr(new Date());
  return (
    <div className="bg-white rounded-[2.5rem] p-6 h-full shadow-sm border border-gray-100 flex flex-col">
      <div className="grid grid-cols-7 mb-6">
        {DAYS_SHORT_HE.map(d => <div key={d} className="text-center text-[11px] font-black text-gray-300 uppercase tracking-widest">{d}</div>)}
      </div>
      <div className="grid grid-cols-7 gap-3 flex-1">
        {dates.map((d, i) => {
          const ds = toDateStr(d);
          const isCurrent = d.getMonth() === currentMonth;
          const isToday = ds === today;
          const appts = getAppts(ds);
          const heb = getHebrewDateParts(d);
          
          return (
            <div 
                key={i} 
                className={`
                    relative min-h-[85px] md:min-h-[100px] flex flex-col items-center justify-start pt-3 rounded-[2rem] transition-all active:scale-95 cursor-pointer
                    ${isCurrent ? 'bg-white' : 'opacity-20 pointer-events-none'}
                    ${isToday ? 'bg-teal-50 ring-2 ring-teal-500 ring-inset shadow-md' : 'bg-gray-50/40'}
                    hover:bg-teal-50/50 hover:shadow-sm
                `} 
                onClick={() => onSelectDay(d)}
            >
              <span className={`text-base font-black ${isToday ? 'text-teal-700' : 'text-gray-700'}`}>{d.getDate()}</span>
              <span className="text-[10px] font-bold text-gray-300 mt-0.5">{heb.day}</span>
              
              <div className="flex gap-1 mt-auto mb-4">
                {appts.slice(0, 3).map((a, idx) => (
                    <div key={idx} className={`w-1.5 h-1.5 rounded-full ${a.status === 'completed' ? 'bg-teal-500' : 'bg-teal-300'}`} />
                ))}
                {appts.length > 3 && <div className="w-1.5 h-1.5 rounded-full bg-gray-200" />}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ── Appointment Modal ── */
function AppointmentModal({ open, onClose, onSaved, initialDate, initialTime, appointment, patients, therapistEmail }) {
  const isEdit = !!appointment;
  const [form, setForm] = useState({
    patient_id: '', date: initialDate || '', start_time: initialTime || '09:00',
    duration_minutes: 45, notes: '', status: 'scheduled',
  });
  
  const [isCustomDuration, setIsCustomDuration] = useState(false);
  const [recurring, setRecurring] = useState(false);
  const [recurCount, setRecurCount] = useState(4);
  const [recurDays, setRecurDays] = useState(7);
  const [saving, setSaving] = useState(false);
  const [overlapWarn, setOverlapWarn] = useState([]);

  useEffect(() => {
    if (appointment) {
      setForm({ ...appointment });
      if (![30, 45, 60, 90].includes(Number(appointment.duration_minutes))) {
        setIsCustomDuration(true);
      }
    }
    else setForm(f => ({ ...f, date: initialDate || '', start_time: initialTime || '09:00' }));
  }, [open, appointment, initialDate, initialTime]);

  const handleDurationChange = (e) => {
    const val = e.target.value;
    if (val === 'custom') {
      setIsCustomDuration(true);
    } else {
      setIsCustomDuration(false);
      setForm({ ...form, duration_minutes: Number(val) });
    }
  };

  const checkAndSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const overlaps = await checkOverlap(therapistEmail, form.date, form.start_time, Number(form.duration_minutes), appointment?.id);
      if (overlaps.length > 0 && overlapWarn.length === 0) {
        setOverlapWarn(overlaps);
        setSaving(false);
        return;
      }
      if (isEdit) await updateAppointment(appointment.id, form);
      else if (recurring) await createRecurringSeries({ ...form, therapist_email: therapistEmail }, recurCount, recurDays);
      else await createAppointment({ ...form, therapist_email: therapistEmail });
      onSaved();
    } finally { setSaving(false); }
  };

  return (
    <Modal open={open} onClose={onClose} title={isEdit ? 'עריכת תור' : 'קביעת תור חדש'}>
      <form onSubmit={checkAndSave} className="space-y-5">
        {overlapWarn.length > 0 && (
          <div className="bg-orange-50 p-3 rounded-2xl text-[11px] text-orange-800 font-bold border border-orange-100">
            ⚠️ שים לב: קיימת חפיפה עם תור אחר. לחץ שוב לאישור.
          </div>
        )}
        <div className="space-y-1">
          <label className="text-[10px] font-black text-gray-400 mr-2 uppercase">מטופל/ת</label>
          <select className="w-full bg-gray-50 border-none rounded-2xl h-14 px-4 font-bold text-gray-800 focus:ring-2 focus:ring-teal-500 transition-all" value={form.patient_id} onChange={e => setForm({...form, patient_id: e.target.value})} required>
            <option value="">בחר מטופל...</option>
            {patients.map(p => <option key={p.id} value={p.id}>{p.full_name}</option>)}
          </select>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1">
            <label className="text-[10px] font-black text-gray-400 mr-2 uppercase">תאריך</label>
            <input type="date" className="w-full bg-gray-50 border-none rounded-2xl h-14 px-4 font-bold text-gray-800" value={form.date} onChange={e => setForm({...form, date: e.target.value})} required />
          </div>
          <div className="space-y-1">
            <label className="text-[10px] font-black text-gray-400 mr-2 uppercase">שעה</label>
            <input type="time" className="w-full bg-gray-50 border-none rounded-2xl h-14 px-4 font-bold text-gray-800" value={form.start_time} onChange={e => setForm({...form, start_time: e.target.value})} required />
          </div>
        </div>
        
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1">
              <label className="text-[10px] font-black text-gray-400 mr-2 uppercase">משך (דקות)</label>
              <div className="space-y-2">
                <select 
                    className="w-full bg-gray-50 border-none rounded-2xl h-14 px-4 font-bold text-gray-800" 
                    value={isCustomDuration ? 'custom' : form.duration_minutes} 
                    onChange={handleDurationChange}
                >
                    {[30, 45, 60, 90].map(d => <option key={d} value={d}>{d} דק'</option>)}
                    <option value="custom">אחר...</option>
                </select>
                {isCustomDuration && (
                    <motion.input 
                        initial={{ opacity: 0, y: -10 }}
                        animate={{ opacity: 1, y: 0 }}
                        type="number" 
                        placeholder="כמה דקות?" 
                        className="w-full bg-teal-50 border border-teal-100 rounded-xl h-10 px-4 font-bold text-teal-800 text-sm"
                        value={form.duration_minutes}
                        onChange={e => setForm({...form, duration_minutes: Number(e.target.value)})}
                        required
                    />
                )}
              </div>
          </div>
          {isEdit && (
            <div className="space-y-1">
               <label className="text-[10px] font-black text-gray-400 mr-2 uppercase">סטטוס</label>
               <select className="w-full bg-gray-50 border-none rounded-2xl h-14 px-4 font-bold text-gray-800" value={form.status} onChange={e => setForm({...form, status: e.target.value})}>
                 <option value="scheduled">מתוכנן</option>
                 <option value="completed">הושלם</option>
                 <option value="cancelled">בוטל</option>
               </select>
            </div>
          )}
        </div>

        {!isEdit && (
          <div className="p-4 bg-gray-50 rounded-[2rem] border border-gray-100">
            <label className="flex items-center gap-3 cursor-pointer">
              <input type="checkbox" checked={recurring} onChange={e => setRecurring(e.target.checked)} className="w-5 h-5 rounded-lg text-teal-600 border-none bg-white shadow-sm" />
              <span className="text-sm font-black text-gray-700">סדרת תורים קבועה</span>
            </label>
            {recurring && (
              <div className="grid grid-cols-2 gap-3 mt-4 animate-in fade-in slide-in-from-top-2">
                <input type="number" placeholder="כמות" className="h-12 bg-white rounded-xl border-none px-4 text-sm font-bold" value={recurCount} onChange={e => setRecurCount(e.target.value)} />
                <input type="number" placeholder="כל X ימים" className="h-12 bg-white rounded-xl border-none px-4 text-sm font-bold" value={recurDays} onChange={e => setRecurDays(e.target.value)} />
              </div>
            )}
          </div>
        )}
        <div className="flex gap-3 pt-2">
          <button type="button" onClick={onClose} className="flex-1 h-14 rounded-2xl font-black text-gray-400 bg-gray-100">ביטול</button>
          <button type="submit" disabled={saving} className="flex-1 h-14 rounded-2xl font-black text-white bg-teal-500 shadow-lg shadow-teal-100">
            {saving ? 'שומר...' : 'שמירה'}
          </button>
        </div>
      </form>
    </Modal>
  );
}