import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { authenticate, requireRole } from '../middleware/auth';
import { asyncHandler, AppError, logAudit } from '../middleware/errorHandler';
import { Assignment, Watchman, Society, Shift } from '../models';

const router = Router();
router.use(authenticate);
router.use(requireRole(['agency_admin', 'super_admin']));

const assignmentSchema = z.object({
  watchmanId: z.string().min(1),
  societyId: z.string().min(1),
  shiftId: z.string().min(1),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Format: YYYY-MM-DD'),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Format: YYYY-MM-DD').optional(),
  notes: z.string().optional(),
});

function getAgencyId(req: Request): string {
  if (req.user!.role === 'super_admin') {
    const id = req.query.agency_id || req.body.agencyId;
    if (!id) throw new AppError('agency_id required for super_admin', 400);
    return id as string;
  }
  return req.user!.agencyId!;
}

/** GET /api/assignments — list all assignments */
router.get('/', asyncHandler(async (req: Request, res: Response) => {
  const agencyId = getAgencyId(req);
  const { watchmanId, societyId, active } = req.query;

  const mongoose = require('mongoose');
  const matchStage: any = { agency_id: new mongoose.Types.ObjectId(agencyId) };
  if (watchmanId) matchStage.watchman_id = new mongoose.Types.ObjectId(watchmanId as string);
  if (societyId) matchStage.society_id = new mongoose.Types.ObjectId(societyId as string);
  if (active !== undefined) matchStage.is_active = active === 'true';

  const assignments = await Assignment.aggregate([
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
    { $sort: { start_date: -1, created_at: -1 } },
  ]);

  const formatted = assignments.map(a => {
    a.id = a._id.toString();
    delete a._id;
    delete a.__v;
    return a;
  });

  res.json({ success: true, data: formatted });
}));

/** POST /api/assignments — create assignment */
router.post('/', asyncHandler(async (req: Request, res: Response) => {
  const agencyId = getAgencyId(req);
  const parse = assignmentSchema.safeParse(req.body);
  if (!parse.success) {
    res.status(400).json({ success: false, message: 'Validation failed', errors: parse.error.flatten().fieldErrors });
    return;
  }

  const d = parse.data;

  // Validate existence
  const [w, s, sh] = await Promise.all([
    Watchman.findOne({ _id: d.watchmanId, agency_id: agencyId }),
    Society.findOne({ _id: d.societyId, agency_id: agencyId }),
    Shift.findOne({ _id: d.shiftId, agency_id: agencyId }),
  ]);
  
  if (!w || !s || !sh) {
    res.status(400).json({ success: false, message: 'Watchman, Society, or Shift not found' });
    return;
  }

  // Deactivate current active assignments for this watchman
  await Assignment.updateMany(
    { watchman_id: d.watchmanId, agency_id: agencyId, is_active: true },
    { is_active: false, end_date: new Date() }
  );

  const assignment = new Assignment({
    agency_id: agencyId,
    watchman_id: d.watchmanId,
    society_id: d.societyId,
    shift_id: d.shiftId,
    start_date: new Date(d.startDate),
    end_date: d.endDate ? new Date(d.endDate) : undefined,
    notes: d.notes,
    created_by: req.user!.userId,
  });

  await assignment.save();

  await logAudit(null as any, { agencyId, userId: req.user!.userId, action: 'create_assignment',
    entityType: 'assignment', entityId: assignment.id, newValues: d, req });

  res.status(201).json({ success: true, data: assignment });
}));

/** PATCH /api/assignments/:id/end — terminate assignment */
router.patch('/:id/end', asyncHandler(async (req: Request, res: Response) => {
  const agencyId = getAgencyId(req);

  const assignment = await Assignment.findOne({ _id: req.params.id, agency_id: agencyId });
  if (!assignment) throw new AppError('Assignment not found', 404);

  const oldValues = assignment.toObject();

  assignment.is_active = false;
  assignment.end_date = new Date();
  await assignment.save();

  await logAudit(null as any, { agencyId, userId: req.user!.userId, action: 'end_assignment',
    entityType: 'assignment', entityId: req.params.id, oldValues, req });

  res.json({ success: true, data: assignment });
}));

export default router;
