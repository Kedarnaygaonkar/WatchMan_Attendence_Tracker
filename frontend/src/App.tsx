import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'react-hot-toast';
import { useAuthStore } from './stores/authStore';

// Auth
import LoginPage from './pages/auth/LoginPage';

// Watchman pages (simple mobile-first)
import WatchmanLayout from './pages/watchman/WatchmanLayout';
import WatchmanHome from './pages/watchman/WatchmanHome';

// Agency pages (full dashboard)
import AgencyLayout from './pages/agency/AgencyLayout';
import AgencyDashboard from './pages/agency/AgencyDashboard';
import SocietiesPage from './pages/agency/SocietiesPage';
import WatchmenPage from './pages/agency/WatchmenPage';
import ShiftsPage from './pages/agency/ShiftsPage';
import AssignmentsPage from './pages/agency/AssignmentsPage';
import AttendancePage from './pages/agency/AttendancePage';
import ReplacementsPage from './pages/agency/ReplacementsPage';
import ReportsPage from './pages/agency/ReportsPage';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30 * 1000, // 30 seconds (default for real-time app)
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
    // Redirect to role-appropriate home
    if (user.role === 'watchman') return <Navigate to="/watchman" replace />;
    return <Navigate to="/agency" replace />;
  }

  return <>{children}</>;
}

/** Auto-redirect based on role after login */
function RoleRedirect() {
  const { user } = useAuthStore();
  if (!user) return <Navigate to="/login" replace />;
  if (user.role === 'watchman') return <Navigate to="/watchman" replace />;
  return <Navigate to="/agency" replace />;
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          {/* Root → redirect by role */}
          <Route path="/" element={<RoleRedirect />} />

          {/* Login (shared) */}
          <Route path="/login" element={<LoginPage />} />

          {/* ── WATCHMAN routes ──────────────────────────────── */}
          <Route
            path="/watchman"
            element={
              <ProtectedRoute allowedRoles={['watchman']}>
                <WatchmanLayout />
              </ProtectedRoute>
            }
          >
            <Route index element={<WatchmanHome />} />
          </Route>

          {/* ── AGENCY ADMIN routes ──────────────────────────── */}
          <Route
            path="/agency"
            element={
              <ProtectedRoute allowedRoles={['agency_admin', 'super_admin']}>
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
          </Route>

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
          success: {
            iconTheme: { primary: '#22c55e', secondary: '#1e293b' },
          },
          error: {
            iconTheme: { primary: '#ef4444', secondary: '#1e293b' },
          },
        }}
      />
    </QueryClientProvider>
  );
}
