// src/pages/PatientProfile/PatientTreatments.jsx — Appointments + linked treatments tab
/**
 * FIXES APPLIED:
 *
 * 1. FIELD NAME MISMATCH — treatment_id vs treatmentId:
 *    Every reference to `appt.treatment_id` was reading a field that doesn't
 *    exist in Firestore. The appointments service stores `treatmentId` (camelCase).
 *    This caused:
 *    - The "edit treatment" button to NEVER appear (always showed "new treatment")
 *    - `getTreatmentById(appt.treatment_id)` to receive `undefined` and return null
 *    - `PaymentHistory` to receive `treatmentId={undefined}` and show no payments
 *    FIX: All `appt.treatment_id` → `appt.treatmentId` throughout.
 *
 * 2. MISSING treatmentId ON TreatmentDialog:
 *    The TreatmentDialog was opened without passing `treatmentId`, so it always
 *    opened in create-mode even when the appointment had a linked treatment.
 *    FIX: Pass `treatmentId={selectedAppt?.treatmentId}`.
 */

import { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { getPatientAppointments, deleteAppointment } from '../../services/appointments';
import { getTreatmentById } from '../../services/treatments';
import { PaymentHistory } from '../../components/shared/PaymentHistory';
import { PaymentModal } from '../../components/shared/PaymentModal';
import { Badge, EmptyState, ConfirmDialog, Spinner } from '../../components/ui';
import { Calendar, Plus, Pencil, Trash2, FileText, DollarSign, Eye } from 'lucide-react';
import { formatDate, localDateStr } from '../../utils/formatters';
import TreatmentDialog from '../../components/shared/TreatmentDialog';
import TreatmentViewModal from '../../components/shared/TreatmentViewModal';

export default function PatientAppointments({ patient }) {
  const { user } = useAuth();
  const [appointments, setAppointments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [treatDialogOpen, setTreatDialogOpen] = useState(false);
  const [selectedAppt, setSelectedAppt] = useState(null);
  const [selectedTreatment, setSelectedTreatment] = useState(null);
  const [isFetching, setIsFetching] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [selectedTreatmentForPayment, setSelectedTreatmentForPayment] = useState(null);
  const [paymentRefreshKey, setPaymentRefreshKey] = useState(0);
  const [viewModalOpen, setViewModalOpen] = useState(false);
  const [viewTreatment, setViewTreatment] = useState(null);
  const [viewingAppt, setViewingAppt] = useState(null);

  useEffect(() => {
    if (!user?.uid || !patient?.id) {
      setError('User not authenticated or patient not found');
      setLoading(false);
      return;
    }
    if (patient.ownerId !== user.uid) {
      setError('Access denied: patient does not belong to you');
      setLoading(false);
      return;
    }
    load();
  }, [patient?.id, user?.uid]);

  async function load() {
    setLoading(true);
    setError('');
    try {
      const data = await getPatientAppointments(patient.id);
      setAppointments(data.filter(apt => apt.ownerId === user.uid));
    } catch (err) {
      console.error('[PatientTreatments] Error loading appointments:', err);
      setError(err.message || 'Failed to load appointments');
    } finally {
      setLoading(false);
    }
  }

  const fetchTreatment = async (appt) => {
    if (!appt.treatmentId) return null;
    setIsFetching(true);
    try {
      const t = await getTreatmentById(appt.treatmentId);
      if (t && t.ownerId !== user.uid) throw new Error('Access denied');
      return t;
    } catch (err) {
      setError(err.message || 'שגיאה בטעינת הטיפול');
      return null;
    } finally {
      setIsFetching(false);
    }
  };

  const handleViewTreatment = async (appt) => {
    const t = await fetchTreatment(appt);
    if (!t) return;
    setViewTreatment(t);
    setViewingAppt(appt);
    setViewModalOpen(true);
  };

  const handleOpenTreatment = async (appt) => {
    setSelectedAppt(appt);
    const t = await fetchTreatment(appt);
    setSelectedTreatment(t || null);
    setTreatDialogOpen(true);
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      if (deleteTarget.ownerId !== user.uid) {
        throw new Error('Access denied: appointment does not belong to you');
      }
      await deleteAppointment(deleteTarget.id);
      setDeleteTarget(null);
      load();
    } catch (err) {
      setError(err.message || 'Failed to delete appointment');
    }
  };

  const handleAddPayment = (apptOrTreatment) => {
    setSelectedTreatmentForPayment(apptOrTreatment);
    setShowPaymentModal(true);
  };

  if (loading) {
    return (
      <div className="flex justify-center py-8">
        <Spinner />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {error && (
        <div className="flex items-start gap-3 p-3 bg-red-50 border border-red-200 rounded-lg">
          <Trash2 className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      <div className="flex justify-between items-center">
        <h3 className="text-sm font-bold text-gray-700">תורים שנקבעו</h3>
        <button
          onClick={() => window.location.href = '/calendar'}
          className="btn-primary py-1.5 px-3 text-xs flex items-center gap-2"
        >
          <Plus className="w-3.5 h-3.5" /> קביעת תור
        </button>
      </div>

      {appointments.length === 0 ? (
        <EmptyState
          icon={Calendar}
          title="אין תורים"
          description="לא נקבעו תורים עתידיים או עבריים"
        />
      ) : (
        <div className="space-y-2">
          {appointments.map(appt => (
            <div
              key={appt.id}
              className="p-3 border border-gray-100 rounded-xl hover:shadow-sm group transition-all bg-white"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3 flex-1">
                  <div className="p-2 bg-gray-50 rounded-lg text-gray-400">
                    <Calendar className="w-4 h-4" />
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-bold text-gray-900">
                      {formatDate(appt.date)} בשעה {appt.start_time || appt.time}
                    </p>
                    <div className="flex items-center gap-2 mt-1">
                      {/* FIX: Compare date strings directly, not Date objects.
                          new Date(appt.date) > new Date() was broken because:
                          new Date('2025-03-20') parses as UTC midnight = 02:00 local.
                          Any local time after 02:00 on the appointment day made the
                          comparison false — today's appointments showed as "עבר" (past).
                          String comparison appt.date >= todayStr is timezone-safe and
                          always evaluates correctly regardless of local time. */}
                      <Badge color={appt.date >= localDateStr(new Date()) ? 'blue' : 'gray'}>
                        {appt.date >= localDateStr(new Date()) ? 'מתוכנן' : 'עבר'}
                      </Badge>
                      {/* FIX #1: Read appt.treatmentId (camelCase) */}
                      {appt.treatmentId && (
                        <span className="text-[10px] bg-teal-50 text-teal-700 px-1.5 py-0.5 rounded-full font-medium">
                          מתועד במערכת
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-1">
                  {appt.treatmentId ? (
                    <>
                      {/* View button — read-only */}
                      <button
                        onClick={() => handleViewTreatment(appt)}
                        disabled={isFetching}
                        className="p-2 rounded-lg transition-colors text-teal-600 hover:bg-teal-50"
                        title="צפה בתיעוד"
                      >
                        {isFetching && selectedAppt?.id === appt.id
                          ? <Spinner className="w-4 h-4" />
                          : <Eye className="w-4 h-4" />
                        }
                      </button>
                      {/* Edit button */}
                      <button
                        onClick={() => handleOpenTreatment(appt)}
                        disabled={isFetching}
                        className="p-2 rounded-lg transition-colors text-blue-600 hover:bg-blue-50"
                        title="ערוך תיעוד"
                      >
                        <Pencil className="w-4 h-4" />
                      </button>
                    </>
                  ) : (
                    /* New treatment button */
                    <button
                      onClick={() => handleOpenTreatment(appt)}
                      disabled={isFetching}
                      className="p-2 rounded-lg transition-colors text-teal-600 hover:bg-teal-50"
                      title="תעד טיפול"
                    >
                      <FileText className="w-4 h-4" />
                    </button>
                  )}

                  <button
                    onClick={() => setDeleteTarget(appt)}
                    className="p-2 text-gray-400 hover:bg-red-50 hover:text-red-500 rounded-lg transition-colors"
                    title="מחק תור"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Treatment payments section */}
              {/* FIX #1: Read appt.treatmentId — was appt.treatment_id, always undefined */}
              {appt.treatmentId && (
                <div className="mt-3 pt-3 border-t">
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="text-xs font-semibold text-gray-700 flex items-center gap-1">
                      <DollarSign className="w-3.5 h-3.5 text-green-600" />
                      תשלומים לטיפול זה
                    </h4>
                    <button
                      onClick={() => handleAddPayment(appt)}
                      className="text-xs px-2 py-1 bg-blue-100 text-blue-700 rounded hover:bg-blue-200 font-medium transition-colors"
                    >
                      + הוסף תשלום
                    </button>
                  </div>

                  {/* FIX #1: Pass appt.treatmentId — was appt.treatment_id = always undefined */}
                  <PaymentHistory
                    key={`${appt.treatmentId}-${paymentRefreshKey}`}
                    patientId={patient.id}
                    treatmentId={appt.treatmentId}
                    onPaymentChange={() => setPaymentRefreshKey(prev => prev + 1)}
                  />
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* View Modal — read-only */}
      <TreatmentViewModal
        open={viewModalOpen}
        onClose={() => { setViewModalOpen(false); setViewTreatment(null); setViewingAppt(null); }}
        treatment={viewTreatment}
        patient={patient}
        onEdit={() => {
          setViewModalOpen(false);
          handleOpenTreatment(viewingAppt);
        }}
      />

      {/* Treatment Dialog — edit / create */}
      {treatDialogOpen && (
        <TreatmentDialog
          open={treatDialogOpen}
          onClose={() => {
            setTreatDialogOpen(false);
            setSelectedTreatment(null);
            setSelectedAppt(null);
          }}
          onSaved={() => {
            setTreatDialogOpen(false);
            setSelectedTreatment(null);
            setSelectedAppt(null);
            load();
          }}
          patient={patient}
          treatment={selectedTreatment}
          // FIX #2: Pass treatmentId so dialog opens in edit-mode for documented appointments
          treatmentId={selectedAppt?.treatmentId || null}
          appointmentId={selectedAppt?.id}
        />
      )}

      {/* Payment Modal */}
      <PaymentModal
        isOpen={showPaymentModal}
        onClose={() => {
          setShowPaymentModal(false);
          setSelectedTreatmentForPayment(null);
        }}
        onSave={() => {
          setShowPaymentModal(false);
          setSelectedTreatmentForPayment(null);
          setPaymentRefreshKey(prev => prev + 1);
        }}
        patientId={patient.id}
        // Pass treatmentId from the appointment's linked treatment
        treatmentId={selectedTreatmentForPayment?.treatmentId || selectedTreatmentForPayment?.id || null}
      />

      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title="ביטול תור"
        message="האם אתה בטוח שברצונך לבטל את התור?"
        confirmLabel="בטל תור"
        danger
      />
    </div>
  );
}
