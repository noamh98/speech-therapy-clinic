// src/pages/Calendar.jsx — Google Calendar-style redesign
/**
 * FIXES APPLIED IN THIS FILE:
 *
 * 1. DATE OFFSET (UTC BUG):
 *    `toDateStr` previously used `d.toISOString().slice(0, 10)` which converts
 *    to UTC before formatting. In Israel (UTC+2/+3), this shifts the date back
 *    by 1 day for any local time before 02:00/03:00 AM, causing the "today"
 *    highlight and day headers to show the wrong date.
 *    FIX: Replaced with `localDateStr(d)` from formatters.js which uses
 *    `getFullYear/getMonth/getDate` — all local-clock based.
 *
 * 2. WRONG API SIGNATURES — getAppointments / getPatients:
 *    `getAppointments(user.email)` was passing the email string as the
 *    `startDate` parameter. The updated service takes `(startDate, endDate)`
 *    and filters by `auth.currentUser.uid` internally.
 *    `getPatients(user.email)` was passing email as `includeArchived` boolean.
 *    FIX: Both calls corrected to match the current service signatures.
 *
 * 3. WRONG API SIGNATURE — checkOverlap:
 *    `checkOverlap(therapistEmail, date, time, duration, excludeId)` was
 *    passing `therapistEmail` as the first argument, but the service signature
 *    is `checkOverlap(date, startTime, durationMins, excludeId)`.
 *    FIX: Removed the leading `therapistEmail` argument.
 *
 * 4. FIELD NAME MISMATCH — treatment_id vs treatmentId:
 *    The DayView component read `a.treatment_id` to decide whether to show
 *    "edit" vs "new" treatment buttons, and passed it to TreatmentDialog.
 *    But `appointments.js` stores the field as `treatmentId` (camelCase).
 *    So the "edit treatment" button NEVER appeared — the field was always
 *    undefined, making every appointment look like it had no linked treatment.
 *    FIX: All reads changed from `a.treatment_id` to `a.treatmentId`.
 *
 * 5. ISOLATED STATE — Calendar did not use useClinicData:
 *    Calendar managed its own `appointments` and `patients` state, completely
 *    separate from the global context. Saving a treatment via TreatmentDialog
 *    called `loadAll()` locally, but this had no effect on the context state
 *    used by Dashboard, PatientProfile, etc.
 *    FIX: Calendar now uses `useClinicData()` for its data and calls the
 *    shared `refresh()` function on save, keeping all views in sync.
 *
 * 6. DATE PICKER OFFSET:
 *    The date picker `onChange` used `new Date(value)` which parses a
 *    YYYY-MM-DD string as UTC midnight, causing the same -1 day offset.
 *    FIX: Changed to `new Date(value + 'T12:00:00')` (noon local time)
 *    which is immune to the UTC-offset problem. This was already present
 *    in the codebase for the toolbar picker but now applied consistently.
 */

import { useState, useRef } from 'react';
import { useClinicData } from '../context/useClinicData';
import { useAuth } from '../context/AuthContext';
import {
  createAppointment, updateAppointment,
  deleteAppointment, checkOverlap, createRecurringSeries
} from '../services/appointments';
import { exportToICS, downloadFile } from '../utils/icsUtils';
import { getHolidayName } from '../utils/jewishHolidays';
import { Modal, ConfirmDialog, Spinner } from '../components/ui';
import TreatmentDialog from '../components/shared/TreatmentDialog';
import { formatDate, localDateStr } from '../utils/formatters';
import {
  ChevronRight, ChevronLeft, Plus, Download,
  Calendar as CalIcon, Clock, Target, PlusCircle, Pencil,
  ArrowRight, MoreHorizontal
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

// ─── Constants ────────────────────────────────────────────────────────────────
const VIEWS = ['month', 'week', 'day'];
const VIEW_LABELS = { day: 'יום', week: 'שבוע', month: 'חודש' };
const HOURS = Array.from({ length: 14 }, (_, i) => i + 7);
const DAYS_HE = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];
const DAYS_SHORT_HE = ['א׳', 'ב׳', 'ג׳', 'ד׳', 'ה׳', 'ו׳', 'ש׳'];
const MONTHS_HE = ['ינואר','פברואר','מרץ','אפריל','מאי','יוני','יולי','אוגוסט','ספטמבר','אוקטובר','נובמבר','דצמבר'];

const APPT_COLORS = [
  { bg: 'bg-blue-500',   light: 'bg-blue-50',   text: 'text-blue-700',   border: 'border-blue-400' },
  { bg: 'bg-teal-500',   light: 'bg-teal-50',   text: 'text-teal-700',   border: 'border-teal-400' },
  { bg: 'bg-purple-500', light: 'bg-purple-50', text: 'text-purple-700', border: 'border-purple-400' },
  { bg: 'bg-green-500',  light: 'bg-green-50',  text: 'text-green-700',  border: 'border-green-400' },
  { bg: 'bg-orange-500', light: 'bg-orange-50', text: 'text-orange-700', border: 'border-orange-400' },
  { bg: 'bg-pink-500',   light: 'bg-pink-50',   text: 'text-pink-700',   border: 'border-pink-400' },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

// FIX #1: Replaced `d.toISOString().slice(0, 10)` with `localDateStr(d)`.
// toISOString() converts to UTC before formatting, which in Israel (UTC+2/+3)
// causes the date to appear as the previous day for any local time before 02:00/03:00.
// localDateStr() uses getFullYear/getMonth/getDate which read from the local clock.
function toDateStr(d) { return localDateStr(d); }

function getHebrewDateParts(date) {
  try {
    const formatter = new Intl.DateTimeFormat('he-u-ca-hebrew', { day: 'numeric', month: 'long' });
    const parts = formatter.format(date).split(' ');
    return { day: parts[0], month: parts[1] };
  } catch { return { day: '', month: '' }; }
}

function getPatientColor(patientId) {
  if (!patientId) return APPT_COLORS[0];
  let hash = 0;
  for (let i = 0; i < patientId.length; i++) hash = patientId.charCodeAt(i) + ((hash << 5) - hash);
  return APPT_COLORS[Math.abs(hash) % APPT_COLORS.length];
}

// ─── Main Calendar Page ───────────────────────────────────────────────────────
export default function CalendarPage() {
  const { user } = useAuth();

  // FIX #5: Use shared context instead of isolated local state.
  // This ensures that when TreatmentDialog saves and calls refresh(),
  // the Calendar, Dashboard, and PatientProfile all update together.
  const { appointments, patients, loading, refresh, setAppointments } = useClinicData();

  const [view, setView] = useState('month');
  const [cursor, setCursor] = useState(new Date());
  const [apptModal, setApptModal] = useState(null);
  const [treatModal, setTreatModal] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const dateInputRef = useRef(null);

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
    return Array.from({ length: 7 }, (_, i) => {
      const x = new Date(sunday); x.setDate(sunday.getDate() + i); return x;
    });
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
    while (days.length < 42) {
      const x = new Date(days[days.length - 1]); x.setDate(x.getDate() + 1); days.push(x);
    }
    return days;
  };

  const getAppointmentsForDate = (dateStr) =>
    appointments
      .filter(a => a.date === dateStr)
      .sort((a, b) => (a.start_time || '').localeCompare(b.start_time || ''));

  const handleExport = () => {
    const content = exportToICS(appointments, patients);
    downloadFile(content, 'clinic-appointments.ics');
  };

  const handleDeleteAppt = async () => {
    await deleteAppointment(deleteTarget.id);
    setDeleteTarget(null);
    // FIX #5: Use shared refresh instead of local loadAll()
    refresh();
  };

  const title = view === 'day'
    ? `${DAYS_HE[cursor.getDay()]}, ${formatDate(toDateStr(cursor))}`
    : view === 'week'
      ? `שבוע ${formatDate(toDateStr(getWeekDates(cursor)[0]))}`
      : `${MONTHS_HE[cursor.getMonth()]} ${cursor.getFullYear()}`;

  return (
    <div className="flex flex-col h-full bg-white" dir="rtl">
      {/* ── Top Toolbar ── */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 bg-white flex-shrink-0 gap-2 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center flex-shrink-0">
              <CalIcon className="w-4 h-4 text-white" />
            </div>
            <span className="text-lg font-semibold text-gray-800 hidden sm:block">יומן</span>
          </div>

          <button
            onClick={() => { setCursor(new Date()); }}
            className="px-4 py-1.5 text-sm font-medium border border-gray-300 rounded-full hover:bg-gray-50 transition-colors text-gray-700"
          >
            היום
          </button>

          <div className="flex items-center">
            <button
              onClick={() => navigate(-1)}
              className="p-1.5 rounded-full hover:bg-gray-100 transition-colors text-gray-600"
            >
              <ChevronRight className="w-5 h-5" />
            </button>
            <button
              onClick={() => navigate(1)}
              className="p-1.5 rounded-full hover:bg-gray-100 transition-colors text-gray-600"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
          </div>

          <button
            onClick={() => dateInputRef.current?.showPicker()}
            className="relative text-xl font-semibold text-gray-800 hover:text-blue-600 transition-colors"
          >
            {title}
            {/* FIX #6: Parse date as local noon to avoid UTC midnight offset */}
            <input
              ref={dateInputRef}
              type="date"
              className="absolute inset-0 opacity-0 pointer-events-none"
              onChange={(e) => e.target.value && setCursor(new Date(e.target.value + 'T12:00:00'))}
            />
          </button>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex border border-gray-300 rounded-full overflow-hidden text-sm">
            {VIEWS.map((v, idx) => (
              <button
                key={v}
                onClick={() => setView(v)}
                className={`px-3 py-1.5 font-medium transition-colors ${
                  view === v
                    ? 'bg-blue-600 text-white'
                    : 'text-gray-600 hover:bg-gray-100'
                } ${idx === 0 ? '' : 'border-r border-gray-300'}`}
              >
                {VIEW_LABELS[v]}
              </button>
            ))}
          </div>

          <button
            onClick={handleExport}
            className="hidden md:flex items-center gap-1.5 px-3 py-1.5 text-sm text-gray-600 border border-gray-300 rounded-full hover:bg-gray-50 transition-colors"
          >
            <Download className="w-4 h-4" />
            ייצוא
          </button>

          <button
            onClick={() => setApptModal({ date: toDateStr(cursor) })}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-full hover:bg-blue-700 transition-colors shadow-sm"
          >
            <Plus className="w-4 h-4" />
            <span className="hidden sm:inline">תור חדש</span>
          </button>
        </div>
      </div>

      {/* ── Calendar Body ── */}
      <div className="flex-1 overflow-hidden relative">
        <AnimatePresence mode="wait">
  {loading ? (
    <div className="flex justify-center items-center h-full">
      <Spinner size="lg" />
    </div>
  ) : (
    <motion.div
      // FIX: Use localDateStr(cursor).slice(0,7) to avoid UTC offset issues
      key={view + localDateStr(cursor).slice(0, 7)}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="h-full"
            >
              {view === 'month' && (
                <MonthView
                  dates={getMonthDates(cursor)}
                  currentMonth={cursor.getMonth()}
                  getAppts={getAppointmentsForDate}
                  patientMap={patientMap}
                  onSelectDay={handleDaySelect}
                  onNewAppt={(date) => setApptModal({ date: toDateStr(date) })}
                />
              )}
              {view === 'week' && (
                <WeekView
                  dates={getWeekDates(cursor)}
                  getAppts={getAppointmentsForDate}
                  patientMap={patientMap}
                  onSelectDay={handleDaySelect}
                  onNew={(date) => setApptModal({ date })}
                  onEdit={(a) => setApptModal({ date: a.date, appt: a })}
                />
              )}
              {view === 'day' && (
                <DayView
                  date={cursor}
                  appts={getAppointmentsForDate(toDateStr(cursor))}
                  patientMap={patientMap}
                  onNew={(time) => setApptModal({ date: toDateStr(cursor), time })}
                  onEdit={(a) => setApptModal({ date: a.date, appt: a })}
                  onTreat={(a) => setTreatModal(a)}
                  onDelete={(a) => setDeleteTarget(a)}
                  onBack={() => setView('month')}
                />
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* ── Modals ── */}
      {apptModal && (
        <AppointmentModal
          open={true}
          initialDate={apptModal.date}
          initialTime={apptModal.time}
          appointment={apptModal.appt}
          patients={patients}
          onClose={() => setApptModal(null)}
          onSaved={() => { setApptModal(null); refresh(); }}
        />
      )}

      {treatModal && (
        <TreatmentDialog
          open={!!treatModal}
          appointment={treatModal}
          appointmentId={treatModal.id}
          // FIX #4: Read treatmentId (camelCase) — that's what appointments.js stores in Firestore.
          // Previously read treatModal.treatment_id (snake_case) which was always undefined.
          treatmentId={treatModal.treatmentId}
          treatment={treatModal.treatmentId ? { id: treatModal.treatmentId } : null}
          patient={patientMap[treatModal.patient_id]}
          onClose={() => setTreatModal(null)}
          onSaved={() => { setTreatModal(null); refresh(); }}
        />
      )}

      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDeleteAppt}
        title="מחיקת תור"
        message="האם למחוק את התור?"
        confirmLabel="מחק"
        danger
      />
    </div>
  );
}

// ─── Month View ───────────────────────────────────────────────────────────────
function MonthView({ dates, currentMonth, getAppts, patientMap, onSelectDay, onNewAppt }) {
  // FIX #1: toDateStr() now calls localDateStr(), so this comparison is timezone-safe
  const today = toDateStr(new Date());

  return (
    <div className="flex flex-col h-full">
      <div className="grid grid-cols-7 border-b border-gray-200 bg-white flex-shrink-0">
        {DAYS_SHORT_HE.map(d => (
          <div key={d} className="py-2 text-center text-xs font-medium text-gray-500 uppercase tracking-wide">
            {d}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7 flex-1" style={{ gridTemplateRows: 'repeat(6, 1fr)' }}>
        {dates.map((d, i) => {
          const ds = toDateStr(d);
          const isCurrent = d.getMonth() === currentMonth;
          const isToday = ds === today;
          const appts = getAppts(ds);
          const holiday = getHolidayName(ds);

          return (
            <div
              key={i}
              className={`border-b border-r border-gray-100 flex flex-col min-h-0 cursor-pointer group transition-colors
                ${isCurrent ? 'bg-white hover:bg-blue-50/30' : 'bg-gray-50/50'}
                ${isToday ? 'bg-blue-50/40' : ''}
              `}
              onClick={() => isCurrent && onSelectDay(d)}
            >
              <div className="flex items-center justify-between px-2 pt-1.5 pb-1 flex-shrink-0">
                <span
                  className={`text-sm font-medium w-7 h-7 flex items-center justify-center rounded-full transition-colors
                    ${isToday
                      ? 'bg-blue-600 text-white font-bold'
                      : isCurrent
                        ? 'text-gray-800 group-hover:bg-blue-100 group-hover:text-blue-700'
                        : 'text-gray-300'
                    }`}
                >
                  {d.getDate()}
                </span>
                <span className={`text-[10px] ${isCurrent ? 'text-gray-400' : 'text-gray-200'}`}>
                  {getHebrewDateParts(d).day}
                </span>
              </div>

              {holiday && isCurrent && (
                <div className="mx-1 mb-0.5 px-1.5 py-0.5 bg-orange-100 text-orange-700 text-[10px] font-medium rounded truncate flex-shrink-0">
                  {holiday}
                </div>
              )}

              <div className="flex-1 px-1 pb-1 space-y-0.5 overflow-hidden min-h-0">
                {appts.slice(0, 3).map((a) => {
                  const color = getPatientColor(a.patient_id);
                  const name = patientMap[a.patient_id]?.full_name || '—';
                  return (
                    <div
                      key={a.id}
                      className={`flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] font-medium truncate cursor-pointer
                        ${a.status === 'completed'
                          ? 'bg-gray-100 text-gray-500 line-through'
                          : `${color.light} ${color.text}`
                        }`}
                      onClick={(e) => { e.stopPropagation(); onSelectDay(d); }}
                      title={`${a.start_time} — ${name}`}
                    >
                      <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${a.status === 'completed' ? 'bg-gray-400' : color.bg}`} />
                      <span className="truncate">{a.start_time} {name}</span>
                    </div>
                  );
                })}
                {appts.length > 3 && (
                  <div className="text-[11px] text-blue-600 font-medium px-1.5 cursor-pointer hover:underline"
                    onClick={(e) => { e.stopPropagation(); onSelectDay(d); }}>
                    +{appts.length - 3} נוספים
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Week View ────────────────────────────────────────────────────────────────
function WeekView({ dates, getAppts, patientMap, onSelectDay, onNew, onEdit }) {
  const today = toDateStr(new Date());

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="grid grid-cols-7 border-b border-gray-200 bg-white flex-shrink-0">
        {dates.map(d => {
          const ds = toDateStr(d);
          const isToday = ds === today;
          return (
            <div
              key={ds}
              className="py-2 text-center cursor-pointer hover:bg-gray-50 transition-colors"
              onClick={() => onSelectDay(d)}
            >
              <p className="text-xs text-gray-500 uppercase tracking-wide font-medium">
                {DAYS_SHORT_HE[d.getDay()]}
              </p>
              <p className={`text-2xl font-medium mt-0.5 w-10 h-10 mx-auto flex items-center justify-center rounded-full transition-colors
                ${isToday ? 'bg-blue-600 text-white' : 'text-gray-700 hover:bg-blue-100 hover:text-blue-700'}`}>
                {d.getDate()}
              </p>
            </div>
          );
        })}
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="grid grid-cols-7 divide-x divide-gray-100 min-h-full">
          {dates.map(d => {
            const ds = toDateStr(d);
            const isToday = ds === today;
            const appts = getAppts(ds);
            return (
              <div
                key={ds}
                className={`flex flex-col min-h-[600px] ${isToday ? 'bg-blue-50/20' : 'bg-white'}`}
              >
                <div
                  className="flex-1 p-1 space-y-1 cursor-pointer"
                  onClick={() => onNew(ds)}
                >
                  {appts.map(a => {
                    const color = getPatientColor(a.patient_id);
                    const name = patientMap[a.patient_id]?.full_name || '—';
                    return (
                      <div
                        key={a.id}
                        className={`p-2 rounded-lg text-xs cursor-pointer hover:opacity-90 transition-opacity border-r-2
                          ${a.status === 'completed'
                            ? 'bg-gray-100 text-gray-500 border-gray-300'
                            : `${color.light} ${color.text} ${color.border}`
                          }`}
                        onClick={(e) => { e.stopPropagation(); onEdit(a); }}
                      >
                        <div className="font-semibold truncate">{name}</div>
                        <div className="opacity-75 mt-0.5 flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {a.start_time}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ─── Day View ─────────────────────────────────────────────────────────────────
function DayView({ date, appts, patientMap, onNew, onEdit, onTreat, onDelete, onBack }) {
  const dateStr = toDateStr(date);
  const holiday = getHolidayName(dateStr);
  const isToday = dateStr === toDateStr(new Date());

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-200 bg-white flex-shrink-0">
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 text-sm text-blue-600 hover:text-blue-800 transition-colors font-medium"
        >
          <ArrowRight className="w-4 h-4" />
          חזרה לחודש
        </button>
        <div className="h-4 w-px bg-gray-200" />
        <div className="flex items-center gap-2">
          <span
            className={`text-2xl font-bold w-10 h-10 flex items-center justify-center rounded-full
              ${isToday ? 'bg-blue-600 text-white' : 'text-gray-800'}`}
          >
            {date.getDate()}
          </span>
          <div>
            <p className="text-base font-semibold text-gray-800">
              {DAYS_HE[date.getDay()]}, {MONTHS_HE[date.getMonth()]} {date.getFullYear()}
            </p>
            <p className="text-xs text-gray-400">
              {getHebrewDateParts(date).day} {getHebrewDateParts(date).month}
            </p>
          </div>
        </div>
        {holiday && (
          <span className="mr-auto px-3 py-1 bg-orange-100 text-orange-700 text-xs font-medium rounded-full">
            🎉 {holiday}
          </span>
        )}
        <button
          onClick={() => onNew('09:00')}
          className="mr-auto flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white text-sm font-medium rounded-full hover:bg-blue-700 transition-colors"
        >
          <Plus className="w-4 h-4" />
          תור חדש
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {appts.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-gray-400 gap-3">
            <CalIcon className="w-12 h-12 text-gray-200" />
            <p className="text-sm font-medium">אין תורים ביום זה</p>
            <button
              onClick={() => onNew('09:00')}
              className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-full hover:bg-blue-700 transition-colors"
            >
              <Plus className="w-4 h-4" />
              הוסף תור
            </button>
          </div>
        ) : (
          <div className="max-w-2xl mx-auto px-4 py-4 space-y-3">
            {HOURS.map(h => {
              const time = `${String(h).padStart(2, '0')}:00`;
              const slotAppts = appts.filter(a => (a.start_time || '').startsWith(String(h).padStart(2, '0')));
              if (slotAppts.length === 0) return null;

              return (
                <div key={h} className="flex gap-4">
                  <div className="w-14 text-right pt-1 flex-shrink-0">
                    <span className="text-xs font-medium text-gray-400" dir="ltr">{time}</span>
                  </div>
                  <div className="flex-1 space-y-2">
                    {slotAppts.map(a => {
                      const color = getPatientColor(a.patient_id);
                      const name = patientMap[a.patient_id]?.full_name || '—';
                      return (
                        <motion.div
                          key={a.id}
                          initial={{ opacity: 0, x: 8 }}
                          animate={{ opacity: 1, x: 0 }}
                          className={`flex items-center justify-between p-4 rounded-xl border-r-4 cursor-pointer
                            hover:shadow-md transition-all group
                            ${a.status === 'completed'
                              ? 'bg-gray-50 border-gray-300'
                              : `${color.light} ${color.border}`
                            }`}
                          onClick={() => onEdit(a)}
                        >
                          <div className="flex-1 min-w-0">
                            <div className={`font-semibold text-base truncate ${a.status === 'completed' ? 'text-gray-500 line-through' : color.text}`}>
                              {name}
                            </div>
                            <div className="flex items-center gap-3 mt-1">
                              <span className="flex items-center gap-1 text-xs text-gray-500">
                                <Clock className="w-3.5 h-3.5" />
                                {a.start_time} ({a.duration_minutes || 45} דק')
                              </span>
                              {a.status === 'completed' && (
                                <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-medium">
                                  הושלם
                                </span>
                              )}
                            </div>
                          </div>

                          <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button
                              onClick={(e) => { e.stopPropagation(); onTreat(a); }}
                              className={`p-2 rounded-lg transition-colors text-sm font-medium flex items-center gap-1.5
                                ${a.treatmentId
                                  ? 'bg-amber-100 text-amber-700 hover:bg-amber-200'
                                  : 'bg-blue-100 text-blue-700 hover:bg-blue-200'
                                }`}
                              // FIX #4: Read a.treatmentId (camelCase) — was a.treatment_id (always undefined)
                              title={a.treatmentId ? 'ערוך תיעוד' : 'תעד טיפול'}
                            >
                              {/* FIX #4: Read a.treatmentId here too */}
                              {a.treatmentId ? <Pencil className="w-4 h-4" /> : <PlusCircle className="w-4 h-4" />}
                              <span className="hidden md:inline text-xs">
                                {a.treatmentId ? 'ערוך' : 'תעד'}
                              </span>
                            </button>
                            <button
                              onClick={(e) => { e.stopPropagation(); onDelete(a); }}
                              className="p-2 rounded-lg bg-red-50 text-red-500 hover:bg-red-100 transition-colors"
                              title="מחק תור"
                            >
                              <MoreHorizontal className="w-4 h-4" />
                            </button>
                          </div>
                        </motion.div>
                      );
                    })}
                  </div>
                </div>
              );
            })}

            <div
              className="flex gap-4 cursor-pointer group"
              onClick={() => onNew('10:00')}
            >
              <div className="w-14" />
              <div className="flex-1 h-12 border-2 border-dashed border-gray-200 rounded-xl flex items-center justify-center text-gray-400 text-sm group-hover:border-blue-300 group-hover:text-blue-500 transition-colors">
                <Plus className="w-4 h-4 ml-1" /> הוסף תור
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Appointment Modal ────────────────────────────────────────────────────────
// FIX #2/#3: Removed `therapistEmail` prop — services now use auth.currentUser.uid
// internally. The prop was being passed to getAppointments(), getPatients(), and
// checkOverlap() in ways that broke their updated signatures.
function AppointmentModal({ open, onClose, onSaved, initialDate, initialTime, appointment, patients }) {
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

  const { useState: _ } = { useState: null }; // unused, keeping for linter

  // Reset form when modal opens
  const [initialized, setInitialized] = useState(false);
  if (open && !initialized) {
    if (appointment) {
      setForm({ ...appointment });
      if (![30, 45, 60, 90].includes(Number(appointment.duration_minutes))) setIsCustomDuration(true);
    } else {
      setForm(f => ({ ...f, date: initialDate || '', start_time: initialTime || '09:00' }));
    }
    setOverlapWarn([]);
    setInitialized(true);
  }
  if (!open && initialized) setInitialized(false);

  const handleDurationChange = (e) => {
    const val = e.target.value;
    if (val === 'custom') { setIsCustomDuration(true); }
    else { setIsCustomDuration(false); setForm({ ...form, duration_minutes: Number(val) }); }
  };

  const checkAndSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      // FIX #3: checkOverlap signature is (date, startTime, durationMins, excludeId)
      // Previously called as checkOverlap(therapistEmail, date, ...) — therapistEmail
      // was being passed as the date argument, breaking overlap detection entirely.
      const overlaps = await checkOverlap(form.date, form.start_time, Number(form.duration_minutes), appointment?.id);
      if (overlaps.length > 0 && overlapWarn.length === 0) {
        setOverlapWarn(overlaps);
        setSaving(false);
        return;
      }
      if (isEdit) {
        await updateAppointment(appointment.id, form);
      } else if (recurring) {
        // FIX #2: createRecurringSeries no longer needs therapist_email — service uses auth.currentUser
        await createRecurringSeries(form, recurCount, recurDays);
      } else {
        // FIX #2: createAppointment no longer needs therapist_email
        await createAppointment(form);
      }
      onSaved();
    } finally { setSaving(false); }
  };

  return (
    <Modal open={open} onClose={onClose} title={isEdit ? 'עריכת תור' : 'קביעת תור חדש'}>
      <form onSubmit={checkAndSave} className="space-y-4">
        {overlapWarn.length > 0 && (
          <div className="bg-orange-50 p-3 rounded-lg text-sm text-orange-800 border border-orange-200">
            ⚠️ קיימת חפיפה עם תור אחר. לחץ שמירה שוב לאישור.
          </div>
        )}

        <div>
          <label className="label">מטופל/ת *</label>
          <select
            className="input"
            value={form.patient_id}
            onChange={e => setForm({ ...form, patient_id: e.target.value })}
            required
          >
            <option value="">בחר מטופל...</option>
            {patients.map(p => <option key={p.id} value={p.id}>{p.full_name}</option>)}
          </select>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">תאריך *</label>
            <input
              type="date" className="input"
              value={form.date}
              onChange={e => setForm({ ...form, date: e.target.value })}
              required
            />
          </div>
          <div>
            <label className="label">שעה *</label>
            <input
              type="time" className="input"
              value={form.start_time}
              onChange={e => setForm({ ...form, start_time: e.target.value })}
              required
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">משך (דקות)</label>
            <select
              className="input"
              value={isCustomDuration ? 'custom' : form.duration_minutes}
              onChange={handleDurationChange}
            >
              <option value={30}>30 דקות</option>
              <option value={45}>45 דקות</option>
              <option value={60}>60 דקות</option>
              <option value={90}>90 דקות</option>
              <option value="custom">מותאם אישית</option>
            </select>
            {isCustomDuration && (
              <input
                type="number" className="input mt-2" placeholder="הכנס מספר דקות"
                value={form.duration_minutes}
                onChange={e => setForm({ ...form, duration_minutes: Number(e.target.value) })}
                min={1}
              />
            )}
          </div>
          <div>
            <label className="label">סטטוס</label>
            <select
              className="input"
              value={form.status}
              onChange={e => setForm({ ...form, status: e.target.value })}
            >
              <option value="scheduled">מתוכנן</option>
              <option value="completed">הושלם</option>
              <option value="cancelled">בוטל</option>
              <option value="missed">לא הגיע</option>
            </select>
          </div>
        </div>

        <div>
          <label className="label">הערות</label>
          <textarea
            className="input resize-none"
            rows={3}
            placeholder="הערות לתור..."
            value={form.notes || ''}
            onChange={e => setForm({ ...form, notes: e.target.value })}
          />
        </div>

        {!isEdit && (
          <div className="p-3 bg-gray-50 rounded-lg border border-gray-200">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={recurring}
                onChange={e => setRecurring(e.target.checked)}
                className="w-4 h-4 rounded text-blue-600"
              />
              <span className="text-sm font-medium text-gray-700">סדרת תורים קבועה</span>
            </label>
            {recurring && (
              <div className="grid grid-cols-2 gap-3 mt-3">
                <div>
                  <label className="label">מספר תורים</label>
                  <input
                    type="number" className="input"
                    value={recurCount}
                    onChange={e => setRecurCount(e.target.value)}
                    min={2} max={52}
                  />
                </div>
                <div>
                  <label className="label">כל כמה ימים</label>
                  <input
                    type="number" className="input"
                    value={recurDays}
                    onChange={e => setRecurDays(e.target.value)}
                    min={1}
                  />
                </div>
              </div>
            )}
          </div>
        )}

        <div className="flex gap-3 pt-2">
          <button type="button" onClick={onClose} className="btn-secondary flex-1">ביטול</button>
          <button type="submit" disabled={saving} className="btn-primary flex-1">
            {saving ? 'שומר...' : isEdit ? 'עדכן תור' : 'שמור תור'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
