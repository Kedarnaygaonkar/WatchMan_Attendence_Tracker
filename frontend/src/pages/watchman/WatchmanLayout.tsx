import { useState, useEffect } from 'react';
import { Outlet } from 'react-router-dom';
import { useAuthStore } from '../../stores/authStore';
import { LogOut, Shield } from 'lucide-react';
import FaceRegistration from '../../components/FaceRegistration';
import api from '../../api/client';

export default function WatchmanLayout() {
  const { logout, user } = useAuthStore();
  const [showFaceRegistration, setShowFaceRegistration] = useState(false);
  const [faceCheckDone, setFaceCheckDone] = useState(false);

  // Check face registration status on mount
  useEffect(() => {
    if (user?.role !== 'watchman') {
      setFaceCheckDone(true);
      return;
    }
    api.get('/watchmen/face-status')
      .then(({ data }) => {
        if (!data.data.face_registered) {
          setShowFaceRegistration(true);
        }
      })
      .catch(() => {
        // If check fails, don't block the user
      })
      .finally(() => setFaceCheckDone(true));
  }, [user]);

  return (
    <div className="min-h-screen bg-gradient-to-b from-surface-950 to-surface-900 flex flex-col">
      {/* Simple top bar */}
      <header className="flex items-center justify-between px-4 py-4 border-b border-surface-800">
        <div className="flex items-center gap-2">
          <Shield className="w-6 h-6 text-brand-400" />
          <span className="text-sm font-semibold text-slate-300">WatchTrack</span>
        </div>
        <button
          onClick={logout}
          className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-300 transition-colors py-1.5 px-3 rounded-lg hover:bg-surface-800"
        >
          <LogOut className="w-4 h-4" />
          Logout
        </button>
      </header>

      {/* Main watchman content */}
      <main className="flex-1 flex flex-col">
        {faceCheckDone && <Outlet />}
      </main>

      {/* Face Registration Overlay */}
      {showFaceRegistration && (
        <FaceRegistration onComplete={() => setShowFaceRegistration(false)} />
      )}
    </div>
  );
}
