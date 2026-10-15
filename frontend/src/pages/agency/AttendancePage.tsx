import { useState, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import {
  ClipboardList, ShieldAlert, CheckCircle2, Clock, X, Download,
  Building2, Filter, Search, ShieldCheck, ArrowRight, RefreshCw, Calendar
} from 'lucide-react';
import api from '../../api/client';
import { useAuthStore } from '../../stores/authStore';
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

interface Society { id: string; _id?: string; name: string; }
interface Agency  { id: string; _id?: string; name: string; }

function fmt(time: string) {
  return new Date(time).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
}
function fmtDate(time: string) {
  return new Date(time).toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function getStatusBadge(status: string) {
  const map: Record<string, string> = { present: 'badge-present', late: 'badge-late', absent: 'badge-absent', rejected: 'badge-absent' };
  return <span className={map[status] || 'badge'}>{status?.toUpperCase()}</span>;
}
function getVerBadge(v: string) {
  if (v === 'verified') return <span className="badge-verified text-xs flex items-center gap-1"><CheckCircle2 className="w-3 h-3"/>Verified</span>;
  if (v === 'warning')  return <span className="badge-late text-xs flex items-center gap-1"><Clock className="w-3 h-3"/>Warning</span>;
  if (v === 'suspicious' || v === 'review_required') return <span className="badge-suspicious text-xs flex items-center gap-1"><ShieldAlert className="w-3 h-3"/>Suspicious</span>;
  return <span className="badge text-xs">{v}</span>;
}

export default function AttendancePage() {
  const queryClient = useQueryClient();
  const { user } = useAuthStore();
  const isSuperAdmin = user?.role === 'super_admin';
  const basePath = isSuperAdmin ? '/agency' : '/admin';

  const [date,         setDate]         = useState(new Date().toISOString().split('T')[0]);
  const [search,       setSearch]       = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [societyId,    setSocietyId]    = useState('');
  const [agencyId,     setAgencyId]     = useState('');
  const [overrideRecord, setOverrideRecord] = useState<AttendanceRecord | null>(null);
  const [overrideStatus, setOverrideStatus] = useState('present');
  const [overrideNote,   setOverrideNote]   = useState('');
  const [viewSelfie,     setViewSelfie]     = useState<string | null>(null);

  // Fetch societies for filter
  const { data: societies } = useQuery({
    queryKey: ['societies-filter', agencyId],
    queryFn: async () => {
      const params: any = { active: 'true' };
      if (isSuperAdmin && agencyId) params.agency_id = agencyId;
      const { data } = await api.get('/societies', { params });
      return (data.data || []) as Society[];
    },
  });

  // Fetch agencies for super_admin filter
  const { data: agencies } = useQuery({
    queryKey: ['agencies-filter'],
    queryFn: async () => {
      try {
        const { data } = await api.get('/agencies');
        return (data.data || []) as Agency[];
      } catch {
        return [] as Agency[];
      }
    },
    enabled: isSuperAdmin,
  });

  // Fetch attendance records
  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ['attendance', date, search, statusFilter, societyId, agencyId],
    queryFn: async () => {
      const params: any = { status: statusFilter || undefined };
      if (date && date !== 'all')         params.date       = date;
      if (search.trim())                  params.search     = search.trim();
      if (societyId)                      params.societyId  = societyId;
      if (isSuperAdmin && agencyId)       params.agency_id  = agencyId;
      const { data } = await api.get('/attendance', { params });
      return (data.data || []) as AttendanceRecord[];
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

  // CSV Export
  const downloadCSV = useCallback(() => {
    if (!data || data.length === 0) { toast.error('No records to export'); return; }

    const headers = [
      'Guard Name', 'Employee ID', 'Society', 'Shift',
      'Date', 'Check-In', 'Check-Out', 'Duration (min)',
      'Status', 'Verification', 'Distance (m)', 'GPS Accuracy (m)',
      'GPS Flags', 'Offline Sync', 'Manual Override',
    ];

    const rows = data.map(r => [
      r.watchman_name,
      r.employee_id,
      r.society_name,
      r.shift_name,
      fmtDate(r.check_in_time),
      fmt(r.check_in_time),
      r.check_out_time ? fmt(r.check_out_time) : '',
      r.duration_minutes ?? '',
      r.status,
      r.verification_status,
      r.distance_from_society ? Math.round(r.distance_from_society) : '',
      r.gps_accuracy ? Math.round(r.gps_accuracy) : '',
      (r.gps_flags || []).join(' | '),
      r.is_offline_sync ? 'Yes' : 'No',
      r.manual_override ? 'Yes' : 'No',
    ]);

    const csvContent = [headers, ...rows]
      .map(row => row.map(v => `"${String(v).replace(/"/g, '""')}"`).join(','))
      .join('\n');

    const matchedSoc = societies?.find(s => (s.id || s._id) === societyId);
    const socLabel = matchedSoc?.name || (societyId ? 'society' : 'all');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url  = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href     = url;
    link.download = `attendance_logs_${date || 'all'}_${socLabel}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    toast.success(`Exported ${data.length} records`);
  }, [data, date, societyId, societies]);

  // Quick stats
  const totalLogs = data?.length || 0;
  const verifiedCount = data?.filter(r => r.verification_status === 'verified').length || 0;
  const flaggedCount = data?.filter(r => r.verification_status === 'suspicious' || r.verification_status === 'warning' || r.verification_status === 'review_required').length || 0;
  const overrideCount = data?.filter(r => r.manual_override).length || 0;

  const todayStr = new Date().toISOString().split('T')[0];
  const yesterdayStr = (() => {
    const d = new Date(); d.setDate(d.getDate() - 1); return d.toISOString().split('T')[0];
  })();

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="section-header">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="section-title">Attendance Logs & Verification</h1>
            {isFetching && (
              <span className="flex items-center gap-1 text-xs text-brand-400 bg-brand-500/10 px-2.5 py-1 rounded-full border border-brand-500/20">
                <RefreshCw className="w-3 h-3 animate-spin" /> Live Syncing
              </span>
            )}
          </div>
          <p className="text-slate-400 text-sm mt-0.5">
            Real-time punch feed with GPS geofence auditing, selfie face verification, and supervisor overrides.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => refetch()}
            className="btn-ghost flex items-center gap-2 px-3 py-2 text-sm text-slate-300"
            title="Refresh logs"
          >
            <RefreshCw className={`w-4 h-4 ${isFetching ? 'animate-spin text-brand-400' : ''}`} />
            Refresh
          </button>
          <button
            onClick={downloadCSV}
            disabled={!data || data.length === 0}
            className="btn-primary flex items-center gap-2 px-4 py-2.5 text-sm"
          >
            <Download className="w-4 h-4" />
            Export CSV
          </button>
        </div>
      </div>

      {/* Helpful banner clarifying section purpose vs Reports */}
      <div className="bg-gradient-to-r from-brand-500/10 via-surface-800 to-purple-500/10 border border-brand-500/20 rounded-xl p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-2.5 text-slate-300">
          <div className="p-1.5 rounded-lg bg-brand-500/20 text-brand-400 shrink-0">
            <ClipboardList className="w-4 h-4" />
          </div>
          <div>
            <span className="font-semibold text-brand-300 mr-1.5">Operational Punch Feed:</span>
            <span>Shows actual check-in events, GPS distance from gates, guard selfies, and manual overrides.</span>
          </div>
        </div>
        <Link
          to={`${basePath}/reports`}
          className="flex items-center gap-1.5 text-brand-400 hover:text-brand-300 font-medium shrink-0 group transition-colors"
        >
          <span>Need full daily roster & absentees? View Daily Roster in Reports</span>
          <ArrowRight className="w-3.5 h-3.5 transition-transform group-hover:translate-x-0.5" />
        </Link>
      </div>

      {/* KPI Stats cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="card p-4">
          <p className="text-xs text-slate-400 font-medium">Total Punches</p>
          <p className="text-2xl font-bold text-slate-100 mt-1">{totalLogs}</p>
        </div>
        <div className="card p-4">
          <div className="flex items-center justify-between">
            <p className="text-xs text-slate-400 font-medium">Verified (In-Fence)</p>
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          </div>
          <p className="text-2xl font-bold text-emerald-400 mt-1">{verifiedCount}</p>
        </div>
        <div className="card p-4">
          <div className="flex items-center justify-between">
            <p className="text-xs text-slate-400 font-medium">Flagged / Suspicious</p>
            <ShieldAlert className="w-4 h-4 text-warning-400" />
          </div>
          <p className="text-2xl font-bold text-warning-400 mt-1">{flaggedCount}</p>
        </div>
        <div className="card p-4">
          <div className="flex items-center justify-between">
            <p className="text-xs text-slate-400 font-medium">Manual Overrides</p>
            <ShieldCheck className="w-4 h-4 text-purple-400" />
          </div>
          <p className="text-2xl font-bold text-purple-400 mt-1">{overrideCount}</p>
        </div>
      </div>

      {/* Filters */}
      <div className="card p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-brand-400" />
            <span className="text-sm font-semibold text-slate-200">Filter Punch Logs</span>
          </div>
          {/* Quick Date Presets */}
          <div className="flex items-center gap-1.5 bg-surface-800 p-1 rounded-lg border border-surface-700">
            <button
              onClick={() => setDate(todayStr)}
              className={`px-2.5 py-1 text-xs rounded-md font-medium transition-colors ${
                date === todayStr ? 'bg-brand-500 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Today
            </button>
            <button
              onClick={() => setDate(yesterdayStr)}
              className={`px-2.5 py-1 text-xs rounded-md font-medium transition-colors ${
                date === yesterdayStr ? 'bg-brand-500 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Yesterday
            </button>
            <button
              onClick={() => setDate('')}
              className={`px-2.5 py-1 text-xs rounded-md font-medium transition-colors ${
                !date ? 'bg-brand-500 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              All Records
            </button>
          </div>
        </div>

        <div className="flex gap-3 flex-wrap items-center">
          {/* Search */}
          <div className="relative flex-1 min-w-[200px] max-w-sm">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search guard name, ID, society..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="input pl-9 w-full"
            />
            {search && (
              <button
                onClick={() => setSearch('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Date Picker */}
          <div className="relative">
            <input
              type="date"
              value={date}
              onChange={e => setDate(e.target.value)}
              className="input w-44"
              title="Filter by specific date"
            />
            {date && (
              <button
                onClick={() => setDate('')}
                className="absolute right-8 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200"
                title="Clear date (view all punches)"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Agency (super_admin only) */}
          {isSuperAdmin && (
            <select
              value={agencyId}
              onChange={e => { setAgencyId(e.target.value); setSocietyId(''); }}
              className="input w-48"
            >
              <option value="">All Agencies</option>
              {agencies?.map(a => {
                const aid = a.id || a._id || '';
                return <option key={aid} value={aid}>{a.name}</option>;
              })}
            </select>
          )}

          {/* Society */}
          <select
            value={societyId}
            onChange={e => setSocietyId(e.target.value)}
            className="input w-48"
          >
            <option value="">All Societies</option>
            {societies?.map(s => {
              const sid = s.id || s._id || '';
              return <option key={sid} value={sid}>{s.name}</option>;
            })}
          </select>

          {/* Status */}
          <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="input w-36">
            <option value="">All Status</option>
            <option value="present">Present</option>
            <option value="late">Late</option>
            <option value="absent">Absent</option>
            <option value="rejected">Rejected</option>
          </select>

          {/* Active filters chip */}
          {(societyId || agencyId || statusFilter || search || (date && date !== todayStr)) && (
            <button
              onClick={() => { setSocietyId(''); setAgencyId(''); setStatusFilter(''); setSearch(''); setDate(todayStr); }}
              className="flex items-center gap-1.5 text-xs text-danger-400 hover:text-danger-300 px-3 py-1.5 rounded-lg hover:bg-danger-500/10 transition-colors border border-danger-500/20"
            >
              <X className="w-3.5 h-3.5" /> Reset Filters
            </button>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="table-wrapper">
        <table className="table">
          <thead>
            <tr>
              <th>Guard</th>
              <th>Society / Shift</th>
              <th>Date / Check-in</th>
              <th>Check-out</th>
              <th>Status</th>
              <th>GPS & Geofence</th>
              <th>Selfie Photo</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              Array.from({length:5}).map((_,i) => (
                <tr key={i}><td colSpan={8}><div className="h-10 bg-surface-700 animate-pulse rounded" /></td></tr>
              ))
            ) : data?.map(r => (
              <tr key={r.id} className={r.verification_status === 'suspicious' ? 'bg-orange-500/5' : ''}>
                <td>
                  <div>
                    <p className="font-medium text-slate-100">{r.watchman_name}</p>
                    <p className="text-xs text-slate-400">{r.employee_id}</p>
                  </div>
                </td>
                <td>
                  <div>
                    <p className="flex items-center gap-1 text-slate-200">
                      <Building2 className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      {r.society_name}
                    </p>
                    <p className="text-xs text-slate-400">{r.shift_name}</p>
                  </div>
                </td>
                <td className="text-slate-300 text-sm whitespace-nowrap">
                  <div>
                    <span className="font-medium text-slate-100">{fmt(r.check_in_time)}</span>
                    <span className="text-xs text-slate-400 block">{fmtDate(r.check_in_time)}</span>
                    {r.is_offline_sync && <span className="text-xs text-warning-400 block font-medium">Offline sync</span>}
                    {r.manual_override && <span className="text-xs text-brand-400 block font-medium">Override</span>}
                  </div>
                </td>
                <td className="text-slate-300 text-sm whitespace-nowrap">
                  {r.check_out_time ? (
                    <div>
                      <span className="font-medium text-slate-100">{fmt(r.check_out_time)}</span>
                      {r.duration_minutes != null && (
                        <span className="text-xs text-slate-400 block">
                          {Math.floor(r.duration_minutes / 60)}h {r.duration_minutes % 60}m
                        </span>
                      )}
                    </div>
                  ) : <span className="text-slate-500 text-xs italic">Not checked out</span>}
                </td>
                <td>{getStatusBadge(r.status)}</td>
                <td>
                  <div className="space-y-1">
                    {getVerBadge(r.verification_status)}
                    <p className="text-xs text-slate-400">
                      {r.distance_from_society != null ? `${Math.round(r.distance_from_society)}m from society` : ''}
                      {r.gps_accuracy ? ` (±${Math.round(r.gps_accuracy)}m)` : ''}
                    </p>
                    {r.gps_flags?.length > 0 && (
                      <p className="text-xs text-warning-400 font-medium">{r.gps_flags.join(', ')}</p>
                    )}
                  </div>
                </td>
                <td>
                  {r.selfie_url ? (
                    <button
                      onClick={() => setViewSelfie(r.selfie_url)}
                      className="w-11 h-11 rounded-lg overflow-hidden border border-surface-600 hover:ring-2 ring-brand-500 transition-all cursor-pointer relative group"
                      title="Click to view full selfie photo"
                    >
                      <img src={r.selfie_url} alt="Selfie" className="w-full h-full object-cover" />
                      <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-[10px] text-white font-medium">
                        View
                      </div>
                    </button>
                  ) : <span className="text-slate-600 text-xs">—</span>}
                </td>
                <td>
                  <button
                    onClick={() => { setOverrideRecord(r); setOverrideStatus(r.status); setOverrideNote(''); }}
                    className="text-xs text-brand-400 hover:text-brand-300 px-2.5 py-1 rounded bg-brand-500/10 hover:bg-brand-500/20 font-medium transition-colors border border-brand-500/20"
                  >
                    Override
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!isLoading && (!data || data.length === 0) && (
          <div className="text-center py-12 text-slate-500">
            <ClipboardList className="w-12 h-12 mx-auto mb-3 opacity-30 text-slate-400" />
            <p className="text-base font-medium text-slate-300">No punch records found</p>
            <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto">
              {date ? `No check-ins recorded for ${date}. Try selecting "All Records" or clearing filters.` : 'No check-ins match the selected filters.'}
            </p>
            {date && (
              <button
                onClick={() => setDate('')}
                className="btn-ghost text-brand-400 text-xs mt-3 inline-flex items-center gap-1.5"
              >
                <Calendar className="w-3.5 h-3.5" /> View All Recent Records
              </button>
            )}
          </div>
        )}
      </div>

      {/* Selfie lightbox */}
      {viewSelfie && (
        <div className="fixed inset-0 bg-black/90 z-50 flex items-center justify-center p-4 animate-fade-in" onClick={() => setViewSelfie(null)}>
          <div className="relative max-h-[85vh] max-w-[90vw] overflow-hidden rounded-2xl bg-surface-900 border border-surface-700 shadow-2xl p-2" onClick={e => e.stopPropagation()}>
            <img src={viewSelfie} alt="Attendance selfie" className="max-h-[80vh] max-w-[85vw] rounded-xl object-contain" />
            <button
              onClick={() => setViewSelfie(null)}
              className="absolute top-4 right-4 p-2 rounded-full bg-black/70 hover:bg-black text-white transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
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
                Override attendance status for <strong className="text-slate-200">{overrideRecord.watchman_name}</strong>.
                This action is audit-logged with your user credentials.
              </p>
              <div className="form-group">
                <label className="label">New Status</label>
                <select className="input" value={overrideStatus} onChange={e => setOverrideStatus(e.target.value)}>
                  <option value="present">Present</option>
                  <option value="late">Late</option>
                  <option value="absent">Absent</option>
                </select>
              </div>
              <div className="form-group">
                <label className="label">Reason / Supervisor Note *</label>
                <input
                  className="input"
                  value={overrideNote}
                  onChange={e => setOverrideNote(e.target.value)}
                  placeholder="e.g. Approved leave / Device issue / Manual punch..."
                  required
                />
              </div>
            </div>
            <div className="flex gap-3 p-5 border-t border-surface-700">
              <button onClick={() => setOverrideRecord(null)} className="btn-ghost px-5 py-2.5">Cancel</button>
              <button
                onClick={() => overrideMutation.mutate({id:overrideRecord.id, status:overrideStatus, note:overrideNote})}
                disabled={overrideMutation.isPending || !overrideNote.trim()}
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
