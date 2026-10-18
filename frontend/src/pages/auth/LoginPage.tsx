import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Eye, EyeOff, Lock, Mail, AlertCircle, Building2, ShieldCheck } from 'lucide-react';
import api from '../../api/client';
import { useAuthStore } from '../../stores/authStore';
import toast from 'react-hot-toast';

interface LoginPageProps {
  defaultPortal?: 'admin' | 'super_admin';
}

export default function LoginPage({ defaultPortal }: LoginPageProps) {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { setAuth } = useAuthStore();

  const queryPortal = searchParams.get('portal');
  const initialPortal: 'admin' | 'super_admin' =
    defaultPortal ||
    (queryPortal === 'super_admin' ? 'super_admin' : 'admin');

  const [activePortal, setActivePortal] = useState<'admin' | 'super_admin'>(initialPortal);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (queryPortal === 'super_admin') {
      setActivePortal('super_admin');
    } else if (queryPortal === 'admin') {
      setActivePortal('admin');
    }
  }, [queryPortal]);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const { data } = await api.post('/auth/login', { email, password });
      if (data.success) {
        const { user, accessToken, refreshToken } = data.data;

        if (user.role === 'watchman') {
          setError('Watchman accounts cannot sign in to management portals. Please use your society QR code to mark attendance.');
          return;
        }

        setAuth(user, accessToken, refreshToken);

        if (user.role === 'super_admin') {
          toast.success(`Welcome, Super Admin ${user.name}!`);
          navigate('/agency', { replace: true });
        } else if (user.role === 'agency_admin') {
          toast.success(`Welcome back, ${user.name} (${user.agencyName || 'Agency Admin'})!`);
          navigate('/admin', { replace: true });
        } else {
          navigate('/agency', { replace: true });
        }
      }
    } catch (err: unknown) {
      const message = (err as { response?: { data?: { message?: string } } })
        ?.response?.data?.message || 'Login failed. Please check your credentials.';
      setError(message);
    } finally {
      setLoading(false);
    }
  }

  const isSuper = activePortal === 'super_admin';

  return (
    <div className="min-h-screen bg-surface-900 flex items-center justify-center p-4 relative">
      {/* Background gradients */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className={`absolute -top-40 -right-40 w-96 h-96 rounded-full blur-3xl transition-all duration-700 ${
          isSuper ? 'bg-purple-600/15' : 'bg-brand-600/15'
        }`} />
        <div className={`absolute -bottom-40 -left-40 w-96 h-96 rounded-full blur-3xl transition-all duration-700 ${
          isSuper ? 'bg-indigo-800/15' : 'bg-brand-800/15'
        }`} />
      </div>

      <div className="relative w-full max-w-md animate-slide-up">
        {/* Logo / Brand Header */}
        <div className="text-center mb-6">
          <div className={`inline-flex items-center justify-center w-20 h-20 rounded-3xl shadow-glow mb-4 transition-all duration-300 ${
            isSuper
              ? 'bg-gradient-to-br from-purple-500 to-indigo-700'
              : 'bg-gradient-to-br from-brand-500 to-brand-700'
          }`}>
            <img
              src="/logo.png"
              alt="Logo"
              width={48}
              height={48}
              style={{ width: '48px', height: '48px', objectFit: 'contain' }}
              className="w-12 h-12 object-contain"
            />
          </div>
          <h1 className="text-3xl font-black text-slate-100 tracking-tight">
            Watchman Tracker
          </h1>
          <p className="text-slate-500 mt-1 text-sm">Security Agency Management Platform</p>
        </div>

        {/* Portal Switcher Tabs */}
        <div className="grid grid-cols-2 gap-2 p-1.5 bg-surface-800/90 border border-surface-700/60 rounded-2xl mb-4 backdrop-blur-sm">
          <button
            type="button"
            onClick={() => { setActivePortal('admin'); setError(''); }}
            className={`flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl text-sm font-semibold transition-all duration-200 ${
              !isSuper
                ? 'bg-gradient-to-r from-brand-600 to-brand-700 text-white shadow-md'
                : 'text-slate-400 hover:text-slate-200 hover:bg-surface-700/40'
            }`}
          >
            <Building2 className="w-4 h-4 shrink-0" />
            <span>Agency Admin</span>
          </button>

          <button
            type="button"
            onClick={() => { setActivePortal('super_admin'); setError(''); }}
            className={`flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl text-sm font-semibold transition-all duration-200 ${
              isSuper
                ? 'bg-gradient-to-r from-purple-600 to-indigo-600 text-white shadow-md'
                : 'text-slate-400 hover:text-slate-200 hover:bg-surface-700/40'
            }`}
          >
            <ShieldCheck className="w-4 h-4 shrink-0" />
            <span>Super Admin</span>
          </button>
        </div>

        {/* Login Card */}
        <div className="card p-7 shadow-2xl border border-surface-700/60 relative overflow-hidden">
          {/* Top accent bar */}
          <div className={`absolute top-0 left-0 w-full h-1 bg-gradient-to-r transition-all duration-500 ${
            isSuper ? 'from-purple-500 via-indigo-500 to-purple-600' : 'from-brand-500 to-brand-700'
          }`} />

          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              {isSuper ? (
                <ShieldCheck className="w-5 h-5 text-purple-400" />
              ) : (
                <Building2 className="w-5 h-5 text-brand-400" />
              )}
              <h2 className="text-xl font-bold text-slate-100">
                {isSuper ? 'Super Admin Sign In' : 'Agency Admin Sign In'}
              </h2>
            </div>
            <span className={`text-[11px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border ${
              isSuper
                ? 'bg-purple-500/10 text-purple-300 border-purple-500/30'
                : 'bg-brand-500/10 text-brand-300 border-brand-500/30'
            }`}>
              {isSuper ? 'Master Portal' : 'Agency Portal'}
            </span>
          </div>

          <p className="text-slate-400 text-xs mb-6">
            {isSuper
              ? 'Master administrative access across all security agencies & settings.'
              : 'Sign in to manage your agency’s watchmen, societies & attendance.'}
          </p>

          {error && (
            <div className="flex items-center gap-3 p-3.5 rounded-xl bg-danger-500/10 border border-danger-500/20 mb-5 animate-fade-in">
              <AlertCircle className="w-5 h-5 text-danger-400 shrink-0" />
              <p className="text-sm text-danger-300">{error}</p>
            </div>
          )}

          <form onSubmit={handleLogin} className="space-y-4">
            {/* Email */}
            <div className="form-group">
              <label htmlFor="email" className="label text-xs font-semibold text-slate-300">
                {isSuper ? 'Super Admin Email' : 'Agency Admin Email'}
              </label>
              <div className="relative">
                <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" style={{width:'18px',height:'18px'}} />
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder={isSuper ? 'superadmin@watchtrack.com' : 'admin@punesecure.com'}
                  className="input pl-11 h-12 text-sm"
                  required
                  autoComplete="email"
                  autoFocus
                />
              </div>
            </div>

            {/* Password */}
            <div className="form-group">
              <label htmlFor="password" className="label text-xs font-semibold text-slate-300">Password</label>
              <div className="relative">
                <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" style={{width:'18px',height:'18px'}} />
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter your password"
                  className="input pl-11 pr-11 h-12 text-sm"
                  required
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition-colors p-1"
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff style={{width:'18px',height:'18px'}} /> : <Eye style={{width:'18px',height:'18px'}} />}
                </button>
              </div>
            </div>

            {/* Submit */}
            <button
              type="submit"
              disabled={loading}
              className={`w-full py-3.5 text-sm font-bold mt-2 rounded-xl text-white shadow-lg transition-all flex items-center justify-center gap-2 ${
                isSuper
                  ? 'bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 shadow-purple-900/30'
                  : 'bg-gradient-to-r from-brand-600 to-brand-700 hover:from-brand-500 hover:to-brand-600 shadow-brand-900/30'
              }`}
            >
              {loading ? (
                <>
                  <div className="spinner w-4 h-4 border-2" />
                  <span>Signing in...</span>
                </>
              ) : (
                isSuper ? 'Sign In to Super Admin' : 'Sign In to Agency Portal'
              )}
            </button>
          </form>

          {/* Quick Demo Credentials Helper */}
          <div className="mt-5 pt-4 border-t border-surface-700/60 space-y-2">
            <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider text-center">
              Quick Demo Logins (Click to Auto-fill)
            </p>
            {isSuper ? (
              <div className="grid grid-cols-1 gap-1.5 text-xs">
                <button
                  type="button"
                  onClick={() => {
                    setEmail('superadmin@watchtrack.com');
                    setPassword('Admin@123');
                    toast.success('Auto-filled Super Admin credentials');
                  }}
                  className="px-3 py-2 rounded-xl bg-purple-500/10 hover:bg-purple-500/20 text-purple-300 border border-purple-500/30 text-left transition-colors flex items-center justify-between"
                >
                  <span className="font-semibold">👑 Super Admin</span>
                  <span className="font-mono text-[11px] text-purple-200">superadmin@watchtrack.com</span>
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-1.5 text-xs">
                <button
                  type="button"
                  onClick={() => {
                    setEmail('alertspace@gmail.com');
                    setPassword('Admin@123');
                    toast.success('Auto-filled Alert Space Admin credentials');
                  }}
                  className="px-3 py-2 rounded-xl bg-brand-500/10 hover:bg-brand-500/20 text-brand-300 border border-brand-500/30 text-left transition-colors flex items-center justify-between"
                >
                  <span className="font-semibold">🏢 Alert Space Admin (30 Guards)</span>
                  <span className="font-mono text-[11px] text-brand-200">alertspace@gmail.com</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setEmail('admin@punesecure.com');
                    setPassword('Admin@123');
                    toast.success('Auto-filled Pune Secure Admin credentials');
                  }}
                  className="px-3 py-2 rounded-xl bg-surface-700/60 hover:bg-surface-700 text-slate-300 border border-surface-600 text-left transition-colors flex items-center justify-between"
                >
                  <span className="font-semibold">🏢 Pune Secure Admin</span>
                  <span className="font-mono text-[11px] text-slate-300">admin@punesecure.com</span>
                </button>
              </div>
            )}
          </div>

          {/* Quick Switch helper */}
          <div className="mt-4 pt-3 border-t border-surface-700/60 text-center">
            <button
              type="button"
              onClick={() => {
                setActivePortal(isSuper ? 'admin' : 'super_admin');
                setError('');
              }}
              className="text-xs text-slate-400 hover:text-slate-200 transition-colors"
            >
              {isSuper ? (
                <>Managing a security agency? <span className="text-brand-400 font-semibold underline underline-offset-2">Switch to Agency Admin</span></>
              ) : (
                <>Platform owner? <span className="text-purple-400 font-semibold underline underline-offset-2">Switch to Super Admin</span></>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
