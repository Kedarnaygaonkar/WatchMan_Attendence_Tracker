import mongoose from 'mongoose';
import { Watchman, User } from './src/models/index.js';
import { config } from './src/config/index.js';

async function test() {
  await mongoose.connect(config.db.uri);
  
  // Find a watchman
  const watchman = await Watchman.findOne();
  console.log('Watchman:', watchman);
  
  if (!watchman) {
    console.log('Watchman not found');
    return;
  }
  
  // Simulate PUT logic
  try {
    watchman.agency_id = '66d03f0b2f5b4a4e1e8d6411' as any; // fake agency id
    await watchman.save();
    console.log('Watchman saved');
    
    await User.updateOne({ _id: watchman.user_id }, { agency_id: watchman.agency_id });
    console.log('User updated');
  } catch (err) {
    console.error('Error during update:', err);
  }
  
  await mongoose.disconnect();
}

test();
