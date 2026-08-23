import { Router, Request, Response } from 'express';
import { z } from 'zod';
import multer from 'multer';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { authenticate, requireRole } from '../middleware/auth';
import { asyncHandler, AppError, logAudit } from '../middleware/errorHandler';
import { checkGeofence } from '../utils/haversine';
import { analyzeGpsFlags } from '../utils/gpsFlags';
import { config } from '../config';
import { Watchman, Assignment, Attendance, Society, Shift } from '../models';

const router = Router();
router.use(authenticate);

// Selfie upload config
const storage = multer.diskStorage({
  destination: config.uploads.dir,
  filename: (_req, file, cb) => {
    cb(null, `selfie-${uuidv4()}${path.extname(file.originalname)}`);
  },
});
const upload = multer({
  storage,
  limits: { fileSize: config.uploads.maxFileSizeMb * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith('image/')) cb(null, true);
    else cb(new Error('Only image files are allowed'));
  },
});

/** ─── WATCHMAN: Get today's assignment ─────────────────────────────── */
router.get(
  '/my-assignment',
  requireRole('watchman'),
  asyncHandler(async (req: Request, res: Response) => {
    const agencyId = req.user!.agencyId!;
    const userId = req.user!.userId;

    // Get watchman record
    const watchman = await Watchman.findOne({ user_id: userId, agency_id: agencyId });
    if (!watchman || watchman.status !== 'active') {
      res.status(403).json({ success: false, message: 'Watchman account is inactive' });
      return;
    }

    const now = new Date();
    const dateStr = now.toISOString().split('T')[0];
    const timeStr = now.toTimeString().slice(0, 5);
    const dateObj = new Date(dateStr);

    // Get all assignments for today
    const assignments = await Assignment.find({
      agency_id: agencyId,
      watchman_id: watchman._id,
      is_active: true,
      start_date: { $lte: dateObj },
      $or: [{ end_date: null }, { end_date: { $exists: false } }, { end_date: { $gte: dateObj } }],
    })
      .populate('society_id')
      .populate('shift_id')
      .exec();

    if (assignments.length === 0) {
      res.json({ success: true, data: null, watchman, message: 'No assignment for today' });
      return;
    }

    // Find shift matching current time
    let active = assignments.find(a => {
      const sh = a.shift_id as any;
      return isTimeInShift(timeStr, sh.start_time.slice(0, 5), sh.end_time.slice(0, 5), sh.is_overnight);
    }) || assignments[0];

    const sh = active.shift_id as any;
    const soc = active.society_id as any;

    // Check if attendance already marked for this assignment+date+shift
    const att = await Attendance.findOne({
      watchman_id: watchman._id,
      attendance_date: dateObj,
      shift_id: sh._id,
    });

    res.json({
      success: true,
      watchman,
      data: {
        id: active._id.toString(),
        assignment_id: active._id.toString(),
        society_name: soc.name,
        society_address: soc.address,
        society_lat: soc.latitude,
        society_lon: soc.longitude,
        geofence_radius: soc.geofence_radius,
        shift_name: sh.name,
        start_time: sh.start_time,
        end_time: sh.end_time,
        is_overnight: sh.is_overnight,
        late_threshold_minutes: sh.late_threshold_minutes,
      },
      attendance: att || null,
    });
  })
);

/** ─── WATCHMAN: Mark attendance ────────────────────────────────────── */
const markAttendanceSchema = z.object({
  assignmentId: z.string().min(1),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  gpsAccuracy: z.number().min(0),
  clientTimestamp: z.string().optional(),
  isOfflineSync: z.boolean().default(false),
  deviceInfo: z.record(z.unknown()).optional(),
  faceVerified: z.boolean().optional(),
  faceMatchScore: z.number().optional(),
});

router.post(
  '/mark',
  requireRole('watchman'),
  upload.single('selfie'),
  asyncHandler(async (req: Request, res: Response) => {
    const agencyId = req.user!.agencyId!;
    const userId = req.user!.userId;

    // Parse body (multer puts text fields in req.body as strings)
    const bodyParsed = {
      assignmentId: req.body.assignmentId,
      latitude: parseFloat(req.body.latitude),
      longitude: parseFloat(req.body.longitude),
      gpsAccuracy: parseFloat(req.body.gpsAccuracy),
      clientTimestamp: req.body.clientTimestamp,
      isOfflineSync: req.body.isOfflineSync === 'true',
      deviceInfo: req.body.deviceInfo ? JSON.parse(req.body.deviceInfo) : undefined,
      faceVerified: req.body.faceVerified === 'true',
      faceMatchScore: req.body.faceMatchScore ? parseFloat(req.body.faceMatchScore) : undefined,
    };

    const parse = markAttendanceSchema.safeParse(bodyParsed);
    if (!parse.success) {
      res.status(400).json({ success: false, message: 'Invalid attendance data' });
      return;
    }
    const d = parse.data;

    // 1. Get watchman
    const watchman = await Watchman.findOne({ user_id: userId, agency_id: agencyId });
    if (!watchman || watchman.status !== 'active') {
      res.status(403).json({ success: false, message: 'Your account is inactive. Contact your agency.' });
      return;
    }

    // 1b. Block attendance if face is not registered
    if (watchman.face_registered && d.faceVerified === false) {
      res.status(403).json({
        success: false,
        message: 'Face verification failed. Your face did not match the registered photo. Please try again in better lighting.',
      });
      return;
    }

    // 2. Get assignment with society + shift details
    const assignment = await Assignment.findOne({
      _id: d.assignmentId,
      agency_id: agencyId,
      watchman_id: watchman._id,
      is_active: true,
    })
      .populate('society_id')
      .populate('shift_id');

    if (!assignment) {
      res.status(404).json({ success: false, message: 'Assignment not found. Contact your agency.' });
      return;
    }

    const soc = assignment.society_id as any;
    const sh = assignment.shift_id as any;

    // 3. Determine attendance date/time
    const checkInTime = d.isOfflineSync && d.clientTimestamp
      ? new Date(d.clientTimestamp)
      : new Date();

    const dateStr = checkInTime.toISOString().split('T')[0];
    const timeStr = checkInTime.toTimeString().slice(0, 5);
    const dateObj = new Date(dateStr);

    // 4. Check if assignment is valid for this date
    if (assignment.start_date > dateObj || (assignment.end_date && assignment.end_date < dateObj)) {
      res.status(400).json({ success: false, message: 'No active assignment for today. Contact your agency.' });
      return;
    }

    // 5. Check shift time window (with ±30 min buffer before shift)
    const shiftStart = sh.start_time.slice(0, 5);
    const shiftEnd = sh.end_time.slice(0, 5);
    const isInShift = isTimeInShiftWithBuffer(timeStr, shiftStart, shiftEnd, sh.is_overnight, 30);

    if (!isInShift && !d.isOfflineSync) {
      res.status(400).json({
        success: false,
        message: `Attendance can only be marked during your shift (${formatTime(shiftStart)} - ${formatTime(shiftEnd)}).`,
      });
      return;
    }

    // 6. Check duplicate attendance
    const existing = await Attendance.findOne({
      watchman_id: watchman._id,
      attendance_date: dateObj,
      shift_id: sh._id,
    });

    if (existing) {
      res.status(409).json({
        success: false,
        message: 'Attendance already marked for this shift.',
        attendance: existing,
      });
      return;
    }

    // 7. Geofence check
    const { distance, isInside } = checkGeofence(
      d.latitude, d.longitude,
      soc.latitude,
      soc.longitude,
      soc.geofence_radius
    );

    if (!isInside) {
      res.status(400).json({
        success: false,
        message: `You are ${Math.round(distance)}m away from ${soc.name}. You must be inside the society to mark attendance.`,
        distance: Math.round(distance),
        allowedRadius: soc.geofence_radius,
      });
      return;
    }

    // 8. GPS security analysis
    const gpsAnalysis = analyzeGpsFlags({
      accuracy: d.gpsAccuracy,
      distance,
      societyRadius: soc.geofence_radius,
      userAgent: req.headers['user-agent'],
    });

    // 9. Determine attendance status (PRESENT or LATE)
    const status = determineAttendanceStatus(timeStr, shiftStart, sh.late_threshold_minutes);

    // 10. Store selfie URL
    const selfieUrl = req.file ? `/uploads/${req.file.filename}` : null;

    // 11. Create attendance record
    const att = new Attendance({
      agency_id: agencyId,
      watchman_id: watchman._id,
      society_id: soc._id,
      shift_id: sh._id,
      assignment_id: assignment._id,
      attendance_date: dateObj,
      check_in_time: checkInTime,
      latitude: d.latitude,
      longitude: d.longitude,
      gps_accuracy: d.gpsAccuracy,
      distance_from_society: distance,
      selfie_url: selfieUrl,
      device_info: d.deviceInfo,
      status,
      verification_status: d.faceVerified === false ? 'suspicious'
        : d.faceMatchScore && d.faceMatchScore > 0.5 ? 'warning'
        : gpsAnalysis.verificationStatus,
      gps_flags: gpsAnalysis.flags,
      is_offline_sync: d.isOfflineSync,
      client_timestamp: d.clientTimestamp ? new Date(d.clientTimestamp) : null,
      synced_at: d.isOfflineSync ? new Date() : null,
      face_verified: d.faceVerified ?? null,
      face_match_score: d.faceMatchScore ?? null,
    });

    await att.save();

    res.status(201).json({
      success: true,
      message: status === 'present'
        ? '✓ Attendance marked successfully!'
        : '⚠ Attendance marked as late.',
      data: {
        ...att.toJSON(),
        societyName: soc.name,
        shiftName: sh.name,
        distance: Math.round(distance),
      },
    });
  })
);

/** ─── AGENCY: Get attendance list ──────────────────────────────────── */
router.get(
  '/',
  requireRole(['agency_admin', 'super_admin']),
  asyncHandler(async (req: Request, res: Response) => {
    const agencyId = req.user!.role === 'super_admin'
      ? (req.query.agency_id as string)
      : req.user!.agencyId!;

    if (!agencyId) throw new AppError('agency_id required', 400);

    const { date, societyId, watchmanId, status, page = '1', limit = '50' } = req.query;
    const skip = (parseInt(page as string) - 1) * parseInt(limit as string);

    const matchStage: any = { agency_id: agencyId };
    if (date) matchStage.attendance_date = new Date(date as string);
    if (societyId) matchStage.society_id = societyId;
    if (watchmanId) matchStage.watchman_id = watchmanId;
    if (status) matchStage.status = status;

    const list = await Attendance.aggregate([
      { $match: matchStage },
      {
        $lookup: {
          from: 'watchmen',
          localField: 'watchman_id',
          foreignField: '_id',
          as: 'watchman',
        },
      },
      { $unwind: '$watchman' },
      {
        $lookup: {
          from: 'societies',
          localField: 'society_id',
          foreignField: '_id',
          as: 'society',
        },
      },
      { $unwind: '$society' },
      {
        $lookup: {
          from: 'shifts',
          localField: 'shift_id',
          foreignField: '_id',
          as: 'shift',
        },
      },
      { $unwind: '$shift' },
      {
        $addFields: {
          watchman_name: '$watchman.full_name',
          employee_id: '$watchman.employee_id',
          society_name: '$society.name',
          shift_name: '$shift.name',
          start_time: '$shift.start_time',
          end_time: '$shift.end_time',
        },
      },
      { $project: { watchman: 0, society: 0, shift: 0 } },
      { $sort: { check_in_time: -1 } },
      { $skip: skip },
      { $limit: parseInt(limit as string) },
    ]);

    const formatted = list.map(a => {
      a.id = a._id.toString();
      delete a._id;
      delete a.__v;
      return a;
    });

    res.json({ success: true, data: formatted });
  })
);

/** ─── AGENCY: Override attendance ─────────────────────────────────── */
router.patch(
  '/:id/override',
  requireRole(['agency_admin', 'super_admin']),
  asyncHandler(async (req: Request, res: Response) => {
    const agencyId = req.user!.role === 'super_admin'
      ? (req.body.agencyId as string)
      : req.user!.agencyId!;

    const { status, note } = req.body;
    if (!status || !note) throw new AppError('status and note are required for override', 400);

    const att = await Attendance.findOne({ _id: req.params.id, agency_id: agencyId });
    if (!att) throw new AppError('Attendance record not found', 404);

    const oldStatus = att.status;

    att.status = status;
    att.manual_override = true;
    att.override_note = note;
    att.override_by = req.user!.userId as any;
    att.override_at = new Date();

    await att.save();

    await logAudit(null as any, { agencyId, userId: req.user!.userId, action: 'override_attendance',
      entityType: 'attendance', entityId: att.id,
      oldValues: { status: oldStatus }, newValues: { status, note }, req });

    res.json({ success: true, data: att });
  })
);

// ── Helpers ──────────────────────────────────────────────────────────

function timeToMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
}

function isTimeInShift(time: string, start: string, end: string, isOvernight: boolean): boolean {
  const t = timeToMinutes(time);
  const s = timeToMinutes(start);
  const e = timeToMinutes(end);
  if (!isOvernight) return t >= s && t <= e;
  return t >= s || t <= e;
}

/**
 * Check if time is within shift window, allowing a buffer before shift start
 * to let watchmen mark attendance early.
 */
function isTimeInShiftWithBuffer(
  time: string,
  start: string,
  end: string,
  isOvernight: boolean,
  bufferMinutes: number
): boolean {
  let t = timeToMinutes(time);
  let s = timeToMinutes(start);
  let e = timeToMinutes(end);

  // Apply buffer to start time
  s -= bufferMinutes;
  
  if (s < 0) {
    s += 1440; // Wrap around to previous day
    // If the shift wasn't already overnight, moving the start time before midnight makes it span midnight
    if (!isOvernight) {
      isOvernight = true;
    }
  }

  if (isOvernight) {
    return t >= s || t <= e;
  }
  return t >= s && t <= e;
}

function determineAttendanceStatus(
  checkInTime: string,
  shiftStart: string,
  lateThresholdMinutes: number
): 'present' | 'late' {
  const [cH, cM] = checkInTime.split(':').map(Number);
  const [sH, sM] = shiftStart.split(':').map(Number);
  const diffMinutes = (cH * 60 + cM) - (sH * 60 + sM);
  return diffMinutes <= lateThresholdMinutes ? 'present' : 'late';
}

function formatTime(time: string): string {
  const [h, m] = time.split(':').map(Number);
  const period = h >= 12 ? 'PM' : 'AM';
  const hour = h % 12 || 12;
  return `${hour}:${m.toString().padStart(2, '0')} ${period}`;
}

export default router;
