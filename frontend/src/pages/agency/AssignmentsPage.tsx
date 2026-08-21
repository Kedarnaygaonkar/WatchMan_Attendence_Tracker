import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, X, GitBranch, Calendar, ChevronRight } from 'lucide-react';
import api from '../../api/client';
import toast from 'react-hot-toast';

interface Assignment {
  id: string;
  watchman_name: string;
  employee_id: string;
  society_name: string;
  shift_name: string;
  start_time: string;
  end_time: string;
  is_overnight: boolean;
  start_date: string;
  end_date: string | null;
  is_active: boolean;
}

interface Watchman { id: string; full_name: string; employee_id: string; }
interface Society { id: string; name: string; }
interface Shift { id: string; name: string; start_time: string; end_time: string; is_overnight: boolean; }

const defaultForm = {
  watchmanId: '', societyId: '', shiftId: '',
  startDate: new Date().toISOString().split('T')[0],
  endDate: '', notes: '', isActive: true,
};

function formatTime(t: string) {
  const [h, m] = t.slice(0,5).split(':').map(Number);
  const p = h >= 12 ? 'PM' : 'AM';
  return `${h % 12 || 12}:${String(m).padStart(2,'0')} ${p}`;
}

export default function AssignmentsPage() {
  const queryClient = useQueryClient();
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState(defaultForm);

  const { data } = useQuery({ queryKey: ['assignments'], queryFn: async () => { const {data} = await api.get('/assignments', {params:{active:true}}); return data.data as Assignment[]; } });
  const { data: watchmen } = useQuery({ queryKey: ['watchmen-list'], queryFn: async () => { const {data} = await api.get('/watchmen', {params:{status:'active'}}); return data.data as Watchman[]; } });
  const { data: societies } = useQuery({ queryKey: ['societies-list'], queryFn: async () => { const {data} = await api.get('/societies', {params:{active:true}}); return data.data as Society[]; } });
  const { data: shifts } = useQuery({ queryKey: ['shifts-list'], queryFn: async () => { const {data} = await api.get('/shifts', {params:{active:true}}); return data.data as Shift[]; } });

  const mutation = useMutation({
    mutationFn: (payload: typeof form) => api.post('/assignments', { ...payload, endDate: payload.endDate || undefined }),
    onSuccess: () => { queryClient.invalidateQueries({queryKey:['assignments']}); toast.success('Assignment created!'); setShowModal(false); setForm(defaultForm); },
    onError: (err: unknown) => toast.error((err as {response?:{data?:{message?:string}}})?.response?.data?.message || 'Failed'),
  });

  const deactivateMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/assignments/${id}`),
    onSuccess: () => { queryClient.invalidateQueries({queryKey:['assignments']}); toast.success('Assignment ended'); },
  });

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="section-header">
        <div>
          <h1 className="section-title">Assignments</h1>
          <p className="text-slate-500 text-sm">Who works where and when</p>
        </div>
        <button onClick={() => { setForm(defaultForm); setShowModal(true); }} className="btn-primary px-4 py-2.5 text-sm">
          <Plus className="w-4 h-4" /> Assign Guard
        </button>
      </div>

      <div className="table-wrapper">
        <table className="table">
          <thead>
            <tr>
              <th>Guard</th>
              <th>Society</th>
              <th>Shift</th>
              <th>Duration</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {data?.map(a => (
              <tr key={a.id}>
                <td>
                  <div>
                    <p className="font-medium">{a.watchman_name}</p>
                    <p className="text-xs text-slate-500">{a.employee_id}</p>
                  </div>
                </td>
                <td>{a.society_name}</td>
                <td>
                  <div>
                    <p className="font-medium">{a.shift_name}</p>
                    <p className="text-xs text-slate-500">
                      {formatTime(a.start_time)} — {formatTime(a.end_time)}
                      {a.is_overnight && <span className="ml-1 text-brand-400">overnight</span>}
                    </p>
                  </div>
                </td>
                <td className="text-slate-400 text-sm">
                  <div className="flex items-center gap-1">
                    <Calendar className="w-3.5 h-3.5" />
                    {new Date(a.start_date).toLocaleDateString('en-IN', {day:'numeric',month:'short'})}
                    <ChevronRight className="w-3 h-3 text-slate-600" />
                    {a.end_date ? new Date(a.end_date).toLocaleDateString('en-IN', {day:'numeric',month:'short'}) : 'Open'}
                  </div>
                </td>
                <td>
                  <span className={`badge ${a.is_active ? 'badge-present' : 'badge-absent'}`}>
                    {a.is_active ? 'Active' : 'Ended'}
                  </span>
                </td>
                <td>
                  {a.is_active && (
                    <button onClick={() => { if(confirm('End this assignment?')) deactivateMutation.mutate(a.id); }}
                      className="text-xs text-danger-400 hover:text-danger-300 px-2 py-1 rounded hover:bg-danger-500/10">
                      End
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!data?.length && (
          <div className="text-center py-12 text-slate-600">
            <GitBranch className="w-10 h-10 mx-auto mb-2 opacity-40" />
            <p className="text-sm">No active assignments. Add one to get started.</p>
          </div>
        )}
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4 animate-fade-in">
          <div className="card w-full max-w-md">
            <div className="flex items-center justify-between p-5 border-b border-surface-700">
              <h2 className="font-bold text-slate-100">Assign Guard to Society</h2>
              <button onClick={() => setShowModal(false)} className="p-1.5 rounded-lg hover:bg-surface-700 text-slate-400"><X className="w-5 h-5" /></button>
            </div>
            <div className="p-5 space-y-4">
              <div className="form-group">
                <label className="label">Guard *</label>
                <select className="input" value={form.watchmanId} onChange={e => setForm(f=>({...f,watchmanId:e.target.value}))}>
                  <option value="">Select guard...</option>
                  {watchmen?.map(w => <option key={w.id} value={w.id}>{w.full_name} ({w.employee_id})</option>)}
                </select>
              </div>
              <div className="form-group">
                <label className="label">Society *</label>
                <select className="input" value={form.societyId} onChange={e => setForm(f=>({...f,societyId:e.target.value}))}>
                  <option value="">Select society...</option>
                  {societies?.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label className="label">Shift *</label>
                <select className="input" value={form.shiftId} onChange={e => setForm(f=>({...f,shiftId:e.target.value}))}>
                  <option value="">Select shift...</option>
                  {shifts?.map(s => <option key={s.id} value={s.id}>{s.name} ({formatTime(s.start_time)}–{formatTime(s.end_time)})</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="form-group">
                  <label className="label">Start Date *</label>
                  <input className="input" type="date" value={form.startDate} onChange={e => setForm(f=>({...f,startDate:e.target.value}))} />
                </div>
                <div className="form-group">
                  <label className="label">End Date (optional)</label>
                  <input className="input" type="date" value={form.endDate} onChange={e => setForm(f=>({...f,endDate:e.target.value}))} />
                </div>
              </div>
              <div className="form-group">
                <label className="label">Notes</label>
                <input className="input" value={form.notes} onChange={e => setForm(f=>({...f,notes:e.target.value}))} placeholder="Optional notes..." />
              </div>
            </div>
            <div className="flex gap-3 p-5 border-t border-surface-700">
              <button onClick={() => setShowModal(false)} className="btn-ghost px-5 py-2.5">Cancel</button>
              <button onClick={() => mutation.mutate(form)}
                disabled={mutation.isPending || !form.watchmanId || !form.societyId || !form.shiftId}
                className="btn-primary px-5 py-2.5 ml-auto">
                {mutation.isPending ? 'Creating...' : 'Create Assignment'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
