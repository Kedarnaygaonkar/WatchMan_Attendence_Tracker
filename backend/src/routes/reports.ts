import { Router, Request, Response } from 'express';
import { authenticate, requireRole } from '../middleware/auth';
import { asyncHandler } from '../middleware/errorHandler';
import { Watchman, Attendance } from '../models';
import mongoose from 'mongoose';

const router = Router();
router.use(authenticate);
router.use(requireRole(['agency_admin', 'super_admin']));

function getAgencyId(req: Request): string | undefined {
  if (req.user!.role === 'super_admin') {
    return (req.query.agency_id as string) || undefined;
  }
  return req.user!.agencyId!;
}

/**
 * GET /api/reports/daily?date=YYYY-MM-DD&society_id=&agency_id=
 * Full daily attendance report with all watchmen status.
 */
router.get('/daily', asyncHandler(async (req: Request, res: Response) => {
  const agencyId = getAgencyId(req);
  const societyId = (req.query.society_id || req.query.societyId) as string;
  const dateStr = (req.query.date as string) || new Date().toISOString().split('T')[0];
  
  const matchObj: any = {};
  if (agencyId) matchObj.agency_id = new mongoose.Types.ObjectId(agencyId);
  if (societyId) matchObj.society_id = new mongoose.Types.ObjectId(societyId);

  if (dateStr) {
    const d = new Date(dateStr);
    const start = new Date(d);
    start.setUTCHours(0, 0, 0, 0);
    const end = new Date(d);
    end.setUTCHours(23, 59, 59, 999);
    const wideStart = new Date(start.getTime() - 14 * 3600000);
    const wideEnd = new Date(end.getTime() + 14 * 3600000);

    matchObj.$or = [
      { attendance_date: { $gte: start, $lte: end } },
      { check_in_time: { $gte: wideStart, $lte: wideEnd } },
    ];
  }

  const attendances = await Attendance.aggregate([
    { $match: matchObj },
    {
      $lookup: {
        from: 'watchmen',
        localField: 'watchman_id',
        foreignField: '_id',
        as: 'watchman',
      },
    },
    { $unwind: { path: '$watchman', preserveNullAndEmptyArrays: true } },
    {
      $lookup: {
        from: 'societies',
        localField: 'society_id',
        foreignField: '_id',
        as: 'society',
      },
    },
    { $unwind: { path: '$society', preserveNullAndEmptyArrays: true } },
    {
      $lookup: {
        from: 'shifts',
        localField: 'shift_id',
        foreignField: '_id',
        as: 'shift',
      },
    },
    { $unwind: { path: '$shift', preserveNullAndEmptyArrays: true } },
    {
      $addFields: {
        watchman_id: '$watchman_id',
        full_name: { $ifNull: ['$watchman.full_name', 'Unknown Guard'] },
        employee_id: { $ifNull: ['$watchman.employee_id', ''] },
        society_name: { $ifNull: ['$society.name', 'Unknown Society'] },
        shift_name: { $ifNull: ['$shift.name', 'Standard Shift'] },
        start_time: { $ifNull: ['$shift.start_time', ''] },
        end_time: { $ifNull: ['$shift.end_time', ''] },
        attendance_id: '$_id',
        final_status: '$status',
      },
    },
    { $project: { watchman: 0, society: 0, shift: 0 } },
    { $sort: { check_in_time: -1 } },
  ]);

  const formatted = attendances.map(a => {
    if (a.watchman_id) a.watchman_id = a.watchman_id.toString();
    if (a.attendance_id) a.attendance_id = a.attendance_id.toString();
    a.id = a._id.toString();
    delete a._id;
    delete a.__v;
    return a;
  });

  res.json({ success: true, data: formatted, date: dateStr });
}));

/**
 * GET /api/reports/monthly?year=2026&month=8&agency_id=&society_id=
 * Monthly summary per watchman.
 */
router.get('/monthly', asyncHandler(async (req: Request, res: Response) => {
  const agencyId = getAgencyId(req);
  const societyId = (req.query.society_id || req.query.societyId) as string;
  const year = parseInt(req.query.year as string) || new Date().getFullYear();
  const month = parseInt(req.query.month as string) || new Date().getMonth() + 1;

  const startDate = new Date(`${year}-${String(month).padStart(2, '0')}-01`);
  const endDate = new Date(year, month, 0, 23, 59, 59, 999); // Last moment of month

  const matchObj: any = { status: 'active' };
  if (agencyId) matchObj.agency_id = new mongoose.Types.ObjectId(agencyId);

  const watchmen = await Watchman.aggregate([
    { $match: matchObj },
    {
      $lookup: {
        from: 'attendances',
        let: { wId: '$_id' },
        pipeline: [
          {
            $match: {
              $expr: {
                $and: [
                  { $eq: ['$watchman_id', '$$wId'] },
                  {
                    $or: [
                      { $and: [{ $gte: ['$attendance_date', startDate] }, { $lte: ['$attendance_date', endDate] }] },
                      { $and: [{ $gte: ['$check_in_time', startDate] }, { $lte: ['$check_in_time', endDate] }] },
                    ],
                  },
                  ...(societyId ? [{ $eq: ['$society_id', new mongoose.Types.ObjectId(societyId)] }] : []),
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
    watchman_id: new mongoose.Types.ObjectId(req.params.id),
  };
  if (agencyId) matchStage.agency_id = new mongoose.Types.ObjectId(agencyId);

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
    { $unwind: { path: '$society', preserveNullAndEmptyArrays: true } },
    {
      $lookup: {
        from: 'shifts',
        localField: 'shift_id',
        foreignField: '_id',
        as: 'shift',
      },
    },
    { $unwind: { path: '$shift', preserveNullAndEmptyArrays: true } },
    {
      $addFields: {
        society_name: { $ifNull: ['$society.name', 'Unknown Society'] },
        shift_name: { $ifNull: ['$shift.name', 'Standard Shift'] },
        start_time: { $ifNull: ['$shift.start_time', ''] },
        end_time: { $ifNull: ['$shift.end_time', ''] },
      },
    },
    { $project: { society: 0, shift: 0 } },
    { $sort: { attendance_date: -1, check_in_time: -1 } },
  ]);

  const findQuery: any = { _id: req.params.id };
  if (agencyId) findQuery.agency_id = agencyId;
  const watchman = await Watchman.findOne(findQuery).select('full_name employee_id');

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
  const societyId = (req.query.society_id || req.query.societyId) as string;
  const { startDate, endDate } = req.query;

  const dateFrom = new Date((startDate as string) || Date.now() - 30 * 24 * 60 * 60 * 1000);
  const dateTo = new Date((endDate as string) || Date.now());

  const matchObj: any = {
    verification_status: { $in: ['suspicious', 'review_required', 'warning'] },
    attendance_date: { $gte: dateFrom, $lte: dateTo },
  };
  if (agencyId) matchObj.agency_id = new mongoose.Types.ObjectId(agencyId);
  if (societyId) matchObj.society_id = new mongoose.Types.ObjectId(societyId);

  const attRecords = await Attendance.aggregate([
    { $match: matchObj },
    {
      $lookup: {
        from: 'watchmen',
        localField: 'watchman_id',
        foreignField: '_id',
        as: 'watchman',
      },
    },
    { $unwind: { path: '$watchman', preserveNullAndEmptyArrays: true } },
    {
      $lookup: {
        from: 'societies',
        localField: 'society_id',
        foreignField: '_id',
        as: 'society',
      },
    },
    { $unwind: { path: '$society', preserveNullAndEmptyArrays: true } },
    {
      $lookup: {
        from: 'shifts',
        localField: 'shift_id',
        foreignField: '_id',
        as: 'shift',
      },
    },
    { $unwind: { path: '$shift', preserveNullAndEmptyArrays: true } },
    {
      $addFields: {
        watchman_name: { $ifNull: ['$watchman.full_name', 'Unknown Guard'] },
        employee_id: { $ifNull: ['$watchman.employee_id', ''] },
        society_name: { $ifNull: ['$society.name', 'Unknown Society'] },
        shift_name: { $ifNull: ['$shift.name', 'Standard Shift'] },
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
