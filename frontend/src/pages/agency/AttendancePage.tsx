import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ClipboardList, Search, ShieldAlert, CheckCircle2, Clock, X } from 'lucide-react';
import api from '../../api/client';
import toast from 'react-hot-toast';

interface AttendanceRecord {
  id: string;
  watchman_name: string;
  employee_id: string;
  society_name: string;
  shift_name: string;
  check_in_time: string;
  check_out_time: string | null;
  duration_minutes: number | null;
  status: string;
  verification_status: string;
  distance_from_society: number;
  gps_accuracy: number;
  gps_flags: string[];
  selfie_url: string | null;
  is_offline_sync: boolean;
  manual_override: boolean;
  override_note: string;
}

function getStatusBadge(status: string) {
  const map: Record<string, string> = { present: 'badge-present', late: 'badge-late', absent: 'badge-absent', rejected: 'badge-absent' };
  return <span className={map[status] || 'badge'}>{status?.toUpperCase()}</span>;
}
function getVerBadge(v: string) {
  if (v === 'verified') return <span className="badge-verified text-xs flex items-center gap-1"><CheckCircle2 className="w-3 h-3"/>Verified</span>;
  if (v === 'warning') return <span className="badge-late text-xs flex items-center gap-1"><Clock className="w-3 h-3"/>Warning</span>;
  if (v === 'suspicious' || v === 'review_required') return <span className="badge-suspicious text-xs flex items-center gap-1"><ShieldAlert className="w-3 h-3"/>Suspicious</span>;
  return <span className="badge text-xs">{v}</span>;
}

export default function AttendancePage() {
  const queryClient = useQueryClient();
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [statusFilter, setStatusFilter] = useState('');
  const [overrideRecord, setOverrideRecord] = useState<AttendanceRecord | null>(null);
  const [overrideStatus, setOverrideStatus] = useState('present');
  const [overrideNote, setOverrideNote] = useState('');
  const [viewSelfie, setViewSelfie] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['attendance', date, statusFilter],
    queryFn: async () => {
      const {data} = await api.get('/attendance', {params: {date, status: statusFilter || undefined}});
      return data.data as AttendanceRecord[];
    },
  });

  const overrideMutation = useMutation({
    mutationFn: ({id, status, note}: {id:string;status:string;note:string}) =>
      api.patch(`/attendance/${id}/override`, {status, note}),
    onSuccess: () => {
      queryClient.invalidateQueries({queryKey:['attendance']});
      toast.success('Attendance updated');
      setOverrideRecord(null);
    },
    onError: () => toast.error('Failed to update attendance'),
  });

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="section-header">
        <div>
          <h1 className="section-title">Attendance Records</h1>
          <p className="text-slate-500 text-sm">{data?.length ?? 0} records</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-3 flex-wrap items-center">
        <input type="date" value={date} onChange={e=>setDate(e.target.value)} className="input w-44" />
        <select value={statusFilter} onChange={e=>setStatusFilter(e.target.value)} className="input w-40">
          <option value="">All Status</option>
          <option value="present">Present</option>
          <option value="late">Late</option>
          <option value="absent">Absent</option>
          <option value="rejected">Rejected</option>
        </select>
      </div>

      {/* Table */}
      <div className="table-wrapper">
        <table className="table">
          <thead>
            <tr>
              <th>Guard</th>
              <th>Society / Shift</th>
              <th>Check-in</th>
              <th>Check-out</th>
              <th>Status</th>
              <th>GPS</th>
              <th>Photo</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              Array.from({length:5}).map((_,i) => (
                <tr key={i}><td colSpan={7}><div className="h-10 bg-surface-700 animate-pulse rounded" /></td></tr>
              ))
            ) : data?.map(r => (
              <tr key={r.id} className={r.verification_status === 'suspicious' ? 'bg-orange-500/5' : ''}>
                <td>
                  <div>
                    <p className="font-medium">{r.watchman_name}</p>
                    <p className="text-xs text-slate-500">{r.employee_id}</p>
                  </div>
                </td>
                <td>
                  <div>
                    <p>{r.society_name}</p>
                    <p className="text-xs text-slate-500">{r.shift_name}</p>
                  </div>
                </td>
                <td className="text-slate-300 text-sm whitespace-nowrap">
                  {new Date(r.check_in_time).toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit',hour12:true})}
                  {r.is_offline_sync && <span className="ml-1 text-xs text-warning-400 block">Offline sync</span>}
                  {r.manual_override && <span className="ml-1 text-xs text-brand-400 block">Override</span>}
                </td>
                <td className="text-slate-300 text-sm whitespace-nowrap">
                  {r.check_out_time
                    ? (
                      <div>
                        <span>{new Date(r.check_out_time).toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit',hour12:true})}</span>
                        {r.duration_minutes != null && (
                          <span className="text-xs text-slate-500 block">
                            {Math.floor(r.duration_minutes / 60)}h {r.duration_minutes % 60}m
                          </span>
                        )}
                      </div>
                    )
                    : <span className="text-slate-600 text-xs">Not checked out</span>
                  }
                </td>
                <td>{getStatusBadge(r.status)}</td>
                <td>
                  <div className="space-y-1">
                    {getVerBadge(r.verification_status)}
                    <p className="text-xs text-slate-600">
                      {r.distance_from_society ? `${Math.round(r.distance_from_society)}m away` : ''}
                      {r.gps_accuracy ? ` ±${Math.round(r.gps_accuracy)}m` : ''}
                    </p>
                    {r.gps_flags?.length > 0 && (
                      <p className="text-xs text-warning-500">{r.gps_flags.join(', ')}</p>
                    )}
                  </div>
                </td>
                <td>
                  {r.selfie_url ? (
                    <button onClick={() => setViewSelfie(r.selfie_url)} className="w-10 h-10 rounded-lg overflow-hidden hover:ring-2 ring-brand-500">
                      <img src={r.selfie_url} alt="Selfie" className="w-full h-full object-cover" />
                    </button>
                  ) : <span className="text-slate-600 text-xs">—</span>}
                </td>
                <td>
                  <button onClick={() => { setOverrideRecord(r); setOverrideStatus(r.status); setOverrideNote(''); }}
                    className="text-xs text-brand-400 hover:text-brand-300 px-2 py-1 rounded hover:bg-brand-500/10">
                    Override
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!isLoading && (!data || data.length === 0) && (
          <div className="text-center py-12 text-slate-600">
            <ClipboardList className="w-10 h-10 mx-auto mb-2 opacity-40" />
            <p className="text-sm">No attendance records for this date</p>
          </div>
        )}
      </div>

      {/* Selfie lightbox */}
      {viewSelfie && (
        <div className="fixed inset-0 bg-black/90 z-50 flex items-center justify-center p-4 animate-fade-in" onClick={() => setViewSelfie(null)}>
          <img src={viewSelfie} alt="Attendance selfie" className="max-h-[80vh] max-w-[90vw] rounded-2xl" />
          <button className="absolute top-4 right-4 p-2 rounded-full bg-surface-800 text-slate-300">
            <X className="w-5 h-5" />
          </button>
        </div>
      )}

      {/* Override modal */}
      {overrideRecord && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4 animate-fade-in">
          <div className="card w-full max-w-md">
            <div className="flex items-center justify-between p-5 border-b border-surface-700">
              <h2 className="font-bold text-slate-100">Override Attendance</h2>
              <button onClick={() => setOverrideRecord(null)} className="p-1.5 rounded-lg hover:bg-surface-700 text-slate-400"><X className="w-5 h-5" /></button>
            </div>
            <div className="p-5 space-y-4">
              <p className="text-sm text-slate-400">
                Override attendance for <strong className="text-slate-200">{overrideRecord.watchman_name}</strong>.
                This action is audit-logged.
              </p>
              <div className="form-group">
                <label className="label">New Status</label>
                <select className="input" value={overrideStatus} onChange={e=>setOverrideStatus(e.target.value)}>
                  <option value="present">Present</option>
                  <option value="late">Late</option>
                  <option value="absent">Absent</option>
                </select>
              </div>
              <div className="form-group">
                <label className="label">Reason / Note *</label>
                <input className="input" value={overrideNote} onChange={e=>setOverrideNote(e.target.value)} placeholder="Reason for override..." />
              </div>
            </div>
            <div className="flex gap-3 p-5 border-t border-surface-700">
              <button onClick={() => setOverrideRecord(null)} className="btn-ghost px-5 py-2.5">Cancel</button>
              <button
                onClick={() => overrideMutation.mutate({id:overrideRecord.id, status:overrideStatus, note:overrideNote})}
                disabled={overrideMutation.isPending || !overrideNote}
                className="btn-primary px-5 py-2.5 ml-auto"
              >
                {overrideMutation.isPending ? 'Saving...' : 'Save Override'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
