import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import {
  Shield, LayoutDashboard, Building2, Users, Clock, GitBranch,
  ClipboardList, ArrowLeftRight, BarChart3, LogOut, Menu, X, Bell, QrCode, Bike
} from 'lucide-react';
import { useState } from 'react';
import { useAuthStore } from '../../stores/authStore';

export default function AgencyLayout() {
  const { user, logout } = useAuthStore();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const isSuperAdmin = user?.role === 'super_admin';
  const basePath = isSuperAdmin ? '/agency' : '/admin';

  const navItems = [
    { to: basePath, label: 'Dashboard', icon: LayoutDashboard, end: true },
    { to: `${basePath}/agencies`, label: 'Agencies', icon: Building2, roles: ['super_admin'] },
    { to: `${basePath}/societies`, label: 'Societies', icon: Building2 },
    { to: `${basePath}/watchmen`, label: 'Watchmen', icon: Users },
    { to: `${basePath}/shifts`, label: 'Shifts', icon: Clock },
    { to: `${basePath}/gates`, label: 'QR Codes', icon: QrCode, roles: ['super_admin'] },
    { to: `${basePath}/attendance`, label: 'Attendance Logs', icon: ClipboardList },
    { to: `${basePath}/replacements`, label: 'Replacements', icon: ArrowLeftRight },
    { to: `${basePath}/reports`, label: 'Reports & Analytics', icon: BarChart3 },
    { to: `${basePath}/delivery`, label: 'Delivery Tracking', icon: Bike },
  ];

  function handleLogout() {
    logout();
    navigate('/login');
  }

  return (
    <div className="flex h-screen bg-surface-900 overflow-hidden print:h-auto print:overflow-visible print:bg-white">
      {/* ── Sidebar ────────────────────────────────────────────── */}
      {/* Mobile backdrop */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/60 z-20 lg:hidden print:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <aside className={`
        fixed top-0 left-0 h-full w-64 z-30 flex flex-col
        bg-surface-900 border-r border-surface-800
        transition-transform duration-300 ease-in-out
        ${sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
        lg:static lg:z-auto print:hidden
      `}>
        {/* Logo & Section Header */}
        <div className="flex items-center gap-3 px-5 py-5 border-b border-surface-800">
          <div className={`w-9 h-9 rounded-xl flex items-center justify-center shadow-glow shrink-0 ${
            isSuperAdmin
              ? 'bg-gradient-to-br from-purple-500 to-indigo-700'
              : 'bg-gradient-to-br from-brand-500 to-brand-700'
          }`}>
            <img
              src="/logo.png"
              alt="Logo"
              width={24}
              height={24}
              style={{ width: '24px', height: '24px', objectFit: 'contain' }}
              className="w-6 h-6 object-contain"
            />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <p className="font-bold text-sm text-slate-100 truncate">WatchTrack</p>
              {isSuperAdmin ? (
                <span className="text-[10px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-300 border border-purple-500/30 shrink-0">
                  Super
                </span>
              ) : (
                <span className="text-[10px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded bg-brand-500/20 text-brand-300 border border-brand-500/30 shrink-0">
                  Admin
                </span>
              )}
            </div>
            <p className="text-xs text-slate-400 truncate max-w-[140px]">
              {isSuperAdmin ? 'Master Oversight' : (user?.agencyName || 'Agency Portal')}
            </p>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
          {navItems.map((item) => {
            if (item.roles && (!user || !item.roles.includes(user.role))) return null;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                onClick={() => setSidebarOpen(false)}
                className={({ isActive }) =>
                  `nav-item ${isActive ? 'active' : ''}`
                }
              >
                <item.icon className="w-4.5 h-4.5 shrink-0" style={{width:'18px',height:'18px'}} />
                {item.label}
              </NavLink>
            );
          })}
        </nav>

        {/* User info + logout */}
        <div className="p-3 border-t border-surface-800">
          <div className="flex items-center gap-3 px-3 py-2 mb-1">
            <div className={`w-8 h-8 rounded-full border flex items-center justify-center shrink-0 ${
              isSuperAdmin
                ? 'bg-purple-500/20 border-purple-500/30 text-purple-400'
                : 'bg-brand-500/20 border-brand-500/30 text-brand-400'
            }`}>
              <span className="text-sm font-bold">
                {user?.name?.charAt(0).toUpperCase()}
              </span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-slate-200 truncate">{user?.name}</p>
              <p className="text-xs text-slate-400 truncate">
                {isSuperAdmin ? 'Super Admin' : (user?.agencyName || 'Agency Admin')}
              </p>
            </div>
          </div>
          <button onClick={handleLogout} className="nav-item w-full text-danger-400 hover:text-danger-300 hover:bg-danger-500/10">
            <LogOut className="w-4 h-4" />
            Sign Out
          </button>
        </div>
      </aside>

      {/* ── Main content ────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col overflow-hidden print:overflow-visible">
        {/* Top bar (mobile) */}
        <header className="flex items-center gap-4 px-4 py-3 border-b border-surface-800 lg:hidden print:hidden">
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="p-2 rounded-lg text-slate-400 hover:text-slate-100 hover:bg-surface-800"
          >
            {sidebarOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
          <div className="flex items-center gap-2">
            <img
              src="/logo.png"
              alt="Logo"
              width={24}
              height={24}
              style={{ width: '24px', height: '24px', objectFit: 'contain' }}
              className="w-6 h-6 object-contain"
            />
            <span className="font-bold text-slate-100 text-sm">WatchTrack</span>
          </div>
          <div className="ml-auto">
            <Bell className="w-5 h-5 text-slate-500" />
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto p-4 lg:p-6 print:p-0 print:overflow-visible">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
