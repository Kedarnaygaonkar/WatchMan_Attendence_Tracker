import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';
import crypto from 'crypto';
import {
  User, Agency, Society, Watchman, Shift,
  Gate, Assignment, Attendance, Expense,
} from '../models';

dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/watchman_tracker';

// ─── Helper ─────────────────────────────────────────────────────────────────
function rnd(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}
function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

// ─── Watchmen seed data ──────────────────────────────────────────────────────
const WATCHMEN_LIST = [
  { name: 'Ramesh Kumar',      phone: '+91 9823000101', wage: 620 },
  { name: 'Suresh Patil',      phone: '+91 9823000102', wage: 560 },
  { name: 'Rajesh Sharma',     phone: '+91 9823000103', wage: 510 },
  { name: 'Sunil Jadhav',      phone: '+91 9823000104', wage: 650 },
  { name: 'Manoj Shinde',      phone: '+91 9823000105', wage: 550 },
  { name: 'Anil Deshmukh',     phone: '+91 9823000106', wage: 500 },
  { name: 'Vijay Pawar',       phone: '+91 9823000107', wage: 600 },
  { name: 'Santosh Kadam',     phone: '+91 9823000108', wage: 540 },
  { name: 'Ganesh Gaikwad',    phone: '+91 9823000109', wage: 510 },
  { name: 'Mahendra Chavan',   phone: '+91 9823000110', wage: 660 },
  { name: 'Ashok More',        phone: '+91 9823000111', wage: 555 },
  { name: 'Deepak Bhosale',    phone: '+91 9823000112', wage: 505 },
  { name: 'Prakash Jagtap',    phone: '+91 9823000113', wage: 605 },
  { name: 'Sanjay Sawant',     phone: '+91 9823000114', wage: 560 },
  { name: 'Sachin Kamble',     phone: '+91 9823000115', wage: 600 },
  { name: 'Nitin Mane',        phone: '+91 9823000116', wage: 520 },
  { name: 'Rajan Thosar',      phone: '+91 9823000117', wage: 580 },
  { name: 'Vishal Nalawade',   phone: '+91 9823000118', wage: 540 },
  { name: 'Kiran Salunkhe',    phone: '+91 9823000119', wage: 600 },
  { name: 'Pravin Bhor',       phone: '+91 9823000120', wage: 520 },
  { name: 'Sandip Waghmare',   phone: '+91 9823000121', wage: 510 },
  { name: 'Rohit Dhole',       phone: '+91 9823000122', wage: 570 },
  { name: 'Amol Koli',         phone: '+91 9823000123', wage: 530 },
  { name: 'Dinesh Yadav',      phone: '+91 9823000124', wage: 590 },
  { name: 'Ganpat Vhatkar',    phone: '+91 9823000125', wage: 510 },
  { name: 'Mohan Lokhande',    phone: '+91 9823000126', wage: 560 },
  { name: 'Bhushan Mote',      phone: '+91 9823000127', wage: 545 },
  { name: 'Harish Bansode',    phone: '+91 9823000128', wage: 620 },
  { name: 'Tukaram Shengal',   phone: '+91 9823000129', wage: 500 },
  { name: 'Santosh Wagh',      phone: '+91 9823000130', wage: 610 },
  { name: 'Prashant Thorat',   phone: '+91 9823000131', wage: 530 },
  { name: 'Yogesh Parab',      phone: '+91 9823000132', wage: 580 },
  { name: 'Govind Suryavanshi',phone: '+91 9823000133', wage: 515 },
  { name: 'Rajendra Kshirsagar',phone: '+91 9823000134', wage: 620 },
  { name: 'Laxman Dhangar',    phone: '+91 9823000135', wage: 490 },
  { name: 'Nandkumar Raut',    phone: '+91 9823000136', wage: 605 },
];

// ─── Societies configuration ─────────────────────────────────────────────────
const SOCIETIES = [
  {
    name: 'demo1',
    address: 'Plot 12, Baner Main Road, Baner, Pune - 411045',
    lat: 18.5590, lng: 73.7868,
    wings: ['Wing A', 'Wing B', 'Wing C'],
    gates: ['Main Gate', 'Rear Gate'],
    contact: 'Mr. Desai',   phone: '+91 9822011111',
    requiredGuards: 7,
  },
  {
    name: 'demo2',
    address: 'Survey 45, Hinjewadi Phase 1, Pune - 411057',
    lat: 18.5913, lng: 73.7389,
    wings: ['Tower 1', 'Tower 2', 'Tower 3'],
    gates: ['Main Gate', 'Service Gate'],
    contact: 'Mr. Kulkarni', phone: '+91 9822022222',
    requiredGuards: 8,
  },
  {
    name: 'demo3',
    address: 'Bavdhan Hills, Kothrud Link Road, Pune - 411038',
    lat: 18.5089, lng: 73.7750,
    wings: ['Block A', 'Block B'],
    gates: ['Main Gate'],
    contact: 'Mr. Joshi',  phone: '+91 9822033333',
    requiredGuards: 6,
  },
  {
    name: 'Bhalchandra Vihar',
    address: 'Bhalchandra Vihar, Ravet / Chinchwad, Pune - 412101, Maharashtra',
    lat: 18.6551174, lng: 73.7451555,
    wings: ['A', 'B', 'C', 'M1M2'],
    gates: ['In(Main)Gate', 'OutGate(Main)', 'OutGate(SB School)'],
    contact: 'Mr. Bhalchandra Joshi', phone: '+91 9822044444',
    requiredGuards: 8,
  },
  {
    name: 'Perfect Society',
    address: 'Perfect Society, Wakad, Pune - 411057',
    lat: 18.5990, lng: 73.7613,
    wings: ['East Wing', 'West Wing'],
    gates: ['Main Gate', 'North Gate'],
    contact: 'Mrs. Kulkarni', phone: '+91 9822055555',
    requiredGuards: 7,
  },
];

async function seed() {
  try {
    console.log('🚀 Connecting to MongoDB...');
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected!\n');

    // ─── 1. Agency ───────────────────────────────────────────────────────────
    const agencyEmail = 'alertspace@gmail.com';
    let agency = await Agency.findOne({ email: agencyEmail });
    if (agency) {
      // Clean existing data for this agency first
      const agencyId = agency._id;
      const existingWatchmen = await Watchman.find({ agency_id: agencyId });
      const wIds = existingWatchmen.map(w => w._id);
      await Attendance.deleteMany({ agency_id: agencyId });
      await Expense.deleteMany({ agency_id: agencyId });
      await Assignment.deleteMany({ agency_id: agencyId });
      await Watchman.deleteMany({ agency_id: agencyId });
      await User.deleteMany({ agency_id: agencyId, role: { $in: ['watchman', 'agency_admin'] } });
      await Gate.deleteMany({ agency_id: agencyId });
      await Society.deleteMany({ agency_id: agencyId });
      console.log(`🧹 Cleaned previous data for Alert Space agency (${wIds.length} watchmen wiped)`);
    }

    if (!agency) {
      agency = await Agency.create({
        name: 'Alert Space',
        email: agencyEmail,
        phone: '+91 9876541234',
        address: 'Shivajinagar, Pune - 411005, Maharashtra',
        logo_url: 'https://ui-avatars.com/api/?name=Alert+Space&background=6366f1&color=fff&size=200&bold=true&rounded=true',
        status: 'active',
      });
      console.log('✅ Created "Alert Space" agency');
    } else {
      agency.name = 'Alert Space';
      agency.phone = '+91 9876541234';
      agency.address = 'Shivajinagar, Pune - 411005, Maharashtra';
      agency.logo_url = 'https://ui-avatars.com/api/?name=Alert+Space&background=6366f1&color=fff&size=200&bold=true&rounded=true';
      agency.status = 'active';
      await agency.save();
      console.log('ℹ️ Updated "Alert Space" agency');
    }

    const agencyId = agency._id;

    // ─── 2. Agency Admin User ────────────────────────────────────────────────
    const adminPwd = await bcrypt.hash('Admin@123', 10);
    const existingAdmin = await User.findOne({ email: agencyEmail });
    if (!existingAdmin) {
      await User.create({
        agency_id: agencyId,
        email: agencyEmail,
        password_hash: adminPwd,
        role: 'agency_admin',
        name: 'Alert Space Admin',
        phone: '+91 9876541234',
        is_active: true,
      });
      console.log('✅ Agency Admin: alertspace@gmail.com / Admin@123');
    }

    // ─── 3. Shifts ───────────────────────────────────────────────────────────
    const dayShift = await Shift.create({
      agency_id: agencyId, name: 'Day Shift', shift_type: 'day',
      start_time: '08:00', end_time: '20:00', duration_hours: 12,
      is_overnight: false, late_threshold_minutes: 15, is_active: true,
    });
    const nightShift = await Shift.create({
      agency_id: agencyId, name: 'Night Shift', shift_type: 'night',
      start_time: '20:00', end_time: '08:00', duration_hours: 12,
      is_overnight: true, late_threshold_minutes: 15, is_active: true,
    });
    console.log('✅ Day & Night Shifts created');

    // ─── 4. Societies + Gates ────────────────────────────────────────────────
    const societies: any[] = [];
    for (const sd of SOCIETIES) {
      const soc = await Society.create({
        agency_id: agencyId,
        name: sd.name, address: sd.address,
        latitude: sd.lat, longitude: sd.lng,
        geofence_radius: 120, required_guards: sd.requiredGuards,
        contact_person: sd.contact, contact_phone: sd.phone,
        wings: sd.wings, gates: sd.gates,
        is_active: true,
      });
      societies.push({ soc, sd });

      for (const g of sd.gates) {
        await Gate.create({
          agency_id: agencyId, society_id: soc._id,
          name: g, qr_token: crypto.randomUUID(), is_active: true,
        });
      }
    }
    console.log(`✅ Created ${societies.length} societies with gates`);

    // ─── 5. Watchmen + Assignments ───────────────────────────────────────────
    const guardPwd = await bcrypt.hash('Guard@123', 10);
    const createdGuards: any[] = [];

    // Distribute ~36 guards across 5 societies (7-8 each)
    const DIST = [7, 8, 7, 7, 7]; // per society

    let guardIdx = 0;
    for (let si = 0; si < societies.length; si++) {
      const { soc, sd } = societies[si];
      const count = DIST[si];

      for (let ci = 0; ci < count; ci++) {
        const wData = WATCHMEN_LIST[guardIdx % WATCHMEN_LIST.length];
        const empId = `AS-${String(guardIdx + 1).padStart(3, '0')}`;
        const email = `guard.as${String(guardIdx + 1).padStart(3, '0')}@alertspace.in`;
        const shift = ci % 2 === 0 ? dayShift : nightShift;
        const wing = sd.wings[ci % sd.wings.length];
        const gate = sd.gates[ci % sd.gates.length];

        const userDoc = await User.create({
          agency_id: agencyId, email,
          password_hash: guardPwd,
          role: 'watchman',
          name: wData.name,
          phone: wData.phone,
          is_active: true,
        });

        const watchman = await Watchman.create({
          agency_id: agencyId, user_id: userDoc._id,
          employee_id: empId, full_name: wData.name,
          phone: wData.phone, emergency_contact: '+91 9988776655',
          address: 'Pune, Maharashtra',
          joining_date: new Date('2026-06-01'),
          wing, daily_wage: wData.wage,
          status: 'active',
        });

        await Assignment.create({
          agency_id: agencyId,
          watchman_id: watchman._id,
          society_id: soc._id,
          shift_id: shift._id,
          start_date: new Date('2026-09-01'),
          is_active: true,
          notes: `Assigned to ${soc.name} – ${wing}`,
        });

        createdGuards.push({ watchman, soc, sd, shift, wing, gate, wage: wData.wage });
        guardIdx++;
      }
    }

    console.log(`✅ Created ${createdGuards.length} watchmen with assignments`);

    // ─── 6. Attendance — Oct 1–22, 2026 ─────────────────────────────────────
    const YEAR = 2026, MONTH_IDX = 9; // Oct (0-indexed)
    const TODAY_DAY = 22;

    const attBatch: any[] = [];
    const SEEN = new Set<string>(); // prevent dupe key: watchman_id + date + shift

    for (let day = 1; day <= TODAY_DAY; day++) {
      const dayDate = new Date(Date.UTC(YEAR, MONTH_IDX, day));

      for (let gi = 0; gi < createdGuards.length; gi++) {
        const { watchman, soc, sd, shift, wing, gate, wage } = createdGuards[gi];

        // ~2 rest days per guard (different per guard so rosters stagger)
        if ((day + gi * 3) % 9 === 0) continue;

        // 85% present, 15% late
        const isLate = (day * 7 + gi * 3) % 11 === 0;
        const status = isLate ? 'late' : 'present';

        const checkInHour = shift.shift_type === 'night'
          ? (isLate ? 20 : 19) : (isLate ? 8 : 7);
        const checkInMin = isLate ? 22 : 48;

        const checkIn = new Date(Date.UTC(YEAR, MONTH_IDX, day, checkInHour, checkInMin, 0));
        const checkOut = new Date(checkIn.getTime() + 12 * 3600000);

        // Dedup key
        const key = `${watchman._id}|${dayDate.toISOString().split('T')[0]}|${shift._id}`;
        if (SEEN.has(key)) continue;
        SEEN.add(key);

        attBatch.push({
          agency_id: agencyId,
          watchman_id: watchman._id,
          society_id: soc._id,
          shift_id: shift._id,
          attendance_date: dayDate,
          check_in_time: checkIn,
          check_out_time: checkOut,
          duration_minutes: 720,
          latitude: sd.lat + (Math.random() - 0.5) * 0.0003,
          longitude: sd.lng + (Math.random() - 0.5) * 0.0003,
          gps_accuracy: rnd(5, 20),
          distance_from_society: rnd(8, 40),
          status,
          verification_status: 'verified',
          gps_flags: [],
          selected_wing: wing,
          selected_gate: gate,
          is_offline_sync: false,
        });
      }
    }

    await Attendance.insertMany(attBatch);
    console.log(`✅ Inserted ${attBatch.length} attendance records (Oct 1–22, 2026)`);

    // ─── 7. Expenses ─────────────────────────────────────────────────────────
    const expBatch: any[] = [];

    for (const { watchman } of createdGuards) {
      // Oct 2 — Uniform
      expBatch.push({
        agency_id: agencyId, watchman_id: watchman._id,
        category: 'clothes', type: 'deduction',
        title: 'Security Uniform Set (2 Pairs) & Belt',
        amount: rnd(800, 1000),
        date: new Date(Date.UTC(YEAR, MONTH_IDX, 2, 10, 0, 0)),
        notes: 'October seasonal uniform issue',
      });

      // Oct 5 — Canteen / Food
      expBatch.push({
        agency_id: agencyId, watchman_id: watchman._id,
        category: 'food', type: 'deduction',
        title: 'Guard Mess Monthly Food Pass – October',
        amount: rnd(650, 850),
        date: new Date(Date.UTC(YEAR, MONTH_IDX, 5, 11, 30, 0)),
        notes: 'Monthly canteen subscription charges',
      });

      // Oct 8 — Travel allowance
      expBatch.push({
        agency_id: agencyId, watchman_id: watchman._id,
        category: 'travel', type: 'deduction',
        title: 'Monthly Bus Pass / Travel Allowance',
        amount: rnd(300, 500),
        date: new Date(Date.UTC(YEAR, MONTH_IDX, 8, 9, 0, 0)),
        notes: 'Monthly commute reimbursement deduction',
      });

      // Oct 12 — Festival Advance
      expBatch.push({
        agency_id: agencyId, watchman_id: watchman._id,
        category: 'advance', type: 'deduction',
        title: 'Diwali Festival Mid-Month Cash Advance',
        amount: 1500,
        date: new Date(Date.UTC(YEAR, MONTH_IDX, 12, 14, 0, 0)),
        notes: 'Advance disbursed in cash before Diwali',
      });

      // Oct 15 — Medical
      expBatch.push({
        agency_id: agencyId, watchman_id: watchman._id,
        category: 'medical', type: 'deduction',
        title: 'Annual Health & Eye Fitness Checkup',
        amount: rnd(250, 400),
        date: new Date(Date.UTC(YEAR, MONTH_IDX, 15, 9, 30, 0)),
        notes: 'Mandatory guard medical fitness certification',
      });

      // Oct 18 — Equipment
      expBatch.push({
        agency_id: agencyId, watchman_id: watchman._id,
        category: 'equipment', type: 'deduction',
        title: 'Torch, Baton & Walkie-Talkie Deposit',
        amount: rnd(200, 350),
        date: new Date(Date.UTC(YEAR, MONTH_IDX, 18, 10, 0, 0)),
        notes: 'Refundable security equipment deposit',
      });

      // Oct 20 — Vigilance Bonus (earning)
      expBatch.push({
        agency_id: agencyId, watchman_id: watchman._id,
        category: 'bonus', type: 'earning',
        title: 'Outstanding Vigilance & Diwali Performance Bonus',
        amount: rnd(800, 1200),
        date: new Date(Date.UTC(YEAR, MONTH_IDX, 20, 17, 0, 0)),
        notes: 'Approved Diwali bonus for exemplary duty',
      });
    }

    await Expense.insertMany(expBatch);
    console.log(`✅ Inserted ${expBatch.length} expense records (7 per guard)`);

    // ─── Summary ─────────────────────────────────────────────────────────────
    console.log(`
══════════════════════════════════════════════════
🎉  ALERT SPACE AGENCY SEEDED SUCCESSFULLY
══════════════════════════════════════════════════
Agency : Alert Space  (ID: ${agencyId})
Admin  : alertspace@gmail.com / Admin@123
Societies (5):
  • demo1            — 7 guards
  • demo2            — 8 guards
  • demo3            — 7 guards
  • Bhalchandra Vihar — 7 guards
  • Perfect Society  — 7 guards
Watchmen : ${createdGuards.length} guards (AS-001 to AS-036)
Attendance: ${attBatch.length} records  (Oct 1–22, 2026)
Expenses  : ${expBatch.length} records  (7 categories/guard)
══════════════════════════════════════════════════
`);

    await mongoose.disconnect();
    process.exit(0);
  } catch (err: any) {
    console.error('❌ Seed failed:', err.message);
    await mongoose.disconnect();
    process.exit(1);
  }
}

seed();
