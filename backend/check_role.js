const mongoose = require('mongoose');
const dotenv = require('dotenv');

dotenv.config();

async function run() {
  await mongoose.connect(process.env.MONGODB_URI);
  
  const User = mongoose.model('User', new mongoose.Schema({
    email: String,
    role: String,
    name: String
  }));

  const user = await User.findOne({ email: 'admin@punesecure.com' });
  console.log('User found:', user);
  
  await mongoose.disconnect();
}

run().catch(console.error);
