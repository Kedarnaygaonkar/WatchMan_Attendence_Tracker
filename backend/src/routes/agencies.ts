import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { authenticate, requireRole } from '../middleware/auth';
import { asyncHandler, AppError } from '../middleware/errorHandler';
import { Agency } from '../models';

const router = Router();

// Only super_admin can manage agencies
router.use(authenticate);
router.use(requireRole(['super_admin']));

// ── Validation Schemas ───────────────────────────────────────────────
const createSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  email: z.string().email('Invalid email address'),
  phone: z.string().optional(),
  address: z.string().optional(),
  logo_url: z.string().url('Invalid logo URL').optional().or(z.literal('')),
  status: z.enum(['active', 'inactive', 'suspended']).default('active'),
});

const updateSchema = createSchema.partial();

// ── GET /api/agencies ────────────────────────────────────────────────
router.get(
  '/',
  asyncHandler(async (req: Request, res: Response) => {
    const { active, search } = req.query;

    const filter: any = {};
    if (active === 'true') filter.status = 'active';

    if (search) {
      filter.$or = [
        { name: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
      ];
    }

    const agencies = await Agency.find(filter).sort({ name: 1 }).lean();
    res.json({ success: true, data: agencies });
  })
);

// ── POST /api/agencies ───────────────────────────────────────────────
router.post(
  '/',
  asyncHandler(async (req: Request, res: Response) => {
    const parse = createSchema.safeParse(req.body);
    if (!parse.success) {
      throw new AppError(parse.error.flatten().fieldErrors as any, 400);
    }

    const existing = await Agency.findOne({ email: parse.data.email }).lean();
    if (existing) {
      throw new AppError('Agency with this email already exists', 400);
    }

    const agency = await Agency.create(parse.data);
    res.status(201).json({ success: true, data: agency });
  })
);

// ── PUT /api/agencies/:id ────────────────────────────────────────────
router.put(
  '/:id',
  asyncHandler(async (req: Request, res: Response) => {
    const parse = updateSchema.safeParse(req.body);
    if (!parse.success) {
      throw new AppError(parse.error.flatten().fieldErrors as any, 400);
    }

    const { id } = req.params;

    if (parse.data.email) {
      const existing = await Agency.findOne({ email: parse.data.email, _id: { $ne: id } }).lean();
      if (existing) {
        throw new AppError('Another agency with this email already exists', 400);
      }
    }

    const agency = await Agency.findByIdAndUpdate(
      id,
      { $set: parse.data },
      { new: true, runValidators: true }
    );

    if (!agency) throw new AppError('Agency not found', 404);

    res.json({ success: true, data: agency });
  })
);

export default router;
