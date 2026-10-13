import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Edit2, Clock, X, Sun, Moon, Trash2, Zap } from 'lucide-react';
import api from '../../api/client';
import toast from 'react-hot-toast';
import { useAuthStore } from '../../stores/authStore';

interface Shift {
  id: string;
  name: string;
  start_time: string;
  end_time: string;
  is_overnight: boolean;
  late_threshold_minutes: number;
  allow_overtime: boolean;
  overtime_hours: number;
  is_active: boolean;
  active_assignments: number;
  agency_id?: string;
}

const defaultForm = {
  name: '',
  startTime: '08:00',
  endTime: '20:00',
  isOvernight: false,
  lateThresholdMinutes: 15,
  allowOvertime: false,
  overtimeHours: 2,
  isActive: true,
  agencyId: '',
};

function formatTime(time: string) {
  if (!time) return '';
  const [h, m] = time.slice(0,5).split(':').map(Number);
  const period = h >= 12 ? 'PM' : 'AM';
  return `${h % 12 || 12}:${String(m).padStart(2,'0')} ${period}`;
}

function calculateShiftDuration(start: string, end: string, isOvernight: boolean): number {
  if (!start || !end) return 0;
  const [sh, sm] = start.split(':').map(Number);
  const [eh, em] = end.split(':').map(Number);
  let startMin = sh * 60 + (sm || 0);
  let endMin = eh * 60 + (em || 0);
  if (endMin <= startMin || isOvernight) {
    endMin += 24 * 60;
  }
  const diffHours = (endMin - startMin) / 60;
  return Math.round(diffHours * 10) / 10;
}

export default function ShiftsPage() {
  const queryClient = useQueryClient();
  const [showModal, setShowModal] = useState(false);
  const [editShift, setEditShift] = useState<Shift | null>(null);
  const [form, setForm] = useState(defaultForm);

  const { user } = useAuthStore();
  const [agencyFilter, setAgencyFilter] = useState('');

  const { data: agencies } = useQuery({ queryKey: ['agencies'], queryFn: async () => { const {data} = await api.get('/agencies'); return data.data; }, enabled: user?.role === 'super_admin' });

  const { data, isLoading } = useQuery({
    queryKey: ['shifts', agencyFilter],
    queryFn: async () => { 
      const params: any = {};
      if (user?.role === 'super_admin' && agencyFilter) params.agency_id = agencyFilter;
      const {data} = await api.get('/shifts', { params }); 
      return data.data as Shift[]; 
    },
  });

  const mutation = useMutation({
    mutationFn: (payload: typeof form) => editShift ? api.put(`/shifts/${editShift.id}`, payload) : api.post('/shifts', payload),
    onSuccess: () => { queryClient.invalidateQueries({queryKey:['shifts']}); queryClient.invalidateQueries({queryKey:['shifts-list']}); queryClient.invalidateQueries({queryKey:['shift-all']}); toast.success('Shift saved!'); closeModal(); },
    onError: (err: unknown) => toast.error((err as {response?:{data?:{message?:string}}})?.response?.data?.message || 'Failed'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/shifts/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({queryKey:['shifts']});
      queryClient.invalidateQueries({queryKey:['shifts-list']});
      toast.success('Shift deleted!');
      closeModal();
    },
    onError: (err: unknown) => toast.error((err as {response?:{data?:{message?:string}}})?.response?.data?.message || 'Failed to delete shift'),
  });

  function openEdit(s: Shift & { agency_id?: string }) {
    setForm({
      name: s.name,
      startTime: s.start_time.slice(0,5),
      endTime: s.end_time.slice(0,5),
      isOvernight: s.is_overnight,
      lateThresholdMinutes: s.late_threshold_minutes,
      allowOvertime: Boolean(s.allow_overtime),
      overtimeHours: Number(s.overtime_hours || 0) || 2,
      isActive: s.is_active,
      agencyId: s.agency_id || '',
    });
    setEditShift(s);
    setShowModal(true);
  }

  function closeModal() {
    setShowModal(false);
    setEditShift(null);
    setForm(defaultForm);
  }

  const isFormOvernight = form.isOvernight || (form.endTime !== '00:00' && form.endTime < form.startTime);
  const formStandardHours = calculateShiftDuration(form.startTime, form.endTime, isFormOvernight);
  const formTotalHours = form.allowOvertime ? formStandardHours + (Number(form.overtimeHours) || 0) : formStandardHours;

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="section-header flex flex-wrap gap-3 justify-between items-center">
        <div>
          <h1 className="section-title">Shift Management</h1>
          <p className="text-slate-500 text-sm">Configure work shifts, duty hours, and overtime options for guards</p>
        </div>
        <div className="flex gap-3">
          {user?.role === 'super_admin' && (
            <select value={agencyFilter} onChange={e => setAgencyFilter(e.target.value)} className="input w-48">
              <option value="">All Agencies</option>
              {agencies?.map((a: any) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          )}
          <button onClick={() => { setForm({...defaultForm, agencyId: agencyFilter}); setEditShift(null); setShowModal(true); }} className="btn-primary px-4 py-2.5 text-sm">
            <Plus className="w-4 h-4" /> Add Shift
          </button>
        </div>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1,2,3].map(i => <div key={i} className="card p-5 animate-pulse h-32" />)}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {data?.map(s => {
            const shiftDuration = calculateShiftDuration(s.start_time, s.end_time, s.is_overnight);
            const hasOvertime = Boolean(s.allow_overtime && s.overtime_hours > 0);
            return (
              <div key={s.id} className="card p-5 space-y-3.5 hover:border-brand-500/30 transition-all shadow-sm">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${s.is_overnight ? 'bg-slate-700' : 'bg-warning-500/20'}`}>
                      {s.is_overnight ? <Moon className="w-5 h-5 text-slate-300" /> : <Sun className="w-5 h-5 text-warning-400" />}
                    </div>
                    <div>
                      <p className="font-bold text-slate-100">{s.name}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        {s.is_overnight ? (
                          <span className="text-xs text-indigo-400 flex items-center gap-1 font-medium">Overnight</span>
                        ) : (
                          <span className="text-xs text-amber-400/90 flex items-center gap-1 font-medium">Day Shift</span>
                        )}
                        <span className="text-xs text-slate-600">•</span>
                        <span className="text-xs text-slate-400">{shiftDuration} hrs</span>
                      </div>
                    </div>
                  </div>
                  <button onClick={() => openEdit(s)} className="p-2 rounded-lg hover:bg-surface-700 text-slate-400 hover:text-slate-200 transition-colors">
                    <Edit2 className="w-4 h-4" />
                  </button>
                </div>

                <div className="flex items-center gap-2 text-lg font-black text-slate-100">
                  <Clock className="w-5 h-5 text-brand-400" />
                  {formatTime(s.start_time)} — {formatTime(s.end_time)}
                </div>

                {/* Overtime Badge / Status */}
                <div className="flex items-center justify-between py-2 border-t border-surface-700/60 text-xs">
                  {hasOvertime ? (
                    <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md font-semibold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                      <Zap className="w-3.5 h-3.5" />
                      +{s.overtime_hours}h Overtime Allowed
                    </div>
                  ) : (
                    <div className="text-slate-500 flex items-center gap-1">
                      <Clock className="w-3.5 h-3.5 text-slate-600" />
                      No Overtime Option
                    </div>
                  )}

                  {hasOvertime && (
                    <span className="text-slate-400 font-medium">
                      Max: <strong className="text-slate-200">{shiftDuration + s.overtime_hours}h</strong>
                    </span>
                  )}
                </div>

                <div className="flex items-center justify-between text-xs text-slate-500 pt-2 border-t border-surface-700">
                  <span>Late after {s.late_threshold_minutes}min</span>
                  <span className={`badge ${s.is_active ? 'badge-present' : 'badge-absent'}`}>{s.is_active ? 'Active' : 'Inactive'}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {showModal && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4 animate-fade-in overflow-y-auto">
          <div className="card w-full max-w-md my-8">
            <div className="flex items-center justify-between p-5 border-b border-surface-700">
              <h2 className="font-bold text-slate-100">{editShift ? 'Edit Shift' : 'Add Shift'}</h2>
              <button onClick={closeModal} className="p-1.5 rounded-lg hover:bg-surface-700 text-slate-400"><X className="w-5 h-5" /></button>
            </div>
            <div className="p-5 space-y-4 max-h-[75vh] overflow-y-auto">
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
                <input className="input" type="number" min={0} max={120} value={form.lateThresholdMinutes} onChange={e => setForm(f=>({...f,lateThresholdMinutes:parseInt(e.target.value) || 0}))} />
              </div>

              {/* Overtime Configuration Section */}
              <div className="p-4 rounded-xl border border-surface-700 bg-surface-700/30 space-y-3">
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-3">
                    <input
                      type="checkbox"
                      id="allowOvertime"
                      className="w-4 h-4 mt-0.5 rounded text-brand-500 cursor-pointer"
                      checked={form.allowOvertime}
                      onChange={e => {
                        const checked = e.target.checked;
                        setForm(f => ({
                          ...f,
                          allowOvertime: checked,
                          overtimeHours: checked && (!f.overtimeHours || f.overtimeHours <= 0) ? 2 : f.overtimeHours,
                        }));
                      }}
                    />
                    <div>
                      <label htmlFor="allowOvertime" className="text-sm font-semibold text-slate-200 cursor-pointer flex items-center gap-1.5">
                        <Zap className="w-4 h-4 text-warning-400" />
                        Allow Overtime Option
                      </label>
                      <p className="text-xs text-slate-400 mt-0.5">Permit guards to perform extra overtime hours on this shift</p>
                    </div>
                  </div>
                  {form.allowOvertime && (
                    <span className="text-[11px] font-bold px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                      Enabled
                    </span>
                  )}
                </div>

                {form.allowOvertime && (
                  <div className="pt-3 border-t border-surface-700/80 space-y-3">
                    <div className="form-group">
                      <div className="flex justify-between items-center mb-1.5">
                        <label className="label text-xs font-semibold text-slate-300">Set Overtime Hours *</label>
                        <span className="text-xs text-brand-400 font-bold">{form.overtimeHours} hrs maximum</span>
                      </div>
                      <div className="flex items-center gap-2.5">
                        <input
                          className="input text-center font-extrabold text-slate-100 w-24"
                          type="number"
                          min={0.5}
                          max={24}
                          step={0.5}
                          value={form.overtimeHours}
                          onChange={e => {
                            const val = parseFloat(e.target.value);
                            setForm(f => ({ ...f, overtimeHours: isNaN(val) ? 0 : val }));
                          }}
                          placeholder="2"
                        />
                        <span className="text-xs font-semibold text-slate-400">Hours</span>

                        {/* Quick Presets */}
                        <div className="flex gap-1.5 ml-auto">
                          {[1, 2, 3, 4, 6].map(preset => (
                            <button
                              key={preset}
                              type="button"
                              onClick={() => setForm(f => ({ ...f, overtimeHours: preset }))}
                              className={`px-2.5 py-1 text-xs rounded-lg font-semibold transition-all ${
                                form.overtimeHours === preset
                                  ? 'bg-brand-500 text-white shadow-sm'
                                  : 'bg-surface-600 hover:bg-surface-500 text-slate-300'
                              }`}
                            >
                              +{preset}h
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>

                    {/* Live duration calculation summary */}
                    <div className="p-2.5 rounded-lg bg-surface-800/90 border border-surface-700 flex items-center justify-between text-xs">
                      <span className="text-slate-400">
                        Regular: <strong className="text-slate-200">{formStandardHours}h</strong>
                      </span>
                      <span className="text-emerald-400 font-medium">
                        OT: <strong>+{form.overtimeHours}h</strong>
                      </span>
                      <span className="text-slate-300 font-bold border-l border-surface-600 pl-2">
                        Total Max: <span className="text-brand-400">{formTotalHours}h</span>
                      </span>
                    </div>
                  </div>
                )}
              </div>

              {user?.role === 'super_admin' && (
                <div className="form-group">
                  <label className="label">Agency</label>
                  <select className="input" value={form.agencyId} onChange={e => setForm(f=>({...f,agencyId:e.target.value}))}>
                    <option value="">Select Agency (Optional)</option>
                    {agencies?.map((a: any) => <option key={a.id} value={a.id}>{a.name}</option>)}
                  </select>
                </div>
              )}
            </div>
            <div className="flex gap-3 p-5 border-t border-surface-700">
              <button onClick={closeModal} className="btn-ghost px-5 py-2.5">Cancel</button>
              {editShift && (
                <button
                  onClick={() => { if (confirm(`Delete shift "${editShift.name}"? This cannot be undone.`)) deleteMutation.mutate(editShift.id); }}
                  disabled={deleteMutation.isPending}
                  className="btn-ghost px-5 py-2.5 text-danger-400 hover:text-danger-300 hover:bg-danger-500/10 flex items-center gap-2"
                >
                  <Trash2 className="w-4 h-4" /> Delete
                </button>
              )}
              <button onClick={() => mutation.mutate(form)} disabled={mutation.isPending || !form.name || (user?.role === 'super_admin' && !form.agencyId)} className="btn-primary px-5 py-2.5 ml-auto">
                {mutation.isPending ? 'Saving...' : 'Save Shift'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
