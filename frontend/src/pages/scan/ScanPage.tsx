import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import axios from 'axios';
import * as faceapi from 'face-api.js';
import { Camera, CheckCircle, LogIn, LogOut, AlertTriangle, Loader2, User, Clock, MapPin, ScanFace, ShieldCheck, Bike, Package } from 'lucide-react';
import toast from 'react-hot-toast';

const API = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';
const MODELS_PATH = '/models';
const FACE_MATCH_THRESHOLD = 0.6;

const DELIVERY_COMPANIES = ['Zomato', 'Swiggy', 'Amazon', 'Flipkart', 'DTDC', 'BlueDart', 'FedEx', 'Meesho', 'Other'] as const;
const COMPANY_COLORS: Record<string, string> = {
  Zomato: '#e23744',
  Swiggy: '#fc8019',
  Amazon: '#ff9900',
  Flipkart: '#2874f0',
  Other: '#64748b',
};

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
  face_registered: boolean;
  face_descriptor: number[] | null;
}

type Step =
  | 'loading' | 'error' | 'mode_select' | 'enter_id' | 'get_gps'
  | 'face_registration' | 'face_verification' | 'select_shift' | 'take_photo'
  | 'submitting' | 'success'
  | 'delivery_form' | 'delivery_checkout' | 'delivery_submitting' | 'delivery_success';

const VISIT_KEY = (token: string) => `delivery_visit_${token}`;

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
  const [gpsData, setGpsData] = useState<GeolocationCoordinates | null>(null);
  const [faceVerified, setFaceVerified] = useState<boolean | null>(null);
  const [faceMatchScore, setFaceMatchScore] = useState<number | null>(null);
  const [modelsLoaded, setModelsLoaded] = useState(false);
  const [faceDetected, setFaceDetected] = useState(false);

  // Delivery state
  const [deliveryForm, setDeliveryForm] = useState({
    visitor_name: '',
    visitor_phone: '',
    vehicle_number: '',
    delivery_company: 'Zomato' as typeof DELIVERY_COMPANIES[number],
  });
  const [deliveryResult, setDeliveryResult] = useState<any>(null);
  const [pendingVisit, setPendingVisit] = useState<{ visit_id: string; check_in_time: string; visitor_name: string } | null>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const detectionIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const verifyWatchmanRef = useRef<{ wm: WatchmanInfo; detectedMode: 'checkin' | 'checkout' } | null>(null);

  useEffect(() => {
    if (!token) { setStep('error'); setErrorMsg('Invalid QR code'); return; }

    const storedVisit = localStorage.getItem(VISIT_KEY(token));
    if (storedVisit) {
      try { setPendingVisit(JSON.parse(storedVisit)); } catch { localStorage.removeItem(VISIT_KEY(token)); }
    }

    axios.get(`${API}/scan/${token}`)
      .then(r => { setGateInfo(r.data.data); setStep('mode_select'); })
      .catch(e => { setStep('error'); setErrorMsg(e.response?.data?.message || 'Invalid or expired QR code'); });

    async function loadModels() {
      try {
        await Promise.all([
          faceapi.nets.tinyFaceDetector.loadFromUri(MODELS_PATH),
          faceapi.nets.faceLandmark68TinyNet.loadFromUri(MODELS_PATH),
          faceapi.nets.faceRecognitionNet.loadFromUri(MODELS_PATH),
        ]);
        setModelsLoaded(true);
      } catch (err) { console.error('Face models failed to load:', err); }
    }
    loadModels();
    return () => stopCamera();
  }, [token]);

  const videoCallbackRef = useCallback((el: HTMLVideoElement | null) => {
    (videoRef as React.MutableRefObject<HTMLVideoElement | null>).current = el;
    if (el && streamRef.current) el.srcObject = streamRef.current;
  }, []);

  async function handleLookup() {
    if (!employeeId.trim()) return;
    setStep('loading');
    try {
      const r = await axios.post(`${API}/scan/lookup`, { employee_id: employeeId.trim(), gate_token: token });
      const { watchman: wm, existing_record, mode: detectedMode } = r.data.data;
      setWatchman(wm); setExistingRecord(existing_record); setMode(detectedMode);
      verifyWatchmanRef.current = { wm, detectedMode };
      if (!wm.face_registered) { await startCamera(); setStep('face_registration'); startRegistrationDetection(); }
      else requestGPS(wm, detectedMode);
    } catch (e: any) { setStep('enter_id'); setErrorMsg(e.response?.data?.message || 'Guard not found'); }
  }

  function requestGPS(wm: WatchmanInfo, detectedMode: 'checkin' | 'checkout') {
    setStep('get_gps');
    if (!navigator.geolocation) { toast.error('Location services not supported.'); startFaceVerificationFlow(wm, detectedMode); return; }
    navigator.geolocation.getCurrentPosition(
      (pos) => { setGpsData(pos.coords); startFaceVerificationFlow(wm, detectedMode); },
      (err) => {
        toast.error(err.code === 1 ? 'Location access denied.' : 'Please enable location services.');
        startFaceVerificationFlow(wm, detectedMode);
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  }

  async function startFaceVerificationFlow(wm: WatchmanInfo, detectedMode: 'checkin' | 'checkout') {
    await startCamera(); setStep('face_verification');
    detectionIntervalRef.current = setInterval(async () => {
      if (!videoRef.current || videoRef.current.readyState < 2) return;
      const d = await faceapi.detectSingleFace(videoRef.current, new faceapi.TinyFaceDetectorOptions({ scoreThreshold: 0.5 })).withFaceLandmarks(true);
      setFaceDetected(!!d);
    }, 400);
    verifyWatchmanRef.current = { wm, detectedMode };
  }

  function startRegistrationDetection() {
    detectionIntervalRef.current = setInterval(async () => {
      if (!videoRef.current || videoRef.current.readyState < 2) return;
      const d = await faceapi.detectSingleFace(videoRef.current, new faceapi.TinyFaceDetectorOptions({ scoreThreshold: 0.5 }));
      setFaceDetected(!!d);
    }, 300);
  }

  async function registerFace() {
    if (!videoRef.current) return;
    const regCtx = verifyWatchmanRef.current;
    if (!regCtx) { toast.error('Session lost. Please re-enter your Guard ID.'); return; }
    setStep('loading');
    if (detectionIntervalRef.current) clearInterval(detectionIntervalRef.current);
    try {
      const detection = await faceapi.detectSingleFace(videoRef.current, new faceapi.TinyFaceDetectorOptions({ scoreThreshold: 0.5 })).withFaceLandmarks(true).withFaceDescriptor();
      if (!detection) { toast.error('No face found. Make sure your face is clearly visible.'); setStep('face_registration'); startRegistrationDetection(); return; }
      await axios.post(`${API}/scan/register-face`, { employee_id: employeeId.trim(), gate_token: token, face_descriptor: Array.from(detection.descriptor) });
      toast.success('Face registered successfully!');
      const updatedWm: WatchmanInfo = { ...regCtx.wm, face_registered: true, face_descriptor: Array.from(detection.descriptor) };
      setWatchman(updatedWm); stopCamera();
      verifyWatchmanRef.current = { wm: updatedWm, detectedMode: regCtx.detectedMode };
      requestGPS(updatedWm, regCtx.detectedMode);
    } catch (e: any) { toast.error(e.response?.data?.message || 'Failed to register face.'); setStep('face_registration'); startRegistrationDetection(); }
  }

  async function startCamera() {
    if (streamRef.current) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' }, audio: false });
      streamRef.current = stream;
    } catch { toast.error('Camera access denied.'); }
  }

  function stopCamera() {
    if (detectionIntervalRef.current) clearInterval(detectionIntervalRef.current);
    if (streamRef.current) { streamRef.current.getTracks().forEach(t => t.stop()); streamRef.current = null; }
  }

  function capturePhoto() {
    if (!videoRef.current || !canvasRef.current) return;
    const ctx = canvasRef.current.getContext('2d')!;
    canvasRef.current.width = videoRef.current.videoWidth;
    canvasRef.current.height = videoRef.current.videoHeight;
    ctx.drawImage(videoRef.current, 0, 0);
    const now = new Date();
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(0, canvasRef.current.height - 40, canvasRef.current.width, 40);
    ctx.fillStyle = '#ffffff'; ctx.font = 'bold 16px Inter, sans-serif';
    ctx.fillText(`${now.toLocaleDateString('en-IN')} ${now.toLocaleTimeString('en-IN')}`, 10, canvasRef.current.height - 14);
    const dataUrl = canvasRef.current.toDataURL('image/jpeg', 0.8);
    stopCamera(); setStep('submitting'); handleSubmit(dataUrl);
  }

  async function handleSubmit(photoUrl: string) {
    try {
      const endpoint = mode === 'checkin' ? '/scan/checkin' : '/scan/checkout';
      const body: any = { employee_id: employeeId.trim(), gate_token: token, selfie_url: photoUrl, latitude: gpsData?.latitude, longitude: gpsData?.longitude, gps_accuracy: gpsData?.accuracy, face_verified: faceVerified, face_match_score: faceMatchScore };
      if (mode === 'checkin') body.shift_id = selectedShiftId;
      const r = await axios.post(`${API}${endpoint}`, body);
      setSuccessMsg(r.data.message); setStep('success');
    } catch (e: any) { toast.error(e.response?.data?.message || 'Submission failed.'); setStep('take_photo'); startCamera(); }
  }

  async function handleDeliveryCheckin() {
    const { visitor_name, visitor_phone, delivery_company } = deliveryForm;
    if (!visitor_name.trim() || !visitor_phone.trim()) { toast.error('Name and phone are required'); return; }
    setStep('delivery_submitting');
    try {
      const r = await axios.post(`${API}/delivery/checkin`, {
        gate_token: token,
        visitor_name: visitor_name.trim(),
        visitor_phone: visitor_phone.trim(),
        vehicle_number: deliveryForm.vehicle_number.trim() || undefined,
        delivery_company,
      });
      const visitData = { visit_id: r.data.data.visit_id, check_in_time: r.data.data.check_in_time, visitor_name: visitor_name.trim() };
      localStorage.setItem(VISIT_KEY(token!), JSON.stringify(visitData));
      setDeliveryResult(r.data.data); setStep('delivery_success');
    } catch (e: any) { toast.error(e.response?.data?.message || 'Check-in failed'); setStep('delivery_form'); }
  }

  async function handleDeliveryCheckout() {
    if (!pendingVisit) return;
    setStep('delivery_submitting');
    try {
      const r = await axios.post(`${API}/delivery/checkout/${pendingVisit.visit_id}`);
      localStorage.removeItem(VISIT_KEY(token!));
      setPendingVisit(null);
      setDeliveryResult(r.data.data); setStep('delivery_success');
    } catch (e: any) { toast.error(e.response?.data?.message || 'Check-out failed'); setStep('delivery_checkout'); }
  }

  const currentTime = new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });

  return (
    <div className="min-h-screen bg-gradient-to-b from-surface-950 to-surface-900 flex flex-col items-center justify-center p-5 font-sans">
      <div className="text-center mb-6">
        <img src="/logo.png" alt="Logo" className="w-14 h-14 object-contain mb-2 mx-auto" />
        <div className="text-slate-400 text-sm font-medium flex items-center justify-center gap-1.5">
          <Clock className="w-3.5 h-3.5" /> {currentTime}
        </div>
      </div>

      <div className="bg-surface-900/50 backdrop-blur-xl border border-surface-800 rounded-2xl p-8 w-full max-w-md shadow-2xl">
        {gateInfo && step !== 'error' && (
          <div className="text-center mb-8">
            <div className="bg-brand-500/10 border border-brand-500/20 rounded-xl p-4 mb-3">
              <p className="text-brand-400 text-xs font-bold uppercase tracking-widest mb-1">{gateInfo.gate.name}</p>
              <h1 className="text-slate-100 text-xl font-bold">{gateInfo.society.name}</h1>
            </div>
            <p className="text-slate-400 text-xs">{gateInfo.society.address}</p>
          </div>
        )}

        {/* Loading */}
        {(step === 'loading' || step === 'submitting' || step === 'delivery_submitting') && (
          <div className="text-center py-10">
            <Loader2 className="w-10 h-10 text-brand-500 animate-spin mx-auto" />
            <p className="text-slate-400 mt-4 font-medium">
              {step === 'delivery_submitting' ? 'Recording visit...' : step === 'submitting' ? 'Recording attendance...' : 'Loading...'}
            </p>
          </div>
        )}

        {/* Error */}
        {step === 'error' && (
          <div className="text-center py-6">
            <AlertTriangle className="w-12 h-12 text-danger-400 mx-auto mb-3" />
            <h2 className="text-danger-400 text-lg font-bold">Error</h2>
            <p className="text-slate-400 mt-2">{errorMsg}</p>
          </div>
        )}

        {/* Mode Select */}
        {step === 'mode_select' && (
          <div className="space-y-4">
            <h2 className="text-slate-100 text-lg font-bold text-center mb-6">Who are you?</h2>
            {pendingVisit && (
              <div className="bg-warning-500/10 border border-warning-500/30 rounded-xl p-4 mb-2">
                <p className="text-warning-400 font-bold text-sm mb-1">⏱ Active Visit Detected</p>
                <p className="text-slate-300 text-sm">{pendingVisit.visitor_name}</p>
                <p className="text-slate-500 text-xs mt-0.5">Checked in at {new Date(pendingVisit.check_in_time).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true })}</p>
              </div>
            )}
            <button onClick={() => setStep('enter_id')} className="w-full p-5 rounded-xl border-2 border-brand-500/30 bg-brand-500/5 hover:bg-brand-500/10 text-left flex items-center gap-4 transition-all group">
              <div className="w-12 h-12 rounded-xl bg-brand-500/20 flex items-center justify-center shrink-0 group-hover:bg-brand-500/30 transition-colors">
                <ShieldCheck className="w-6 h-6 text-brand-400" />
              </div>
              <div>
                <p className="text-slate-100 font-bold">Security Guard</p>
                <p className="text-slate-400 text-sm">Mark attendance with Guard ID</p>
              </div>
            </button>

            {pendingVisit ? (
              <button onClick={() => setStep('delivery_checkout')} className="w-full p-5 rounded-xl border-2 border-warning-500/40 bg-warning-500/10 hover:bg-warning-500/15 text-left flex items-center gap-4 transition-all">
                <div className="w-12 h-12 rounded-xl bg-warning-500/20 flex items-center justify-center shrink-0">
                  <LogOut className="w-6 h-6 text-warning-400" />
                </div>
                <div>
                  <p className="text-slate-100 font-bold">Delivery Boy — Check Out</p>
                  <p className="text-slate-400 text-sm">Tap to record your departure</p>
                </div>
              </button>
            ) : (
              <button onClick={() => setStep('delivery_form')} className="w-full p-5 rounded-xl border-2 border-surface-700 bg-surface-800/50 hover:bg-surface-800 text-left flex items-center gap-4 transition-all group">
                <div className="w-12 h-12 rounded-xl bg-orange-500/20 flex items-center justify-center shrink-0 group-hover:bg-orange-500/30 transition-colors">
                  <Bike className="w-6 h-6 text-orange-400" />
                </div>
                <div>
                  <p className="text-slate-100 font-bold">Delivery Boy</p>
                  <p className="text-slate-400 text-sm">Zomato, Swiggy, Amazon, etc.</p>
                </div>
              </button>
            )}
          </div>
        )}

        {/* Guard: Enter ID */}
        {step === 'enter_id' && (
          <div className="space-y-4">
            <div className="flex items-center gap-2.5 mb-2">
              <User className="w-5 h-5 text-brand-400" />
              <h2 className="text-slate-100 text-lg font-bold">Enter Your Guard ID</h2>
            </div>
            {errorMsg && <div className="bg-danger-500/10 border border-danger-500/20 rounded-lg p-3 text-danger-400 text-sm">{errorMsg}</div>}
            <input type="text" placeholder="e.g. EMP001" value={employeeId} onChange={e => { setEmployeeId(e.target.value.toUpperCase()); setErrorMsg(''); }} onKeyDown={e => e.key === 'Enter' && handleLookup()} autoFocus className="w-full p-4 rounded-xl border border-surface-700 bg-surface-800 text-slate-100 text-lg font-bold tracking-widest text-center focus:border-brand-500 focus:ring-1 focus:ring-brand-500 outline-none transition-all placeholder-slate-500 uppercase" />
            <button onClick={handleLookup} disabled={!employeeId.trim()} className={`w-full mt-4 p-4 rounded-xl font-bold transition-all ${employeeId.trim() ? 'bg-brand-600 hover:bg-brand-500 text-white shadow-lg shadow-brand-500/25' : 'bg-surface-800 text-slate-500 cursor-not-allowed'}`}>Continue &rarr;</button>
            <button onClick={() => setStep('mode_select')} className="w-full text-center text-slate-500 text-sm hover:text-slate-300 transition-colors py-1">← Back</button>
          </div>
        )}

        {/* Guard: GPS */}
        {step === 'get_gps' && (
          <div className="text-center py-10">
            <MapPin className="w-12 h-12 text-brand-500 mx-auto mb-4 animate-bounce" />
            <h2 className="text-slate-100 text-lg font-bold">Getting Location...</h2>
            <p className="text-slate-400 text-sm mt-2">Please allow location access if prompted.</p>
          </div>
        )}

        {/* Guard: Face Registration */}
        {step === 'face_registration' && (
          <div className="space-y-4">
            <div className="flex items-center gap-2 mb-2">
              <ShieldCheck className="w-5 h-5 text-brand-400" />
              <h2 className="text-slate-100 text-lg font-bold">First Time Face Setup</h2>
            </div>
            <p className="text-slate-400 text-sm mb-4">Please look directly at the camera to register your face.</p>
            <div className={`rounded-xl overflow-hidden aspect-4/3 flex items-center justify-center relative border-2 ${faceDetected ? 'border-success-500 shadow-lg shadow-success-500/20' : 'border-surface-700'}`}>
              <video ref={videoCallbackRef} autoPlay playsInline muted className="w-full h-full object-cover scale-x-[-1]" />
              {!faceDetected && <div className="absolute inset-0 flex items-center justify-center bg-black/40"><p className="text-white font-medium bg-black/60 px-3 py-1 rounded-full text-sm backdrop-blur-sm">No face detected</p></div>}
            </div>
            <button onClick={registerFace} disabled={!modelsLoaded || !faceDetected} className={`w-full p-4 rounded-xl font-bold flex items-center justify-center gap-2 text-white shadow-lg transition-all ${faceDetected ? 'bg-brand-600 hover:bg-brand-500' : 'bg-surface-800 text-slate-500 cursor-not-allowed'}`}>
              <ScanFace className="w-5 h-5" /> Register My Face
            </button>
          </div>
        )}

        {/* Guard: Face Verification */}
        {step === 'face_verification' && (
          <div className="space-y-4">
            <div className="text-center">
              <div className="bg-brand-500/10 text-brand-400 mx-auto inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold mb-2">
                <ShieldCheck className="w-3.5 h-3.5" />
                {faceVerified === false ? 'Face Mismatch' : 'Face Verification'}
              </div>
              <h2 className="text-slate-100 text-xl font-bold">{faceVerified === false ? 'Verification Failed' : 'Verify Your Identity'}</h2>
              <p className="text-slate-400 text-sm">{faceVerified === false ? 'Your face did not match your registered photo.' : 'Look straight at the camera. Press verify when ready.'}</p>
            </div>
            {faceVerified === false ? (
              <div className="bg-danger-500/10 border border-danger-500/30 rounded-xl p-6 flex flex-col items-center gap-4">
                <div className="w-16 h-16 rounded-full bg-danger-500/20 border-2 border-danger-500 flex items-center justify-center"><AlertTriangle className="w-8 h-8 text-danger-400" /></div>
                <p className="text-danger-400 font-bold text-lg">Face Mismatch ✕</p>
                <p className="text-slate-400 text-sm text-center">Attendance cannot be marked. If this is a mistake, please try again in better lighting.</p>
                <button onClick={() => { const ctx = verifyWatchmanRef.current; if (!ctx) return; setFaceVerified(null); startFaceVerificationFlow(ctx.wm, ctx.detectedMode); }} className="w-full mt-2 p-4 rounded-xl font-bold bg-danger-600 hover:bg-danger-500 text-white shadow-lg transition-all">Try Again</button>
              </div>
            ) : (
              <>
                <div className="rounded-xl overflow-hidden bg-surface-950 aspect-[4/3] relative border border-surface-700">
                  <video ref={videoCallbackRef} autoPlay playsInline muted className="w-full h-full object-cover scale-x-[-1]" />
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    <div className={`w-48 h-56 rounded-full border-4 transition-colors duration-300 ${faceDetected ? 'border-success-400' : 'border-white/30 border-dashed'}`} />
                  </div>
                  {faceDetected && (
                    <div className="absolute bottom-3 left-0 right-0 flex justify-center">
                      <span className="bg-success-500 text-white text-xs font-bold px-3 py-1 rounded-full flex items-center gap-1.5 shadow-lg"><CheckCircle className="w-3.5 h-3.5" /> Face Detected ✓</span>
                    </div>
                  )}
                </div>
                <button
                  onClick={async () => {
                    if (!videoRef.current) return;
                    const ctx = verifyWatchmanRef.current;
                    if (!ctx) { toast.error('Verification context lost. Please rescan.'); return; }
                    setFaceVerified(null);
                    const detection = await faceapi.detectSingleFace(videoRef.current, new faceapi.TinyFaceDetectorOptions({ scoreThreshold: 0.5 })).withFaceLandmarks(true).withFaceDescriptor();
                    if (detection && ctx.wm.face_descriptor) {
                      const stored = new Float32Array(ctx.wm.face_descriptor);
                      const distance = faceapi.euclideanDistance(Array.from(stored), Array.from(detection.descriptor));
                      if (distance < FACE_MATCH_THRESHOLD) {
                        if (detectionIntervalRef.current) clearInterval(detectionIntervalRef.current);
                        setFaceVerified(true); setFaceMatchScore(distance);
                        toast.success('Face Verified!');
                        if (ctx.detectedMode === 'checkin') setStep('select_shift');
                        else setStep('take_photo');
                      } else { setFaceVerified(false); }
                    } else { toast.error('No face detected. Ensure good lighting.'); }
                  }}
                  disabled={!faceDetected}
                  className={`w-full p-4 rounded-xl font-bold flex items-center justify-center gap-2 text-white shadow-lg transition-all ${faceDetected ? 'bg-brand-600 hover:bg-brand-500' : 'bg-surface-700 text-slate-500 cursor-not-allowed'}`}
                >
                  <ScanFace className="w-5 h-5" /> {faceDetected ? 'Verify My Face' : 'Waiting for face...'}
                </button>
              </>
            )}
          </div>
        )}

        {/* Guard: Select Shift */}
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
                <button key={s.id} onClick={() => setSelectedShiftId(s.id)} className={`w-full p-4 rounded-xl border-2 text-left flex justify-between items-center transition-all ${selectedShiftId === s.id ? 'border-brand-500 bg-brand-500/10 text-slate-100' : 'border-surface-700 bg-surface-800/50 text-slate-300'}`}>
                  <span className="font-semibold">{s.name}</span>
                  <span className="text-slate-400 text-xs">{s.start_time} &ndash; {s.end_time}</span>
                </button>
              ))}
            </div>
            <button onClick={() => setStep('take_photo')} disabled={!selectedShiftId} className={`w-full mt-4 p-4 rounded-xl font-bold flex items-center justify-center gap-2 transition-all ${selectedShiftId ? 'bg-brand-600 hover:bg-brand-500 text-white' : 'bg-surface-800 text-slate-500'}`}>
              <Camera className="w-5 h-5" /> Take Check-in Photo &rarr;
            </button>
          </div>
        )}

        {/* Guard: Take Photo */}
        {step === 'take_photo' && (
          <div className="space-y-4">
            <div className="flex items-center gap-2 mb-2">
              {mode === 'checkin' ? <LogIn className="w-5 h-5 text-success-400" /> : <LogOut className="w-5 h-5 text-warning-400" />}
              <h2 className="text-slate-100 text-lg font-bold">{mode === 'checkin' ? 'Check-In Photo' : 'Check-Out Photo'}</h2>
            </div>
            {mode === 'checkout' && existingRecord && (
              <div className="bg-warning-500/10 border border-warning-500/20 rounded-lg p-3 text-warning-400 text-sm mb-2">
                Checked in at {new Date(existingRecord.check_in_time).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true })}
              </div>
            )}
            <div className="rounded-xl overflow-hidden bg-surface-950 aspect-4/3 relative border border-surface-700">
              <video ref={videoCallbackRef} autoPlay playsInline muted className="w-full h-full object-cover scale-x-[-1]" />
            </div>
            <canvas ref={canvasRef} className="hidden" />
            <button onClick={capturePhoto} className={`w-full p-4 rounded-xl font-bold flex items-center justify-center gap-2 text-white shadow-lg transition-all ${mode === 'checkin' ? 'bg-success-600 hover:bg-success-500' : 'bg-warning-600 hover:bg-warning-500'}`}>
              {mode === 'checkin' ? <><LogIn className="w-5 h-5" /> Mark Check-In</> : <><LogOut className="w-5 h-5" /> Mark Check-Out</>}
            </button>
          </div>
        )}

        {/* Guard: Success */}
        {step === 'success' && (
          <div className="text-center py-6">
            <div className={`w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-6 ${successMsg.includes('LATE') ? 'bg-warning-500/10 text-warning-400' : 'bg-success-500/10 text-success-400'}`}>
              <CheckCircle className="w-10 h-10" />
            </div>
            <h2 className="text-slate-100 text-2xl font-bold mb-2">{successMsg.includes('LATE') ? 'Late Arrival' : mode === 'checkin' ? 'Checked In!' : 'Checked Out!'}</h2>
            <p className="text-slate-400 text-sm leading-relaxed mb-6">{successMsg}</p>
          </div>
        )}

        {/* Delivery: Form */}
        {step === 'delivery_form' && (
          <div className="space-y-4">
            <div className="flex items-center gap-2.5 mb-2">
              <Bike className="w-5 h-5 text-orange-400" />
              <h2 className="text-slate-100 text-lg font-bold">Delivery Check-In</h2>
            </div>
            <div>
              <label className="text-slate-400 text-xs font-semibold uppercase tracking-wider block mb-2">Delivery Company</label>
              <div className="flex flex-wrap gap-2">
                {DELIVERY_COMPANIES.map(c => (
                  <button key={c} onClick={() => setDeliveryForm(f => ({ ...f, delivery_company: c }))}
                    className={`px-3 py-1.5 rounded-full text-sm font-bold border-2 transition-all ${deliveryForm.delivery_company === c ? 'border-transparent text-white' : 'border-surface-600 text-slate-400 bg-surface-800 hover:border-surface-500'}`}
                    style={deliveryForm.delivery_company === c ? { backgroundColor: COMPANY_COLORS[c] || '#64748b' } : {}}
                  >{c}</button>
                ))}
              </div>
            </div>
            <div>
              <label className="text-slate-400 text-xs font-semibold uppercase tracking-wider block mb-1.5">Your Name *</label>
              <input type="text" placeholder="Full name" value={deliveryForm.visitor_name} onChange={e => setDeliveryForm(f => ({ ...f, visitor_name: e.target.value }))} className="w-full p-3.5 rounded-xl border border-surface-700 bg-surface-800 text-slate-100 focus:border-orange-500 focus:ring-1 focus:ring-orange-500 outline-none transition-all placeholder-slate-500" />
            </div>
            <div>
              <label className="text-slate-400 text-xs font-semibold uppercase tracking-wider block mb-1.5">Phone Number *</label>
              <input type="tel" placeholder="10-digit mobile number" value={deliveryForm.visitor_phone} onChange={e => setDeliveryForm(f => ({ ...f, visitor_phone: e.target.value }))} className="w-full p-3.5 rounded-xl border border-surface-700 bg-surface-800 text-slate-100 focus:border-orange-500 focus:ring-1 focus:ring-orange-500 outline-none transition-all placeholder-slate-500" />
            </div>
            <div>
              <label className="text-slate-400 text-xs font-semibold uppercase tracking-wider block mb-1.5">Vehicle Number <span className="text-slate-600 font-normal normal-case">(optional)</span></label>
              <input type="text" placeholder="e.g. MH01AB1234" value={deliveryForm.vehicle_number} onChange={e => setDeliveryForm(f => ({ ...f, vehicle_number: e.target.value.toUpperCase() }))} className="w-full p-3.5 rounded-xl border border-surface-700 bg-surface-800 text-slate-100 font-mono uppercase focus:border-orange-500 focus:ring-1 focus:ring-orange-500 outline-none transition-all placeholder-slate-500" />
            </div>
            <button onClick={handleDeliveryCheckin} disabled={!deliveryForm.visitor_name.trim() || !deliveryForm.visitor_phone.trim()} className={`w-full p-4 rounded-xl font-bold flex items-center justify-center gap-2 text-white shadow-lg transition-all ${deliveryForm.visitor_name.trim() && deliveryForm.visitor_phone.trim() ? 'bg-orange-600 hover:bg-orange-500' : 'bg-surface-800 text-slate-500 cursor-not-allowed'}`}>
              <LogIn className="w-5 h-5" /> Mark Entry
            </button>
            <button onClick={() => setStep('mode_select')} className="w-full text-center text-slate-500 text-sm hover:text-slate-300 transition-colors py-1">← Back</button>
          </div>
        )}

        {/* Delivery: Checkout Confirmation */}
        {step === 'delivery_checkout' && pendingVisit && (
          <div className="space-y-4">
            <div className="text-center mb-2">
              <div className="w-16 h-16 rounded-full bg-warning-500/10 border-2 border-warning-500/30 flex items-center justify-center mx-auto mb-4">
                <LogOut className="w-8 h-8 text-warning-400" />
              </div>
              <h2 className="text-slate-100 text-xl font-bold">Confirm Departure</h2>
            </div>
            <div className="bg-surface-800 rounded-xl p-4 space-y-2">
              <div className="flex justify-between">
                <span className="text-slate-500 text-sm">Visitor</span>
                <span className="text-slate-200 font-semibold text-sm">{pendingVisit.visitor_name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500 text-sm">Checked in at</span>
                <span className="text-slate-200 text-sm">{new Date(pendingVisit.check_in_time).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true })}</span>
              </div>
            </div>
            <button onClick={handleDeliveryCheckout} className="w-full p-4 rounded-xl font-bold flex items-center justify-center gap-2 bg-warning-600 hover:bg-warning-500 text-white shadow-lg transition-all">
              <LogOut className="w-5 h-5" /> Confirm Check-Out
            </button>
            <button onClick={() => setStep('mode_select')} className="w-full text-center text-slate-500 text-sm hover:text-slate-300 transition-colors py-1">← Back</button>
          </div>
        )}

        {/* Delivery: Success */}
        {step === 'delivery_success' && deliveryResult && (
          <div className="text-center py-6">
            <div className="w-20 h-20 rounded-full bg-success-500/10 flex items-center justify-center mx-auto mb-6">
              <CheckCircle className="w-10 h-10 text-success-400" />
            </div>
            <h2 className="text-slate-100 text-2xl font-bold mb-2">{deliveryResult.check_out_time ? 'Goodbye!' : 'Welcome!'}</h2>
            <p className="text-slate-400 text-sm mb-6">
              {deliveryResult.check_out_time
                ? `Check-out recorded. Duration: ${deliveryResult.duration_minutes} min.`
                : `Check-in recorded at ${new Date(deliveryResult.check_in_time).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true })}. Scan again when you leave.`}
            </p>
            {!deliveryResult.check_out_time && (
              <div className="bg-brand-500/10 border border-brand-500/20 rounded-xl p-4">
                <Package className="w-6 h-6 text-brand-400 mx-auto mb-2" />
                <p className="text-slate-400 text-xs">Scan this QR code again when you leave to record your departure.</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
