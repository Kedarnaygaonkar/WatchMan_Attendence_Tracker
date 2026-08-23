import { Router, Request, Response } from 'express';
import { authenticate, requireRole } from '../middleware/auth';
import { asyncHandler, AppError } from '../middleware/errorHandler';
import { Assignment, Watchman, Attendance } from '../models';
import mongoose from 'mongoose';

const router = Router();
router.use(authenticate);
router.use(requireRole(['agency_admin', 'super_admin']));

function getAgencyId(req: Request): string {
  if (req.user!.role === 'super_admin') {
    const id = req.query.agency_id as string;
    if (!id) throw new AppError('agency_id required', 400);
    return id;
  }
  return req.user!.agencyId!;
}

/**
 * GET /api/reports/daily?date=YYYY-MM-DD
 * Full daily attendance report with all watchmen status.
 */
router.get('/daily', asyncHandler(async (req: Request, res: Response) => {
  const agencyId = getAgencyId(req);
  const dateStr = (req.query.date as string) || new Date().toISOString().split('T')[0];
  const date = new Date(dateStr);

  const assignments = await Assignment.aggregate([
    {
      $match: {
        agency_id: new mongoose.Types.ObjectId(agencyId),
        is_active: true,
        start_date: { $lte: date },
        $or: [{ end_date: null }, { end_date: { $exists: false } }, { end_date: { $gte: date } }],
      },
    },
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
      $lookup: {
        from: 'attendances',
        let: { wId: '$watchman_id', sId: '$shift_id' },
        pipeline: [
          {
            $match: {
              $expr: {
                $and: [
                  { $eq: ['$watchman_id', '$$wId'] },
                  { $eq: ['$shift_id', '$$sId'] },
                  { $eq: ['$attendance_date', date] },
                ],
              },
            },
          },
        ],
        as: 'attendances',
      },
    },
    {
      $addFields: {
        att: { $arrayElemAt: ['$attendances', 0] },
      },
    },
    {
      $addFields: {
        watchman_id: '$watchman._id',
        full_name: '$watchman.full_name',
        employee_id: '$watchman.employee_id',
        society_name: '$society.name',
        shift_name: '$shift.name',
        start_time: '$shift.start_time',
        end_time: '$shift.end_time',
        attendance_id: '$att._id',
        check_in_time: '$att.check_in_time',
        status: '$att.status',
        verification_status: '$att.verification_status',
        gps_flags: '$att.gps_flags',
        distance_from_society: '$att.distance_from_society',
        is_offline_sync: '$att.is_offline_sync',
        manual_override: '$att.manual_override',
        final_status: { $ifNull: ['$att.status', 'absent'] },
      },
    },
    { $project: { watchman: 0, society: 0, shift: 0, attendances: 0, att: 0 } },
    { $sort: { start_time: 1, full_name: 1 } },
  ]);

  const formatted = assignments.map(a => {
    a.watchman_id = a.watchman_id.toString();
    if (a.attendance_id) a.attendance_id = a.attendance_id.toString();
    a.id = a._id.toString();
    delete a._id;
    delete a.__v;
    return a;
  });

  res.json({ success: true, data: formatted, date: dateStr });
}));

/**
 * GET /api/reports/monthly?year=2026&month=8
 * Monthly summary per watchman.
 */
router.get('/monthly', asyncHandler(async (req: Request, res: Response) => {
  const agencyId = getAgencyId(req);
  const year = parseInt(req.query.year as string) || new Date().getFullYear();
  const month = parseInt(req.query.month as string) || new Date().getMonth() + 1;

  const startDate = new Date(`${year}-${String(month).padStart(2, '0')}-01`);
  const endDate = new Date(year, month, 0); // Last day of month

  const watchmen = await Watchman.aggregate([
    { $match: { agency_id: new mongoose.Types.ObjectId(agencyId), status: 'active' } },
    {
      $lookup: {
        from: 'attendance',
        let: { wId: '$_id' },
        pipeline: [
          {
            $match: {
              $expr: {
                $and: [
                  { $eq: ['$watchman_id', '$$wId'] },
                  { $gte: ['$attendance_date', startDate] },
                  { $lte: ['$attendance_date', endDate] },
                ],
              },
            },
          },
        ],
        as: 'attendances',
      },
    },
    {
      $addFields: {
        days_present: {
          $size: {
            $filter: { input: '$attendances', as: 'a', cond: { $eq: ['$$a.status', 'present'] } },
          },
        },
        days_late: {
          $size: {
            $filter: { input: '$attendances', as: 'a', cond: { $eq: ['$$a.status', 'late'] } },
          },
        },
        days_absent: {
          $size: {
            $filter: { input: '$attendances', as: 'a', cond: { $eq: ['$$a.status', 'absent'] } },
          },
        },
        suspicious_count: {
          $size: {
            $filter: { input: '$attendances', as: 'a', cond: { $in: ['$$a.verification_status', ['suspicious', 'review_required']] } },
          },
        },
        total_records: { $size: '$attendances' },
      },
    },
    { $project: { attendances: 0 } },
    { $sort: { full_name: 1 } },
  ]);

  const formatted = watchmen.map(w => {
    w.watchman_id = w._id.toString();
    w.id = w._id.toString();
    delete w._id;
    delete w.__v;
    return w;
  });

  res.json({
    success: true,
    data: formatted,
    year,
    month,
    startDate: startDate.toISOString().split('T')[0],
    endDate: endDate.toISOString().split('T')[0],
  });
}));

/**
 * GET /api/reports/watchman/:id?startDate=&endDate=
 * Detailed attendance history for a specific watchman.
 */
router.get('/watchman/:id', asyncHandler(async (req: Request, res: Response) => {
  const agencyId = getAgencyId(req);
  const { startDate, endDate } = req.query;

  const matchStage: any = {
    agency_id: new mongoose.Types.ObjectId(agencyId),
    watchman_id: new mongoose.Types.ObjectId(req.params.id),
  };

  if (startDate) {
    matchStage.attendance_date = {
      $gte: new Date(startDate as string),
      $lte: new Date((endDate as string) || new Date().toISOString().split('T')[0]),
    };
  }

  const attRecords = await Attendance.aggregate([
    { $match: matchStage },
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
        society_name: '$society.name',
        shift_name: '$shift.name',
        start_time: '$shift.start_time',
        end_time: '$shift.end_time',
      },
    },
    { $project: { society: 0, shift: 0 } },
    { $sort: { attendance_date: -1, check_in_time: -1 } },
  ]);

  const watchman = await Watchman.findOne({ _id: req.params.id, agency_id: agencyId }).select('full_name employee_id');

  const formatted = attRecords.map(a => {
    a.id = a._id.toString();
    delete a._id;
    delete a.__v;
    return a;
  });

  res.json({ success: true, data: formatted, watchman });
}));

/**
 * GET /api/reports/suspicious
 * All suspicious/flagged attendance records.
 */
router.get('/suspicious', asyncHandler(async (req: Request, res: Response) => {
  const agencyId = getAgencyId(req);
  const { startDate, endDate } = req.query;

  const dateFrom = new Date(startDate as string || Date.now() - 30 * 24 * 60 * 60 * 1000);
  const dateTo = new Date(endDate as string || Date.now());

  const attRecords = await Attendance.aggregate([
    {
      $match: {
        agency_id: new mongoose.Types.ObjectId(agencyId),
        verification_status: { $in: ['suspicious', 'review_required', 'warning'] },
        attendance_date: { $gte: dateFrom, $lte: dateTo },
      },
    },
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
      },
    },
    { $project: { watchman: 0, society: 0, shift: 0 } },
    { $sort: { attendance_date: -1, check_in_time: -1 } },
  ]);

  const formatted = attRecords.map(a => {
    a.id = a._id.toString();
    delete a._id;
    delete a.__v;
    return a;
  });

  res.json({ success: true, data: formatted });
}));

export default router;
