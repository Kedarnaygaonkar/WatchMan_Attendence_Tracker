import { Router, Request, Response } from 'express';
import mongoose from 'mongoose';
import { authenticate, requireRole } from '../middleware/auth';
import { asyncHandler, AppError } from '../middleware/errorHandler';
import { Attendance, Society, Assignment, Watchman } from '../models';

const router = Router();
router.use(authenticate);
router.use(requireRole(['agency_admin', 'super_admin']));

function getAgencyId(req: Request): string | null {
  if (req.user!.role === 'super_admin') {
    const id = req.query.agency_id || req.body.agencyId;
    if (id) return id as string;
    return null;
  }
  return req.user!.agencyId!;
}

/**
 * GET /api/dashboard/summary
 * Returns today's attendance summary for the agency dashboard.
 */
router.get('/summary', asyncHandler(async (req: Request, res: Response) => {
  const agencyId = getAgencyId(req);
  const todayStr = new Date().toISOString().split('T')[0];
  const today = new Date(todayStr);

  const agencyFilter: any = {};
  if (agencyId) agencyFilter.agency_id = new mongoose.Types.ObjectId(agencyId);

  const wideStart = new Date(today.getTime() - 14 * 3600000);
  const wideEnd = new Date(today.getTime() + 24 * 3600000 + 14 * 3600000);

  const [
    attendanceList,
    societiesCount,
    assignmentsCount,
    watchmenCount,
  ] = await Promise.all([
    Attendance.find({
      ...agencyFilter,
      $or: [
        { attendance_date: today },
        { check_in_time: { $gte: wideStart, $lte: wideEnd } },
      ],
    }).select('status verification_status').lean(),
    Society.countDocuments({ ...agencyFilter, is_active: true }),
    Assignment.countDocuments({
      ...agencyFilter,
      is_active: true,
      start_date: { $lte: today },
      $or: [{ end_date: null }, { end_date: { $exists: false } }, { end_date: { $gte: today } }],
    }),
    Watchman.countDocuments({ ...agencyFilter, status: 'active' }),
  ]);

  let presentCount = 0;
  let lateCount = 0;
  let suspiciousCount = 0;

  attendanceList.forEach(a => {
    if (a.status === 'present' || a.status === 'late') presentCount++;
    if (a.status === 'late') lateCount++;
    if (a.verification_status === 'suspicious' || a.verification_status === 'review_required') suspiciousCount++;
  });

  const absentCount = watchmenCount - presentCount;

  res.json({
    success: true,
    data: {
      date: todayStr,
      totalWatchmen: watchmenCount,
      present: presentCount,
      late: lateCount,
      absent: Math.max(0, absentCount),
      suspicious: suspiciousCount,
      totalSocieties: societiesCount,
      activeAssignments: assignmentsCount,
    },
  });
}));

/**
 * GET /api/dashboard/live-attendance
 * Real-time attendance feed for today with watchman/society details.
 */
router.get('/live-attendance', asyncHandler(async (req: Request, res: Response) => {
  const agencyId = getAgencyId(req);
  const today = new Date(new Date().toISOString().split('T')[0]);
  const wideStart = new Date(today.getTime() - 14 * 3600000);
  const wideEnd = new Date(today.getTime() + 24 * 3600000 + 14 * 3600000);
  const { societyId, status } = req.query;

  const matchStage: any = {
    $or: [
      { attendance_date: today },
      { check_in_time: { $gte: wideStart, $lte: wideEnd } },
    ],
  };
  if (agencyId && mongoose.Types.ObjectId.isValid(agencyId)) {
    matchStage.agency_id = new mongoose.Types.ObjectId(agencyId);
  }
  if (societyId && mongoose.Types.ObjectId.isValid(societyId as string)) {
    matchStage.society_id = new mongoose.Types.ObjectId(societyId as string);
  }
  if (status) matchStage.status = status;

  const list = await Attendance.aggregate([
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
        watchman_phone: '$watchman.phone',
        society_name: '$society.name',
        shift_name: '$shift.name',
        start_time: '$shift.start_time',
        end_time: '$shift.end_time',
      },
    },
    { $project: { watchman: 0, society: 0, shift: 0 } },
    { $sort: { check_in_time: -1 } },
  ]);

  const formatted = list.map(a => {
    a.id = a._id.toString();
    delete a._id;
    delete a.__v;
    return a;
  });

  res.json({ success: true, data: formatted });
}));

/**
 * GET /api/dashboard/missing-attendance
 * Watchmen who have active assignments today but haven't marked attendance.
 */
router.get('/missing-attendance', asyncHandler(async (req: Request, res: Response) => {
  const agencyId = getAgencyId(req);
  const todayStr = new Date().toISOString().split('T')[0];
  const today = new Date(todayStr);
  const now = new Date().toTimeString().slice(0, 5);

  const matchAssignment: any = {
    is_active: true,
    start_date: { $lte: today },
    $or: [{ end_date: null }, { end_date: { $exists: false } }, { end_date: { $gte: today } }],
  };
  if (agencyId) matchAssignment.agency_id = new mongoose.Types.ObjectId(agencyId);

  const assignments = await Assignment.aggregate([
    {
      $match: matchAssignment,
    },
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
                  { $eq: ['$attendance_date', today] },
                ],
              },
            },
          },
        ],
        as: 'attendances',
      },
    },
    { $match: { attendances: { $size: 0 } } },
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
        assignment_id: '$_id',
        watchman_name: '$watchman.full_name',
        employee_id: '$watchman.employee_id',
        watchman_phone: '$watchman.phone',
        society_name: '$society.name',
        shift_name: '$shift.name',
        start_time: '$shift.start_time',
        end_time: '$shift.end_time',
        late_threshold_minutes: '$shift.late_threshold_minutes',
      },
    },
    { $project: { watchman: 0, society: 0, shift: 0, attendances: 0 } },
    { $sort: { start_time: 1, watchman_name: 1 } },
  ]);

  const missing = assignments.filter(row => {
    const start = row.start_time.slice(0, 5);
    return now >= start;
  }).map(a => {
    a.assignment_id = a.assignment_id.toString();
    a.id = a._id.toString();
    delete a._id;
    delete a.__v;
    return a;
  });

  res.json({ success: true, data: missing });
}));

/**
 * GET /api/dashboard/society-coverage
 * Shows coverage per society (required guards vs present today).
 */
router.get('/society-coverage', asyncHandler(async (req: Request, res: Response) => {
  const agencyId = getAgencyId(req);
  const todayStr = new Date().toISOString().split('T')[0];
  const today = new Date(todayStr);
  const wideStart = new Date(today.getTime() - 14 * 3600000);
  const wideEnd = new Date(today.getTime() + 24 * 3600000 + 14 * 3600000);

  const matchSoc: any = { is_active: true };
  if (agencyId && mongoose.Types.ObjectId.isValid(agencyId)) {
    matchSoc.agency_id = new mongoose.Types.ObjectId(agencyId);
  }

  const societies = await Society.aggregate([
    { $match: matchSoc },
    {
      $lookup: {
        from: 'attendances',
        let: { sId: '$_id' },
        pipeline: [
          {
            $match: {
              $expr: {
                $and: [
                  { $eq: ['$society_id', '$$sId'] },
                  { $in: ['$status', ['present', 'late']] },
                ],
              },
              $or: [
                { attendance_date: today },
                { check_in_time: { $gte: wideStart, $lte: wideEnd } },
              ],
            },
          },
        ],
        as: 'attendances',
      },
    },
    {
      $addFields: {
        present_count: { $size: '$attendances' },
      },
    },
    { $project: { attendances: 0 } },
    { $sort: { name: 1 } },
  ]);

  const formatted = societies.map(s => {
    s.id = s._id.toString();
    delete s._id;
    delete s.__v;
    return s;
  });

  res.json({ success: true, data: formatted });
}));

export default router;
