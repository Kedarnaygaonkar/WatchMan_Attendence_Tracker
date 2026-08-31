import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { authenticate, requireRole } from '../middleware/auth';
import { asyncHandler, AppError } from '../middleware/errorHandler';
import { DeliveryVisit, Gate, Society } from '../models';
import mongoose from 'mongoose';

const router = Router();

// ── Schemas ──────────────────────────────────────────────────────────

const checkinSchema = z.object({
  gate_token: z.string().min(1),
  visitor_name: z.string().min(1).max(100),
  visitor_phone: z.string().min(7).max(20),
  vehicle_number: z.string().max(20).optional(),
  delivery_company: z.enum(['Zomato', 'Swiggy', 'Amazon', 'Flipkart', 'DTDC', 'BlueDart', 'FedEx', 'Meesho', 'Other']).default('Other'),
  notes: z.string().max(300).optional(),
});

// ── POST /api/delivery/checkin ────────────────────────────────────────
// Public — no auth required
router.post(
  '/checkin',
  asyncHandler(async (req: Request, res: Response) => {
    const parse = checkinSchema.safeParse(req.body);
    if (!parse.success) {
      throw new AppError(parse.error.flatten().fieldErrors as any, 400);
    }

    const { gate_token, visitor_name, visitor_phone, vehicle_number, delivery_company, notes } = parse.data;

    // Validate gate
    const gate = await Gate.findOne({ qr_token: gate_token, is_active: true }).lean();
    if (!gate) throw new AppError('Invalid or expired QR code', 404);

    const society = await Society.findById(gate.society_id).lean();
    if (!society) throw new AppError('Society not found', 404);

    const now = new Date();
    const visitDate = new Date(now);
    visitDate.setUTCHours(0, 0, 0, 0);

    const visit = await DeliveryVisit.create({
      agency_id: gate.agency_id,
      society_id: gate.society_id,
      gate_id: gate._id,
      gate_token,
      visitor_name: visitor_name.trim(),
      visitor_phone: visitor_phone.trim(),
      vehicle_number: vehicle_number?.trim(),
      delivery_company,
      check_in_time: now,
      visit_date: visitDate,
      notes: notes?.trim(),
    });

    res.status(201).json({
      success: true,
      message: `Check-in recorded for ${visitor_name} at ${society.name}`,
      data: {
        visit_id: visit._id,
        society_name: society.name,
        check_in_time: visit.check_in_time,
      },
    });
  })
);

// ── POST /api/delivery/checkout/:visitId ──────────────────────────────
// Public — no auth required
router.post(
  '/checkout/:visitId',
  asyncHandler(async (req: Request, res: Response) => {
    const { visitId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(visitId)) {
      throw new AppError('Invalid visit ID', 400);
    }

    const visit = await DeliveryVisit.findById(visitId);
    if (!visit) throw new AppError('Visit not found', 404);
    if (visit.check_out_time) {
      throw new AppError('Already checked out at ' + visit.check_out_time.toLocaleTimeString('en-IN'), 400);
    }

    const now = new Date();
    const durationMs = now.getTime() - visit.check_in_time.getTime();
    const durationMinutes = Math.round(durationMs / 60000);

    visit.check_out_time = now;
    visit.duration_minutes = durationMinutes;
    await visit.save();

    res.json({
      success: true,
      message: `Check-out recorded. Duration: ${durationMinutes} min`,
      data: {
        visit_id: visit._id,
        visitor_name: visit.visitor_name,
        check_in_time: visit.check_in_time,
        check_out_time: visit.check_out_time,
        duration_minutes: durationMinutes,
      },
    });
  })
);

// ── GET /api/delivery/visits ──────────────────────────────────────────
// Auth required — agency admin / super admin
router.get(
  '/visits',
  authenticate,
  requireRole(['agency_admin', 'super_admin']),
  asyncHandler(async (req: Request, res: Response) => {
    const { user } = req as any;
    const { date, society_id, company, page = '1', limit = '50' } = req.query;

    const filter: any = {};

    // Scope by agency
    if (user.role !== 'super_admin') {
      filter.agency_id = new mongoose.Types.ObjectId(user.agencyId);
    } else if (req.query.agency_id) {
      filter.agency_id = new mongoose.Types.ObjectId(req.query.agency_id as string);
    }

    // Date filter
    if (date) {
      const d = new Date(date as string);
      const start = new Date(d); start.setUTCHours(0, 0, 0, 0);
      const end = new Date(d); end.setUTCHours(23, 59, 59, 999);
      filter.check_in_time = { $gte: start, $lte: end };
    }

    if (society_id) filter.society_id = new mongoose.Types.ObjectId(society_id as string);
    if (company) filter.delivery_company = company;

    const pageNum = Math.max(1, parseInt(page as string));
    const limitNum = Math.min(200, parseInt(limit as string));
    const skip = (pageNum - 1) * limitNum;

    const [visits, total] = await Promise.all([
      DeliveryVisit.find(filter)
        .populate('society_id', 'name address')
        .populate('gate_id', 'name')
        .sort({ check_in_time: -1 })
        .skip(skip)
        .limit(limitNum)
        .lean(),
      DeliveryVisit.countDocuments(filter),
    ]);

    res.json({
      success: true,
      data: visits,
      total,
      page: pageNum,
      pages: Math.ceil(total / limitNum),
    });
  })
);

// ── GET /api/delivery/stats ───────────────────────────────────────────
// Auth required — quick daily stats
router.get(
  '/stats',
  authenticate,
  requireRole(['agency_admin', 'super_admin']),
  asyncHandler(async (req: Request, res: Response) => {
    const { user } = req as any;
    const { date } = req.query;

    const filter: any = {};
    if (user.role !== 'super_admin') {
      filter.agency_id = new mongoose.Types.ObjectId(user.agencyId);
    }

    if (date) {
      const d = new Date(date as string);
      const start = new Date(d); start.setUTCHours(0, 0, 0, 0);
      const end = new Date(d); end.setUTCHours(23, 59, 59, 999);
      filter.check_in_time = { $gte: start, $lte: end };
    } else {
      // Default: today
      const todayStart = new Date(); todayStart.setUTCHours(0, 0, 0, 0);
      const todayEnd = new Date(); todayEnd.setUTCHours(23, 59, 59, 999);
      filter.check_in_time = { $gte: todayStart, $lte: todayEnd };
    }

    const [total, checkedOut, byCompany] = await Promise.all([
      DeliveryVisit.countDocuments(filter),
      DeliveryVisit.countDocuments({ ...filter, check_out_time: { $exists: true } }),
      DeliveryVisit.aggregate([
        { $match: filter },
        { $group: { _id: '$delivery_company', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
      ]),
    ]);

    res.json({
      success: true,
      data: {
        total_visits: total,
        checked_out: checkedOut,
        still_inside: total - checkedOut,
        by_company: byCompany.map(b => ({ company: b._id, count: b.count })),
      },
    });
  })
);

export default router;
