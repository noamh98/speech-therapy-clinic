/**
 * useClinicData — Global data hook for SpeechCare (Multi-tenant version)
 *
 * FIXES APPLIED:
 * 1. Added useEffect that calls fetchAll() automatically when a user logs in.
 *    Previously, data was never loaded on mount — every page got empty arrays
 *    until something manually called refresh().
 */

import { createContext, useContext, useState, useCallback, useRef, useEffect } from 'react';
import { useAuth } from './AuthContext';
import { getPatients } from '../services/patients';
import { getAppointments } from '../services/appointments';
import { getTreatments } from '../services/treatments';
import { getPayments } from '../services/payments';

// ─── Context ──────────────────────────────────────────────────────────────────

const ClinicDataContext = createContext(null);

// ─── Provider ─────────────────────────────────────────────────────────────────

export function ClinicDataProvider({ children }) {
  const { user } = useAuth();

  const [patients, setPatients] = useState([]);
  const [appointments, setAppointments] = useState([]);
  const [treatments, setTreatments] = useState([]);
  // FIX: Added payments to global context so Dashboard and PatientProfile
  // share the same data and update together after a payment is saved.
  const [payments, setPayments] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const hasFetchedRef = useRef(false);

  const fetchAll = useCallback(async () => {
    if (!user?.uid) return;

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

      const [p, a, t, pay] = await Promise.all([
        getPatients(),
        getAppointments(startStr, endStr),
        getTreatments(),
        // FIX: Fetch payments in parallel with everything else.
        // Dashboard revenue and PatientProfile payment history now read from
        // this shared state instead of making their own redundant Firestore calls.
        getPayments(),
      ]);

      setPatients(p);
      setAppointments(a);
      setTreatments(t);
      setPayments(pay);
      hasFetchedRef.current = true;
    } catch (err) {
      console.error('useClinicData fetch error:', err);
      setError(err.message || 'שגיאה בטעינת נתונים');
    } finally {
      setLoading(false);
    }
  }, [user?.uid]);

  // ─── FIX: Auto-fetch when user logs in ───────────────────────────────────────
  // Previously this was never called automatically, so all pages started with
  // empty arrays until something manually triggered refresh().
  useEffect(() => {
    if (user?.uid) {
      fetchAll();
    } else {
      // Clear data on logout
      setPatients([]);
      setAppointments([]);
      setTreatments([]);
      setPayments([]);
      hasFetchedRef.current = false;
    }
  }, [user?.uid]); // eslint-disable-line react-hooks/exhaustive-deps
  // Note: fetchAll is intentionally omitted from deps here to avoid re-fetch
  // loops. It is stable (useCallback with user?.uid dep), but ESLint can't
  // verify that. The effect should only fire on uid change, not on every render.

  // ─── Derived helpers ──────────────────────────────────────────────────────────
  const today = new Date().toISOString().slice(0, 10);

  const patientMap = Object.fromEntries(patients.map(p => [p.id, p]));

  const todayAppointments = appointments.filter(
    a => a.date === today && a.status === 'scheduled'
  );

  const activePatients = patients.filter(p => p.status === 'active' && !p.is_archived);

  // FIX: Pre-compute monthly payment stats here so Dashboard reads from context,
  // not from a separate getPaymentStats() Firestore call. This means after any
  // payment is saved and refresh() is called, Dashboard stats update immediately.
  const thisMonth = today.slice(0, 7); // YYYY-MM
  const monthPayments = payments.filter(p => (p.payment_date || '').startsWith(thisMonth));
  const paymentStats = {
    total_payments: monthPayments.length,
    total_amount: monthPayments.reduce((s, p) => s + (p.amount || 0), 0),
    completed_amount: monthPayments
      .filter(p => p.payment_status === 'completed')
      .reduce((s, p) => s + (p.amount || 0), 0),
    pending_amount: monthPayments
      .filter(p => p.payment_status === 'pending')
      .reduce((s, p) => s + (p.amount || 0), 0),
  };

  return (
    <ClinicDataContext.Provider value={{
      // Raw data
      patients,
      appointments,
      treatments,
      payments,

      // Derived / pre-computed
      patientMap,
      todayAppointments,
      activePatients,
      // FIX: paymentStats computed from shared payments state — Dashboard reads
      // this instead of making a separate getPaymentStats() Firestore call.
      paymentStats,

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
      setPayments,
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
