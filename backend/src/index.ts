import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import path from 'path';
import { config } from './config';
import { errorHandler } from './middleware/errorHandler';
import { connectDB } from './config/database';

// MongoDB connection is handled via middleware for serverless compatibility

// Routes
import authRoutes from './routes/auth';
import societiesRoutes from './routes/societies';
import watchmenRoutes from './routes/watchmen';
import shiftsRoutes from './routes/shifts';
import assignmentsRoutes from './routes/assignments';
import attendanceRoutes from './routes/attendance';
import dashboardRoutes from './routes/dashboard';
import reportsRoutes from './routes/reports';
import replacementsRoutes from './routes/replacements';
import gatesRoutes from './routes/gates';
import scanRoutes from './routes/scan';
import deliveryRoutes from './routes/delivery';
import agenciesRoutes from './routes/agencies';

const app = express();

// ── Database Connection Middleware (Serverless Safe) ──
app.use(async (_req, _res, next) => {
  await connectDB();
  next();
});

// ── Security middleware ───────────────────────────────────────────────
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' }, // Allow serving uploads
}));

app.use(cors({
  origin: (origin, callback) => {
    // Allow localhost, the explicit FRONTEND_URL, any vercel.app domain, or tools without origin (like Postman)
    if (!origin || origin.includes('localhost') || origin.includes('vercel.app') || origin === config.cors.frontendUrl) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

// ── Rate limiting ─────────────────────────────────────────────────────
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20, // Max 20 login attempts per IP per 15 minutes
  message: { success: false, message: 'Too many login attempts. Please wait 15 minutes.' },
});

const attendanceLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 10, // Max 10 attendance submissions per minute
  message: { success: false, message: 'Too many requests. Please try again.' },
});

// ── Body parsers ──────────────────────────────────────────────────────
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// ── Static files (uploads) ────────────────────────────────────────────
app.use('/uploads', express.static(path.resolve(config.uploads.dir)));

// ── Root & Health check ───────────────────────────────────────────────
app.get('/', (_req, res) => {
  res.json({ success: true, message: 'Watchman Tracker API is live!' });
});

app.get('/api/health', (_req, res) => {
  res.json({ success: true, message: 'Watchman Tracker API is running', timestamp: new Date() });
});

// ── API Routes ────────────────────────────────────────────────────────
app.use('/api/auth', authLimiter, authRoutes);
app.use('/api/agencies', agenciesRoutes);
app.use('/api/societies', societiesRoutes);
app.use('/api/watchmen', watchmenRoutes);
app.use('/api/shifts', shiftsRoutes);
app.use('/api/assignments', assignmentsRoutes);
app.use('/api/attendance', attendanceLimiter, attendanceRoutes);
app.use('/api/gates', gatesRoutes);
app.use('/api/scan', attendanceLimiter, scanRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/reports', reportsRoutes);
app.use('/api/replacements', replacementsRoutes);
app.use('/api/delivery', deliveryRoutes);

// ── 404 handler ───────────────────────────────────────────────────────
app.use((_req, res) => {
  res.status(404).json({ success: false, message: 'Route not found' });
});

// ── Global error handler ──────────────────────────────────────────────
app.use(errorHandler);

// ── Start server (Only locally, Vercel uses the exported app) ──
if (process.env.NODE_ENV !== 'production' || process.env.VERCEL !== '1') {
  app.listen(config.port, () => {
    console.log('');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('  🛡️  Watchman Tracker API');
    console.log(`  🚀 Running on http://localhost:${config.port}`);
    console.log(`  📁 Uploads: ${path.resolve(config.uploads.dir)}`);
    console.log(`  🌍 Environment: ${config.nodeEnv}`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  });
}

export default app;
