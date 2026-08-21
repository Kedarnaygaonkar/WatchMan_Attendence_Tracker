import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { config } from '../config';
import { asyncHandler } from '../middleware/errorHandler';
import { authenticate } from '../middleware/auth';
import { JwtPayload } from '../types';
import { User, Agency, Watchman } from '../models';

const router = Router();

const loginSchema = z.object({
  email: z.string().email('Invalid email'),
  password: z.string().min(1, 'Password is required'),
});

/** Generate access + refresh tokens */
function generateTokens(payload: JwtPayload) {
  const accessToken = jwt.sign(payload, config.jwt.secret, {
    expiresIn: config.jwt.expiresIn as unknown as number,
  });
  const refreshToken = jwt.sign(payload, config.jwt.refreshSecret, {
    expiresIn: config.jwt.refreshExpiresIn as unknown as number,
  });
  return { accessToken, refreshToken };
}

/**
 * POST /api/auth/login
 * Authenticates a user and returns JWT tokens + user profile.
 */
router.post(
  '/login',
  asyncHandler(async (req: Request, res: Response) => {
    const parse = loginSchema.safeParse(req.body);
    if (!parse.success) {
      res.status(400).json({
        success: false,
        message: 'Invalid input',
        errors: parse.error.flatten().fieldErrors,
      });
      return;
    }

    const { email, password } = parse.data;

    // Fetch user with agency info
    const user = await User.findOne({ email: email.toLowerCase().trim() }).populate('agency_id').exec();

    if (!user) {
      res.status(401).json({ success: false, message: 'Invalid email or password' });
      return;
    }

    if (!user.is_active) {
      res.status(403).json({ success: false, message: 'Account is inactive. Please contact your agency.' });
      return;
    }

    // Check agency status (not applicable for super_admin)
    let agencyStatus = 'active';
    let agencyName = null;
    if (user.agency_id) {
      const agency = user.agency_id as any; // Populated doc
      agencyStatus = agency.status;
      agencyName = agency.name;
    }

    if (user.agency_id && agencyStatus !== 'active') {
      res.status(403).json({ success: false, message: 'Agency account is suspended.' });
      return;
    }

    const passwordMatch = await bcrypt.compare(password, user.password_hash);
    if (!passwordMatch) {
      res.status(401).json({ success: false, message: 'Invalid email or password' });
      return;
    }

    // Update last_login
    user.last_login = new Date();
    await user.save();

    // If watchman role, fetch watchman profile
    let watchmanProfile = null;
    if (user.role === 'watchman') {
      watchmanProfile = await Watchman.findOne({ user_id: user._id }).exec();

      if (!watchmanProfile || watchmanProfile.status !== 'active') {
        res.status(403).json({
          success: false,
          message: 'Your watchman account is inactive. Please contact your agency.',
        });
        return;
      }
    }

    // Build JWT payload
    const payload: JwtPayload = {
      userId: user.id,
      email: user.email,
      role: user.role,
      agencyId: user.agency_id ? (user.agency_id as any)._id.toString() : undefined,
    };
    if (watchmanProfile) {
      payload.watchmanId = watchmanProfile.id;
    }

    const tokens = generateTokens(payload);

    res.json({
      success: true,
      data: {
        ...tokens,
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
          agencyId: user.agency_id ? (user.agency_id as any)._id.toString() : null,
          agencyName,
          watchman: watchmanProfile ? {
            id: watchmanProfile.id,
            employee_id: watchmanProfile.employee_id,
            full_name: watchmanProfile.full_name,
            phone: watchmanProfile.phone,
            profile_photo_url: watchmanProfile.profile_photo_url,
            status: watchmanProfile.status,
          } : null,
        },
      },
    });
  })
);

/**
 * POST /api/auth/refresh
 * Refreshes an expired access token using a valid refresh token.
 */
router.post(
  '/refresh',
  asyncHandler(async (req: Request, res: Response) => {
    const { refreshToken } = req.body;
    if (!refreshToken) {
      res.status(400).json({ success: false, message: 'Refresh token is required' });
      return;
    }

    try {
      const decoded = jwt.verify(refreshToken, config.jwt.refreshSecret) as JwtPayload;

      // Verify user is still active
      const user = await User.findById(decoded.userId).populate('agency_id').exec();
      if (!user || !user.is_active) {
        throw new Error('User inactive or deleted');
      }

      if (user.agency_id) {
        const agency = user.agency_id as any;
        if (agency.status !== 'active') {
          throw new Error('Agency suspended');
        }
      }

      // Re-issue tokens
      const payload: JwtPayload = {
        userId: user.id,
        email: user.email,
        role: user.role,
        agencyId: user.agency_id ? (user.agency_id as any)._id.toString() : undefined,
        watchmanId: decoded.watchmanId,
      };

      const tokens = generateTokens(payload);
      res.json({ success: true, data: tokens });
    } catch (error) {
      res.status(401).json({ success: false, message: 'Invalid or expired refresh token' });
    }
  })
);

/**
 * GET /api/auth/me
 * Retrieves current user profile based on JWT.
 */
router.get(
  '/me',
  authenticate,
  asyncHandler(async (req: Request, res: Response) => {
    const user = await User.findById(req.user!.userId).populate('agency_id').exec();
    
    if (!user) {
      res.status(404).json({ success: false, message: 'User not found' });
      return;
    }

    let watchmanProfile = null;
    if (user.role === 'watchman') {
      watchmanProfile = await Watchman.findOne({ user_id: user._id }).exec();
    }

    let agencyName = null;
    if (user.agency_id) {
      agencyName = (user.agency_id as any).name;
    }

    res.json({
      success: true,
      data: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        agencyId: user.agency_id ? (user.agency_id as any)._id.toString() : null,
        agencyName,
        watchman: watchmanProfile ? {
          id: watchmanProfile.id,
          employee_id: watchmanProfile.employee_id,
          full_name: watchmanProfile.full_name,
          phone: watchmanProfile.phone,
          profile_photo_url: watchmanProfile.profile_photo_url,
          status: watchmanProfile.status,
        } : null,
      },
    });
  })
);

export default router;
