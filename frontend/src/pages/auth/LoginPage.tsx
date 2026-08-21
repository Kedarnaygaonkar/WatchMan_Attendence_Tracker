import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Shield, Eye, EyeOff, Lock, Mail, AlertCircle, Building2, UserCircle } from 'lucide-react';
import api from '../../api/client';
import { useAuthStore } from '../../stores/authStore';
import toast from 'react-hot-toast';

export default function LoginPage() {
  const navigate = useNavigate();
  const { setAuth } = useAuthStore();

  const [loginMode, setLoginMode] = useState<'watchman' | 'admin'>('watchman');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const { data } = await api.post('/auth/login', { email, password });
      if (data.success) {
        const { user, accessToken, refreshToken } = data.data;
        
        // Prevent wrong login based on mode
        if (loginMode === 'watchman' && user.role !== 'watchman') {
          setError('Please use the Admin login page for agency admin accounts.');
          return;
        }
        if (loginMode === 'admin' && user.role === 'watchman') {
          setError('Please use the Watchman login page for guard accounts.');
          return;
        }

        setAuth(user, accessToken, refreshToken);
        toast.success(`Welcome back, ${user.name}!`);
        
        // Navigate based on role
        if (user.role === 'watchman') {
          navigate('/watchman', { replace: true });
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

  return (
    <div className="min-h-screen bg-surface-900 flex items-center justify-center p-4 relative">
      {/* Admin Login Toggle (Top Left) */}
      <div className="absolute top-4 left-4 sm:top-6 sm:left-6 z-10">
        <button
          onClick={() => {
            setLoginMode(loginMode === 'watchman' ? 'admin' : 'watchman');
            setEmail('');
            setPassword('');
            setError('');
          }}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-surface-800/80 border border-surface-700 text-slate-300 hover:text-white hover:bg-surface-700 transition-all shadow-sm"
        >
          {loginMode === 'watchman' ? (
            <>
              <Building2 className="w-4 h-4" />
              <span className="text-sm font-medium">Agency Admin Login</span>
            </>
          ) : (
            <>
              <UserCircle className="w-4 h-4" />
              <span className="text-sm font-medium">Watchman Login</span>
            </>
          )}
        </button>
      </div>

      {/* Background gradient */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-96 h-96 rounded-full bg-brand-600/10 blur-3xl" />
        <div className="absolute -bottom-40 -left-40 w-96 h-96 rounded-full bg-brand-800/10 blur-3xl" />
      </div>

      <div className="relative w-full max-w-md animate-slide-up">
        {/* Logo / Brand */}
        <div className="text-center mb-8 mt-12 sm:mt-0">
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-3xl bg-gradient-to-br from-brand-500 to-brand-700 shadow-glow mb-4">
            <Shield className="w-10 h-10 text-white" strokeWidth={1.5} />
          </div>
          <h1 className="text-3xl font-black text-slate-100 tracking-tight">
            Watchman Tracker
          </h1>
          <p className="text-slate-500 mt-1 text-sm">
            {loginMode === 'watchman' ? 'Guarding simplified.' : 'Security Agency Management Platform'}
          </p>
        </div>

        {/* Login Card */}
        <div className="card p-8 shadow-xl border border-surface-700/50 relative overflow-hidden">
          {/* Subtle mode indicator at top of card */}
          <div className={`absolute top-0 left-0 w-full h-1 ${loginMode === 'watchman' ? 'bg-brand-500' : 'bg-purple-500'}`} />

          <h2 className="text-xl font-bold text-slate-100 mb-6">
            {loginMode === 'watchman' ? 'Watchman Sign In' : 'Admin Sign In'}
          </h2>

          {error && (
            <div className="flex items-center gap-3 p-4 rounded-xl bg-danger-500/10 border border-danger-500/20 mb-6 animate-fade-in">
              <AlertCircle className="w-5 h-5 text-danger-400 shrink-0" />
              <p className="text-sm text-danger-300">{error}</p>
            </div>
          )}

          <form onSubmit={handleLogin} className="space-y-5">
            {/* Email */}
            <div className="form-group">
              <label htmlFor="email" className="label">Email Address</label>
              <div className="relative">
                <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4.5 h-4.5 text-slate-500 pointer-events-none" style={{width:'18px',height:'18px'}} />
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder={loginMode === 'watchman' ? "ramesh@punesecure.com" : "admin@punesecure.com"}
                  className="input pl-11 h-12 text-base"
                  required
                  autoComplete="email"
                  autoFocus
                />
              </div>
            </div>

            {/* Password */}
            <div className="form-group">
              <label htmlFor="password" className="label">Password</label>
              <div className="relative">
                <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" style={{width:'18px',height:'18px'}} />
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter your password"
                  className="input pl-11 pr-11 h-12 text-base"
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
              className={`btn-primary w-full py-4 text-base font-bold mt-2 shadow-lg hover:shadow-xl transition-all ${
                loginMode === 'admin' ? 'bg-purple-600 hover:bg-purple-700 shadow-purple-500/25 border-purple-500' : ''
              }`}
            >
              {loading ? (
                <div className="flex items-center justify-center gap-2">
                  <div className="spinner w-5 h-5 border-2" />
                  <span>Signing in...</span>
                </div>
              ) : (
                'Sign In'
              )}
            </button>
          </form>

          {/* Demo credentials hint */}
          <div className="mt-8 p-4 rounded-xl bg-surface-800/80 border border-surface-700">
            <p className="text-xs font-semibold text-slate-400 mb-2 uppercase tracking-wider">Demo Access</p>
            <div className="space-y-2">
              {loginMode === 'watchman' ? (
                <button
                  type="button"
                  onClick={() => { setEmail('ramesh@punesecure.com'); setPassword('Guard@123'); }}
                  className="w-full flex items-center justify-between p-3 rounded-lg bg-surface-700/50 hover:bg-surface-600 transition-colors border border-surface-600"
                >
                  <div className="text-left">
                    <span className="block text-sm text-slate-200 font-medium">Watchman Account</span>
                    <span className="block text-xs text-slate-400 mt-0.5">ramesh@punesecure.com</span>
                  </div>
                  <span className="text-xs px-2 py-1 rounded bg-brand-500/20 text-brand-400 font-medium">Fill</span>
                </button>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => { setEmail('admin@punesecure.com'); setPassword('Admin@123'); }}
                    className="w-full flex items-center justify-between p-3 rounded-lg bg-surface-700/50 hover:bg-surface-600 transition-colors border border-surface-600"
                  >
                    <div className="text-left">
                      <span className="block text-sm text-slate-200 font-medium">Agency Admin</span>
                      <span className="block text-xs text-slate-400 mt-0.5">admin@punesecure.com</span>
                    </div>
                    <span className="text-xs px-2 py-1 rounded bg-purple-500/20 text-purple-400 font-medium">Fill</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => { setEmail('super@admin.com'); setPassword('superadmin123'); }}
                    className="w-full flex items-center justify-between p-3 rounded-lg bg-surface-700/50 hover:bg-surface-600 transition-colors border border-surface-600 mt-2"
                  >
                    <div className="text-left">
                      <span className="block text-sm text-slate-200 font-medium">Super Admin</span>
                      <span className="block text-xs text-slate-400 mt-0.5">super@admin.com</span>
                    </div>
                    <span className="text-xs px-2 py-1 rounded bg-purple-500/20 text-purple-400 font-medium">Fill</span>
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
