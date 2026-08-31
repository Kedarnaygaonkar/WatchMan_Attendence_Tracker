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
    status: 'active',
  });

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
        status: agency.status,
      });
    } else {
      setEditingAgency(null);
      setFormData({
        name: '',
        email: '',
        phone: '',
        address: '',
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
                    <div className="font-semibold text-slate-100">{agency.name}</div>
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
