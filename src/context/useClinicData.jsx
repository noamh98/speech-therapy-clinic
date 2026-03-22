/**
 * useClinicData — Global data context for SpeechCare
 *
 * PERFORMANCE CONTRACT (strict):
 *   - Fetches EXACTLY three collections: patients, appointments, treatments.
 *   - Payments are NEVER fetched here. Any payment data needed by specific
 *     components is fetched locally with targeted queries.
 *   - All derived values (patientMap, treatmentsByApptId, docStatusMap,
 *     todayAppointments, activePatients) are wrapped in useMemo so they
 *     recompute only when their source arrays change — not on every render.
 *
 * What consumers get:
 *   patients, appointments, treatments      — raw arrays
 *   patientMap                              — { id → patient } for O(1) lookup
 *   treatmentsByApptId                      — { appointmentId → treatment }
 *   docStatusMap                            — { appointmentId → 'documented'|'needs_doc'|'cancelled'|'future' }
 *   todayAppointments                       — pre-filtered scheduled appointments for today
 *   activePatients                          — non-archived active patients
 *   loading, error, hasFetched
 *   refresh / fetchAll
 *   setPatients, setAppointments, setTreatments  — for optimistic updates
 */

import { createContext, useContext, useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { useAuth } from './AuthContext';
import { getPatients } from '../services/patients';
import { getAppointments } from '../services/appointments';
import { getTreatments } from '../services/treatments';
import { localDateStr } from '../utils/formatters';

const ClinicDataContext = createContext(null);

export function ClinicDataProvider({ children }) {
  const { user } = useAuth();

  const [patients,     setPatients]     = useState([]);
  const [appointments, setAppointments] = useState([]);
  const [treatments,   setTreatments]   = useState([]);
  const [loading,      setLoading]      = useState(false);
  const [error,        setError]        = useState(null);

  const hasFetchedRef = useRef(false);

  // ── Core fetch — 3 collections only ─────────────────────────────────────────
  const fetchAll = useCallback(async () => {
    if (!user?.uid) return;
    setLoading(true);
    setError(null);
    try {
      // Rolling window: 1 month back → 2 months forward (local dates, no UTC shift)
      const startDate = new Date();
      startDate.setMonth(startDate.getMonth() - 1);
      const endDate = new Date();
      endDate.setMonth(endDate.getMonth() + 2);

      const [p, a, t] = await Promise.all([
        getPatients(),
        getAppointments(localDateStr(startDate), localDateStr(endDate)),
        getTreatments(),
      ]);

      setPatients(p);
      setAppointments(a);
      setTreatments(t);
      hasFetchedRef.current = true;
    } catch (err) {
      console.error('[useClinicData] fetchAll error:', err);
      setError(err.message || 'שגיאה בטעינת נתונים');
    } finally {
      setLoading(false);
    }
  }, [user?.uid]);

  // Auto-fetch on login; clear on logout
  useEffect(() => {
    if (user?.uid) {
      fetchAll();
    } else {
      setPatients([]);
      setAppointments([]);
      setTreatments([]);
      hasFetchedRef.current = false;
    }
  }, [user?.uid]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── today — stable string, only changes at midnight ──────────────────────
  // Memoised with [] so downstream memos don't invalidate on every render.
  // (In practice today never changes during a session, but this is belt-and-suspenders.)
  const today = useMemo(() => localDateStr(), []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── patientMap — O(n) rebuild only when patients array reference changes ──
  const patientMap = useMemo(
    () => Object.fromEntries(patients.map(p => [p.id, p])),
    [patients]
  );

  // ── treatmentsByApptId — used by Calendar/Dashboard for doc status ────────
  // Key: appointmentId, Value: treatment object.
  // An appointment is "documented" iff it has an entry here.
  const treatmentsByApptId = useMemo(
    () => Object.fromEntries(
      treatments
        .filter(t => t.appointmentId)
        .map(t => [t.appointmentId, t])
    ),
    [treatments]
  );

  // ── docStatusMap — per-appointment documentation status string ────────────
  // Derived entirely from appointments + treatmentsByApptId (no payment data needed).
  //
  //   'documented'   — appointment has a linked treatment
  //   'needs_doc'    — past/today appointment, no treatment, not cancelled
  //   'cancelled'    — status is cancelled or missed
  //   'future'       — appointment is in the future with no treatment yet
  //
  // Used by Calendar colour coding and the "show undocumented" filter.
  const docStatusMap = useMemo(() => {
    const map = {};
    for (const a of appointments) {
      const isDocumented       = Boolean(treatmentsByApptId[a.id]);
      const isCancelledOrMissed = a.status === 'cancelled' || a.status === 'missed';
      const isFuture           = a.date > today;

      if (isCancelledOrMissed) {
        map[a.id] = 'cancelled';
      } else if (isDocumented) {
        map[a.id] = 'documented';
      } else if (isFuture) {
        map[a.id] = 'future';
      } else {
        map[a.id] = 'needs_doc';
      }
    }
    return map;
  }, [appointments, treatmentsByApptId, today]);

  // ── todayAppointments — pre-filtered for Dashboard widget ─────────────────
  const todayAppointments = useMemo(
    () => appointments.filter(a => a.date === today && a.status === 'scheduled'),
    [appointments, today]
  );

  // ── activePatients — non-archived, active status ──────────────────────────
  const activePatients = useMemo(
    () => patients.filter(p => p.status === 'active' && !p.is_archived),
    [patients]
  );

  return (
    <ClinicDataContext.Provider value={{
      // Raw arrays (3 collections only — NO payments)
      patients,
      appointments,
      treatments,

      // Derived (all memoised — zero cost on loading state changes)
      patientMap,
      treatmentsByApptId,
      docStatusMap,
      todayAppointments,
      activePatients,

      // State
      loading,
      error,
      hasFetched: hasFetchedRef.current,

      // Actions
      refresh: fetchAll,
      fetchAll,

      // Granular setters for optimistic UI updates without a full re-fetch
      setPatients,
      setAppointments,
      setTreatments,
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
