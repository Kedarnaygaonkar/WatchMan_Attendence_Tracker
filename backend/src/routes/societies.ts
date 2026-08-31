import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { authenticate, requireRole } from '../middleware/auth';
import { asyncHandler, AppError, logAudit } from '../middleware/errorHandler';
import { Society, Assignment } from '../models';

const router = Router();
router.use(authenticate);
router.use(requireRole(['agency_admin', 'super_admin']));

const societySchema = z.object({
  name: z.string().min(2).max(200),
  address: z.string().min(5),
  contactPerson: z.string().optional(),
  contactPhone: z.string().optional(),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  geofenceRadius: z.number().min(20).max(5000).default(100),
  requiredGuards: z.number().min(1).default(1),
  isActive: z.boolean().default(true),
  notes: z.string().optional(),
  agencyId: z.string().optional(),
});

function getAgencyId(req: Request): string | null {
  if (req.user!.role === 'super_admin') {
    const id = req.query.agency_id || req.body.agencyId;
    if (id) return id as string;
    if (req.user!.agencyId) return req.user!.agencyId;
    return null; // super_admin can get all if no id provided
  }
  return req.user!.agencyId!;
}

/** GET /api/societies — list all societies for agency */
router.get('/', asyncHandler(async (req: Request, res: Response) => {
  const agencyId = getAgencyId(req);
  const { search, active } = req.query;

  const matchStage: any = {};
  if (agencyId) {
    matchStage.agency_id = new (require('mongoose').Types.ObjectId)(agencyId);
  }
  if (active !== undefined) {
    matchStage.is_active = active === 'true';
  }
  if (search) {
    matchStage.$or = [
      { name: { $regex: search, $options: 'i' } },
      { address: { $regex: search, $options: 'i' } },
    ];
  }

  // Use aggregation to get active_assignments count
  const societies = await Society.aggregate([
    { $match: matchStage },
    {
      $lookup: {
        from: 'assignments', // Mongoose collection name is lowercase plural
        localField: '_id',
        foreignField: 'society_id',
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
    { $sort: { name: 1 } },
  ]);

  // Rename _id to id in aggregate results
  const formatted = societies.map(s => {
    s.id = s._id.toString();
    delete s._id;
    delete s.__v;
    return s;
  });

  res.json({ success: true, data: formatted });
}));

/** GET /api/societies/:id — get single society */
router.get('/:id', asyncHandler(async (req: Request, res: Response) => {
  const agencyId = getAgencyId(req);

  const societies = await Society.aggregate([
    { $match: { _id: req.params.id, agency_id: agencyId } },
    {
      $lookup: {
        from: 'assignments',
        localField: '_id',
        foreignField: 'society_id',
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
  ]);

  if (!societies.length) throw new AppError('Society not found', 404);

  const s = societies[0];
  s.id = s._id.toString();
  delete s._id;
  delete s.__v;

  res.json({ success: true, data: s });
}));

/** POST /api/societies — create society */
router.post('/', asyncHandler(async (req: Request, res: Response) => {
  const agencyId = getAgencyId(req);
  const parse = societySchema.safeParse(req.body);
  if (!parse.success) {
    res.status(400).json({ success: false, message: 'Validation failed', errors: parse.error.flatten().fieldErrors });
    return;
  }

  const d = parse.data;
  const society = new Society({
    agency_id: agencyId,
    name: d.name,
    address: d.address,
    contact_person: d.contactPerson,
    contact_phone: d.contactPhone,
    latitude: d.latitude,
    longitude: d.longitude,
    geofence_radius: d.geofenceRadius,
    required_guards: d.requiredGuards,
    is_active: d.isActive,
    notes: d.notes,
  });

  await society.save();

  await logAudit(null as any, { agencyId, userId: req.user!.userId, action: 'create_society',
    entityType: 'society', entityId: society.id, newValues: d, req });

  res.status(201).json({ success: true, data: society });
}));

/** PUT /api/societies/:id — update society */
router.put('/:id', asyncHandler(async (req: Request, res: Response) => {
  const parse = societySchema.safeParse(req.body);
  if (!parse.success) {
    res.status(400).json({ success: false, message: 'Validation failed', errors: parse.error.flatten().fieldErrors });
    return;
  }

  const query: any = { _id: req.params.id };
  if (req.user!.role !== 'super_admin') {
    query.agency_id = req.user!.agencyId;
  }

  const society = await Society.findOne(query);
  if (!society) throw new AppError('Society not found', 404);

  const oldValues = society.toObject();
  const d = parse.data;

  society.name = d.name;
  society.address = d.address;
  society.contact_person = d.contactPerson;
  society.contact_phone = d.contactPhone;
  society.latitude = d.latitude;
  society.longitude = d.longitude;
  society.geofence_radius = d.geofenceRadius;
  society.required_guards = d.requiredGuards;
  society.is_active = d.isActive;
  society.notes = d.notes;

  if (req.user!.role === 'super_admin' && d.agencyId) {
    society.agency_id = d.agencyId as any;
  }

  await society.save();

  await logAudit(null as any, { agencyId: society.agency_id, userId: req.user!.userId, action: 'update_society',
    entityType: 'society', entityId: society.id, oldValues, newValues: d, req });

  res.json({ success: true, data: society });
}));

/** DELETE /api/societies/:id — delete society (only if no active assignments) */
router.delete('/:id', asyncHandler(async (req: Request, res: Response) => {
  const agencyId = getAgencyId(req);

  const activeAssignments = await Assignment.countDocuments({
    society_id: req.params.id,
    agency_id: agencyId,
    is_active: true,
  });

  if (activeAssignments > 0) {
    throw new AppError('Cannot delete society with active assignments. Reassign or end them first.', 400);
  }

  const result = await Society.findOneAndDelete({ _id: req.params.id, agency_id: agencyId });
  if (!result) throw new AppError('Society not found', 404);

  await logAudit(null as any, { agencyId, userId: req.user!.userId, action: 'delete_society',
    entityType: 'society', entityId: req.params.id, req });

  res.json({ success: true, message: 'Society deleted successfully' });
}));

export default router;
