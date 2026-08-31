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

  // Find Pune Secure Agency
  const Agency = mongoose.model('Agency', new mongoose.Schema({
    email: String
  }));
  const agency = await Agency.findOne({ email: 'admin@punesecure.com' });
  let agencyId = agency ? agency._id : new mongoose.Types.ObjectId('6a873bf0e355fbe858e0dc4e');

  const result = await User.updateOne(
    { email: 'admin@punesecure.com' },
    { $set: { agency_id: agencyId } }
  );
  
  console.log('Restored agency_id:', result);
  
  await mongoose.disconnect();
}

run().catch(console.error);
