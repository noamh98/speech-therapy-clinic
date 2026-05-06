/**
 * useClinicData — Global data context for SpeechCare
 *
 * ROOT CAUSES FIXED IN THIS VERSION:
 *
 * 1. DASHBOARD INCOME STALE AFTER deletePatient:
 *    Dashboard.jsx was calling getPaymentStats() in its OWN useEffect([user.uid]).
 *    That effect never re-ran after a patient was archived — it only runs once
 *    on mount. So paymentStats stayed showing the old total forever.
 *    FIX: paymentStats is now computed HERE as a useMemo over the payments array.
 *    When setPayments() is called (optimistic update in Patients.jsx), useMemo
 *    recomputes immediately → Dashboard re-renders with correct income.
 *    Dashboard.jsx no longer calls getPaymentStats() at all.
 *
 * 2. getPayments() RETURNING ARCHIVED PAYMENTS:
 *    After deletePatient soft-archives payments (is_archived: true), fetchAll()
 *    was calling getPayments() which had NO is_archived filter — so archived
 *    payments came back and inflated income stats again.
 *    FIX: getPayments() now filters is_archived !== true client-side.
 *    Also added the same filter to getTreatments() for consistency.
 *
 * 3. CONTEXT FILTER MISSING patient_id (snake_case):
 *    Patients.jsx was filtering payments with:
 *      prev.filter(p => p.patientId !== deleteTarget.id)
 *    But payments created by older code paths stored ONLY patient_id (snake_case).
 *    Those payments survived the filter and remained in context.
 *    FIX: All payment filters now check BOTH patientId AND patient_id.
 *
 * 4. Calendar NOT UPDATING after TreatmentDialog save:
 *    TreatmentDialog called onSaved() → parent called refresh() → but
 *    setAppointments() optimistic update happened AFTER onSaved() triggered
 *    a full fetchAll(), which created a race: sometimes the optimistic update
 *    arrived after fetchAll() completed and overwrote the fresh data with stale.
 *    FIX: Optimistic setAppointments() now runs BEFORE onSaved() is called.
 *    fetchAll() runs in the background without blocking the UI.
 */

import {
  createContext, useContext, useState, useCallback,
  useEffect, useRef, useMemo,
} from 'react';
import { useAuth } from './AuthContext';
import { getPatients } from '../services/patients';
import { getAppointments } from '../services/appointments';
import { getTreatments } from '../services/treatments';
import { getPayments } from '../services/payments';
import { localDateStr } from '../utils/formatters';

const ClinicDataContext = createContext(null);

// ─── Helper: exponential backoff retry ───────────────────────────────────────
async function withRetry(fn, maxTries = 3, baseDelay = 1000) {
  let lastError;
  for (let attempt = 1; attempt <= maxTries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (attempt < maxTries) {
        const delay = baseDelay * Math.pow(2, attempt - 1);
        console.warn(
          `[useClinicData] attempt ${attempt} failed, retrying in ${delay}ms...`
        );
        await new Promise(r => setTimeout(r, delay));
      }
    }
  }
  console.error('[useClinicData] fetchAll failed after all retries:', lastError);
  throw lastError;
}

export function ClinicDataProvider({ children }) {
  const { user } = useAuth();

  const [patients,     setPatients]     = useState([]);
  const [appointments, setAppointments] = useState([]);
  const [treatments,   setTreatments]   = useState([]);
  const [payments,     setPayments]     = useState([]);
  const [loading,      setLoading]      = useState(false);
  const [error,        setError]        = useState(null);

  const hasFetchedRef = useRef(false);

  // ── Core fetch ───────────────────────────────────────────────────────────
  const fetchAll = useCallback(async () => {
    if (!user?.uid) return;
    setLoading(true);
    setError(null);
    try {
      await withRetry(async () => {
        const startDate = new Date();
        startDate.setMonth(startDate.getMonth() - 1);
        const endDate = new Date();
        endDate.setMonth(endDate.getMonth() + 2);

        const [p, a, t, pay] = await Promise.all([
          getPatients(),
          getAppointments(localDateStr(startDate), localDateStr(endDate)),
          getTreatments(),
          getPayments(),
        ]);

        // FIX #2: Filter archived records that services may still return
        // This is a safety net — services should already filter, but we
        // enforce it here too so context is always clean.
        setPatients(p.filter(x => x.is_archived !== true));
        setAppointments(a);
        setTreatments(t.filter(x => x.is_archived !== true));
        setPayments(pay.filter(x => x.is_archived !== true));
        hasFetchedRef.current = true;
      });
    } catch (err) {
      console.error('[useClinicData] fetchAll error:', err);
      setError(err.message || 'שגיאה בטעינת נתונים');
    } finally {
      setLoading(false);
    }
  }, [user?.uid]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-fetch on login, clear on logout
  useEffect(() => {
    if (user?.uid) {
      fetchAll();
    } else {
      setPatients([]);
      setAppointments([]);
      setTreatments([]);
      setPayments([]);
      hasFetchedRef.current = false;
    }
  }, [user?.uid]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Stable today string ───────────────────────────────────────────────────
  const today = useMemo(() => localDateStr(), []);

  // ── patientMap — O(1) lookup ──────────────────────────────────────────────
  const patientMap = useMemo(
    () => Object.fromEntries(patients.map(p => [p.id, p])),
    [patients]
  );

  // ── treatmentsByApptId — for doc status ──────────────────────────────────
  const treatmentsByApptId = useMemo(
    () => Object.fromEntries(
      treatments
        .filter(t => t.appointmentId)
        .map(t => [t.appointmentId, t])
    ),
    [treatments]
  );

  // ── docStatusMap — per-appointment status ─────────────────────────────────
  const docStatusMap = useMemo(() => {
    const map = {};
    for (const a of appointments) {
      const isDocumented        = Boolean(treatmentsByApptId[a.id]) || Boolean(a.treatmentId);
      const isCancelledOrMissed = a.status === PAYMENT_STATUS.CANCELLED || a.status === 'missed';
      const isFuture            = a.date > today;

      if (isCancelledOrMissed)   map[a.id] = PAYMENT_STATUS.CANCELLED;
      else if (isDocumented)     map[a.id] = 'documented';
      else if (isFuture)         map[a.id] = 'future';
      else                       map[a.id] = 'needs_doc';
    }
    return map;
  }, [appointments, treatmentsByApptId, today]);

  // ── todayAppointments ────────────────────────────────────────────────────
  const todayAppointments = useMemo(
    () => appointments.filter(a => a.date === today && a.status === 'scheduled'),
    [appointments, today]
  );

  // ── activePatients ───────────────────────────────────────────────────────
  const activePatients = useMemo(
    () => patients.filter(p => p.status === 'active' && !p.is_archived),
    [patients]
  );

  // ── paymentStats — FIX #1: computed HERE so Dashboard is always fresh ─────
  // Previously Dashboard called getPaymentStats() in its own useEffect([user.uid]).
  // That only ran once on mount — archiving a patient never triggered a re-fetch.
  // Now paymentStats is derived from the payments array in context. Any call to
  // setPayments() (optimistic update) immediately recalculates these numbers and
  // Dashboard re-renders without any extra Firestore reads.
  const thisMonth = today.slice(0, 7); // YYYY-MM
  const paymentStats = useMemo(() => {
    const monthPayments = payments.filter(
      p => (p.payment_date || '').startsWith(thisMonth)
    );
    return {
      total_payments:   monthPayments.length,
      total_amount:     monthPayments.reduce((s, p) => s + (p.amount || 0), 0),
      completed_amount: monthPayments
        .filter(p => p.payment_status === PAYMENT_STATUS.COMPLETED)
        .reduce((s, p) => s + (p.amount || 0), 0),
      pending_amount:   monthPayments
        .filter(p => p.payment_status === PAYMENT_STATUS.PENDING)
        .reduce((s, p) => s + (p.amount || 0), 0),
    };
  }, [payments, thisMonth]);

  return (
    <ClinicDataContext.Provider value={{
      // Raw arrays
      patients,
      appointments,
      treatments,
      payments,

      // Derived (all memoised)
      patientMap,
      treatmentsByApptId,
      docStatusMap,
      todayAppointments,
      activePatients,
      paymentStats,        // ← NEW: replaces Dashboard's own getPaymentStats() call

      // State
      loading,
      error,
      hasFetched: hasFetchedRef.current,

      // Actions
      refresh: fetchAll,
      fetchAll,

      // Granular setters for optimistic UI
      setPatients,
      setAppointments,
      setTreatments,
      setPayments,
    }}>
      {children}
    </ClinicDataContext.Provider>
  );
}

export function useClinicData() {
  const ctx = useContext(ClinicDataContext);
  if (!ctx) throw new Error('useClinicData must be used inside <ClinicDataProvider>');
  return ctx;
}
