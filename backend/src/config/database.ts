import mongoose from 'mongoose';
import { config } from './index';

let isConnected = false;

export const connectDB = async () => {
  if (isConnected) {
    console.log('MongoDB already connected');
    return;
  }
  try {
    const conn = await mongoose.connect(config.database.uri);
    isConnected = !!conn.connections[0].readyState;
    console.log(`MongoDB Connected: ${conn.connection.host}`);
  } catch (error) {
    console.error(`Error connecting to MongoDB: ${(error as Error).message}`);
    // DO NOT process.exit(1) in serverless environments, it will crash the function
  }
};
