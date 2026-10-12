import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Building2,
  Plus,
  Edit2,
  ShieldAlert,
  KeyRound,
  Copy,
  Check,
  Eye,
  EyeOff,
  Sparkles,
  ExternalLink,
  Send,
  CheckCircle2,
  Lock,
} from 'lucide-react';
import api from '../../api/client';
import toast from 'react-hot-toast';
import { useAuthStore } from '../../stores/authStore';

// Dynamically import all images in the backgrounds folder at build time
const backgroundFiles = import.meta.glob('/public/backgrounds/*.{png,jpg,jpeg,webp}');
const dynamicBackgrounds = Object.keys(backgroundFiles).map((path) => path.replace('/public', ''));

interface Agency {
  id: string;
  name: string;
  email: string;
  phone?: string;
  address?: string;
  logo_url?: string;
  background_url?: string;
  status: 'active' | 'inactive' | 'suspended';
  createdAt: string;
  admin_user?: {
    email: string;
    name: string;
    is_active: boolean;
    last_login?: string;
  } | null;
  has_credentials?: boolean;
}

function generateRandomPassword(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
  const specials = '@#$%&*';
  let pwd = '';
  for (let i = 0; i < 6; i++) {
    pwd += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  pwd += specials.charAt(Math.floor(Math.random() * specials.length));
  for (let i = 0; i < 3; i++) {
    pwd += Math.floor(Math.random() * 10);
  }
  return pwd;
}

export default function AgenciesPage() {
  const { user } = useAuthStore();
  const isSuperAdmin = user?.role === 'super_admin';

  const queryClient = useQueryClient();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingAgency, setEditingAgency] = useState<Agency | null>(null);
  const [showPassword, setShowPassword] = useState(false);

  // Credentials management modal state
  const [credentialsAgency, setCredentialsAgency] = useState<Agency | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [copied, setCopied] = useState(false);

  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: '',
    phone: '',
    address: '',
    logo_url: '',
    background_url: '',
    status: 'active' as 'active' | 'inactive' | 'suspended',
  });

  function handleLogoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 2 * 1024 * 1024) {
      toast.error('Image size must be less than 2MB');
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      setFormData((f) => ({ ...f, logo_url: reader.result as string }));
    };
    reader.readAsDataURL(file);
  }

  const { data: agencies = [], isLoading } = useQuery<Agency[]>({
    queryKey: ['agencies'],
    queryFn: async () => {
      const { data } = await api.get('/agencies');
      return data.data;
    },
    enabled: isSuperAdmin,
  });

  const saveMutation = useMutation({
    mutationFn: async (payload: typeof formData) => {
      if (editingAgency) {
        const body: any = { ...payload };
        if (!body.password) delete body.password;
        return api.put(`/agencies/${editingAgency.id}`, body);
      }
      return api.post('/agencies', payload);
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['agencies'] });
      toast.success(editingAgency ? 'Agency updated!' : 'Agency created with credentials!');
      
      // If a password was specified, open the credentials share modal for quick sending
      if (variables.password) {
        const createdAgency: Agency = {
          id: editingAgency?.id || 'new',
          name: variables.name,
          email: variables.email,
          phone: variables.phone,
          status: variables.status,
          createdAt: new Date().toISOString(),
          has_credentials: true,
        };
        setCredentialsAgency(createdAgency);
        setNewPassword(variables.password);
        setShowNewPassword(true);
      }
      closeModal();
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.message || 'Failed to save agency');
    },
  });

  const updateCredentialsMutation = useMutation({
    mutationFn: async ({ id, password }: { id: string; password: string }) => {
      return api.post(`/agencies/${id}/credentials`, { password });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['agencies'] });
      toast.success('Agency password updated successfully!');
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.message || 'Failed to update credentials');
    },
  });

  if (!isSuperAdmin) {
    return (
      <div className="flex flex-col items-center justify-center h-96 text-slate-400">
        <ShieldAlert className="w-12 h-12 mb-4 text-slate-500" />
        <h2 className="text-xl font-bold text-slate-200">Access Denied</h2>
        <p>You do not have permission to view this page.</p>
      </div>
    );
  }

  function openModal(agency?: Agency) {
    if (agency) {
      setEditingAgency(agency);
      setFormData({
        name: agency.name,
        email: agency.email,
        password: '',
        phone: agency.phone || '',
        address: agency.address || '',
        logo_url: agency.logo_url || '',
        background_url: agency.background_url || '',
        status: agency.status,
      });
    } else {
      setEditingAgency(null);
      setFormData({
        name: '',
        email: '',
        password: '',
        phone: '',
        address: '',
        logo_url: '',
        background_url: '',
        status: 'active',
      });
    }
    setShowPassword(false);
    setIsModalOpen(true);
  }

  function closeModal() {
    setIsModalOpen(false);
    setEditingAgency(null);
  }

  function openCredentialsModal(agency: Agency) {
    setCredentialsAgency(agency);
    setNewPassword('');
    setShowNewPassword(false);
    setCopied(false);
  }

  function getShareText(agencyName: string, email: string, password?: string) {
    const portalUrl = `${window.location.origin}/login`;
    return `🏢 WatchTrack — Agency Admin Credentials
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Agency Name : ${agencyName}
Portal Link : ${portalUrl}
Login Tab   : Agency Admin
Email / ID  : ${email}
${password ? `Password    : ${password}\n` : ''}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Sign in at the link above and select the Agency Admin tab.`;
  }

  function copyToClipboard(text: string) {
    navigator.clipboard.writeText(text);
    setCopied(true);
    toast.success('Credentials copied to clipboard!');
    setTimeout(() => setCopied(false), 2500);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!editingAgency && (!formData.password || formData.password.length < 6)) {
      toast.error('Please enter a password with at least 6 characters for the agency admin.');
      return;
    }
    if (formData.password && formData.password.length < 6) {
      toast.error('Password must be at least 6 characters.');
      return;
    }
    saveMutation.mutate(formData);
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="section-header">
        <div>
          <h1 className="section-title flex items-center gap-2">
            <Building2 className="w-6 h-6 text-brand-400" />
            Agencies
          </h1>
          <p className="section-subtitle">Manage security agencies and their admin credentials</p>
        </div>
        <button onClick={() => openModal()} className="btn-primary flex items-center gap-2">
          <Plus className="w-4 h-4" /> Add Agency
        </button>
      </div>

      {/* Table */}
      <div className="table-wrapper">
        <table className="table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Login ID & Contact</th>
              <th>Address</th>
              <th>Status</th>
              <th>Created On</th>
              <th className="text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              Array.from({ length: 3 }).map((_, i) => (
                <tr key={i}>
                  <td colSpan={6}>
                    <div className="h-12 bg-surface-700 animate-pulse rounded" />
                  </td>
                </tr>
              ))
            ) : agencies.length === 0 ? (
              <tr>
                <td colSpan={6} className="text-center py-8 text-slate-400">
                  No agencies found. Add one to get started.
                </td>
              </tr>
            ) : (
              agencies.map((agency) => (
                <tr key={agency.id}>
                  <td>
                    <div className="flex items-center gap-3">
                      {agency.logo_url ? (
                        <img
                          src={agency.logo_url}
                          alt={`${agency.name} logo`}
                          className="w-10 h-10 rounded-lg object-contain bg-surface-700/50 p-1 border border-surface-600/50"
                        />
                      ) : (
                        <div className="w-10 h-10 rounded-lg bg-brand-500/10 flex items-center justify-center shrink-0 border border-brand-500/20">
                          <Building2 className="w-5 h-5 text-brand-400" />
                        </div>
                      )}
                      <div>
                        <div className="font-semibold text-slate-100">{agency.name}</div>
                      </div>
                    </div>
                  </td>
                  <td>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-slate-200">{agency.email}</span>
                      {agency.has_credentials && (
                        <span
                          className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30"
                          title="Agency login account is active"
                        >
                          <CheckCircle2 className="w-2.5 h-2.5" /> Ready
                        </span>
                      )}
                    </div>
                    {agency.phone && <div className="text-xs text-slate-500 mt-0.5">{agency.phone}</div>}
                  </td>
                  <td className="text-sm text-slate-400 max-w-[200px] truncate">
                    {agency.address || '—'}
                  </td>
                  <td>
                    <span
                      className={`badge ${
                        agency.status === 'active'
                          ? 'badge-success'
                          : agency.status === 'suspended'
                          ? 'badge-danger'
                          : 'badge-warning'
                      }`}
                    >
                      {agency.status}
                    </span>
                  </td>
                  <td className="text-sm text-slate-400">
                    {new Date(agency.createdAt).toLocaleDateString()}
                  </td>
                  <td className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        onClick={() => openCredentialsModal(agency)}
                        className="p-2 text-slate-400 hover:text-amber-400 hover:bg-amber-500/10 rounded-lg transition-colors"
                        title="Manage Credentials & Share"
                      >
                        <KeyRound className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => openModal(agency)}
                        className="p-2 text-slate-400 hover:text-brand-400 hover:bg-brand-500/10 rounded-lg transition-colors"
                        title="Edit Agency"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Add / Edit Agency Modal */}
      {isModalOpen && (
        <div className="modal-overlay" onClick={closeModal}>
          <div className="modal-content max-w-lg" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-xl font-bold text-slate-100 mb-6 flex items-center gap-2">
              <Building2 className="w-5 h-5 text-brand-400" />
              {editingAgency ? 'Edit Agency' : 'Add New Agency'}
            </h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="form-group">
                <label className="label">Agency Name *</label>
                <input
                  type="text"
                  required
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="input"
                  placeholder="e.g. Pune Secure Agency"
                />
              </div>

              {/* Email Address & Password Section */}
              <div className="p-4 rounded-xl bg-surface-900/60 border border-surface-700 space-y-4">
                <div className="flex items-center gap-2 text-xs font-semibold text-brand-300 uppercase tracking-wider">
                  <Lock className="w-3.5 h-3.5" /> Agency Admin Login Credentials
                </div>

                <div className="form-group">
                  <label className="label">Login Email ID *</label>
                  <input
                    type="email"
                    required
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    className="input"
                    placeholder="e.g. admin@punesecure.com"
                  />
                  <p className="text-[11px] text-slate-500 mt-1">
                    The agency admin uses this email to log in at the portal.
                  </p>
                </div>

                <div className="form-group">
                  <div className="flex items-center justify-between mb-1">
                    <label className="label mb-0">
                      {editingAgency ? 'Set New Password (optional)' : 'Admin Password *'}
                    </label>
                    <button
                      type="button"
                      onClick={() => {
                        const pwd = generateRandomPassword();
                        setFormData((f) => ({ ...f, password: pwd }));
                        setShowPassword(true);
                        toast.success('Generated random password!');
                      }}
                      className="text-xs text-brand-400 hover:text-brand-300 flex items-center gap-1 font-medium transition-colors"
                    >
                      <Sparkles className="w-3.5 h-3.5" /> Generate
                    </button>
                  </div>
                  <div className="relative">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      required={!editingAgency}
                      value={formData.password}
                      onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                      className="input pr-10 font-mono text-sm"
                      placeholder={
                        editingAgency
                          ? 'Leave blank to keep unchanged'
                          : 'Enter password (min 6 characters)'
                      }
                      minLength={6}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200 transition-colors"
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                  <p className="text-[11px] text-slate-500 mt-1">
                    {editingAgency
                      ? 'Leave empty to preserve the current password, or enter a new password to reset.'
                      : 'Provide this password to the agency admin.'}
                  </p>
                </div>
              </div>

              <div className="form-group">
                <label className="label">Phone Number</label>
                <input
                  type="tel"
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  className="input"
                  placeholder="e.g. +91 9876543210"
                />
              </div>

              <div className="form-group">
                <label className="label">Address</label>
                <textarea
                  value={formData.address}
                  onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                  className="input min-h-[70px]"
                  placeholder="Agency office address"
                />
              </div>

              <div className="form-group">
                <label className="label">Agency Logo</label>
                <div className="flex items-center gap-4">
                  {formData.logo_url ? (
                    <div className="relative group">
                      <img
                        src={formData.logo_url}
                        alt="Logo preview"
                        className="w-16 h-16 rounded-xl object-contain bg-surface-700/50 border border-surface-600 p-1"
                      />
                      <button
                        type="button"
                        onClick={() => setFormData({ ...formData, logo_url: '' })}
                        className="absolute -top-2 -right-2 bg-danger-500 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M6 18L18 6M6 6l12 12"
                          />
                        </svg>
                      </button>
                    </div>
                  ) : (
                    <div className="w-16 h-16 rounded-xl bg-surface-700/50 border border-dashed border-surface-600 flex items-center justify-center shrink-0">
                      <Building2 className="w-6 h-6 text-slate-500" />
                    </div>
                  )}
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleLogoUpload}
                    className="text-sm text-slate-400 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-brand-500/10 file:text-brand-400 hover:file:bg-brand-500/20"
                  />
                </div>
              </div>

              {/* Background Picker */}
              <div className="form-group">
                <label className="label">Watchman App Background</label>
                <p className="text-xs text-slate-500 mb-2">
                  Full screen background image for watchman dashboard
                </p>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => setFormData({ ...formData, background_url: '' })}
                    className={`relative rounded-xl border-2 overflow-hidden flex items-center justify-center h-16 transition-all ${
                      !formData.background_url
                        ? 'border-brand-500 bg-brand-500/10'
                        : 'border-surface-600 bg-surface-700/30'
                    }`}
                  >
                    <span className="text-xs text-slate-400 font-medium">None</span>
                  </button>
                  {dynamicBackgrounds.length > 0
                    ? dynamicBackgrounds.map((bgUrl, idx) => (
                        <button
                          key={idx}
                          type="button"
                          onClick={() => setFormData({ ...formData, background_url: bgUrl })}
                          className={`relative rounded-xl border-2 overflow-hidden h-16 transition-all ${
                            formData.background_url === bgUrl
                              ? 'border-brand-500 ring-2 ring-brand-500/30'
                              : 'border-surface-600'
                          }`}
                        >
                          <img src={bgUrl} alt={`Background ${idx}`} className="w-full h-full object-cover" />
                          {formData.background_url === bgUrl && (
                            <div className="absolute inset-0 bg-brand-500/20 flex items-center justify-center">
                              <svg
                                className="w-5 h-5 text-white drop-shadow"
                                fill="currentColor"
                                viewBox="0 0 20 20"
                              >
                                <path
                                  fillRule="evenodd"
                                  d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                                  clipRule="evenodd"
                                />
                              </svg>
                            </div>
                          )}
                        </button>
                      ))
                    : ['watchman_bg.jpg', 'bg1.png', 'bg2.png', 'bg3.png', 'bg4.png', 'bg5.png', 'bg6.png'].map(
                        (bg, idx) => (
                          <button
                            key={`fallback-${idx}`}
                            type="button"
                            onClick={() => setFormData({ ...formData, background_url: `/backgrounds/${bg}` })}
                            className={`relative rounded-xl border-2 overflow-hidden h-16 transition-all ${
                              formData.background_url === `/backgrounds/${bg}`
                                ? 'border-brand-500 ring-2 ring-brand-500/30'
                                : 'border-surface-600'
                            }`}
                          >
                            <img
                              src={`/backgrounds/${bg}`}
                              alt={`Background ${idx}`}
                              className="w-full h-full object-cover"
                            />
                            {formData.background_url === `/backgrounds/${bg}` && (
                              <div className="absolute inset-0 bg-brand-500/20 flex items-center justify-center">
                                <svg
                                  className="w-5 h-5 text-white drop-shadow"
                                  fill="currentColor"
                                  viewBox="0 0 20 20"
                                >
                                  <path
                                   fillRule="evenodd"
                                   d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                                   clipRule="evenodd"
                                  />
                                </svg>
                              </div>
                            )}
                          </button>
                        )
                      )}
                </div>
                {formData.background_url && (
                  <img
                    src={formData.background_url}
                    alt="Background preview"
                    className="mt-2 w-full rounded-xl object-cover h-32 border border-surface-600"
                  />
                )}
              </div>

              {editingAgency && (
                <div className="form-group">
                  <label className="label">Status</label>
                  <select
                    value={formData.status}
                    onChange={(e) => setFormData({ ...formData, status: e.target.value as any })}
                    className="input"
                  >
                    <option value="active">Active</option>
                    <option value="inactive">Inactive</option>
                    <option value="suspended">Suspended</option>
                  </select>
                </div>
              )}

              <div className="flex justify-end gap-3 pt-4 border-t border-surface-700">
                <button
                  type="button"
                  onClick={closeModal}
                  className="btn-secondary"
                  disabled={saveMutation.isPending}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn-primary"
                  disabled={saveMutation.isPending}
                >
                  {saveMutation.isPending ? 'Saving...' : 'Save Agency'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Credentials & Share Modal */}
      {credentialsAgency && (
        <div className="modal-overlay" onClick={() => setCredentialsAgency(null)}>
          <div className="modal-content max-w-lg" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400">
                  <KeyRound className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-slate-100">{credentialsAgency.name}</h2>
                  <p className="text-xs text-slate-400">Agency Admin Login Credentials & Share</p>
                </div>
              </div>
              <button
                onClick={() => setCredentialsAgency(null)}
                className="text-slate-400 hover:text-slate-200 text-sm p-1.5 rounded-lg hover:bg-surface-700 transition-colors"
              >
                ✕
              </button>
            </div>

            <div className="space-y-4">
              {/* Summary card */}
              <div className="p-4 rounded-xl bg-surface-900/80 border border-surface-700 space-y-2.5">
                <div className="flex items-center justify-between text-xs text-slate-400 pb-2 border-b border-surface-800">
                  <span>Portal URL</span>
                  <span className="font-mono text-brand-400 font-medium">
                    {window.location.origin}/login
                  </span>
                </div>
                <div className="flex items-center justify-between text-xs text-slate-400 pb-2 border-b border-surface-800">
                  <span>Login Portal Tab</span>
                  <span className="px-2 py-0.5 rounded bg-brand-500/15 text-brand-300 font-semibold text-[11px] border border-brand-500/30">
                    Agency Admin
                  </span>
                </div>
                <div className="flex items-center justify-between text-xs text-slate-400">
                  <span>Login Email ID</span>
                  <span className="font-mono text-slate-200 font-semibold">{credentialsAgency.email}</span>
                </div>
              </div>

              {/* Set / Reset Password Section */}
              <div className="p-4 rounded-xl bg-surface-800/40 border border-surface-700/80 space-y-2.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-slate-200 flex items-center gap-1.5">
                    <Lock className="w-3.5 h-3.5 text-amber-400" />
                    Set New Password
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      const pwd = generateRandomPassword();
                      setNewPassword(pwd);
                      setShowNewPassword(true);
                      toast.success('Generated password!');
                    }}
                    className="text-xs text-brand-400 hover:text-brand-300 flex items-center gap-1 font-medium transition-colors"
                  >
                    <Sparkles className="w-3.5 h-3.5" /> Generate
                  </button>
                </div>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <input
                      type={showNewPassword ? 'text' : 'password'}
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      className="input pr-10 font-mono text-sm"
                      placeholder="Enter new password (min 6 chars)"
                    />
                    <button
                      type="button"
                      onClick={() => setShowNewPassword(!showNewPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200"
                    >
                      {showNewPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                  {credentialsAgency.id !== 'new' && (
                    <button
                      type="button"
                      disabled={
                        !newPassword || newPassword.length < 6 || updateCredentialsMutation.isPending
                      }
                      onClick={() => {
                        updateCredentialsMutation.mutate({
                          id: credentialsAgency.id,
                          password: newPassword,
                        });
                      }}
                      className="btn-primary shrink-0 text-xs px-3.5"
                    >
                      {updateCredentialsMutation.isPending ? 'Saving...' : 'Update Password'}
                    </button>
                  )}
                </div>
              </div>

              {/* Share Box */}
              <div className="p-3.5 rounded-xl bg-surface-900/60 border border-surface-700/70 space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                    <Send className="w-3.5 h-3.5 text-brand-400" /> Ready-to-Send Details
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      const text = getShareText(
                        credentialsAgency.name,
                        credentialsAgency.email,
                        newPassword
                      );
                      copyToClipboard(text);
                    }}
                    className="btn-secondary text-xs py-1 px-2.5 flex items-center gap-1.5"
                  >
                    {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                    {copied ? 'Copied!' : 'Copy Info'}
                  </button>
                </div>
                <pre className="text-[11px] font-mono text-slate-300 bg-surface-950/80 p-3 rounded-lg border border-surface-800 whitespace-pre-wrap select-all leading-relaxed">
                  {getShareText(credentialsAgency.name, credentialsAgency.email, newPassword)}
                </pre>
                {credentialsAgency.phone && (
                  <div className="pt-1">
                    <a
                      href={`https://wa.me/${credentialsAgency.phone.replace(/[^0-9]/g, '')}?text=${encodeURIComponent(
                        getShareText(credentialsAgency.name, credentialsAgency.email, newPassword)
                      )}`}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1.5 text-xs text-emerald-400 hover:text-emerald-300 transition-colors font-medium"
                    >
                      <ExternalLink className="w-3.5 h-3.5" /> Share directly via WhatsApp ({credentialsAgency.phone})
                    </a>
                  </div>
                )}
              </div>
            </div>

            <div className="flex justify-end pt-4 mt-4 border-t border-surface-700">
              <button
                type="button"
                onClick={() => setCredentialsAgency(null)}
                className="btn-secondary text-sm"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
