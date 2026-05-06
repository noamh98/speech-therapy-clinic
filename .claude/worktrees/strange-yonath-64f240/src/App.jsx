// src/App.jsx
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
// הוספנו את השורה הזו כאן למטה:
import { ClinicDataProvider } from './context/useClinicData'; 

import AppLayout from './components/layout/Layout';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Calendar from './pages/Calendar';
import Patients from './pages/Patients';
import PatientProfile from './pages/PatientProfile/index';
import IntakeForms from './pages/IntakeForms';
import Reports from './pages/Reports';
import AdvancedReports from './pages/AdvancedReports';
import Templates from './pages/Templates';
import AIAssistant from './pages/AIAssistant';
import Settings from './pages/Settings';
import AdminUsers from './pages/AdminUsers';
import PatientPortal from './pages/PatientPortal';
import { Spinner } from './components/ui';

function ProtectedRoute({ children, adminOnly = false }) {
  const { user, loading, isAdmin } = useAuth();
  if (loading) return <div className="flex items-center justify-center h-screen"><Spinner size="lg" /></div>;
  if (!user) return <Navigate to="/login" replace />;
  if (adminOnly && !isAdmin) return <Navigate to="/" replace />;
  return children;
}

function AppRoutes() {
  const { user, loading } = useAuth();
  if (loading) return <div className="flex items-center justify-center h-screen"><Spinner size="lg" /></div>;

  return (
    <Routes>
      {/* Public */}
      <Route path="/login" element={user ? <Navigate to="/" /> : <Login />} />
      <Route path="/portal/:patientId" element={<PatientPortal />} />

      {/* Protected */}
      <Route path="/*" element={
        <ProtectedRoute>
          <AppLayout>
            <Routes>
              <Route path="/"                 element={<Dashboard />} />
              <Route path="/calendar"         element={<Calendar />} />
              <Route path="/patients"         element={<Patients />} />
              <Route path="/patients/:id"     element={<PatientProfile />} />
              <Route path="/intake-forms"     element={<IntakeForms />} />
              <Route path="/reports"          element={<Reports />} />
              <Route path="/reports/advanced" element={<AdvancedReports />} />
              <Route path="/templates"        element={<Templates />} />
              <Route path="/ai-assistant"     element={<AIAssistant />} />
              <Route path="/settings"         element={<Settings />} />
              <Route path="/admin/users"      element={<ProtectedRoute adminOnly><AdminUsers /></ProtectedRoute>} />
              <Route path="*"                 element={<Navigate to="/" />} />
            </Routes>
          </AppLayout>
        </ProtectedRoute>
      } />
    </Routes>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        {/* עטפנו את AppRoutes ב-ClinicDataProvider החדש */}
        <ClinicDataProvider>
          <AppRoutes />
        </ClinicDataProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}