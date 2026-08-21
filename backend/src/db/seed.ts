import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';
import { User, Agency, Watchman } from '../models';

dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/watchman_tracker';

async function seed() {
  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(MONGODB_URI);
    console.log('Connected to MongoDB');

    // 1. Create Super Admin
    const superAdminEmail = 'super@admin.com';
    const existingSuper = await User.findOne({ email: superAdminEmail });
    if (!existingSuper) {
      const superPassword = await bcrypt.hash('superadmin123', 12);
      await User.create({
        email: superAdminEmail,
        password_hash: superPassword,
        role: 'super_admin',
        name: 'Super Admin',
        is_active: true,
      });
      console.log('✅ Super Admin created (super@admin.com / superadmin123)');
    } else {
      console.log('ℹ️ Super Admin already exists');
    }

    // 2. Create Pune Secure Agency
    const agencyEmail = 'agency@punesecure.com';
    let agency = await Agency.findOne({ email: agencyEmail });
    if (!agency) {
      agency = await Agency.create({
        name: 'Pune Secure Agency',
        email: agencyEmail,
        phone: '1234567890',
        address: 'Pune, MH',
        status: 'active',
      });
      console.log('✅ Pune Secure Agency created');
    } else {
      console.log('ℹ️ Pune Secure Agency already exists');
    }

    // 3. Create Agency Admin (admin@punesecure.com)
    const agencyAdminEmail = 'admin@punesecure.com';
    const existingAdmin = await User.findOne({ email: agencyAdminEmail });
    if (!existingAdmin && agency) {
      const adminPassword = await bcrypt.hash('Admin@123', 12);
      await User.create({
        agency_id: agency._id,
        email: agencyAdminEmail,
        password_hash: adminPassword,
        role: 'agency_admin',
        name: 'Pune Admin',
        is_active: true,
      });
      console.log('✅ Agency Admin created (admin@punesecure.com / Admin@123)');
    } else {
      console.log('ℹ️ Agency Admin already exists');
    }

    // 4. Create Watchman (ramesh@punesecure.com)
    const watchmanEmail = 'ramesh@punesecure.com';
    const existingWatchmanUser = await User.findOne({ email: watchmanEmail });
    if (!existingWatchmanUser && agency) {
      const watchmanPassword = await bcrypt.hash('Guard@123', 12);
      
      // Create Watchman User account first
      const watchmanUser = await User.create({
        agency_id: agency._id,
        email: watchmanEmail,
        password_hash: watchmanPassword,
        role: 'watchman',
        name: 'Ramesh Singh',
        is_active: true,
      });

      // Create Watchman Profile
      const watchmanProfile = await Watchman.create({
        agency_id: agency._id,
        user_id: watchmanUser._id,
        employee_id: 'EMP-001',
        full_name: 'Ramesh Singh',
        phone: '9876543210',
        status: 'active',
      });

      // Update User with watchman_id
      await User.updateOne({ _id: watchmanUser._id }, { watchman_id: watchmanProfile._id });

      console.log('✅ Watchman User created (ramesh@punesecure.com / Guard@123)');
    } else {
      console.log('ℹ️ Watchman User already exists');
    }

    // 5. Create Society, Shift, and Assignment for Testing
    const societyName = 'Sunshine Apartments';
    let society = await mongoose.model('Society').findOne({ name: societyName, agency_id: agency._id });
    if (!society) {
      society = await mongoose.model('Society').create({
        agency_id: agency._id,
        name: societyName,
        address: 'Main Road, Pune',
        required_guards: 2,
        geofence_radius: 500, // Generous radius for testing
        latitude: 18.5204, // Default Pune
        longitude: 73.8567,
        is_active: true,
      });
      console.log('✅ Society created:', societyName);
    }

    const shiftName = 'All-Day Test Shift';
    let shift = await mongoose.model('Shift').findOne({ name: shiftName, agency_id: agency._id });
    if (!shift) {
      shift = await mongoose.model('Shift').create({
        agency_id: agency._id,
        name: shiftName,
        start_time: '00:00', // Always active shift for easy testing
        end_time: '23:59',
        late_threshold_minutes: 30,
      });
      console.log('✅ Shift created:', shiftName);
    }

    const rameshUser = await User.findOne({ email: watchmanEmail });
    const rameshProfile = rameshUser ? await Watchman.findOne({ user_id: rameshUser._id }) : null;

    if (rameshProfile && society && shift) {
      let assignment = await mongoose.model('Assignment').findOne({ watchman_id: rameshProfile._id });
      if (!assignment) {
        await mongoose.model('Assignment').create({
          agency_id: agency._id,
          watchman_id: rameshProfile._id,
          society_id: society._id,
          shift_id: shift._id,
          start_date: new Date('2024-01-01'),
          is_active: true,
        });
        console.log('✅ Assignment created for Ramesh at Sunshine Apartments');
      }
    }

    console.log('\n🎉 Seeding completed successfully!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Seeding failed:', error);
    process.exit(1);
  }
}

seed();
