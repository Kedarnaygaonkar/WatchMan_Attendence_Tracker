import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Building2, Plus, Edit2, ShieldAlert } from 'lucide-react';
import api from '../../api/client';
import toast from 'react-hot-toast';
import { useAuthStore } from '../../stores/authStore';

interface Agency {
  _id: string;
  name: string;
  email: string;
  phone?: string;
  address?: string;
  logo_url?: string;
  status: 'active' | 'inactive' | 'suspended';
  createdAt: string;
}

export default function AgenciesPage() {
  const { user } = useAuthStore();
  const isSuperAdmin = user?.role === 'super_admin';
  
  const queryClient = useQueryClient();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingAgency, setEditingAgency] = useState<Agency | null>(null);

  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    address: '',
    logo_url: '',
    status: 'active',
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
      setFormData(f => ({ ...f, logo_url: reader.result as string }));
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
        return api.put(`/agencies/${editingAgency._id}`, payload);
      }
      return api.post('/agencies', payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['agencies'] });
      toast.success(editingAgency ? 'Agency updated!' : 'Agency created!');
      closeModal();
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.message || 'Failed to save agency');
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
        phone: agency.phone || '',
        address: agency.address || '',
        logo_url: agency.logo_url || '',
        status: agency.status,
      });
    } else {
      setEditingAgency(null);
      setFormData({
        name: '',
        email: '',
        phone: '',
        address: '',
        logo_url: '',
        status: 'active',
      });
    }
    setIsModalOpen(true);
  }

  function closeModal() {
    setIsModalOpen(false);
    setEditingAgency(null);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
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
          <p className="section-subtitle">Manage security agencies across the platform</p>
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
              <th>Contact Info</th>
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
                <tr key={agency._id}>
                  <td>
                    <div className="flex items-center gap-3">
                      {agency.logo_url ? (
                        <img src={agency.logo_url} alt={`${agency.name} logo`} className="w-10 h-10 rounded-lg object-contain bg-surface-700/50 p-1" />
                      ) : (
                        <div className="w-10 h-10 rounded-lg bg-brand-500/10 flex items-center justify-center shrink-0 border border-brand-500/20">
                          <Building2 className="w-5 h-5 text-brand-400" />
                        </div>
                      )}
                      <div className="font-semibold text-slate-100">{agency.name}</div>
                    </div>
                  </td>
                  <td>
                    <div className="text-sm text-slate-200">{agency.email}</div>
                    {agency.phone && <div className="text-xs text-slate-500">{agency.phone}</div>}
                  </td>
                  <td className="text-sm text-slate-400 max-w-[200px] truncate">
                    {agency.address || '—'}
                  </td>
                  <td>
                    <span className={`badge ${
                      agency.status === 'active' ? 'badge-success' : 
                      agency.status === 'suspended' ? 'badge-danger' : 
                      'badge-warning'
                    }`}>
                      {agency.status}
                    </span>
                  </td>
                  <td className="text-sm text-slate-400">
                    {new Date(agency.createdAt).toLocaleDateString()}
                  </td>
                  <td className="text-right">
                    <button
                      onClick={() => openModal(agency)}
                      className="p-2 text-slate-400 hover:text-brand-400 hover:bg-brand-500/10 rounded-lg transition-colors"
                      title="Edit Agency"
                    >
                      <Edit2 className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Modal */}
      {isModalOpen && (
        <div className="modal-overlay" onClick={closeModal}>
          <div className="modal-content max-w-md" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-xl font-bold text-slate-100 mb-6">
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

              <div className="form-group">
                <label className="label">Email Address *</label>
                <input
                  type="email"
                  required
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  className="input"
                  placeholder="e.g. admin@punesecure.com"
                />
              </div>

              <div className="form-group">
                <label className="label">Phone Number</label>
                <input
                  type="tel"
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  className="input"
                  placeholder="Optional"
                />
              </div>

              <div className="form-group">
                <label className="label">Address</label>
                <textarea
                  value={formData.address}
                  onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                  className="input min-h-[80px]"
                  placeholder="Optional"
                />
              </div>

              <div className="form-group">
                <label className="label">Agency Logo</label>
                <div className="flex items-center gap-4">
                  {formData.logo_url ? (
                    <div className="relative group">
                      <img src={formData.logo_url} alt="Logo preview" className="w-16 h-16 rounded-xl object-contain bg-surface-700/50 border border-surface-600 p-1" />
                      <button type="button" onClick={() => setFormData({ ...formData, logo_url: '' })} className="absolute -top-2 -right-2 bg-danger-500 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
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

              {editingAgency && (
                <div className="form-group">
                  <label className="label">Status</label>
                  <select
                    value={formData.status}
                    onChange={(e) => setFormData({ ...formData, status: e.target.value })}
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
    </div>
  );
}
