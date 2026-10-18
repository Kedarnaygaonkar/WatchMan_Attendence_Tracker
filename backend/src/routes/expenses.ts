import { Router, Request, Response } from 'express';
import mongoose from 'mongoose';
import { Expense, ExpenseCategory, ExpenseType } from '../models/Expense';
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
      .populate('watchman_id', 'full_name employee_id phone daily_wage')
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

    // If marked or category is daily_wage, update watchman base daily wage
    if (category === 'daily_wage' || updateWatchmanDailyWage) {
      watchman.daily_wage = Math.abs(Number(amount));
      await watchman.save();
    }

    const populated = await Expense.findById(expense._id)
      .populate('watchman_id', 'full_name employee_id phone daily_wage')
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
 * Update a watchman's default daily wage rate
 */
router.patch('/watchman/:id/wage', async (req: Request, res: Response): Promise<void> => {
  try {
    const { daily_wage } = req.body;
    if (daily_wage === undefined || daily_wage < 0) {
      res.status(400).json({ success: false, message: 'Valid daily wage amount is required' });
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

    watchman.daily_wage = Number(daily_wage);
    await watchman.save();

    res.json({
      success: true,
      message: 'Daily wage updated successfully',
      data: { id: watchman._id, daily_wage: watchman.daily_wage },
    });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message || 'Failed to update daily wage' });
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
    const { watchman_id, startDate, endDate, dailyWageOverride } = req.query;

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

    // 3. Compute Salary Calculations
    const dailyWageRate = dailyWageOverride !== undefined && dailyWageOverride !== ''
      ? Math.abs(Number(dailyWageOverride))
      : (watchman.daily_wage || 500);

    const earnedBasicWage = presentDaysCount * dailyWageRate;
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

    res.json({
      success: true,
      data: {
        watchman: {
          id: watchman._id,
          employee_id: watchman.employee_id,
          full_name: watchman.full_name,
          phone: watchman.phone,
          daily_wage: dailyWageRate,
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
          dailyWageRate,
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
      },
    });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message || 'Failed to generate salary slip' });
  }
});

export default router;
