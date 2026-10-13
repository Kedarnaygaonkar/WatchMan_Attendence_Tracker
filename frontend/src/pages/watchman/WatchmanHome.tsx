/**
 * WatchmanHome — The core watchman experience.
 *
 * Every screen is designed to fit within 100dvh with no scrolling on any device.
 * GPS + face models start loading in parallel as soon as the user is on the home screen.
 */

import { useState, useRef, useCallback, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import * as faceapi from 'face-api.js';
import {
  MapPin, Clock, Building2, CheckCircle2, AlertCircle,
  Camera, RefreshCw, Wifi, WifiOff, ChevronRight, Loader2,
  ShieldCheck, Navigation, ScanFace
} from 'lucide-react';
import api from '../../api/client';
import { useAuthStore } from '../../stores/authStore';
import { offlineQueue } from '../../offline/attendanceQueue';
import { v4 as uuidv4 } from 'uuid';
import toast from 'react-hot-toast';

type Step = 'home' | 'gps' | 'face_verify' | 'camera' | 'submitting' | 'success' | 'failed';

interface Assignment {
  id: string;
  shift_id: string;
  society_id: string;
  society_name: string;
  society_address: string;
  society_lat: number;
  society_lon: number;
  geofence_radius: number;
  shift_name: string;
  start_time: string;
  end_time: string;
  is_overnight: boolean;
  late_threshold_minutes: number;
  agency_banner_url?: string | null;
  agency_footer_url?: string | null;
  agency_name?: string | null;
  agency_logo_url?: string | null;
  agency_background_url?: string | null;
}

interface AttendanceRecord {
  status: string;
  check_in_time: string;
  verification_status: string;
}

function formatTimeDisplay(time: string) {
  const [h, m] = time.slice(0, 5).split(':').map(Number);
  const period = h >= 12 ? 'PM' : 'AM';
  const hour = h % 12 || 12;
  return `${hour}:${m.toString().padStart(2, '0')} ${period}`;
}

function formatTimestamp(isoString: string) {
  return new Date(isoString).toLocaleTimeString('en-IN', {
    hour: '2-digit', minute: '2-digit', hour12: true
  });
}

// Singleton model loading — shared across renders
let faceModelsPromise: Promise<void> | null = null;
function ensureFaceModels(): Promise<void> {
  if (!faceModelsPromise) {
    faceModelsPromise = Promise.all([
      faceapi.nets.tinyFaceDetector.loadFromUri('/models'),
      faceapi.nets.faceLandmark68TinyNet.loadFromUri('/models'),
      faceapi.nets.faceRecognitionNet.loadFromUri('/models'),
    ]).then(() => {});
  }
  return faceModelsPromise;
}

export default function WatchmanHome() {
  const { user } = useAuthStore();
  const [step, setStep] = useState<Step>('home');
  const [gpsData, setGpsData] = useState<GeolocationCoordinates | null>(null);
  const [gpsError, setGpsError] = useState('');
  const [capturedPhoto, setCapturedPhoto] = useState<string | null>(null);
  const [capturedBlob, setCapturedBlob] = useState<Blob | null>(null);
  const [submitError, setSubmitError] = useState('');
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [pendingCount, setPendingCount] = useState(0);
  const [successData, setSuccessData] = useState<{status: string; time: string; society: string} | null>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  const faceVideoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const faceStreamRef = useRef<MediaStream | null>(null);
  const faceDetectionInterval = useRef<ReturnType<typeof setInterval> | null>(null);

  // Face verification state
  const [faceVerified, setFaceVerified] = useState<boolean | null>(null);
  const [faceMatchScore, setFaceMatchScore] = useState<number | null>(null);
  const [faceDetecting, setFaceDetecting] = useState(false);
  const [faceLiveDetected, setFaceLiveDetected] = useState(false);
  const [faceModelsLoaded, setFaceModelsLoaded] = useState(false);

  const FACE_MATCH_THRESHOLD = 0.45;

  // Pre-load face models immediately on mount (singleton, won't double-load)
  useEffect(() => {
    ensureFaceModels().then(() => setFaceModelsLoaded(true)).catch(() => {});
  }, []);

  // Online/offline tracking
  useEffect(() => {
    const onOnline = async () => {
      setIsOnline(true);
      await syncOfflineQueue();
    };
    const onOffline = () => setIsOnline(false);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    offlineQueue.getPendingCount().then(setPendingCount);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, []);

  // Fetch today's assignment
  const { data: assignmentData, isLoading, refetch } = useQuery({
    queryKey: ['my-assignment', user?.watchman?.id],
    queryFn: async () => {
      const { data } = await api.get('/attendance/my-assignment');
      return data;
    },
    enabled: !!user?.watchman,
    refetchInterval: 2 * 60 * 1000,
  });

  const assignment: Assignment | null = assignmentData?.data;
  const attendance: AttendanceRecord | null = assignmentData?.attendance;
  const alreadyMarked = !!attendance;

  // ── Step: Get GPS ─────────────────────────────────────────────────
  const getGPS = useCallback(() => {
    setStep('gps');
    setGpsError('');

    if (!navigator.geolocation) {
      setGpsError('Your device does not support location services.');
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        setGpsData(position.coords);
        startFaceVerification();
      },
      (error) => {
        let msg = 'Please turn on Location and try again.';
        if (error.code === 1) msg = 'Location access denied. Please enable Location in your browser settings and try again.';
        if (error.code === 2) msg = 'Unable to determine your location. Please try again.';
        if (error.code === 3) msg = 'Location request timed out. Please try again.';
        setGpsError(msg);
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 } // faster: 10s timeout, allow 30s cached GPS
    );
  }, []);

  // ── Face Verification ─────────────────────────────────────────────
  const startFaceVerification = useCallback(async () => {
    setFaceVerified(null);
    setFaceMatchScore(null);
    setFaceLiveDetected(false);
    setFaceDetecting(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 320 }, height: { ideal: 240 } }, // lower res = faster on mobile
        audio: false,
      });
      faceStreamRef.current = stream;
      setStep('face_verify');
    } catch {
      toast.error('Camera access required for face verification.');
      setStep('home');
      setFaceDetecting(false);
    }
  }, []);

  const stopFaceVerification = useCallback(() => {
    if (faceDetectionInterval.current) {
      clearTimeout(faceDetectionInterval.current);
      faceDetectionInterval.current = null;
    }
    if (faceStreamRef.current) {
      faceStreamRef.current.getTracks().forEach(t => t.stop());
      faceStreamRef.current = null;
    }
    setFaceDetecting(false);
    setFaceLiveDetected(false);
  }, []);

  const runFaceVerification = useCallback(async () => {
    if (!faceVideoRef.current) return;
    setFaceDetecting(false);

    try {
      const { data } = await api.get('/watchmen/face-status');
      const storedDescriptorArr: number[] | null = data.data.face_descriptor;

      if (!storedDescriptorArr) {
        setFaceVerified(true);
        setFaceMatchScore(0);
        stopFaceVerification();
        startCamera();
        return;
      }

      const detection = await faceapi
        .detectSingleFace(faceVideoRef.current, new faceapi.TinyFaceDetectorOptions({ scoreThreshold: 0.5 }))
        .withFaceLandmarks(true)
        .withFaceDescriptor();

      if (!detection) {
        toast.error('No face detected. Try in better lighting.');
        setStep('home');
        stopFaceVerification();
        return;
      }

      const stored = new Float32Array(storedDescriptorArr);
      const distance = faceapi.euclideanDistance(Array.from(stored), Array.from(detection.descriptor));
      const verified = distance < FACE_MATCH_THRESHOLD;

      setFaceVerified(verified);
      setFaceMatchScore(distance);
      stopFaceVerification();

      if (verified) {
        startCamera();
      } else {
        setStep('face_verify');
      }
    } catch (err) {
      console.error('Face verification error:', err);
      toast.error('Face verification failed. Please try again.');
      stopFaceVerification();
      setStep('home');
    }
  }, [stopFaceVerification]);

  // ── Camera ────────────────────────────────────────────────────────
  const startCamera = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 480 }, height: { ideal: 640 } },
        audio: false,
      });
      streamRef.current = stream;
      setStep('camera');
    } catch {
      toast.error('Camera access denied. Please enable camera access.');
      setStep('home');
    }
  }, []);

  // Attach face-verify stream after face_verify screen renders
  useEffect(() => {
    if (step === 'face_verify' && faceVideoRef.current && faceStreamRef.current) {
      faceVideoRef.current.srcObject = faceStreamRef.current;
      if (!faceDetectionInterval.current) {
        let isRunning = true;
        const detectLoop = async () => {
          if (!isRunning) return;
          if (faceVideoRef.current && faceVideoRef.current.readyState >= 2) {
            try {
              const detection = await faceapi
                .detectSingleFace(faceVideoRef.current, new faceapi.TinyFaceDetectorOptions({ scoreThreshold: 0.5 }))
                .withFaceLandmarks(true);
              setFaceLiveDetected(!!detection);
            } catch { /* ignore */ }
          }
          if (isRunning) {
            faceDetectionInterval.current = setTimeout(detectLoop, 400); // 400ms is enough on mobile
          }
        };
        faceDetectionInterval.current = setTimeout(detectLoop, 0);
        return () => {
          isRunning = false;
          if (faceDetectionInterval.current) clearTimeout(faceDetectionInterval.current);
        };
      }
    }
  }, [step]);

  // Attach selfie camera stream
  useEffect(() => {
    if (step === 'camera' && videoRef.current && streamRef.current) {
      videoRef.current.srcObject = streamRef.current;
    }
  }, [step]);

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
  }, []);

  const capturePhoto = useCallback(() => {
    if (!videoRef.current || !canvasRef.current) return;
    const video = videoRef.current;
    const canvas = canvasRef.current;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(video, 0, 0);
    const now = new Date();
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(0, canvas.height - 40, canvas.width, 40);
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 16px Inter, sans-serif';
    ctx.fillText(`${now.toLocaleDateString('en-IN')} ${now.toLocaleTimeString('en-IN')}`, 10, canvas.height - 14);
    canvas.toBlob((blob) => {
      if (blob) {
        setCapturedBlob(blob);
        setCapturedPhoto(canvas.toDataURL('image/jpeg', 0.8));
      }
    }, 'image/jpeg', 0.8);
  }, []);

  const retakePhoto = useCallback(() => {
    setCapturedPhoto(null);
    setCapturedBlob(null);
  }, []);

  // ── Submit attendance ─────────────────────────────────────────────
  const submitAttendance = useCallback(async () => {
    if (!gpsData || !assignment) return;
    setSubmitError('');
    setStep('submitting');
    stopCamera();

    const formData = new FormData();
    formData.append('assignmentId', assignment.id);
    formData.append('latitude', String(gpsData.latitude));
    formData.append('longitude', String(gpsData.longitude));
    formData.append('gpsAccuracy', String(gpsData.accuracy));
    formData.append('clientTimestamp', new Date().toISOString());
    formData.append('isOfflineSync', 'false');
    formData.append('deviceInfo', JSON.stringify({ userAgent: navigator.userAgent, platform: navigator.platform }));
    if (capturedBlob) formData.append('selfie', capturedBlob, 'selfie.jpg');
    if (faceVerified !== null) formData.append('faceVerified', String(faceVerified));
    if (faceMatchScore !== null) formData.append('faceMatchScore', String(faceMatchScore));

    if (!isOnline) {
      const record = {
        id: uuidv4(), assignmentId: assignment.id, latitude: gpsData.latitude,
        longitude: gpsData.longitude, gpsAccuracy: gpsData.accuracy,
        clientTimestamp: new Date().toISOString(), selfieDataUrl: capturedPhoto || undefined,
        deviceInfo: { userAgent: navigator.userAgent }, createdAt: new Date().toISOString(), syncStatus: 'pending' as const,
      };
      await offlineQueue.add(record);
      setPendingCount(prev => prev + 1);
      setSuccessData({ status: 'offline', time: new Date().toLocaleTimeString('en-IN'), society: assignment.society_name });
      setStep('success');
      return;
    }

    try {
      const { data } = await api.post('/attendance/mark', formData, { headers: { 'Content-Type': 'multipart/form-data' } });
      if (data.success) {
        setSuccessData({
          status: data.data.status,
          time: new Date(data.data.check_in_time).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true }),
          society: data.data.societyName,
        });
        setStep('success');
        refetch();
      }
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message || 'Something went wrong. Please try again.';
      setSubmitError(msg);
      setStep('failed');
    }
  }, [gpsData, assignment, capturedBlob, capturedPhoto, isOnline, stopCamera, refetch, faceVerified, faceMatchScore]);

  // ── Sync offline queue ────────────────────────────────────────────
  const syncOfflineQueue = async () => {
    const pending = await offlineQueue.getPending();
    if (pending.length === 0) return;
    toast.success(`Syncing ${pending.length} offline record${pending.length > 1 ? 's' : ''}...`);
    for (const record of pending) {
      await offlineQueue.updateStatus(record.id, 'syncing');
      try {
        const formData = new FormData();
        formData.append('assignmentId', record.assignmentId);
        formData.append('latitude', String(record.latitude));
        formData.append('longitude', String(record.longitude));
        formData.append('gpsAccuracy', String(record.gpsAccuracy));
        formData.append('clientTimestamp', record.clientTimestamp);
        formData.append('isOfflineSync', 'true');
        if (record.selfieDataUrl) {
          const res = await fetch(record.selfieDataUrl);
          const blob = await res.blob();
          formData.append('selfie', blob, 'selfie.jpg');
        }
        await api.post('/attendance/mark', formData, { headers: { 'Content-Type': 'multipart/form-data' } });
        await offlineQueue.remove(record.id);
      } catch {
        await offlineQueue.updateStatus(record.id, 'failed', 'Sync failed');
      }
    }
    const remaining = await offlineQueue.getPendingCount();
    setPendingCount(remaining);
    toast.success('Offline attendance synced!');
    refetch();
  };

  // Reset to home
  const resetToHome = useCallback(() => {
    stopCamera();
    stopFaceVerification();
    setStep('home');
    setGpsData(null);
    setGpsError('');
    setCapturedPhoto(null);
    setCapturedBlob(null);
    setSubmitError('');
    setSuccessData(null);
    setFaceVerified(null);
    setFaceMatchScore(null);
  }, [stopCamera, stopFaceVerification]);

  // ────────────────────────────────────────────────────────────────
  // RENDER — all screens use h-[100dvh] flex-col so nothing scrolls
  // ────────────────────────────────────────────────────────────────

  // Wrapper for non-home screens — fixed overlay so WatchmanLayout header is covered
  const FullScreen = ({ children }: { children: React.ReactNode }) => (
    <div className="fixed inset-0 z-50 flex flex-col w-full bg-surface-950 overflow-hidden">
      {children}
    </div>
  );

  if (isLoading) {
    return (
      <FullScreen>
        <div className="flex-1 flex flex-col items-center justify-center gap-4">
          <Loader2 className="w-12 h-12 animate-spin text-brand-400" />
          <p className="text-slate-400 text-sm">Loading your assignment...</p>
        </div>
      </FullScreen>
    );
  }

  // ── SUCCESS screen ────────────────────────────────────────────────
  if (step === 'success' && successData) {
    const isOfflineRecord = successData.status === 'offline';
    return (
      <FullScreen>
        <div className="flex-1 flex flex-col items-center justify-center p-6 gap-5 animate-fade-in">
          <div className={`w-24 h-24 rounded-full flex items-center justify-center shadow-2xl ${
            isOfflineRecord ? 'bg-warning-500/20 border-2 border-warning-500' : 'bg-success-500/20 border-2 border-success-500'
          }`}>
            {isOfflineRecord ? <WifiOff className="w-12 h-12 text-warning-400" /> : <CheckCircle2 className="w-12 h-12 text-success-400" />}
          </div>
          <div className="text-center space-y-2">
            {isOfflineRecord ? (
              <>
                <h2 className="text-2xl font-black text-warning-400">Saved Offline</h2>
                <p className="text-slate-400 text-sm">Saved at <strong className="text-slate-200">{successData.time}</strong>. Will sync when online.</p>
              </>
            ) : (
              <>
                <h2 className="text-3xl font-black text-success-400">
                  {successData.status === 'late' ? 'Marked Late' : 'Attendance Marked!'}
                </h2>
                <p className="text-4xl font-black text-slate-100">{successData.time}</p>
                <p className="text-slate-400 text-sm">{successData.society}</p>
                {successData.status === 'late' && (
                  <div className="p-3 rounded-xl bg-warning-500/10 border border-warning-500/20">
                    <p className="text-warning-400 text-sm">⚠ You were marked late. Please arrive on time tomorrow.</p>
                  </div>
                )}
                <p className="text-success-400 text-sm font-medium">✓ Location Verified</p>
              </>
            )}
          </div>
          <button onClick={resetToHome} className="btn-outline w-full max-w-xs py-3">Back to Home</button>
        </div>
      </FullScreen>
    );
  }

  // ── CAMERA screen ─────────────────────────────────────────────────
  if (step === 'camera' || step === 'submitting') {
    return (
      <FullScreen>
        <div className="flex flex-col h-full px-4 pt-3 pb-3 gap-2 animate-fade-in max-w-sm mx-auto w-full">
          {/* Header — ultra-compact */}
          <div className="text-center shrink-0">
            <div className="badge-present mx-auto inline-flex mb-0.5">
              <ShieldCheck className="w-3.5 h-3.5" /> Location Verified
            </div>
            <h2 className="text-base font-bold text-slate-100 leading-tight">Take Your Photo</h2>
            <p className="text-slate-500 text-xs leading-none">This confirms your attendance</p>
          </div>

          {/* Camera feed — fills remaining space */}
          <div className="relative flex-1 rounded-2xl overflow-hidden bg-surface-800 shadow-2xl ring-2 ring-white/10 border border-white/20 min-h-0">
            {capturedPhoto ? (
              <img src={capturedPhoto} alt="Selfie" className="w-full h-full object-cover" />
            ) : (
              <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover scale-x-[-1]" />
            )}
            <canvas ref={canvasRef} className="hidden" />
            {!capturedPhoto && (
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className="w-36 h-36 rounded-full border-2 border-white/30 border-dashed" />
              </div>
            )}
          </div>

          {/* Buttons — always at bottom */}
          <div className="shrink-0 space-y-1.5">
            {capturedPhoto ? (
              <>
                <button onClick={submitAttendance} disabled={step === 'submitting'} className="btn-success w-full py-3 text-base">
                  {step === 'submitting'
                    ? <><Loader2 className="w-5 h-5 animate-spin" /> Submitting...</>
                    : <><CheckCircle2 className="w-5 h-5" /> Submit Attendance</>}
                </button>
                <button onClick={retakePhoto} className="btn-ghost w-full py-1.5 text-sm">
                  <RefreshCw className="w-4 h-4" /> Retake Photo
                </button>
              </>
            ) : (
              <button onClick={capturePhoto} className="btn-primary w-full py-3 text-base">
                <Camera className="w-6 h-6" /> Capture Photo
              </button>
            )}
            <button onClick={resetToHome} className="btn-ghost w-full py-1 text-xs text-slate-500">Cancel</button>
          </div>
        </div>
      </FullScreen>
    );
  }

  // ── GPS LOADING screen ────────────────────────────────────────────
  if (step === 'gps') {
    return (
      <FullScreen>
        <div className="flex-1 flex flex-col items-center justify-center p-6 gap-6 animate-fade-in">
          {gpsError ? (
            <>
              <div className="w-20 h-20 rounded-full bg-danger-500/20 border-2 border-danger-500 flex items-center justify-center">
                <AlertCircle className="w-10 h-10 text-danger-400" />
              </div>
              <div className="text-center space-y-2">
                <h2 className="text-xl font-bold text-slate-100">Location Error</h2>
                <p className="text-slate-400 text-sm">{gpsError}</p>
              </div>
              <div className="w-full max-w-xs space-y-2">
                <button onClick={getGPS} className="btn-primary w-full py-4"><Navigation className="w-5 h-5" /> Try Again</button>
                <button onClick={resetToHome} className="btn-ghost w-full py-3">Cancel</button>
              </div>
            </>
          ) : (
            <>
              <div className="relative w-20 h-20">
                <div className="absolute inset-0 rounded-full bg-brand-500/20 animate-ping" />
                <div className="relative w-20 h-20 rounded-full bg-brand-500/30 border-2 border-brand-500 flex items-center justify-center">
                  <Navigation className="w-9 h-9 text-brand-400 animate-bounce-gentle" />
                </div>
              </div>
              <div className="text-center space-y-1">
                <h2 className="text-xl font-bold text-slate-100">Getting Location...</h2>
                <p className="text-slate-400 text-sm">Make sure Location is enabled in your phone settings.</p>
              </div>
            </>
          )}
        </div>
      </FullScreen>
    );
  }

  // ── FACE VERIFICATION screen ──────────────────────────────────────
  if (step === 'face_verify') {
    const isMismatch = faceVerified === false;
    return (
      <FullScreen>
        <div className="flex flex-col h-full px-4 pt-3 pb-3 gap-2 animate-fade-in max-w-sm mx-auto w-full">
          {/* Header — ultra-compact */}
          <div className="text-center shrink-0">
            <div className={`badge-present mx-auto inline-flex mb-0.5 ${isMismatch ? 'badge-absent' : ''}`}>
              <ShieldCheck className="w-3.5 h-3.5" />
              {isMismatch ? 'Face Mismatch' : 'Face Verification'}
            </div>
            <h2 className="text-base font-bold text-slate-100 leading-tight">
              {isMismatch ? 'Attendance Blocked' : 'Verify Your Identity'}
            </h2>
            <p className="text-slate-500 text-xs leading-none">
              {isMismatch ? 'Your face did not match your registered photo.' : 'Look straight at the camera. Press verify when ready.'}
            </p>
          </div>

          {/* Camera or mismatch view — fills space */}
          <div className="flex-1 min-h-0">
            {isMismatch ? (
              <div className="h-full flex flex-col items-center justify-center gap-4 card p-6 border-danger-500/30">
                <div className="w-20 h-20 rounded-full bg-danger-500/20 border-2 border-danger-500 flex items-center justify-center">
                  <AlertCircle className="w-10 h-10 text-danger-400" />
                </div>
                <p className="text-danger-400 font-bold text-lg">Face Mismatch ✕</p>
                <p className="text-slate-400 text-sm text-center">
                  Attendance cannot be marked. Try again in better lighting or contact your agency.
                </p>
              </div>
            ) : (
              <div className="relative h-full rounded-2xl overflow-hidden bg-surface-800 shadow-2xl ring-2 ring-white/10 border border-white/20">
                <video ref={faceVideoRef} autoPlay playsInline muted className="w-full h-full object-cover scale-x-[-1]" />
                {/* Oval guide */}
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <div className={`w-40 h-48 rounded-full border-4 transition-colors duration-300 ${
                    faceLiveDetected ? 'border-success-400' : 'border-white/30 border-dashed'
                  }`} />
                </div>
                {faceLiveDetected && (
                  <div className="absolute bottom-3 left-0 right-0 flex justify-center">
                    <span className="badge-present text-xs px-3 py-1">
                      <CheckCircle2 className="w-3.5 h-3.5" /> Face Detected ✓
                    </span>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Buttons — always visible at bottom */}
          <div className="shrink-0 space-y-1.5">
            {isMismatch ? (
              <button onClick={resetToHome} className="btn-primary w-full py-3">Go Back</button>
            ) : (
              <>
                <button
                  onClick={runFaceVerification}
                  disabled={!faceLiveDetected || !faceModelsLoaded}
                  className={`w-full py-3 rounded-2xl font-bold transition-all duration-300 flex items-center justify-center gap-2 ${
                    faceLiveDetected && faceModelsLoaded ? 'btn-success' : 'bg-surface-700 text-slate-500 cursor-not-allowed'
                  }`}
                >
                  <ScanFace className="w-5 h-5" />
                  {!faceModelsLoaded ? 'Loading AI...' : faceLiveDetected ? 'Verify My Face' : 'Waiting for face...'}
                </button>
                <button onClick={resetToHome} className="btn-ghost w-full py-1 text-xs text-slate-500">Cancel</button>
              </>
            )}
          </div>
        </div>
      </FullScreen>
    );
  }

  // ── FAILED screen ────────────────────────────────────────────────
  if (step === 'failed') {
    return (
      <FullScreen>
        <div className="flex-1 flex flex-col items-center justify-center p-6 gap-5 animate-fade-in">
          <div className="w-20 h-20 rounded-full bg-danger-500/20 border-2 border-danger-500 flex items-center justify-center">
            <AlertCircle className="w-10 h-10 text-danger-400" />
          </div>
          <div className="text-center space-y-2">
            <h2 className="text-xl font-bold text-slate-100">Cannot Mark Attendance</h2>
            <p className="text-slate-300 text-sm">{submitError}</p>
          </div>
          <button onClick={resetToHome} className="btn-primary w-full max-w-xs py-4">Back to Home</button>
        </div>
      </FullScreen>
    );
  }

  // ── HOME screen ───────────────────────────────────────────────────
  const now = new Date();
  const greeting = now.getHours() < 12 ? 'Good Morning' : now.getHours() < 17 ? 'Good Afternoon' : 'Good Evening';

  return (
    <div className="flex flex-col h-[100dvh] w-full overflow-hidden relative animate-fade-in">
      {/* Background */}
      <div className="absolute inset-0 z-0">
        {assignment?.agency_background_url ? (
          <img src={assignment.agency_background_url} alt="Background" className="w-full h-full object-cover object-center" />
        ) : (
          <div className="w-full h-full bg-gradient-to-br from-blue-900 via-blue-800 to-blue-700" />
        )}
      </div>

      <div className="relative z-10 flex flex-col h-full overflow-hidden">

        {/* ── Agency Logo + Name (compact, shrinks if needed) */}
        <div className="shrink-0 flex flex-col items-center pt-4 pb-1 px-4">
          {assignment?.agency_logo_url ? (
            <img
              src={assignment.agency_logo_url}
              alt="Agency Logo"
              className="object-contain drop-shadow-lg"
              style={{ maxHeight: '80px', maxWidth: '120px' }}
            />
          ) : (
            <div className="w-16 h-16 rounded-full bg-[#1a2a5e]/20 flex items-center justify-center border-2 border-white/40 shadow-xl backdrop-blur-sm">
              <ShieldCheck className="w-8 h-8 text-[#1a2a5e]" />
            </div>
          )}
          {assignment?.agency_name && (
            <p className="text-[#1a2a5e] text-base font-black tracking-wide mt-1 text-center drop-shadow-sm">{assignment.agency_name}</p>
          )}
        </div>

        {/* ── Online/Offline pill */}
        <div className="shrink-0 flex justify-center pb-2">
          <div className={`flex items-center gap-1.5 py-1 px-3 rounded-full text-xs font-medium backdrop-blur-md shadow-sm ${
            isOnline ? 'bg-white/90 text-success-600 border border-success-500/30' : 'bg-white/90 text-warning-600 border border-warning-500/30'
          }`}>
            {isOnline ? <Wifi className="w-3 h-3" /> : <WifiOff className="w-3 h-3" />}
            {isOnline ? 'Online' : 'Offline Mode'}
            {pendingCount > 0 && (
              <span className="ml-1 bg-warning-500 text-white rounded-full px-1.5 text-xs font-bold">{pendingCount}</span>
            )}
          </div>
        </div>

        {/* ── Greeting */}
        <div className="shrink-0 mx-4 text-center bg-white/40 backdrop-blur-md border border-white/50 rounded-2xl py-2 px-4 shadow-sm">
          <p className="text-[#4a5580] text-xs font-semibold">{greeting},</p>
          <h1 className="text-xl font-black text-[#1a2a5e] leading-tight">{user?.watchman?.full_name || user?.name}</h1>
          <p className="text-[#3b5bdb] font-bold text-xs mt-0.5">
            {user?.watchman?.employee_id} • {now.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' })}
          </p>
        </div>

        {/* ── Assignment Card (flex-1, scrollable only if truly needed) */}
        <div className="flex-1 mx-4 mt-3 min-h-0 overflow-y-auto">
          {assignment ? (
            <div className={`rounded-2xl border shadow-xl backdrop-blur-xl bg-slate-900/90 p-4 space-y-3 ${alreadyMarked ? 'border-success-500/50' : 'border-slate-700/80'}`}>
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-brand-400 animate-pulse-slow" />
                <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Today's Duty</span>
              </div>

              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-brand-500/20 flex items-center justify-center shrink-0">
                  <Building2 className="w-5 h-5 text-brand-400" />
                </div>
                <div>
                  <p className="font-bold text-base text-slate-100 leading-tight">{assignment.society_name}</p>
                  <p className="text-slate-500 text-xs flex items-center gap-1"><MapPin className="w-3 h-3" /> {assignment.society_address}</p>
                </div>
              </div>

              <div className="flex items-center gap-3 pt-2 border-t border-surface-700">
                <div className="w-9 h-9 rounded-xl bg-surface-700 flex items-center justify-center shrink-0">
                  <Clock className="w-5 h-5 text-slate-400" />
                </div>
                <div>
                  <p className="font-semibold text-slate-200 text-sm">{assignment.shift_name}</p>
                  <p className="text-slate-500 text-xs">
                    {formatTimeDisplay(assignment.start_time)} — {formatTimeDisplay(assignment.end_time)}
                    {assignment.is_overnight && <span className="ml-1.5 text-xs bg-brand-500/20 text-brand-400 px-1.5 py-0.5 rounded-full">overnight</span>}
                  </p>
                </div>
              </div>

              {alreadyMarked && (
                <div className="flex items-center gap-3 p-2.5 rounded-xl bg-success-500/10 border border-success-500/20">
                  <CheckCircle2 className="w-5 h-5 text-success-400 shrink-0" />
                  <div>
                    <p className="font-semibold text-success-400 text-xs">Attendance Marked</p>
                    <p className="text-xs text-slate-500">
                      {attendance && formatTimestamp(attendance.check_in_time)} •{' '}
                      <span className={attendance?.status === 'late' ? 'text-warning-400' : 'text-success-400'}>
                        {attendance?.status?.toUpperCase()}
                      </span>
                    </p>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="card p-5 text-center space-y-2">
              <Building2 className="w-10 h-10 text-slate-600 mx-auto" />
              <p className="text-slate-400 font-medium text-sm">No assignment for today</p>
              <p className="text-slate-600 text-xs">Please contact your agency if this is incorrect.</p>
            </div>
          )}
        </div>

        {/* ── Bottom action area — always visible, never pushed off screen */}
        <div className="shrink-0 px-4 pb-4 pt-3 space-y-2">
          {!alreadyMarked && assignment && (
            <button onClick={getGPS} className="btn-mark-attendance animate-fade-in w-full">
              <div className="flex flex-col items-center gap-1">
                <div className="flex items-center gap-2">
                  <MapPin className="w-6 h-6" />
                  <span className="text-lg">MARK ATTENDANCE</span>
                </div>
                <p className="text-xs font-normal opacity-70">Tap to verify location & take photo</p>
              </div>
            </button>
          )}

          {isOnline && pendingCount > 0 && (
            <button onClick={syncOfflineQueue} className="btn-outline w-full py-2.5 text-sm gap-2">
              <RefreshCw className="w-4 h-4" />
              Sync {pendingCount} Offline Record{pendingCount > 1 ? 's' : ''}
              <ChevronRight className="w-4 h-4 ml-auto" />
            </button>
          )}

          {alreadyMarked && (
            <p className="text-center text-slate-500 text-xs py-1">Have a safe and productive shift! 🛡️</p>
          )}
        </div>

      </div>
    </div>
  );
}
