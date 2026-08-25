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

  useEffect(() => {
    if (!token) { setStep('error'); setErrorMsg('Invalid QR code'); return; }
    axios.get(`${API}/scan/${token}`)
      .then(r => { setGateInfo(r.data.data); setStep('enter_id'); })
      .catch(e => { setStep('error'); setErrorMsg(e.response?.data?.message || 'Invalid or expired QR code'); });
  }, [token]);

  // Hook to attach video stream when DOM updates to 'take_photo'
  useEffect(() => {
    if (step === 'take_photo' && videoRef.current && streamRef.current) {
      videoRef.current.srcObject = streamRef.current;
    }
  }, [step]);

  async function handleLookup() {
    if (!employeeId.trim()) return;
    setStep('loading');
    try {
      const r = await axios.post(`${API}/scan/lookup`, { employee_id: employeeId.trim(), gate_token: token });
      const { watchman: wm, existing_record, mode: detectedMode } = r.data.data;
      setWatchman(wm);
      setExistingRecord(existing_record);
      setMode(detectedMode);
      if (detectedMode === 'checkin') {
        setStep('select_shift');
      } else {
        await startCamera();
        setStep('take_photo');
      }
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

  useEffect(() => () => stopCamera(), []);

  const currentTime = new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });

  return (
    <div className="min-h-screen bg-gradient-to-b from-surface-950 to-surface-900 flex flex-col items-center justify-center p-5 font-sans">
      {/* Header */}
      <div className="text-center mb-6">
        <img src="/logo.png" alt="Logo" className="w-14 h-14 object-contain mb-2 mx-auto" />
        <div className="text-slate-400 text-sm font-medium flex items-center justify-center gap-1.5">
          <Clock className="w-3.5 h-3.5" />
          {currentTime}
        </div>
      </div>

      {/* Card */}
      <div className="bg-surface-900/50 backdrop-blur-xl border border-surface-800 rounded-2xl p-8 w-full max-w-md shadow-2xl">

        {/* Gate/Society info */}
        {gateInfo && step !== 'error' && (
          <div className="text-center mb-8">
            <div className="bg-brand-500/10 border border-brand-500/20 rounded-xl p-4 mb-3">
              <p className="text-brand-400 text-xs font-bold uppercase tracking-widest mb-1">{gateInfo.gate.name}</p>
              <h1 className="text-slate-100 text-xl font-bold">{gateInfo.society.name}</h1>
            </div>
            <p className="text-slate-400 text-xs">{gateInfo.society.address}</p>
          </div>
        )}

        {/* ── LOADING ── */}
        {step === 'loading' && (
          <div className="text-center py-10">
            <Loader2 className="w-10 h-10 text-brand-500 animate-spin mx-auto" />
            <p className="text-slate-400 mt-4 font-medium">Loading...</p>
          </div>
        )}

        {/* ── ERROR ── */}
        {step === 'error' && (
          <div className="text-center py-6">
            <AlertTriangle className="w-12 h-12 text-danger-400 mx-auto mb-3" />
            <h2 className="text-danger-400 text-lg font-bold">Error</h2>
            <p className="text-slate-400 mt-2">{errorMsg}</p>
          </div>
        )}

        {/* ── ENTER ID ── */}
        {step === 'enter_id' && (
          <div className="space-y-4">
            <div className="flex items-center gap-2.5 mb-2">
              <User className="w-5 h-5 text-brand-400" />
              <h2 className="text-slate-100 text-lg font-bold">Enter Your Guard ID</h2>
            </div>
            {errorMsg && (
              <div className="bg-danger-500/10 border border-danger-500/20 rounded-lg p-3 text-danger-400 text-sm">
                {errorMsg}
              </div>
            )}
            <input
              type="text"
              placeholder="e.g. EMP001"
              value={employeeId}
              onChange={e => { setEmployeeId(e.target.value.toUpperCase()); setErrorMsg(''); }}
              onKeyDown={e => e.key === 'Enter' && handleLookup()}
              autoFocus
              className="w-full p-4 rounded-xl border border-surface-700 bg-surface-800 text-slate-100 text-lg font-bold tracking-widest text-center focus:border-brand-500 focus:ring-1 focus:ring-brand-500 outline-none transition-all placeholder-slate-500 uppercase"
            />
            <button 
              onClick={handleLookup} 
              disabled={!employeeId.trim()} 
              className={`w-full mt-4 p-4 rounded-xl font-bold transition-all ${
                employeeId.trim() ? 'bg-brand-600 hover:bg-brand-500 text-white shadow-lg shadow-brand-500/25' : 'bg-surface-800 text-slate-500 cursor-not-allowed'
              }`}
            >
              Continue &rarr;
            </button>
          </div>
        )}

        {/* ── SELECT SHIFT ── */}
        {step === 'select_shift' && watchman && (
          <div className="space-y-4">
            <div className="bg-success-500/10 border border-success-500/20 rounded-xl p-4 flex items-center gap-3">
              <CheckCircle className="w-6 h-6 text-success-400 shrink-0" />
              <div>
                <p className="text-success-400 font-bold">{watchman.full_name}</p>
                <p className="text-slate-400 text-xs mt-0.5">ID: {watchman.employee_id}{watchman.wing ? ` · ${watchman.wing}` : ''}</p>
              </div>
            </div>
            <h2 className="text-slate-100 text-base font-bold mb-2">Select Your Shift</h2>
            <div className="space-y-2">
              {gateInfo?.shifts.map(s => (
                <button 
                  key={s.id} 
                  onClick={() => setSelectedShiftId(s.id)} 
                  className={`w-full p-4 rounded-xl border-2 text-left flex justify-between items-center transition-all ${
                    selectedShiftId === s.id 
                      ? 'border-brand-500 bg-brand-500/10 text-slate-100' 
                      : 'border-surface-700 bg-surface-800/50 text-slate-300 hover:border-surface-600'
                  }`}
                >
                  <span className="font-semibold">{s.name}</span>
                  <span className="text-slate-400 text-xs">{s.start_time} &ndash; {s.end_time}</span>
                </button>
              ))}
            </div>
            <button 
              onClick={async () => { 
                if (!selectedShiftId) return; 
                await startCamera(); 
                setStep('take_photo'); 
              }} 
              disabled={!selectedShiftId} 
              className={`w-full mt-4 p-4 rounded-xl font-bold flex items-center justify-center gap-2 transition-all ${
                selectedShiftId ? 'bg-brand-600 hover:bg-brand-500 text-white shadow-lg shadow-brand-500/25' : 'bg-surface-800 text-slate-500 cursor-not-allowed'
              }`}
            >
              <Camera className="w-5 h-5" /> Take Photo &rarr;
            </button>
          </div>
        )}

        {/* ── TAKE PHOTO ── */}
        {step === 'take_photo' && (
          <div className="space-y-4">
            <div className="flex items-center gap-2 mb-2">
              {mode === 'checkin' ? <LogIn className="w-5 h-5 text-success-400" /> : <LogOut className="w-5 h-5 text-warning-400" />}
              <h2 className="text-slate-100 text-lg font-bold">
                {mode === 'checkin' ? 'Check-In Photo' : 'Check-Out Photo'}
              </h2>
            </div>
            {mode === 'checkout' && existingRecord && (
              <div className="bg-warning-500/10 border border-warning-500/20 rounded-lg p-3 text-warning-400 text-sm">
                Checked in at {new Date(existingRecord.check_in_time).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true })}
              </div>
            )}
            {errorMsg && (
              <div className="bg-danger-500/10 border border-danger-500/20 rounded-lg p-3 text-danger-400 text-sm">
                {errorMsg}
              </div>
            )}
            <div className="rounded-xl overflow-hidden bg-surface-950 aspect-4/3 flex items-center justify-center relative border border-surface-700">
              <video 
                ref={videoRef} 
                autoPlay 
                playsInline 
                muted 
                className="w-full h-full object-cover scale-x-[-1]" 
              />
            </div>
            <canvas ref={canvasRef} className="hidden" />
            <button 
              onClick={capturePhoto} 
              className={`w-full p-4 rounded-xl font-bold flex items-center justify-center gap-2 text-white shadow-lg transition-all ${
                mode === 'checkin' ? 'bg-success-600 hover:bg-success-500 shadow-success-500/25' : 'bg-warning-600 hover:bg-warning-500 shadow-warning-500/25'
              }`}
            >
              {mode === 'checkin' ? <><LogIn className="w-5 h-5" /> Mark Check-In</> : <><LogOut className="w-5 h-5" /> Mark Check-Out</>}
            </button>
          </div>
        )}

        {/* ── SUBMITTING ── */}
        {step === 'submitting' && (
          <div className="text-center py-10">
            <Loader2 className="w-10 h-10 text-brand-500 animate-spin mx-auto" />
            <p className="text-slate-400 mt-4 font-medium">Recording attendance...</p>
          </div>
        )}

        {/* ── SUCCESS ── */}
        {step === 'success' && (
          <div className="text-center py-6">
            <div className={`w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-6 ${
              isLate ? 'bg-warning-500/10 text-warning-400' : 'bg-success-500/10 text-success-400'
            }`}>
              <CheckCircle className="w-10 h-10" />
            </div>
            <h2 className="text-slate-100 text-2xl font-bold mb-2">
              {isLate ? 'Late Arrival' : mode === 'checkin' ? 'Checked In!' : 'Checked Out!'}
            </h2>
            <p className="text-slate-400 text-sm leading-relaxed mb-6">{successMsg}</p>
            <p className="text-surface-500 text-xs font-medium">
              {new Date().toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
