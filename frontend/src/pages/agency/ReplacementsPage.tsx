import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useQuery as useQueryBase } from '@tanstack/react-query';
import { Plus, ArrowLeftRight, X, CheckCircle2, Clock, AlertCircle } from 'lucide-react';
import api from '../../api/client';
import toast from 'react-hot-toast';

interface Replacement {
  id: string;
  original_watchman_name: string;
  replacement_watchman_name: string | null;
  society_name: string;
  shift_name: string;
  replacement_date: string;
  reason: string;
  status: string;
}

interface Watchman { id: string; full_name: string; employee_id: string; }
interface Society { id: string; name: string; }
interface Shift { id: string; name: string; start_time: string; end_time: string; }

const defaultForm = { originalWatchmanId: '', societyId: '', shiftId: '',
  replacementDate: new Date().toISOString().split('T')[0], reason: '', replacementWatchmanId: '' };

function formatTime(t: string) {
  const [h, m] = t.slice(0,5).split(':').map(Number);
  return `${h%12||12}:${String(m).padStart(2,'0')} ${h>=12?'PM':'AM'}`;
}

export default function ReplacementsPage() {
  const queryClient = useQueryClient();
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState(defaultForm);

  const {data} = useQuery({ queryKey:['replacements'], queryFn: async () => { const {data} = await api.get('/replacements'); return data.data as Replacement[]; } });
  const {data: watchmen} = useQueryBase({ queryKey:['wm-all'], queryFn: async () => { const {data} = await api.get('/watchmen', {params:{status:'active'}}); return data.data as Watchman[]; } });
  const {data: societies} = useQueryBase({ queryKey:['soc-all'], queryFn: async () => { const {data} = await api.get('/societies', {params:{active:true}}); return data.data as Society[]; } });
  const {data: shifts} = useQueryBase({ queryKey:['shift-all'], queryFn: async () => { const {data} = await api.get('/shifts'); return data.data as Shift[]; } });

  const mutation = useMutation({
    mutationFn: (payload: typeof form) => api.post('/replacements', {
      ...payload,
      replacementWatchmanId: payload.replacementWatchmanId || undefined,
    }),
    onSuccess: () => { queryClient.invalidateQueries({queryKey:['replacements']}); toast.success('Replacement created!'); setShowModal(false); setForm(defaultForm); },
    onError: (err: unknown) => toast.error((err as {response?:{data?:{message?:string}}})?.response?.data?.message || 'Failed'),
  });

  function statusIcon(s: string) {
    if (s === 'active') return <CheckCircle2 className="w-4 h-4 text-success-400" />;
    if (s === 'pending') return <Clock className="w-4 h-4 text-warning-400" />;
    return <AlertCircle className="w-4 h-4 text-danger-400" />;
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="section-header">
        <div>
          <h1 className="section-title">Replacements</h1>
          <p className="text-slate-500 text-sm">Manage absent guard replacements</p>
        </div>
        <button onClick={() => { setForm(defaultForm); setShowModal(true); }} className="btn-primary px-4 py-2.5 text-sm">
          <Plus className="w-4 h-4" /> Create Replacement
        </button>
      </div>

      <div className="table-wrapper">
        <table className="table">
          <thead>
            <tr>
              <th>Original Guard</th>
              <th>Replacement</th>
              <th>Society</th>
              <th>Date</th>
              <th>Reason</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {data?.map(r => (
              <tr key={r.id}>
                <td className="font-medium">{r.original_watchman_name}</td>
                <td>
                  {r.replacement_watchman_name
                    ? <span className="text-success-400">{r.replacement_watchman_name}</span>
                    : <span className="text-warning-400 text-sm italic">Not assigned</span>
                  }
                </td>
                <td>{r.society_name}</td>
                <td className="text-slate-400">{new Date(r.replacement_date).toLocaleDateString('en-IN')}</td>
                <td className="text-slate-400 text-sm">{r.reason || '—'}</td>
                <td>
                  <span className="flex items-center gap-1.5 text-sm capitalize">
                    {statusIcon(r.status)} {r.status}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!data?.length && (
          <div className="text-center py-12 text-slate-600">
            <ArrowLeftRight className="w-10 h-10 mx-auto mb-2 opacity-40" />
            <p className="text-sm">No replacements recorded</p>
          </div>
        )}
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4 animate-fade-in">
          <div className="card w-full max-w-md">
            <div className="flex items-center justify-between p-5 border-b border-surface-700">
              <h2 className="font-bold text-slate-100">Create Replacement</h2>
              <button onClick={() => setShowModal(false)} className="p-1.5 rounded-lg hover:bg-surface-700 text-slate-400"><X className="w-5 h-5" /></button>
            </div>
            <div className="p-5 space-y-4">
              <div className="form-group">
                <label className="label">Absent Guard *</label>
                <select className="input" value={form.originalWatchmanId} onChange={e=>setForm(f=>({...f,originalWatchmanId:e.target.value}))}>
                  <option value="">Select guard...</option>
                  {watchmen?.map(w => <option key={w.id} value={w.id}>{w.full_name} ({w.employee_id})</option>)}
                </select>
              </div>
              <div className="form-group">
                <label className="label">Replacement Guard (optional)</label>
                <select className="input" value={form.replacementWatchmanId} onChange={e=>setForm(f=>({...f,replacementWatchmanId:e.target.value}))}>
                  <option value="">Select replacement...</option>
                  {watchmen?.filter(w => w.id !== form.originalWatchmanId).map(w =>
                    <option key={w.id} value={w.id}>{w.full_name} ({w.employee_id})</option>
                  )}
                </select>
              </div>
              <div className="form-group">
                <label className="label">Society *</label>
                <select className="input" value={form.societyId} onChange={e=>setForm(f=>({...f,societyId:e.target.value}))}>
                  <option value="">Select society...</option>
                  {societies?.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label className="label">Shift *</label>
                <select className="input" value={form.shiftId} onChange={e=>setForm(f=>({...f,shiftId:e.target.value}))}>
                  <option value="">Select shift...</option>
                  {shifts?.map(s => <option key={s.id} value={s.id}>{s.name} ({formatTime(s.start_time)}–{formatTime(s.end_time)})</option>)}
                </select>
              </div>
              <div className="form-group">
                <label className="label">Replacement Date *</label>
                <input className="input" type="date" value={form.replacementDate} onChange={e=>setForm(f=>({...f,replacementDate:e.target.value}))} />
              </div>
              <div className="form-group">
                <label className="label">Reason</label>
                <input className="input" value={form.reason} onChange={e=>setForm(f=>({...f,reason:e.target.value}))} placeholder="Sick leave, emergency..." />
              </div>
              <p className="text-xs text-slate-500 bg-surface-700/50 rounded-lg p-3">
                💡 If a replacement guard is selected, they will automatically receive this assignment on their app.
              </p>
            </div>
            <div className="flex gap-3 p-5 border-t border-surface-700">
              <button onClick={() => setShowModal(false)} className="btn-ghost px-5 py-2.5">Cancel</button>
              <button onClick={() => mutation.mutate(form)}
                disabled={mutation.isPending || !form.originalWatchmanId || !form.societyId || !form.shiftId}
                className="btn-primary px-5 py-2.5 ml-auto">
                {mutation.isPending ? 'Creating...' : 'Create Replacement'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
