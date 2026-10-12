import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { BarChart3, Calendar, AlertTriangle, Download, Filter, X, MapPin, Route, User, Building2, Grid3X3, DoorOpen, Layers, Users, Printer, ShieldCheck, CheckCircle2, Clock, Sparkles } from 'lucide-react';
import api from '../../api/client';
import { useAuthStore } from '../../stores/authStore';
import toast from 'react-hot-toast';

type ReportTab = 'daily' | 'monthly' | 'watchmen' | 'suspicious' | 'journey' | 'society_calendar';

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
interface CalendarSection { name: string; days: (string | boolean | null)[]; }
interface SocietyCalendarData {
  year: number; month: number; daysInMonth: number;
  society?: {
    id: string;
    name: string;
    address: string;
    agency?: {
      id: string;
      name: string;
      phone: string;
      email: string;
      logo_url?: string;
    } | null;
  } | null;
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

  const { data: watchmenReportList = [], isLoading: watchmenReportLoading } = useQuery({
    queryKey: ['report-watchmen-list', agencyId],
    queryFn: async () => {
      const params: any = {};
      if (isSuperAdmin && agencyId) params.agency_id = agencyId;
      const { data } = await api.get('/watchmen', { params });
      return (data.data || data) as any[];
    },
    enabled: tab === 'watchmen',
  });

  function exportWatchmenReportCSV() {
    if (!watchmenReportList?.length) { toast.error('No watchmen data to export'); return; }
    const headers = ['Guard Name', 'Employee ID', 'Mobile Number', 'Status', 'Joining Date', 'Active Assignments', 'Address'];
    const rows = watchmenReportList.map((w: any) => [
      w.full_name,
      w.employee_id,
      w.phone,
      w.status?.toUpperCase() || 'ACTIVE',
      w.joining_date ? new Date(w.joining_date).toLocaleDateString('en-IN') : '',
      w.active_assignments ?? 0,
      w.address || '',
    ]);
    downloadCSV([headers, ...rows], `watchmen-report-${new Date().toISOString().split('T')[0]}.csv`);
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

  function printCleanReport() {
    const reportElement = document.getElementById('printable-society-report');
    if (!reportElement) {
      toast.error('Please select a society to load the report first');
      return;
    }

    const selSociety = calendarData?.society?.name || societies?.find(s => s.id === societyId)?.name || 'Society';
    const monthName = new Date(year, month - 1).toLocaleString('en-IN', { month: 'long' });

    // Remove any previous print frame
    const existingFrame = document.getElementById('clean-report-print-frame');
    if (existingFrame) existingFrame.remove();

    const iframe = document.createElement('iframe');
    iframe.id = 'clean-report-print-frame';
    iframe.style.position = 'fixed';
    iframe.style.right = '0';
    iframe.style.bottom = '0';
    iframe.style.width = '0';
    iframe.style.height = '0';
    iframe.style.border = '0';
    iframe.style.visibility = 'hidden';
    document.body.appendChild(iframe);

    const doc = iframe.contentWindow?.document;
    if (!doc) {
      window.print();
      return;
    }

    // Clone element and strip no-print buttons
    const clone = reportElement.cloneNode(true) as HTMLElement;
    clone.querySelectorAll('.no-print, button').forEach(el => el.remove());

    doc.open();
    doc.write(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>${selSociety} - Attendance Audit Report - ${monthName} ${year}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap" rel="stylesheet">
  <script src="https://cdn.tailwindcss.com"></script>
  <style>
    @page {
      size: A4 portrait;
      margin: 8mm 10mm;
    }
    *, *:before, *:after {
      box-sizing: border-box;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
      color-adjust: exact !important;
    }
    html, body {
      margin: 0 !important;
      padding: 0 !important;
      background: #ffffff !important;
      color: #0f172a !important;
      font-family: 'Inter', system-ui, -apple-system, sans-serif !important;
      font-size: 11px;
      line-height: 1.35;
    }
    .print-avoid-break {
      break-inside: avoid !important;
      page-break-inside: avoid !important;
    }
    .no-print, button {
      display: none !important;
    }
  </style>
</head>
<body class="bg-white text-slate-900 p-0">
  <div style="width: 100%; max-width: 100%;">
    ${clone.innerHTML}
  </div>
</body>
</html>`);
    doc.close();

    setTimeout(() => {
      try {
        iframe.contentWindow?.focus();
        iframe.contentWindow?.print();
      } catch (err) {
        window.print();
      }
    }, 450);
  }

  const tabs: { id: ReportTab; label: string; icon: React.ElementType }[] = [
    { id: 'daily', label: 'Daily Attendance', icon: Calendar },
    { id: 'monthly', label: 'Monthly & Society Reports', icon: BarChart3 },
    { id: 'watchmen', label: 'Watchmen Report', icon: Users },
    { id: 'journey', label: 'Watchman Journey', icon: Route },
    { id: 'suspicious', label: 'Suspicious Records', icon: AlertTriangle },
  ];

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="section-header print:hidden">
        <div>
          <h1 className="section-title">Reports</h1>
          <p className="text-slate-500 text-sm">Attendance analytics, society summaries and watchmen roster exports</p>
        </div>
      </div>

      {/* Tab nav */}
      <div className="flex gap-2 border-b border-surface-700 pb-px flex-wrap print:hidden">
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
        <div className="card p-4 print:hidden">
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
            {tab !== 'watchmen' && (
              <select value={societyId} onChange={(e) => setSocietyId(e.target.value)} className="input w-52">
                <option value="">All Societies</option>
                {societies?.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            )}
            {((tab !== 'watchmen' && societyId) || agencyId) && (
              <button onClick={() => { setSocietyId(''); setAgencyId(''); }}
                className="flex items-center gap-1.5 text-xs text-danger-400 hover:text-danger-300 px-3 py-1.5 rounded-lg hover:bg-danger-500/10 transition-colors border border-danger-500/20">
                <X className="w-3.5 h-3.5" /> Clear Filters
              </button>
            )}
            <div className="ml-auto flex items-center gap-2">
              {tab === 'daily' && <button onClick={exportDailyCSV} disabled={!dailyData?.length} className="btn-primary flex items-center gap-2 px-4 py-2 text-sm"><Download className="w-4 h-4" /> Export CSV</button>}
              {tab === 'monthly' && (
                <>
                  <button onClick={() => {
                    if (!societyId) toast.error('Please select a Society to generate the PDF report');
                    else printCleanReport();
                  }} className="bg-brand-600 hover:bg-brand-700 text-white flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all shadow-sm">
                    <Printer className="w-4 h-4" /> Print PDF Report
                  </button>
                  <button onClick={exportMonthlyCSV} disabled={!monthlyData?.length} className="btn-primary flex items-center gap-2 px-4 py-2 text-sm"><Download className="w-4 h-4" /> Export CSV</button>
                </>
              )}
              {tab === 'watchmen' && <button onClick={exportWatchmenReportCSV} disabled={!watchmenReportList?.length} className="btn-primary flex items-center gap-2 px-4 py-2 text-sm"><Download className="w-4 h-4" /> Export Watchmen Report</button>}
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

          {/* Fully Custom Executive PDF & Screen Report for Society */}
          {societyId && (
            <div className="space-y-4">
              {/* Screen toolbar */}
              <div className="flex flex-wrap items-center justify-between gap-3 p-4 bg-surface-800/90 border border-surface-700/80 rounded-2xl print:hidden max-w-[1050px] mx-auto shadow-sm">
                <div className="flex items-center gap-3">
                  <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
                  <div>
                    <h3 className="font-bold text-slate-100 text-sm">
                      {societies?.find(s => s.id === societyId)?.name || 'Society'} • Official Attendance Report
                    </h3>
                    <p className="text-xs text-slate-400">
                      Audit Period: {new Date(year, month - 1).toLocaleString('en-IN', { month: 'long', year: 'numeric' })}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={printCleanReport}
                    className="bg-brand-600 hover:bg-brand-500 active:scale-95 text-white px-4 py-2 rounded-xl text-xs font-bold shadow-md shadow-brand-600/30 transition-all flex items-center gap-2"
                  >
                    <Printer className="w-4 h-4" /> Download / Print PDF Report
                  </button>
                  <button
                    onClick={exportMonthlyCSV}
                    className="btn-outline px-3.5 py-2 text-xs rounded-xl flex items-center gap-1.5"
                  >
                    <Download className="w-4 h-4" /> Export CSV
                  </button>
                </div>
              </div>

              {/* Printable Document Sheet */}
              <div
                id="printable-society-report"
                className="printable-document bg-white text-slate-900 rounded-3xl shadow-xl shadow-slate-900/10 overflow-hidden print:shadow-none print:mt-0 print:border-none print:rounded-none max-w-[1050px] mx-auto border border-slate-200 transition-all"
                style={{ fontFamily: 'Inter, sans-serif' }}
              >
                {calendarLoading ? (
                  <div className="p-16 text-center space-y-4">
                    <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto" />
                    <p className="text-slate-600 font-semibold animate-pulse">Compiling Executive Attendance Report...</p>
                  </div>
                ) : calendarData ? (() => {
                  const selSociety = calendarData.society?.name || societies?.find(s => s.id === societyId)?.name || 'Society';
                  const selAgency = calendarData.society?.agency?.name || (isSuperAdmin ? agencies?.find(a => a.id === agencyId)?.name : user?.agencyName) || user?.agencyName || 'Alert Space Security';
                  const selAgencyPhone = calendarData.society?.agency?.phone || '+91 98220 19900';
                  const selAgencyEmail = calendarData.society?.agency?.email || 'alertspace@gmail.com';
                  const selSocietyAddress = calendarData.society?.address || 'Pune, Maharashtra';
                  
                  // Today context
                  const today = new Date();
                  const isCurrentMonth = today.getFullYear() === calendarData.year && (today.getMonth() + 1) === calendarData.month;
                  const currentDay = today.getDate();
                  
                  // Attendance Calculations
                  let totalPresentScans = 0;
                  let totalLate = 0;
                  let absentDays = 0;
                  
                  monthlyData?.forEach(m => {
                    totalPresentScans += m.days_present;
                    totalLate += m.days_late;
                    absentDays += m.days_absent;
                  });

                  if (totalPresentScans === 0 && totalLate === 0 && calendarData.watchmen?.length > 0) {
                    calendarData.watchmen.forEach(w => {
                      totalPresentScans += w.days_attended;
                    });
                  }

                  const expectedDays = isCurrentMonth ? currentDay : calendarData.daysInMonth;
                  const totalPossibleSlots = (calendarData.watchmen.length || 1) * expectedDays;
                  const totalAttended = totalPresentScans + totalLate;
                  const coverageRate = totalPossibleSlots > 0 
                    ? Math.min(100, Math.round((totalAttended / totalPossibleSlots) * 100))
                    : 96;

                  return (
                    <div className="flex flex-col relative">
                      {/* Top Accent Gradient Bar */}
                      <div className="h-2.5 w-full bg-gradient-to-r from-blue-600 via-indigo-600 to-sky-500 print:h-2" />

                      {/* Top Branding Section */}
                      <div className="flex flex-wrap justify-between items-start gap-6 p-6 sm:p-8 bg-slate-50/80 border-b border-slate-200">
                        <div className="flex items-start gap-4">
                          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-blue-600 to-indigo-700 text-white flex items-center justify-center shadow-md shadow-blue-600/20 shrink-0">
                            <Building2 className="w-7 h-7" />
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <h1 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight leading-tight">
                                {selSociety}
                              </h1>
                              <span className="hidden sm:inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                                <ShieldCheck className="w-3 h-3 text-emerald-600" /> Active Property
                              </span>
                            </div>
                            <p className="text-slate-500 font-medium text-xs sm:text-sm flex items-center gap-1.5 mt-1.5">
                              <MapPin className="w-3.5 h-3.5 text-blue-600 shrink-0" /> {selSocietyAddress} • Verified Geofence Zone
                            </p>
                          </div>
                        </div>

                        <div className="flex flex-col sm:items-end gap-3 ml-auto">
                          <div className="flex items-center gap-2 print:hidden no-print">
                            <button
                              onClick={printCleanReport}
                              className="bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white px-4 py-2 rounded-xl text-xs font-bold shadow-md shadow-indigo-600/20 transition-all flex items-center gap-2 hover:scale-[1.02] active:scale-95"
                            >
                              <Printer className="w-4 h-4" /> Save as PDF / Print
                            </button>
                          </div>
                          <div className="text-left sm:text-right">
                            <p className="text-[10px] font-black uppercase tracking-wider text-indigo-600">Managing Security Agency</p>
                            <h2 className="text-base sm:text-lg font-black text-slate-900">{selAgency}</h2>
                            <p className="text-slate-500 text-xs">24×7 Guard Oversight • GPS & Biometric Authenticated</p>
                            <p className="text-slate-400 text-[11px] font-mono mt-0.5">{selAgencyPhone} • {selAgencyEmail}</p>
                          </div>
                        </div>
                      </div>

                      {/* Metadata Strip & High-Impact KPI Cards */}
                      <div className="bg-white p-6 sm:p-8 border-b border-slate-200 space-y-6">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <div className="flex items-center gap-2">
                            <div className="w-8 h-8 rounded-lg bg-blue-100/80 text-blue-700 flex items-center justify-center font-bold">
                              <Calendar className="w-4 h-4" />
                            </div>
                            <div>
                              <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Audit Period</span>
                              <h3 className="text-base font-black text-slate-900 leading-tight">
                                {new Date(calendarData.year, calendarData.month - 1).toLocaleString('en-IN', { month: 'long', year: 'numeric' })}
                              </h3>
                            </div>
                          </div>

                          <span className="text-xs text-slate-500 font-medium bg-slate-100 px-3 py-1 rounded-full border border-slate-200">
                            Report ID: SEC-{calendarData.year}{String(calendarData.month).padStart(2, '0')}-{societyId.slice(-4).toUpperCase()}
                          </span>
                        </div>

                        {/* 4 Light KPI Cards */}
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
                          <div className="p-4 rounded-2xl bg-sky-50/80 border border-sky-200/80 flex flex-col justify-between">
                            <div className="flex items-center justify-between text-sky-700 mb-2">
                              <span className="text-[11px] font-bold uppercase tracking-wider text-sky-800">Total Watchmen</span>
                              <Users className="w-4 h-4 text-sky-600" />
                            </div>
                            <p className="text-2xl sm:text-3xl font-black text-slate-900">{calendarData.watchmen.length}</p>
                            <span className="text-[10px] text-sky-700 font-semibold mt-1">Dedicated On-site Roster</span>
                          </div>

                          <div className="p-4 rounded-2xl bg-indigo-50/80 border border-indigo-200/80 flex flex-col justify-between">
                            <div className="flex items-center justify-between text-indigo-700 mb-2">
                              <span className="text-[11px] font-bold uppercase tracking-wider text-indigo-800">Monitored Wings</span>
                              <Layers className="w-4 h-4 text-indigo-600" />
                            </div>
                            <p className="text-2xl sm:text-3xl font-black text-slate-900">{calendarData.wings.length}</p>
                            <span className="text-[10px] text-indigo-700 font-semibold mt-1">Physical Checkpoints</span>
                          </div>

                          <div className="p-4 rounded-2xl bg-purple-50/80 border border-purple-200/80 flex flex-col justify-between">
                            <div className="flex items-center justify-between text-purple-700 mb-2">
                              <span className="text-[11px] font-bold uppercase tracking-wider text-purple-800">Secured Gates</span>
                              <DoorOpen className="w-4 h-4 text-purple-600" />
                            </div>
                            <p className="text-2xl sm:text-3xl font-black text-slate-900">{calendarData.gates.length}</p>
                            <span className="text-[10px] text-purple-700 font-semibold mt-1">Access Control Gates</span>
                          </div>

                          <div className="p-4 rounded-2xl bg-emerald-50/80 border border-emerald-200/80 flex flex-col justify-between">
                            <div className="flex items-center justify-between text-emerald-700 mb-2">
                              <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-800">Coverage Rate</span>
                              <ShieldCheck className="w-4 h-4 text-emerald-600" />
                            </div>
                            <p className="text-2xl sm:text-3xl font-black text-slate-900">{coverageRate}%</p>
                            <span className="text-[10px] text-emerald-700 font-semibold mt-1">Verified Duty Compliance</span>
                          </div>
                        </div>
                      </div>

                      <div className="p-6 sm:p-8 space-y-8">
                        {/* Watchman Roster Table */}
                        <div className="border border-slate-200 rounded-2xl overflow-hidden shadow-xs print-avoid-break">
                          <div className="bg-slate-50 px-5 py-3.5 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2">
                            <div className="flex items-center gap-2">
                              <User className="w-4 h-4 text-blue-600" />
                              <h3 className="font-extrabold text-slate-900 text-base">Watchman Attendance Roster</h3>
                            </div>
                            <span className="text-xs text-slate-500 font-medium bg-white px-2.5 py-1 rounded-md border border-slate-200">
                              Present Days = Total verified QR scans at society
                            </span>
                          </div>

                          <div className="overflow-x-auto">
                            <table className="w-full text-xs text-left">
                              <thead className="bg-slate-100/80 text-slate-600 font-bold uppercase tracking-wider text-[10px] border-b border-slate-200">
                                <tr>
                                  <th className="px-4 py-3 w-12 text-center">#</th>
                                  <th className="px-4 py-3">Guard ID</th>
                                  <th className="px-4 py-3">Name</th>
                                  <th className="px-4 py-3">Duty Post</th>
                                  <th className="px-4 py-3">Phone</th>
                                  <th className="px-4 py-3">Assigned Shift</th>
                                  <th className="px-4 py-3 text-center">Present Days</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
                                {calendarData.watchmen.map((w, i) => (
                                  <tr key={w.watchman_id} className={i % 2 === 0 ? 'bg-white' : 'bg-slate-50/40 hover:bg-blue-50/30'}>
                                    <td className="px-4 py-2.5 text-center text-slate-400 font-semibold">{i + 1}</td>
                                    <td className="px-4 py-2.5">
                                      <span className="font-mono font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded border border-blue-100">
                                        {w.employee_id}
                                      </span>
                                    </td>
                                    <td className="px-4 py-2.5 font-bold text-slate-900 flex items-center gap-2">
                                      <div className="w-6 h-6 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center font-bold text-[10px] shrink-0">
                                        {w.watchman_name.charAt(0)}
                                      </div>
                                      {w.watchman_name}
                                    </td>
                                    <td className="px-4 py-2.5">
                                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                        w.wings.length > 0 
                                          ? 'bg-blue-50 text-blue-700 border border-blue-200' 
                                          : 'bg-purple-50 text-purple-700 border border-purple-200'
                                      }`}>
                                        {w.wings.length > 0 ? 'Wing Guard' : w.gates.length > 0 ? 'Gate Guard' : 'General Patrol'}
                                      </span>
                                    </td>
                                    <td className="px-4 py-2.5 text-slate-600 font-mono text-[11px]">{w.phone || '—'}</td>
                                    <td className="px-4 py-2.5 text-slate-600">{w.shift_name || 'Standard Day'}</td>
                                    <td className="px-4 py-2.5 text-center">
                                      <span className="inline-flex items-center justify-center min-w-[28px] px-2 py-0.5 rounded-md font-black text-sm bg-emerald-50 text-emerald-700 border border-emerald-200">
                                        {w.days_attended}
                                      </span>
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>

                        {/* Calendar Breakdown Renderer */}
                        {(() => {
                          const days = Array.from({ length: calendarData.daysInMonth }, (_, i) => i + 1);
                          const weekDayOf1 = new Date(calendarData.year, calendarData.month - 1, 1).getDay();

                          function PdfCalGrid({ section }: { section: any }) {
                            const cells: (number | null)[] = [...Array(weekDayOf1).fill(null), ...days];
                            while (cells.length % 7 !== 0) cells.push(null);
                            const weeks: (number | null)[][] = [];
                            for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));

                            return (
                              <div className="mt-3">
                                <div className="grid grid-cols-7 gap-1 mb-1.5 text-center">
                                  {['S','M','T','W','T','F','S'].map((d, di) => (
                                    <div key={di} className="text-[10px] font-extrabold text-slate-400">
                                      {d}
                                    </div>
                                  ))}
                                </div>
                                <div className="flex flex-col gap-1">
                                  {weeks.map((week, wi) => (
                                    <div key={wi} className="grid grid-cols-7 gap-1">
                                      {week.map((day, di) => {
                                        if (day === null) {
                                          return <div key={di} className="aspect-square opacity-0" />;
                                        }

                                        const statusVal = section.days[day - 1];
                                        const isPresent = statusVal === 'present' || statusVal === true;
                                        const isLate = statusVal === 'late';
                                        const isUpcoming = isCurrentMonth && day > currentDay;

                                        let cellClass = '';
                                        if (isUpcoming) {
                                          cellClass = 'bg-slate-50 text-slate-300 border border-slate-100 font-normal';
                                        } else if (isPresent) {
                                          cellClass = 'bg-emerald-500 text-white font-bold shadow-xs';
                                        } else if (isLate) {
                                          cellClass = 'bg-amber-400 text-slate-950 font-bold shadow-xs';
                                        } else {
                                          cellClass = 'bg-rose-50 text-rose-500 border border-rose-100 font-medium';
                                        }

                                        return (
                                          <div
                                            key={di}
                                            className={`aspect-square rounded-md flex items-center justify-center text-[11px] transition-all select-none ${cellClass}`}
                                            title={`Day ${day}: ${isUpcoming ? 'Upcoming' : isPresent ? 'Present' : isLate ? 'Late' : 'No Check-in'}`}
                                          >
                                            {day}
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
                            <div className="space-y-8">
                              {/* Wing Breakdown */}
                              {calendarData.wings.length > 0 && (
                                <div className="p-5 sm:p-6 bg-slate-50/70 border border-slate-200/80 rounded-2xl print-avoid-break">
                                  <div className="flex flex-wrap items-center justify-between gap-3 mb-5 pb-3 border-b border-slate-200">
                                    <div className="flex items-center gap-2">
                                      <div className="w-8 h-8 rounded-lg bg-blue-100 text-blue-700 flex items-center justify-center">
                                        <Building2 className="w-4 h-4" />
                                      </div>
                                      <div>
                                        <h3 className="font-black text-slate-900 text-base">Wing Attendance Breakdown (Wing Wise)</h3>
                                        <p className="text-xs text-slate-500 font-medium">Daily verified physical presence per wing</p>
                                      </div>
                                    </div>
                                    <div className="flex flex-wrap items-center gap-3 text-[11px] font-bold text-slate-600 bg-white px-3 py-1.5 rounded-xl border border-slate-200 shadow-xs">
                                      <span className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 rounded-full bg-emerald-500" /> Present</span>
                                      <span className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 rounded-full bg-amber-400" /> Late</span>
                                      <span className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 rounded-full bg-rose-400" /> Off / No Watchman</span>
                                      {isCurrentMonth && <span className="flex items-center gap-1.5 text-slate-400"><div className="w-2.5 h-2.5 rounded-full bg-slate-200" /> Upcoming</span>}
                                    </div>
                                  </div>

                                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                                    {calendarData.wings.map((w: any) => {
                                      const primaryWM = calendarData.watchmen.find(wm => wm.wings.includes(w.name));
                                      const attendedCount = w.days.filter((d: any) => d === 'present' || d === 'late' || d === true).length;
                                      const totalDaysEvaluated = isCurrentMonth ? currentDay : calendarData.daysInMonth;
                                      const coveragePct = totalDaysEvaluated > 0 ? Math.round((attendedCount / totalDaysEvaluated) * 100) : 0;

                                      return (
                                        <div key={w.name} className="bg-white border border-slate-200/90 rounded-2xl p-4 shadow-sm hover:shadow transition-shadow print-avoid-break">
                                          <div className="flex items-start justify-between gap-2 pb-2.5 border-b border-slate-100">
                                            <div>
                                              <h4 className="font-black text-slate-900 text-sm">{w.name}</h4>
                                              <p className="text-[11px] text-slate-500 font-medium truncate mt-0.5">
                                                Guard: <span className="font-bold text-slate-700">{primaryWM?.watchman_name || 'Assigned Guard'}</span>
                                              </p>
                                            </div>
                                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200 shrink-0">
                                              {coveragePct}%
                                            </span>
                                          </div>
                                          <PdfCalGrid section={w} />
                                        </div>
                                      );
                                    })}
                                  </div>
                                </div>
                              )}

                              {/* Gate Breakdown */}
                              {calendarData.gates.length > 0 && (
                                <div className="p-5 sm:p-6 bg-slate-50/70 border border-slate-200/80 rounded-2xl print-avoid-break">
                                  <div className="flex flex-wrap items-center justify-between gap-3 mb-5 pb-3 border-b border-slate-200">
                                    <div className="flex items-center gap-2">
                                      <div className="w-8 h-8 rounded-lg bg-purple-100 text-purple-700 flex items-center justify-center">
                                        <DoorOpen className="w-4 h-4" />
                                      </div>
                                      <div>
                                        <h3 className="font-black text-slate-900 text-base">Gate Attendance Breakdown (Gate Wise)</h3>
                                        <p className="text-xs text-slate-500 font-medium">Access point security monitoring</p>
                                      </div>
                                    </div>
                                  </div>

                                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                                    {calendarData.gates.map((g: any) => {
                                      const primaryWM = calendarData.watchmen.find(wm => wm.gates.includes(g.name));
                                      const attendedCount = g.days.filter((d: any) => d === 'present' || d === 'late' || d === true).length;
                                      const totalDaysEvaluated = isCurrentMonth ? currentDay : calendarData.daysInMonth;
                                      const coveragePct = totalDaysEvaluated > 0 ? Math.round((attendedCount / totalDaysEvaluated) * 100) : 0;

                                      return (
                                        <div key={g.name} className="bg-white border border-slate-200/90 rounded-2xl p-4 shadow-sm hover:shadow transition-shadow print-avoid-break">
                                          <div className="flex items-start justify-between gap-2 pb-2.5 border-b border-slate-100">
                                            <div>
                                              <h4 className="font-black text-slate-900 text-sm">{g.name}</h4>
                                              <p className="text-[11px] text-slate-500 font-medium truncate mt-0.5">
                                                Guard: <span className="font-bold text-slate-700">{primaryWM?.watchman_name || 'Gate Sentry'}</span>
                                              </p>
                                            </div>
                                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-purple-50 text-purple-700 border border-purple-200 shrink-0">
                                              {coveragePct}%
                                            </span>
                                          </div>
                                          <PdfCalGrid section={g} />
                                        </div>
                                      );
                                    })}
                                  </div>
                                </div>
                              )}
                            </div>
                          );
                        })()}

                        {/* Monthly Overview & Audit Remarks */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 print-avoid-break">
                          <div className="border border-slate-200/90 rounded-2xl p-5 bg-white shadow-xs flex flex-col justify-between">
                            <h3 className="font-extrabold text-slate-900 flex items-center gap-2 mb-4 text-base">
                              <BarChart3 className="w-5 h-5 text-blue-600" /> Monthly Audit Summary
                            </h3>
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
                              <div className="bg-slate-50 rounded-xl p-3 border border-slate-200/70">
                                <Calendar className="w-4 h-4 mx-auto text-slate-400 mb-1" />
                                <p className="text-[10px] font-bold uppercase text-slate-500">Days in Month</p>
                                <p className="text-xl font-black text-slate-900 mt-0.5">{calendarData.daysInMonth}</p>
                              </div>
                              <div className="bg-emerald-50/70 rounded-xl p-3 border border-emerald-200/70">
                                <CheckCircle2 className="w-4 h-4 mx-auto text-emerald-600 mb-1" />
                                <p className="text-[10px] font-bold uppercase text-emerald-800">Present Scans</p>
                                <p className="text-xl font-black text-emerald-700 mt-0.5">{totalPresentScans}</p>
                              </div>
                              <div className="bg-amber-50/70 rounded-xl p-3 border border-amber-200/70">
                                <Clock className="w-4 h-4 mx-auto text-amber-600 mb-1" />
                                <p className="text-[10px] font-bold uppercase text-amber-800">Late Check-ins</p>
                                <p className="text-xl font-black text-amber-700 mt-0.5">{totalLate}</p>
                              </div>
                              <div className="bg-rose-50/70 rounded-xl p-3 border border-rose-200/70">
                                <X className="w-4 h-4 mx-auto text-rose-600 mb-1" />
                                <p className="text-[10px] font-bold uppercase text-rose-800">Off / Missed</p>
                                <p className="text-xl font-black text-rose-700 mt-0.5">{absentDays}</p>
                              </div>
                            </div>
                          </div>

                          <div className="border border-slate-200/90 bg-slate-50/60 rounded-2xl p-5 shadow-xs">
                            <h3 className="font-extrabold text-slate-900 flex items-center gap-2 mb-3 text-base">
                              <ShieldCheck className="w-5 h-5 text-indigo-600" /> Compliance Observations & Notes
                            </h3>
                            <ul className="text-xs text-slate-600 space-y-2 list-none">
                              <li className="flex items-start gap-2">
                                <span className="text-emerald-600 font-bold shrink-0">✓</span>
                                <span><strong>GPS Geofence Validation:</strong> Guard scan locations authenticated within designated perimeter.</span>
                              </li>
                              <li className="flex items-start gap-2">
                                <span className="text-emerald-600 font-bold shrink-0">✓</span>
                                <span><strong>Anti-Proxy Biometrics:</strong> Facial descriptor matching enabled at all shift changeovers.</span>
                              </li>
                              <li className="flex items-start gap-2">
                                <span className="text-emerald-600 font-bold shrink-0">✓</span>
                                <span><strong>Patrol Coverage:</strong> Physical check-ins recorded at both gate sentry and residential wings.</span>
                              </li>
                              <li className="flex items-start gap-2">
                                <span className="text-emerald-600 font-bold shrink-0">✓</span>
                                <span>Official audit document valid for housing society committee management records.</span>
                              </li>
                            </ul>
                          </div>
                        </div>

                        {/* Official Signatures & Verification Stamp */}
                        <div className="flex flex-wrap justify-between items-end gap-6 pt-6 border-t-2 border-slate-200/80 print-avoid-break">
                          <div>
                            <p className="text-xs text-slate-400 font-medium">
                              System Generated on: {new Date().toLocaleString('en-IN', { day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                            </p>
                            <p className="text-[11px] text-slate-400 font-mono mt-0.5">
                              WatchTrack Cloud • Cryptographically Signed Attendance Log
                            </p>
                          </div>

                          <div className="flex items-end gap-10">
                            <div className="text-center">
                              <div className="w-36 border-b-2 border-slate-400 mb-1.5 pb-1 text-slate-600 font-serif italic text-base">
                                {selAgency} Operations
                              </div>
                              <p className="text-[10px] uppercase font-extrabold text-slate-500 tracking-wider">Agency Supervisor</p>
                            </div>

                            <div className="text-center">
                              <div className="w-36 border-b-2 border-slate-400 mb-1.5 pb-1 text-slate-400 text-xs">
                                (Sign & Stamp)
                              </div>
                              <p className="text-[10px] uppercase font-extrabold text-slate-500 tracking-wider">Society Secretary / Chairman</p>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })() : null}
              </div>
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

      {/* Watchmen Roster Report */}
      {tab === 'watchmen' && (
        <div className="space-y-4">
          <div className="table-wrapper">
            <table className="table">
              <thead>
                <tr>
                  <th>Guard Name</th>
                  <th>Employee ID</th>
                  <th>Mobile Number</th>
                  <th>Status</th>
                  <th>Joining Date</th>
                  <th>Active Assignments</th>
                  <th>Address</th>
                </tr>
              </thead>
              <tbody>
                {watchmenReportLoading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <tr key={i}><td colSpan={7}><div className="h-10 bg-surface-700 animate-pulse rounded" /></td></tr>
                  ))
                ) : watchmenReportList?.map((w: any) => (
                  <tr key={w.id || w._id}>
                    <td>
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-full bg-brand-500/20 text-brand-400 font-bold flex items-center justify-center text-xs">
                          {w.full_name?.charAt(0).toUpperCase()}
                        </div>
                        <span className="font-medium text-slate-100">{w.full_name}</span>
                      </div>
                    </td>
                    <td className="text-slate-300 font-mono text-xs">{w.employee_id}</td>
                    <td className="text-slate-300 text-sm">{w.phone}</td>
                    <td>
                      <span className={`badge text-xs ${
                        w.status === 'active' ? 'badge-present' : w.status === 'suspended' ? 'badge-late' : 'badge-absent'
                      }`}>
                        {w.status?.toUpperCase() || 'ACTIVE'}
                      </span>
                    </td>
                    <td className="text-slate-400 text-sm">
                      {w.joining_date ? new Date(w.joining_date).toLocaleDateString('en-IN') : '—'}
                    </td>
                    <td className="text-slate-300 font-semibold">{w.active_assignments ?? 0}</td>
                    <td className="text-slate-400 text-xs max-w-xs truncate">{w.address || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!watchmenReportLoading && (!watchmenReportList || watchmenReportList.length === 0) && (
              <div className="text-center py-12 text-slate-600">
                <Users className="w-10 h-10 mx-auto mb-2 opacity-40" />
                <p className="text-sm">No watchmen records found</p>
              </div>
            )}
          </div>
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