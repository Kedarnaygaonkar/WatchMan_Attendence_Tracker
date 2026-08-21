import { useQuery } from '@tanstack/react-query';
import {
  Users, Building2, CheckCircle2, AlertCircle, Clock,
  ShieldAlert, RefreshCw, TrendingUp, MapPin
} from 'lucide-react';
import api from '../../api/client';

interface DashboardSummary {
  date: string;
  totalWatchmen: number;
  present: number;
  late: number;
  absent: number;
  suspicious: number;
  totalSocieties: number;
  activeAssignments: number;
}

interface LiveAttendance {
  id: string;
  watchman_name: string;
  employee_id: string;
  society_name: string;
  shift_name: string;
  check_in_time: string;
  status: string;
  verification_status: string;
  distance_from_society: number;
  is_offline_sync: boolean;
  gps_flags: string[];
}

interface MissingAttendance {
  watchman_id: string;
  watchman_name: string;
  employee_id: string;
  watchman_phone: string;
  society_name: string;
  shift_name: string;
  start_time: string;
}

function StatCard({
  label, value, icon: Icon, colorClass, subtext
}: {
  label: string;
  value: number | string;
  icon: React.ElementType;
  colorClass: string;
  subtext?: string;
}) {
  return (
    <div className="stat-card">
      <div className="flex items-start justify-between">
        <div>
          <p className="stat-label">{label}</p>
          <p className="stat-value">{value}</p>
          {subtext && <p className="text-xs text-slate-600 mt-1">{subtext}</p>}
        </div>
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${colorClass}`}>
          <Icon className="w-5 h-5" />
        </div>
      </div>
    </div>
  );
}

function getStatusBadge(status: string) {
  const map: Record<string, string> = {
    present: 'badge-present',
    late: 'badge-late',
    absent: 'badge-absent',
    rejected: 'badge-absent',
    suspicious: 'badge-suspicious',
  };
  return <span className={map[status] || 'badge'}>{status?.toUpperCase()}</span>;
}

function getVerificationBadge(status: string) {
  if (status === 'verified') return <span className="badge-verified"><CheckCircle2 className="w-3 h-3" />Verified</span>;
  if (status === 'warning') return <span className="badge-late"><Clock className="w-3 h-3" />Warning</span>;
  if (status === 'suspicious') return <span className="badge-suspicious"><ShieldAlert className="w-3 h-3" />Suspicious</span>;
  return <span className="badge">{status}</span>;
}

export default function AgencyDashboard() {

  const { data: summaryData, isLoading: summaryLoading, refetch } = useQuery({
    queryKey: ['dashboard-summary'],
    queryFn: async () => {
      const { data } = await api.get('/dashboard/summary');
      return data.data as DashboardSummary;
    },
    refetchInterval: 60 * 1000,
  });

  const { data: liveData } = useQuery({
    queryKey: ['live-attendance'],
    queryFn: async () => {
      const { data } = await api.get('/dashboard/live-attendance');
      return data.data as LiveAttendance[];
    },
    refetchInterval: 30 * 1000,
  });

  const { data: missingData } = useQuery({
    queryKey: ['missing-attendance'],
    queryFn: async () => {
      const { data } = await api.get('/dashboard/missing-attendance');
      return data.data as MissingAttendance[];
    },
    refetchInterval: 60 * 1000,
  });

  const summary = summaryData;

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="section-header">
        <div>
          <h1 className="section-title">Agency Dashboard</h1>
          <p className="text-slate-500 text-sm">
            {new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
          </p>
        </div>
        <button onClick={() => refetch()} className="btn-ghost p-2 rounded-xl">
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>

      {/* Stats Grid */}
      {summaryLoading ? (
        <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="stat-card animate-pulse">
              <div className="h-8 bg-surface-700 rounded mb-2" />
              <div className="h-4 bg-surface-700 rounded w-2/3" />
            </div>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
          <StatCard label="Total Watchmen" value={summary?.totalWatchmen ?? 0}
            icon={Users} colorClass="bg-brand-500/20 text-brand-400" />
          <StatCard label="Present Today" value={summary?.present ?? 0}
            icon={CheckCircle2} colorClass="bg-success-500/20 text-success-400"
            subtext={`${summary ? Math.round((summary.present / Math.max(summary.totalWatchmen, 1)) * 100) : 0}% attendance`} />
          <StatCard label="Late Today" value={summary?.late ?? 0}
            icon={Clock} colorClass="bg-warning-500/20 text-warning-400" />
          <StatCard label="Absent Today" value={summary?.absent ?? 0}
            icon={AlertCircle} colorClass="bg-danger-500/20 text-danger-400" />
          <StatCard label="Societies" value={summary?.totalSocieties ?? 0}
            icon={Building2} colorClass="bg-slate-500/20 text-slate-400" />
          <StatCard label="Active Assignments" value={summary?.activeAssignments ?? 0}
            icon={TrendingUp} colorClass="bg-purple-500/20 text-purple-400" />
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* Live Attendance */}
        <div className="xl:col-span-2 card p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-bold text-slate-100 flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-success-400 animate-pulse-slow" />
              Live Attendance — Today
            </h2>
            <span className="text-xs text-slate-500">{liveData?.length ?? 0} records</span>
          </div>

          {!liveData || liveData.length === 0 ? (
            <div className="text-center py-10 text-slate-600">
              <ClipboardList className="w-10 h-10 mx-auto mb-2 opacity-40" />
              <p className="text-sm">No attendance records yet today</p>
            </div>
          ) : (
            <div className="table-wrapper">
              <table className="table">
                <thead>
                  <tr>
                    <th>Watchman</th>
                    <th>Society</th>
                    <th>Time</th>
                    <th>Status</th>
                    <th>GPS</th>
                  </tr>
                </thead>
                <tbody>
                  {liveData.slice(0, 15).map((row) => (
                    <tr key={row.id}>
                      <td>
                        <div>
                          <p className="font-medium">{row.watchman_name}</p>
                          <p className="text-xs text-slate-500">{row.employee_id}</p>
                        </div>
                      </td>
                      <td>
                        <div>
                          <p>{row.society_name}</p>
                          <p className="text-xs text-slate-500">{row.shift_name}</p>
                        </div>
                      </td>
                      <td className="text-slate-400 text-sm whitespace-nowrap">
                        {new Date(row.check_in_time).toLocaleTimeString('en-IN', {
                          hour: '2-digit', minute: '2-digit', hour12: true
                        })}
                        {row.is_offline_sync && (
                          <span className="ml-1 text-xs text-warning-400">offline</span>
                        )}
                      </td>
                      <td>{getStatusBadge(row.status)}</td>
                      <td>
                        <div className="flex flex-col gap-1">
                          {getVerificationBadge(row.verification_status)}
                          {row.distance_from_society && (
                            <span className="text-xs text-slate-600 flex items-center gap-1">
                              <MapPin className="w-3 h-3" />
                              {Math.round(row.distance_from_society)}m
                            </span>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Missing / Absent */}
        <div className="card p-5">
          <h2 className="font-bold text-slate-100 mb-4 flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-danger-400" />
            Missing Attendance
          </h2>

          {!missingData || missingData.length === 0 ? (
            <div className="text-center py-10 text-slate-600">
              <CheckCircle2 className="w-10 h-10 mx-auto mb-2 opacity-40 text-success-400" />
              <p className="text-sm text-success-600">All guards have marked attendance!</p>
            </div>
          ) : (
            <div className="space-y-3">
              {missingData.map((row) => (
                <div key={row.watchman_id} className="p-3 rounded-xl bg-danger-500/5 border border-danger-500/20">
                  <p className="font-semibold text-slate-200 text-sm">{row.watchman_name}</p>
                  <p className="text-xs text-slate-500">{row.employee_id} • {row.watchman_phone}</p>
                  <div className="flex items-center gap-2 mt-1.5">
                    <span className="text-xs text-slate-400">{row.society_name}</span>
                    <span className="text-slate-600">•</span>
                    <span className="text-xs text-slate-400">{row.shift_name}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// Needed for icon inside JSX
function ClipboardList({ className }: { className?: string }) {
  return <svg className={className} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect width="8" height="4" x="8" y="2" rx="1" ry="1"/></svg>;
}
