import { Router, Request, Response } from 'express';
import { authenticate, requireRole } from '../middleware/auth';
import { asyncHandler } from '../middleware/errorHandler';
import { Watchman, Attendance, Assignment, Society, Agency } from '../models';
import mongoose from 'mongoose';

const router = Router();
router.use(authenticate);
router.use(requireRole(['agency_admin', 'super_admin']));

function getAgencyId(req: Request): string | undefined {
  if (req.user!.role === 'super_admin') {
    const id = req.query.agency_id || req.body.agencyId;
    if (id) return id as string;
    
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
  if (agencyId && mongoose.Types.ObjectId.isValid(agencyId)) {
    matchObj.agency_id = new mongoose.Types.ObjectId(agencyId);
  }

  const pipeline: any[] = [
    { $match: matchObj },
    {
      $lookup: {
        from: 'attendances',
        let: { wId: '$_id' },
        pipeline: [
          {
            $match: {
              $expr: { $eq: ['$watchman_id', '$$wId'] },
              $or: [
                { attendance_date: { $gte: wideStart, $lte: wideEnd } },
                { check_in_time: { $gte: wideStart, $lte: wideEnd } },
              ],
            },
          },
          { $sort: { check_in_time: -1 } },
          { $limit: 1 },
        ],
        as: 'attendances',
      },
    },
    { $unwind: { path: '$attendances', preserveNullAndEmptyArrays: true } },
    {
      $lookup: {
        from: 'assignments',
        let: { wId: '$_id' },
        pipeline: [
          {
            $match: {
              $expr: { $eq: ['$watchman_id', '$$wId'] },
              is_active: true,
            },
          },
          { $sort: { createdAt: -1 } },
          { $limit: 1 },
        ],
        as: 'assignment',
      },
    },
    { $unwind: { path: '$assignment', preserveNullAndEmptyArrays: true } },
    {
      $addFields: {
        resolved_society_id: { $ifNull: ['$attendances.society_id', '$assignment.society_id'] },
        resolved_shift_id: { $ifNull: ['$attendances.shift_id', '$assignment.shift_id'] },
      },
    },
  ];

  if (societyId && mongoose.Types.ObjectId.isValid(societyId)) {
    pipeline.push({
      $match: {
        resolved_society_id: new mongoose.Types.ObjectId(societyId),
      },
    });
  }

  pipeline.push(
    {
      $lookup: {
        from: 'societies',
        localField: 'resolved_society_id',
        foreignField: '_id',
        as: 'society',
      },
    },
    { $unwind: { path: '$society', preserveNullAndEmptyArrays: true } },
    {
      $lookup: {
        from: 'shifts',
        localField: 'resolved_shift_id',
        foreignField: '_id',
        as: 'shift',
      },
    },
    { $unwind: { path: '$shift', preserveNullAndEmptyArrays: true } },
    {
      $addFields: {
        watchman_id: '$_id',
        full_name: '$full_name',
        employee_id: '$employee_id',
        society_name: { $ifNull: ['$society.name', '—'] },
        shift_name: { $ifNull: ['$shift.name', '—'] },
        start_time: { $ifNull: ['$shift.start_time', ''] },
        end_time: { $ifNull: ['$shift.end_time', ''] },
        attendance_id: '$attendances._id',
        check_in_time: { $ifNull: ['$attendances.check_in_time', null] },
        check_out_time: { $ifNull: ['$attendances.check_out_time', null] },
        duration_minutes: { $ifNull: ['$attendances.duration_minutes', null] },
        verification_status: { $ifNull: ['$attendances.verification_status', null] },
        is_offline_sync: { $ifNull: ['$attendances.is_offline_sync', false] },
        final_status: { $ifNull: ['$attendances.status', 'absent'] },
      },
    },
    { $project: { society: 0, shift: 0, attendances: 0, assignment: 0, face_descriptor: 0 } },
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
        watchman_name: { $ifNull: ['$watchman.full_name', 'Unknown'] },
        employee_id: { $ifNull: ['$watchman.employee_id', ''] },
        phone: { $ifNull: ['$watchman.phone', ''] },
        watchman_wing: { $ifNull: ['$watchman.wing', ''] },
        shift_name: { $ifNull: ['$shift.name', ''] },
        day: {
          $dayOfMonth: { $ifNull: ['$attendance_date', '$check_in_time'] },
        },
      },
    },
    {
      $project: {
        watchman_id: 1, watchman_name: 1, employee_id: 1, phone: 1, shift_name: 1,
        day: 1, status: 1,
        selected_gate: 1, selected_wing: 1, watchman_wing: 1,
      },
    },
    { $sort: { day: 1 } },
  ]);

  // Fetch society definition to ensure all configured wings & gates are represented
  const targetSociety = await Society.findById(societyId).lean();

  function formatPostDisplayName(name: string, type: 'wing' | 'gate' | 'general'): string {
    if (!name) return 'General Duty';
    const trimmed = name.trim();
    if (type === 'wing') {
      if (/^(wing|tower|block|phase|sector)/i.test(trimmed) || /wing$/i.test(trimmed)) {
        return trimmed;
      }
      return `Wing ${trimmed}`;
    }
    if (type === 'gate') {
      if (/gate/i.test(trimmed)) {
        return trimmed;
      }
      return `Gate ${trimmed}`;
    }
    return trimmed;
  }

  // Build watchmen summary with detailed wing & gate allocations
  interface WatchmanAggItem {
    watchman_id: string;
    watchman_name: string;
    employee_id: string;
    phone: string;
    shift_name: string;
    days_attended: number;
    wings: string[];
    gates: string[];
    wing_counts: Record<string, number>;
    gate_counts: Record<string, number>;
    post_counts: Record<string, { name: string; displayName: string; type: 'wing' | 'gate' | 'general'; days: number }>;
    seenDays: Set<number>;
  }

  const watchmenMap: Record<string, WatchmanAggItem> = {};
  const wingsMap: Record<string, Record<number, string | boolean>> = {};
  const gatesMap: Record<string, Record<number, string | boolean>> = {};

  if (targetSociety) {
    for (const w of targetSociety.wings || []) {
      if (!wingsMap[w]) wingsMap[w] = {};
    }
    for (const g of targetSociety.gates || []) {
      if (!gatesMap[g]) gatesMap[g] = {};
    }
  }

  for (const r of records) {
    const wid = r.watchman_id?.toString() || 'unknown';

    if (!watchmenMap[wid]) {
      watchmenMap[wid] = {
        watchman_id: wid,
        watchman_name: r.watchman_name,
        employee_id: r.employee_id,
        phone: r.phone,
        shift_name: r.shift_name,
        days_attended: 0,
        wings: [],
        gates: [],
        wing_counts: {},
        gate_counts: {},
        post_counts: {},
        seenDays: new Set<number>(),
      };
    }

    const wm = watchmenMap[wid];
    const isNewDay = !wm.seenDays.has(r.day);
    if (isNewDay) {
      wm.seenDays.add(r.day);
      wm.days_attended++;
    }

    const statusVal = r.status === 'late' ? 'late' : 'present';

    // Wing breakdown
    const effectiveWing = r.selected_wing?.trim() || (!r.selected_gate && r.watchman_wing?.trim() ? r.watchman_wing.trim() : '');
    if (effectiveWing) {
      if (!wingsMap[effectiveWing]) wingsMap[effectiveWing] = {};
      wingsMap[effectiveWing][r.day] = statusVal;
      if (!wm.wings.includes(effectiveWing)) wm.wings.push(effectiveWing);
      if (isNewDay) {
        wm.wing_counts[effectiveWing] = (wm.wing_counts[effectiveWing] || 0) + 1;
      }
    }

    // Gate breakdown
    if (r.selected_gate) {
      const g = r.selected_gate.trim();
      if (!gatesMap[g]) gatesMap[g] = {};
      gatesMap[g][r.day] = statusVal;
      if (!wm.gates.includes(g)) wm.gates.push(g);
      if (isNewDay) {
        wm.gate_counts[g] = (wm.gate_counts[g] || 0) + 1;
      }
    }

    // Determine primary post allocation for this day
    if (isNewDay) {
      let postName = '';
      let postType: 'wing' | 'gate' | 'general' = 'general';

      if (effectiveWing) {
        postName = effectiveWing;
        postType = 'wing';
      } else if (r.selected_gate && r.selected_gate.trim()) {
        postName = r.selected_gate.trim();
        postType = 'gate';
      } else {
        postName = 'General Duty';
        postType = 'general';
      }

      const postKey = `${postType}:${postName}`;
      if (!wm.post_counts[postKey]) {
        wm.post_counts[postKey] = {
          name: postName,
          displayName: formatPostDisplayName(postName, postType),
          type: postType,
          days: 0,
        };
      }
      wm.post_counts[postKey].days++;
    }
  }

  const daysInMonth = new Date(year, month, 0).getDate();

  const managingAgency = targetSociety?.agency_id
    ? await Agency.findById(targetSociety.agency_id).lean()
    : null;

  // Convert wing/gate maps to array of { name, days: (string | boolean | null)[] }
  const formatCalendar = (map: Record<string, Record<number, string | boolean>>) =>
    Object.entries(map).sort(([a], [b]) => a.localeCompare(b)).map(([name, dayMap]) => ({
      name,
      days: Array.from({ length: daysInMonth }, (_, i) => dayMap[i + 1] || null),
    }));

  res.json({
    success: true,
    year, month,
    daysInMonth,
    society: targetSociety ? {
      id: targetSociety._id.toString(),
      name: targetSociety.name,
      address: targetSociety.address,
      agency: managingAgency ? {
        id: managingAgency._id.toString(),
        name: managingAgency.name,
        phone: managingAgency.phone,
        email: managingAgency.email,
        logo_url: managingAgency.logo_url,
      } : null,
    } : null,
    watchmen: Object.values(watchmenMap).map((wm) => {
      const post_breakdown = Object.values(wm.post_counts).sort((a, b) => b.days - a.days || a.displayName.localeCompare(b.displayName));
      return {
        watchman_id: wm.watchman_id,
        watchman_name: wm.watchman_name,
        employee_id: wm.employee_id,
        phone: wm.phone,
        shift_name: wm.shift_name,
        days_attended: wm.days_attended,
        wings: wm.wings,
        gates: wm.gates,
        wing_counts: wm.wing_counts,
        gate_counts: wm.gate_counts,
        post_breakdown,
      };
    }).sort((a, b) => a.watchman_name.localeCompare(b.watchman_name)),
    wings: formatCalendar(wingsMap),
    gates: formatCalendar(gatesMap),
  });
}));

/**
 * Utility to convert an amount in INR to Indian words
 */
function numberToIndianWords(num: number): string {
  const a = [
    '', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten',
    'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'
  ];
  const b = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

  const n = Math.floor(Math.abs(num));
  if (n === 0) return 'Zero Only';

  function convertTwoDigits(val: number): string {
    if (val < 20) return a[val];
    return b[Math.floor(val / 10)] + (val % 10 !== 0 ? ' ' + a[val % 10] : '');
  }

  function convertThreeDigits(val: number): string {
    let str = '';
    if (val >= 100) {
      str += a[Math.floor(val / 100)] + ' Hundred ';
      val %= 100;
    }
    if (val > 0) {
      if (str !== '') str += 'and ';
      str += convertTwoDigits(val);
    }
    return str.trim();
  }

  let crore = Math.floor(n / 10000000);
  let remainder = n % 10000000;
  let lakh = Math.floor(remainder / 100000);
  remainder = remainder % 100000;
  let thousand = Math.floor(remainder / 1000);
  let hundreds = remainder % 1000;

  let res = '';
  if (crore > 0) res += convertThreeDigits(crore) + ' Crore ';
  if (lakh > 0) res += convertThreeDigits(lakh) + ' Lakh ';
  if (thousand > 0) res += convertThreeDigits(thousand) + ' Thousand ';
  if (hundreds > 0) res += convertThreeDigits(hundreds);

  return res.trim() + ' Only';
}

/**
 * GET /api/reports/society-wing-bill?society_id=&year=&month=&wing=&rate_per_month=&quantity=&agency_id=
 * Generates official Society-wise and Wing-wise Tax Invoice / Bill details
 */
router.get('/society-wing-bill', asyncHandler(async (req: Request, res: Response) => {
  const agencyId = getAgencyId(req);
  const societyId = (req.query.society_id || req.query.societyId) as string;
  const year = parseInt(req.query.year as string) || new Date().getFullYear();
  const month = parseInt(req.query.month as string) || new Date().getMonth() + 1;
  const wing = ((req.query.wing as string) || 'all').trim();
  const customRate = req.query.rate_per_month ? parseFloat(req.query.rate_per_month as string) : undefined;
  const customQuantity = req.query.quantity ? parseInt(req.query.quantity as string) : undefined;
  const customTotalDays = req.query.total_days ? parseInt(req.query.total_days as string) : undefined;

  if (!societyId || !mongoose.Types.ObjectId.isValid(societyId)) {
    res.status(400).json({ success: false, message: 'Valid society_id is required' });
    return;
  }

  const society = await Society.findById(societyId).lean();
  if (!society) {
    res.status(404).json({ success: false, message: 'Society not found' });
    return;
  }

  let managingAgency: any = null;
  if (society.agency_id) {
    managingAgency = await Agency.findById(society.agency_id).lean();
  }
  if (!managingAgency && agencyId && mongoose.Types.ObjectId.isValid(agencyId)) {
    managingAgency = await Agency.findById(agencyId).lean();
  }

  const startDate = new Date(`${year}-${String(month).padStart(2, '0')}-01`);
  startDate.setUTCHours(0, 0, 0, 0);
  const endDate = new Date(year, month, 0, 23, 59, 59, 999);
  const daysInMonth = new Date(year, month, 0).getDate();

  // Match attendances for this society in this month
  const matchStage: any = {
    society_id: new mongoose.Types.ObjectId(societyId),
    $or: [
      { attendance_date: { $gte: startDate, $lte: endDate } },
      { check_in_time: { $gte: startDate, $lte: endDate } },
    ],
    status: { $in: ['present', 'late'] },
  };

  if (agencyId && mongoose.Types.ObjectId.isValid(agencyId)) {
    matchStage.agency_id = new mongoose.Types.ObjectId(agencyId);
  }

  // Filter by wing if not 'all'
  if (wing && wing.toLowerCase() !== 'all') {
    const cleanWing = wing.replace(/wing/i, '').trim();
    matchStage.$and = [
      {
        $or: [
          { selected_wing: { $regex: new RegExp(`^${cleanWing}$`, 'i') } },
          { selected_wing: { $regex: new RegExp(`${cleanWing}\\s*wing`, 'i') } },
          { selected_wing: wing },
        ],
      },
    ];
  }

  const attendances = await Attendance.find(matchStage).lean();

  // Distinct guards deployed
  const guardIds = new Set<string>();
  attendances.forEach((att) => {
    if (att.watchman_id) guardIds.add(att.watchman_id.toString());
  });

  const distinctGuardsCount = guardIds.size;
  const quantity = customQuantity !== undefined && !isNaN(customQuantity) && customQuantity > 0
    ? customQuantity
    : distinctGuardsCount > 0
    ? distinctGuardsCount
    : (wing && wing.toLowerCase() !== 'all' ? 2 : (society.required_guards || 8));

  let totalDays = attendances.length;
  if (customTotalDays !== undefined && !isNaN(customTotalDays) && customTotalDays >= 0) {
    totalDays = customTotalDays;
  } else if (totalDays === 0) {
    totalDays = quantity * (daysInMonth >= 30 ? 28 : daysInMonth);
  }

  const ratePerMonth = customRate !== undefined && !isNaN(customRate) && customRate > 0
    ? customRate
    : 23000;

  const perDayRate = Math.round((ratePerMonth / daysInMonth) * 100) / 100;
  const totalAmount = Math.round((totalDays * perDayRate) * 100) / 100;
  const subTotalA = totalAmount;
  const subTotalB = totalAmount;
  const roundedTotal = Math.round(totalAmount);
  const roundOff = Math.round((roundedTotal - totalAmount) * 100) / 100;

  // Month formatting
  const monthDate = new Date(year, month - 1, 1);
  const monthName = monthDate.toLocaleString('en-IN', { month: 'long' });
  const monthShort = monthDate.toLocaleString('en-IN', { month: 'short' }).toUpperCase();
  const invoicePeriod = `01 ${monthShort} ${year} TO ${daysInMonth} ${monthShort} ${year}`;
  const serviceMonth = `${monthName} ${year}`;

  const yrShort = String(year).slice(-2);
  const nextYrShort = String(year + 1).slice(-2);
  const invoiceNo = `ASG${yrShort}-${nextYrShort}/${String(month).padStart(2, '0')}/043`;
  const invoiceDate = `13/${String(month).padStart(2, '0')}/${year}`;

  const siteName = wing && wing.toLowerCase() !== 'all'
    ? (wing.toUpperCase().includes('WING') ? wing.toUpperCase() : `${wing.toUpperCase()} WING`)
    : `${society.name} (ALL WINGS)`;

  res.json({
    success: true,
    data: {
      agency: {
        id: managingAgency?._id?.toString() || society.agency_id?.toString() || agencyId || '',
        name: managingAgency?.name || 'ALERT SPACE FACILITIES AND MANAGEMENT SERVICES',
        subName: managingAgency?.name || 'Alert Space Facilities & Management Services',
        address: managingAgency?.address || 'Sharma Complex, 3rd Floor Near Ram Krushna Mangal Karyalay,Pimple Gurav,Pune-411061',
        state: 'Maharashtra',
        pan: 'EUBPG6574A',
        phone: managingAgency?.phone || '+91 9876541234',
        email: managingAgency?.email || 'alertspace@gmail.com',
        logo_url: managingAgency?.logo_url || null,
      },
      society: {
        id: society._id.toString(),
        name: society.name.includes('Society') ? society.name : `${society.name} Co-operative Housing Society Ltd.`,
        rawName: society.name,
        address: society.address,
        placeOfSupply: 'Maharashtra',
        wings: society.wings || [],
      },
      invoice: {
        invoiceNo,
        invoiceDate,
        serviceMonth,
        invoicePeriod,
        siteName,
        wing: wing || 'all',
        particulars: 'Security Guard',
        quantity,
        ratePerMonth,
        perDayRate,
        perHrRate: 0,
        otHours: 0,
        totalDays,
        subTotalA,
        subTotalB,
        roundOff,
        total: roundedTotal,
        amountInWords: numberToIndianWords(roundedTotal),
        year,
        month,
        daysInMonth,
      },
    },
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

  if (!watchmanId || !mongoose.Types.ObjectId.isValid(watchmanId)) {
    res.status(400).json({ success: false, message: 'valid watchman_id is required' });
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
  if (agencyId && mongoose.Types.ObjectId.isValid(agencyId)) {
    matchStage.agency_id = new mongoose.Types.ObjectId(agencyId);
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
  if (agencyId && mongoose.Types.ObjectId.isValid(agencyId)) {
    findQuery.agency_id = new mongoose.Types.ObjectId(agencyId);
  }
  const watchman = await Watchman.findOne(findQuery).select('full_name employee_id phone status joining_date address');

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
