import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import axios from 'axios';
import * as faceapi from 'face-api.js';
import { Camera, CheckCircle, LogIn, LogOut, AlertTriangle, Loader2, User, Clock, MapPin, ScanFace, ShieldCheck, Bike, Package, ChevronRight, Globe } from 'lucide-react';
import toast from 'react-hot-toast';

type Language = 'EN' | 'HI' | 'MR';

const TRANSLATIONS = {
  EN: {
    who_are_you: 'Who are you?',
    security_guard: 'Security Guard',
    mark_attendance: 'Mark attendance with Guard ID',
    visitors: 'Visitors & Delivery',
    delivery_boy: 'Delivery Boy',
    enter_guard_id: 'Enter Your Guard ID',
    continue: 'Continue',
    back: 'Back',
    select_gate: 'Select Gate *',
    select_wing: 'Select Wing',
    optional: '(optional)',
    select_shift: 'Select Shift *',
    take_photo: 'Take Check-in Photo',
    checkin_photo: 'Check-In Photo',
    checkout_photo: 'Check-Out Photo',
    mark_checkin: 'Mark Check-In',
    mark_checkout: 'Mark Check-Out',
    delivery_checkin: 'Delivery Check-In',
    delivery_company: 'Delivery Company',
    your_name: 'Your Name *',
    phone_number: 'Phone Number *',
    vehicle_number: 'Vehicle Number',
    mark_entry: 'Mark Entry',
    loading: 'Loading...',
    recording_attendance: 'Recording attendance...',
    recording_visit: 'Recording visit...',
    error: 'Error',
    getting_location: 'Getting Location...',
    allow_location: 'Please allow location access if prompted.',
    first_time_setup: 'First Time Face Setup',
    look_camera_register: 'Please look directly at the camera to register your face.',
    register_face: 'Register My Face',
    face_mismatch: 'Face Mismatch',
    face_verification: 'Face Verification',
    verification_failed: 'Verification Failed',
    verify_identity: 'Verify Your Identity',
    face_did_not_match: 'Your face did not match your registered photo.',
    look_camera_verify: 'Look straight at the camera. Press verify when ready.',
    try_again: 'Try Again',
    verify_my_face: 'Verify My Face',
    waiting_for_face: 'Waiting for face...',
    no_face_detected: 'No face detected',
    face_detected: 'Face Detected ✓',
    late_arrival: 'Late Arrival',
    checked_in: 'Checked In!',
    checked_out: 'Checked Out!',
    welcome: 'Welcome!',
    done: 'Done'
  },
  HI: {
    who_are_you: 'आप कौन हैं?',
    security_guard: 'सुरक्षा रक्षक',
    mark_attendance: 'गार्ड आईडी से हाजिरी लगाएं',
    visitors: 'आगंतुक और डिलीवरी',
    delivery_boy: 'डिलीवरी बॉय',
    enter_guard_id: 'अपना गार्ड आईडी दर्ज करें',
    continue: 'आगे बढ़ें',
    back: 'पीछे',
    select_gate: 'गेट चुनें *',
    select_wing: 'विंग चुनें',
    optional: '(वैकल्पिक)',
    select_shift: 'शिफ्ट चुनें *',
    take_photo: 'चेक-इन फोटो लें',
    checkin_photo: 'चेक-इन फोटो',
    checkout_photo: 'चेक-आउट फोटो',
    mark_checkin: 'चेक-इन दर्ज करें',
    mark_checkout: 'चेक-आउट दर्ज करें',
    delivery_checkin: 'डिलीवरी चेक-इन',
    delivery_company: 'डिलीवरी कंपनी',
    your_name: 'आपका नाम *',
    phone_number: 'फ़ोन नंबर *',
    vehicle_number: 'वाहन नंबर',
    mark_entry: 'प्रवेश दर्ज करें',
    loading: 'लोड हो रहा है...',
    recording_attendance: 'हाजिरी दर्ज हो रही है...',
    recording_visit: 'प्रवेश दर्ज हो रहा है...',
    error: 'त्रुटि',
    getting_location: 'स्थान प्राप्त कर रहा है...',
    allow_location: 'कृपया स्थान एक्सेस की अनुमति दें।',
    first_time_setup: 'पहली बार चेहरा सेटअप',
    look_camera_register: 'कृपया चेहरा रजिस्टर करने के लिए सीधे कैमरे में देखें।',
    register_face: 'मेरा चेहरा रजिस्टर करें',
    face_mismatch: 'चेहरा मेल नहीं खाया',
    face_verification: 'चेहरा सत्यापन',
    verification_failed: 'सत्यापन विफल',
    verify_identity: 'अपनी पहचान सत्यापित करें',
    face_did_not_match: 'आपका चेहरा पंजीकृत फोटो से मेल नहीं खाता।',
    look_camera_verify: 'सीधे कैमरे में देखें। तैयार होने पर सत्यापित दबाएं।',
    try_again: 'पुनः प्रयास करें',
    verify_my_face: 'मेरा चेहरा सत्यापित करें',
    waiting_for_face: 'चेहरे की प्रतीक्षा है...',
    no_face_detected: 'कोई चेहरा नहीं मिला',
    face_detected: 'चेहरा मिल गया ✓',
    late_arrival: 'देर से आगमन',
    checked_in: 'चेक इन!',
    checked_out: 'चेक आउट!',
    welcome: 'स्वागत है!',
    done: 'हो गया'
  },
  MR: {
    who_are_you: 'तुम्ही कोण आहात?',
    security_guard: 'सुरक्षा रक्षक',
    mark_attendance: 'गार्ड आयडीने उपस्थिती नोंदवा',
    visitors: 'भेट देणारे आणि वितरण',
    delivery_boy: 'डिलिव्हरी बॉय',
    enter_guard_id: 'तुमचा गार्ड आयडी प्रविष्ट करा',
    continue: 'पुढे जा',
    back: 'मागे',
    select_gate: 'गेट निवडा *',
    select_wing: 'विंग निवडा',
    optional: '(पर्यायी)',
    select_shift: 'शिफ्ट निवडा *',
    take_photo: 'चेक-इन फोटो घ्या',
    checkin_photo: 'चेक-इन फोटो',
    checkout_photo: 'चेक-आउट फोटो',
    mark_checkin: 'चेक-इन नोंदवा',
    mark_checkout: 'चेक-आउट नोंदवा',
    delivery_checkin: 'डिलिव्हरी चेक-इन',
    delivery_company: 'डिलिव्हरी कंपनी',
    your_name: 'तुमचे नाव *',
    phone_number: 'फोन नंबर *',
    vehicle_number: 'वाहन क्रमांक',
    mark_entry: 'प्रवेश नोंदवा',
    loading: 'लोड होत आहे...',
    recording_attendance: 'उपस्थिती नोंदवली जात आहे...',
    recording_visit: 'प्रवेश नोंदवला जात आहे...',
    error: 'त्रुटी',
    getting_location: 'स्थान मिळवत आहे...',
    allow_location: 'कृपया स्थान प्रवेशास अनुमती द्या.',
    first_time_setup: 'प्रथमच चेहरा सेटअप',
    look_camera_register: 'तुमचा चेहरा नोंदवण्यासाठी कृपया थेट कॅमेऱ्यात पहा.',
    register_face: 'माझा चेहरा नोंदवा',
    face_mismatch: 'चेहरा जुळत नाही',
    face_verification: 'चेहरा पडताळणी',
    verification_failed: 'पडताळणी अयशस्वी',
    verify_identity: 'तुमची ओळख पडताळा',
    face_did_not_match: 'तुमचा चेहरा नोंदणीकृत फोटोशी जुळला नाही.',
    look_camera_verify: 'कॅमेऱ्याकडे सरळ पहा. तयार झाल्यावर पडताळणी दाबा.',
    try_again: 'पुन्हा प्रयत्न करा',
    verify_my_face: 'माझा चेहरा पडताळा',
    waiting_for_face: 'चेहऱ्याची वाट पाहत आहे...',
    no_face_detected: 'चेहरा सापडला नाही',
    face_detected: 'चेहरा सापडला ✓',
    late_arrival: 'उशिरा आगमन',
    checked_in: 'चेक इन केले!',
    checked_out: 'चेक आउट केले!',
    welcome: 'स्वागत आहे!',
    done: 'पूर्ण'
  }
};


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
  society: { id: string; name: string; address: string; wings: string[]; gates: string[]; latitude: number; longitude: number; geofence_radius: number };
  shifts: { id: string; name: string; start_time: string; end_time: string }[];
  agency?: { logo_url: string | null };
}

interface WatchmanInfo {
  id: string;
  full_name: string;
  employee_id: string;
  wing?: string;
  face_registered: boolean;
  face_descriptor: number[] | null;
}

type Step = 'loading' | 'error' | 'mode_select' | 'enter_id' | 'get_gps' | 'face_registration' | 'face_verification' | 'select_location' | 'select_shift' | 'take_photo' | 'submitting' | 'success'
  | 'delivery_form' | 'delivery_submitting' | 'delivery_success';

export default function ScanPage() {
  const { token } = useParams<{ token: string }>();
  const [gateInfo, setGateInfo] = useState<GateInfo | null>(null);
  const [watchman, setWatchman] = useState<WatchmanInfo | null>(null);
  const [existingRecord, setExistingRecord] = useState<any>(null);
  const [mode, setMode] = useState<'checkin' | 'checkout'>('checkin');
  const [step, setStep] = useState<Step>('loading');
  const [lang, setLang] = useState<Language>('EN');
  const t = TRANSLATIONS[lang];
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [employeeId, setEmployeeId] = useState('');
  const [selectedShiftId, setSelectedShiftId] = useState('');
  const [gpsData, setGpsData] = useState<GeolocationCoordinates | null>(null);
  const [faceVerified, setFaceVerified] = useState<boolean | null>(null);
  const [faceMatchScore, setFaceMatchScore] = useState<number | null>(null);
  const [modelsLoaded, setModelsLoaded] = useState(false);
  const [faceDetected, setFaceDetected] = useState(false);
  const [selectedGate, setSelectedGate] = useState('');
  const [selectedWing, setSelectedWing] = useState('');

  const [deliveryForm, setDeliveryForm] = useState({
    visitor_name: '',
    visitor_phone: '',
    vehicle_number: '',
    delivery_company: 'Zomato' as typeof DELIVERY_COMPANIES[number],
  });
  const [deliveryResult, setDeliveryResult] = useState<any>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const detectionIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const verifyWatchmanRef = useRef<{ wm: WatchmanInfo; detectedMode: 'checkin' | 'checkout' } | null>(null);

  useEffect(() => {
    if (!token) { setStep('error'); setErrorMsg('Invalid QR code'); return; }

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
    if (!navigator.geolocation) { toast.error('Location services not supported.'); setStep('enter_id'); return; }
    navigator.geolocation.getCurrentPosition(
      (pos) => { setGpsData(pos.coords); startFaceVerificationFlow(wm, detectedMode); },
      (err) => {
        toast.error(err.code === 1 ? 'Location access denied. Please enable it in browser settings.' : 'Please enable location services.');
        setStep('enter_id');
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
      if (mode === 'checkin') {
        body.shift_id = selectedShiftId;
        if (selectedGate) body.selected_gate = selectedGate;
        if (selectedWing) body.selected_wing = selectedWing;
      }
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
      setDeliveryResult(r.data.data); setStep('delivery_success');
    } catch (e: any) { toast.error(e.response?.data?.message || 'Check-in failed'); setStep('delivery_form'); }
  }

  const currentTime = new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });

  return (
    <div className="relative min-h-screen flex flex-col items-center justify-center p-5 font-sans">
      
      {/* Language Toggle */}
      <div className="absolute top-6 left-6 z-50">
        <button
          onClick={() => setLang(l => l === 'EN' ? 'HI' : l === 'HI' ? 'MR' : 'EN')}
          className="flex items-center gap-2 bg-white/60 backdrop-blur-md px-3 py-2 rounded-full shadow-sm border border-white/50 text-slate-100 font-bold hover:bg-white/80 transition-all"
        >
          <Globe className="w-4 h-4 text-brand-500" />
          <span className="text-sm">{lang === 'EN' ? 'English' : lang === 'HI' ? 'हिंदी' : 'मराठी'}</span>
        </button>
      </div>
      <video autoPlay loop muted playsInline className="absolute inset-0 w-full h-full object-cover -z-20">
        <source src="/watchmen_background.mp4" type="video/mp4" />
      </video>
      <div className="absolute inset-0 bg-brand-100/50 backdrop-blur-md -z-10" />

      <div className="text-center mb-6 mt-2">
        {gateInfo?.agency?.logo_url ? (
          <img src={gateInfo.agency.logo_url} alt="Agency Logo" className="w-16 h-16 rounded-2xl object-contain bg-white shadow-sm mb-3 mx-auto" />
        ) : (
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-brand-400 to-brand-500 flex items-center justify-center mx-auto mb-3 shadow-md shadow-brand-500/20">
            <ShieldCheck className="w-8 h-8 text-white" />
          </div>
        )}
        <div className="text-slate-500 text-sm font-medium flex items-center justify-center gap-1.5">
          <Clock className="w-4 h-4" /> {currentTime}
        </div>
      </div>

      <div className="w-full max-w-sm mx-auto">
        {gateInfo && step !== 'error' && (
          <div className="text-center mb-8">
            <div className="bg-brand-500/15 border border-brand-500/20 rounded-xl p-4 mb-3">
              <p className="text-brand-400 text-xs font-bold uppercase tracking-widest mb-1">{gateInfo.gate.name}</p>
              <h1 className="text-slate-100 text-xl font-bold">{gateInfo.society.name}</h1>
            </div>
            <p className="text-slate-500 text-xs">{gateInfo.society.address}</p>
          </div>
        )}

        {(step === 'loading' || step === 'submitting' || step === 'delivery_submitting') && (
          <div className="text-center py-10">
            <Loader2 className="w-10 h-10 text-brand-500 animate-spin mx-auto" />
            <p className="text-slate-500 mt-4 font-medium">
              {step === 'delivery_submitting' ? t.recording_visit : step === 'submitting' ? t.recording_attendance : t.loading}
            </p>
          </div>
        )}

        {step === 'error' && (
          <div className="text-center py-6">
            <AlertTriangle className="w-12 h-12 text-danger-400 mx-auto mb-3" />
            <h2 className="text-danger-400 text-lg font-bold">{t.error}</h2>
            <p className="text-slate-500 mt-2">{errorMsg}</p>
          </div>
        )}

        {step === 'mode_select' && (
          <div className="space-y-4">
            <h2 className="text-slate-100 text-2xl font-bold text-center mb-6">{t.who_are_you}</h2>
            <button onClick={() => setStep('enter_id')} className="w-full p-5 rounded-2xl border border-white/60 bg-white/80 backdrop-blur-sm/60 backdrop-blur-md hover:bg-white/80 border-white/50 hover:border-brand-300 hover:shadow-md text-left flex items-center justify-between transition-all group shadow-sm">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-xl bg-brand-50 flex items-center justify-center shrink-0">
                  <ShieldCheck className="w-6 h-6 text-brand-500" />
                </div>
                <div>
                  <p className="text-slate-100 text-[15px] font-bold">{t.security_guard}</p>
                  <p className="text-slate-500 text-[13px]">{t.mark_attendance}</p>
                </div>
              </div>
              <ChevronRight className="w-5 h-5 text-slate-600 group-hover:text-brand-400 transition-colors" />
            </button>
            <div className="flex items-center gap-4 py-4">
              <div className="flex-1 h-px bg-slate-800"></div>
              <h3 className="text-slate-500 text-[10px] font-bold uppercase tracking-widest">{t.visitors}</h3>
              <div className="flex-1 h-px bg-slate-800"></div>
            </div>
            <button onClick={() => setStep('delivery_form')} className="w-full p-5 rounded-2xl border border-white/60 bg-white/80 backdrop-blur-sm/60 backdrop-blur-md hover:bg-white/80 border-white/50 hover:border-orange-300 hover:shadow-md text-left flex items-center justify-between transition-all group shadow-sm">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-xl bg-orange-100 flex items-center justify-center shrink-0">
                  <Bike className="w-6 h-6 text-orange-500" />
                </div>
                <div>
                  <p className="text-slate-100 text-[15px] font-bold">{t.delivery_boy}</p>
                  <p className="text-slate-500 text-[13px]">Zomato, Swiggy, Amazon, etc.</p>
                </div>
              </div>
              <ChevronRight className="w-5 h-5 text-slate-600 group-hover:text-orange-400 transition-colors" />
            </button>
          </div>
        )}

        {step === 'enter_id' && (
          <div className="space-y-4">
            <div className="bg-white/85 backdrop-blur-xl border border-white/60 rounded-[1.5rem] p-6 shadow-[0_4px_20px_-4px_rgba(0,0,0,0.05)] text-center">
              <div className="w-12 h-12 rounded-full bg-brand-50 flex items-center justify-center mx-auto mb-4">
                <User className="w-5 h-5 text-brand-500" />
              </div>
              <h2 className="text-slate-100 text-[19px] font-bold tracking-tight mb-6">{t.enter_guard_id}</h2>
              {errorMsg && <div className="bg-danger-50 text-danger-500 text-sm p-3 rounded-xl mb-4">{errorMsg}</div>}
              <input type="text" placeholder="e.g. EMP001" value={employeeId} onChange={e => { setEmployeeId(e.target.value.toUpperCase()); setErrorMsg(''); }} onKeyDown={e => e.key === 'Enter' && handleLookup()} autoFocus className="w-full p-4 rounded-2xl border border-white/60 bg-white/80 backdrop-blur-sm text-slate-100 text-[15px] font-semibold tracking-[0.2em] text-center focus:border-brand-400 focus:ring-2 focus:ring-brand-100 outline-none transition-all placeholder-slate-400 uppercase mb-6 shadow-sm" />
              <button onClick={handleLookup} disabled={!employeeId.trim()} className={`w-full p-4 rounded-2xl font-bold flex items-center justify-center gap-2 transition-all ${employeeId.trim() ? 'bg-brand-600 hover:bg-brand-700 text-white shadow-lg shadow-brand-500/30' : 'bg-slate-800 text-slate-500 cursor-not-allowed'}`}>{t.continue} <ChevronRight className="w-4 h-4" /></button>
            </div>
            <button onClick={() => setStep('mode_select')} className="w-full mt-6 text-center text-slate-500 text-sm font-medium hover:text-slate-600 transition-colors py-2 flex justify-center items-center gap-1"><ChevronRight className="w-4 h-4 rotate-180" />{t.back}</button>
          </div>
        )}

        {step === 'get_gps' && (
          <div className="text-center py-10">
            <MapPin className="w-12 h-12 text-brand-500 mx-auto mb-4 animate-bounce" />
            <h2 className="text-slate-100 text-lg font-bold">{t.getting_location}</h2>
            <p className="text-slate-500 text-sm mt-2">{t.allow_location}</p>
          </div>
        )}

        {step === 'face_registration' && (
          <div className="space-y-4">
            <div className="flex items-center gap-2 mb-2">
              <ShieldCheck className="w-5 h-5 text-brand-400" />
              <h2 className="text-slate-100 text-lg font-bold">{t.first_time_setup}</h2>
            </div>
            <p className="text-slate-500 text-sm mb-4">{t.look_camera_register}</p>
            <div className={`rounded-xl overflow-hidden aspect-4/3 flex items-center justify-center relative border-2 ${faceDetected ? 'border-success-500 shadow-lg shadow-success-500/20' : 'border-white/50'}`}>
              <video ref={videoCallbackRef} autoPlay playsInline muted className="w-full h-full object-cover scale-x-[-1]" />
              {!faceDetected && <div className="absolute inset-0 flex items-center justify-center bg-black/40"><p className="text-white font-medium bg-black/60 px-3 py-1 rounded-full text-sm backdrop-blur-sm">{t.no_face_detected}</p></div>}
            </div>
            <button onClick={registerFace} disabled={!modelsLoaded || !faceDetected} className={`w-full p-4 rounded-xl font-bold flex items-center justify-center gap-2 text-white shadow-lg transition-all ${faceDetected ? 'bg-brand-600 hover:bg-brand-500' : 'bg-white/70 text-slate-500 cursor-not-allowed'}`}>
              <ScanFace className="w-5 h-5" /> Register My Face
            </button>
          </div>
        )}

        {step === 'face_verification' && (
          <div className="space-y-4">
            <div className="text-center mb-8">
              <div className="bg-brand-50 text-brand-500 mx-auto inline-flex items-center gap-1.5 px-4 py-1.5 rounded-full text-xs font-bold tracking-wide mb-4">
                <ShieldCheck className="w-3.5 h-3.5" />
                {faceVerified === false ? t.face_mismatch : t.face_verification}
              </div>
              <h2 className="text-slate-100 text-2xl font-black tracking-tight mb-2">{faceVerified === false ? t.verification_failed : t.verify_identity}</h2>
              <p className="text-slate-500 text-sm">{faceVerified === false ? t.face_did_not_match : t.look_camera_verify}</p>
            </div>
            {faceVerified === false ? (
              <div className="bg-danger-500/10 border border-danger-500/30 rounded-xl p-6 flex flex-col items-center gap-4">
                <div className="w-16 h-16 rounded-full bg-danger-500/20 border-2 border-danger-500 flex items-center justify-center"><AlertTriangle className="w-8 h-8 text-danger-400" /></div>
                <p className="text-danger-400 font-bold text-lg">{t.face_mismatch} ✕</p>
                <p className="text-slate-500 text-sm text-center">Attendance cannot be marked. If this is a mistake, please try again in better lighting.</p>
                <button onClick={() => { const ctx = verifyWatchmanRef.current; if (!ctx) return; setFaceVerified(null); startFaceVerificationFlow(ctx.wm, ctx.detectedMode); }} className="w-full mt-2 p-4 rounded-xl font-bold bg-danger-600 hover:bg-danger-500 text-white shadow-lg transition-all">{t.try_again}</button>
              </div>
            ) : (
              <>
                <div className="rounded-[2rem] overflow-hidden bg-[#0a1128] aspect-[3/4] relative border-4 border-[#121c3b] shadow-2xl">
                  <video ref={videoCallbackRef} autoPlay playsInline muted className="w-full h-full object-cover scale-x-[-1]" />
                  <div className="absolute inset-0 pointer-events-none p-6">
                    <div className="w-full h-full border-[3px] border-brand-500/30 rounded-[3rem] relative">
                      <div className="absolute top-0 left-0 w-8 h-8 border-t-4 border-l-4 border-brand-500 rounded-tl-[3rem] -mt-1 -ml-1"></div>
                      <div className="absolute top-0 right-0 w-8 h-8 border-t-4 border-r-4 border-brand-500 rounded-tr-[3rem] -mt-1 -mr-1"></div>
                      <div className="absolute bottom-0 left-0 w-8 h-8 border-b-4 border-l-4 border-brand-500 rounded-bl-[3rem] -mb-1 -ml-1"></div>
                      <div className="absolute bottom-0 right-0 w-8 h-8 border-b-4 border-r-4 border-brand-500 rounded-br-[3rem] -mb-1 -mr-1"></div>
                      <div className="absolute inset-0 flex items-center justify-center">
                         <div className={`w-48 h-64 rounded-[4rem] border-2 transition-colors duration-300 ${faceDetected ? 'border-brand-400/80' : 'border-white/10'}`} />
                      </div>
                    </div>
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
                        if (ctx.detectedMode === 'checkin') {
                          stopCamera();
                          setStep('select_shift');
                        }
                        else setStep('take_photo');
                      } else { setFaceVerified(false); }
                    } else { toast.error('No face detected. Ensure good lighting.'); }
                  }}
                  disabled={!faceDetected}
                  className={`w-full p-4 rounded-2xl font-bold flex items-center justify-center gap-2 transition-all mt-6 ${faceDetected ? 'bg-[#0a1128] hover:bg-slate-800 text-white shadow-lg' : 'bg-slate-800 text-slate-500 cursor-not-allowed'}`}
                >
                  <ScanFace className="w-5 h-5" /> {faceDetected ? t.verify_my_face : t.waiting_for_face}
                </button>
              </>
            )}
          </div>
        )}

        {step === 'select_shift' && watchman && (
          <div className="space-y-5">
            <div className="bg-white/85 backdrop-blur-xl border border-white/60 rounded-[1.5rem] p-5 shadow-[0_4px_20px_-4px_rgba(0,0,0,0.05)] flex items-center gap-4">
              <div className="w-10 h-10 rounded-full bg-brand-50 flex items-center justify-center shrink-0">
                <CheckCircle className="w-5 h-5 text-brand-500" />
              </div>
              <div>
                <p className="text-slate-100 font-bold tracking-tight text-[15px]">{watchman.full_name}</p>
                <p className="text-slate-500 text-xs font-medium">ID: {watchman.employee_id}</p>
              </div>
            </div>

            {gateInfo?.society.gates && gateInfo.society.gates.length > 0 && (
              <div>
                <label className="text-slate-500 text-xs font-semibold uppercase tracking-wider block mb-2">{t.select_gate}</label>
                <div className="flex flex-wrap gap-2">
                  {gateInfo.society.gates.map(g => (
                    <button key={g} onClick={() => setSelectedGate(g)}
                      className={`px-6 py-3 rounded-2xl text-[14px] font-bold border transition-all ${selectedGate === g ? 'border-brand-500 bg-brand-50 text-brand-600' : 'border-white/60 bg-white/80 backdrop-blur-sm text-slate-600 hover:border-slate-700 hover:bg-slate-900 shadow-sm'}`}>
                      {g}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {gateInfo?.society.wings && gateInfo.society.wings.length > 0 && (
              <div>
                <label className="text-slate-500 text-xs font-semibold uppercase tracking-wider block mb-2">{t.select_wing} <span className="text-slate-500 font-normal normal-case">{t.optional}</span></label>
                <div className="flex flex-wrap gap-2">
                  {gateInfo.society.wings.map(w => (
                    <button key={w} onClick={() => setSelectedWing(selectedWing === w ? '' : w)}
                      className={`px-6 py-3 rounded-2xl text-[14px] font-bold border transition-all ${selectedWing === w ? 'border-brand-500 bg-brand-50 text-brand-600' : 'border-white/60 bg-white/80 backdrop-blur-sm text-slate-600 hover:border-slate-700 hover:bg-slate-900 shadow-sm'}`}>
                      {w}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div>
              <label className="text-slate-500 text-xs font-semibold uppercase tracking-wider block mb-2">{t.select_shift}</label>
              <div className="space-y-2">
                {gateInfo?.shifts.map(s => (
                  <button key={s.id} onClick={() => setSelectedShiftId(s.id)}
                    className={`w-full p-5 rounded-2xl border text-left flex justify-between items-center transition-all ${selectedShiftId === s.id ? 'border-brand-500 bg-brand-50 text-brand-600 shadow-sm' : 'border-white/60 bg-white/80 backdrop-blur-sm text-slate-600 hover:border-slate-700 hover:bg-slate-900 shadow-sm'}`}>
                    <div className="flex items-center gap-3"><Clock className="w-4 h-4" /><span className="font-bold text-[15px]">{s.name}</span></div>
                    <span className="text-slate-500 text-xs">{s.start_time} &ndash; {s.end_time}</span>
                  </button>
                ))}
              </div>
            </div>

            <button
              onClick={async () => { await startCamera(); setStep('take_photo'); }}
              disabled={!selectedShiftId || !!(gateInfo?.society.gates && gateInfo.society.gates.length > 0 && !selectedGate)}
              className={`w-full p-4 rounded-2xl font-bold flex items-center justify-center gap-2 transition-all mt-8 ${
                selectedShiftId && !(gateInfo?.society.gates && gateInfo.society.gates.length > 0 && !selectedGate)
                  ? 'bg-brand-600 hover:bg-brand-700 text-white shadow-lg shadow-brand-500/30'
                  : 'bg-slate-800 text-slate-500 cursor-not-allowed'
              }`}>
              <Camera className="w-5 h-5" /> {t.take_photo} <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        )}

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
            <div className="rounded-xl overflow-hidden bg-surface-950 aspect-4/3 relative border border-white/50">
              <video ref={videoCallbackRef} autoPlay playsInline muted className="w-full h-full object-cover scale-x-[-1]" />
            </div>
            <canvas ref={canvasRef} className="hidden" />
            <button onClick={capturePhoto} className={`w-full p-4 rounded-xl font-bold flex items-center justify-center gap-2 text-white shadow-lg transition-all ${mode === 'checkin' ? 'bg-success-600 hover:bg-success-500' : 'bg-warning-600 hover:bg-warning-500'}`}>
              {mode === 'checkin' ? <><LogIn className="w-5 h-5" /> {t.mark_checkin}</> : <><LogOut className="w-5 h-5" /> {t.mark_checkout}</>}
            </button>
          </div>
        )}

        {step === 'success' && (
          <div className="text-center py-6">
            <div className={`w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-6 ${successMsg.includes('LATE') ? 'bg-warning-500/10 text-warning-400' : 'bg-success-500/10 text-success-400'}`}>
              <CheckCircle className="w-10 h-10" />
            </div>
            <h2 className="text-slate-100 text-2xl font-bold mb-2">{successMsg.includes('LATE') ? t.late_arrival : mode === 'checkin' ? t.checked_in : t.checked_out}</h2>
            <p className="text-slate-500 text-sm leading-relaxed mb-6">{successMsg}</p>
          </div>
        )}

        {step === 'delivery_form' && (
          <div className="space-y-4">
            <div className="flex items-center gap-2.5 mb-2">
              <Bike className="w-5 h-5 text-orange-400" />
              <h2 className="text-slate-100 text-lg font-bold">{t.delivery_checkin}</h2>
            </div>
            <div>
              <label className="text-slate-500 text-xs font-semibold uppercase tracking-wider block mb-2">{t.delivery_company}</label>
              <div className="flex flex-wrap gap-2">
                {DELIVERY_COMPANIES.map(c => (
                  <button key={c} onClick={() => setDeliveryForm(f => ({ ...f, delivery_company: c }))}
                    className={`px-3 py-1.5 rounded-full text-sm font-bold border-2 transition-all ${deliveryForm.delivery_company === c ? 'border-transparent text-white' : 'border-white/40 text-slate-500 bg-white/70 hover:border-brand-400'}`}
                    style={deliveryForm.delivery_company === c ? { backgroundColor: COMPANY_COLORS[c] || '#64748b' } : {}}
                  >{c}</button>
                ))}
              </div>
            </div>
            <div>
              <label className="text-slate-500 text-xs font-semibold uppercase tracking-wider block mb-1.5">{t.your_name}</label>
              <input type="text" placeholder="Full name" value={deliveryForm.visitor_name} onChange={e => setDeliveryForm(f => ({ ...f, visitor_name: e.target.value }))} className="w-full p-3.5 rounded-xl border border-white/50 bg-white/70 text-slate-100 focus:border-orange-500 focus:ring-1 focus:ring-orange-500 outline-none transition-all placeholder-slate-500" />
            </div>
            <div>
              <label className="text-slate-500 text-xs font-semibold uppercase tracking-wider block mb-1.5">{t.phone_number}</label>
              <input type="tel" maxLength={10} placeholder="10-digit mobile number" value={deliveryForm.visitor_phone} onChange={e => {
                const val = e.target.value.replace(/\D/g, '').slice(0, 10);
                setDeliveryForm(f => ({ ...f, visitor_phone: val }));
              }} className="w-full p-3.5 rounded-xl border border-white/50 bg-white/70 text-slate-100 focus:border-orange-500 focus:ring-1 focus:ring-orange-500 outline-none transition-all placeholder-slate-500" />
            </div>
            <div>
              <label className="text-slate-500 text-xs font-semibold uppercase tracking-wider block mb-1.5">{t.vehicle_number} <span className="text-slate-500 font-normal normal-case">(optional)</span></label>
              <input type="text" placeholder="e.g. MH01AB1234" value={deliveryForm.vehicle_number} onChange={e => setDeliveryForm(f => ({ ...f, vehicle_number: e.target.value.toUpperCase() }))} className="w-full p-3.5 rounded-xl border border-white/50 bg-white/70 text-slate-100 font-mono uppercase focus:border-orange-500 focus:ring-1 focus:ring-orange-500 outline-none transition-all placeholder-slate-500" />
            </div>
            <button onClick={handleDeliveryCheckin} disabled={!deliveryForm.visitor_name.trim() || deliveryForm.visitor_phone.length !== 10} className={`w-full p-4 rounded-xl font-bold flex items-center justify-center gap-2 text-white shadow-lg transition-all ${deliveryForm.visitor_name.trim() && deliveryForm.visitor_phone.length === 10 ? 'bg-orange-600 hover:bg-orange-500' : 'bg-white/70 text-slate-500 cursor-not-allowed'}`}>
              <LogIn className="w-5 h-5" /> Mark Entry
            </button>
            <button onClick={() => setStep('mode_select')} className="w-full text-center text-slate-500 text-sm hover:text-slate-600 transition-colors py-1">← Back</button>
          </div>
        )}

        {step === 'delivery_success' && deliveryResult && (
          <div className="text-center py-6">
            <div className="w-20 h-20 rounded-full bg-success-500/10 flex items-center justify-center mx-auto mb-6">
              <CheckCircle className="w-10 h-10 text-success-400" />
            </div>
            <h2 className="text-slate-100 text-2xl font-bold mb-2">{t.welcome}</h2>
            <p className="text-slate-500 mb-6">
              {`Check-in recorded at ${new Date(deliveryResult.check_in_time).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true })}.`}
            </p>
            <button onClick={() => window.location.reload()} className="w-full p-4 rounded-xl font-bold bg-white/70 hover:bg-slate-800/60 text-slate-600 transition-all">
              Done
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
