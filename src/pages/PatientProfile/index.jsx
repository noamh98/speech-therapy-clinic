// src/pages/PatientProfile/index.jsx
import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { getPatient } from '../../services/patients';
import { Spinner } from '../../components/ui';
import PatientDetails from './PatientDetails';
import PatientTreatments from './PatientTreatments';
import PatientProgress from './PatientProgress';
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
  const [patient, setPatient] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('details');

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

  if (loading) return <div className="flex justify-center py-12"><Spinner size="lg" /></div>;
  if (!patient) return null;

  const tabProps = { patient, onPatientUpdated: load };

  return (
    <div className="space-y-4">
      {/* Patient header */}
      <div className="card">
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
