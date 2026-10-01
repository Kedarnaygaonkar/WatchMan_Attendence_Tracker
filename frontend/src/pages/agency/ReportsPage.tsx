import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { BarChart3, Calendar, AlertTriangle, Download, Filter, X, MapPin, Route, User, Building2, Grid3X3, DoorOpen, Layers } from 'lucide-react';
import api from '../../api/client';
import { useAuthStore } from '../../stores/authStore';
import toast from 'react-hot-toast';

type ReportTab = 'daily' | 'monthly' | 'suspicious' | 'journey' | 'society_calendar';

interface Society { id: string; name: string; }
interface Agency { id: string; name: string; }
interface WatchmanOption { _id: string; id: string; full_name: string; employee_id: string; }

interface DailyRecord {
  watchman_id: string; full_name: string; employee_id: string;
  society_name: string; shift_name: string; final_status: string;
  check_in_time: string | null; check_out_time: string | null;
  duration_minutes: number | null; verification_status: string | null; is_offline_sync: boolean;
}

interface MonthlyRecord {
  watchman_id: string; full_name: string; employee_id: string;
  days_present: number; days_late: number; days_absent: number;
  suspicious_count: number; total_records: number;
}

interface SuspiciousRecord {
  id: string; watchman_name: string; employee_id: string;
  society_name: string; attendance_date: string; check_in_time: string;
  verification_status: string; gps_flags: string[]; distance_from_society: number;
}

interface JourneyDay {
  date: string; status: 'present' | 'late' | 'absent';
  society_name: string | null; shift_name: string | null;
  start_time: string | null; end_time: string | null;
  check_in_time: string | null; check_out_time: string | null;
  duration_minutes: number | null; verification_status: string | null;
  attendance_id: string | null;
}

interface JourneyStats { totalDays: number; presentDays: number; lateDays: number; absentDays: number; }

interface CalendarWatchman { watchman_id: string; watchman_name: string; employee_id: string; days_attended: number; wings: string[]; gates: string[]; }
interface CalendarSection { name: string; days: boolean[]; }
interface SocietyCalendarData {
  year: number; month: number; daysInMonth: number;
  watchmen: CalendarWatchman[];
  wings: CalendarSection[];
  gates: CalendarSection[];
}

function StatusBadge({ status }: { status: string }) {
  const cls: Record<string, string> = { present: 'badge-present', late: 'badge-late', absent: 'badge-absent', rejected: 'badge-absent' };
  return <span className={cls[status] || 'badge'}>{status?.toUpperCase()}</span>;
}

export default function ReportsPage() {
  const { user } = useAuthStore();
  const isSuperAdmin = user?.role === 'super_admin';

  const [tab, setTab] = useState<ReportTab>('daily');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [year, setYear] = useState(new Date().getFullYear());
  const [month, setMonth] = useState(new Date().getMonth() + 1);
  const [societyId, setSocietyId] = useState('');
  const [agencyId, setAgencyId] = useState('');

  const [journeyWatchmanId, setJourneyWatchmanId] = useState('');
  const [journeyStartDate, setJourneyStartDate] = useState(() => {
    const d = new Date(); d.setDate(d.getDate() - 30); return d.toISOString().split('T')[0];
  });
  const [journeyEndDate, setJourneyEndDate] = useState(new Date().toISOString().split('T')[0]);

  const { data: societies } = useQuery({
    queryKey: ['societies-filter', agencyId],
    queryFn: async () => {
      const params: any = { active: 'true' };
      if (isSuperAdmin && agencyId) params.agency_id = agencyId;
      const { data } = await api.get('/societies', { params });
      return data.data as Society[];
    },
  });

  const { data: agencies } = useQuery({
    queryKey: ['agencies-filter'],
    queryFn: async () => { try { const { data } = await api.get('/agencies'); return data.data as Agency[]; } catch { return [] as Agency[]; } },
    enabled: isSuperAdmin,
  });

  const { data: watchmenOptions } = useQuery({
    queryKey: ['watchmen-all-journey', agencyId],
    queryFn: async () => {
      const params: any = {};
      if (isSuperAdmin && agencyId) params.agency_id = agencyId;
      const { data } = await api.get('/watchmen', { params });
      return (data.data || data) as WatchmanOption[];
    },
    enabled: tab === 'journey',
  });

  const { data: dailyData, isLoading: dailyLoading } = useQuery({
    queryKey: ['report-daily', date, societyId, agencyId],
    queryFn: async () => {
      const params: any = { date };
      if (societyId) params.society_id = societyId;
      if (isSuperAdmin && agencyId) params.agency_id = agencyId;
      const { data } = await api.get('/reports/daily', { params });
      return data.data as DailyRecord[];
    },
    enabled: tab === 'daily',
  });

  const { data: monthlyData, isLoading: monthlyLoading } = useQuery({
    queryKey: ['report-monthly', year, month, societyId, agencyId],
    queryFn: async () => {
      const params: any = { year, month };
      if (societyId) params.society_id = societyId;
      if (isSuperAdmin && agencyId) params.agency_id = agencyId;
      const { data } = await api.get('/reports/monthly', { params });
      return data.data as MonthlyRecord[];
    },
    enabled: tab === 'monthly',
  });

  const { data: suspiciousData, isLoading: suspiciousLoading } = useQuery({
    queryKey: ['report-suspicious', societyId, agencyId],
    queryFn: async () => {
      const params: any = {};
      if (societyId) params.society_id = societyId;
      if (isSuperAdmin && agencyId) params.agency_id = agencyId;
      const { data } = await api.get('/reports/suspicious', { params });
      return data.data as SuspiciousRecord[];
    },
    enabled: tab === 'suspicious',
  });

  const { data: journeyData, isLoading: journeyLoading } = useQuery({
    queryKey: ['report-journey', journeyWatchmanId, journeyStartDate, journeyEndDate, agencyId],
    queryFn: async () => {
      const params: any = { watchman_id: journeyWatchmanId, startDate: journeyStartDate, endDate: journeyEndDate };
      if (isSuperAdmin && agencyId) params.agency_id = agencyId;
      const { data } = await api.get('/reports/watchman-journey', { params });
      return { records: data.data as JourneyDay[], stats: data.stats as JourneyStats, watchman: data.watchman };
    },
    enabled: tab === 'journey' && !!journeyWatchmanId,
  });

  const [calendarSocietyId, setCalendarSocietyId] = useState('');
  const [calendarYear, setCalendarYear] = useState(new Date().getFullYear());
  const [calendarMonth, setCalendarMonth] = useState(new Date().getMonth() + 1);

  const { data: calendarData, isLoading: calendarLoading } = useQuery({
    queryKey: ['report-society-calendar', calendarSocietyId, calendarYear, calendarMonth, agencyId],
    queryFn: async () => {
      const params: any = { society_id: calendarSocietyId, year: calendarYear, month: calendarMonth };
      if (isSuperAdmin && agencyId) params.agency_id = agencyId;
      const { data } = await api.get('/reports/society-calendar', { params });
      return data as SocietyCalendarData;
    },
    enabled: tab === 'society_calendar' && !!calendarSocietyId,
  });

  function downloadCSV(rows: (string | number)[][], filename: string) {
    const csv = rows.map((r) => r.map((v) => `"${String(v ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = filename; a.click();
    URL.revokeObjectURL(url); toast.success(`Exported ${filename}`);
  }

  function exportDailyCSV() {
    if (!dailyData?.length) { toast.error('No daily data to export'); return; }
    const headers = ['Guard Name','Employee ID','Society','Shift','Date','Check-In','Check-Out','Duration (min)','Status','Verification Status','Offline Sync'];
    const rows = dailyData.map((r) => [r.full_name,r.employee_id,r.society_name,r.shift_name,date,
      r.check_in_time ? new Date(r.check_in_time).toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit',hour12:true}) : '',
      r.check_out_time ? new Date(r.check_out_time).toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit',hour12:true}) : '',
      r.duration_minutes ?? '',r.final_status,r.verification_status || '',r.is_offline_sync ? 'Yes' : 'No']);
    downloadCSV([headers, ...rows], `daily-attendance-${date}.csv`);
  }

  function exportMonthlyCSV() {
    if (!monthlyData?.length) { toast.error('No monthly data to export'); return; }
    const headers = ['Guard Name','Employee ID','Present','Late','Absent','Suspicious Count','Total','Attendance %'];
    const rows = monthlyData.map((r) => {
      const total = r.days_present + r.days_late + r.days_absent;
      const pct = total ? Math.round(((r.days_present + r.days_late) / total) * 100) : 0;
      return [r.full_name,r.employee_id,r.days_present,r.days_late,r.days_absent,r.suspicious_count,total,`${pct}%`];
    });
    downloadCSV([headers, ...rows], `monthly-attendance-${year}-${month}.csv`);
  }

  function exportSuspiciousCSV() {
    if (!suspiciousData?.length) { toast.error('No suspicious data to export'); return; }
    const headers = ['Guard Name','Employee ID','Society','Date','Flags','Distance (m)'];
    const rows = suspiciousData.map((r) => [r.watchman_name,r.employee_id,r.society_name,
      new Date(r.attendance_date).toLocaleDateString('en-IN'),(r.gps_flags||[]).join(' | '),
      r.distance_from_society ? Math.round(r.distance_from_society) : '']);
    downloadCSV([headers, ...rows], `suspicious-records.csv`);
  }

  function exportJourneyCSV() {
    if (!journeyData?.records?.length) { toast.error('No journey data to export'); return; }
    const wm = journeyData.watchman;
    const headers = ['Date','Status','Society','Shift','Check-In','Check-Out','Duration (min)'];
    const rows = journeyData.records.map((r) => [r.date,r.status,r.society_name||'ABSENT',r.shift_name||'',
      r.check_in_time ? new Date(r.check_in_time).toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit',hour12:true}) : '',
      r.check_out_time ? new Date(r.check_out_time).toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit',hour12:true}) : '',
      r.duration_minutes ?? '']);
    downloadCSV([headers, ...rows], `journey-${wm?.employee_id||'watchman'}-${journeyStartDate}-to-${journeyEndDate}.csv`);
  }

  const tabs: { id: ReportTab; label: string; icon: React.ElementType }[] = [
    { id: 'daily', label: 'Daily Attendance', icon: Calendar },
    { id: 'monthly', label: 'Monthly Summary', icon: BarChart3 },
    { id: 'journey', label: 'Watchman Journey', icon: Route },
    { id: 'society_calendar', label: 'Society Calendar', icon: Grid3X3 },
    { id: 'suspicious', label: 'Suspicious Records', icon: AlertTriangle },
  ];

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="section-header">
        <div>
          <h1 className="section-title">Reports</h1>
          <p className="text-slate-500 text-sm">Attendance analytics and CSV exports</p>
        </div>
      </div>

      {/* Tab nav */}
      <div className="flex gap-2 border-b border-surface-700 pb-px flex-wrap">
        {tabs.map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium rounded-t-lg border-b-2 transition-colors ${
              tab === t.id ? 'border-brand-500 text-brand-400 bg-brand-500/10' : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}>
            <t.icon className="w-4 h-4" /> {t.label}
          </button>
        ))}
      </div>

      {/* Common Filters — hidden for journey */}
      {tab !== 'journey' && (
        <div className="card p-4">
          <div className="flex items-center gap-2 mb-3">
            <Filter className="w-4 h-4 text-brand-400" />
            <span className="text-sm font-semibold text-slate-300">Report Filters</span>
          </div>
          <div className="flex gap-3 flex-wrap items-center">
            {tab === 'daily' && <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="input w-44" />}
            {tab === 'monthly' && (
              <div className="flex gap-2">
                <select className="input w-36" value={month} onChange={(e) => setMonth(parseInt(e.target.value))}>
                  {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                    <option key={m} value={m}>{new Date(2000, m - 1).toLocaleString('en-IN', { month: 'long' })}</option>
                  ))}
                </select>
                <select className="input w-28" value={year} onChange={(e) => setYear(parseInt(e.target.value))}>
                  {[2024, 2025, 2026, 2027].map((y) => <option key={y} value={y}>{y}</option>)}
                </select>
              </div>
            )}
            {isSuperAdmin && (
              <select value={agencyId} onChange={(e) => { setAgencyId(e.target.value); setSocietyId(''); }} className="input w-52">
                <option value="">All Agencies</option>
                {agencies?.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            )}
            <select value={societyId} onChange={(e) => setSocietyId(e.target.value)} className="input w-52">
              <option value="">All Societies</option>
              {societies?.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
            {(societyId || agencyId) && (
              <button onClick={() => { setSocietyId(''); setAgencyId(''); }}
                className="flex items-center gap-1.5 text-xs text-danger-400 hover:text-danger-300 px-3 py-1.5 rounded-lg hover:bg-danger-500/10 transition-colors border border-danger-500/20">
                <X className="w-3.5 h-3.5" /> Clear Filters
              </button>
            )}
            <div className="ml-auto">
              {tab === 'daily' && <button onClick={exportDailyCSV} disabled={!dailyData?.length} className="btn-primary flex items-center gap-2 px-4 py-2 text-sm"><Download className="w-4 h-4" /> Export CSV</button>}
              {tab === 'monthly' && <button onClick={exportMonthlyCSV} disabled={!monthlyData?.length} className="btn-primary flex items-center gap-2 px-4 py-2 text-sm"><Download className="w-4 h-4" /> Export CSV</button>}
              {tab === 'suspicious' && <button onClick={exportSuspiciousCSV} disabled={!suspiciousData?.length} className="btn-primary flex items-center gap-2 px-4 py-2 text-sm"><Download className="w-4 h-4" /> Export CSV</button>}
            </div>
          </div>
        </div>
      )}

      {/* Daily */}
      {tab === 'daily' && (
        <div className="space-y-4">
          <div className="table-wrapper">
            <table className="table">
              <thead><tr><th>Guard</th><th>Society</th><th>Shift</th><th>Check-in</th><th>Check-out</th><th>Status</th></tr></thead>
              <tbody>
                {dailyLoading ? Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i}><td colSpan={6}><div className="h-10 bg-surface-700 animate-pulse rounded" /></td></tr>
                )) : dailyData?.map((r, i) => (
                  <tr key={i}>
                    <td><div><p className="font-medium">{r.full_name}</p><p className="text-xs text-slate-500">{r.employee_id}</p></div></td>
                    <td>{r.society_name}</td><td>{r.shift_name}</td>
                    <td className="text-slate-300 text-sm whitespace-nowrap">
                      {r.check_in_time ? new Date(r.check_in_time).toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit',hour12:true}) : '—'}
                    </td>
                    <td className="text-slate-300 text-sm whitespace-nowrap">
                      {r.check_out_time ? (
                        <div>
                          <span>{new Date(r.check_out_time).toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit',hour12:true})}</span>
                          {r.duration_minutes != null && <span className="text-xs text-slate-500 block">{Math.floor(r.duration_minutes/60)}h {r.duration_minutes%60}m</span>}
                        </div>
                      ) : <span className="text-slate-600 text-xs">—</span>}
                    </td>
                    <td><StatusBadge status={r.final_status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!dailyLoading && (!dailyData || dailyData.length === 0) && (
              <div className="text-center py-12 text-slate-600"><Calendar className="w-10 h-10 mx-auto mb-2 opacity-40" /><p className="text-sm">No records found for the selected date / filters</p></div>
            )}
          </div>
          {dailyData && dailyData.length > 0 && (
            <div className="grid grid-cols-3 gap-4">
              {[
                { label: 'Present', val: dailyData.filter((r) => r.final_status === 'present').length, cls: 'text-success-400' },
                { label: 'Late', val: dailyData.filter((r) => r.final_status === 'late').length, cls: 'text-warning-400' },
                { label: 'Absent', val: dailyData.filter((r) => r.final_status === 'absent').length, cls: 'text-danger-400' },
              ].map((s) => (
                <div key={s.label} className="card p-4 text-center">
                  <p className={`text-3xl font-black ${s.cls}`}>{s.val}</p>
                  <p className="text-slate-500 text-sm">{s.label}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Monthly */}
      {tab === 'monthly' && (
        <div className="space-y-4">
          <div className="table-wrapper">
            <table className="table">
              <thead><tr><th>Guard</th><th>Present</th><th>Late</th><th>Absent</th><th>Suspicious</th><th>Attendance %</th></tr></thead>
              <tbody>
                {monthlyLoading ? Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i}><td colSpan={6}><div className="h-10 bg-surface-700 animate-pulse rounded" /></td></tr>
                )) : monthlyData?.map((r) => {
                  const total = r.days_present + r.days_late + r.days_absent;
                  const pct = total ? Math.round(((r.days_present + r.days_late) / total) * 100) : 0;
                  return (
                    <tr key={r.watchman_id}>
                      <td><div><p className="font-medium">{r.full_name}</p><p className="text-xs text-slate-500">{r.employee_id}</p></div></td>
                      <td className="text-success-400 font-bold">{r.days_present}</td>
                      <td className="text-warning-400 font-bold">{r.days_late}</td>
                      <td className="text-danger-400 font-bold">{r.days_absent}</td>
                      <td className="text-orange-400">{r.suspicious_count}</td>
                      <td>
                        <div className="flex items-center gap-2">
                          <div className="w-16 h-2 bg-surface-700 rounded-full overflow-hidden">
                            <div className="h-full bg-brand-500 rounded-full transition-all" style={{ width: `${pct}%` }} />
                          </div>
                          <span className="text-sm font-medium">{pct}%</span>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {!monthlyLoading && (!monthlyData || monthlyData.length === 0) && (
              <div className="text-center py-12 text-slate-600"><BarChart3 className="w-10 h-10 mx-auto mb-2 opacity-40" /><p className="text-sm">No monthly summary found</p></div>
            )}
          </div>
        </div>
      )}

      {/* Watchman Journey */}
      {tab === 'journey' && (
        <div className="space-y-5">
          <div className="card p-4 space-y-4">
            <div className="flex items-center gap-2">
              <Route className="w-4 h-4 text-brand-400" />
              <span className="text-sm font-semibold text-slate-300">Select Watchman & Date Range</span>
            </div>
            <div className="flex gap-3 flex-wrap items-end">
              {isSuperAdmin && (
                <div className="flex flex-col gap-1">
                  <label className="text-xs text-slate-500 font-medium">Agency</label>
                  <select value={agencyId} onChange={(e) => setAgencyId(e.target.value)} className="input w-48">
                    <option value="">All Agencies</option>
                    {agencies?.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                  </select>
                </div>
              )}
              <div className="flex flex-col gap-1">
                <label className="text-xs text-slate-500 font-medium">Watchman *</label>
                <select value={journeyWatchmanId} onChange={(e) => setJourneyWatchmanId(e.target.value)} className="input w-60">
                  <option value="">— Select a Guard —</option>
                  {watchmenOptions?.map((w) => (
                    <option key={w._id || w.id} value={w._id || w.id}>{w.full_name} ({w.employee_id})</option>
                  ))}
                </select>
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs text-slate-500 font-medium">From</label>
                <input type="date" value={journeyStartDate} onChange={(e) => setJourneyStartDate(e.target.value)} className="input w-40" />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs text-slate-500 font-medium">To</label>
                <input type="date" value={journeyEndDate} onChange={(e) => setJourneyEndDate(e.target.value)} className="input w-40" />
              </div>
              {journeyData?.records?.length ? (
                <button onClick={exportJourneyCSV} className="btn-primary flex items-center gap-2 px-4 py-2 text-sm self-end">
                  <Download className="w-4 h-4" /> Export CSV
                </button>
              ) : null}
            </div>
          </div>

          {journeyData?.watchman && (
            <div className="card p-4">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="w-11 h-11 rounded-full bg-brand-500/20 border border-brand-500/30 flex items-center justify-center">
                    <User className="w-5 h-5 text-brand-400" />
                  </div>
                  <div>
                    <p className="font-bold text-slate-100 text-lg">{journeyData.watchman.full_name}</p>
                    <p className="text-slate-500 text-sm">ID: {journeyData.watchman.employee_id}</p>
                  </div>
                </div>
                <div className="flex gap-3 flex-wrap">
                  {[
                    { label: 'Present', val: journeyData.stats.presentDays, cls: 'text-success-400', bg: 'bg-success-500/10 border-success-500/20' },
                    { label: 'Late', val: journeyData.stats.lateDays, cls: 'text-warning-400', bg: 'bg-warning-500/10 border-warning-500/20' },
                    { label: 'Absent', val: journeyData.stats.absentDays, cls: 'text-danger-400', bg: 'bg-danger-500/10 border-danger-500/20' },
                    { label: 'Total', val: journeyData.stats.totalDays, cls: 'text-slate-300', bg: 'bg-surface-700 border-surface-600' },
                  ].map((s) => (
                    <div key={s.label} className={`${s.bg} border px-4 py-2 rounded-xl text-center min-w-[68px]`}>
                      <p className={`text-2xl font-black ${s.cls}`}>{s.val}</p>
                      <p className="text-slate-500 text-xs">{s.label}</p>
                    </div>
                  ))}
                </div>
              </div>
              {journeyData.stats.totalDays > 0 && (
                <div className="mt-4">
                  <div className="flex justify-between text-xs text-slate-500 mb-1">
                    <span>Attendance Rate</span>
                    <span className="font-semibold text-slate-300">
                      {Math.round(((journeyData.stats.presentDays + journeyData.stats.lateDays) / journeyData.stats.totalDays) * 100)}%
                    </span>
                  </div>
                  <div className="h-2.5 bg-surface-700 rounded-full overflow-hidden">
                    <div className="h-full bg-gradient-to-r from-brand-600 to-brand-400 rounded-full transition-all"
                      style={{ width: `${Math.round(((journeyData.stats.presentDays + journeyData.stats.lateDays) / journeyData.stats.totalDays) * 100)}%` }} />
                  </div>
                </div>
              )}
            </div>
          )}

          {!journeyWatchmanId && (
            <div className="card p-12 text-center text-slate-600">
              <Route className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p className="font-medium text-slate-400">Select a watchman to view their journey</p>
              <p className="text-sm mt-1">Day-by-day breakdown showing which society they attended and absent days</p>
            </div>
          )}

          {journeyLoading && journeyWatchmanId && (
            <div className="space-y-2">
              {Array.from({ length: 8 }).map((_, i) => <div key={i} className="h-16 bg-surface-800 animate-pulse rounded-xl" />)}
            </div>
          )}

          {!journeyLoading && journeyWatchmanId && journeyData && (
            <div className="space-y-2">
              {journeyData.records.length === 0 ? (
                <div className="card p-12 text-center text-slate-600">
                  <Calendar className="w-10 h-10 mx-auto mb-2 opacity-40" />
                  <p className="text-sm">No records found for this date range</p>
                </div>
              ) : journeyData.records.map((day, i) => (
                <div key={i} className={`flex items-center gap-4 p-3.5 rounded-xl border transition-all ${
                  day.status === 'absent' ? 'bg-danger-500/5 border-danger-500/20'
                  : day.status === 'late' ? 'bg-warning-500/5 border-warning-500/20'
                  : 'bg-success-500/5 border-success-500/20'
                }`}>
                  <div className="w-16 shrink-0 text-center">
                    <p className="text-xs font-bold text-slate-400 uppercase">
                      {new Date(day.date + 'T12:00:00').toLocaleDateString('en-IN', { weekday: 'short' })}
                    </p>
                    <p className="text-xl font-black text-slate-200 leading-tight">
                      {new Date(day.date + 'T12:00:00').getDate()}
                    </p>
                    <p className="text-[10px] text-slate-500">
                      {new Date(day.date + 'T12:00:00').toLocaleDateString('en-IN', { month: 'short', year: '2-digit' })}
                    </p>
                  </div>
                  <div className={`w-2.5 h-2.5 rounded-full shrink-0 ${
                    day.status === 'absent' ? 'bg-danger-500' : day.status === 'late' ? 'bg-warning-500' : 'bg-success-500'
                  }`} />
                  <div className="flex-1 min-w-0">
                    {day.status === 'absent' ? (
                      <p className="text-danger-400 font-bold text-sm">Absent — did not attend any society</p>
                    ) : (
                      <div className="flex items-center gap-2 flex-wrap">
                        <div className="flex items-center gap-1.5">
                          <Building2 className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                          <span className="text-slate-100 font-semibold text-sm">{day.society_name}</span>
                        </div>
                        {day.shift_name && (
                          <span className="text-xs text-slate-500 bg-surface-700 px-2 py-0.5 rounded-full">{day.shift_name}</span>
                        )}
                      </div>
                    )}
                    {day.check_in_time && (
                      <div className="flex gap-3 mt-0.5 text-xs text-slate-500">
                        <span className="flex items-center gap-1">
                          <MapPin className="w-3 h-3" />
                          In: {new Date(day.check_in_time).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true })}
                        </span>
                        {day.check_out_time && (
                          <span>Out: {new Date(day.check_out_time).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true })}</span>
                        )}
                        {day.duration_minutes && (
                          <span>{Math.floor(day.duration_minutes / 60)}h {day.duration_minutes % 60}m</span>
                        )}
                      </div>
                    )}
                  </div>
                  <StatusBadge status={day.status} />
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Suspicious */}
      {tab === 'suspicious' && (
        <div className="space-y-4">
          <div className="table-wrapper">
            <table className="table">
              <thead><tr><th>Guard</th><th>Society</th><th>Date</th><th>Flags</th><th>Distance</th></tr></thead>
              <tbody>
                {suspiciousLoading ? Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i}><td colSpan={5}><div className="h-10 bg-surface-700 animate-pulse rounded" /></td></tr>
                )) : suspiciousData?.map((r) => (
                  <tr key={r.id}>
                    <td><div><p className="font-medium">{r.watchman_name}</p><p className="text-xs text-slate-500">{r.employee_id}</p></div></td>
                    <td>{r.society_name}</td>
                    <td className="text-slate-400 text-sm">{new Date(r.attendance_date).toLocaleDateString('en-IN')}</td>
                    <td>
                      <div className="flex flex-wrap gap-1">
                        {r.gps_flags?.map((f, i) => (
                          <span key={i} className="text-xs bg-warning-500/20 text-warning-400 border border-warning-500/20 px-1.5 py-0.5 rounded-full">{f}</span>
                        ))}
                      </div>
                    </td>
                    <td className="text-slate-400">{r.distance_from_society ? `${Math.round(r.distance_from_society)}m` : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!suspiciousLoading && (!suspiciousData || suspiciousData.length === 0) && (
              <div className="text-center py-12 text-slate-600"><AlertTriangle className="w-10 h-10 mx-auto mb-2 opacity-40" /><p className="text-sm">No suspicious records in last 30 days</p></div>
            )}
          </div>
        </div>
      )}

      {/* Society Calendar */}
      {tab === 'society_calendar' && (
        <div className="space-y-5">
          <div className="card p-4 space-y-4">
            <div className="flex items-center gap-2">
              <Grid3X3 className="w-4 h-4 text-brand-400" />
              <span className="text-sm font-semibold text-slate-300">Society Calendar — Wing & Gate Breakdown</span>
            </div>
            <div className="flex gap-3 flex-wrap items-end">
              {isSuperAdmin && (
                <div className="flex flex-col gap-1">
                  <label className="text-xs text-slate-500 font-medium">Agency</label>
                  <select value={agencyId} onChange={(e) => setAgencyId(e.target.value)} className="input w-48">
                    <option value="">All Agencies</option>
                    {agencies?.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                  </select>
                </div>
              )}
              <div className="flex flex-col gap-1">
                <label className="text-xs text-slate-500 font-medium">Society *</label>
                <select value={calendarSocietyId} onChange={(e) => setCalendarSocietyId(e.target.value)} className="input w-56">
                  <option value="">— Select a Society —</option>
                  {societies?.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs text-slate-500 font-medium">Month</label>
                <select className="input w-36" value={calendarMonth} onChange={(e) => setCalendarMonth(parseInt(e.target.value))}>
                  {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                    <option key={m} value={m}>{new Date(2000, m - 1).toLocaleString('en-IN', { month: 'long' })}</option>
                  ))}
                </select>
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs text-slate-500 font-medium">Year</label>
                <select className="input w-28" value={calendarYear} onChange={(e) => setCalendarYear(parseInt(e.target.value))}>
                  {[2024, 2025, 2026, 2027].map((y) => <option key={y} value={y}>{y}</option>)}
                </select>
              </div>
            </div>
          </div>
          {!calendarSocietyId && (
            <div className="card p-12 text-center text-slate-600">
              <Grid3X3 className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p className="font-medium text-slate-400">Select a society to view its monthly calendar</p>
              <p className="text-sm mt-1">See which wings and gates had watchmen on duty each day</p>
            </div>
          )}
          {calendarLoading && calendarSocietyId && (
            <div className="space-y-3">
              {Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-40 bg-surface-800 animate-pulse rounded-xl" />)}
            </div>
          )}
          {!calendarLoading && calendarSocietyId && calendarData && (
            <div className="space-y-5">
              <div className="card p-4">
                <div className="flex items-center gap-2 mb-3">
                  <Building2 className="w-4 h-4 text-brand-400" />
                  <span className="text-sm font-semibold text-slate-200">Guards Who Attended This Month</span>
                  <span className="ml-auto text-xs text-slate-500 bg-surface-700 px-2 py-0.5 rounded-full">{calendarData.watchmen.length} guard(s)</span>
                </div>
                {calendarData.watchmen.length === 0 ? (
                  <p className="text-slate-600 text-sm py-4 text-center">No attendance recorded this month for this society</p>
                ) : (
                  <div className="table-wrapper">
                    <table className="table">
                      <thead><tr><th>Guard</th><th>Employee ID</th><th>Days Attended</th><th>Wings</th><th>Gates</th></tr></thead>
                      <tbody>
                        {calendarData.watchmen.map((w) => (
                          <tr key={w.watchman_id}>
                            <td className="font-medium">{w.watchman_name}</td>
                            <td className="text-slate-400 text-sm">{w.employee_id}</td>
                            <td><span className="text-success-400 font-bold">{w.days_attended}</span><span className="text-slate-600 text-xs"> / {calendarData.daysInMonth}</span></td>
                            <td><div className="flex flex-wrap gap-1">{w.wings.length ? w.wings.map((wg) => (<span key={wg} className="text-xs bg-blue-500/15 text-blue-400 border border-blue-500/20 px-2 py-0.5 rounded-full">{wg}</span>)) : <span className="text-slate-600 text-xs">—</span>}</div></td>
                            <td><div className="flex flex-wrap gap-1">{w.gates.length ? w.gates.map((g) => (<span key={g} className="text-xs bg-purple-500/15 text-purple-400 border border-purple-500/20 px-2 py-0.5 rounded-full">{g}</span>)) : <span className="text-slate-600 text-xs">—</span>}</div></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
              {(calendarData.wings.length > 0 || calendarData.gates.length > 0) && (() => {
                const days = Array.from({ length: calendarData.daysInMonth }, (_, i) => i + 1);
                const weekDayOf1 = new Date(calendarData.year, calendarData.month - 1, 1).getDay();
                function CalGrid({ section, presentColor }: { section: CalendarSection; presentColor: string }) {
                  const cells: (number | null)[] = [...Array(weekDayOf1).fill(null), ...days];
                  while (cells.length % 7 !== 0) cells.push(null);
                  const weeks: (number | null)[][] = [];
                  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
                  return (
                    <div className="mt-2 select-none">
                      <div className="grid grid-cols-7 gap-0.5 mb-1">
                        {['Su','Mo','Tu','We','Th','Fr','Sa'].map((d) => (<div key={d} className="text-center text-[9px] font-bold text-slate-600 py-0.5">{d}</div>))}
                      </div>
                      {weeks.map((week, wi) => (
                        <div key={wi} className="grid grid-cols-7 gap-0.5 mb-0.5">
                          {week.map((day, di) => (
                            <div key={di} className={`aspect-square rounded flex items-center justify-center text-[10px] font-bold ${day === null ? 'opacity-0 pointer-events-none' : section.days[day - 1] ? presentColor + ' text-white shadow-sm' : 'bg-danger-500/25 text-danger-400'}`}>
                              {day ?? ''}
                            </div>
                          ))}
                        </div>
                      ))}
                    </div>
                  );
                }
                return (
                  <div className="space-y-5">
                    {calendarData.wings.length > 0 && (
                      <div className="card p-4">
                        <div className="flex items-center gap-2 mb-4">
                          <Layers className="w-4 h-4 text-blue-400" />
                          <span className="text-sm font-semibold text-slate-200">Wing-wise Presence Calendar</span>
                          <span className="text-xs text-slate-500 ml-2 flex items-center gap-3">
                            <span className="inline-flex items-center gap-1"><span className="w-3 h-3 rounded bg-success-500 inline-block" /> Present</span>
                            <span className="inline-flex items-center gap-1"><span className="w-3 h-3 rounded bg-danger-500/40 inline-block" /> Absent</span>
                          </span>
                        </div>
                        <div className={`grid gap-5 ${calendarData.wings.length === 1 ? 'grid-cols-1 max-w-xs' : 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3'}`}>
                          {calendarData.wings.map((w) => (
                            <div key={w.name} className="bg-surface-800/80 border border-surface-700 rounded-xl p-3">
                              <div className="flex items-center gap-2 mb-1">
                                <Layers className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                                <span className="text-sm font-bold text-slate-200 truncate">{w.name}</span>
                                <span className="ml-auto text-xs font-semibold shrink-0"><span className="text-success-400">{w.days.filter(Boolean).length}</span><span className="text-slate-600">/{calendarData.daysInMonth}</span></span>
                              </div>
                              <CalGrid section={w} presentColor="bg-success-500" />
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    {calendarData.gates.length > 0 && (
                      <div className="card p-4">
                        <div className="flex items-center gap-2 mb-4">
                          <DoorOpen className="w-4 h-4 text-purple-400" />
                          <span className="text-sm font-semibold text-slate-200">Gate-wise Presence Calendar</span>
                          <span className="text-xs text-slate-500 ml-2 flex items-center gap-3">
                            <span className="inline-flex items-center gap-1"><span className="w-3 h-3 rounded bg-purple-500 inline-block" /> Present</span>
                            <span className="inline-flex items-center gap-1"><span className="w-3 h-3 rounded bg-danger-500/40 inline-block" /> Absent</span>
                          </span>
                        </div>
                        <div className={`grid gap-5 ${calendarData.gates.length === 1 ? 'grid-cols-1 max-w-xs' : 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3'}`}>
                          {calendarData.gates.map((g) => (
                            <div key={g.name} className="bg-surface-800/80 border border-surface-700 rounded-xl p-3">
                              <div className="flex items-center gap-2 mb-1">
                                <DoorOpen className="w-3.5 h-3.5 text-purple-400 shrink-0" />
                                <span className="text-sm font-bold text-slate-200 truncate">{g.name}</span>
                                <span className="ml-auto text-xs font-semibold shrink-0"><span className="text-success-400">{g.days.filter(Boolean).length}</span><span className="text-slate-600">/{calendarData.daysInMonth}</span></span>
                              </div>
                              <CalGrid section={g} presentColor="bg-purple-500" />
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })()}
              {calendarData.wings.length === 0 && calendarData.gates.length === 0 && calendarData.watchmen.length > 0 && (
                <div className="card p-8 text-center text-slate-600">
                  <Grid3X3 className="w-10 h-10 mx-auto mb-2 opacity-40" />
                  <p className="text-sm">No wing/gate breakdown — watchmen did not select a wing or gate this month</p>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}