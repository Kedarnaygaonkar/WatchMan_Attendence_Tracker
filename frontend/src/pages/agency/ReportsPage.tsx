import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { BarChart3, Calendar, AlertTriangle, Download, Filter, X } from 'lucide-react';
import api from '../../api/client';
import { useAuthStore } from '../../stores/authStore';
import toast from 'react-hot-toast';

type ReportTab = 'daily' | 'monthly' | 'suspicious';

interface Society {
  _id: string;
  name: string;
}

interface Agency {
  _id: string;
  name: string;
}

interface DailyRecord {
  watchman_id: string;
  full_name: string;
  employee_id: string;
  society_name: string;
  shift_name: string;
  final_status: string;
  check_in_time: string | null;
  check_out_time: string | null;
  duration_minutes: number | null;
  verification_status: string | null;
  is_offline_sync: boolean;
}

interface MonthlyRecord {
  watchman_id: string;
  full_name: string;
  employee_id: string;
  days_present: number;
  days_late: number;
  days_absent: number;
  suspicious_count: number;
  total_records: number;
}

interface SuspiciousRecord {
  id: string;
  watchman_name: string;
  employee_id: string;
  society_name: string;
  attendance_date: string;
  check_in_time: string;
  verification_status: string;
  gps_flags: string[];
  distance_from_society: number;
}

function StatusBadge({ status }: { status: string }) {
  const cls: Record<string, string> = {
    present: 'badge-present',
    late: 'badge-late',
    absent: 'badge-absent',
    rejected: 'badge-absent',
  };
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

  // Fetch societies for filtering
  const { data: societies } = useQuery({
    queryKey: ['societies-filter', agencyId],
    queryFn: async () => {
      const params: any = { active: 'true' };
      if (isSuperAdmin && agencyId) params.agency_id = agencyId;
      const { data } = await api.get('/societies', { params });
      return data.data as Society[];
    },
  });

  // Fetch agencies for super_admin filter
  const { data: agencies } = useQuery({
    queryKey: ['agencies-filter'],
    queryFn: async () => {
      try {
        const { data } = await api.get('/agencies');
        return data.data as Agency[];
      } catch {
        return [] as Agency[];
      }
    },
    enabled: isSuperAdmin,
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

  function exportDailyCSV() {
    if (!dailyData?.length) {
      toast.error('No daily data to export');
      return;
    }
    const headers = [
      'Guard Name',
      'Employee ID',
      'Society',
      'Shift',
      'Date',
      'Check-In',
      'Check-Out',
      'Duration (min)',
      'Status',
      'Verification Status',
      'Offline Sync',
    ];
    const rows = dailyData.map((r) => [
      r.full_name,
      r.employee_id,
      r.society_name,
      r.shift_name,
      date,
      r.check_in_time ? new Date(r.check_in_time).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true }) : '',
      r.check_out_time ? new Date(r.check_out_time).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true }) : '',
      r.duration_minutes ?? '',
      r.final_status,
      r.verification_status || '',
      r.is_offline_sync ? 'Yes' : 'No',
    ]);
    downloadCSV([headers, ...rows], `daily-attendance-${date}.csv`);
  }

  function exportMonthlyCSV() {
    if (!monthlyData?.length) {
      toast.error('No monthly data to export');
      return;
    }
    const headers = ['Guard Name', 'Employee ID', 'Present', 'Late', 'Absent', 'Suspicious Count', 'Total', 'Attendance %'];
    const rows = monthlyData.map((r) => {
      const total = r.days_present + r.days_late + r.days_absent;
      const pct = total ? Math.round(((r.days_present + r.days_late) / total) * 100) : 0;
      return [r.full_name, r.employee_id, r.days_present, r.days_late, r.days_absent, r.suspicious_count, total, `${pct}%`];
    });
    downloadCSV([headers, ...rows], `monthly-attendance-${year}-${month}.csv`);
  }

  function exportSuspiciousCSV() {
    if (!suspiciousData?.length) {
      toast.error('No suspicious data to export');
      return;
    }
    const headers = ['Guard Name', 'Employee ID', 'Society', 'Date', 'Flags', 'Distance (m)'];
    const rows = suspiciousData.map((r) => [
      r.watchman_name,
      r.employee_id,
      r.society_name,
      new Date(r.attendance_date).toLocaleDateString('en-IN'),
      (r.gps_flags || []).join(' | '),
      r.distance_from_society ? Math.round(r.distance_from_society) : '',
    ]);
    downloadCSV([headers, ...rows], `suspicious-records.csv`);
  }

  function downloadCSV(rows: (string | number)[][], filename: string) {
    const csv = rows.map((r) => r.map((v) => `"${String(v ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`Exported ${filename}`);
  }

  const tabs: { id: ReportTab; label: string; icon: React.ElementType }[] = [
    { id: 'daily', label: 'Daily Attendance', icon: Calendar },
    { id: 'monthly', label: 'Monthly Summary', icon: BarChart3 },
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
      <div className="flex gap-2 border-b border-surface-700 pb-px">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium rounded-t-lg border-b-2 transition-colors ${
              tab === t.id
                ? 'border-brand-500 text-brand-400 bg-brand-500/10'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <t.icon className="w-4 h-4" /> {t.label}
          </button>
        ))}
      </div>

      {/* Common Filters Bar */}
      <div className="card p-4">
        <div className="flex items-center gap-2 mb-3">
          <Filter className="w-4 h-4 text-brand-400" />
          <span className="text-sm font-semibold text-slate-300">Report Filters</span>
        </div>
        <div className="flex gap-3 flex-wrap items-center">
          {tab === 'daily' && (
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="input w-44"
            />
          )}

          {tab === 'monthly' && (
            <div className="flex gap-2">
              <select className="input w-36" value={month} onChange={(e) => setMonth(parseInt(e.target.value))}>
                {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                  <option key={m} value={m}>
                    {new Date(2000, m - 1).toLocaleString('en-IN', { month: 'long' })}
                  </option>
                ))}
              </select>
              <select className="input w-28" value={year} onChange={(e) => setYear(parseInt(e.target.value))}>
                {[2024, 2025, 2026, 2027].map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Agency Filter (super_admin only) */}
          {isSuperAdmin && (
            <select
              value={agencyId}
              onChange={(e) => {
                setAgencyId(e.target.value);
                setSocietyId('');
              }}
              className="input w-52"
            >
              <option value="">All Agencies</option>
              {agencies?.map((a) => (
                <option key={a._id} value={a._id}>
                  {a.name}
                </option>
              ))}
            </select>
          )}

          {/* Society Filter */}
          <select
            value={societyId}
            onChange={(e) => setSocietyId(e.target.value)}
            className="input w-52"
          >
            <option value="">All Societies</option>
            {societies?.map((s) => (
              <option key={s._id} value={s._id}>
                {s.name}
              </option>
            ))}
          </select>

          {/* Clear Filters */}
          {(societyId || agencyId) && (
            <button
              onClick={() => {
                setSocietyId('');
                setAgencyId('');
              }}
              className="flex items-center gap-1.5 text-xs text-danger-400 hover:text-danger-300 px-3 py-1.5 rounded-lg hover:bg-danger-500/10 transition-colors border border-danger-500/20"
            >
              <X className="w-3.5 h-3.5" /> Clear Filters
            </button>
          )}

          <div className="ml-auto">
            {tab === 'daily' && (
              <button onClick={exportDailyCSV} disabled={!dailyData?.length} className="btn-primary flex items-center gap-2 px-4 py-2 text-sm">
                <Download className="w-4 h-4" /> Export CSV
              </button>
            )}
            {tab === 'monthly' && (
              <button onClick={exportMonthlyCSV} disabled={!monthlyData?.length} className="btn-primary flex items-center gap-2 px-4 py-2 text-sm">
                <Download className="w-4 h-4" /> Export CSV
              </button>
            )}
            {tab === 'suspicious' && (
              <button onClick={exportSuspiciousCSV} disabled={!suspiciousData?.length} className="btn-primary flex items-center gap-2 px-4 py-2 text-sm">
                <Download className="w-4 h-4" /> Export CSV
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Daily */}
      {tab === 'daily' && (
        <div className="space-y-4">
          <div className="table-wrapper">
            <table className="table">
              <thead>
                <tr>
                  <th>Guard</th>
                  <th>Society</th>
                  <th>Shift</th>
                  <th>Check-in</th>
                  <th>Check-out</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {dailyLoading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <tr key={i}>
                      <td colSpan={6}>
                        <div className="h-10 bg-surface-700 animate-pulse rounded" />
                      </td>
                    </tr>
                  ))
                ) : dailyData?.map((r, i) => (
                  <tr key={i}>
                    <td>
                      <div>
                        <p className="font-medium">{r.full_name}</p>
                        <p className="text-xs text-slate-500">{r.employee_id}</p>
                      </div>
                    </td>
                    <td>{r.society_name}</td>
                    <td>{r.shift_name}</td>
                    <td className="text-slate-300 text-sm whitespace-nowrap">
                      {r.check_in_time
                        ? new Date(r.check_in_time).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true })
                        : '—'}
                    </td>
                    <td className="text-slate-300 text-sm whitespace-nowrap">
                      {r.check_out_time ? (
                        <div>
                          <span>
                            {new Date(r.check_out_time).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true })}
                          </span>
                          {r.duration_minutes != null && (
                            <span className="text-xs text-slate-500 block">
                              {Math.floor(r.duration_minutes / 60)}h {r.duration_minutes % 60}m
                            </span>
                          )}
                        </div>
                      ) : (
                        <span className="text-slate-600 text-xs">—</span>
                      )}
                    </td>
                    <td>
                      <StatusBadge status={r.final_status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!dailyLoading && (!dailyData || dailyData.length === 0) && (
              <div className="text-center py-12 text-slate-600">
                <Calendar className="w-10 h-10 mx-auto mb-2 opacity-40" />
                <p className="text-sm">No records found for the selected date / filters</p>
              </div>
            )}
          </div>

          {/* Summary */}
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
              <thead>
                <tr>
                  <th>Guard</th>
                  <th>Present</th>
                  <th>Late</th>
                  <th>Absent</th>
                  <th>Suspicious</th>
                  <th>Attendance %</th>
                </tr>
              </thead>
              <tbody>
                {monthlyLoading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <tr key={i}>
                      <td colSpan={6}>
                        <div className="h-10 bg-surface-700 animate-pulse rounded" />
                      </td>
                    </tr>
                  ))
                ) : monthlyData?.map((r) => {
                  const total = r.days_present + r.days_late + r.days_absent;
                  const pct = total ? Math.round(((r.days_present + r.days_late) / total) * 100) : 0;
                  return (
                    <tr key={r.watchman_id}>
                      <td>
                        <div>
                          <p className="font-medium">{r.full_name}</p>
                          <p className="text-xs text-slate-500">{r.employee_id}</p>
                        </div>
                      </td>
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
              <div className="text-center py-12 text-slate-600">
                <BarChart3 className="w-10 h-10 mx-auto mb-2 opacity-40" />
                <p className="text-sm">No monthly summary found</p>
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
              <thead>
                <tr>
                  <th>Guard</th>
                  <th>Society</th>
                  <th>Date</th>
                  <th>Flags</th>
                  <th>Distance</th>
                </tr>
              </thead>
              <tbody>
                {suspiciousLoading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <tr key={i}>
                      <td colSpan={5}>
                        <div className="h-10 bg-surface-700 animate-pulse rounded" />
                      </td>
                    </tr>
                  ))
                ) : suspiciousData?.map((r) => (
                  <tr key={r.id}>
                    <td>
                      <div>
                        <p className="font-medium">{r.watchman_name}</p>
                        <p className="text-xs text-slate-500">{r.employee_id}</p>
                      </div>
                    </td>
                    <td>{r.society_name}</td>
                    <td className="text-slate-400 text-sm">{new Date(r.attendance_date).toLocaleDateString('en-IN')}</td>
                    <td>
                      <div className="flex flex-wrap gap-1">
                        {r.gps_flags?.map((f, i) => (
                          <span key={i} className="text-xs bg-warning-500/20 text-warning-400 border border-warning-500/20 px-1.5 py-0.5 rounded-full">
                            {f}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="text-slate-400">{r.distance_from_society ? `${Math.round(r.distance_from_society)}m` : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!suspiciousLoading && (!suspiciousData || suspiciousData.length === 0) && (
              <div className="text-center py-12 text-slate-600">
                <AlertTriangle className="w-10 h-10 mx-auto mb-2 opacity-40" />
                <p className="text-sm">No suspicious records in last 30 days</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
