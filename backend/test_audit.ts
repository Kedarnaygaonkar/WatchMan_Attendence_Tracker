import mongoose from 'mongoose';
import { Watchman, User, AuditLog } from './src/models/index.js';
import { logAudit } from './src/middleware/errorHandler.js';
import { config } from './src/config/index.js';

async function test() {
  await mongoose.connect(config.db.uri);
  
  const watchman = await Watchman.findOne();
  if (!watchman) return console.log('no watchman');

  console.log('Got watchman', watchman._id);

  try {
    watchman.agency_id = '66d03f0b2f5b4a4e1e8d6411' as any;
    await watchman.save();
    console.log('Saved watchman');

    await User.updateOne({ _id: watchman.user_id }, { agency_id: watchman.agency_id });
    console.log('Updated user');

    const req: any = { ip: '127.0.0.1', headers: {} };
    await logAudit(null as any, {
      agencyId: watchman.agency_id as any,
      userId: watchman.user_id as any,
      action: 'update_watchman',
      entityType: 'watchman',
      entityId: watchman.id,
      oldValues: {},
      newValues: {},
      req
    });
    console.log('Logged audit');

  } catch(e) {
    console.error('CRASH:', e);
  }

  await mongoose.disconnect();
}
test();
