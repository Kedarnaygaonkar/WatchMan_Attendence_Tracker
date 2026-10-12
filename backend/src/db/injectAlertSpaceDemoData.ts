import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';
import { v4 as uuidv4 } from 'uuid';
import { Agency, User, Society, Gate, Watchman, Shift, Assignment, Attendance } from '../models';

dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/watchman_tracker';

async function inject() {
  console.log('🔄 Connecting to MongoDB Atlas...');
  await mongoose.connect(MONGODB_URI);
  console.log('✅ Connected successfully to MongoDB Atlas.');

  // 1. Find or create Agency: "Alert Space"
  let agency = await Agency.findOne({
    $or: [
      { name: { $regex: '^Alert Space$', $options: 'i' } },
      { email: 'alertspace@gmail.com' },
    ],
  });

  if (!agency) {
    console.log('Creating Alert Space agency...');
    agency = await Agency.create({
      name: 'Alert Space',
      email: 'alertspace@gmail.com',
      phone: '+91 9888776655',
      address: 'Baner - Balewadi Road, Pune, Maharashtra 411045',
      status: 'active',
      logo_url: '',
    });
    console.log('✅ Created Agency: Alert Space');
  } else {
    console.log(`ℹ️ Found existing Agency: ${agency.name} (${agency._id})`);
    agency.name = 'Alert Space';
    agency.status = 'active';
    await agency.save();
  }

  // 2. Ensure Agency Admin User exists
  const adminEmail = 'alertspace@gmail.com';
  let adminUser = await User.findOne({ email: adminEmail });
  const adminPasswordHash = await bcrypt.hash('Alert@123', 12);

  if (!adminUser) {
    adminUser = await User.create({
      agency_id: agency._id,
      email: adminEmail,
      password_hash: adminPasswordHash,
      role: 'agency_admin',
      name: 'Alert Space Admin',
      phone: '+91 9888776655',
      is_active: true,
    });
    console.log('✅ Created Agency Admin User: alertspace@gmail.com / Alert@123');
  } else {
    adminUser.agency_id = agency._id;
    adminUser.password_hash = adminPasswordHash;
    adminUser.role = 'agency_admin';
    adminUser.is_active = true;
    await adminUser.save();
    console.log('✅ Updated Agency Admin User credentials: alertspace@gmail.com / Alert@123');
  }

  // 3. Create or fetch Shifts for Alert Space
  const shiftDefs = [
    { name: 'Morning Shift', start_time: '07:00', end_time: '15:00', is_overnight: false },
    { name: 'Evening Shift', start_time: '15:00', end_time: '23:00', is_overnight: false },
    { name: 'Night Shift', start_time: '23:00', end_time: '07:00', is_overnight: true },
    { name: 'Day General', start_time: '08:00', end_time: '20:00', is_overnight: false },
  ];

  const shifts: any[] = [];
  for (const sDef of shiftDefs) {
    let s = await Shift.findOne({ agency_id: agency._id, name: sDef.name });
    if (!s) {
      s = await Shift.create({
        agency_id: agency._id,
        name: sDef.name,
        start_time: sDef.start_time,
        end_time: sDef.end_time,
        is_overnight: sDef.is_overnight,
        late_threshold_minutes: 15,
        is_active: true,
      });
    }
    shifts.push(s);
  }
  console.log(`✅ Loaded ${shifts.length} shifts for Alert Space.`);

  // 4. Create / Update Societies
  const societyConfigs = [
    {
      name: 'Bhalchandra Vichar',
      address: 'Sr. No. 92, Ravet - Kiwale BRTS Road, Ravet, Pune, MH 412101',
      contact_person: 'Mr. Rajesh Deshmukh (Secretary)',
      contact_phone: '+91 9823112233',
      latitude: 18.6476,
      longitude: 73.7438,
      wings: ['A Wing', 'B Wing', 'C Wing', 'D Wing'],
      gates: ['Main Entrance Gate', 'North Gate', 'Clubhouse Gate'],
    },
    {
      name: 'Marvel Imperial Residency',
      address: 'Plot 14, Lane 7, Kalyani Nagar, Pune, MH 411006',
      contact_person: 'Col. Amit Verma (Chairman)',
      contact_phone: '+91 9822445566',
      latitude: 18.5482,
      longitude: 73.9038,
      wings: ['Tower 1 (A)', 'Tower 2 (B)', 'Tower 3 (C)', 'Tower 4 (D)'],
      gates: ['Grand Main Gate', 'Service Gate', 'Basement Parking Gate'],
    },
    {
      name: 'Greenfield Palms Estate',
      address: 'Survey No. 45/2, Pancard Club Road, Baner, Pune, MH 411045',
      contact_person: 'Mrs. Sunita Kulkarni (Treasurer)',
      contact_phone: '+91 9922778899',
      latitude: 18.5590,
      longitude: 73.7868,
      wings: ['Orchid Wing', 'Lotus Wing', 'Tulip Wing', 'Iris Wing'],
      gates: ['Main Security Gate', 'Delivery Gate', 'Podium Gate'],
    },
    {
      name: 'Emerald Heights Society',
      address: 'Near MIT College, Paud Road, Kothrud, Pune, MH 411038',
      contact_person: 'Dr. Nitin Joshi (President)',
      contact_phone: '+91 9890123456',
      latitude: 18.5074,
      longitude: 73.8077,
      wings: ['Wing A', 'Wing B', 'Wing C'],
      gates: ['Front Security Gate', 'Rear Exit Gate'],
    },
  ];

  const societies: any[] = [];
  for (const sConf of societyConfigs) {
    let soc = await Society.findOne({ agency_id: agency._id, name: sConf.name });
    if (!soc) {
      // Check if exists without agency filter
      soc = await Society.findOne({ name: sConf.name });
    }

    if (!soc) {
      soc = await Society.create({
        agency_id: agency._id,
        name: sConf.name,
        address: sConf.address,
        contact_person: sConf.contact_person,
        contact_phone: sConf.contact_phone,
        latitude: sConf.latitude,
        longitude: sConf.longitude,
        geofence_radius: 120,
        required_guards: sConf.wings.length + sConf.gates.length,
        is_active: true,
        wings: sConf.wings,
        gates: sConf.gates,
      });
      console.log(`✅ Created society: ${soc.name}`);
    } else {
      soc.agency_id = agency._id;
      soc.address = sConf.address;
      soc.wings = sConf.wings;
      soc.gates = sConf.gates;
      soc.latitude = sConf.latitude;
      soc.longitude = sConf.longitude;
      soc.is_active = true;
      await soc.save();
      console.log(`ℹ️ Updated society: ${soc.name}`);
    }
    societies.push(soc);

    // Create Gate documents for each gate
    for (const gateName of sConf.gates) {
      let g = await Gate.findOne({ society_id: soc._id, name: gateName });
      if (!g) {
        await Gate.create({
          agency_id: agency._id,
          society_id: soc._id,
          name: gateName,
          qr_token: uuidv4(),
          is_active: true,
        });
      }
    }
  }

  // 5. Create 16 Realistic Watchmen
  const watchmenDefs = [
    { name: 'Ramesh Shinde', empId: 'AS-101', phone: '9822011221', wing: 'A Wing' },
    { name: 'Suresh Patil', empId: 'AS-102', phone: '9822011222', wing: 'B Wing' },
    { name: 'Vikas Pawar', empId: 'AS-103', phone: '9822011223', wing: 'C Wing' },
    { name: 'Santosh Jadhav', empId: 'AS-104', phone: '9822011224', wing: 'D Wing' },
    { name: 'Ajay More', empId: 'AS-105', phone: '9822011225', wing: 'Tower 1 (A)' },
    { name: 'Rajesh Gaikwad', empId: 'AS-106', phone: '9822011226', wing: 'Tower 2 (B)' },
    { name: 'Deepak Bhosale', empId: 'AS-107', phone: '9822011227', wing: 'Tower 3 (C)' },
    { name: 'Rahul Kadam', empId: 'AS-108', phone: '9822011228', wing: 'Tower 4 (D)' },
    { name: 'Sunilkumar Yadav', empId: 'AS-109', phone: '9822011229', wing: 'Orchid Wing' },
    { name: 'Manoj Kamble', empId: 'AS-110', phone: '9822011230', wing: 'Lotus Wing' },
    { name: 'Datta Ghorpade', empId: 'AS-111', phone: '9822011231', wing: 'Tulip Wing' },
    { name: 'Sachin Jagtap', empId: 'AS-112', phone: '9822011232', wing: 'Iris Wing' },
    { name: 'Mahesh Salunke', empId: 'AS-113', phone: '9822011233', wing: 'Wing A' },
    { name: 'Ganesh Koli', empId: 'AS-114', phone: '9822011234', wing: 'Wing B' },
    { name: 'Pandurang Shinde', empId: 'AS-115', phone: '9822011235', wing: 'Wing C' },
    { name: 'Tanaji Gaikwad', empId: 'AS-116', phone: '9822011236', wing: 'Main Gate' },
  ];

  const watchmen: any[] = [];
  const guardPasswordHash = await bcrypt.hash('Guard@123', 10);

  for (const wDef of watchmenDefs) {
    const userEmail = `${wDef.empId.toLowerCase()}@alertspace.com`;
    let u = await User.findOne({ email: userEmail });
    if (!u) {
      u = await User.create({
        agency_id: agency._id,
        email: userEmail,
        password_hash: guardPasswordHash,
        role: 'watchman',
        name: wDef.name,
        phone: wDef.phone,
        is_active: true,
      });
    }

    let wm = await Watchman.findOne({ agency_id: agency._id, employee_id: wDef.empId });
    if (!wm) {
      wm = await Watchman.create({
        agency_id: agency._id,
        user_id: u._id,
        employee_id: wDef.empId,
        full_name: wDef.name,
        phone: wDef.phone,
        status: 'active',
        wing: wDef.wing,
        face_registered: true,
        joining_date: new Date('2026-06-01'),
      });
    } else {
      wm.status = 'active';
      wm.full_name = wDef.name;
      wm.phone = wDef.phone;
      wm.wing = wDef.wing;
      wm.face_registered = true;
      await wm.save();
    }
    watchmen.push(wm);
  }
  console.log(`✅ Ensured ${watchmen.length} watchmen profiles.`);

  // 6. Assign 4 guards to each of the 4 societies
  // Bhalchandra Vichar -> AS-101..AS-104
  // Marvel Imperial -> AS-105..AS-108
  // Greenfield Palms -> AS-109..AS-112
  // Emerald Heights -> AS-113..AS-116
  const assignments: any[] = [];
  for (let sIdx = 0; sIdx < societies.length; sIdx++) {
    const soc = societies[sIdx];
    const guardsForSoc = watchmen.slice(sIdx * 4, sIdx * 4 + 4);

    for (let gIdx = 0; gIdx < guardsForSoc.length; gIdx++) {
      const guard = guardsForSoc[gIdx];
      const shift = shifts[gIdx % shifts.length];

      let assign = await Assignment.findOne({
        agency_id: agency._id,
        watchman_id: guard._id,
        society_id: soc._id,
      });

      if (!assign) {
        assign = await Assignment.create({
          agency_id: agency._id,
          watchman_id: guard._id,
          society_id: soc._id,
          shift_id: shift._id,
          start_date: new Date('2026-07-01'),
          is_active: true,
        });
      }
      assignments.push({ guard, society: soc, shift, assign });
    }
  }

  // 7. Inject Attendance: from 2026-08-01 to 2026-10-12 (Today)
  console.log('⏳ Generating 2.5 months of realistic attendance records (Aug 1 to Oct 12, 2026)...');

  // Clear existing attendance for Alert Space in this range to avoid duplicates
  const startDate = new Date('2026-08-01T00:00:00.000Z');
  const endDate = new Date('2026-10-12T23:59:59.999Z');

  const deleteResult = await Attendance.deleteMany({
    agency_id: agency._id,
    attendance_date: { $gte: startDate, $lte: endDate },
  });
  console.log(`🗑️ Cleared ${deleteResult.deletedCount} old attendance records for clean seed.`);

  const attendanceBatch: any[] = [];
  const currDate = new Date(startDate);

  while (currDate <= endDate) {
    const dayOfWeek = currDate.getUTCDay(); // 0 is Sunday
    const attDate = new Date(Date.UTC(currDate.getUTCFullYear(), currDate.getUTCMonth(), currDate.getUTCDate()));

    for (const item of assignments) {
      const { guard, society, shift } = item;

      // 1 weekly off day per guard based on index
      const guardNum = parseInt(guard.employee_id.replace('AS-', '')) || 0;
      const weeklyOffDay = guardNum % 7;
      if (dayOfWeek === weeklyOffDay) {
        // Scheduled weekly off
        continue;
      }

      // Random status: ~90% present, ~8% late, ~2% missed
      const rand = Math.random();
      if (rand < 0.02) {
        // Absent / off
        continue;
      }

      const isLate = rand < 0.10; // 8% late
      const status = isLate ? 'late' : 'present';

      // Parse shift start time (e.g. "07:00")
      const [startH, startM] = shift.start_time.split(':').map(Number);
      const checkInH = isLate ? startH : startH;
      const checkInM = isLate ? startM + 20 + Math.floor(Math.random() * 25) : Math.max(0, startM - 10 + Math.floor(Math.random() * 15));

      const checkInTime = new Date(attDate);
      checkInTime.setUTCHours(checkInH, checkInM, Math.floor(Math.random() * 59));

      const checkOutTime = new Date(checkInTime);
      checkOutTime.setUTCHours(checkInTime.getUTCHours() + 8 + Math.floor(Math.random() * 2), Math.floor(Math.random() * 45));

      const durationMinutes = Math.round((checkOutTime.getTime() - checkInTime.getTime()) / 60000);

      // Distribute scan to either a wing or a gate
      const wingOrGate = Math.random() > 0.35 ? 'wing' : 'gate';
      let selectedWing: string | undefined;
      let selectedGate: string | undefined;

      if (wingOrGate === 'wing' && society.wings.length > 0) {
        selectedWing = society.wings[(guardNum + dayOfWeek) % society.wings.length];
      } else if (society.gates.length > 0) {
        selectedGate = society.gates[(guardNum + dayOfWeek) % society.gates.length];
      } else {
        selectedWing = society.wings[0] || 'A Wing';
      }

      // GPS near society
      const latOffset = (Math.random() - 0.5) * 0.0004;
      const lngOffset = (Math.random() - 0.5) * 0.0004;
      const distance = Math.floor(12 + Math.random() * 38);

      attendanceBatch.push({
        agency_id: agency._id,
        watchman_id: guard._id,
        society_id: society._id,
        shift_id: shift._id,
        assignment_id: item.assign._id,
        attendance_date: attDate,
        check_in_time: checkInTime,
        check_out_time: checkOutTime,
        duration_minutes: durationMinutes,
        latitude: society.latitude + latOffset,
        longitude: society.longitude + lngOffset,
        gps_accuracy: 10 + Math.floor(Math.random() * 12),
        distance_from_society: distance,
        status,
        verification_status: 'verified',
        gps_flags: [],
        is_offline_sync: Math.random() < 0.05,
        face_verified: true,
        face_match_score: Number((0.24 + Math.random() * 0.18).toFixed(3)),
        selected_wing: selectedWing,
        selected_gate: selectedGate,
      });
    }

    // Next day
    currDate.setUTCDate(currDate.getUTCDate() + 1);
  }

  console.log(`💾 Inserting ${attendanceBatch.length} attendance records in bulk...`);
  await Attendance.insertMany(attendanceBatch);
  console.log(`🎉 Successfully injected ${attendanceBatch.length} realistic attendance records across 4 societies!`);

  console.log('\n📊 Summary of Injected Data:');
  console.log(`- Agency: ${agency.name} (Email: alertspace@gmail.com, Pass: Alert@123)`);
  console.log(`- Societies (${societies.length}): ${societies.map(s => s.name).join(', ')}`);
  console.log(`- Watchmen (${watchmen.length}): AS-101 to AS-116`);
  console.log(`- Shifts: 4 active shifts`);
  console.log(`- Date Range: 2026-08-01 to 2026-10-12`);
  console.log(`- Attendance Count: ${attendanceBatch.length}`);

  await mongoose.disconnect();
  console.log('✅ Done! Disconnected from MongoDB.');
}

inject().catch(err => {
  console.error('❌ Error during data injection:', err);
  process.exit(1);
});
