import React, { useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import axios from 'axios';
import { Camera, CheckCircle, LogIn, LogOut, AlertTriangle, Loader2, User, Clock } from 'lucide-react';

const API = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

interface GateInfo {
  gate: { id: string; name: string };
  society: { id: string; name: string; address: string; wings: string[]; latitude: number; longitude: number; geofence_radius: number };
  shifts: { id: string; name: string; start_time: string; end_time: string }[];
}

interface WatchmanInfo {
  id: string;
  full_name: string;
  employee_id: string;
  wing?: string;
}

type Step = 'loading' | 'error' | 'enter_id' | 'select_shift' | 'take_photo' | 'submitting' | 'success';

export default function ScanPage() {
  const { token } = useParams<{ token: string }>();
  const [gateInfo, setGateInfo] = useState<GateInfo | null>(null);
  const [watchman, setWatchman] = useState<WatchmanInfo | null>(null);
  const [existingRecord, setExistingRecord] = useState<any>(null);
  const [mode, setMode] = useState<'checkin' | 'checkout'>('checkin');
  const [step, setStep] = useState<Step>('loading');
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [employeeId, setEmployeeId] = useState('');
  const [selectedShiftId, setSelectedShiftId] = useState('');
  const [photoDataUrl, setPhotoDataUrl] = useState<string | null>(null);
  const [isLate, setIsLate] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // Load gate info on mount
  useEffect(() => {
    if (!token) { setStep('error'); setErrorMsg('Invalid QR code'); return; }
    axios.get(`${API}/scan/${token}`)
      .then(r => { setGateInfo(r.data.data); setStep('enter_id'); })
      .catch(e => { setStep('error'); setErrorMsg(e.response?.data?.message || 'Invalid or expired QR code'); });
  }, [token]);

  // Lookup guard
  async function handleLookup() {
    if (!employeeId.trim()) return;
    setStep('loading');
    try {
      const r = await axios.post(`${API}/scan/lookup`, { employee_id: employeeId.trim(), gate_token: token });
      const { watchman: wm, existing_record, mode: detectedMode } = r.data.data;
      setWatchman(wm);
      setExistingRecord(existing_record);
      setMode(detectedMode);
      if (detectedMode === 'checkin') setStep('select_shift');
      else startCamera().then(() => setStep('take_photo'));
    } catch (e: any) {
      setStep('enter_id');
      setErrorMsg(e.response?.data?.message || 'Guard not found');
    }
  }

  async function startCamera() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' }, audio: false });
      streamRef.current = stream;
      if (videoRef.current) videoRef.current.srcObject = stream;
    } catch {
      setErrorMsg('Camera access denied. Please allow camera and try again.');
    }
  }

  function stopCamera() {
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
  }

  function capturePhoto() {
    if (!videoRef.current || !canvasRef.current) return;
    const ctx = canvasRef.current.getContext('2d')!;
    canvasRef.current.width = videoRef.current.videoWidth;
    canvasRef.current.height = videoRef.current.videoHeight;
    ctx.drawImage(videoRef.current, 0, 0);
    const dataUrl = canvasRef.current.toDataURL('image/jpeg', 0.8);
    setPhotoDataUrl(dataUrl);
    stopCamera();
    setStep('submitting');
    handleSubmit(dataUrl);
  }

  async function handleSubmit(photo: string) {
    try {
      const endpoint = mode === 'checkin' ? '/scan/checkin' : '/scan/checkout';
      const body: any = { employee_id: employeeId.trim(), gate_token: token, selfie_url: photo };
      if (mode === 'checkin') body.shift_id = selectedShiftId;

      const r = await axios.post(`${API}${endpoint}`, body);
      setSuccessMsg(r.data.message);
      if (r.data.data?.is_late) setIsLate(true);
      setStep('success');
    } catch (e: any) {
      setStep('take_photo');
      setErrorMsg(e.response?.data?.message || 'Submission failed. Try again.');
      startCamera();
    }
  }

  // Cleanup on unmount
  useEffect(() => () => stopCamera(), []);

  const currentTime = new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });

  return (
    <div style={{ minHeight: '100vh', background: 'linear-gradient(135deg, #0f172a 0%, #1e3a5f 100%)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '20px', fontFamily: "'Inter', sans-serif" }}>
      <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet" />

      {/* Header */}
      <div style={{ textAlign: 'center', marginBottom: '24px' }}>
        <img src="/logo.png" alt="Logo" style={{ width: '56px', height: '56px', objectFit: 'contain', marginBottom: '8px' }} />
        <div style={{ color: '#94a3b8', fontSize: '13px', fontWeight: 500 }}>
          <Clock size={12} style={{ display: 'inline', marginRight: '4px' }} />
          {currentTime}
        </div>
      </div>

      {/* Card */}
      <div style={{ background: 'rgba(255,255,255,0.05)', backdropFilter: 'blur(20px)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '20px', padding: '32px', width: '100%', maxWidth: '420px', boxShadow: '0 25px 50px rgba(0,0,0,0.5)' }}>

        {/* Gate/Society info */}
        {gateInfo && step !== 'error' && (
          <div style={{ textAlign: 'center', marginBottom: '28px' }}>
            <div style={{ background: 'rgba(59,130,246,0.15)', borderRadius: '12px', padding: '16px', marginBottom: '8px' }}>
              <p style={{ color: '#60a5fa', fontSize: '12px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '1px', margin: 0 }}>{gateInfo.gate.name}</p>
              <h1 style={{ color: '#f1f5f9', fontSize: '22px', fontWeight: 800, margin: '4px 0 0' }}>{gateInfo.society.name}</h1>
            </div>
            <p style={{ color: '#64748b', fontSize: '12px', margin: 0 }}>{gateInfo.society.address}</p>
          </div>
        )}

        {/* ── LOADING ── */}
        {step === 'loading' && (
          <div style={{ textAlign: 'center', padding: '40px 0' }}>
            <Loader2 size={40} color="#3b82f6" style={{ animation: 'spin 1s linear infinite' }} />
            <p style={{ color: '#94a3b8', marginTop: '12px' }}>Loading...</p>
          </div>
        )}

        {/* ── ERROR ── */}
        {step === 'error' && (
          <div style={{ textAlign: 'center', padding: '20px 0' }}>
            <AlertTriangle size={48} color="#f87171" style={{ marginBottom: '12px' }} />
            <h2 style={{ color: '#f87171', fontSize: '18px', fontWeight: 700 }}>Error</h2>
            <p style={{ color: '#94a3b8' }}>{errorMsg}</p>
          </div>
        )}

        {/* ── ENTER ID ── */}
        {step === 'enter_id' && (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '20px' }}>
              <User size={20} color="#3b82f6" />
              <h2 style={{ color: '#f1f5f9', fontSize: '18px', fontWeight: 700, margin: 0 }}>Enter Your Guard ID</h2>
            </div>
            {errorMsg && <div style={{ background: 'rgba(248,113,113,0.15)', border: '1px solid rgba(248,113,113,0.3)', borderRadius: '8px', padding: '10px 14px', color: '#fca5a5', fontSize: '13px', marginBottom: '16px' }}>{errorMsg}</div>}
            <input
              type="text"
              placeholder="e.g. EMP001"
              value={employeeId}
              onChange={e => { setEmployeeId(e.target.value.toUpperCase()); setErrorMsg(''); }}
              onKeyDown={e => e.key === 'Enter' && handleLookup()}
              autoFocus
              style={{ width: '100%', padding: '14px', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.15)', background: 'rgba(255,255,255,0.08)', color: '#f1f5f9', fontSize: '18px', fontWeight: 700, letterSpacing: '2px', textAlign: 'center', outline: 'none', boxSizing: 'border-box' }}
            />
            <button onClick={handleLookup} disabled={!employeeId.trim()} style={{ width: '100%', marginTop: '16px', padding: '14px', borderRadius: '10px', border: 'none', background: employeeId.trim() ? 'linear-gradient(135deg, #3b82f6, #1d4ed8)' : '#334155', color: 'white', fontSize: '15px', fontWeight: 700, cursor: employeeId.trim() ? 'pointer' : 'not-allowed' }}>
              Continue →
            </button>
          </div>
        )}

        {/* ── SELECT SHIFT ── */}
        {step === 'select_shift' && watchman && (
          <div>
            <div style={{ background: 'rgba(34,197,94,0.1)', borderRadius: '10px', padding: '14px', marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '12px' }}>
              <CheckCircle size={20} color="#4ade80" />
              <div>
                <p style={{ color: '#4ade80', fontWeight: 700, margin: 0, fontSize: '15px' }}>{watchman.full_name}</p>
                <p style={{ color: '#64748b', margin: 0, fontSize: '12px' }}>ID: {watchman.employee_id}{watchman.wing ? ` · ${watchman.wing}` : ''}</p>
              </div>
            </div>
            <h2 style={{ color: '#f1f5f9', fontSize: '16px', fontWeight: 700, marginBottom: '12px' }}>Select Your Shift</h2>
            {gateInfo?.shifts.map(s => (
              <button key={s.id} onClick={() => setSelectedShiftId(s.id)} style={{ width: '100%', padding: '12px 16px', marginBottom: '8px', borderRadius: '10px', border: `2px solid ${selectedShiftId === s.id ? '#3b82f6' : 'rgba(255,255,255,0.1)'}`, background: selectedShiftId === s.id ? 'rgba(59,130,246,0.15)' : 'rgba(255,255,255,0.04)', color: '#f1f5f9', fontSize: '14px', fontWeight: 600, cursor: 'pointer', textAlign: 'left', display: 'flex', justifyContent: 'space-between' }}>
                <span>{s.name}</span>
                <span style={{ color: '#94a3b8', fontSize: '12px' }}>{s.start_time} – {s.end_time}</span>
              </button>
            ))}
            <button onClick={() => { if (!selectedShiftId) return; startCamera().then(() => setStep('take_photo')); }} disabled={!selectedShiftId} style={{ width: '100%', marginTop: '8px', padding: '14px', borderRadius: '10px', border: 'none', background: selectedShiftId ? 'linear-gradient(135deg, #3b82f6, #1d4ed8)' : '#334155', color: 'white', fontSize: '15px', fontWeight: 700, cursor: selectedShiftId ? 'pointer' : 'not-allowed', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
              <Camera size={18} /> Take Photo →
            </button>
          </div>
        )}

        {/* ── TAKE PHOTO ── */}
        {step === 'take_photo' && (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
              {mode === 'checkin' ? <LogIn size={20} color="#4ade80" /> : <LogOut size={20} color="#fb923c" />}
              <h2 style={{ color: '#f1f5f9', fontSize: '16px', fontWeight: 700, margin: 0 }}>
                {mode === 'checkin' ? 'Check-In Photo' : 'Check-Out Photo'}
              </h2>
            </div>
            {mode === 'checkout' && existingRecord && (
              <div style={{ background: 'rgba(251,146,60,0.1)', borderRadius: '8px', padding: '10px 14px', marginBottom: '14px', fontSize: '13px', color: '#fdba74' }}>
                Checked in at {new Date(existingRecord.check_in_time).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true })}
              </div>
            )}
            {errorMsg && <div style={{ background: 'rgba(248,113,113,0.15)', borderRadius: '8px', padding: '10px', color: '#fca5a5', fontSize: '13px', marginBottom: '12px' }}>{errorMsg}</div>}
            <div style={{ borderRadius: '12px', overflow: 'hidden', marginBottom: '16px', background: '#0f172a', aspectRatio: '4/3', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <video ref={videoRef} autoPlay playsInline muted style={{ width: '100%', transform: 'scaleX(-1)' }} />
            </div>
            <canvas ref={canvasRef} style={{ display: 'none' }} />
            <button onClick={capturePhoto} style={{ width: '100%', padding: '16px', borderRadius: '12px', border: 'none', background: mode === 'checkin' ? 'linear-gradient(135deg, #22c55e, #16a34a)' : 'linear-gradient(135deg, #f97316, #c2410c)', color: 'white', fontSize: '16px', fontWeight: 800, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px' }}>
              {mode === 'checkin' ? <><LogIn size={20} /> Mark Check-In</> : <><LogOut size={20} /> Mark Check-Out</>}
            </button>
          </div>
        )}

        {/* ── SUBMITTING ── */}
        {step === 'submitting' && (
          <div style={{ textAlign: 'center', padding: '40px 0' }}>
            <Loader2 size={40} color="#3b82f6" style={{ animation: 'spin 1s linear infinite' }} />
            <p style={{ color: '#94a3b8', marginTop: '12px' }}>Recording attendance...</p>
          </div>
        )}

        {/* ── SUCCESS ── */}
        {step === 'success' && (
          <div style={{ textAlign: 'center', padding: '20px 0' }}>
            <div style={{ width: '72px', height: '72px', borderRadius: '50%', background: isLate ? 'rgba(251,146,60,0.15)' : 'rgba(34,197,94,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
              <CheckCircle size={40} color={isLate ? '#fb923c' : '#4ade80'} />
            </div>
            <h2 style={{ color: '#f1f5f9', fontSize: '22px', fontWeight: 800, margin: '0 0 8px' }}>
              {isLate ? 'Late Arrival' : mode === 'checkin' ? 'Checked In!' : 'Checked Out!'}
            </h2>
            <p style={{ color: '#94a3b8', fontSize: '14px', lineHeight: 1.6, margin: 0 }}>{successMsg}</p>
            <p style={{ color: '#475569', fontSize: '12px', marginTop: '24px' }}>
              {new Date().toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}
            </p>
          </div>
        )}
      </div>

      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        * { box-sizing: border-box; }
        input::placeholder { color: #475569; }
      `}</style>
    </div>
  );
}
