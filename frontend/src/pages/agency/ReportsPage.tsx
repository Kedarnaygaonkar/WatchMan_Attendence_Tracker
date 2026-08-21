import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { BarChart3, Calendar, AlertTriangle, Download } from 'lucide-react';
import api from '../../api/client';

type ReportTab = 'daily' | 'monthly' | 'suspicious';

interface DailyRecord {
  watchman_id: string;
  full_name: string;
  employee_id: string;
  society_name: string;
  shift_name: string;
  final_status: string;
  check_in_time: string | null;
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
  const cls: Record<string,string> = { present:'badge-present', late:'badge-late', absent:'badge-absent', rejected:'badge-absent' };
  return <span className={cls[status] || 'badge'}>{status?.toUpperCase()}</span>;
}

export default function ReportsPage() {
  const [tab, setTab] = useState<ReportTab>('daily');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [year, setYear] = useState(new Date().getFullYear());
  const [month, setMonth] = useState(new Date().getMonth() + 1);

  const { data: dailyData, isLoading: dailyLoading } = useQuery({
    queryKey: ['report-daily', date],
    queryFn: async () => { const {data} = await api.get('/reports/daily', {params:{date}}); return data.data as DailyRecord[]; },
    enabled: tab === 'daily',
  });

  const { data: monthlyData, isLoading: monthlyLoading } = useQuery({
    queryKey: ['report-monthly', year, month],
    queryFn: async () => { const {data} = await api.get('/reports/monthly', {params:{year,month}}); return data.data as MonthlyRecord[]; },
    enabled: tab === 'monthly',
  });

  const { data: suspiciousData } = useQuery({
    queryKey: ['report-suspicious'],
    queryFn: async () => { const {data} = await api.get('/reports/suspicious'); return data.data as SuspiciousRecord[]; },
    enabled: tab === 'suspicious',
  });

  function exportCSV(rows: Record<string,unknown>[], filename: string) {
    if (!rows?.length) return;
    const headers = Object.keys(rows[0]).join(',');
    const csv = [headers, ...rows.map(r => Object.values(r).map(v => `"${v ?? ''}"`).join(','))].join('\n');
    const blob = new Blob([csv], {type:'text/csv'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename; a.click();
  }

  const tabs: {id:ReportTab, label:string, icon:React.ElementType}[] = [
    {id:'daily', label:'Daily Attendance', icon:Calendar},
    {id:'monthly', label:'Monthly Summary', icon:BarChart3},
    {id:'suspicious', label:'Suspicious Records', icon:AlertTriangle},
  ];

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="section-header">
        <div>
          <h1 className="section-title">Reports</h1>
          <p className="text-slate-500 text-sm">Attendance analytics and exports</p>
        </div>
      </div>

      {/* Tab nav */}
      <div className="flex gap-2 border-b border-surface-700 pb-px">
        {tabs.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium rounded-t-lg border-b-2 transition-colors ${
              tab === t.id
                ? 'border-brand-500 text-brand-400 bg-brand-500/10'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}>
            <t.icon className="w-4 h-4" /> {t.label}
          </button>
        ))}
      </div>

      {/* Daily */}
      {tab === 'daily' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <input type="date" value={date} onChange={e=>setDate(e.target.value)} className="input w-44" />
            <button onClick={() => exportCSV(dailyData as unknown as Record<string,unknown>[] || [], `attendance-${date}.csv`)}
              className="btn-outline px-4 py-2 text-sm">
              <Download className="w-4 h-4" /> Export CSV
            </button>
          </div>
          <div className="table-wrapper">
            <table className="table">
              <thead><tr><th>Guard</th><th>Society</th><th>Shift</th><th>Check-in</th><th>Status</th></tr></thead>
              <tbody>
                {dailyLoading ? null : dailyData?.map((r,i) => (
                  <tr key={i}>
                    <td><div><p className="font-medium">{r.full_name}</p><p className="text-xs text-slate-500">{r.employee_id}</p></div></td>
                    <td>{r.society_name}</td>
                    <td>{r.shift_name}</td>
                    <td className="text-slate-400 text-sm">
                      {r.check_in_time
                        ? new Date(r.check_in_time).toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit',hour12:true})
                        : '—'}
                    </td>
                    <td><StatusBadge status={r.final_status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {/* Summary */}
          {dailyData && (
            <div className="grid grid-cols-3 gap-4">
              {[
                { label:'Present', val: dailyData.filter(r=>r.final_status==='present').length, cls:'text-success-400' },
                { label:'Late', val: dailyData.filter(r=>r.final_status==='late').length, cls:'text-warning-400' },
                { label:'Absent', val: dailyData.filter(r=>r.final_status==='absent').length, cls:'text-danger-400' },
              ].map(s => (
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
          <div className="flex items-center gap-3 justify-between flex-wrap">
            <div className="flex gap-3">
              <select className="input w-32" value={month} onChange={e=>setMonth(parseInt(e.target.value))}>
                {Array.from({length:12},(_,i)=>i+1).map(m=>(
                  <option key={m} value={m}>{new Date(2000,m-1).toLocaleString('en-IN',{month:'long'})}</option>
                ))}
              </select>
              <select className="input w-28" value={year} onChange={e=>setYear(parseInt(e.target.value))}>
                {[2024,2025,2026,2027].map(y=><option key={y} value={y}>{y}</option>)}
              </select>
            </div>
            <button onClick={() => exportCSV(monthlyData as unknown as Record<string,unknown>[] || [], `monthly-${year}-${month}.csv`)}
              className="btn-outline px-4 py-2 text-sm">
              <Download className="w-4 h-4" /> Export CSV
            </button>
          </div>
          <div className="table-wrapper">
            <table className="table">
              <thead><tr><th>Guard</th><th>Present</th><th>Late</th><th>Absent</th><th>Suspicious</th><th>Attendance %</th></tr></thead>
              <tbody>
                {monthlyLoading ? null : monthlyData?.map(r => {
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
                            <div className="h-full bg-brand-500 rounded-full transition-all" style={{width:`${pct}%`}} />
                          </div>
                          <span className="text-sm font-medium">{pct}%</span>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
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
                {suspiciousData?.map(r => (
                  <tr key={r.id}>
                    <td><div><p className="font-medium">{r.watchman_name}</p><p className="text-xs text-slate-500">{r.employee_id}</p></div></td>
                    <td>{r.society_name}</td>
                    <td className="text-slate-400 text-sm">{new Date(r.attendance_date).toLocaleDateString('en-IN')}</td>
                    <td>
                      <div className="flex flex-wrap gap-1">
                        {r.gps_flags?.map((f,i) => (
                          <span key={i} className="text-xs bg-warning-500/20 text-warning-400 border border-warning-500/20 px-1.5 py-0.5 rounded-full">{f}</span>
                        ))}
                      </div>
                    </td>
                    <td className="text-slate-400">{r.distance_from_society ? `${Math.round(r.distance_from_society)}m` : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!suspiciousData?.length && (
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
