import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { authenticate, requireRole } from '../middleware/auth';
import { asyncHandler, AppError, logAudit } from '../middleware/errorHandler';
import { Shift, Assignment } from '../models';

const router = Router();
router.use(authenticate);
router.use(requireRole(['agency_admin', 'super_admin']));

const shiftSchema = z.object({
  name: z.string().min(2).max(100),
  shiftType: z.enum(['day', 'night', 'overtime']).default('day'),
  startTime: z.string().regex(/^\d{2}:\d{2}$/, 'Format: HH:MM').optional().or(z.literal('')),
  endTime: z.string().regex(/^\d{2}:\d{2}$/, 'Format: HH:MM').optional().or(z.literal('')),
  durationHours: z.number().min(0).max(24).optional(),
  isOvernight: z.boolean().default(false),
  lateThresholdMinutes: z.number().min(0).max(120).default(15),
  allowOvertime: z.boolean().default(false),
  overtimeHours: z.number().min(0).max(24).default(0),
  isActive: z.boolean().default(true),
  agencyId: z.string().optional(),
});

function getAgencyId(req: Request): string | null {
  if (req.user!.role === 'super_admin') {
    const id = req.query.agency_id || req.body.agencyId;
    if (id) return id as string;
    
    return null;
  }
  return req.user!.agencyId!;
}

router.get('/', asyncHandler(async (req: Request, res: Response) => {
  let agencyId: string | null | undefined = req.user!.agencyId;
  if (req.user!.role === 'super_admin') {
    agencyId = req.query.agency_id ? (req.query.agency_id as string) : null;
  }
  
  const matchObj: any = {};
  if (agencyId) matchObj.agency_id = new (require('mongoose').Types.ObjectId)(agencyId);

  const shifts = await Shift.aggregate([
    { $match: matchObj },
    {
      $lookup: {
        from: 'assignments',
        localField: '_id',
        foreignField: 'shift_id',
        as: 'assignments',
        pipeline: [{ $match: { is_active: true } }],
      },
    },
    {
      $addFields: {
        active_assignments: { $size: '$assignments' },
      },
    },
    { $project: { assignments: 0 } },
    { $sort: { start_time: 1 } },
  ]);

  const formatted = shifts.map(s => {
    s.id = s._id.toString();
    // Auto-detect shift_type if not explicitly set
    if (!s.shift_type) {
      if (s.name?.toLowerCase().includes('overtime') || (!s.start_time && s.duration_hours) || (!s.start_time && !s.end_time)) {
        s.shift_type = 'overtime';
      } else if (s.is_overnight || s.name?.toLowerCase().includes('night')) {
        s.shift_type = 'night';
      } else {
        s.shift_type = 'day';
      }
    }
    s.duration_hours = Number(s.duration_hours || s.overtime_hours || 0);
    s.allow_overtime = Boolean(s.allow_overtime || s.shift_type === 'overtime');
    s.overtime_hours = Number(s.overtime_hours || s.duration_hours || 0);
    delete s._id;
    delete s.__v;
    return s;
  });

  res.json({ success: true, data: formatted });
}));

router.get('/:id', asyncHandler(async (req: Request, res: Response) => {
  const agencyId = getAgencyId(req);
  const shift = await Shift.findOne({ _id: req.params.id, agency_id: agencyId });
  if (!shift) throw new AppError('Shift not found', 404);
  res.json({ success: true, data: shift });
}));

router.post('/', asyncHandler(async (req: Request, res: Response) => {
  const agencyId = getAgencyId(req);
  const parse = shiftSchema.safeParse(req.body);
  if (!parse.success) {
    res.status(400).json({ success: false, message: 'Validation failed', errors: parse.error.flatten().fieldErrors });
    return;
  }

  const d = parse.data;
  const isOvertime = d.shiftType === 'overtime' || d.name.toLowerCase().includes('overtime');

  let isOvernight = d.isOvernight;
  if (!isOvertime && d.startTime && d.endTime) {
    isOvernight = d.isOvernight || (d.endTime !== '00:00' && d.endTime < d.startTime);
  }

  const shiftType = isOvertime ? 'overtime' : (d.shiftType || (isOvernight ? 'night' : 'day'));
  const durationHours = isOvertime ? Number(d.durationHours || d.overtimeHours || 3) : Number(d.durationHours || 0);

  const shift = new Shift({
    agency_id: agencyId,
    name: d.name,
    shift_type: shiftType,
    start_time: isOvertime ? '' : (d.startTime || ''),
    end_time: isOvertime ? '' : (d.endTime || ''),
    duration_hours: durationHours,
    is_overnight: isOvertime ? false : isOvernight,
    late_threshold_minutes: isOvertime ? 0 : d.lateThresholdMinutes,
    allow_overtime: isOvertime ? true : Boolean(d.allowOvertime),
    overtime_hours: isOvertime ? durationHours : (d.allowOvertime ? Number(d.overtimeHours || 0) : 0),
    is_active: d.isActive,
  });

  await shift.save();

  await logAudit(null as any, { agencyId, userId: req.user!.userId, action: 'create_shift',
    entityType: 'shift', entityId: shift.id, newValues: d, req });

  res.status(201).json({ success: true, data: shift });
}));

router.put('/:id', asyncHandler(async (req: Request, res: Response) => {
  const agencyId = getAgencyId(req);
  const parse = shiftSchema.partial().safeParse(req.body);
  if (!parse.success) {
    res.status(400).json({ success: false, message: 'Validation failed', errors: parse.error.flatten().fieldErrors });
    return;
  }

  const query: any = { _id: req.params.id };
  if (req.user!.role !== 'super_admin') {
    query.agency_id = req.user!.agencyId;
  }

  const shift = await Shift.findOne(query);
  if (!shift) throw new AppError('Shift not found', 404);

  const oldValues = shift.toObject();
  const d = parse.data;

  if (d.name !== undefined) shift.name = d.name;
  if (d.shiftType !== undefined) shift.shift_type = d.shiftType;
  if (d.startTime !== undefined) shift.start_time = d.startTime;
  if (d.endTime !== undefined) shift.end_time = d.endTime;
  if (d.durationHours !== undefined) shift.duration_hours = d.durationHours;
  if (d.isOvernight !== undefined) shift.is_overnight = d.isOvernight;
  if (d.lateThresholdMinutes !== undefined) shift.late_threshold_minutes = d.lateThresholdMinutes;
  if (d.allowOvertime !== undefined) shift.allow_overtime = d.allowOvertime;
  if (d.overtimeHours !== undefined) {
    shift.overtime_hours = shift.allow_overtime ? Number(d.overtimeHours || 0) : 0;
  }
  if (shift.shift_type === 'overtime') {
    shift.start_time = '';
    shift.end_time = '';
    shift.is_overnight = false;
    if (d.durationHours) {
      shift.duration_hours = d.durationHours;
      shift.overtime_hours = d.durationHours;
    }
  }
  if (d.isActive !== undefined) shift.is_active = d.isActive;
  if (req.user!.role === 'super_admin' && d.agencyId) shift.agency_id = d.agencyId as any;

  await shift.save();

  await logAudit(null as any, { agencyId, userId: req.user!.userId, action: 'update_shift',
    entityType: 'shift', entityId: shift.id, oldValues, newValues: d, req });

  res.json({ success: true, data: shift });
}));

/** DELETE /api/shifts/:id â€” delete shift if no active assignments */
router.delete('/:id', asyncHandler(async (req: Request, res: Response) => {
  const agencyId = getAgencyId(req);

  const query: any = { _id: req.params.id };
  if (req.user!.role !== 'super_admin') {
    query.agency_id = req.user!.agencyId;
  }

  const shift = await Shift.findOne(query);
  if (!shift) throw new AppError('Shift not found', 404);

  const activeAssignments = await Assignment.countDocuments({
    shift_id: req.params.id,
    agency_id: agencyId,
    is_active: true,
  });
  if (activeAssignments > 0) {
    throw new AppError(`Cannot delete shift with ${activeAssignments} active assignment(s). End them first.`, 400);
  }

  await Shift.findByIdAndDelete(req.params.id);

  await logAudit(null as any, { agencyId, userId: req.user!.userId, action: 'delete_shift',
    entityType: 'shift', entityId: req.params.id, req });

  res.json({ success: true, message: 'Shift deleted successfully' });
}));

export default router;
