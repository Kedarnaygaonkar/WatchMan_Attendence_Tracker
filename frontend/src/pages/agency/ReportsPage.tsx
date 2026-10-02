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

interface CalendarWatchman { watchman_id: string; watchman_name: string; employee_id: string; phone: string; shift_name: string; days_attended: number; wings: string[]; gates: string[]; }
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
  const { data: calendarData, isLoading: calendarLoading } = useQuery({
    queryKey: ['report-society-calendar', societyId, year, month, agencyId],
    queryFn: async () => {
      const params: any = { society_id: societyId, year, month };
      if (isSuperAdmin && agencyId) params.agency_id = agencyId;
      const { data } = await api.get('/reports/society-calendar', { params });
      return data as SocietyCalendarData;
    },
    enabled: tab === 'monthly' && !!societyId,
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
    { id: 'monthly', label: 'Monthly Summary & Calendar', icon: BarChart3 },
    { id: 'journey', label: 'Watchman Journey', icon: Route },
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
        <>
          {!societyId && (
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

          {/* Fully Custom PDF-Style Report for a specific Society */}
          {societyId && (
            <div className="bg-white text-slate-800 rounded-xl shadow-2xl overflow-hidden mt-6 print:shadow-none print:mt-0 max-w-[1000px] mx-auto border border-slate-200" style={{ fontFamily: 'Inter, sans-serif' }}>
              {calendarLoading ? (
                <div className="p-12 text-center space-y-4">
                  <div className="w-12 h-12 border-4 border-brand-500 border-t-transparent rounded-full animate-spin mx-auto" />
                  <p className="text-slate-500 font-medium animate-pulse">Generating Report...</p>
                </div>
              ) : calendarData ? (() => {
                const selSociety = societies?.find(s => s.id === societyId)?.name || 'Society';
                const selAgency = agencies?.find(a => a.id === agencyId)?.name || 'Security Services';
                
                // Calculations
                let totalPresentScans = 0;
                let totalLate = 0;
                let absentDays = 0;
                monthlyData?.forEach(m => {
                  totalPresentScans += m.days_present + m.days_late;
                  totalLate += m.days_late;
                  absentDays += m.days_absent;
                });

                return (
                  <div className="flex flex-col relative pb-8">
                    {/* Print Button (hidden when printing) */}
                    <button onClick={() => window.print()} className="absolute top-4 right-4 bg-brand-600 hover:bg-brand-700 text-white px-4 py-2 rounded-lg text-sm font-semibold shadow-md transition-all print:hidden flex items-center gap-2">
                      <Download className="w-4 h-4" /> Print / Save PDF
                    </button>

                    {/* Top Branding Section */}
                    <div className="flex justify-between items-center p-6 border-b-4 border-[#0F3B68] bg-slate-50">
                      <div className="flex items-center gap-4">
                        <div className="w-16 h-16 bg-[#0F3B68] text-white rounded-xl flex items-center justify-center">
                          <Building2 className="w-8 h-8" />
                        </div>
                        <div>
                          <h1 className="text-3xl font-extrabold text-[#0F3B68] leading-tight">{selSociety}</h1>
                          <p className="text-slate-500 font-medium text-sm flex items-center gap-1 mt-0.5"><MapPin className="w-3.5 h-3.5" /> Pune, Maharashtra</p>
                        </div>
                      </div>
                      <div className="text-right flex items-center gap-4">
                        <div className="flex flex-col items-end">
                          <p className="text-xs text-slate-500 font-bold uppercase tracking-wider mb-0.5">Managed By</p>
                          <h2 className="text-xl font-bold text-[#0F3B68]">{selAgency}</h2>
                          <p className="text-slate-500 text-xs mt-1">Safety • Service • Trust</p>
                        </div>
                        <div className="w-12 h-12 bg-blue-100 text-blue-700 rounded-full flex items-center justify-center">
                          <User className="w-6 h-6" />
                        </div>
                      </div>
                    </div>

                    {/* Blue Title & Stats Bar */}
                    <div className="bg-[#0F3B68] text-white px-8 py-4 flex flex-wrap justify-between items-center gap-4 shadow-inner">
                      <div className="flex items-center gap-4">
                        <div className="bg-white/20 p-2.5 rounded-lg">
                          <Calendar className="w-6 h-6 text-blue-100" />
                        </div>
                        <div>
                          <h2 className="text-xl font-bold tracking-wide">Watchman Attendance Report</h2>
                          <p className="text-blue-200 font-medium text-sm flex items-center gap-1.5 mt-0.5">
                            <span className="bg-white/20 px-2 py-0.5 rounded text-xs">
                              {new Date(calendarData.year, calendarData.month - 1).toLocaleString('en-IN', { month: 'long', year: 'numeric' })}
                            </span>
                          </p>
                        </div>
                      </div>
                      <div className="flex gap-8">
                        <div className="flex items-center gap-2">
                          <User className="w-5 h-5 text-blue-200 opacity-80" />
                          <div><p className="text-[10px] text-blue-200 font-bold uppercase tracking-wider leading-none">Total Watchmen</p><p className="text-2xl font-black leading-none mt-1">{calendarData.watchmen.length}</p></div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Layers className="w-5 h-5 text-blue-200 opacity-80" />
                          <div><p className="text-[10px] text-blue-200 font-bold uppercase tracking-wider leading-none">Total Wings</p><p className="text-2xl font-black leading-none mt-1">{calendarData.wings.length}</p></div>
                        </div>
                        <div className="flex items-center gap-2">
                          <DoorOpen className="w-5 h-5 text-blue-200 opacity-80" />
                          <div><p className="text-[10px] text-blue-200 font-bold uppercase tracking-wider leading-none">Total Gates</p><p className="text-2xl font-black leading-none mt-1">{calendarData.gates.length}</p></div>
                        </div>
                      </div>
                    </div>

                    <div className="p-8 space-y-8">
                      {/* Watchman List Table */}
                      <div className="border border-slate-200 rounded-xl overflow-hidden shadow-sm">
                        <div className="bg-slate-100 px-4 py-3 border-b border-slate-200 flex items-center gap-2">
                          <User className="w-5 h-5 text-[#0F3B68]" />
                          <h3 className="font-bold text-[#0F3B68] text-lg">Watchman List</h3>
                          <span className="text-xs text-slate-500 ml-auto font-medium">Present Days = Total times QR scanned at society</span>
                        </div>
                        <table className="w-full text-sm text-left">
                          <thead className="bg-slate-50 text-slate-500 font-bold uppercase text-[10px] tracking-wider">
                            <tr>
                              <th className="px-4 py-3 w-16">Sr. No.</th>
                              <th className="px-4 py-3">Watchman ID</th>
                              <th className="px-4 py-3">Name</th>
                              <th className="px-4 py-3">Type</th>
                              <th className="px-4 py-3">Contact No.</th>
                              <th className="px-4 py-3">Shift</th>
                              <th className="px-4 py-3 text-center">Present Days</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {calendarData.watchmen.map((w, i) => (
                              <tr key={w.watchman_id} className={i % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'}>
                                <td className="px-4 py-2.5 font-medium text-slate-400">{i + 1}</td>
                                <td className="px-4 py-2.5 font-semibold text-[#0F3B68]">{w.employee_id}</td>
                                <td className="px-4 py-2.5 font-bold text-slate-700">{w.watchman_name}</td>
                                <td className="px-4 py-2.5 text-slate-600">{w.wings.length > 0 ? 'Wing Watchman' : w.gates.length > 0 ? 'Gate Watchman' : 'General'}</td>
                                <td className="px-4 py-2.5 text-slate-600">{w.phone || '-'}</td>
                                <td className="px-4 py-2.5 text-slate-600">{w.shift_name || '-'}</td>
                                <td className="px-4 py-2.5 text-center font-black text-[#0F3B68]">{w.days_attended}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>

                      {/* Calendar Renderer Function */}
                      {(() => {
                        const days = Array.from({ length: calendarData.daysInMonth }, (_, i) => i + 1);
                        const weekDayOf1 = new Date(calendarData.year, calendarData.month - 1, 1).getDay();
                        function PdfCalGrid({ section, accentColor }: { section: any; accentColor: string }) {
                          const cells: (number | null)[] = [...Array(weekDayOf1).fill(null), ...days];
                          while (cells.length % 7 !== 0) cells.push(null);
                          const weeks: (number | null)[][] = [];
                          for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
                          
                          return (
                            <div className="mt-3">
                              <div className="grid grid-cols-7 gap-1 mb-1">
                                {['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map((d) => (<div key={d} className="text-center text-[9px] font-bold text-slate-500 uppercase tracking-tighter">{d}</div>))}
                              </div>
                              <div className="flex flex-col gap-1">
                                {weeks.map((week, wi) => (
                                  <div key={wi} className="grid grid-cols-7 gap-1">
                                    {week.map((day, di) => {
                                      const isPres = day !== null && section.days[day - 1];
                                      return (
                                        <div key={di} className={`aspect-square rounded flex items-center justify-center text-[11px] font-bold transition-all ${
                                          day === null ? 'opacity-0' 
                                          : isPres ? 'bg-[#2ECC71] text-white shadow-sm border border-[#27AE60]' 
                                          : 'bg-[#FFEDED] text-[#E74C3C] border border-[#FADBD8]'
                                        }`}>
                                          {day ?? ''}
                                        </div>
                                      );
                                    })}
                                  </div>
                                ))}
                              </div>
                            </div>
                          );
                        }

                        return (
                          <div className="space-y-6">
                            {/* Wing Breakdown */}
                            {calendarData.wings.length > 0 && (
                              <div className="border border-slate-200 rounded-xl overflow-hidden shadow-sm">
                                <div className="bg-slate-100 px-4 py-3 border-b border-slate-200 flex items-center justify-between">
                                  <div className="flex items-center gap-2">
                                    <Building2 className="w-5 h-5 text-[#3498DB]" />
                                    <h3 className="font-bold text-[#0F3B68] text-lg">Wing Watchmen Attendance (Wing Wise)</h3>
                                  </div>
                                  <div className="flex gap-4 text-xs font-semibold text-slate-600">
                                    <span className="flex items-center gap-1.5"><div className="w-3 h-3 rounded-full bg-[#2ECC71]" /> Present</span>
                                    <span className="flex items-center gap-1.5"><div className="w-3 h-3 rounded-full bg-[#F1C40F]" /> Late Check-in</span>
                                    <span className="flex items-center gap-1.5"><div className="w-3 h-3 rounded-full bg-[#E74C3C]" /> No Watchman</span>
                                  </div>
                                </div>
                                <div className="p-5 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 bg-slate-50/50">
                                  {calendarData.wings.map((w: any) => {
                                    // Find primary watchman for this wing
                                    const primaryWM = calendarData.watchmen.find(wm => wm.wings.includes(w.name));
                                    return (
                                      <div key={w.name} className="bg-white border border-slate-200 rounded-lg p-3 shadow-sm hover:shadow-md transition-shadow">
                                        <div className="flex gap-3 items-start pb-2 border-b border-slate-100">
                                          <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
                                            <Building2 className="w-4 h-4" />
                                          </div>
                                          <div className="min-w-0 flex-1">
                                            <h4 className="font-extrabold text-[#0F3B68] text-sm truncate">{w.name}</h4>
                                            <p className="text-[10px] text-slate-500 truncate mt-0.5"><span className="font-semibold text-slate-600">Watchman:</span> {primaryWM?.watchman_name || 'Multiple'}</p>
                                          </div>
                                        </div>
                                        <PdfCalGrid section={w} accentColor="blue" />
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>
                            )}

                            {/* Gate Breakdown */}
                            {calendarData.gates.length > 0 && (
                              <div className="border border-slate-200 rounded-xl overflow-hidden shadow-sm">
                                <div className="bg-slate-100 px-4 py-3 border-b border-slate-200 flex items-center justify-between">
                                  <div className="flex items-center gap-2">
                                    <DoorOpen className="w-5 h-5 text-[#9B59B6]" />
                                    <h3 className="font-bold text-[#0F3B68] text-lg">Gate Watchmen Attendance (Gate Wise)</h3>
                                  </div>
                                </div>
                                <div className="p-5 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 bg-slate-50/50">
                                  {calendarData.gates.map((g: any) => {
                                    const primaryWM = calendarData.watchmen.find(wm => wm.gates.includes(g.name));
                                    return (
                                      <div key={g.name} className="bg-white border border-slate-200 rounded-lg p-3 shadow-sm hover:shadow-md transition-shadow">
                                        <div className="flex gap-3 items-start pb-2 border-b border-slate-100">
                                          <div className="w-8 h-8 rounded-lg bg-purple-50 text-purple-600 flex items-center justify-center shrink-0">
                                            <DoorOpen className="w-4 h-4" />
                                          </div>
                                          <div className="min-w-0 flex-1">
                                            <h4 className="font-extrabold text-[#0F3B68] text-sm truncate">{g.name}</h4>
                                            <p className="text-[10px] text-slate-500 truncate mt-0.5"><span className="font-semibold text-slate-600">Watchman:</span> {primaryWM?.watchman_name || 'Multiple'}</p>
                                          </div>
                                        </div>
                                        <PdfCalGrid section={g} accentColor="purple" />
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })()}

                      {/* Footer Stats & Remarks */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-4">
                        <div className="border border-slate-200 rounded-xl p-5 shadow-sm flex flex-col justify-center">
                          <h3 className="font-bold text-[#0F3B68] flex items-center gap-2 mb-4"><BarChart3 className="w-5 h-5 text-blue-500" /> Monthly Overview</h3>
                          <div className="grid grid-cols-4 gap-3 text-center">
                            <div className="bg-slate-50 rounded-lg p-3 border border-slate-100">
                              <Calendar className="w-5 h-5 mx-auto text-slate-400 mb-1" />
                              <p className="text-[10px] font-bold uppercase text-slate-500 leading-tight">Total Days</p>
                              <p className="text-xl font-black text-[#0F3B68] mt-1">{calendarData.daysInMonth}</p>
                            </div>
                            <div className="bg-[#E8F8F5] rounded-lg p-3 border border-[#D1F2EB]">
                              <User className="w-5 h-5 mx-auto text-[#1ABC9C] mb-1" />
                              <p className="text-[10px] font-bold uppercase text-[#16A085] leading-tight">Present Scans</p>
                              <p className="text-xl font-black text-[#1ABC9C] mt-1">{totalPresentScans}</p>
                            </div>
                            <div className="bg-[#FEF9E7] rounded-lg p-3 border border-[#FCF3CF]">
                              <AlertTriangle className="w-5 h-5 mx-auto text-[#F39C12] mb-1" />
                              <p className="text-[10px] font-bold uppercase text-[#D68910] leading-tight">Late Check-ins</p>
                              <p className="text-xl font-black text-[#F39C12] mt-1">{totalLate}</p>
                            </div>
                            <div className="bg-[#FDEDEC] rounded-lg p-3 border border-[#FADBD8]">
                              <X className="w-5 h-5 mx-auto text-[#E74C3C] mb-1" />
                              <p className="text-[10px] font-bold uppercase text-[#CB4335] leading-tight">No Watchman</p>
                              <p className="text-xl font-black text-[#E74C3C] mt-1">{absentDays}</p>
                            </div>
                          </div>
                        </div>

                        <div className="border border-slate-200 bg-slate-50 rounded-xl p-5 shadow-sm">
                          <h3 className="font-bold text-[#0F3B68] flex items-center gap-2 mb-3"><AlertTriangle className="w-4 h-4 text-slate-500" /> Remarks</h3>
                          <ul className="text-xs text-slate-600 space-y-1.5 list-disc pl-4 marker:text-slate-400">
                            <li>Attendance is recorded based on QR scan by watchman at respective wing/gate.</li>
                            <li><span className="font-bold text-[#27AE60]">Green</span> indicates watchman was present.</li>
                            <li><span className="font-bold text-[#F39C12]">Yellow</span> indicates late check-in.</li>
                            <li><span className="font-bold text-[#E74C3C]">Red</span> indicates no watchman was present.</li>
                            <li>Regular monitoring is advised for better security coverage.</li>
                          </ul>
                        </div>
                      </div>

                      {/* Signatures */}
                      <div className="flex justify-between items-end mt-8 pt-6 border-t border-slate-200">
                        <p className="text-xs text-slate-400 font-medium">Generated on: {new Date().toLocaleString('en-IN', { day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</p>
                        <div className="text-center">
                          <div className="w-32 border-b-2 border-slate-300 mb-2 pb-1 text-slate-400 font-cursive italic text-lg opacity-60">Admin</div>
                          <p className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Authorized Signatory</p>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })() : null}
            </div>
          )}
        </>
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
    </div>
  );
}