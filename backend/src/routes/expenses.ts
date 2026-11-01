import { Router, Request, Response } from 'express';
import mongoose from 'mongoose';
import { Expense, ExpenseCategory, ExpenseType } from '../models/Expense';
import { SalaryHold } from '../models/SalaryHold';
import { Watchman } from '../models/Watchman';
import { Attendance } from '../models/Attendance';
import { Assignment } from '../models/Assignment';
import { Agency } from '../models/Agency';
import { authenticate, requireRole } from '../middleware/auth';

const router = Router();

// All expense routes require admin or super_admin authentication
router.use(authenticate);
router.use(requireRole(['agency_admin', 'super_admin']));

/**
 * GET /api/expenses
 * List expenses with filters: agency_id, watchman_id, category, startDate, endDate
 */
router.get('/', async (req: Request, res: Response): Promise<void> => {
  try {
    const filter: any = {};

    // Agency scoping
    if (req.user?.role === 'agency_admin') {
      filter.agency_id = req.user.agencyId;
    } else if (req.query.agency_id) {
      filter.agency_id = req.query.agency_id;
    }

    if (req.query.watchman_id) {
      filter.watchman_id = req.query.watchman_id;
    }

    if (req.query.category && req.query.category !== 'all') {
      filter.category = req.query.category;
    }

    if (req.query.type && req.query.type !== 'all') {
      filter.type = req.query.type;
    }

    if (req.query.startDate || req.query.endDate) {
      filter.date = {};
      if (req.query.startDate) {
        filter.date.$gte = new Date(req.query.startDate as string);
      }
      if (req.query.endDate) {
        const end = new Date(req.query.endDate as string);
        end.setHours(23, 59, 59, 999);
        filter.date.$lte = end;
      }
    }

    const expenses = await Expense.find(filter)
      .populate('watchman_id', 'full_name employee_id phone monthly_wage daily_wage')
      .populate('agency_id', 'name')
      .sort({ date: -1, createdAt: -1 })
      .lean();

    // Summary aggregates
    let totalDeductions = 0;
    let totalEarnings = 0;
    let clothesTotal = 0;
    let foodTotal = 0;
    let advanceTotal = 0;

    expenses.forEach((item: any) => {
      const amt = Number(item.amount) || 0;
      if (item.type === 'deduction') {
        totalDeductions += amt;
        if (item.category === 'clothes') clothesTotal += amt;
        if (item.category === 'food') foodTotal += amt;
        if (item.category === 'advance') advanceTotal += amt;
      } else {
        totalEarnings += amt;
      }
    });

    res.json({
      success: true,
      data: {
        expenses,
        summary: {
          totalCount: expenses.length,
          totalDeductions,
          totalEarnings,
          clothesTotal,
          foodTotal,
          advanceTotal,
        },
      },
    });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message || 'Failed to fetch expenses' });
  }
});

/**
 * POST /api/expenses
 * Add a new expense / deduction / wage adjustment
 */
router.post('/', async (req: Request, res: Response): Promise<void> => {
  try {
    const {
      watchman_id,
      category,
      type = 'deduction',
      title,
      amount,
      date,
      notes,
      updateWatchmanMonthlyWage,
      updateWatchmanDailyWage,
    } = req.body;

    if (!watchman_id || !title || amount === undefined || amount === null) {
      res.status(400).json({ success: false, message: 'Watchman, title, and amount are required' });
      return;
    }

    const watchman = await Watchman.findById(watchman_id);
    if (!watchman) {
      res.status(404).json({ success: false, message: 'Watchman not found' });
      return;
    }

    // Verify agency permission
    if (req.user?.role === 'agency_admin' && watchman.agency_id.toString() !== req.user.agencyId) {
      res.status(403).json({ success: false, message: 'Access denied: watchman belongs to another agency' });
      return;
    }

    const expense = await Expense.create({
      agency_id: watchman.agency_id,
      watchman_id: watchman._id,
      category: category || 'other',
      type: type || 'deduction',
      title: title.trim(),
      amount: Math.abs(Number(amount)),
      date: date ? new Date(date) : new Date(),
      notes: notes?.trim(),
      created_by: req.user?.userId ? new mongoose.Types.ObjectId(req.user.userId) : undefined,
    });

    // If marked or category is monthly_wage or daily_wage, update watchman base wage
    if (category === 'monthly_wage' || updateWatchmanMonthlyWage) {
      const amt = Math.abs(Number(amount));
      watchman.monthly_wage = amt;
      watchman.daily_wage = Math.round(amt / 30);
      await watchman.save();
    } else if (category === 'daily_wage' || updateWatchmanDailyWage) {
      const amt = Math.abs(Number(amount));
      watchman.daily_wage = amt;
      watchman.monthly_wage = amt * 30;
      await watchman.save();
    }

    const populated = await Expense.findById(expense._id)
      .populate('watchman_id', 'full_name employee_id phone monthly_wage daily_wage')
      .populate('agency_id', 'name')
      .lean();

    res.status(201).json({
      success: true,
      message: 'Expense recorded successfully',
      data: populated,
    });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message || 'Failed to create expense' });
  }
});

/**
 * PATCH /api/expenses/watchman/:id/wage
 * Update a watchman's default wage rate (monthly or daily)
 */
router.patch('/watchman/:id/wage', async (req: Request, res: Response): Promise<void> => {
  try {
    const { monthly_wage, daily_wage, wage } = req.body;
    if (
      (monthly_wage === undefined || monthly_wage < 0) &&
      (daily_wage === undefined || daily_wage < 0) &&
      (wage === undefined || wage < 0)
    ) {
      res.status(400).json({ success: false, message: 'Valid wage amount is required' });
      return;
    }

    const watchman = await Watchman.findById(req.params.id);
    if (!watchman) {
      res.status(404).json({ success: false, message: 'Watchman not found' });
      return;
    }

    if (req.user?.role === 'agency_admin' && watchman.agency_id.toString() !== req.user.agencyId) {
      res.status(403).json({ success: false, message: 'Access denied' });
      return;
    }

    if (monthly_wage !== undefined && monthly_wage >= 0) {
      watchman.monthly_wage = Number(monthly_wage);
      watchman.daily_wage = Math.round(Number(monthly_wage) / 30);
    } else if (daily_wage !== undefined && daily_wage >= 0) {
      watchman.daily_wage = Number(daily_wage);
      watchman.monthly_wage = Number(daily_wage) * 30;
    } else if (wage !== undefined && wage >= 0) {
      const val = Number(wage);
      if (val > 2000) {
        watchman.monthly_wage = val;
        watchman.daily_wage = Math.round(val / 30);
      } else {
        watchman.daily_wage = val;
        watchman.monthly_wage = val * 30;
      }
    }
    await watchman.save();

    res.json({
      success: true,
      message: 'Wage updated successfully',
      data: {
        id: watchman._id,
        monthly_wage: watchman.monthly_wage,
        daily_wage: watchman.daily_wage,
      },
    });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message || 'Failed to update wage' });
  }
});

/**
 * DELETE /api/expenses/:id
 * Delete an expense entry
 */
router.delete('/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const expense = await Expense.findById(req.params.id);
    if (!expense) {
      res.status(404).json({ success: false, message: 'Expense not found' });
      return;
    }

    if (req.user?.role === 'agency_admin' && expense.agency_id.toString() !== req.user.agencyId) {
      res.status(403).json({ success: false, message: 'Access denied' });
      return;
    }

    await expense.deleteOne();
    res.json({ success: true, message: 'Expense deleted successfully' });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message || 'Failed to delete expense' });
  }
});

/**
 * GET /api/expenses/salary-slip
 * Generate salary slip for a watchman over a date range:
 * - Shows exact present dates
 * - Calculates earned wage based on present dates * daily wage
 * - Subtracts itemized agency expenses (clothes, eating/food, advances, etc.)
 */
router.get('/salary-slip', async (req: Request, res: Response): Promise<void> => {
  try {
    const { watchman_id, startDate, endDate, monthlyWageOverride, dailyWageOverride } = req.query;

    if (!watchman_id) {
      res.status(400).json({ success: false, message: 'watchman_id is required' });
      return;
    }

    const watchman = await Watchman.findById(watchman_id)
      .populate('agency_id', 'name email phone address logo_url')
      .lean();

    if (!watchman) {
      res.status(404).json({ success: false, message: 'Watchman not found' });
      return;
    }

    const agencyIdStr = (watchman.agency_id as any)?._id?.toString() || watchman.agency_id?.toString();
    if (req.user?.role === 'agency_admin' && agencyIdStr !== req.user.agencyId) {
      res.status(403).json({ success: false, message: 'Access denied: watchman belongs to another agency' });
      return;
    }

    // Determine Date Range
    let start: Date;
    let end: Date;

    if (startDate) {
      start = new Date(startDate as string);
      start.setHours(0, 0, 0, 0);
    } else {
      // Default to 1st of current month
      const now = new Date();
      start = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
    }

    if (endDate) {
      end = new Date(endDate as string);
      end.setHours(23, 59, 59, 999);
    } else {
      // Default to today end of day
      end = new Date();
      end.setHours(23, 59, 59, 999);
    }

    // Total calendar days in range
    const diffTime = Math.abs(end.getTime() - start.getTime());
    const totalDaysInRange = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    // 1. Fetch attendance records for this watchman where status is present or late
    const attendanceRecords = await Attendance.find({
      watchman_id: watchman._id,
      attendance_date: { $gte: start, $lte: end },
      status: { $in: ['present', 'late'] },
    })
      .populate('society_id', 'name address')
      .populate('shift_id', 'name start_time end_time')
      .sort({ attendance_date: 1 })
      .lean();

    // Group by unique calendar date (YYYY-MM-DD)
    const presentDatesMap = new Map<string, any>();

    attendanceRecords.forEach((att: any) => {
      const d = new Date(att.attendance_date);
      const dateKey = d.toISOString().split('T')[0];

      if (!presentDatesMap.has(dateKey)) {
        const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
        const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        const formatted = `${d.getDate().toString().padStart(2, '0')} ${monthNames[d.getMonth()]} ${d.getFullYear()} (${dayNames[d.getDay()]})`;

        presentDatesMap.set(dateKey, {
          date: dateKey,
          formattedDate: formatted,
          day: d.getDate(),
          dayOfWeek: dayNames[d.getDay()],
          societyName: att.society_id?.name || 'Assigned Society',
          shiftName: att.shift_id?.name || 'Regular Shift',
          checkInTime: att.check_in_time ? new Date(att.check_in_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Verified',
          checkOutTime: att.check_out_time ? new Date(att.check_out_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Active',
          durationMinutes: att.duration_minutes || null,
          status: att.status,
          verificationStatus: att.verification_status,
        });
      }
    });

    const presentDates = Array.from(presentDatesMap.values()).sort((a, b) => a.date.localeCompare(b.date));
    const presentDaysCount = presentDates.length;
    const absentDaysCount = Math.max(0, totalDaysInRange - presentDaysCount);

    // 2. Fetch expenses / deductions for this watchman during this date range
    const expenses = await Expense.find({
      watchman_id: watchman._id,
      date: { $gte: start, $lte: end },
    })
      .sort({ date: 1 })
      .lean();

    // Categorize expenses
    let clothesTotal = 0;
    let foodTotal = 0;
    let advanceTotal = 0;
    let travelTotal = 0;
    let medicalTotal = 0;
    let otherDeductionsTotal = 0;
    let totalAllowances = 0;

    const itemizedDeductions: any[] = [];
    const itemizedEarnings: any[] = [];

    expenses.forEach((item: any) => {
      const amt = Number(item.amount) || 0;
      if (item.type === 'deduction') {
        if (item.category === 'clothes') clothesTotal += amt;
        else if (item.category === 'food') foodTotal += amt;
        else if (item.category === 'advance') advanceTotal += amt;
        else if (item.category === 'travel') travelTotal += amt;
        else if (item.category === 'medical') medicalTotal += amt;
        else otherDeductionsTotal += amt;

        itemizedDeductions.push({
          id: item._id,
          category: item.category,
          title: item.title,
          amount: amt,
          date: item.date,
          notes: item.notes,
        });
      } else {
        totalAllowances += amt;
        itemizedEarnings.push({
          id: item._id,
          category: item.category,
          title: item.title,
          amount: amt,
          date: item.date,
          notes: item.notes,
        });
      }
    });

    const totalDeductions = clothesTotal + foodTotal + advanceTotal + travelTotal + medicalTotal + otherDeductionsTotal;

    // 3. Compute Salary Calculations based on Monthly Wage
    let baseMonthlyWage: number;
    if (monthlyWageOverride !== undefined && monthlyWageOverride !== '') {
      baseMonthlyWage = Math.abs(Number(monthlyWageOverride));
    } else if (dailyWageOverride !== undefined && dailyWageOverride !== '') {
      baseMonthlyWage = Math.abs(Number(dailyWageOverride)) * 30;
    } else if (watchman.monthly_wage && watchman.monthly_wage > 0) {
      baseMonthlyWage = watchman.monthly_wage;
    } else if (watchman.daily_wage && watchman.daily_wage > 0) {
      baseMonthlyWage = watchman.daily_wage > 2000 ? watchman.daily_wage : watchman.daily_wage * 30;
    } else {
      baseMonthlyWage = 15000;
    }

    const effectiveDailyRate = totalDaysInRange > 0
      ? Math.round((baseMonthlyWage / totalDaysInRange) * 100) / 100
      : Math.round((baseMonthlyWage / 30) * 100) / 100;

    const earnedBasicWage = totalDaysInRange > 0
      ? Math.round((baseMonthlyWage / totalDaysInRange) * presentDaysCount)
      : Math.round(presentDaysCount * (baseMonthlyWage / 30));

    const grossSalary = earnedBasicWage + totalAllowances;
    const netSalary = Math.max(0, grossSalary - totalDeductions);

    // Fetch active assignment for designated society
    const assignment = await Assignment.findOne({
      watchman_id: watchman._id,
      status: 'active',
    })
      .populate('society_id', 'name address')
      .populate('shift_id', 'name start_time end_time')
      .lean();

    // Check if current period has a salary hold record
    const startMonth = start.getMonth() + 1;
    const startYear = start.getFullYear();

    const currentHold = await SalaryHold.findOne({
      watchman_id: watchman._id,
      $or: [
        { startDate: { $lte: end }, endDate: { $gte: start } },
        { month: startMonth, year: startYear },
      ],
    }).lean();

    // Query any pending held salaries from prior months
    const priorPendingHolds = await SalaryHold.find({
      watchman_id: watchman._id,
      status: 'held',
      _id: { $ne: currentHold?._id },
    })
      .sort({ startDate: 1 })
      .lean();

    const totalPendingHeldArrears = priorPendingHolds.reduce((sum: number, h: any) => sum + (h.netSalary || 0), 0);

    res.json({
      success: true,
      data: {
        watchman: {
          id: watchman._id,
          employee_id: watchman.employee_id,
          full_name: watchman.full_name,
          phone: watchman.phone,
          monthly_wage: baseMonthlyWage,
          daily_wage: Math.round(effectiveDailyRate),
          joining_date: watchman.joining_date,
        },
        agency: watchman.agency_id,
        society: assignment?.society_id || null,
        shift: assignment?.shift_id || null,
        period: {
          startDate: start.toISOString().split('T')[0],
          endDate: end.toISOString().split('T')[0],
          totalDaysInRange,
        },
        attendanceSummary: {
          totalDays: totalDaysInRange,
          presentDaysCount,
          absentDaysCount,
          attendanceRate: totalDaysInRange > 0 ? Math.round((presentDaysCount / totalDaysInRange) * 100) : 0,
        },
        presentDates, // Explicitly list all present dates!
        financials: {
          monthlyWageRate: baseMonthlyWage,
          effectiveDailyRate,
          dailyWageRate: Math.round(effectiveDailyRate),
          earnedBasicWage,
          totalAllowances,
          grossSalary,
          deductions: {
            clothesTotal,
            foodTotal,
            advanceTotal,
            travelTotal,
            medicalTotal,
            otherDeductionsTotal,
            totalDeductions,
            items: itemizedDeductions,
          },
          earnings: {
            basicWage: earnedBasicWage,
            totalAllowances,
            items: itemizedEarnings,
          },
          netSalary,
        },
        holdStatus: currentHold
          ? {
              id: currentHold._id,
              status: currentHold.status,
              holdReason: currentHold.holdReason,
              heldAt: currentHold.heldAt,
              releasedAt: currentHold.releasedAt,
              paymentMode: currentHold.paymentMode,
              releaseNotes: currentHold.releaseNotes,
              periodLabel: currentHold.periodLabel,
            }
          : null,
        priorPendingHolds: priorPendingHolds.map((h: any) => ({
          id: h._id,
          periodLabel: h.periodLabel,
          month: h.month,
          year: h.year,
          startDate: h.startDate,
          endDate: h.endDate,
          dutyDays: h.dutyDays,
          netSalary: h.netSalary,
          holdReason: h.holdReason,
          heldAt: h.heldAt,
        })),
        totalPendingHeldArrears,
      },
    });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message || 'Failed to generate salary slip' });
  }
});

/**
 * GET /api/expenses/salary-holds
 * List all salary hold records for a watchman or across the agency
 */
router.get('/salary-holds', async (req: Request, res: Response): Promise<void> => {
  try {
    const filter: any = {};

    if (req.user?.role === 'agency_admin') {
      filter.agency_id = req.user.agencyId;
    } else if (req.query.agency_id) {
      filter.agency_id = req.query.agency_id;
    }

    if (req.query.watchman_id) {
      filter.watchman_id = req.query.watchman_id;
    }

    if (req.query.status) {
      filter.status = req.query.status;
    }

    const holds = await SalaryHold.find(filter)
      .populate('watchman_id', 'full_name employee_id phone')
      .populate('heldBy', 'name email')
      .populate('releasedBy', 'name email')
      .sort({ createdAt: -1 })
      .lean();

    let totalHeldAmount = 0;
    let heldCount = 0;
    let releasedCount = 0;

    holds.forEach((h: any) => {
      if (h.status === 'held') {
        totalHeldAmount += h.netSalary || 0;
        heldCount += 1;
      } else {
        releasedCount += 1;
      }
    });

    res.json({
      success: true,
      data: {
        holds,
        summary: {
          totalHeldAmount,
          heldCount,
          releasedCount,
          totalCount: holds.length,
        },
      },
    });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message || 'Failed to fetch salary holds' });
  }
});

/**
 * POST /api/expenses/salary-hold
 * Place a watchman's monthly salary on hold (e.g. guard out of town without collecting salary)
 */
router.post('/salary-hold', async (req: Request, res: Response): Promise<void> => {
  try {
    const {
      watchman_id,
      startDate,
      endDate,
      dutyDays,
      grossSalary,
      deductions,
      netSalary,
      holdReason,
    } = req.body;

    if (!watchman_id) {
      res.status(400).json({ success: false, message: 'watchman_id is required' });
      return;
    }

    const watchman = await Watchman.findById(watchman_id).lean();
    if (!watchman) {
      res.status(404).json({ success: false, message: 'Watchman not found' });
      return;
    }

    const agencyId = (watchman.agency_id as any)?._id || watchman.agency_id;
    if (req.user?.role === 'agency_admin' && agencyId.toString() !== req.user.agencyId) {
      res.status(403).json({ success: false, message: 'Access denied' });
      return;
    }

    const start = startDate ? new Date(startDate) : new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    const end = endDate ? new Date(endDate) : new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0);

    const month = start.getMonth() + 1;
    const year = start.getFullYear();
    const monthName = start.toLocaleString('en-IN', { month: 'long' });
    const periodLabel = `${monthName} ${year}`;

    // Check if hold record already exists for this period
    let hold = await SalaryHold.findOne({
      watchman_id: watchman._id,
      month,
      year,
    });

    if (hold) {
      hold.dutyDays = dutyDays !== undefined ? Number(dutyDays) : hold.dutyDays;
      hold.grossSalary = grossSalary !== undefined ? Number(grossSalary) : hold.grossSalary;
      hold.deductions = deductions !== undefined ? Number(deductions) : hold.deductions;
      hold.netSalary = netSalary !== undefined ? Number(netSalary) : hold.netSalary;
      hold.status = 'held';
      hold.holdReason = holdReason?.trim() || hold.holdReason || 'Guard left for other city without collecting salary';
      hold.heldAt = new Date();
      hold.heldBy = req.user?.userId ? new mongoose.Types.ObjectId(req.user.userId) : undefined;
      hold.releasedAt = undefined;
      hold.releasedBy = undefined;
      hold.releaseNotes = undefined;
      await hold.save();
    } else {
      hold = await SalaryHold.create({
        agency_id: agencyId,
        watchman_id: watchman._id,
        month,
        year,
        startDate: start,
        endDate: end,
        periodLabel,
        dutyDays: Number(dutyDays) || 0,
        grossSalary: Number(grossSalary) || 0,
        deductions: Number(deductions) || 0,
        netSalary: Number(netSalary) || 0,
        status: 'held',
        holdReason: holdReason?.trim() || 'Guard left for other city without collecting salary',
        heldAt: new Date(),
        heldBy: req.user?.userId ? new mongoose.Types.ObjectId(req.user.userId) : undefined,
      });
    }

    res.json({
      success: true,
      data: hold,
      message: `Salary for ${periodLabel} placed on hold successfully.`,
    });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message || 'Failed to place salary on hold' });
  }
});

/**
 * PUT /api/expenses/salary-hold/:id/release
 * Release and pay out a held salary to the guard upon return
 */
router.put('/salary-hold/:id/release', async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { paymentMode, releaseNotes, releaseDate } = req.body;

    const hold = await SalaryHold.findById(id);
    if (!hold) {
      res.status(404).json({ success: false, message: 'Salary hold record not found' });
      return;
    }

    if (req.user?.role === 'agency_admin' && hold.agency_id.toString() !== req.user.agencyId) {
      res.status(403).json({ success: false, message: 'Access denied' });
      return;
    }

    hold.status = 'released';
    hold.releasedAt = releaseDate ? new Date(releaseDate) : new Date();
    hold.releasedBy = req.user?.userId ? new mongoose.Types.ObjectId(req.user.userId) : undefined;
    hold.paymentMode = paymentMode || 'cash';
    hold.releaseNotes = releaseNotes?.trim() || 'Guard returned and collected pending salary in full';
    await hold.save();

    res.json({
      success: true,
      data: hold,
      message: `Held salary of ₹${hold.netSalary.toLocaleString('en-IN')} for ${hold.periodLabel} released and disbursed successfully!`,
    });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message || 'Failed to release salary hold' });
  }
});

/**
 * PUT /api/expenses/salary-hold/:id/re-hold
 * Put an already released salary back on hold (e.g. guard left again or released by mistake)
 */
router.put('/salary-hold/:id/re-hold', async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { holdReason } = req.body;

    const hold = await SalaryHold.findById(id);
    if (!hold) {
      res.status(404).json({ success: false, message: 'Salary hold record not found' });
      return;
    }

    if (req.user?.role === 'agency_admin' && hold.agency_id.toString() !== req.user.agencyId) {
      res.status(403).json({ success: false, message: 'Access denied' });
      return;
    }

    hold.status = 'held';
    hold.holdReason = holdReason?.trim() || 'Salary placed back on hold (guard left again or payment reverted)';
    hold.heldAt = new Date();
    hold.heldBy = req.user?.userId ? new mongoose.Types.ObjectId(req.user.userId) : undefined;
    hold.releasedAt = undefined;
    hold.releasedBy = undefined;
    hold.releaseNotes = undefined;
    hold.paymentMode = undefined;
    await hold.save();

    res.json({
      success: true,
      data: hold,
      message: `Salary for ${hold.periodLabel} placed back on hold successfully.`,
    });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message || 'Failed to place salary back on hold' });
  }
});

/**
 * DELETE /api/expenses/salary-hold/:id
 * Remove or cancel a salary hold
 */
router.delete('/salary-hold/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const hold = await SalaryHold.findById(id);
    if (!hold) {
      res.status(404).json({ success: false, message: 'Salary hold record not found' });
      return;
    }

    if (req.user?.role === 'agency_admin' && hold.agency_id.toString() !== req.user.agencyId) {
      res.status(403).json({ success: false, message: 'Access denied' });
      return;
    }

    await SalaryHold.findByIdAndDelete(id);

    res.json({
      success: true,
      message: 'Salary hold record removed successfully',
    });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message || 'Failed to remove salary hold' });
  }
});

export default router;
