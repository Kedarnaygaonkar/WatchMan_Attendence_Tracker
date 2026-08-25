import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { Gate, Watchman, Assignment, Attendance, Shift, Society } from '../models';
import { asyncHandler, AppError } from '../middleware/errorHandler';

const router = Router();
// ⚠️ ALL routes here are PUBLIC — no authenticate middleware

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/scan/:token
// Called when a guard scans a QR code. Returns gate/society info + shifts.
// ─────────────────────────────────────────────────────────────────────────────
router.get(
  '/:token',
  asyncHandler(async (req: Request, res: Response) => {
    const gate = await Gate.findOne({ qr_token: req.params.token, is_active: true })
      .populate<{ society_id: any }>('society_id', 'name address wings geofence_radius latitude longitude')
      .lean();

    if (!gate) throw new AppError('Invalid or expired QR code', 404);

    const society = gate.society_id as any;

    // Return available shifts for this agency
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
// Guard enters their Guard ID to look up their details
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

    // Check if guard already has a check-in today (for this society)
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
// POST /api/scan/checkin
// Records the guard's check-in time
// ─────────────────────────────────────────────────────────────────────────────
const checkinSchema = z.object({
  employee_id: z.string().min(1),
  gate_token: z.string().uuid(),
  shift_id: z.string().min(1),
  selfie_url: z.string().optional(),
  latitude: z.number().optional(),
  longitude: z.number().optional(),
});

router.post(
  '/checkin',
  asyncHandler(async (req: Request, res: Response) => {
    const parse = checkinSchema.safeParse(req.body);
    if (!parse.success) throw new AppError('Invalid data: ' + JSON.stringify(parse.error.flatten().fieldErrors), 400);

    const { employee_id, gate_token, shift_id, selfie_url, latitude, longitude } = parse.data;

    const gate = await Gate.findOne({ qr_token: gate_token, is_active: true }).lean();
    if (!gate) throw new AppError('Invalid or expired QR code', 404);

    const watchman = await Watchman.findOne({
      employee_id: employee_id.trim().toUpperCase(),
      agency_id: gate.agency_id,
      status: 'active',
    }).lean();
    if (!watchman) throw new AppError('Guard ID not found or inactive', 404);

    const shift = await Shift.findById(shift_id).lean();
    if (!shift) throw new AppError('Shift not found', 404);

    // Prevent duplicate check-in today
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

    // Determine late status
    const now = new Date();
    const [shiftH, shiftM] = shift.start_time.split(':').map(Number);
    const shiftStart = new Date();
    shiftStart.setHours(shiftH, shiftM, 0, 0);
    const diffMinutes = (now.getTime() - shiftStart.getTime()) / 60000;
    const isLate = diffMinutes > shift.late_threshold_minutes;

    const record = await Attendance.create({
      agency_id: gate.agency_id,
      watchman_id: watchman._id,
      society_id: gate.society_id,
      gate_id: gate._id,
      shift_id: shift._id,
      attendance_date: today,
      check_in_time: now,
      selfie_url: selfie_url ?? undefined,
      latitude: latitude ?? undefined,
      longitude: longitude ?? undefined,
      status: isLate ? 'late' : 'present',
      verification_status: 'verified',
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
// Records the guard's check-out time
// ─────────────────────────────────────────────────────────────────────────────
const checkoutSchema = z.object({
  employee_id: z.string().min(1),
  gate_token: z.string().uuid(),
  selfie_url: z.string().optional(),
  latitude: z.number().optional(),
  longitude: z.number().optional(),
});

router.post(
  '/checkout',
  asyncHandler(async (req: Request, res: Response) => {
    const parse = checkoutSchema.safeParse(req.body);
    if (!parse.success) throw new AppError('Invalid data', 400);

    const { employee_id, gate_token, selfie_url, latitude, longitude } = parse.data;

    const gate = await Gate.findOne({ qr_token: gate_token, is_active: true }).lean();
    if (!gate) throw new AppError('Invalid or expired QR code', 404);

    const watchman = await Watchman.findOne({
      employee_id: employee_id.trim().toUpperCase(),
      agency_id: gate.agency_id,
      status: 'active',
    }).lean();
    if (!watchman) throw new AppError('Guard ID not found or inactive', 404);

    // Find today's open check-in
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const record = await Attendance.findOne({
      watchman_id: watchman._id,
      society_id: gate.society_id,
      check_in_time: { $gte: today, $lt: tomorrow },
    });

    if (!record) throw new AppError('No check-in found for today at this society', 404);
    if ((record as any).check_out_time) throw new AppError('Already checked out today', 409);

    const now = new Date();
    const durationMs = now.getTime() - record.check_in_time.getTime();
    const durationMinutes = Math.round(durationMs / 60000);

    record.set('check_out_time', now);
    record.set('check_out_selfie_url', selfie_url || null);
    record.set('check_out_latitude', latitude || null);
    record.set('check_out_longitude', longitude || null);
    record.set('duration_minutes', durationMinutes);
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
