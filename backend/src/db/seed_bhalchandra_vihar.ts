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

function rnd(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

async function run() {
  try {
    console.log(' Connecting to MongoDB...');
    await mongoose.connect(MONGODB_URI);
    console.log(' Connected!\n');

    // 1. Locate Alert Space Agency
    const agency = await Agency.findOne({ name: /alert space/i });
    if (!agency) {
      console.error(' Alert Space agency not found!');
      process.exit(1);
    }
    const agencyId = agency._id;
    console.log(`🏢 Found Agency: ${agency.name} (${agencyId})`);

    // 2. Remove any existing "bhalchandra vihar" society in this agency to ensure fresh seed
    const existingSoc = await Society.findOne({
      agency_id: agencyId,
      name: { $regex: /bhalchandra\s*vihar/i },
    });

    if (existingSoc) {
      console.log(` Cleaning up existing society: ${existingSoc.name} (${existingSoc._id})...`);
      await Attendance.deleteMany({ society_id: existingSoc._id });
      await Assignment.deleteMany({ society_id: existingSoc._id });
      await Gate.deleteMany({ society_id: existingSoc._id });
      await Society.findByIdAndDelete(existingSoc._id);
      console.log(' Existing society and related records cleaned.');
    }

    // 3. Create Society with exact specifications requested:
    // Name: Bhalchandra Vihar
    // Lat: 18.6551174, Lng: 73.7451555
    // Wings: ['A', 'B', 'C', 'M1M2']
    // Gates: ['In(Main)Gate', 'OutGate(Main)', 'OutGate(SB School)']
    const wingsList = ['A', 'B', 'C', 'M1M2'];
    const gatesList = ['In(Main)Gate', 'OutGate(Main)', 'OutGate(SB School)'];

    const society = await Society.create({
      agency_id: agencyId,
      name: 'Bhalchandra Vihar',
      address: 'Bhalchandra Vihar, Ravet / Chinchwad, Pune - 412101, Maharashtra',
      latitude: 18.6551174,
      longitude: 73.7451555,
      geofence_radius: 150,
      required_guards: 8,
      wings: wingsList,
      gates: gatesList,
      contact_person: 'Mr. Bhalchandra Joshi',
      contact_phone: '+91 9822044444',
      is_active: true,
      notes: 'Premier residential community with smart security tracking',
    });

    console.log(` Created Society: ${society.name} at [${society.latitude}, ${society.longitude}]`);
    console.log(`   Wings: ${society.wings.join(', ')}`);
    console.log(`   Gates: ${society.gates.join(', ')}`);

    // 4. Create Gate documents with QR tokens
    const createdGates: any[] = [];
    for (const gName of gatesList) {
      const gate = await Gate.create({
        agency_id: agencyId,
        society_id: society._id,
        name: gName,
        qr_token: crypto.randomUUID(),
        is_active: true,
      });
      createdGates.push(gate);
      console.log(`   🚪 Gate Created: "${gate.name}" (Token: ${gate.qr_token.slice(0, 8)}...)`);
    }

    // 5. Get Shifts for Alert Space
    const dayShift = await Shift.findOne({ agency_id: agencyId, shift_type: 'day' });
    const nightShift = await Shift.findOne({ agency_id: agencyId, shift_type: 'night' });

    if (!dayShift || !nightShift) {
      console.error(' Shifts missing in Alert Space agency!');
      process.exit(1);
    }

    // 6. Select / Create Guards for Bhalchandra Vihar
    // We want 8 active guards assigned to this society
    const allGuards = await Watchman.find({ agency_id: agencyId });
    const assignedWIds = (await Assignment.find({ agency_id: agencyId })).map(a => a.watchman_id.toString());
    let guardsForSociety = allGuards.filter(w => !assignedWIds.includes(w._id.toString()));

    const guardPwd = await bcrypt.hash('Guard@123', 10);

    // If fewer than 8 unassigned guards, create additional guards
    let extraCount = 1;
    while (guardsForSociety.length < 8) {
      const empNum = 36 + extraCount;
      const empId = `AS-${String(empNum).padStart(3, '0')}`;
      const name = extraCount === 1 ? 'Sandeep Shinde' : `Guard ${empNum}`;
      const phone = `+91 9823000${String(empNum).padStart(3, '0')}`;
      const email = `guard.as${String(empNum).padStart(3, '0')}@alertspace.in`;

      // Clean up previous run's user/watchman if any
      const existingUser = await User.findOne({ email });
      if (existingUser) {
        await Expense.deleteMany({ watchman_id: { $in: await Watchman.find({ user_id: existingUser._id }).distinct('_id') } });
        await Watchman.deleteMany({ user_id: existingUser._id });
        await User.findByIdAndDelete(existingUser._id);
      }

      const userDoc = await User.create({
        agency_id: agencyId,
        email,
        password_hash: guardPwd,
        role: 'watchman',
        name,
        phone,
        is_active: true,
      });

      const newGuard = await Watchman.create({
        agency_id: agencyId,
        user_id: userDoc._id,
        employee_id: empId,
        full_name: name,
        phone,
        emergency_contact: '+91 9988776655',
        address: 'Pune, Maharashtra',
        joining_date: new Date('2026-06-01'),
        wing: pick(wingsList),
        daily_wage: 620,
        status: 'active',
      });

      // Add default expenses for the new guard
      const EXPENSE_CATEGORIES: { category: any; type: 'deduction' | 'earning'; title: string; min: number; max: number; notes: string }[] = [
        { category: 'clothes', type: 'deduction', title: 'Uniform Set, Cap & Tactical Boots', min: 1200, max: 2500, notes: 'Security uniform set & boots' },
        { category: 'food', type: 'deduction', title: 'Mess & Cafeteria Monthly Meals', min: 1500, max: 3000, notes: 'Monthly mess & canteen subsidy' },
        { category: 'travel', type: 'deduction', title: 'Monthly Bus Pass & Travel Allowance', min: 600, max: 1500, notes: 'Monthly bus pass / fuel reimbursement' },
        { category: 'medical', type: 'deduction', title: 'Annual Health Checkup & Medical Card', min: 300, max: 800, notes: 'Routine checkup & first-aid kit' },
        { category: 'advance', type: 'deduction', title: 'Mid-Month Festival Salary Advance', min: 1000, max: 4000, notes: 'Salary advance' },
        { category: 'equipment', type: 'deduction', title: 'Torch, Baton & Walkie-Talkie Deposit', min: 200, max: 350, notes: 'Security gear kit' },
        { category: 'bonus', type: 'earning', title: 'Outstanding Vigilance & Diwali Performance Bonus', min: 800, max: 1200, notes: 'Diwali bonus' },
      ];

      for (const ec of EXPENSE_CATEGORIES) {
        await Expense.create({
          agency_id: agencyId,
          watchman_id: newGuard._id,
          category: ec.category,
          type: ec.type,
          title: ec.title,
          amount: rnd(ec.min, ec.max),
          date: new Date(`2026-10-${String(rnd(2, 18)).padStart(2, '0')}`),
          notes: ec.notes,
          created_by: userDoc._id,
        });
      }

      guardsForSociety.push(newGuard);
      extraCount++;
    }

    // Limit to 8 guards
    guardsForSociety = guardsForSociety.slice(0, 8);
    console.log(`\n👮 Assigned ${guardsForSociety.length} Guards to Bhalchandra Vihar:`);

    // 7. Create Assignments
    for (let i = 0; i < guardsForSociety.length; i++) {
      const guard = guardsForSociety[i];
      const shift = i % 2 === 0 ? dayShift : nightShift;

      await Assignment.create({
        agency_id: agencyId,
        watchman_id: guard._id,
        society_id: society._id,
        shift_id: shift._id,
        start_date: new Date('2026-10-01'),
        is_active: true,
        notes: `Assigned to ${society.name} - ${shift.name}`,
      });

      console.log(`   • ${guard.employee_id} - ${guard.full_name} (${shift.name})`);
    }

    // 8. Generate Dummy Attendance Records across October 2026 (Oct 1 to Oct 22)
    // Ensures reports (Monthly Calendar, Wing breakdown, Gate breakdown, Daily Report) have rich data!
    console.log('\n📊 Generating dummy attendance records for Oct 1 to Oct 22, 2026...');
    let attCount = 0;

    for (let day = 1; day <= 22; day++) {
      const dateStr = `2026-10-${String(day).padStart(2, '0')}`;
      const attDate = new Date(`${dateStr}T00:00:00.000Z`);

      for (let gi = 0; gi < guardsForSociety.length; gi++) {
        const guard = guardsForSociety[gi];
        const isDayShift = gi % 2 === 0;
        const shift = isDayShift ? dayShift : nightShift;

        // ~8% chance of scheduled off / absent
        if ((day + gi) % 11 === 0) continue;

        // ~88% present on time, ~12% late
        const isLate = (day * 3 + gi * 5) % 9 === 0;
        const status = isLate ? 'late' : 'present';

        // Rotate wings and gates across guards and days
        const wing = wingsList[(gi + day) % wingsList.length];
        const gateObj = createdGates[(gi + day * 2) % createdGates.length];

        // Check-in and check-out timestamps
        let checkInH = isDayShift ? 7 : 19;
        let checkInM = isLate ? rnd(8, 25) : rnd(45, 58);
        if (isLate) {
          checkInH = isDayShift ? 8 : 20;
        }

        const checkInTime = new Date(`${dateStr}T${String(checkInH).padStart(2, '0')}:${String(checkInM).padStart(2, '0')}:00.000Z`);

        let checkOutH = isDayShift ? 20 : 8;
        let checkOutM = rnd(2, 15);
        const checkOutDateStr = (!isDayShift && day < 22) ? `2026-10-${String(day + 1).padStart(2, '0')}` : dateStr;
        const checkOutTime = new Date(`${checkOutDateStr}T${String(checkOutH).padStart(2, '0')}:${String(checkOutM).padStart(2, '0')}:00.000Z`);

        const durationMinutes = isLate ? rnd(680, 705) : rnd(715, 730);

        // Geolocation jitter centered on 18.6551174, 73.7451555
        const latJitter = (Math.random() - 0.5) * 0.00015;
        const lngJitter = (Math.random() - 0.5) * 0.00015;

        await Attendance.create({
          agency_id: agencyId,
          watchman_id: guard._id,
          society_id: society._id,
          shift_id: shift._id,
          gate_id: gateObj._id,
          attendance_date: attDate,
          check_in_time: checkInTime,
          check_out_time: checkOutTime,
          duration_minutes: durationMinutes,
          latitude: 18.6551174 + latJitter,
          longitude: 73.7451555 + lngJitter,
          gps_accuracy: rnd(5, 15),
          distance_from_society: rnd(8, 42),
          status,
          verification_status: 'verified',
          gps_flags: [],
          is_offline_sync: false,
          manual_override: false,
          face_verified: true,
          face_match_score: 0.15,
          selected_gate: gateObj.name,
          selected_wing: wing,
        });

        attCount++;
      }
    }

    console.log(`✅ Created ${attCount} attendance records for Bhalchandra Vihar across 22 days!`);
    console.log(`\n🎉 Society "${society.name}" successfully created in "Alert Space" with:`);
    console.log(`   📍 Coordinates: 18.6551174, 73.7451555`);
    console.log(`   🏢 Wings: ${wingsList.join(', ')}`);
    console.log(`   🚪 Gates: ${gatesList.join(', ')}`);
    console.log(`   👮 Assigned Guards: ${guardsForSociety.length}`);
    console.log(`   📅 Attendance Records: ${attCount}`);

    process.exit(0);
  } catch (err) {
    console.error('❌ Error seeding Bhalchandra Vihar:', err);
    process.exit(1);
  }
}

run();
