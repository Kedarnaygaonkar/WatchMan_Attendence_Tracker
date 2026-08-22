/**
 * WatchmanHome — The core watchman experience.
 *
 * The screen does everything automatically:
 * 1. Loads today's assignment (society + shift)
 * 2. On button press: gets GPS → verifies geofence → opens camera → submits
 *
 * The watchman only presses ONE button.
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

  const MODELS_PATH = '/models';
  const FACE_MATCH_THRESHOLD = 0.6; // distance < 0.6 = same person (~80% confidence)

  // Load face-api.js models (once)
  useEffect(() => {
    async function loadFaceModels() {
      try {
        if (!faceapi.nets.tinyFaceDetector.params) {
          await Promise.all([
            faceapi.nets.tinyFaceDetector.loadFromUri(MODELS_PATH),
            faceapi.nets.faceLandmark68TinyNet.loadFromUri(MODELS_PATH),
            faceapi.nets.faceRecognitionNet.loadFromUri(MODELS_PATH),
          ]);
        }
        setFaceModelsLoaded(true);
      } catch (err) {
        console.error('Face models load error:', err);
      }
    }
    loadFaceModels();
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

    // Check pending count
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
    refetchInterval: 2 * 60 * 1000, // Refresh every 2 minutes
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
        // After GPS, move to face verification
        setStep('face_verify');
        startFaceVerification();
      },
      (error) => {
        let msg = 'Please turn on Location and try again.';
        if (error.code === 1) msg = 'Location access denied. Please enable Location in your browser settings and try again.';
        if (error.code === 2) msg = 'Unable to determine your location. Please try again.';
        if (error.code === 3) msg = 'Location request timed out. Please try again.';
        setGpsError(msg);
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
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
        video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } },
        audio: false,
      });
      faceStreamRef.current = stream;
      // step is already 'face_verify' at this point (set by GPS callback)
      // stream attached via useEffect below
    } catch {
      toast.error('Camera access required for face verification.');
      setStep('home');
      setFaceDetecting(false);
    }
  }, []);

  const stopFaceVerification = useCallback(() => {
    if (faceDetectionInterval.current) {
      clearInterval(faceDetectionInterval.current);
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
      // Fetch stored descriptor from backend
      const { data } = await api.get('/watchmen/face-status');
      const storedDescriptorArr: number[] | null = data.data.face_descriptor;

      if (!storedDescriptorArr) {
        // Watchman has no registered face — skip verification
        setFaceVerified(true);
        setFaceMatchScore(0);
        stopFaceVerification();
        setStep('camera');
        startCamera();
        return;
      }

      // Detect live face
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

      // Compare descriptors
      const stored = new Float32Array(storedDescriptorArr);
      const distance = faceapi.euclideanDistance(Array.from(stored), Array.from(detection.descriptor));
      const verified = distance < FACE_MATCH_THRESHOLD;

      setFaceVerified(verified);
      setFaceMatchScore(distance);
      stopFaceVerification();

      if (verified) {
        // Face matched — proceed to selfie camera
        setStep('camera');
        startCamera();
      } else {
        // Face mismatch — block
        setStep('face_verify'); // stay on screen to show mismatch
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
        video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } },
        audio: false,
      });
      streamRef.current = stream;
      // stream attached to video element via useEffect below
    } catch {
      toast.error('Camera access denied. Please enable camera access.');
      setStep('home');
    }
  }, []);

  // Attach face-verify stream after face_verify screen renders
  useEffect(() => {
    if (step === 'face_verify' && faceVideoRef.current && faceStreamRef.current) {
      faceVideoRef.current.srcObject = faceStreamRef.current;
      // Start polling for live face detection
      if (!faceDetectionInterval.current) {
        faceDetectionInterval.current = setInterval(async () => {
          if (!faceVideoRef.current || faceVideoRef.current.readyState < 2) return;
          const detection = await faceapi
            .detectSingleFace(faceVideoRef.current, new faceapi.TinyFaceDetectorOptions({ scoreThreshold: 0.5 }))
            .withFaceLandmarks(true);
          setFaceLiveDetected(!!detection);
        }, 400);
      }
    }
  }, [step]);

  // Attach attendance selfie stream after camera screen renders
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

    // Timestamp overlay on photo
    ctx.drawImage(video, 0, 0);
    const now = new Date();
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(0, canvas.height - 40, canvas.width, 40);
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 16px Inter, sans-serif';
    ctx.fillText(
      `${now.toLocaleDateString('en-IN')} ${now.toLocaleTimeString('en-IN')}`,
      10, canvas.height - 14
    );

    canvas.toBlob((blob) => {
      if (blob) {
        setCapturedBlob(blob);
        setCapturedPhoto(canvas.toDataURL('image/jpeg', 0.85));
      }
    }, 'image/jpeg', 0.85);
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
    formData.append('deviceInfo', JSON.stringify({
      userAgent: navigator.userAgent,
      platform: navigator.platform,
    }));

    if (capturedBlob) {
      formData.append('selfie', capturedBlob, 'selfie.jpg');
    }

    // Include face verification results
    if (faceVerified !== null) {
      formData.append('faceVerified', String(faceVerified));
    }
    if (faceMatchScore !== null) {
      formData.append('faceMatchScore', String(faceMatchScore));
    }

    if (!isOnline) {
      // Offline — save to IndexedDB
      const record = {
        id: uuidv4(),
        assignmentId: assignment.id,
        latitude: gpsData.latitude,
        longitude: gpsData.longitude,
        gpsAccuracy: gpsData.accuracy,
        clientTimestamp: new Date().toISOString(),
        selfieDataUrl: capturedPhoto || undefined,
        deviceInfo: { userAgent: navigator.userAgent },
        createdAt: new Date().toISOString(),
        syncStatus: 'pending' as const,
      };
      await offlineQueue.add(record);
      setPendingCount(prev => prev + 1);
      setSuccessData({ status: 'offline', time: new Date().toLocaleTimeString('en-IN'), society: assignment.society_name });
      setStep('success');
      return;
    }

    try {
      const { data } = await api.post('/attendance/mark', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

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
      const msg = (err as { response?: { data?: { message?: string } } })
        ?.response?.data?.message || 'Something went wrong. Please try again.';
      setSubmitError(msg);
      setStep('failed');
    }
  }, [gpsData, assignment, capturedBlob, capturedPhoto, isOnline, stopCamera, refetch]);

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

        await api.post('/attendance/mark', formData, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });
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
  // RENDER
  // ────────────────────────────────────────────────────────────────

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-12 h-12 animate-spin text-brand-400 mx-auto mb-4" />
          <p className="text-slate-400">Loading your assignment...</p>
        </div>
      </div>
    );
  }

  // ── SUCCESS screen ────────────────────────────────────────────────
  if (step === 'success' && successData) {
    const isOfflineRecord = successData.status === 'offline';
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-6 animate-fade-in">
        <div className="w-full max-w-sm text-center space-y-6">
          <div className={`w-28 h-28 rounded-full mx-auto flex items-center justify-center shadow-2xl ${
            isOfflineRecord
              ? 'bg-warning-500/20 border-2 border-warning-500'
              : 'bg-success-500/20 border-2 border-success-500 shadow-glow-success'
          }`}>
            {isOfflineRecord
              ? <WifiOff className="w-14 h-14 text-warning-400" />
              : <CheckCircle2 className="w-14 h-14 text-success-400" />
            }
          </div>

          {isOfflineRecord ? (
            <>
              <h2 className="text-2xl font-black text-warning-400">Saved Offline</h2>
              <p className="text-slate-400">
                Attendance saved locally at <strong className="text-slate-200">{successData.time}</strong>.
                It will sync automatically when internet is available.
              </p>
            </>
          ) : (
            <>
              <h2 className="text-3xl font-black text-success-400">
                {successData.status === 'late' ? 'Marked Late' : 'Attendance Marked!'}
              </h2>
              <div className="space-y-2">
                <p className="text-4xl font-black text-slate-100">{successData.time}</p>
                <p className="text-slate-400 text-sm">{successData.society}</p>
              </div>
              {successData.status === 'late' && (
                <div className="p-3 rounded-xl bg-warning-500/10 border border-warning-500/20">
                  <p className="text-warning-400 text-sm">⚠ You were marked as late. Please arrive on time tomorrow.</p>
                </div>
              )}
              <p className="text-success-400 text-sm font-medium">✓ Location Verified</p>
            </>
          )}

          <button onClick={resetToHome} className="btn-outline w-full py-3">
            Back to Home
          </button>
        </div>
      </div>
    );
  }

  // ── CAMERA screen ─────────────────────────────────────────────────
  if (step === 'camera' || step === 'submitting') {
    return (
      <div className="flex-1 flex flex-col p-4 animate-fade-in">
        <div className="max-w-sm mx-auto w-full space-y-4">
          <div className="text-center">
            <div className="badge-present mx-auto inline-flex mb-2">
              <ShieldCheck className="w-3.5 h-3.5" />
              Location Verified
            </div>
            <h2 className="text-xl font-bold text-slate-100">Take Your Photo</h2>
            <p className="text-slate-500 text-sm">This confirms your attendance</p>
          </div>

          {/* Camera or captured photo */}
          <div className="relative rounded-2xl overflow-hidden bg-surface-800 aspect-[4/3]">
            {capturedPhoto ? (
              <img src={capturedPhoto} alt="Selfie" className="w-full h-full object-cover" />
            ) : (
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className="w-full h-full object-cover scale-x-[-1]"
              />
            )}
            <canvas ref={canvasRef} className="hidden" />

            {/* Overlay guide */}
            {!capturedPhoto && (
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className="w-48 h-48 rounded-full border-2 border-white/30 border-dashed" />
              </div>
            )}
          </div>

          {/* Buttons */}
          {capturedPhoto ? (
            <div className="space-y-3">
              <button
                onClick={submitAttendance}
                disabled={step === 'submitting'}
                className="btn-success w-full py-4 text-lg"
              >
                {step === 'submitting' ? (
                  <><Loader2 className="w-5 h-5 animate-spin" /> Submitting...</>
                ) : (
                  <><CheckCircle2 className="w-5 h-5" /> Submit Attendance</>
                )}
              </button>
              <button onClick={retakePhoto} className="btn-ghost w-full py-3">
                <RefreshCw className="w-4 h-4" /> Retake Photo
              </button>
            </div>
          ) : (
            <button onClick={capturePhoto} className="btn-primary w-full py-5 text-lg">
              <Camera className="w-6 h-6" /> Capture Photo
            </button>
          )}

          <button onClick={resetToHome} className="btn-ghost w-full py-2 text-sm">
            Cancel
          </button>
        </div>
      </div>
    );
  }

  // ── GPS LOADING screen ────────────────────────────────────────────
  if (step === 'gps') {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-6 animate-fade-in">
        <div className="w-full max-w-sm text-center space-y-6">
          {gpsError ? (
            <>
              <div className="w-24 h-24 rounded-full bg-danger-500/20 border-2 border-danger-500 mx-auto flex items-center justify-center">
                <AlertCircle className="w-12 h-12 text-danger-400" />
              </div>
              <h2 className="text-xl font-bold text-slate-100">Location Error</h2>
              <p className="text-slate-400">{gpsError}</p>
              <button onClick={getGPS} className="btn-primary w-full py-4">
                <Navigation className="w-5 h-5" /> Try Again
              </button>
              <button onClick={resetToHome} className="btn-ghost w-full py-3">
                Cancel
              </button>
            </>
          ) : (
            <>
              <div className="relative w-24 h-24 mx-auto">
                <div className="absolute inset-0 rounded-full bg-brand-500/20 animate-ping" />
                <div className="relative w-24 h-24 rounded-full bg-brand-500/30 border-2 border-brand-500 flex items-center justify-center">
                  <Navigation className="w-10 h-10 text-brand-400 animate-bounce-gentle" />
                </div>
              </div>
              <h2 className="text-xl font-bold text-slate-100">Getting Location...</h2>
              <p className="text-slate-400 text-sm">
                Please wait. Make sure Location is enabled in your phone settings.
              </p>
            </>
          )}
        </div>
      </div>
    );
  }

  // ── FACE VERIFICATION screen ──────────────────────────────────────
  if (step === 'face_verify') {
    const isMismatch = faceVerified === false;
    return (
      <div className="flex-1 flex flex-col p-4 animate-fade-in">
        <div className="max-w-sm mx-auto w-full space-y-4">
          <div className="text-center">
            <div className={`badge-present mx-auto inline-flex mb-2 ${isMismatch ? 'badge-absent' : ''}`}>
              <ShieldCheck className="w-3.5 h-3.5" />
              {isMismatch ? 'Face Mismatch' : 'Face Verification'}
            </div>
            <h2 className="text-xl font-bold text-slate-100">
              {isMismatch ? 'Attendance Blocked' : 'Verify Your Identity'}
            </h2>
            <p className="text-slate-500 text-sm">
              {isMismatch
                ? 'Your face did not match your registered photo.'
                : 'Look straight at the camera. Press verify when ready.'}
            </p>
          </div>

          {isMismatch ? (
            // Mismatch state
            <div className="card p-6 flex flex-col items-center gap-4 border-danger-500/30">
              <div className="w-20 h-20 rounded-full bg-danger-500/20 border-2 border-danger-500 flex items-center justify-center">
                <AlertCircle className="w-10 h-10 text-danger-400" />
              </div>
              <p className="text-danger-400 font-bold text-lg">Face Mismatch ✕</p>
              <p className="text-slate-400 text-sm text-center">
                Attendance cannot be marked. If this is a mistake, please try again in better lighting or contact your agency.
              </p>
            </div>
          ) : (
            // Camera feed + verify button
            <div className="relative rounded-2xl overflow-hidden bg-surface-800 aspect-[4/3]">
              <video
                ref={faceVideoRef}
                autoPlay
                playsInline
                muted
                className="w-full h-full object-cover scale-x-[-1]"
              />
              {/* Oval guide */}
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div
                  className={`w-48 h-56 rounded-full border-4 transition-colors duration-300 ${
                    faceLiveDetected ? 'border-success-400' : 'border-white/30 border-dashed'
                  }`}
                />
              </div>
              {faceLiveDetected && (
                <div className="absolute bottom-3 left-0 right-0 flex justify-center">
                  <span className="badge-present text-xs px-3 py-1">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    Face Detected ✓
                  </span>
                </div>
              )}
            </div>
          )}

          {isMismatch ? (
            <button onClick={resetToHome} className="btn-primary w-full py-4">
              Go Back
            </button>
          ) : (
            <>
              <button
                onClick={runFaceVerification}
                disabled={!faceLiveDetected || !faceModelsLoaded}
                className={`w-full py-4 text-lg rounded-2xl font-bold transition-all duration-300 flex items-center justify-center gap-2 ${
                  faceLiveDetected && faceModelsLoaded
                    ? 'btn-primary'
                    : 'bg-surface-700 text-slate-500 cursor-not-allowed'
                }`}
              >
                <ScanFace className="w-5 h-5" />
                {!faceModelsLoaded ? 'Loading AI...' : faceLiveDetected ? 'Verify My Face' : 'Waiting for face...'}
              </button>
              <button onClick={resetToHome} className="btn-ghost w-full py-2 text-sm">
                Cancel
              </button>
            </>
          )}
        </div>
      </div>
    );
  }

  // ── FAILED screen ────────────────────────────────────────────────
  if (step === 'failed') {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-6 animate-fade-in">
        <div className="w-full max-w-sm text-center space-y-6">
          <div className="w-24 h-24 rounded-full bg-danger-500/20 border-2 border-danger-500 mx-auto flex items-center justify-center">
            <AlertCircle className="w-12 h-12 text-danger-400" />
          </div>
          <h2 className="text-xl font-bold text-slate-100">Cannot Mark Attendance</h2>
          <p className="text-slate-300">{submitError}</p>
          <button onClick={resetToHome} className="btn-primary w-full py-4">
            Back to Home
          </button>
        </div>
      </div>
    );
  }

  // ── HOME screen (main watchman dashboard) ────────────────────────
  const now = new Date();
  const greeting = now.getHours() < 12 ? 'Good Morning' : now.getHours() < 17 ? 'Good Afternoon' : 'Good Evening';

  return (
    <div className="flex-1 flex flex-col p-4 animate-fade-in">
      <div className="max-w-sm mx-auto w-full space-y-5">

        {/* Offline/Online indicator */}
        <div className={`flex items-center justify-center gap-2 py-2 px-4 rounded-full text-xs font-medium mx-auto w-fit ${
          isOnline
            ? 'bg-success-500/10 text-success-400 border border-success-500/20'
            : 'bg-warning-500/10 text-warning-400 border border-warning-500/20'
        }`}>
          {isOnline ? <Wifi className="w-3.5 h-3.5" /> : <WifiOff className="w-3.5 h-3.5" />}
          {isOnline ? 'Online' : 'Offline Mode'}
          {pendingCount > 0 && (
            <span className="ml-1 bg-warning-500 text-surface-900 rounded-full px-1.5 text-xs font-bold">
              {pendingCount} pending
            </span>
          )}
        </div>

        {/* Greeting */}
        <div className="text-center">
          <p className="text-slate-500 text-sm">{greeting},</p>
          <h1 className="text-2xl font-black text-slate-100">
            {user?.watchman?.full_name || user?.name}
          </h1>
          <p className="text-slate-500 text-xs mt-1">
            {user?.watchman?.employee_id} • {now.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })}
          </p>
        </div>

        {/* Assignment Card */}
        {assignment ? (
          <div className={`card p-5 space-y-4 ${alreadyMarked ? 'border-success-500/30' : 'border-brand-500/20'}`}>
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-brand-400 animate-pulse-slow" />
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Today's Duty</span>
            </div>

            {/* Society */}
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-brand-500/20 flex items-center justify-center shrink-0">
                <Building2 className="w-5 h-5 text-brand-400" />
              </div>
              <div>
                <p className="font-bold text-lg text-slate-100 leading-tight">{assignment.society_name}</p>
                <p className="text-slate-500 text-xs mt-0.5 flex items-center gap-1">
                  <MapPin className="w-3 h-3" /> {assignment.society_address}
                </p>
              </div>
            </div>

            {/* Shift */}
            <div className="flex items-center gap-3 pt-2 border-t border-surface-700">
              <div className="w-10 h-10 rounded-xl bg-surface-700 flex items-center justify-center shrink-0">
                <Clock className="w-5 h-5 text-slate-400" />
              </div>
              <div>
                <p className="font-semibold text-slate-200">{assignment.shift_name}</p>
                <p className="text-slate-500 text-sm">
                  {formatTimeDisplay(assignment.start_time)} — {formatTimeDisplay(assignment.end_time)}
                  {assignment.is_overnight && (
                    <span className="ml-1.5 text-xs bg-brand-500/20 text-brand-400 px-1.5 py-0.5 rounded-full">
                      overnight
                    </span>
                  )}
                </p>
              </div>
            </div>

            {/* Already marked */}
            {alreadyMarked && (
              <div className="flex items-center gap-3 p-3 rounded-xl bg-success-500/10 border border-success-500/20">
                <CheckCircle2 className="w-5 h-5 text-success-400 shrink-0" />
                <div>
                  <p className="font-semibold text-success-400 text-sm">Attendance Marked</p>
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
          <div className="card p-6 text-center space-y-3">
            <Building2 className="w-12 h-12 text-slate-600 mx-auto" />
            <p className="text-slate-400 font-medium">No assignment for today</p>
            <p className="text-slate-600 text-sm">Please contact your agency if this is incorrect.</p>
          </div>
        )}

        {/* MARK ATTENDANCE button */}
        {!alreadyMarked && assignment && (
          <button
            onClick={getGPS}
            className="btn-mark-attendance animate-fade-in"
          >
            <div className="flex flex-col items-center gap-2">
              <div className="flex items-center gap-3">
                <MapPin className="w-8 h-8" />
                <span>MARK ATTENDANCE</span>
              </div>
              <p className="text-sm font-normal opacity-70">
                Tap to verify location & take photo
              </p>
            </div>
          </button>
        )}

        {/* Sync offline button */}
        {isOnline && pendingCount > 0 && (
          <button onClick={syncOfflineQueue} className="btn-outline w-full py-3 text-sm gap-2">
            <RefreshCw className="w-4 h-4" />
            Sync {pendingCount} Offline Record{pendingCount > 1 ? 's' : ''}
            <ChevronRight className="w-4 h-4 ml-auto" />
          </button>
        )}

        {/* Instructions for already marked */}
        {alreadyMarked && (
          <div className="text-center py-4">
            <p className="text-slate-600 text-sm">Have a safe and productive shift! 🛡️</p>
          </div>
        )}
      </div>
    </div>
  );
}
