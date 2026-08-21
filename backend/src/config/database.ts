import mongoose from 'mongoose';
import { config } from './index';

export const connectDB = async () => {
  try {
    const conn = await mongoose.connect(config.database.uri);
    console.log(`MongoDB Connected: ${conn.connection.host}`);
  } catch (error) {
    console.error(`Error connecting to MongoDB: ${(error as Error).message}`);
    process.exit(1);
  }
};
