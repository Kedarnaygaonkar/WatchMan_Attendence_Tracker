/**
 * FaceRegistration.tsx
 *
 * Shown once to the watchman on first login if face_registered = false.
 * Uses face-api.js to detect a face and extract a 128-element descriptor.
 * The descriptor is sent to the backend and stored for future verification.
 */
import { useState, useRef, useCallback, useEffect } from 'react';
import * as faceapi from 'face-api.js';
import { Camera, CheckCircle2, AlertCircle, Loader2, ShieldCheck } from 'lucide-react';
import api from '../api/client';
import toast from 'react-hot-toast';

interface FaceRegistrationProps {
  onComplete: () => void;
}

type RegStep = 'loading_models' | 'ready' | 'capturing' | 'processing' | 'success' | 'error';

const MODELS_PATH = '/models';

export default function FaceRegistration({ onComplete }: FaceRegistrationProps) {
  const [step, setStep] = useState<RegStep>('loading_models');
  const [errorMsg, setErrorMsg] = useState('');
  const [faceDetected, setFaceDetected] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const detectionIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Use singleton model cache — models may already be loaded by WatchmanHome
  let faceModelsPromise: Promise<void> | null = (window as any).__faceModelsPromise || null;
  function ensureFaceModels(): Promise<void> {
    if (!faceModelsPromise) {
      faceModelsPromise = Promise.all([
        faceapi.nets.tinyFaceDetector.loadFromUri(MODELS_PATH),
        faceapi.nets.faceLandmark68TinyNet.loadFromUri(MODELS_PATH),
        faceapi.nets.faceRecognitionNet.loadFromUri(MODELS_PATH),
      ]).then(() => {});
      (window as any).__faceModelsPromise = faceModelsPromise;
    }
    return faceModelsPromise;
  }

  useEffect(() => {
    ensureFaceModels()
      .then(() => setStep('ready'))
      .catch(() => {
        setStep('error');
        setErrorMsg('Failed to load face detection models. Please check your connection and refresh.');
      });
    return () => stopCamera();
  }, []);

  const startFaceDetection = useCallback(() => {
    detectionIntervalRef.current = setInterval(async () => {
      if (!videoRef.current || videoRef.current.readyState < 2) return;
      const detection = await faceapi
        .detectSingleFace(videoRef.current, new faceapi.TinyFaceDetectorOptions({ scoreThreshold: 0.5 }))
        .withFaceLandmarks(true)
        .withFaceDescriptor();
      setFaceDetected(!!detection);
    }, 300);
  }, []);

  // Attach stream to video element AFTER it renders (fixes black camera bug)
  useEffect(() => {
    if (step === 'capturing' && videoRef.current && streamRef.current) {
      videoRef.current.srcObject = streamRef.current;
      startFaceDetection();
    }
  }, [step, startFaceDetection]);

  const startCamera = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } },
        audio: false,
      });
      streamRef.current = stream;
      setStep('capturing'); // render video element first, stream attached via useEffect
    } catch {
      setStep('error');
      setErrorMsg('Camera access denied. Please enable camera access in your browser settings.');
    }
  }, []);

  const stopCamera = useCallback(() => {
    if (detectionIntervalRef.current) {
      clearInterval(detectionIntervalRef.current);
      detectionIntervalRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
    setFaceDetected(false);
  }, []);


  const captureAndRegister = useCallback(async () => {
    if (!videoRef.current) return;
    setStep('processing');

    try {
      const detection = await faceapi
        .detectSingleFace(videoRef.current, new faceapi.TinyFaceDetectorOptions({ scoreThreshold: 0.5 }))
        .withFaceLandmarks(true)
        .withFaceDescriptor();

      stopCamera();

      if (!detection) {
        setStep('error');
        setErrorMsg('No face detected. Please try again in better lighting.');
        return;
      }

      const descriptor = Array.from(detection.descriptor);

      await api.post('/watchmen/register-face', { descriptor });

      setStep('success');
      toast.success('Face registered! You are all set.');
    } catch (err: unknown) {
      stopCamera();
      const msg = (err as { response?: { data?: { message?: string } } })
        ?.response?.data?.message || 'Registration failed. Please try again.';
      setStep('error');
      setErrorMsg(msg);
    }
  }, [stopCamera]);

  const retry = useCallback(() => {
    setStep('ready');
    setErrorMsg('');
  }, []);

  // ─── RENDER ──────────────────────────────────────────────────────────
  return (
    <div className="fixed inset-0 bg-surface-950/95 z-50 flex flex-col animate-fade-in">
      <div className="flex flex-col h-full max-w-sm mx-auto w-full p-4 gap-3">

        {/* Header — compact, always at top */}
        <div className="text-center shrink-0 pt-2">
          <div className="w-12 h-12 rounded-2xl bg-brand-500/20 border border-brand-500/30 flex items-center justify-center mx-auto mb-2">
            <ShieldCheck className="w-6 h-6 text-brand-400" />
          </div>
          <h1 className="text-xl font-black text-slate-100">Face Registration</h1>
          <p className="text-slate-500 text-xs mt-0.5">
            {step === 'loading_models' && 'Loading AI models...'}
            {step === 'ready' && 'Register your face to secure your attendance'}
            {step === 'capturing' && 'Look straight at the camera'}
            {step === 'processing' && 'Processing your face...'}
            {step === 'success' && 'Registration successful!'}
            {step === 'error' && 'Something went wrong'}
          </p>
        </div>

        {/* Loading models */}
        {step === 'loading_models' && (
          <div className="card p-8 flex flex-col items-center gap-4">
            <Loader2 className="w-12 h-12 animate-spin text-brand-400" />
            <p className="text-slate-400 text-sm">Loading face detection AI...</p>
            <p className="text-slate-600 text-xs">First time takes ~5 seconds</p>
          </div>
        )}

        {/* Ready */}
        {step === 'ready' && (
          <div className="space-y-4">
            <div className="card p-5 text-left space-y-3">
              <p className="text-slate-300 text-sm font-semibold">How it works:</p>
              <ul className="space-y-2 text-slate-500 text-sm">
                <li className="flex items-start gap-2">
                  <span className="text-brand-400 mt-0.5">①</span>
                  Allow camera access
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-brand-400 mt-0.5">②</span>
                  Look straight at the camera
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-brand-400 mt-0.5">③</span>
                  Press <strong>Register My Face</strong> when your face is detected
                </li>
              </ul>
            </div>
            <button onClick={startCamera} className="btn-primary w-full py-4 text-lg">
              <Camera className="w-5 h-5" />
              Start Camera
            </button>
          </div>
        )}

        {/* Camera capturing */}
        {step === 'capturing' && (
          <div className="flex flex-col flex-1 min-h-0 gap-3">
            <div className="relative flex-1 min-h-0 rounded-2xl overflow-hidden bg-surface-800">
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className="w-full h-full object-cover scale-x-[-1]"
              />
              {/* Oval guide */}
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div
                  className={`w-48 h-56 rounded-full border-4 transition-colors duration-300 ${
                    faceDetected ? 'border-success-400 shadow-lg shadow-success-500/30' : 'border-white/30 border-dashed'
                  }`}
                />
              </div>
              {/* Face detected badge */}
              {faceDetected && (
                <div className="absolute bottom-3 left-0 right-0 flex justify-center">
                  <span className="badge-present text-xs px-3 py-1">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    Face Detected ✓
                  </span>
                </div>
              )}
            </div>
            <canvas ref={canvasRef} className="hidden" />
            <button
              onClick={captureAndRegister}
              disabled={!faceDetected}
              className={`shrink-0 w-full py-4 rounded-2xl font-bold transition-all duration-300 flex items-center justify-center gap-2 ${
                faceDetected ? 'btn-success animate-pulse-slow' : 'bg-surface-700 text-slate-500 cursor-not-allowed'
              }`}
            >
              {faceDetected
                ? <><CheckCircle2 className="w-5 h-5" />Register My Face</>
                : 'Waiting for face detection...'}
            </button>
          </div>
        )}

        {/* Processing */}
        {step === 'processing' && (
          <div className="card p-10 flex flex-col items-center gap-4">
            <div className="relative">
              <div className="absolute inset-0 rounded-full bg-brand-500/20 animate-ping" />
              <div className="relative w-16 h-16 rounded-full bg-brand-500/30 border-2 border-brand-500 flex items-center justify-center">
                <Loader2 className="w-8 h-8 animate-spin text-brand-400" />
              </div>
            </div>
            <p className="text-slate-400">Registering your face...</p>
          </div>
        )}

        {/* Success */}
        {step === 'success' && (
          <div className="space-y-5">
            <div className="card p-8 flex flex-col items-center gap-3">
              <div className="w-20 h-20 rounded-full bg-success-500/20 border-2 border-success-500 flex items-center justify-center shadow-lg shadow-success-500/20">
                <CheckCircle2 className="w-10 h-10 text-success-400" />
              </div>
              <p className="text-success-400 font-bold text-lg">Face Registered!</p>
              <p className="text-slate-500 text-sm">
                Your face will now be verified every time you mark attendance.
              </p>
            </div>
            <button onClick={onComplete} className="btn-primary w-full py-4 text-lg">
              Continue to Dashboard
            </button>
          </div>
        )}

        {/* Error */}
        {step === 'error' && (
          <div className="space-y-4">
            <div className="card p-6 flex flex-col items-center gap-3">
              <div className="w-16 h-16 rounded-full bg-danger-500/20 border-2 border-danger-500 flex items-center justify-center">
                <AlertCircle className="w-8 h-8 text-danger-400" />
              </div>
              <p className="text-danger-400 font-bold">Registration Failed</p>
              <p className="text-slate-400 text-sm">{errorMsg}</p>
            </div>
            <button onClick={retry} className="btn-primary w-full py-4">
              Try Again
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
