import { Router, Request, Response } from 'express';
import { authenticate, requireRole } from '../middleware/auth';
import { asyncHandler, AppError } from '../middleware/errorHandler';
import { Attendance, Society, Assignment, Watchman } from '../models';

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
 * GET /api/dashboard/summary
 * Returns today's attendance summary for the agency dashboard.
 */
router.get('/summary', asyncHandler(async (req: Request, res: Response) => {
  const agencyId = getAgencyId(req);
  const todayStr = new Date().toISOString().split('T')[0];
  const today = new Date(todayStr);

  const [
    attendanceList,
    societiesCount,
    assignmentsCount,
    watchmenCount,
  ] = await Promise.all([
    Attendance.find({ agency_id: agencyId, attendance_date: today }),
    Society.countDocuments({ agency_id: agencyId, is_active: true }),
    Assignment.countDocuments({
      agency_id: agencyId,
      is_active: true,
      start_date: { $lte: today },
      $or: [{ end_date: null }, { end_date: { $exists: false } }, { end_date: { $gte: today } }],
    }),
    Watchman.countDocuments({ agency_id: agencyId, status: 'active' }),
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
  const { societyId, status } = req.query;

  const matchStage: any = { agency_id: agencyId, attendance_date: today };
  if (societyId) matchStage.society_id = societyId;
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

  const assignments = await Assignment.aggregate([
    {
      $match: {
        agency_id: agencyId,
        is_active: true,
        start_date: { $lte: today },
        $or: [{ end_date: null }, { end_date: { $exists: false } }, { end_date: { $gte: today } }],
      },
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
  const today = new Date(new Date().toISOString().split('T')[0]);

  const societies = await Society.aggregate([
    { $match: { agency_id: agencyId, is_active: true } },
    {
      $lookup: {
        from: 'attendance',
        let: { sId: '$_id' },
        pipeline: [
          {
            $match: {
              $expr: {
                $and: [
                  { $eq: ['$society_id', '$$sId'] },
                  { $eq: ['$attendance_date', today] },
                  { $in: ['$status', ['present', 'late']] },
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
