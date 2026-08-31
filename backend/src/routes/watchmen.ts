import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { authenticate, requireRole } from '../middleware/auth';
import { asyncHandler, AppError, logAudit } from '../middleware/errorHandler';
import multer from 'multer';
import path from 'path';
import { config } from '../config';
import { v4 as uuidv4 } from 'uuid';
import { Watchman, User, Assignment } from '../models';

const router = Router();
router.use(authenticate);
// NOTE: role restriction is applied per-route, not globally,
// because face registration endpoints are accessible to watchmen too.

// Photo upload config
const storage = multer.diskStorage({
  destination: config.uploads.dir,
  filename: (_req, file, cb) => {
    cb(null, `profile-${uuidv4()}${path.extname(file.originalname)}`);
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

const watchmanSchema = z.object({
  employeeId: z.string().min(1).max(50),
  fullName: z.string().min(2).max(200),
  phone: z.string().min(10).max(20),
  email: z.string().email().optional(),
  password: z.string().min(6).optional(),
  emergencyContact: z.string().optional(),
  address: z.string().optional(),
  joiningDate: z.string().optional(),
  status: z.enum(['active', 'inactive', 'suspended']).default('active'),
  agencyId: z.string().optional(),
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

/** GET /api/watchmen — list with optional search */
router.get('/', requireRole(['agency_admin', 'super_admin']), asyncHandler(async (req: Request, res: Response) => {
  const agencyId = getAgencyId(req);
  const { search, status } = req.query;

  const matchStage: any = { agency_id: new (require('mongoose').Types.ObjectId)(agencyId) };
  if (status) {
    matchStage.status = status;
  }
  if (search) {
    matchStage.$or = [
      { full_name: { $regex: search, $options: 'i' } },
      { employee_id: { $regex: search, $options: 'i' } },
      { phone: { $regex: search, $options: 'i' } },
    ];
  }

  const watchmen = await Watchman.aggregate([
    { $match: matchStage },
    {
      $lookup: {
        from: 'users',
        localField: 'user_id',
        foreignField: '_id',
        as: 'user',
      },
    },
    { $unwind: '$user' },
    {
      $lookup: {
        from: 'assignments',
        localField: '_id',
        foreignField: 'watchman_id',
        as: 'assignments',
        pipeline: [{ $match: { is_active: true } }],
      },
    },
    {
      $addFields: {
        email: '$user.email',
        user_is_active: '$user.is_active',
        active_assignments: { $size: '$assignments' },
      },
    },
    { $project: { user: 0, assignments: 0 } },
    { $sort: { full_name: 1 } },
  ]);

  const formatted = watchmen.map(w => {
    w.id = w._id.toString();
    delete w._id;
    delete w.__v;
    return w;
  });

  res.json({ success: true, data: formatted });
}));


// ── FACE ROUTES (Watchman-accessible) — MUST be before /:id to avoid route conflict ──

/**
 * GET /api/watchmen/face-status
 * Returns whether the logged-in watchman has registered their face.
 */
router.get('/face-status', requireRole(['watchman']), asyncHandler(async (req: Request, res: Response) => {
  const watchman = await Watchman.findOne({ user_id: req.user!.userId }).select('face_registered face_descriptor');
  if (!watchman) {
    res.status(404).json({ success: false, message: 'Watchman profile not found.' });
    return;
  }

  res.json({
    success: true,
    data: {
      face_registered: watchman.face_registered,
      // Return descriptor so frontend can do local comparison
      face_descriptor: watchman.face_registered ? watchman.face_descriptor : null,
    },
  });
}));

/**
 * POST /api/watchmen/register-face
 * Called by the watchman on first login to store their face descriptor.
 * Body: { descriptor: number[128] }
 */
router.post('/register-face', requireRole(['watchman']), asyncHandler(async (req: Request, res: Response) => {
  const { descriptor } = req.body;

  if (!Array.isArray(descriptor) || descriptor.length !== 128) {
    res.status(400).json({ success: false, message: 'Invalid face descriptor. Must be a 128-element array.' });
    return;
  }

  const watchman = await Watchman.findOne({ user_id: req.user!.userId });
  if (!watchman) {
    res.status(404).json({ success: false, message: 'Watchman profile not found.' });
    return;
  }

  watchman.face_descriptor = descriptor;
  watchman.face_registered = true;
  await watchman.save();

  res.json({ success: true, message: 'Face registered successfully.' });
}));

/** GET /api/watchmen/:id */
router.get('/:id', requireRole(['agency_admin', 'super_admin']), asyncHandler(async (req: Request, res: Response) => {
  const agencyId = getAgencyId(req);
  const watchman = await Watchman.findOne({ _id: req.params.id, agency_id: agencyId }).populate('user_id');
  
  if (!watchman) throw new AppError('Watchman not found', 404);

  const data = watchman.toJSON();
  if (data.user_id) {
    (data as any).email = (data.user_id as any).email;
  }

  res.json({ success: true, data });
}));

/** POST /api/watchmen — create watchman + user account */
router.post('/', requireRole(['agency_admin', 'super_admin']), asyncHandler(async (req: Request, res: Response) => {
  const agencyId = getAgencyId(req);
  const parse = watchmanSchema.safeParse(req.body);
  if (!parse.success) {
    res.status(400).json({ success: false, message: 'Validation failed', errors: parse.error.flatten().fieldErrors });
    return;
  }

  const d = parse.data;

  // Check employee ID uniqueness within agency
  const existing = await Watchman.findOne({ agency_id: agencyId, employee_id: d.employeeId });
  if (existing) {
    res.status(409).json({ success: false, message: 'Employee ID already exists for this agency' });
    return;
  }

  // Check email uniqueness only if email was explicitly provided
  const emailStr = d.email ? d.email.toLowerCase() : `${d.employeeId.toLowerCase().replace(/[^a-z0-9]/g, '')}@watchtrack.local`;
  const emailCheck = await User.findOne({ email: emailStr });
  if (emailCheck) {
    res.status(409).json({ success: false, message: 'Email already in use (or employee ID conflict)' });
    return;
  }

  const passwordHash = await bcrypt.hash(d.password || 'Guard@123', 12);
  
  const user = new User({
    agency_id: agencyId,
    email: emailStr,
    password_hash: passwordHash,
    role: 'watchman',
    name: d.fullName,
    phone: d.phone,
    is_active: true,
  });
  await user.save();

  const watchman = new Watchman({
    agency_id: agencyId,
    user_id: user._id,
    employee_id: d.employeeId,
    full_name: d.fullName,
    phone: d.phone,
    emergency_contact: d.emergencyContact,
    address: d.address,
    joining_date: d.joiningDate,
    status: d.status,
  });
  await watchman.save();

  await logAudit(null as any, { agencyId, userId: req.user!.userId, action: 'create_watchman',
    entityType: 'watchman', entityId: watchman.id,
    newValues: { employeeId: d.employeeId, fullName: d.fullName }, req });

  const data = watchman.toJSON();
  (data as any).email = d.email;

  res.status(201).json({ success: true, data });
}));

/** PUT /api/watchmen/:id */
router.put('/:id', requireRole(['agency_admin', 'super_admin']), asyncHandler(async (req: Request, res: Response) => {
  const parse = watchmanSchema.partial().safeParse(req.body);
  if (!parse.success) {
    res.status(400).json({ success: false, message: 'Validation failed', errors: parse.error.flatten().fieldErrors });
    return;
  }

  const query: any = { _id: req.params.id };
  if (req.user!.role !== 'super_admin') {
    query.agency_id = req.user!.agencyId;
  }

  const watchman = await Watchman.findOne(query);
  if (!watchman) throw new AppError('Watchman not found', 404);

  const oldValues = watchman.toObject();
  const d = parse.data;

  if (d.fullName !== undefined) watchman.full_name = d.fullName;
  if (d.phone !== undefined) watchman.phone = d.phone;
  if (d.emergencyContact !== undefined) watchman.emergency_contact = d.emergencyContact;
  if (d.address !== undefined) watchman.address = d.address;
  if (d.joiningDate !== undefined) watchman.joining_date = new Date(d.joiningDate);
  if (d.status !== undefined) watchman.status = d.status as any;

  if (req.user!.role === 'super_admin' && d.agencyId) {
    watchman.agency_id = d.agencyId as any;
  }

  await watchman.save();

  // Update user is_active based on watchman status
  if (d.status !== undefined) {
    await User.updateOne({ _id: watchman.user_id }, { is_active: d.status === 'active' });
  }
  
  if (req.user!.role === 'super_admin' && d.agencyId) {
    await User.updateOne({ _id: watchman.user_id }, { agency_id: watchman.agency_id });
  }

  await logAudit(null as any, { agencyId: watchman.agency_id, userId: req.user!.userId, action: 'update_watchman',
    entityType: 'watchman', entityId: watchman.id,
    oldValues, newValues: d, req });

  res.json({ success: true, data: watchman });
}));

/** POST /api/watchmen/:id/photo — upload profile photo */
router.post('/:id/photo', requireRole(['agency_admin', 'super_admin']), upload.single('photo'), asyncHandler(async (req: Request, res: Response) => {
  const agencyId = getAgencyId(req);
  if (!req.file) throw new AppError('No file uploaded', 400);

  const url = `/uploads/${req.file.filename}`;
  
  const watchman = await Watchman.findOne({ _id: req.params.id, agency_id: agencyId });
  if (!watchman) throw new AppError('Watchman not found', 404);

  watchman.profile_photo_url = url;
  await watchman.save();

  res.json({ success: true, data: { id: watchman.id, profile_photo_url: watchman.profile_photo_url } });
}));

export default router;
