import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { authenticate, requireRole } from '../middleware/auth';
import { asyncHandler, AppError, logAudit } from '../middleware/errorHandler';
import { Replacement, Watchman, Society, Shift } from '../models';

const router = Router();
router.use(authenticate);
router.use(requireRole(['agency_admin', 'super_admin']));

const replacementSchema = z.object({
  originalWatchmanId: z.string().min(1),
  replacementWatchmanId: z.string().optional(),
  societyId: z.string().min(1),
  shiftId: z.string().min(1),
  replacementDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Format: YYYY-MM-DD'),
  reason: z.string().optional(),
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

  const replacements = await Replacement.aggregate([
    { $match: { agency_id: agencyId } },
    {
      $lookup: {
        from: 'watchmen',
        localField: 'original_watchman_id',
        foreignField: '_id',
        as: 'original_watchman',
      },
    },
    { $unwind: '$original_watchman' },
    {
      $lookup: {
        from: 'watchmen',
        localField: 'replacement_watchman_id',
        foreignField: '_id',
        as: 'replacement_watchman',
      },
    },
    { $unwind: { path: '$replacement_watchman', preserveNullAndEmptyArrays: true } },
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
        original_watchman_name: '$original_watchman.full_name',
        replacement_watchman_name: '$replacement_watchman.full_name',
        society_name: '$society.name',
        shift_name: '$shift.name',
      },
    },
    { $project: { original_watchman: 0, replacement_watchman: 0, society: 0, shift: 0 } },
    { $sort: { replacement_date: -1, created_at: -1 } },
  ]);

  const formatted = replacements.map(r => {
    r.id = r._id.toString();
    delete r._id;
    delete r.__v;
    return r;
  });

  res.json({ success: true, data: formatted });
}));

router.post('/', asyncHandler(async (req: Request, res: Response) => {
  const agencyId = getAgencyId(req);
  const parse = replacementSchema.safeParse(req.body);
  if (!parse.success) {
    res.status(400).json({ success: false, message: 'Validation failed', errors: parse.error.flatten().fieldErrors });
    return;
  }

  const d = parse.data;

  // Validate entities
  const [orig, soc, sh] = await Promise.all([
    Watchman.findOne({ _id: d.originalWatchmanId, agency_id: agencyId }),
    Society.findOne({ _id: d.societyId, agency_id: agencyId }),
    Shift.findOne({ _id: d.shiftId, agency_id: agencyId }),
  ]);
  
  if (!orig || !soc || !sh) {
    res.status(400).json({ success: false, message: 'Invalid IDs provided' });
    return;
  }

  if (d.replacementWatchmanId) {
    const rep = await Watchman.findOne({ _id: d.replacementWatchmanId, agency_id: agencyId });
    if (!rep) {
      res.status(400).json({ success: false, message: 'Replacement watchman not found' });
      return;
    }
  }

  const replacement = new Replacement({
    agency_id: agencyId,
    original_watchman_id: d.originalWatchmanId,
    replacement_watchman_id: d.replacementWatchmanId,
    society_id: d.societyId,
    shift_id: d.shiftId,
    replacement_date: new Date(d.replacementDate),
    reason: d.reason,
    status: d.replacementWatchmanId ? 'active' : 'pending',
    created_by: req.user!.userId,
  });

  await replacement.save();

  await logAudit(null as any, { agencyId, userId: req.user!.userId, action: 'create_replacement',
    entityType: 'replacement', entityId: replacement.id, newValues: d, req });

  res.status(201).json({ success: true, data: replacement });
}));

export default router;
