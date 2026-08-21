import { Outlet } from 'react-router-dom';
import { useAuthStore } from '../../stores/authStore';
import { LogOut, Shield } from 'lucide-react';

export default function WatchmanLayout() {
  const { logout } = useAuthStore();

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
        <Outlet />
      </main>
    </div>
  );
}
