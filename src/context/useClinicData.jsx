/**
 * useClinicData — Global data hook for SpeechCare
 *
 * WHY THIS EXISTS:
 * Dashboard, Calendar, Reports, and Patients all independently call
 * getPatients(), getAppointments(), and getTreatments() on mount.
 * This causes 3–9 redundant Firestore reads every time the user
 * navigates between pages, and makes it impossible to share
 * already-loaded data without prop drilling.
 *
 * This hook provides a single source of truth via React Context.
 * Data is fetched once per session (or on explicit refresh).
 * Individual pages call useClinicData() and get data instantly
 * from the cache on subsequent renders.
 *
 * USAGE:
 *   // In App.jsx — wrap once:
 *   <ClinicDataProvider><AppRoutes /></ClinicDataProvider>
 *
 *   // In any page/component:
 *   const { patients, appointments, treatments, loading, refresh } = useClinicData();
 */

import { createContext, useContext, useState, useCallback, useRef } from 'react';
import { useAuth } from './AuthContext'; // adjust path if needed
import { getPatients } from '../services/patients';
import { getAppointments } from '../services/appointments';
import { getTreatments } from '../services/treatments';

// ─── Context ──────────────────────────────────────────────────────────────────

const ClinicDataContext = createContext(null);

// ─── Provider ─────────────────────────────────────────────────────────────────

export function ClinicDataProvider({ children }) {
  const { user } = useAuth();

  const [patients, setPatients] = useState([]);
  const [appointments, setAppointments] = useState([]);
  const [treatments, setTreatments] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Track whether we've fetched at least once so pages don't show
  // a full-screen spinner when data is already cached.
  const hasFetchedRef = useRef(false);

  /**
   * fetchAll — loads patients, appointments (bounded to ±3 months),
   * and treatments in parallel.
   *
   * PERFORMANCE NOTE: getAppointments() previously fetched ALL
   * appointments for the therapist with no date bounds. For a busy
   * clinic with years of history, this can be thousands of documents.
   * We now pass a rolling 3-month window. The Calendar page only ever
   * shows one month at a time, so this covers the current view plus
   * reasonable navigation.
   */
  const fetchAll = useCallback(async () => {
    if (!user?.email) return;

    setLoading(true);
    setError(null);

    try {
      // Rolling window: 1 month back → 2 months forward
      const now = new Date();
      const start = new Date(now);
      start.setMonth(start.getMonth() - 1);
      const end = new Date(now);
      end.setMonth(end.getMonth() + 2);

      const startStr = start.toISOString().slice(0, 10);
      const endStr   = end.toISOString().slice(0, 10);

      const [p, a, t] = await Promise.all([
        getPatients(user.email),
        getAppointments(user.email, startStr, endStr),
        getTreatments(user.email),
      ]);

      setPatients(p);
      setAppointments(a);
      setTreatments(t);
      hasFetchedRef.current = true;
    } catch (err) {
      console.error('useClinicData fetch error:', err);
      setError(err.message || 'שגיאה בטעינת נתונים');
    } finally {
      setLoading(false);
    }
  }, [user?.email]);

  /**
   * Derived helpers — computed once here, not in every component.
   *
   * patientMap: O(1) patient lookup by ID, used by Calendar, Dashboard, etc.
   * todayAppointments: pre-filtered for the Dashboard widget.
   */
  const today = new Date().toISOString().slice(0, 10);

  const patientMap = Object.fromEntries(patients.map(p => [p.id, p]));

  const todayAppointments = appointments.filter(
    a => a.date === today && a.status === 'scheduled'
  );

  const activePatients = patients.filter(p => p.status === 'active' && !p.is_archived);

  return (
    <ClinicDataContext.Provider value={{
      // Raw data
      patients,
      appointments,
      treatments,

      // Derived / pre-computed
      patientMap,
      todayAppointments,
      activePatients,

      // State
      loading,
      error,
      hasFetched: hasFetchedRef.current,

      // Actions
      refresh: fetchAll,
      fetchAll,

      // Granular setters — let pages optimistically update local state
      // without a full re-fetch (e.g. after creating a new appointment)
      setPatients,
      setAppointments,
      setTreatments,
    }}>
      {children}
    </ClinicDataContext.Provider>
  );
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useClinicData() {
  const ctx = useContext(ClinicDataContext);
  if (!ctx) {
    throw new Error('useClinicData must be used inside <ClinicDataProvider>');
  }
  return ctx;
}
