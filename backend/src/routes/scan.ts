import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { Gate, Watchman, Attendance, Shift } from '../models';
import { asyncHandler, AppError } from '../middleware/errorHandler';
import { getDistance } from 'geolib';

const router = Router();
// ⚠️ ALL routes here are PUBLIC — no authenticate middleware

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/scan/:token
// ─────────────────────────────────────────────────────────────────────────────
router.get(
  '/:token',
  asyncHandler(async (req: Request, res: Response) => {
    const gate = await Gate.findOne({ qr_token: req.params.token, is_active: true })
      .populate<{ society_id: any }>('society_id', 'name address wings geofence_radius latitude longitude')
      .lean();

    if (!gate) throw new AppError('Invalid or expired QR code', 404);

    const society = gate.society_id as any;
    const shifts = await Shift.find({ agency_id: gate.agency_id, is_active: true }).lean();

    res.json({
      success: true,
      data: {
        gate: { id: gate._id, name: gate.name },
        society: {
          id: society._id,
          name: society.name,
          address: society.address,
          wings: society.wings || [],
          latitude: society.latitude,
          longitude: society.longitude,
          geofence_radius: society.geofence_radius,
        },
        shifts: shifts.map((s) => ({
          id: s._id,
          name: s.name,
          start_time: s.start_time,
          end_time: s.end_time,
          is_overnight: s.is_overnight,
        })),
      },
    });
  })
);

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/scan/lookup
// ─────────────────────────────────────────────────────────────────────────────
router.post(
  '/lookup',
  asyncHandler(async (req: Request, res: Response) => {
    const { employee_id, gate_token } = req.body;
    if (!employee_id || !gate_token) throw new AppError('employee_id and gate_token are required', 400);

    const gate = await Gate.findOne({ qr_token: gate_token, is_active: true }).lean();
    if (!gate) throw new AppError('Invalid or expired QR code', 404);

    const watchman = await Watchman.findOne({
      employee_id: employee_id.trim().toUpperCase(),
      agency_id: gate.agency_id,
      status: 'active',
    }).lean();

    if (!watchman) throw new AppError('Guard ID not found or inactive', 404);

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const existingRecord = await Attendance.findOne({
      watchman_id: watchman._id,
      society_id: gate.society_id,
      check_in_time: { $gte: today, $lt: tomorrow },
    }).lean();

    res.json({
      success: true,
      data: {
        watchman: {
          id: watchman._id,
          full_name: watchman.full_name,
          employee_id: watchman.employee_id,
          wing: watchman.wing || null,
          profile_photo_url: watchman.profile_photo_url || null,
          face_registered: !!watchman.face_registered,
          face_descriptor: watchman.face_registered ? watchman.face_descriptor : null,
        },
        existing_record: existingRecord
          ? {
              id: existingRecord._id,
              check_in_time: existingRecord.check_in_time,
              check_out_time: (existingRecord as any).check_out_time || null,
              status: existingRecord.status,
            }
          : null,
        mode: existingRecord && !(existingRecord as any).check_out_time ? 'checkout' : 'checkin',
      },
    });
  })
);

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/scan/register-face
// ─────────────────────────────────────────────────────────────────────────────
const registerFaceSchema = z.object({
  employee_id: z.string().min(1),
  gate_token: z.string().uuid(),
  face_descriptor: z.array(z.number()).length(128),
});

router.post(
  '/register-face',
  asyncHandler(async (req: Request, res: Response) => {
    const parse = registerFaceSchema.safeParse(req.body);
    if (!parse.success) throw new AppError('Invalid face descriptor data', 400);
    const { employee_id, gate_token, face_descriptor } = parse.data;

    const gate = await Gate.findOne({ qr_token: gate_token, is_active: true }).lean();
    if (!gate) throw new AppError('Invalid or expired QR code', 404);

    const watchman = await Watchman.findOne({
      employee_id: employee_id.trim().toUpperCase(),
      agency_id: gate.agency_id,
    });
    if (!watchman) throw new AppError('Guard ID not found', 404);

    watchman.face_descriptor = face_descriptor;
    watchman.face_registered = true;
    await watchman.save();

    res.json({ success: true, message: 'Face registered successfully' });
  })
);

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/scan/checkin
// ─────────────────────────────────────────────────────────────────────────────
const checkinSchema = z.object({
  employee_id: z.string().min(1),
  gate_token: z.string().uuid(),
  shift_id: z.string().min(1),
  selfie_url: z.string().optional(),
  latitude: z.number().optional(),
  longitude: z.number().optional(),
  gps_accuracy: z.number().optional(),
  face_verified: z.boolean().optional(),
  face_match_score: z.number().optional(),
});

router.post(
  '/checkin',
  asyncHandler(async (req: Request, res: Response) => {
    const parse = checkinSchema.safeParse(req.body);
    if (!parse.success) throw new AppError('Invalid data', 400);

    const { employee_id, gate_token, shift_id, selfie_url, latitude, longitude, gps_accuracy, face_verified, face_match_score } = parse.data;

    const gate = await Gate.findOne({ qr_token: gate_token, is_active: true })
      .populate<{ society_id: any }>('society_id', 'latitude longitude geofence_radius')
      .lean();
    if (!gate) throw new AppError('Invalid or expired QR code', 404);

    const watchman = await Watchman.findOne({
      employee_id: employee_id.trim().toUpperCase(),
      agency_id: gate.agency_id,
      status: 'active',
    }).lean();
    if (!watchman) throw new AppError('Guard ID not found or inactive', 404);

    const shift = await Shift.findById(shift_id).lean();
    if (!shift) throw new AppError('Shift not found', 404);

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const duplicate = await Attendance.findOne({
      watchman_id: watchman._id,
      society_id: gate.society_id,
      check_in_time: { $gte: today, $lt: tomorrow },
    });
    if (duplicate) throw new AppError('Already checked in today for this society', 409);

    // Calculate distance if GPS provided
    let distanceFromSociety: number | undefined;
    const society = gate.society_id as any;
    if (latitude && longitude && society.latitude && society.longitude) {
      distanceFromSociety = getDistance(
        { latitude, longitude },
        { latitude: society.latitude, longitude: society.longitude }
      );
      
      if (distanceFromSociety > society.geofence_radius) {
        throw new AppError(`You are ${Math.round(distanceFromSociety)}m away from the society. You must be inside to mark attendance.`, 400);
      }
    } else {
      throw new AppError('GPS location is required to mark attendance', 400);
    }

    const now = new Date();
    const [shiftH, shiftM] = shift.start_time.split(':').map(Number);
    const shiftStart = new Date();
    shiftStart.setHours(shiftH, shiftM, 0, 0);
    const diffMinutes = (now.getTime() - shiftStart.getTime()) / 60000;
    const isLate = diffMinutes > shift.late_threshold_minutes;

    const record = await Attendance.create({
      agency_id: gate.agency_id,
      watchman_id: watchman._id,
      society_id: society._id,
      gate_id: gate._id,
      shift_id: shift._id,
      attendance_date: today,
      check_in_time: now,
      selfie_url: selfie_url ?? undefined,
      latitude: latitude ?? undefined,
      longitude: longitude ?? undefined,
      gps_accuracy: gps_accuracy ?? undefined,
      distance_from_society: distanceFromSociety,
      face_verified: face_verified ?? undefined,
      face_match_score: face_match_score ?? undefined,
      status: isLate ? 'late' : 'present',
      verification_status: face_verified === false ? 'review_required' : 'verified',
      gps_flags: [],
      is_offline_sync: false,
      manual_override: false,
    });

    res.status(201).json({
      success: true,
      message: isLate ? `Checked in — marked LATE (${Math.round(diffMinutes)} min after shift start)` : 'Checked in successfully!',
      data: {
        attendance_id: (record as any)._id,
        watchman_name: watchman.full_name,
        check_in_time: (record as any).check_in_time,
        status: (record as any).status,
        is_late: isLate,
      },
    });
  })
);

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/scan/checkout
// ─────────────────────────────────────────────────────────────────────────────
const checkoutSchema = z.object({
  employee_id: z.string().min(1),
  gate_token: z.string().uuid(),
  selfie_url: z.string().optional(),
  latitude: z.number().optional(),
  longitude: z.number().optional(),
  gps_accuracy: z.number().optional(),
  face_verified: z.boolean().optional(),
  face_match_score: z.number().optional(),
});

router.post(
  '/checkout',
  asyncHandler(async (req: Request, res: Response) => {
    const parse = checkoutSchema.safeParse(req.body);
    if (!parse.success) throw new AppError('Invalid data', 400);

    const { employee_id, gate_token, selfie_url, latitude, longitude, gps_accuracy, face_verified, face_match_score } = parse.data;

    const gate = await Gate.findOne({ qr_token: gate_token, is_active: true })
      .populate<{ society_id: any }>('society_id', 'latitude longitude geofence_radius')
      .lean();
    if (!gate) throw new AppError('Invalid or expired QR code', 404);

    const watchman = await Watchman.findOne({
      employee_id: employee_id.trim().toUpperCase(),
      agency_id: gate.agency_id,
      status: 'active',
    }).lean();
    if (!watchman) throw new AppError('Guard ID not found or inactive', 404);

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const record = await Attendance.findOne({
      watchman_id: watchman._id,
      society_id: (gate.society_id as any)._id,
      check_in_time: { $gte: today, $lt: tomorrow },
    });

    if (!record) throw new AppError('No check-in found for today', 404);
    if ((record as any).check_out_time) throw new AppError('Already checked out today', 409);

    const now = new Date();
    const durationMs = now.getTime() - record.check_in_time.getTime();
    const durationMinutes = Math.round(durationMs / 60000);

    record.set('check_out_time', now);
    record.set('check_out_selfie_url', selfie_url || null);
    record.set('check_out_latitude', latitude || null);
    record.set('check_out_longitude', longitude || null);
    record.set('duration_minutes', durationMinutes);
    if (face_verified !== undefined) record.set('face_verified', face_verified);
    if (face_match_score !== undefined) record.set('face_match_score', face_match_score);
    
    // Check GPS distance on checkout too (optional but useful)
    if (latitude && longitude && (gate.society_id as any).latitude) {
       const dist = getDistance(
         { latitude, longitude },
         { latitude: (gate.society_id as any).latitude, longitude: (gate.society_id as any).longitude }
       );
       
       if (dist > (gate.society_id as any).geofence_radius) {
         throw new AppError(`You are ${Math.round(dist)}m away from the society. You must be inside to mark attendance.`, 400);
       }
       
       record.set('distance_from_society', dist);
    } else {
      throw new AppError('GPS location is required to checkout', 400);
    }
    
    if (face_verified === false) {
      record.set('verification_status', 'review_required');
    }

    await record.save();

    const hours = Math.floor(durationMinutes / 60);
    const mins = durationMinutes % 60;

    res.json({
      success: true,
      message: `Checked out successfully! Shift duration: ${hours}h ${mins}m`,
      data: {
        attendance_id: record._id,
        watchman_name: watchman.full_name,
        check_in_time: record.check_in_time,
        check_out_time: now,
        duration_minutes: durationMinutes,
      },
    });
  })
);

export default router;
