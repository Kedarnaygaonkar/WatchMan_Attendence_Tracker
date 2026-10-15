import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'react-hot-toast';
import { useAuthStore } from './stores/authStore';

// Auth
import LoginPage from './pages/auth/LoginPage';

// Public QR Scan page (no auth required)
import ScanPage from './pages/scan/ScanPage';

// Agency / Super Admin pages
import AgencyLayout from './pages/agency/AgencyLayout';
import AgencyDashboard from './pages/agency/AgencyDashboard';
import AgenciesPage from './pages/agency/AgenciesPage';
import SocietiesPage from './pages/agency/SocietiesPage';
import WatchmenPage from './pages/agency/WatchmenPage';
import ShiftsPage from './pages/agency/ShiftsPage';
import AssignmentsPage from './pages/agency/AssignmentsPage';
import AttendancePage from './pages/agency/AttendancePage';
import ReplacementsPage from './pages/agency/ReplacementsPage';
import ReportsPage from './pages/agency/ReportsPage';
import GatesPage from './pages/agency/GatesPage';
import DeliveryPage from './pages/agency/DeliveryPage';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30 * 1000, // 30 seconds fresh cache - page navigation is INSTANT!
      gcTime: 5 * 60 * 1000, // keep cached data in memory for 5 minutes
      refetchOnWindowFocus: false, // avoid background refetch freezes
      retry: 1,
    },
  },
});

/** Route guard component */
function ProtectedRoute({
  children,
  allowedRoles,
}: {
  children: React.ReactNode;
  allowedRoles: string[];
}) {
  const { isAuthenticated, user } = useAuthStore();

  if (!isAuthenticated || !user) {
    return <Navigate to="/login" replace />;
  }

  if (!allowedRoles.includes(user.role)) {
    if (user.role === 'agency_admin') {
      return <Navigate to="/admin" replace />;
    }
    return <Navigate to="/agency" replace />;
  }

  return <>{children}</>;
}

/** Auto-redirect based on role after login */
function RoleRedirect() {
  const { user } = useAuthStore();
  if (!user) return <Navigate to="/login" replace />;
  if (user.role === 'agency_admin') return <Navigate to="/admin" replace />;
  return <Navigate to="/agency" replace />;
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          {/* Root redirect */}
          <Route path="/" element={<RoleRedirect />} />

          {/* Login routes */}
          <Route path="/login" element={<LoginPage />} />
          <Route path="/admin/login" element={<LoginPage defaultPortal="admin" />} />
          <Route path="/super-admin/login" element={<LoginPage defaultPortal="super_admin" />} />

          {/* PUBLIC QR Scan page — no auth required */}
          <Route path="/scan/:token" element={<ScanPage />} />

          {/* ── AGENCY ADMIN PORTAL (/admin) ─────────────────────────────────── */}
          <Route
            path="/admin"
            element={
              <ProtectedRoute allowedRoles={['agency_admin']}>
                <AgencyLayout />
              </ProtectedRoute>
            }
          >
            <Route index element={<AgencyDashboard />} />
            <Route path="societies" element={<SocietiesPage />} />
            <Route path="watchmen" element={<WatchmenPage />} />
            <Route path="shifts" element={<ShiftsPage />} />
            <Route path="assignments" element={<AssignmentsPage />} />
            <Route path="attendance" element={<AttendancePage />} />
            <Route path="replacements" element={<ReplacementsPage />} />
            <Route path="reports" element={<ReportsPage />} />
            <Route path="delivery" element={<DeliveryPage />} />
            {/* Block Agency Admin from gates / QR code generation or agencies list */}
            <Route path="gates" element={<Navigate to="/admin" replace />} />
            <Route path="agencies" element={<Navigate to="/admin" replace />} />
          </Route>

          {/* ── SUPER ADMIN PORTAL (/agency & /super-admin) ──────────────────── */}
          <Route
            path="/agency"
            element={
              <ProtectedRoute allowedRoles={['super_admin']}>
                <AgencyLayout />
              </ProtectedRoute>
            }
          >
            <Route index element={<AgencyDashboard />} />
            <Route path="agencies" element={<AgenciesPage />} />
            <Route path="societies" element={<SocietiesPage />} />
            <Route path="watchmen" element={<WatchmenPage />} />
            <Route path="shifts" element={<ShiftsPage />} />
            <Route path="gates" element={<GatesPage />} />
            <Route path="assignments" element={<AssignmentsPage />} />
            <Route path="attendance" element={<AttendancePage />} />
            <Route path="replacements" element={<ReplacementsPage />} />
            <Route path="reports" element={<ReportsPage />} />
            <Route path="delivery" element={<DeliveryPage />} />
          </Route>

          {/* Alias for super-admin */}
          <Route path="/super-admin" element={<Navigate to="/agency" replace />} />
          <Route path="/super-admin/*" element={<Navigate to="/agency" replace />} />

          {/* 404 */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>

      <Toaster
        position="top-center"
        toastOptions={{
          style: {
            background: '#1e293b',
            color: '#f1f5f9',
            border: '1px solid #334155',
            borderRadius: '12px',
            fontFamily: 'Inter, sans-serif',
          },
          success: { iconTheme: { primary: '#22c55e', secondary: '#1e293b' } },
          error: { iconTheme: { primary: '#ef4444', secondary: '#1e293b' } },
        }}
      />
    </QueryClientProvider>
  );
}
