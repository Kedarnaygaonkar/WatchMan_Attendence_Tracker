const mongoose = require('mongoose');
const dotenv = require('dotenv');

dotenv.config();

async function run() {
  await mongoose.connect(process.env.MONGODB_URI);
  
  const User = mongoose.model('User', new mongoose.Schema({
    email: String,
    role: String,
    name: String,
    agency_id: mongoose.Schema.Types.ObjectId
  }));

  const result = await User.updateOne(
    { email: 'admin@punesecure.com' },
    { $set: { role: 'super_admin', agency_id: null } }
  );
  
  console.log('Update result:', result);
  
  await mongoose.disconnect();
}

run().catch(console.error);
