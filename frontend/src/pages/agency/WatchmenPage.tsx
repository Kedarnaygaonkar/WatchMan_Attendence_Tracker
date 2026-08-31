import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Search, Edit2, Users, X, UserCheck, UserX } from 'lucide-react';
import api from '../../api/client';
import toast from 'react-hot-toast';
import { useAuthStore } from '../../stores/authStore';

interface Watchman {
  id: string;
  employee_id: string;
  full_name: string;
  phone: string;
  emergency_contact: string;
  address: string;
  joining_date: string;
  status: 'active' | 'inactive' | 'suspended';
  profile_photo_url: string | null;
  active_assignments: number;
  email: string;
  agency_id?: string;
}

const defaultForm = {
  employeeId: '', fullName: '', phone: '',
  address: '',
  joiningDate: new Date().toISOString().split('T')[0], status: 'active' as 'active' | 'inactive' | 'suspended',
  agencyId: '',
};

export default function WatchmenPage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editWatchman, setEditWatchman] = useState<Watchman | null>(null);
  const [form, setForm] = useState(defaultForm);
  const { user } = useAuthStore();

  const { data: agencies } = useQuery({
    queryKey: ['agencies'],
    queryFn: async () => {
      const { data } = await api.get('/agencies');
      return data.data;
    },
    enabled: user?.role === 'super_admin',
  });

  const { data, isLoading } = useQuery({
    queryKey: ['watchmen', search, statusFilter],
    queryFn: async () => {
      const { data } = await api.get('/watchmen', {
        params: { search: search || undefined, status: statusFilter || undefined }
      });
      return data.data as Watchman[];
    },
  });

  const mutation = useMutation({
    mutationFn: async (payload: typeof form) => {
      if (editWatchman) return api.put(`/watchmen/${editWatchman.id}`, payload);
      return api.post('/watchmen', payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['watchmen'] });
      queryClient.invalidateQueries({ queryKey: ['watchmen-list'] });
      queryClient.invalidateQueries({ queryKey: ['wm-all'] });
      toast.success(editWatchman ? 'Watchman updated!' : 'Watchman added!');
      closeModal();
    },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message || 'Failed to save';
      toast.error(msg);
    },
  });

  function openAdd() {
    setForm(defaultForm);
    setEditWatchman(null);
    setShowModal(true);
  }

  function openEdit(w: Watchman) {
    setForm({
      employeeId: w.employee_id, fullName: w.full_name, phone: w.phone,
      address: w.address || '', joiningDate: w.joining_date?.split('T')[0] || '',
      status: w.status,
      agencyId: w.agency_id || '',
    });
    setEditWatchman(w);
    setShowModal(true);
  }

  function closeModal() { setShowModal(false); setEditWatchman(null); }

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="section-header">
        <div>
          <h1 className="section-title">Watchmen</h1>
          <p className="text-slate-500 text-sm">{data?.length ?? 0} guards registered</p>
        </div>
        <button onClick={openAdd} className="btn-primary px-4 py-2.5 text-sm">
          <Plus className="w-4 h-4" /> Add Watchman
        </button>
      </div>

      {/* Filters */}
      <div className="flex gap-3 flex-wrap">
        <div className="relative">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" style={{width:'16px',height:'16px'}} />
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search by name, ID, phone..." className="input pl-10 w-64" />
        </div>
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="input w-40">
          <option value="">All Status</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
          <option value="suspended">Suspended</option>
        </select>
      </div>

      {/* Table */}
      <div className="table-wrapper">
        <table className="table">
          <thead>
            <tr>
              <th>Guard</th>
              <th>Employee ID</th>
              <th>Contact</th>
              <th>Joined</th>
              <th>Assignments</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              Array.from({length: 5}).map((_,i) => (
                <tr key={i}><td colSpan={7}><div className="h-10 bg-surface-700 animate-pulse rounded" /></td></tr>
              ))
            ) : data?.map(w => (
              <tr key={w.id}>
                <td>
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-full bg-brand-500/20 border border-brand-500/30 flex items-center justify-center shrink-0">
                      {w.profile_photo_url
                        ? <img src={w.profile_photo_url} alt="" className="w-full h-full rounded-full object-cover" />
                        : <span className="text-sm font-bold text-brand-400">{w.full_name.charAt(0)}</span>
                      }
                    </div>
                    <div>
                      <p className="font-medium">{w.full_name}</p>
                      <p className="text-xs text-slate-500">{w.email}</p>
                    </div>
                  </div>
                </td>
                <td>
                  <span className="font-mono text-xs bg-surface-700 px-2 py-1 rounded">{w.employee_id}</span>
                </td>
                <td className="text-slate-400">{w.phone}</td>
                <td className="text-slate-400 text-sm">
                  {w.joining_date ? new Date(w.joining_date).toLocaleDateString('en-IN') : '—'}
                </td>
                <td>
                  <span className="badge bg-brand-500/10 text-brand-400 border-brand-500/20">
                    {w.active_assignments} active
                  </span>
                </td>
                <td>
                  <span className={`badge ${w.status === 'active' ? 'badge-present' : 'badge-absent'}`}>
                    {w.status === 'active' ? <UserCheck className="w-3 h-3" /> : <UserX className="w-3 h-3" />}
                    {w.status}
                  </span>
                </td>
                <td>
                  <button onClick={() => openEdit(w)} className="p-2 rounded-lg hover:bg-surface-700 text-slate-500 hover:text-slate-300">
                    <Edit2 className="w-4 h-4" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!isLoading && (!data || data.length === 0) && (
          <div className="text-center py-12 text-slate-600">
            <Users className="w-10 h-10 mx-auto mb-2 opacity-40" />
            <p className="text-sm">No watchmen found</p>
          </div>
        )}
      </div>

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4 animate-fade-in">
          <div className="card w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-5 border-b border-surface-700">
              <h2 className="font-bold text-slate-100">{editWatchman ? 'Edit Watchman' : 'Add Watchman'}</h2>
              <button onClick={closeModal} className="p-1.5 rounded-lg hover:bg-surface-700 text-slate-400"><X className="w-5 h-5" /></button>
            </div>
            <div className="p-5 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="form-group">
                  <label className="label">Full Name *</label>
                  <input className="input" value={form.fullName} onChange={e => setForm(f => ({...f, fullName: e.target.value}))} placeholder="Ramesh Patil" />
                </div>
                <div className="form-group">
                  <label className="label">Employee ID *</label>
                  <input className="input" value={form.employeeId} onChange={e => setForm(f => ({...f, employeeId: e.target.value}))} placeholder="PSS-001" disabled={!!editWatchman} />
                </div>
                <div className="form-group">
                  <label className="label">Mobile Number *</label>
                  <input className="input" type="tel" value={form.phone} onChange={e => setForm(f => ({...f, phone: e.target.value}))} placeholder="9XXXXXXXXX" />
                </div>
                {user?.role === 'super_admin' && (
                  <div className="form-group col-span-2">
                    <label className="label">Assign Agency *</label>
                    <select className="input" value={form.agencyId} onChange={e => setForm(f => ({...f, agencyId: e.target.value}))}>
                      <option value="">Select an Agency</option>
                      {agencies?.map((a: any) => (
                        <option key={a.id} value={a.id}>{a.name}</option>
                      ))}
                    </select>
                  </div>
                )}
                <div className="form-group">
                  <label className="label">Joining Date</label>
                  <input className="input" type="date" value={form.joiningDate} onChange={e => setForm(f => ({...f, joiningDate: e.target.value}))} />
                </div>
                <div className="form-group">
                  <label className="label">Status</label>
                  <select className="input" value={form.status} onChange={e => setForm(f => ({...f, status: e.target.value as typeof form.status}))}>
                    <option value="active">Active</option>
                    <option value="inactive">Inactive</option>
                    <option value="suspended">Suspended</option>
                  </select>
                </div>
                <div className="form-group col-span-2">
                  <label className="label">Home Address</label>
                  <input className="input" value={form.address} onChange={e => setForm(f => ({...f, address: e.target.value}))} placeholder="Full address" />
                </div>
              </div>
            </div>
            <div className="flex gap-3 p-5 border-t border-surface-700">
              <button onClick={closeModal} className="btn-ghost px-5 py-2.5">Cancel</button>
              <button
                onClick={() => mutation.mutate(form)}
                disabled={mutation.isPending || !form.fullName || !form.phone || (user?.role === 'super_admin' && !form.agencyId)}
                className="btn-primary px-5 py-2.5 ml-auto"
              >
                {mutation.isPending ? 'Saving...' : editWatchman ? 'Update' : 'Add Watchman'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
