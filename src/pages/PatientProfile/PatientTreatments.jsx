// src/pages/PatientProfile/PatientTreatments.jsx
import { useState, useEffect } from 'react';
import { getPatientAppointments, deleteAppointment } from '../../services/appointments';
import { getTreatmentById } from '../../services/treatments'; // ייבוא הפונקציה החדשה
import { Badge, EmptyState, ConfirmDialog, Spinner } from '../../components/ui';
import { Calendar, Plus, Pencil, Trash2, FileText } from 'lucide-react';
import { formatDate } from '../../utils/formatters';
import TreatmentDialog from '../../components/shared/TreatmentDialog';

export default function PatientAppointments({ patient }) {
  const [appointments, setAppointments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [treatDialogOpen, setTreatDialogOpen] = useState(false);
  const [selectedAppt, setSelectedAppt] = useState(null);
  const [selectedTreatment, setSelectedTreatment] = useState(null); // סטייט למידע המלא של הטיפול
  const [isFetching, setIsFetching] = useState(false); // חיווי טעינה קטן בזמן שליפה
  const [deleteTarget, setDeleteTarget] = useState(null);

  useEffect(() => { load(); }, [patient.id]);

  async function load() {
    setLoading(true);
    try {
      const data = await getPatientAppointments(patient.id);
      setAppointments(data);
    } finally { setLoading(false); }
  }

  // פונקציה חדשה ששולפת את התיעוד לפני הפתיחה
  const handleOpenTreatment = async (appt) => {
    setSelectedAppt(appt);
    if (appt.treatment_id) {
      setIsFetching(true);
      try {
        const fullTreatment = await getTreatmentById(appt.treatment_id);
        setSelectedTreatment(fullTreatment);
      } catch (err) {
        console.error("שגיאה בטעינת התיעוד:", err);
      } finally {
        setIsFetching(false);
      }
    } else {
      setSelectedTreatment(null);
    }
    setTreatDialogOpen(true);
  };

  const handleDelete = async () => {
    await deleteAppointment(deleteTarget.id);
    setDeleteTarget(null);
    load();
  };

  if (loading) return <div className="flex justify-center py-8"><Spinner /></div>;

  return (
    <div className="space-y-4">
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
        <EmptyState icon={Calendar} title="אין תורים" description="לא נקבעו תורים עתידיים או עבריים" />
      ) : (
        <div className="space-y-2">
          {appointments.map(appt => (
            <div key={appt.id} className="p-3 border border-gray-100 rounded-xl hover:shadow-sm group transition-all bg-white">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-gray-50 rounded-lg text-gray-400">
                    <Calendar className="w-4 h-4" />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-gray-900">{formatDate(appt.date)} בשעה {appt.time}</p>
                    <div className="flex items-center gap-2 mt-1">
                       <Badge color={new Date(appt.date) > new Date() ? 'blue' : 'gray'}>
                        {new Date(appt.date) > new Date() ? 'מתוכנן' : 'עבר'}
                      </Badge>
                      {appt.treatment_id && (
                        <span className="text-[10px] bg-teal-50 text-teal-700 px-1.5 py-0.5 rounded-full font-medium">
                          מתועד במערכת
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-1">
                  <button 
                    onClick={() => handleOpenTreatment(appt)}
                    disabled={isFetching}
                    className={`p-2 rounded-lg transition-colors ${appt.treatment_id ? 'text-blue-600 hover:bg-blue-50' : 'text-teal-600 hover:bg-teal-50'}`}
                    title={appt.treatment_id ? "ערוך תיעוד" : "תעד טיפול"}
                  >
                    {isFetching && selectedAppt?.id === appt.id ? (
                        <Spinner className="w-4 h-4" />
                    ) : appt.treatment_id ? (
                        <Pencil className="w-4 h-4" />
                    ) : (
                        <FileText className="w-4 h-4" />
                    )}
                  </button>

                  <button 
                    onClick={() => setDeleteTarget(appt)}
                    className="p-2 text-gray-400 hover:bg-red-50 hover:text-red-500 rounded-lg transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* דיאלוג תיעוד טיפול - עכשיו מקבל את המידע המלא */}
      {treatDialogOpen && (
        <TreatmentDialog
          open={treatDialogOpen}
          onClose={() => {
            setTreatDialogOpen(false);
            setSelectedTreatment(null);
          }}
          onSaved={() => { 
            setTreatDialogOpen(false); 
            setSelectedTreatment(null);
            load(); 
          }}
          patient={patient}
          treatment={selectedTreatment} // המידע המלא עובר כאן
          appointmentId={selectedAppt?.id}
        />
      )}

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