require('dotenv').config();
const mongoose = require('mongoose');

async function test() {
  await mongoose.connect(process.env.MONGODB_URI);
  
  const Assignment = mongoose.model('Assignment', new mongoose.Schema({}, {strict: false}));
  
  const matchObj = {
    is_active: true,
  };
  
  console.log('Match object:', matchObj);
  
  const results = await Assignment.aggregate([
    { $match: matchObj }
  ]);
  
  console.log('Results with is_active only:', results.length);
  
  const societyMatch = {
    is_active: true,
    society_id: new mongoose.Types.ObjectId('6a8aa4e929ba8378cbab4160')
  };
  
  const results2 = await Assignment.aggregate([
    { $match: societyMatch }
  ]);
  
  console.log('Results with society_id ObjectId:', results2.length);

  const societyMatchStr = {
    is_active: true,
    society_id: '6a8aa4e929ba8378cbab4160'
  };
  
  const results3 = await Assignment.aggregate([
    { $match: societyMatchStr }
  ]);
  
  console.log('Results with society_id String:', results3.length);

  await mongoose.disconnect();
}

test().catch(console.error);
