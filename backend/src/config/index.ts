import dotenv from 'dotenv';
dotenv.config();

export const config = {
  port: parseInt(process.env.PORT || '3001', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  isDev: process.env.NODE_ENV !== 'production',

  database: {
    uri: process.env.MONGODB_URI || 'mongodb://localhost:27017/watchman_tracker',
  },

  jwt: {
    secret: process.env.JWT_SECRET || 'fallback-secret-change-me',
    refreshSecret: process.env.JWT_REFRESH_SECRET || 'fallback-refresh-secret',
    expiresIn: process.env.JWT_EXPIRES_IN || '15m',
    refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d',
  },

  uploads: {
    dir: process.env.VERCEL ? '/tmp/uploads' : (process.env.UPLOADS_DIR || './uploads'),
    maxFileSizeMb: parseInt(process.env.MAX_FILE_SIZE_MB || '5', 10),
  },

  cors: {
    frontendUrl: process.env.FRONTEND_URL || 'http://localhost:5173',
  },

  geofence: {
    defaultRadius: parseInt(process.env.DEFAULT_GEOFENCE_RADIUS || '100', 10),
    maxAccuracyWarning: 50, // meters - warn if GPS accuracy worse than this
    maxAccuracyRejection: 200, // meters - reject if worse than this
  },
};
