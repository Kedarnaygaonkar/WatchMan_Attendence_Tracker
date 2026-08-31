import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Bike, Download, Filter, Clock, LogIn, LogOut, Search, QrCode, X } from 'lucide-react';
import QRCode from 'qrcode';
import api from '../../api/client';
import { useAuthStore } from '../../stores/authStore';
import toast from 'react-hot-toast';

interface DeliveryVisit {
  _id: string;
  visitor_name: string;
  visitor_phone: string;
  vehicle_number?: string;
  delivery_company: string;
  check_in_time: string;
  check_out_time?: string;
  duration_minutes?: number;
  society_id: { name: string; address: string } | string;
  gate_id?: { name: string } | string;
}

interface Society { _id: string; name: string }
interface Gate { id: string; name: string; qr_token: string; society_id: any }

const COMPANY_COLORS: Record<string, string> = {
  Zomato: '#e23744',
  Swiggy: '#fc8019',
  Amazon: '#ff9900',
  Flipkart: '#2874f0',
  DTDC: '#9c3930',
  BlueDart: '#003087',
  FedEx: '#4d148c',
  Meesho: '#9e0082',
  Other: '#64748b',
};

const FRONTEND_URL = window.location.origin;

function CompanyBadge({ company }: { company: string }) {
  return (
    <span
      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold text-white"
      style={{ backgroundColor: COMPANY_COLORS[company] || '#64748b' }}
    >
      {company}
    </span>
  );
}

export default function DeliveryPage() {
  const { user } = useAuthStore();
  const isSuperAdmin = user?.role === 'super_admin';

  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [societyId, setSocietyId] = useState('');
  const [company, setCompany] = useState('');
  const [search, setSearch] = useState('');
  const [qrGate, setQrGate] = useState<Gate | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState('');

  // Fetch societies for filter
  const { data: societies = [] } = useQuery<Society[]>({
    queryKey: ['societies-filter'],
    queryFn: async () => { const { data } = await api.get('/societies', { params: { active: true } }); return data.data; },
  });

  // Fetch gates (for QR generation)
  const { data: gates = [] } = useQuery<Gate[]>({
    queryKey: ['gates'],
    queryFn: async () => { const { data } = await api.get('/gates'); return data.data; },
  });

  // Fetch delivery visits
  const { data: visitsData, isLoading } = useQuery({
    queryKey: ['delivery-visits', date, societyId, company],
    queryFn: async () => {
      const params: any = { date };
      if (societyId) params.society_id = societyId;
      if (company) params.company = company;
      const { data } = await api.get('/delivery/visits', { params });
      return data;
    },
  });

  // Fetch daily stats
  const { data: statsData } = useQuery({
    queryKey: ['delivery-stats', date],
    queryFn: async () => { const { data } = await api.get('/delivery/stats', { params: { date } }); return data.data; },
  });

  const visits: DeliveryVisit[] = visitsData?.data || [];

  // Client-side search filter
  const filtered = visits.filter(v => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      v.visitor_name.toLowerCase().includes(q) ||
      v.visitor_phone.includes(q) ||
      (v.vehicle_number?.toLowerCase().includes(q)) ||
      v.delivery_company.toLowerCase().includes(q)
    );
  });

  async function openQrModal(gate: Gate) {
    setQrGate(gate);
    const scanUrl = `${FRONTEND_URL}/scan/${gate.qr_token}`;
    const dataUrl = await QRCode.toDataURL(scanUrl, { width: 300, margin: 2, color: { dark: '#0f172a', light: '#ffffff' } });
    setQrDataUrl(dataUrl);
  }

  function downloadQR(gate: Gate) {
    const link = document.createElement('a');
    link.download = `delivery-qr-${gate.name.replace(/\s+/g, '-')}.png`;
    link.href = qrDataUrl;
    link.click();
  }

  function exportCSV() {
    if (!filtered.length) { toast.error('No data to export'); return; }
    const headers = ['Name', 'Phone', 'Company', 'Vehicle', 'Society', 'Gate', 'Check-In', 'Check-Out', 'Duration (min)'];
    const rows = filtered.map(v => [
      v.visitor_name,
      v.visitor_phone,
      v.delivery_company,
      v.vehicle_number || '',
      typeof v.society_id === 'object' ? v.society_id.name : '',
      typeof v.gate_id === 'object' ? v.gate_id?.name || '' : '',
      new Date(v.check_in_time).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true }),
      v.check_out_time ? new Date(v.check_out_time).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true }) : '',
      v.duration_minutes ?? '',
    ]);
    const csv = [headers, ...rows].map(r => r.map(c => `"${String(c ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `delivery-log-${date}.csv`; a.click();
    URL.revokeObjectURL(url);
    toast.success('CSV exported!');
  }

  const getSocietyName = (v: DeliveryVisit) => typeof v.society_id === 'object' ? v.society_id.name : '';
  const getGateName = (v: DeliveryVisit) => typeof v.gate_id === 'object' ? v.gate_id?.name || '' : '';

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="section-header">
        <div>
          <h1 className="section-title flex items-center gap-2">
            <Bike className="w-6 h-6 text-orange-400" />
            Delivery Tracking
          </h1>
          <p className="section-subtitle">Track delivery boy visits and generate QR codes for your gates</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => openQrModal(gates[0])}
            disabled={!gates.length}
            className="btn-secondary flex items-center gap-2"
          >
            <QrCode className="w-4 h-4" /> QR Codes
          </button>
          <button onClick={exportCSV} disabled={!filtered.length} className="btn-primary flex items-center gap-2">
            <Download className="w-4 h-4" /> Export CSV
          </button>
        </div>
      </div>

      {/* Stats cards */}
      {statsData && (
        <div className="grid grid-cols-3 gap-4">
          <div className="card p-4 text-center border border-surface-700">
            <p className="text-3xl font-black text-slate-100">{statsData.total_visits}</p>
            <p className="text-slate-500 text-sm mt-1">Total Visits Today</p>
          </div>
          <div className="card p-4 text-center border border-success-500/20">
            <p className="text-3xl font-black text-success-400">{statsData.checked_out}</p>
            <p className="text-slate-500 text-sm mt-1">Checked Out</p>
          </div>
          <div className="card p-4 text-center border border-warning-500/20">
            <p className="text-3xl font-black text-warning-400">{statsData.still_inside}</p>
            <p className="text-slate-500 text-sm mt-1">Still Inside</p>
          </div>
        </div>
      )}

      {/* By Company */}
      {statsData?.by_company?.length > 0 && (
        <div className="card p-4">
          <p className="text-sm font-semibold text-slate-400 mb-3">Today by Company</p>
          <div className="flex flex-wrap gap-2">
            {statsData.by_company.map((b: { company: string; count: number }) => (
              <div key={b.company} className="flex items-center gap-2 bg-surface-800 rounded-lg px-3 py-1.5">
                <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: COMPANY_COLORS[b.company] || '#64748b' }} />
                <span className="text-slate-300 text-sm font-medium">{b.company}</span>
                <span className="text-slate-500 text-sm">{b.count}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="card p-4">
        <div className="flex items-center gap-2 mb-3">
          <Filter className="w-4 h-4 text-orange-400" />
          <span className="text-sm font-semibold text-slate-300">Filters</span>
        </div>
        <div className="flex flex-wrap gap-3 items-center">
          <input type="date" value={date} onChange={e => setDate(e.target.value)} className="input w-44" />

          <select value={societyId} onChange={e => setSocietyId(e.target.value)} className="input w-48">
            <option value="">All Societies</option>
            {societies.map(s => <option key={s._id} value={s._id}>{s.name}</option>)}
          </select>

          <select value={company} onChange={e => setCompany(e.target.value)} className="input w-40">
            <option value="">All Companies</option>
            {['Zomato', 'Swiggy', 'Amazon', 'Flipkart', 'DTDC', 'BlueDart', 'FedEx', 'Meesho', 'Other'].map(c => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>

          <div className="relative">
            <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
            <input type="text" placeholder="Search name, phone..." value={search} onChange={e => setSearch(e.target.value)} className="input pl-9 w-52" />
          </div>

          {(societyId || company || search) && (
            <button onClick={() => { setSocietyId(''); setCompany(''); setSearch(''); }} className="flex items-center gap-1.5 text-xs text-danger-400 hover:text-danger-300 px-3 py-1.5 rounded-lg hover:bg-danger-500/10 border border-danger-500/20 transition-colors">
              <X className="w-3.5 h-3.5" /> Clear
            </button>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="table-wrapper">
        <table className="table">
          <thead>
            <tr>
              <th>Visitor</th>
              <th>Company</th>
              <th>Society / Gate</th>
              <th>Vehicle</th>
              <th className="flex items-center gap-1"><LogIn className="w-3.5 h-3.5" /> Check-In</th>
              <th><LogOut className="w-3.5 h-3.5 inline mr-1" />Check-Out</th>
              <th><Clock className="w-3.5 h-3.5 inline mr-1" />Duration</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <tr key={i}>
                  <td colSpan={7}><div className="h-10 bg-surface-700 animate-pulse rounded" /></td>
                </tr>
              ))
            ) : filtered.map(v => (
              <tr key={v._id}>
                <td>
                  <div>
                    <p className="font-medium text-slate-100">{v.visitor_name}</p>
                    <p className="text-xs text-slate-500">{v.visitor_phone}</p>
                  </div>
                </td>
                <td><CompanyBadge company={v.delivery_company} /></td>
                <td>
                  <div>
                    <p className="text-sm text-slate-200">{getSocietyName(v)}</p>
                    <p className="text-xs text-slate-500">{getGateName(v)}</p>
                  </div>
                </td>
                <td className="text-slate-400 font-mono text-sm">{v.vehicle_number || '—'}</td>
                <td className="text-slate-300 text-sm whitespace-nowrap">
                  <span className="inline-flex items-center gap-1 text-success-400">
                    <LogIn className="w-3.5 h-3.5" />
                    {new Date(v.check_in_time).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true })}
                  </span>
                </td>
                <td className="text-sm whitespace-nowrap">
                  {v.check_out_time ? (
                    <span className="inline-flex items-center gap-1 text-warning-400">
                      <LogOut className="w-3.5 h-3.5" />
                      {new Date(v.check_out_time).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true })}
                    </span>
                  ) : (
                    <span className="text-xs bg-warning-500/20 text-warning-400 border border-warning-500/30 px-2 py-0.5 rounded-full">Inside</span>
                  )}
                </td>
                <td className="text-slate-400 text-sm">
                  {v.duration_minutes != null ? `${v.duration_minutes} min` : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!isLoading && filtered.length === 0 && (
          <div className="text-center py-12 text-slate-600">
            <Bike className="w-10 h-10 mx-auto mb-2 opacity-40" />
            <p className="text-sm">No delivery visits found for the selected filters</p>
          </div>
        )}
      </div>

      {/* QR Modal — shows all gates so admin can pick which one to print */}
      {qrGate && (
        <div className="modal-overlay" onClick={() => setQrGate(null)}>
          <div className="modal-content max-w-sm" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-lg font-bold text-slate-100">Delivery QR Code</h2>
                <p className="text-slate-400 text-sm">Print and place at the gate for delivery boys</p>
              </div>
              <button onClick={() => setQrGate(null)} className="text-slate-400 hover:text-slate-200"><X className="w-5 h-5" /></button>
            </div>

            {/* Gate selector */}
            <select
              className="input w-full mb-4"
              value={qrGate.id}
              onChange={e => {
                const g = gates.find(g => g.id === e.target.value);
                if (g) openQrModal(g);
              }}
            >
              {gates.map(g => (
                <option key={g.id} value={g.id}>
                  {g.name} — {typeof g.society_id === 'object' ? g.society_id.name : ''}
                </option>
              ))}
            </select>

            {qrDataUrl && (
              <div className="bg-white rounded-2xl p-4 text-center mb-4">
                <img src={qrDataUrl} alt="QR Code" className="w-full max-w-[240px] mx-auto" />
                <p className="text-slate-700 text-xs mt-2 font-semibold">Scan to record entry / exit</p>
              </div>
            )}

            <p className="text-slate-500 text-xs text-center mb-4 font-mono break-all">
              {FRONTEND_URL}/scan/{qrGate.qr_token}
            </p>

            <div className="flex gap-2">
              <button className="btn-primary flex-1" onClick={() => downloadQR(qrGate)}>
                <Download className="w-4 h-4" /> Download PNG
              </button>
              <button className="btn-secondary flex-1" onClick={() => { navigator.clipboard.writeText(`${FRONTEND_URL}/scan/${qrGate.qr_token}`); toast.success('Link copied!'); }}>
                Copy Link
              </button>
            </div>
            <p className="text-slate-600 text-xs text-center mt-3">
              🚴 Delivery boys scan this QR to check in and out — no app download needed!
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
