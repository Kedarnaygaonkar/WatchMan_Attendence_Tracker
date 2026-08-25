import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import { authenticate, requireRole } from '../middleware/auth';
import { asyncHandler, AppError } from '../middleware/errorHandler';
import { Gate, Society } from '../models';

const router = Router();
router.use(authenticate);
router.use(requireRole(['super_admin', 'agency_admin']));

const gateSchema = z.object({
  society_id: z.string().min(1),
  name: z.string().min(1).max(100),
});

// GET /api/gates — list all gates
router.get(
  '/',
  asyncHandler(async (req: Request, res: Response) => {
    const { user } = req as any;
    const filter: any = {};
    // Agency admins only see their own gates; super_admin sees all
    if (user.role !== 'super_admin') filter.agency_id = user.agencyId;

    const gates = await Gate.find(filter)
      .populate('society_id', 'name address')
      .sort({ createdAt: -1 })
      .lean();

    res.json({ success: true, data: gates });
  })
);

// POST /api/gates — create gate
router.post(
  '/',
  asyncHandler(async (req: Request, res: Response) => {
    const { user } = req as any;
    const parse = gateSchema.safeParse(req.body);
    if (!parse.success) {
      throw new AppError(parse.error.flatten().fieldErrors as any, 400);
    }

    const { society_id, name } = parse.data;

    // Verify society exists
    const society = await Society.findById(society_id).lean();
    if (!society) throw new AppError('Society not found', 404);

    // Agency admin can only add gates to their own societies
    if (user.role !== 'super_admin' && String(society.agency_id) !== String(user.agencyId)) {
      throw new AppError('Forbidden', 403);
    }

    const gate = await Gate.create({
      agency_id: society.agency_id,
      society_id,
      name,
      qr_token: uuidv4(),
    });

    const populated = await Gate.findById(gate._id).populate('society_id', 'name address').lean();
    res.status(201).json({ success: true, data: populated });
  })
);

// PUT /api/gates/:id — update gate name
router.put(
  '/:id',
  asyncHandler(async (req: Request, res: Response) => {
    const { user } = req as any;
    const { name } = req.body;
    if (!name) throw new AppError('Name is required', 400);

    const gate = await Gate.findById(req.params.id);
    if (!gate) throw new AppError('Gate not found', 404);
    if (user.role !== 'super_admin' && String(gate.agency_id) !== String(user.agency_id)) {
      throw new AppError('Forbidden', 403);
    }

    gate.name = name;
    await gate.save();
    res.json({ success: true, data: gate });
  })
);

// DELETE /api/gates/:id — deactivate gate
router.delete(
  '/:id',
  asyncHandler(async (req: Request, res: Response) => {
    const { user } = req as any;
    const gate = await Gate.findById(req.params.id);
    if (!gate) throw new AppError('Gate not found', 404);
    if (user.role !== 'super_admin' && String(gate.agency_id) !== String(user.agency_id)) {
      throw new AppError('Forbidden', 403);
    }

    gate.is_active = false;
    await gate.save();
    res.json({ success: true, message: 'Gate deactivated' });
  })
);

// POST /api/gates/:id/regenerate — generate a new QR token
router.post(
  '/:id/regenerate',
  asyncHandler(async (req: Request, res: Response) => {
    const { user } = req as any;
    const gate = await Gate.findById(req.params.id);
    if (!gate) throw new AppError('Gate not found', 404);
    if (user.role !== 'super_admin' && String(gate.agency_id) !== String(user.agency_id)) {
      throw new AppError('Forbidden', 403);
    }

    gate.qr_token = uuidv4();
    await gate.save();
    res.json({ success: true, data: gate, message: 'QR code regenerated' });
  })
);

export default router;
