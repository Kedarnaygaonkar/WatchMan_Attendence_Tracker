import { Router, Request, Response } from 'express';
import { authenticate, requireRole } from '../middleware/auth';
import { asyncHandler } from '../middleware/errorHandler';
import { Watchman, Attendance, Assignment } from '../models';
import mongoose from 'mongoose';

const router = Router();
router.use(authenticate);
router.use(requireRole(['agency_admin', 'super_admin']));

function getAgencyId(req: Request): string | undefined {
  if (req.user!.role === 'super_admin') {
    const id = req.query.agency_id || req.body.agencyId;
    if (id) return id as string;
    if (req.user!.agencyId) return req.user!.agencyId;
    return undefined;
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
  
  const d = new Date(dateStr);
  const start = new Date(d);
  start.setUTCHours(0, 0, 0, 0);
  const end = new Date(d);
  end.setUTCHours(23, 59, 59, 999);
  const wideStart = new Date(start.getTime() - 14 * 3600000);
  const wideEnd = new Date(end.getTime() + 14 * 3600000);

  const matchObj: any = { status: 'active' };
  if (agencyId) matchObj.agency_id = new mongoose.Types.ObjectId(agencyId);

  const pipeline: any[] = [
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
                  { $eq: [{ $toString: '$watchman_id' }, { $toString: '$$wId' }] },
                  {
                    $or: [
                      { $and: [{ $gte: ['$attendance_date', start] }, { $lte: ['$attendance_date', end] }] },
                      { $and: [{ $gte: ['$check_in_time', wideStart] }, { $lte: ['$check_in_time', wideEnd] }] },
                    ],
                  },
                ],
              },
            },
          },
          { $sort: { check_in_time: -1 } }
        ],
        as: 'attendances',
      },
    },
    { $unwind: { path: '$attendances', preserveNullAndEmptyArrays: true } }
  ];

  if (societyId) {
    pipeline.push({
      $match: {
        'attendances.society_id': new mongoose.Types.ObjectId(societyId)
      }
    });
  }

  pipeline.push(
    {
      $lookup: {
        from: 'societies',
        localField: 'attendances.society_id',
        foreignField: '_id',
        as: 'society',
      },
    },
    { $unwind: { path: '$society', preserveNullAndEmptyArrays: true } },
    {
      $addFields: {
        watchman_id: '$_id',
        full_name: '$full_name',
        employee_id: '$employee_id',
        society_name: { $ifNull: ['$society.name', '—'] },
        shift_name: '—',
        start_time: '',
        end_time: '',
        attendance_id: '$attendances._id',
        check_in_time: { $ifNull: ['$attendances.check_in_time', null] },
        check_out_time: { $ifNull: ['$attendances.check_out_time', null] },
        duration_minutes: { $ifNull: ['$attendances.duration_minutes', null] },
        verification_status: { $ifNull: ['$attendances.verification_status', null] },
        is_offline_sync: { $ifNull: ['$attendances.is_offline_sync', false] },
        final_status: { $ifNull: ['$attendances.status', 'absent'] },
      },
    },
    { $project: { society: 0, attendances: 0 } },
    { $sort: { society_name: 1, full_name: 1 } }
  );

  const reportData = await Watchman.aggregate(pipeline);

  const formatted = reportData.map(a => {
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
    ...(societyId ? [
      {
        $lookup: {
          from: 'assignments',
          localField: '_id',
          foreignField: 'watchman_id',
          as: 'assignments'
        }
      },
      {
        $match: {
          'assignments.society_id': new mongoose.Types.ObjectId(societyId)
        }
      }
    ] : []),
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
    { $project: { attendances: 0, assignments: 0 } },
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


/**
 * GET /api/reports/society-calendar?society_id=&year=&month=&agency_id=
 * Monthly calendar view for a society broken down by wing and gate.
 * Returns:
 *  - watchmen: list of all watchmen who attended this month
 *  - wings: { [wingName]: { [day]: boolean } } - presence per wing per day
 *  - gates: { [gateName]: { [day]: boolean } } - presence per gate per day
 */
router.get('/society-calendar', asyncHandler(async (req: Request, res: Response) => {
  const agencyId = getAgencyId(req);
  const societyId = (req.query.society_id || req.query.societyId) as string;
  const year = parseInt(req.query.year as string) || new Date().getFullYear();
  const month = parseInt(req.query.month as string) || new Date().getMonth() + 1;

  if (!societyId) {
    res.status(400).json({ success: false, message: 'society_id is required' });
    return;
  }

  const startDate = new Date(`${year}-${String(month).padStart(2, '0')}-01`);
  const endDate = new Date(year, month, 0, 23, 59, 59, 999);
  startDate.setUTCHours(0, 0, 0, 0);

  const matchStage: any = {
    society_id: new mongoose.Types.ObjectId(societyId),
    $or: [
      { attendance_date: { $gte: startDate, $lte: endDate } },
      { check_in_time: { $gte: startDate, $lte: endDate } },
    ],
    status: { $in: ['present', 'late'] },
  };
  if (agencyId) matchStage.agency_id = new mongoose.Types.ObjectId(agencyId);

  const records = await Attendance.aggregate([
    { $match: matchStage },
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
      $addFields: {
        watchman_name: { $ifNull: ['$watchman.full_name', 'Unknown'] },
        employee_id: { $ifNull: ['$watchman.employee_id', ''] },
        day: {
          $dayOfMonth: { $ifNull: ['$attendance_date', '$check_in_time'] },
        },
      },
    },
    {
      $project: {
        watchman_id: 1, watchman_name: 1, employee_id: 1,
        day: 1, status: 1,
        selected_gate: 1, selected_wing: 1,
      },
    },
    { $sort: { day: 1 } },
  ]);

  // Build watchmen summary
  const watchmenMap: Record<string, { watchman_id: string; watchman_name: string; employee_id: string; days_attended: number; wings: string[]; gates: string[] }> = {};
  const wingsMap: Record<string, Record<number, boolean>> = {};
  const gatesMap: Record<string, Record<number, boolean>> = {};

  for (const r of records) {
    const wid = r.watchman_id?.toString() || 'unknown';

    if (!watchmenMap[wid]) {
      watchmenMap[wid] = { watchman_id: wid, watchman_name: r.watchman_name, employee_id: r.employee_id, days_attended: 0, wings: [], gates: [] };
    }
    watchmenMap[wid].days_attended++;

    // Wing breakdown
    if (r.selected_wing) {
      const w = r.selected_wing.trim();
      if (!wingsMap[w]) wingsMap[w] = {};
      wingsMap[w][r.day] = true;
      if (!watchmenMap[wid].wings.includes(w)) watchmenMap[wid].wings.push(w);
    }

    // Gate breakdown
    if (r.selected_gate) {
      const g = r.selected_gate.trim();
      if (!gatesMap[g]) gatesMap[g] = {};
      gatesMap[g][r.day] = true;
      if (!watchmenMap[wid].gates.includes(g)) watchmenMap[wid].gates.push(g);
    }
  }

  const daysInMonth = new Date(year, month, 0).getDate();

  // Convert wing/gate maps to array of { name, days: boolean[] }
  const formatCalendar = (map: Record<string, Record<number, boolean>>) =>
    Object.entries(map).sort(([a], [b]) => a.localeCompare(b)).map(([name, dayMap]) => ({
      name,
      days: Array.from({ length: daysInMonth }, (_, i) => !!dayMap[i + 1]),
    }));

  res.json({
    success: true,
    year, month,
    daysInMonth,
    watchmen: Object.values(watchmenMap).sort((a, b) => a.watchman_name.localeCompare(b.watchman_name)),
    wings: formatCalendar(wingsMap),
    gates: formatCalendar(gatesMap),
  });
}));

/**
 * GET /api/reports/watchman-journey?watchman_id=&startDate=&endDate=&agency_id=
 * Day-by-day attendance journey for a specific watchman across all societies.
 * Shows PRESENT/LATE at which society, or ABSENT if no attendance that day.
 */
router.get('/watchman-journey', asyncHandler(async (req: Request, res: Response) => {
  const agencyId = getAgencyId(req);
  const watchmanId = (req.query.watchman_id || req.query.watchmanId) as string;
  const startDateStr = (req.query.startDate || req.query.start_date) as string;
  const endDateStr = (req.query.endDate || req.query.end_date) as string;

  if (!watchmanId) {
    res.status(400).json({ success: false, message: 'watchman_id is required' });
    return;
  }

  const startDate = startDateStr ? new Date(startDateStr) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const endDate = endDateStr ? new Date(endDateStr) : new Date();
  startDate.setUTCHours(0, 0, 0, 0);
  endDate.setUTCHours(23, 59, 59, 999);

  // Fetch all attendance records for this watchman in the date range
  const matchStage: any = {
    watchman_id: new mongoose.Types.ObjectId(watchmanId),
    $or: [
      { attendance_date: { $gte: startDate, $lte: endDate } },
      { check_in_time: { $gte: startDate, $lte: endDate } },
    ],
  };
  if (agencyId) matchStage.agency_id = new mongoose.Types.ObjectId(agencyId);

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
        date_key: {
          $dateToString: {
            format: '%Y-%m-%d',
            date: { $ifNull: ['$attendance_date', '$check_in_time'] },
          },
        },
      },
    },
    { $project: { society: 0, shift: 0 } },
    { $sort: { date_key: -1, check_in_time: -1 } },
  ]);

  // Build a map of date -> record
  const recordMap: Record<string, any> = {};
  for (const r of attRecords) {
    if (!recordMap[r.date_key]) {
      recordMap[r.date_key] = r;
    }
  }

  // Generate all dates from startDate to endDate
  const journey: any[] = [];
  const cursor = new Date(startDate);
  while (cursor <= endDate) {
    const dateKey = cursor.toISOString().split('T')[0];
    const rec = recordMap[dateKey];
    if (rec) {
      journey.push({
        date: dateKey,
        status: rec.status || 'present',
        society_name: rec.society_name,
        shift_name: rec.shift_name,
        start_time: rec.start_time,
        end_time: rec.end_time,
        check_in_time: rec.check_in_time,
        check_out_time: rec.check_out_time,
        duration_minutes: rec.duration_minutes,
        verification_status: rec.verification_status,
        attendance_id: rec._id?.toString(),
      });
    } else {
      // Only mark absent for past days (not today or future)
      const today = new Date();
      today.setUTCHours(0, 0, 0, 0);
      if (cursor < today) {
        journey.push({
          date: dateKey,
          status: 'absent',
          society_name: null,
          shift_name: null,
          start_time: null,
          end_time: null,
          check_in_time: null,
          check_out_time: null,
          duration_minutes: null,
          verification_status: null,
          attendance_id: null,
        });
      }
    }
    cursor.setDate(cursor.getDate() + 1);
  }

  // Reverse so most recent is first
  journey.reverse();

  // Fetch watchman info
  const findQuery: any = { _id: new mongoose.Types.ObjectId(watchmanId) };
  if (agencyId) findQuery.agency_id = agencyId;
  const watchman = await Watchman.findOne(findQuery).select('full_name employee_id');

  // Stats
  const totalDays = journey.length;
  const presentDays = journey.filter(d => d.status === 'present').length;
  const lateDays = journey.filter(d => d.status === 'late').length;
  const absentDays = journey.filter(d => d.status === 'absent').length;

  res.json({
    success: true,
    watchman,
    data: journey,
    stats: { totalDays, presentDays, lateDays, absentDays },
    startDate: startDate.toISOString().split('T')[0],
    endDate: endDate.toISOString().split('T')[0],
  });
}));

export default router;
