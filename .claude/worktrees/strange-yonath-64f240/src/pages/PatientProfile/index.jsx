// src/pages/PatientProfile/index.jsx
/**
 * CHANGE vs BASELINE:
 * Adds an "outstanding balance" display to the patient header.
 * On mount, fires ONE targeted getPaymentsByPatient(id) call — scoped to
 * the specific patient being viewed. This keeps global context clean
 * (no payments in useClinicData) while giving the therapist a clear
 * financial snapshot at the top of the patient profile.
 *
 * Balance logic:
 *   outstanding = sum of payments where payment_status !== PAYMENT_STATUS.COMPLETED
 *                                      && payment_status !== PAYMENT_STATUS.REFUNDED
 *   If outstanding === 0 AND at least one payment exists → show "מסולק" badge.
 *   If outstanding > 0 → show "יתרת חוב: ₪___" in orange.
 *   If no payments at all → show nothing.
 */

import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getPatient } from '../../services/patients';
import { getPaymentsByPatient } from '../../services/payments';
import { Spinner } from '../../components/ui';
import { formatCurrency } from '../../utils/formatters';
import PatientDetails     from './PatientDetails';
import PatientTreatments  from './PatientTreatments';
import PatientProgress    from './PatientProgress';
import PatientAppointments from './PatientAppointments';

const TABS = [
  { key: 'details',      label: 'פרטים כלליים' },
  { key: 'treatments',   label: 'טיפולים' },
  { key: 'progress',     label: 'התקדמות' },
  { key: 'appointments', label: 'יומן פגישות' },
];

export default function PatientProfile() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [patient,   setPatient]   = useState(null);
  const [loading,   setLoading]   = useState(true);
  const [activeTab, setActiveTab] = useState('details');

  // Payment balance (local — not in global context)
  const [balance,         setBalance]         = useState(null);  // null = not yet loaded
  const [totalPayments,   setTotalPayments]   = useState(0);

  useEffect(() => { load(); }, [id]);

  async function load() {
    setLoading(true);
    try {
      const p = await getPatient(id);
      setPatient(p);
    } catch {
      navigate('/patients');
    } finally { setLoading(false); }
  }

  // Load payment balance once patient is known — one targeted query
  useEffect(() => {
    if (!id) return;
    getPaymentsByPatient(id)
      .then(pmts => {
        setTotalPayments(pmts.length);
        const outstanding = pmts
          .filter(p => p.payment_status !== PAYMENT_STATUS.COMPLETED && p.payment_status !== PAYMENT_STATUS.REFUNDED)
          .reduce((sum, p) => sum + (Number(p.amount) || 0), 0);
        setBalance(outstanding);
      })
      .catch(() => { /* non-fatal — balance just won't show */ });
  }, [id]);

  if (loading) return <div className="flex justify-center py-12"><Spinner size="lg" /></div>;
  if (!patient) return null;

  const tabProps = { patient, onPatientUpdated: load };

  return (
    <div className="space-y-4">
      {/* Patient header */}
      <div className="card">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-teal-400 to-blue-500 flex items-center justify-center text-white font-bold text-xl flex-shrink-0">
              {patient.full_name?.[0] || '?'}
            </div>
            <div>
              <h1 className="text-xl font-bold text-gray-900">{patient.full_name}</h1>
              <p className="text-sm text-gray-500">
                {patient.phone && <span dir="ltr">{patient.phone}</span>}
                {patient.phone && patient.email && <span className="mx-1">·</span>}
                {patient.email && <span dir="ltr">{patient.email}</span>}
              </p>
            </div>
          </div>

          {/* ── Balance badge ── */}
          {balance !== null && (
            balance > 0 ? (
              <div className="flex-shrink-0 text-left">
                <p className="text-xs text-gray-400 font-medium">יתרת חוב</p>
                <p className="text-lg font-bold text-orange-600">{formatCurrency(balance)}</p>
              </div>
            ) : totalPayments > 0 ? (
              <span className="flex-shrink-0 text-xs bg-green-100 text-green-700 px-3 py-1.5 rounded-full font-medium">
                ✓ מסולק
              </span>
            ) : null
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
        <div className="flex border-b border-gray-100 overflow-x-auto">
          {TABS.map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex-1 min-w-max px-4 py-3 text-sm font-medium transition-all border-b-2 whitespace-nowrap
                ${activeTab === tab.key
                  ? 'border-teal-500 text-teal-700 bg-teal-50'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-50'
                }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="p-4">
          {activeTab === 'details'      && <PatientDetails      {...tabProps} />}
          {activeTab === 'treatments'   && <PatientTreatments   {...tabProps} />}
          {activeTab === 'progress'     && <PatientProgress     {...tabProps} />}
          {activeTab === 'appointments' && <PatientAppointments {...tabProps} />}
        </div>
      </div>
    </div>
  );
}
