require('dotenv').config();
const mongoose = require('mongoose');

async function test() {
  await mongoose.connect(process.env.MONGODB_URI);
  
  const Assignment = mongoose.model('Assignment', new mongoose.Schema({}, {strict: false}));
  
  const dateStr = '2026-08-28';
  const d = new Date(dateStr);
  const start = new Date(d);
  start.setUTCHours(0, 0, 0, 0);
  const end = new Date(d);
  end.setUTCHours(23, 59, 59, 999);
  const wideStart = new Date(start.getTime() - 14 * 3600000);
  const wideEnd = new Date(end.getTime() + 14 * 3600000);

  const matchObj = {
    is_active: true,
    start_date: { $lte: end },
    $or: [
      { end_date: { $exists: false } },
      { end_date: null },
      { end_date: { $gte: start } }
    ],
    society_id: new mongoose.Types.ObjectId('6a8aa4e929ba8378cbab4160')
  };
  
  try {
    const reportData = await Assignment.aggregate([
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
        $lookup: {
          from: 'attendances',
          let: { wId: '$watchman_id', sId: '$society_id' },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $eq: [{ $toString: '$watchman_id' }, { $toString: '$$wId' }] },
                    { $eq: [{ $toString: '$society_id' }, { $toString: '$$sId' }] },
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
            { $sort: { check_in_time: -1 } },
            { $limit: 1 }
          ],
          as: 'attendance',
        },
      },
      { $unwind: { path: '$attendance', preserveNullAndEmptyArrays: true } },
      {
        $addFields: {
          watchman_id: '$watchman_id',
          full_name: { $ifNull: ['$watchman.full_name', 'Unknown Guard'] },
          employee_id: { $ifNull: ['$watchman.employee_id', ''] },
          society_name: { $ifNull: ['$society.name', 'Unknown Society'] },
          shift_name: { $ifNull: ['$shift.name', 'Standard Shift'] },
          start_time: { $ifNull: ['$shift.start_time', ''] },
          end_time: { $ifNull: ['$shift.end_time', ''] },
          attendance_id: '$attendance._id',
          check_in_time: { $ifNull: ['$attendance.check_in_time', null] },
          check_out_time: { $ifNull: ['$attendance.check_out_time', null] },
          duration_minutes: { $ifNull: ['$attendance.duration_minutes', null] },
          verification_status: { $ifNull: ['$attendance.verification_status', null] },
          is_offline_sync: { $ifNull: ['$attendance.is_offline_sync', false] },
          final_status: { $ifNull: ['$attendance.status', 'absent'] },
        },
      },
      { $project: { watchman: 0, society: 0, shift: 0, attendance: 0 } },
      { $sort: { society_name: 1, full_name: 1 } },
    ]);
    
    console.log('Final Result length:', reportData.length);
    console.log('Final Result:', JSON.stringify(reportData, null, 2));
  } catch (err) {
    console.error('Aggregation failed:', err);
  }
  await mongoose.disconnect();
}
test();
