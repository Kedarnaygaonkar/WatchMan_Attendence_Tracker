import { useState, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import QRCode from 'qrcode';
import toast from 'react-hot-toast';
import { QrCode, Download, Copy, RefreshCw, X, Building2 } from 'lucide-react';
import api from '../../api/client';

interface Gate {
  id: string;
  name: string;
  qr_token: string;
  is_active: boolean;
  society_id: { id: string; name: string; address: string } | string;
  agency_id?: { _id: string; name: string; logo_url?: string } | string;
}

interface Society {
  id: string;
  name: string;
  address: string;
}

const FRONTEND_URL = window.location.origin;

export default function GatesPage() {
  const queryClient = useQueryClient();
  const [qrModalGate, setQrModalGate] = useState<Gate | null>(null);
  const [watchmanQrUrl, setWatchmanQrUrl] = useState<string>('');
  const [deliveryQrUrl, setDeliveryQrUrl] = useState<string>('');
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
    mutationFn: (payload: { society_id: string; name: string }) => api.post('/gates', payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['gates'] });
      toast.success('QR code generated!');
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
    
    // Generate Watchman QR
    const watchmanUrl = `${FRONTEND_URL}/scan/${gate.qr_token}?mode=guard`;
    const watchmanQr = await QRCode.toDataURL(watchmanUrl, { width: 600, margin: 2, color: { dark: '#0f172a', light: '#ffffff' } });
    setWatchmanQrUrl(watchmanQr);

    // Generate Delivery QR
    const deliveryUrl = `${FRONTEND_URL}/scan/${gate.qr_token}?mode=delivery`;
    const deliveryQr = await QRCode.toDataURL(deliveryUrl, { width: 300, margin: 2, color: { dark: '#0f172a', light: '#ffffff' } });
    setDeliveryQrUrl(deliveryQr);
  }

  async function downloadGuardQR(gate: Gate) {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // A4 Size at 300 DPI is 2480 x 3508
    canvas.width = 2480;
    canvas.height = 3508;

    // White Background
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Agency Banner (Blue background)
    ctx.fillStyle = '#1e3a8a'; // brand-900 / dark blue
    ctx.fillRect(0, 0, canvas.width, 600);

    const agency = typeof gate.agency_id === 'object' ? gate.agency_id : null;
    let agencyName = agency?.name || 'Secure Agency';

    // Helper to load image
    const loadImg = (src: string): Promise<HTMLImageElement> => new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => resolve(img);
      img.onerror = (e) => reject(e);
      img.src = src;
    });

    // Draw Agency Logo if exists, else text
    if (agency?.logo_url) {
      try {
        const logo = await loadImg(agency.logo_url);
        // Draw centered logo in the banner
        const lWidth = 1000;
        const lHeight = 400;
        ctx.drawImage(logo, (canvas.width - lWidth) / 2, 100, lWidth, lHeight);
      } catch (e) {
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 140px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(agencyName.toUpperCase(), canvas.width / 2, 350);
      }
    } else {
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 140px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(agencyName.toUpperCase(), canvas.width / 2, 350);
    }

    // Header (Society Name)
    ctx.fillStyle = '#0f172a';
    ctx.font = 'bold 120px sans-serif';
    ctx.textAlign = 'center';
    const societyName = getSocietyName(gate);
    ctx.fillText(societyName, canvas.width / 2, 850);

    // Gate Name
    ctx.font = 'bold 60px sans-serif';
    ctx.fillStyle = '#475569';
    ctx.fillText(gate.name.toUpperCase(), canvas.width / 2, 980);

    // Draw Watchman QR (Large)
    try {
      const wImg = await loadImg(watchmanQrUrl);
      const wSize = 1600;
      ctx.drawImage(wImg, (canvas.width - wSize) / 2, 1150, wSize, wSize);
    } catch (e) {
      console.error('Failed to load QR image for canvas');
    }

    // Watchman Label
    ctx.font = 'bold 100px sans-serif';
    ctx.fillStyle = '#1e40af';
    ctx.fillText('SECURITY GUARD SCAN HERE', canvas.width / 2, 2900);

    // Footer Help Text
    ctx.font = '50px sans-serif';
    ctx.fillStyle = '#64748b';
    ctx.fillText('Please use the Watchman App to scan this QR code', canvas.width / 2, 3100);

    // Trigger Download
    const link = document.createElement('a');
    link.download = `guard-qr-${gate.name.replace(/\s+/g, '-')}.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
  }

  async function downloadDeliveryQR(gate: Gate) {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // A4 Size at 300 DPI is 2480 x 3508
    canvas.width = 2480;
    canvas.height = 3508;

    // White Background
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Delivery Header
    ctx.fillStyle = '#ea580c'; // orange
    ctx.fillRect(0, 0, canvas.width, 600);

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 140px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('DELIVERY CHECK-IN', canvas.width / 2, 350);

    // Header (Society Name)
    ctx.fillStyle = '#0f172a';
    ctx.font = 'bold 120px sans-serif';
    ctx.textAlign = 'center';
    const societyName = getSocietyName(gate);
    ctx.fillText(societyName, canvas.width / 2, 850);

    // Gate Name
    ctx.font = 'bold 60px sans-serif';
    ctx.fillStyle = '#475569';
    ctx.fillText(gate.name.toUpperCase(), canvas.width / 2, 980);

    // Load Images
    const loadImg = (src: string): Promise<HTMLImageElement> => new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => resolve(img);
      img.onerror = (e) => reject(e);
      img.src = src;
    });

    // Draw Delivery QR (Large)
    try {
      const dImg = await loadImg(deliveryQrUrl);
      const dSize = 1600;
      ctx.drawImage(dImg, (canvas.width - dSize) / 2, 1150, dSize, dSize);
    } catch (e) {
      console.error('Failed to load QR image for canvas');
    }

    // Delivery Label
    ctx.font = 'bold 100px sans-serif';
    ctx.fillStyle = '#ea580c';
    ctx.fillText('DELIVERY PARTNER SCAN HERE', canvas.width / 2, 2900);

    // Trigger Download
    const link = document.createElement('a');
    link.download = `delivery-qr-${gate.name.replace(/\s+/g, '-')}.png`;
    link.href = canvas.toDataURL('image/png');
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
          <h1 className="section-title">Society QR Codes</h1>
          <p className="section-subtitle">Manage QR codes for society attendance</p>
        </div>
      </div>

      {/* Societies Grid */}
      {isLoading ? (
        <div className="card text-center py-12 text-slate-400">Loading...</div>
      ) : societies.length === 0 ? (
        <div className="card text-center py-16">
          <Building2 className="w-12 h-12 text-slate-600 mx-auto mb-3" />
          <p className="text-slate-400 font-medium">No societies yet</p>
          <p className="text-slate-500 text-sm mt-1">Add a society to generate its QR code</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {societies.map(society => {
            const gate = gates.find(g => typeof g.society_id === 'object' ? g.society_id.id === society.id : g.society_id === society.id);
            return (
            <div key={society.id} className="card hover:shadow-lg transition-all flex flex-col">
              <div className="flex items-start justify-between mb-3">
                <div>
                  <h3 className="font-bold text-slate-100 text-base">{society.name}</h3>
                  <p className="text-slate-400 text-sm mt-0.5 line-clamp-1">{society.address}</p>
                </div>
              </div>

              <div className="flex-1"></div>

              {gate ? (
                <>
                  <div className="bg-slate-800/50 rounded-lg p-2 mb-4 text-center mt-4">
                    <p className="text-slate-500 text-xs font-mono truncate">/scan/{gate.qr_token.slice(0, 8)}...</p>
                  </div>
                  <div className="flex gap-2 flex-wrap">
                    <button className="btn-primary flex-1 text-sm py-2" onClick={() => openQrModal(gate)}>
                      <QrCode className="w-4 h-4" /> View QR
                    </button>
                    <button className="btn-secondary text-sm py-2 px-3" onClick={() => copyLink(gate)} title="Copy scan link">
                      <Copy className="w-4 h-4" />
                    </button>
                    <button className="btn-secondary text-sm py-2 px-3 text-warning-400" onClick={() => regenerateMutation.mutate(gate.id)} title="Regenerate QR (old QR becomes invalid)">
                      <RefreshCw className="w-4 h-4" />
                    </button>
                  </div>
                </>
              ) : (
                <div className="mt-4 pt-4 border-t border-surface-700 text-center">
                  <p className="text-sm text-slate-400 mb-3">No QR code generated yet</p>
                  <button 
                    className="btn-primary w-full py-2"
                    disabled={createMutation.isPending}
                    onClick={() => createMutation.mutate({ society_id: society.id, name: society.name + ' Gate' })}
                  >
                    <QrCode className="w-4 h-4" /> Generate QR Code
                  </button>
                </div>
              )}
            </div>
          )})}
        </div>
      )}

      {/* Add Gate Modal Removed */}

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

            {watchmanQrUrl && (
              <div className="bg-white rounded-2xl p-4 text-center mb-4 flex flex-col items-center gap-4">
                <div>
                  <p className="text-xs font-bold text-brand-600 mb-1">SECURITY GUARD</p>
                  <img src={watchmanQrUrl} alt="Watchman QR" className="w-full max-w-[240px] mx-auto border border-slate-200 rounded-lg" />
                </div>
              </div>
            )}
            <p className="text-slate-500 text-xs text-center mb-4 font-mono break-all">
              Watchman: {FRONTEND_URL}/scan/{qrModalGate.qr_token}?mode=guard<br/>
              Delivery: {FRONTEND_URL}/scan/{qrModalGate.qr_token}?mode=delivery
            </p>

            <div className="flex gap-2">
              <button className="btn-primary flex-1" onClick={() => downloadGuardQR(qrModalGate)}>
                <Download className="w-4 h-4" /> Download Guard QR
              </button>
            </div>
            <div className="flex gap-2 mt-2">
              <button className="btn-secondary flex-1 border-orange-500 text-orange-600 hover:bg-orange-50" onClick={() => downloadDeliveryQR(qrModalGate)}>
                <Download className="w-4 h-4" /> Download Delivery QR
              </button>
            </div>
            <div className="flex gap-2 mt-2">
              <button className="btn-secondary flex-1" onClick={() => copyLink(qrModalGate)}>
                <Copy className="w-4 h-4" /> Copy Direct Link
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
