import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Edit2, Clock, X, Sun, Moon } from 'lucide-react';
import api from '../../api/client';
import toast from 'react-hot-toast';

interface Shift {
  id: string;
  name: string;
  start_time: string;
  end_time: string;
  is_overnight: boolean;
  late_threshold_minutes: number;
  is_active: boolean;
  active_assignments: number;
}

const defaultForm = { name: '', startTime: '08:00', endTime: '20:00', isOvernight: false, lateThresholdMinutes: 15, isActive: true };

function formatTime(time: string) {
  const [h, m] = time.slice(0,5).split(':').map(Number);
  const period = h >= 12 ? 'PM' : 'AM';
  return `${h % 12 || 12}:${String(m).padStart(2,'0')} ${period}`;
}

export default function ShiftsPage() {
  const queryClient = useQueryClient();
  const [showModal, setShowModal] = useState(false);
  const [editShift, setEditShift] = useState<Shift | null>(null);
  const [form, setForm] = useState(defaultForm);

  const { data, isLoading } = useQuery({
    queryKey: ['shifts'],
    queryFn: async () => { const {data} = await api.get('/shifts'); return data.data as Shift[]; },
  });

  const mutation = useMutation({
    mutationFn: (payload: typeof form) => editShift ? api.put(`/shifts/${editShift.id}`, payload) : api.post('/shifts', payload),
    onSuccess: () => { queryClient.invalidateQueries({queryKey:['shifts']}); queryClient.invalidateQueries({queryKey:['shifts-list']}); toast.success('Shift saved!'); closeModal(); },
    onError: (err: unknown) => toast.error((err as {response?:{data?:{message?:string}}})?.response?.data?.message || 'Failed'),
  });

  function openEdit(s: Shift) {
    setForm({ name: s.name, startTime: s.start_time.slice(0,5), endTime: s.end_time.slice(0,5),
      isOvernight: s.is_overnight, lateThresholdMinutes: s.late_threshold_minutes, isActive: s.is_active });
    setEditShift(s);
    setShowModal(true);
  }

  function closeModal() { setShowModal(false); setEditShift(null); setForm(defaultForm); }

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="section-header">
        <div>
          <h1 className="section-title">Shift Management</h1>
          <p className="text-slate-500 text-sm">Configure work shifts for your guards</p>
        </div>
        <button onClick={() => { setForm(defaultForm); setEditShift(null); setShowModal(true); }} className="btn-primary px-4 py-2.5 text-sm">
          <Plus className="w-4 h-4" /> Add Shift
        </button>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1,2,3].map(i => <div key={i} className="card p-5 animate-pulse h-32" />)}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {data?.map(s => (
            <div key={s.id} className="card p-5 space-y-3 hover:border-brand-500/30 transition-colors">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${s.is_overnight ? 'bg-slate-700' : 'bg-warning-500/20'}`}>
                    {s.is_overnight ? <Moon className="w-5 h-5 text-slate-300" /> : <Sun className="w-5 h-5 text-warning-400" />}
                  </div>
                  <div>
                    <p className="font-bold text-slate-100">{s.name}</p>
                    {s.is_overnight && <span className="text-xs text-slate-500">Overnight shift</span>}
                  </div>
                </div>
                <button onClick={() => openEdit(s)} className="p-2 rounded-lg hover:bg-surface-700 text-slate-500">
                  <Edit2 className="w-4 h-4" />
                </button>
              </div>
              <div className="flex items-center gap-2 text-lg font-black text-slate-100">
                <Clock className="w-5 h-5 text-brand-400" />
                {formatTime(s.start_time)} — {formatTime(s.end_time)}
              </div>
              <div className="flex items-center justify-between text-xs text-slate-500 pt-2 border-t border-surface-700">
                <span>Late after {s.late_threshold_minutes}min</span>
                <span className={`badge ${s.is_active ? 'badge-present' : 'badge-absent'}`}>{s.is_active ? 'Active' : 'Inactive'}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {showModal && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4 animate-fade-in">
          <div className="card w-full max-w-md">
            <div className="flex items-center justify-between p-5 border-b border-surface-700">
              <h2 className="font-bold text-slate-100">{editShift ? 'Edit Shift' : 'Add Shift'}</h2>
              <button onClick={closeModal} className="p-1.5 rounded-lg hover:bg-surface-700 text-slate-400"><X className="w-5 h-5" /></button>
            </div>
            <div className="p-5 space-y-4">
              <div className="form-group">
                <label className="label">Shift Name *</label>
                <input className="input" value={form.name} onChange={e => setForm(f=>({...f,name:e.target.value}))} placeholder="Day Shift / Night Shift" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="form-group">
                  <label className="label">Start Time *</label>
                  <input className="input" type="time" value={form.startTime} onChange={e => setForm(f=>({...f,startTime:e.target.value}))} />
                </div>
                <div className="form-group">
                  <label className="label">End Time *</label>
                  <input className="input" type="time" value={form.endTime} onChange={e => setForm(f=>({...f,endTime:e.target.value}))} />
                </div>
              </div>
              <div className="flex items-center gap-3 p-3 rounded-xl bg-surface-700/50">
                <input type="checkbox" id="overnight" className="w-4 h-4 rounded text-brand-500" checked={form.isOvernight} onChange={e => setForm(f=>({...f,isOvernight:e.target.checked}))} />
                <label htmlFor="overnight" className="text-sm text-slate-300 cursor-pointer">
                  Overnight shift (crosses midnight, e.g. 20:00–08:00)
                </label>
              </div>
              <div className="form-group">
                <label className="label">Late Threshold (minutes after shift start)</label>
                <input className="input" type="number" min={0} max={120} value={form.lateThresholdMinutes} onChange={e => setForm(f=>({...f,lateThresholdMinutes:parseInt(e.target.value)}))} />
              </div>
            </div>
            <div className="flex gap-3 p-5 border-t border-surface-700">
              <button onClick={closeModal} className="btn-ghost px-5 py-2.5">Cancel</button>
              <button onClick={() => mutation.mutate(form)} disabled={mutation.isPending || !form.name} className="btn-primary px-5 py-2.5 ml-auto">
                {mutation.isPending ? 'Saving...' : 'Save Shift'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
