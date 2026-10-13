import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Edit2, Clock, X, Sun, Moon, Trash2, Zap } from 'lucide-react';
import api from '../../api/client';
import toast from 'react-hot-toast';
import { useAuthStore } from '../../stores/authStore';

interface Shift {
  id: string;
  name: string;
  shift_type?: 'day' | 'night' | 'overtime';
  start_time: string;
  end_time: string;
  duration_hours?: number;
  is_overnight: boolean;
  late_threshold_minutes: number;
  allow_overtime?: boolean;
  overtime_hours?: number;
  is_active: boolean;
  active_assignments: number;
  agency_id?: string;
}

interface ShiftForm {
  name: string;
  shiftType: 'day' | 'night' | 'overtime';
  startTime: string;
  endTime: string;
  durationHours: number;
  isOvernight: boolean;
  lateThresholdMinutes: number;
  isActive: boolean;
  agencyId: string;
}

const defaultForm: ShiftForm = {
  name: '',
  shiftType: 'day',
  startTime: '08:00',
  endTime: '20:00',
  durationHours: 3,
  isOvernight: false,
  lateThresholdMinutes: 15,
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
  const [activeTab, setActiveTab] = useState<'all' | 'day' | 'night' | 'overtime'>('all');
  const [showModal, setShowModal] = useState(false);
  const [editShift, setEditShift] = useState<Shift | null>(null);
  const [form, setForm] = useState<ShiftForm>(defaultForm);

  const { user } = useAuthStore();
  const [agencyFilter, setAgencyFilter] = useState('');

  const { data: agencies } = useQuery({
    queryKey: ['agencies'],
    queryFn: async () => {
      const { data } = await api.get('/agencies');
      return data.data;
    },
    enabled: user?.role === 'super_admin',
  });

  const { data, isLoading } = useQuery({
    queryKey: ['shifts', agencyFilter],
    queryFn: async () => { 
      const params: any = {};
      if (user?.role === 'super_admin' && agencyFilter) params.agency_id = agencyFilter;
      const { data } = await api.get('/shifts', { params }); 
      return data.data as Shift[]; 
    },
  });

  const getShiftCategory = (s: Shift): 'day' | 'night' | 'overtime' => {
    if (s.shift_type === 'overtime' || s.name.toLowerCase().includes('overtime') || (!s.start_time && !s.end_time)) {
      return 'overtime';
    }
    if (s.shift_type === 'night' || s.is_overnight || s.name.toLowerCase().includes('night')) {
      return 'night';
    }
    return 'day';
  };

  const dayShifts = data?.filter(s => getShiftCategory(s) === 'day') || [];
  const nightShifts = data?.filter(s => getShiftCategory(s) === 'night') || [];
  const overtimeShifts = data?.filter(s => getShiftCategory(s) === 'overtime') || [];

  const filteredShifts = activeTab === 'all'
    ? data
    : activeTab === 'day'
    ? dayShifts
    : activeTab === 'night'
    ? nightShifts
    : overtimeShifts;

  const mutation = useMutation({
    mutationFn: (payload: ShiftForm) => {
      const isOvertime = payload.shiftType === 'overtime';
      const body: any = {
        name: payload.name,
        shiftType: payload.shiftType,
        startTime: isOvertime ? '' : payload.startTime,
        endTime: isOvertime ? '' : payload.endTime,
        durationHours: isOvertime ? payload.durationHours : undefined,
        isOvernight: isOvertime ? false : payload.isOvernight,
        lateThresholdMinutes: isOvertime ? 0 : payload.lateThresholdMinutes,
        allowOvertime: isOvertime,
        overtimeHours: isOvertime ? payload.durationHours : 0,
        isActive: payload.isActive,
        agencyId: payload.agencyId || undefined,
      };
      return editShift ? api.put(`/shifts/${editShift.id}`, body) : api.post('/shifts', body);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['shifts'] });
      queryClient.invalidateQueries({ queryKey: ['shifts-list'] });
      queryClient.invalidateQueries({ queryKey: ['shift-all'] });
      toast.success('Shift saved!');
      closeModal();
    },
    onError: (err: unknown) =>
      toast.error((err as { response?: { data?: { message?: string } } })?.response?.data?.message || 'Failed to save shift'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/shifts/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['shifts'] });
      queryClient.invalidateQueries({ queryKey: ['shifts-list'] });
      toast.success('Shift deleted!');
      closeModal();
    },
    onError: (err: unknown) =>
      toast.error((err as { response?: { data?: { message?: string } } })?.response?.data?.message || 'Failed to delete shift'),
  });

  function openEdit(s: Shift & { agency_id?: string }) {
    const cat = getShiftCategory(s);
    const dur = s.duration_hours || s.overtime_hours || 3;
    setForm({
      name: s.name,
      shiftType: cat,
      startTime: s.start_time?.slice(0, 5) || (cat === 'overtime' ? '' : '08:00'),
      endTime: s.end_time?.slice(0, 5) || (cat === 'overtime' ? '' : '20:00'),
      durationHours: dur,
      isOvernight: s.is_overnight || cat === 'night',
      lateThresholdMinutes: s.late_threshold_minutes || 15,
      isActive: s.is_active,
      agencyId: s.agency_id || '',
    });
    setEditShift(s);
    setShowModal(true);
  }

  function openAddModal() {
    const tabType = activeTab === 'all' ? 'day' : activeTab;
    setForm({
      name: tabType === 'overtime' ? 'Overtime (3hr)' : tabType === 'night' ? 'Night Shift' : 'Day Shift',
      shiftType: tabType,
      startTime: tabType === 'overtime' ? '' : tabType === 'night' ? '20:00' : '08:00',
      endTime: tabType === 'overtime' ? '' : tabType === 'night' ? '08:00' : '20:00',
      durationHours: 3,
      isOvernight: tabType === 'night',
      lateThresholdMinutes: tabType === 'overtime' ? 0 : 15,
      isActive: true,
      agencyId: agencyFilter || '',
    });
    setEditShift(null);
    setShowModal(true);
  }

  function closeModal() {
    setShowModal(false);
    setEditShift(null);
    setForm(defaultForm);
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="section-header flex flex-wrap gap-3 justify-between items-center">
        <div>
          <h1 className="section-title">Shift Management</h1>
          <p className="text-slate-500 text-sm">Configure standard work shifts and fixed overtime options for guards</p>
        </div>
        <div className="flex gap-3">
          {user?.role === 'super_admin' && (
            <select value={agencyFilter} onChange={e => setAgencyFilter(e.target.value)} className="input w-48">
              <option value="">All Agencies</option>
              {agencies?.map((a: any) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          )}
          <button onClick={openAddModal} className="btn-primary px-4 py-2.5 text-sm flex items-center gap-2">
            <Plus className="w-4 h-4" />
            {activeTab === 'overtime' ? 'Add Overtime (e.g. 3hr)' : 'Add Shift'}
          </button>
        </div>
      </div>

      {/* 3 Categories / Tabs: Day, Night, Overtime */}
      <div className="flex border-b border-surface-700 gap-1 pb-1 overflow-x-auto">
        <button
          onClick={() => setActiveTab('all')}
          className={`px-4 py-2 text-sm font-semibold rounded-lg flex items-center gap-2 transition-all ${
            activeTab === 'all'
              ? 'bg-brand-500/20 text-brand-300 border border-brand-500/30'
              : 'text-slate-400 hover:text-slate-200 hover:bg-surface-800'
          }`}
        >
          <span>All Shifts</span>
          <span className="text-xs px-2 py-0.5 rounded-full bg-surface-700 text-slate-300">
            {data?.length || 0}
          </span>
        </button>

        <button
          onClick={() => setActiveTab('day')}
          className={`px-4 py-2 text-sm font-semibold rounded-lg flex items-center gap-2 transition-all ${
            activeTab === 'day'
              ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
              : 'text-slate-400 hover:text-slate-200 hover:bg-surface-800'
          }`}
        >
          <Sun className="w-4 h-4 text-amber-400" />
          <span>Day (Start–End)</span>
          <span className="text-xs px-2 py-0.5 rounded-full bg-surface-700 text-slate-300">
            {dayShifts.length}
          </span>
        </button>

        <button
          onClick={() => setActiveTab('night')}
          className={`px-4 py-2 text-sm font-semibold rounded-lg flex items-center gap-2 transition-all ${
            activeTab === 'night'
              ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30'
              : 'text-slate-400 hover:text-slate-200 hover:bg-surface-800'
          }`}
        >
          <Moon className="w-4 h-4 text-indigo-400" />
          <span>Night (Start–End)</span>
          <span className="text-xs px-2 py-0.5 rounded-full bg-surface-700 text-slate-300">
            {nightShifts.length}
          </span>
        </button>

        <button
          onClick={() => setActiveTab('overtime')}
          className={`px-4 py-2 text-sm font-semibold rounded-lg flex items-center gap-2 transition-all ${
            activeTab === 'overtime'
              ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
              : 'text-slate-400 hover:text-slate-200 hover:bg-surface-800'
          }`}
        >
          <Zap className="w-4 h-4 text-emerald-400" />
          <span>Overtime (Hours only)</span>
          <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 font-bold">
            {overtimeShifts.length}
          </span>
        </button>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1,2,3].map(i => <div key={i} className="card p-5 animate-pulse h-32" />)}
        </div>
      ) : filteredShifts?.length === 0 ? (
        <div className="card p-10 text-center space-y-3">
          <div className="w-12 h-12 mx-auto rounded-2xl bg-surface-700/50 flex items-center justify-center text-slate-400">
            {activeTab === 'overtime' ? <Zap className="w-6 h-6 text-emerald-400" /> : <Clock className="w-6 h-6" />}
          </div>
          <p className="font-semibold text-slate-200">
            {activeTab === 'overtime' ? 'No Overtime shifts found' : 'No shifts found in this category'}
          </p>
          <p className="text-xs text-slate-500 max-w-sm mx-auto">
            {activeTab === 'overtime'
              ? 'Add an overtime shift (e.g. Overtime 3hr) so guards can log fixed overtime duty hours.'
              : 'Create a new shift to assign guards and manage attendance schedules.'}
          </p>
          <button onClick={openAddModal} className="btn-primary px-4 py-2 text-sm inline-flex items-center gap-2">
            <Plus className="w-4 h-4" />
            {activeTab === 'overtime' ? 'Create Overtime (3hr)' : 'Create Shift'}
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredShifts?.map(s => {
            const category = getShiftCategory(s);
            const isOvertime = category === 'overtime';
            const duration = isOvertime
              ? (s.duration_hours || s.overtime_hours || 3)
              : calculateShiftDuration(s.start_time, s.end_time, s.is_overnight);

            return (
              <div key={s.id} className="card p-5 space-y-3.5 hover:border-brand-500/30 transition-all shadow-sm">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                      isOvertime
                        ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                        : s.is_overnight
                        ? 'bg-indigo-500/20 text-indigo-300'
                        : 'bg-warning-500/20 text-warning-400'
                    }`}>
                      {isOvertime ? (
                        <Zap className="w-5 h-5 text-emerald-400" />
                      ) : s.is_overnight ? (
                        <Moon className="w-5 h-5 text-indigo-300" />
                      ) : (
                        <Sun className="w-5 h-5 text-warning-400" />
                      )}
                    </div>
                    <div>
                      <p className="font-bold text-slate-100">{s.name}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        {isOvertime ? (
                          <span className="text-xs text-emerald-400 flex items-center gap-1 font-semibold">
                            <Zap className="w-3 h-3" /> Overtime Option
                          </span>
                        ) : s.is_overnight ? (
                          <span className="text-xs text-indigo-400 flex items-center gap-1 font-medium">Night Shift</span>
                        ) : (
                          <span className="text-xs text-amber-400/90 flex items-center gap-1 font-medium">Day Shift</span>
                        )}
                        {!isOvertime && (
                          <>
                            <span className="text-xs text-slate-600">•</span>
                            <span className="text-xs text-slate-400">{duration} hrs</span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                  <button onClick={() => openEdit(s)} className="p-2 rounded-lg hover:bg-surface-700 text-slate-400 hover:text-slate-200 transition-colors">
                    <Edit2 className="w-4 h-4" />
                  </button>
                </div>

                {/* Overtime vs Regular Time Display */}
                {isOvertime ? (
                  <div className="p-3 rounded-xl bg-emerald-950/20 border border-emerald-500/20 space-y-1">
                    <div className="flex items-center gap-2 text-xl font-black text-emerald-400">
                      <Clock className="w-5 h-5 text-emerald-400" />
                      <span>{duration} Hours Duty</span>
                    </div>
                    <p className="text-xs text-slate-400">
                      Fixed {duration}-hour overtime block • No start or end time
                    </p>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 text-lg font-black text-slate-100">
                    <Clock className="w-5 h-5 text-brand-400" />
                    {formatTime(s.start_time)} — {formatTime(s.end_time)}
                  </div>
                )}

                <div className="flex items-center justify-between text-xs text-slate-500 pt-2 border-t border-surface-700">
                  <span>{isOvertime ? 'No fixed punch window' : `Late after ${s.late_threshold_minutes}min`}</span>
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
              <h2 className="font-bold text-slate-100">
                {editShift
                  ? `Edit ${form.shiftType === 'overtime' ? 'Overtime Option' : 'Shift'}`
                  : `Add ${form.shiftType === 'overtime' ? 'Overtime Option' : 'Shift'}`}
              </h2>
              <button onClick={closeModal} className="p-1.5 rounded-lg hover:bg-surface-700 text-slate-400"><X className="w-5 h-5" /></button>
            </div>
            <div className="p-5 space-y-4 max-h-[75vh] overflow-y-auto">
              
              {/* Shift Type 3-Tab Selector */}
              <div>
                <label className="label text-xs font-semibold text-slate-300 mb-2 block">Shift Type *</label>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setForm(f => ({
                        ...f,
                        shiftType: 'day',
                        name: f.shiftType === 'overtime' || !f.name ? 'Day Shift' : f.name,
                        isOvernight: false,
                        startTime: f.startTime || '08:00',
                        endTime: f.endTime || '20:00',
                      }));
                    }}
                    className={`p-2.5 rounded-xl border text-center transition-all flex flex-col items-center gap-1 ${
                      form.shiftType === 'day'
                        ? 'border-amber-500 bg-amber-500/15 text-amber-200 font-bold'
                        : 'border-surface-700 bg-surface-800/40 text-slate-400 hover:border-surface-600'
                    }`}
                  >
                    <Sun className="w-4 h-4 text-amber-400" />
                    <span className="text-xs">Day Shift</span>
                    <span className="text-[10px] text-slate-400">Start – End</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setForm(f => ({
                        ...f,
                        shiftType: 'night',
                        name: f.shiftType === 'overtime' || !f.name ? 'Night Shift' : f.name,
                        isOvernight: true,
                        startTime: f.startTime || '20:00',
                        endTime: f.endTime || '08:00',
                      }));
                    }}
                    className={`p-2.5 rounded-xl border text-center transition-all flex flex-col items-center gap-1 ${
                      form.shiftType === 'night'
                        ? 'border-indigo-500 bg-indigo-500/15 text-indigo-200 font-bold'
                        : 'border-surface-700 bg-surface-800/40 text-slate-400 hover:border-surface-600'
                    }`}
                  >
                    <Moon className="w-4 h-4 text-indigo-400" />
                    <span className="text-xs">Night Shift</span>
                    <span className="text-[10px] text-slate-400">Start – End</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      const hours = form.durationHours || 3;
                      setForm(f => ({
                        ...f,
                        shiftType: 'overtime',
                        durationHours: hours,
                        name: `Overtime (${hours}hr)`,
                        startTime: '',
                        endTime: '',
                        isOvernight: false,
                      }));
                    }}
                    className={`p-2.5 rounded-xl border text-center transition-all flex flex-col items-center gap-1 ${
                      form.shiftType === 'overtime'
                        ? 'border-emerald-500 bg-emerald-500/15 text-emerald-200 font-bold'
                        : 'border-surface-700 bg-surface-800/40 text-slate-400 hover:border-surface-600'
                    }`}
                  >
                    <Zap className="w-4 h-4 text-emerald-400" />
                    <span className="text-xs">Overtime</span>
                    <span className="text-[10px] text-emerald-400 font-medium">Hours only</span>
                  </button>
                </div>
              </div>

              {/* OVERTIME FORM: ONLY HOURS (NO START/END TIME) */}
              {form.shiftType === 'overtime' ? (
                <div className="space-y-4 pt-1">
                  <div className="p-4 rounded-xl border border-emerald-500/30 bg-emerald-950/20 space-y-3">
                    <div className="flex items-center justify-between">
                      <label className="label text-xs font-bold text-emerald-300">Set Overtime Hours *</label>
                      <span className="text-xs font-extrabold px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400">
                        {form.durationHours} Hours Duty
                      </span>
                    </div>

                    <div className="flex items-center gap-3">
                      <input
                        className="input text-center text-lg font-black text-emerald-400 w-28 bg-surface-900 border-emerald-500/40"
                        type="number"
                        min={1}
                        max={24}
                        step={1}
                        value={form.durationHours}
                        onChange={e => {
                          const val = parseInt(e.target.value) || 0;
                          setForm(f => ({
                            ...f,
                            durationHours: val,
                            name: `Overtime (${val}hr)`,
                          }));
                        }}
                        placeholder="3"
                      />
                      <span className="text-sm font-semibold text-slate-300">Hours</span>

                      {/* Quick preset chips */}
                      <div className="flex flex-wrap gap-1.5 ml-auto">
                        {[1, 2, 3, 4, 6, 8].map(h => (
                          <button
                            key={h}
                            type="button"
                            onClick={() => {
                              setForm(f => ({
                                ...f,
                                durationHours: h,
                                name: `Overtime (${h}hr)`,
                              }));
                            }}
                            className={`px-2 py-1 text-xs rounded-lg font-bold transition-all ${
                              form.durationHours === h
                                ? 'bg-emerald-500 text-slate-950 shadow-sm'
                                : 'bg-surface-700 hover:bg-surface-600 text-slate-300'
                            }`}
                          >
                            {h}hr
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="form-group">
                    <label className="label">Shift Name *</label>
                    <input
                      className="input"
                      value={form.name}
                      onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                      placeholder="e.g. Overtime (3hr)"
                    />
                    <p className="text-xs text-slate-400 mt-1">
                      Auto-generated name based on hours (e.g. Overtime (3hr)). You can rename it if needed.
                    </p>
                  </div>

                  <div className="p-3 rounded-xl bg-surface-700/40 border border-surface-700 text-xs text-slate-300 space-y-1">
                    <div className="font-semibold text-slate-200 flex items-center gap-1.5">
                      <Zap className="w-3.5 h-3.5 text-emerald-400" /> No Start or End Time Required
                    </div>
                    <p className="text-slate-400">
                      Guards assigned to this overtime option will be credited for {form.durationHours} hours of extra duty without fixed shift boundary constraints.
                    </p>
                  </div>
                </div>
              ) : (
                /* REGULAR DAY OR NIGHT SHIFT FORM (START TIME & END TIME) */
                <div className="space-y-4 pt-1">
                  <div className="form-group">
                    <label className="label">Shift Name *</label>
                    <input
                      className="input"
                      value={form.name}
                      onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                      placeholder={form.shiftType === 'night' ? 'Night Shift' : 'Morning Shift / Day General'}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="form-group">
                      <label className="label">Start Time *</label>
                      <input
                        className="input"
                        type="time"
                        value={form.startTime}
                        onChange={e => setForm(f => ({ ...f, startTime: e.target.value }))}
                      />
                    </div>
                    <div className="form-group">
                      <label className="label">End Time *</label>
                      <input
                        className="input"
                        type="time"
                        value={form.endTime}
                        onChange={e => setForm(f => ({ ...f, endTime: e.target.value }))}
                      />
                    </div>
                  </div>
                  <div className="flex items-center gap-3 p-3 rounded-xl bg-surface-700/50">
                    <input
                      type="checkbox"
                      id="overnight"
                      className="w-4 h-4 rounded text-brand-500"
                      checked={form.isOvernight}
                      onChange={e => setForm(f => ({ ...f, isOvernight: e.target.checked }))}
                    />
                    <label htmlFor="overnight" className="text-sm text-slate-300 cursor-pointer">
                      Overnight shift (crosses midnight, e.g. 20:00–08:00)
                    </label>
                  </div>
                  <div className="form-group">
                    <label className="label">Late Threshold (minutes after shift start)</label>
                    <input
                      className="input"
                      type="number"
                      min={0}
                      max={120}
                      value={form.lateThresholdMinutes}
                      onChange={e => setForm(f => ({ ...f, lateThresholdMinutes: parseInt(e.target.value) || 0 }))}
                    />
                  </div>
                </div>
              )}

              {user?.role === 'super_admin' && (
                <div className="form-group">
                  <label className="label">Agency</label>
                  <select className="input" value={form.agencyId} onChange={e => setForm(f => ({ ...f, agencyId: e.target.value }))}>
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
              <button
                onClick={() => mutation.mutate(form)}
                disabled={mutation.isPending || !form.name || (user?.role === 'super_admin' && !form.agencyId)}
                className="btn-primary px-5 py-2.5 ml-auto"
              >
                {mutation.isPending ? 'Saving...' : 'Save Shift'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
