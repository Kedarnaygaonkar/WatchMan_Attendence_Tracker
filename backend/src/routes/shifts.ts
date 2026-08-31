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
  startTime: z.string().regex(/^\d{2}:\d{2}$/, 'Format: HH:MM'),
  endTime: z.string().regex(/^\d{2}:\d{2}$/, 'Format: HH:MM'),
  isOvernight: z.boolean().default(false),
  lateThresholdMinutes: z.number().min(0).max(120).default(15),
  isActive: z.boolean().default(true),
});

function getAgencyId(req: Request): string {
  if (req.user!.role === 'super_admin') {
    const id = req.query.agency_id || req.body.agencyId;
    if (id) return id as string;
    if (req.user!.agencyId) return req.user!.agencyId;
    throw new AppError('agency_id required for super_admin', 400);
  }
  return req.user!.agencyId!;
}

router.get('/', asyncHandler(async (req: Request, res: Response) => {
  const agencyId = getAgencyId(req);
  
  const shifts = await Shift.aggregate([
    { $match: { agency_id: new (require('mongoose').Types.ObjectId)(agencyId) } },
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

  // Auto-detect overnight if endTime < startTime
  const isOvernight = d.isOvernight ||
    (d.endTime !== '00:00' && d.endTime < d.startTime);

  const shift = new Shift({
    agency_id: agencyId,
    name: d.name,
    start_time: d.startTime,
    end_time: d.endTime,
    is_overnight: isOvernight,
    late_threshold_minutes: d.lateThresholdMinutes,
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

  const shift = await Shift.findOne({ _id: req.params.id, agency_id: agencyId });
  if (!shift) throw new AppError('Shift not found', 404);

  const oldValues = shift.toObject();
  const d = parse.data;

  if (d.name !== undefined) shift.name = d.name;
  if (d.startTime !== undefined) shift.start_time = d.startTime;
  if (d.endTime !== undefined) shift.end_time = d.endTime;
  if (d.isOvernight !== undefined) shift.is_overnight = d.isOvernight;
  if (d.lateThresholdMinutes !== undefined) shift.late_threshold_minutes = d.lateThresholdMinutes;
  if (d.isActive !== undefined) shift.is_active = d.isActive;

  await shift.save();

  await logAudit(null as any, { agencyId, userId: req.user!.userId, action: 'update_shift',
    entityType: 'shift', entityId: shift.id, oldValues, newValues: d, req });

  res.json({ success: true, data: shift });
}));

export default router;
