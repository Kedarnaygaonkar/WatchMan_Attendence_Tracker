import { useState, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import QRCode from 'qrcode';
import toast from 'react-hot-toast';
import { Plus, QrCode, Download, Copy, RefreshCw, Trash2, X, ChevronDown } from 'lucide-react';
import api from '../../api/client';

interface Gate {
  id: string;
  name: string;
  qr_token: string;
  is_active: boolean;
  society_id: { id: string; name: string; address: string } | string;
}

interface Society {
  id: string;
  name: string;
  address: string;
}

const FRONTEND_URL = window.location.origin;

export default function GatesPage() {
  const queryClient = useQueryClient();
  const [showModal, setShowModal] = useState(false);
  const [qrModalGate, setQrModalGate] = useState<Gate | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string>('');
  const [form, setForm] = useState({ society_id: '', name: '' });
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const { data: gates = [], isLoading } = useQuery({
    queryKey: ['gates'],
    queryFn: async () => { const { data } = await api.get('/gates'); return data.data as Gate[]; },
  });

  const { data: societies = [] } = useQuery({
    queryKey: ['societies-list'],
    queryFn: async () => { const { data } = await api.get('/societies', { params: { active: true } }); return data.data as Society[]; },
  });

  const createMutation = useMutation({
    mutationFn: (payload: typeof form) => api.post('/gates', payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['gates'] });
      toast.success('Gate created!');
      setShowModal(false);
      setForm({ society_id: '', name: '' });
    },
    onError: (e: any) => toast.error(e.response?.data?.message || 'Failed'),
  });

  const deactivateMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/gates/${id}`),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['gates'] }); toast.success('Gate deactivated'); },
    onError: (e: any) => toast.error(e.response?.data?.message || 'Failed'),
  });

  const regenerateMutation = useMutation({
    mutationFn: (id: string) => api.post(`/gates/${id}/regenerate`),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['gates'] });
      toast.success('QR code regenerated!');
      // Refresh the QR modal if open
      if (qrModalGate) openQrModal({ ...qrModalGate, qr_token: res.data.data.qr_token });
    },
    onError: (e: any) => toast.error(e.response?.data?.message || 'Failed'),
  });

  async function openQrModal(gate: Gate) {
    setQrModalGate(gate);
    const scanUrl = `${FRONTEND_URL}/scan/${gate.qr_token}`;
    const dataUrl = await QRCode.toDataURL(scanUrl, { width: 300, margin: 2, color: { dark: '#0f172a', light: '#ffffff' } });
    setQrDataUrl(dataUrl);
  }

  function downloadQR(gate: Gate) {
    const link = document.createElement('a');
    link.download = `gate-qr-${gate.name.replace(/\s+/g, '-')}.png`;
    link.href = qrDataUrl;
    link.click();
  }

  function copyLink(gate: Gate) {
    navigator.clipboard.writeText(`${FRONTEND_URL}/scan/${gate.qr_token}`);
    toast.success('Scan link copied!');
  }

  const getSocietyName = (gate: Gate) => {
    if (typeof gate.society_id === 'object') return gate.society_id.name;
    return 'Unknown Society';
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="section-header">
        <div>
          <h1 className="section-title">Gates & QR Codes</h1>
          <p className="section-subtitle">Manage gates and generate QR codes for watchman attendance</p>
        </div>
        <button className="btn-primary" onClick={() => setShowModal(true)}>
          <Plus className="w-4 h-4" /> Add Gate
        </button>
      </div>

      {/* Gates Grid */}
      {isLoading ? (
        <div className="card text-center py-12 text-slate-400">Loading gates...</div>
      ) : gates.length === 0 ? (
        <div className="card text-center py-16">
          <QrCode className="w-12 h-12 text-slate-600 mx-auto mb-3" />
          <p className="text-slate-400 font-medium">No gates yet</p>
          <p className="text-slate-500 text-sm mt-1">Add a gate to generate a QR code for attendance</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {gates.filter(g => g.is_active).map(gate => (
            <div key={gate.id} className="card hover:shadow-lg transition-all">
              <div className="flex items-start justify-between mb-3">
                <div>
                  <h3 className="font-bold text-slate-100 text-base">{gate.name}</h3>
                  <p className="text-slate-400 text-sm mt-0.5">{getSocietyName(gate)}</p>
                </div>
                <span className="badge-active text-xs">Active</span>
              </div>

              <div className="bg-slate-800/50 rounded-lg p-2 mb-4 text-center">
                <p className="text-slate-500 text-xs font-mono truncate">/scan/{gate.qr_token.slice(0, 8)}...</p>
              </div>

              <div className="flex gap-2 flex-wrap">
                <button
                  className="btn-primary flex-1 text-sm py-2"
                  onClick={() => openQrModal(gate)}
                >
                  <QrCode className="w-4 h-4" /> View QR
                </button>
                <button
                  className="btn-secondary text-sm py-2 px-3"
                  onClick={() => copyLink(gate)}
                  title="Copy scan link"
                >
                  <Copy className="w-4 h-4" />
                </button>
                <button
                  className="btn-secondary text-sm py-2 px-3 text-warning-400"
                  onClick={() => regenerateMutation.mutate(gate.id)}
                  title="Regenerate QR (old QR becomes invalid)"
                >
                  <RefreshCw className="w-4 h-4" />
                </button>
                <button
                  className="btn-secondary text-sm py-2 px-3 text-danger-400"
                  onClick={() => { if (confirm(`Deactivate gate "${gate.name}"?`)) deactivateMutation.mutate(gate.id); }}
                  title="Deactivate gate"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add Gate Modal */}
      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-bold text-slate-100">Add Gate</h2>
              <button onClick={() => setShowModal(false)} className="text-slate-400 hover:text-slate-200"><X className="w-5 h-5" /></button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="form-label">Society *</label>
                <select className="form-input" value={form.society_id} onChange={e => setForm(f => ({ ...f, society_id: e.target.value }))}>
                  <option value="">Select society...</option>
                  {societies.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
              <div>
                <label className="form-label">Gate Name *</label>
                <input className="form-input" placeholder="e.g. Main Gate, North Entrance" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button className="btn-secondary flex-1" onClick={() => setShowModal(false)}>Cancel</button>
              <button
                className="btn-primary flex-1"
                disabled={!form.society_id || !form.name || createMutation.isPending}
                onClick={() => createMutation.mutate(form)}
              >
                {createMutation.isPending ? 'Creating...' : 'Create Gate'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* QR Code Modal */}
      {qrModalGate && (
        <div className="modal-overlay" onClick={() => setQrModalGate(null)}>
          <div className="modal-content max-w-sm" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-lg font-bold text-slate-100">{qrModalGate.name}</h2>
                <p className="text-slate-400 text-sm">{getSocietyName(qrModalGate)}</p>
              </div>
              <button onClick={() => setQrModalGate(null)} className="text-slate-400 hover:text-slate-200"><X className="w-5 h-5" /></button>
            </div>

            {qrDataUrl && (
              <div className="bg-white rounded-2xl p-4 text-center mb-4">
                <img src={qrDataUrl} alt="QR Code" className="w-full max-w-[240px] mx-auto" />
              </div>
            )}

            <p className="text-slate-500 text-xs text-center mb-4 font-mono break-all">
              {FRONTEND_URL}/scan/{qrModalGate.qr_token}
            </p>

            <div className="flex gap-2">
              <button className="btn-primary flex-1" onClick={() => downloadQR(qrModalGate)}>
                <Download className="w-4 h-4" /> Download PNG
              </button>
              <button className="btn-secondary flex-1" onClick={() => copyLink(qrModalGate)}>
                <Copy className="w-4 h-4" /> Copy Link
              </button>
            </div>

            <p className="text-slate-600 text-xs text-center mt-3">
              ⚠️ Print and place this QR at the gate. Guards scan it to mark attendance.
            </p>
          </div>
        </div>
      )}

      <canvas ref={canvasRef} style={{ display: 'none' }} />
    </div>
  );
}
