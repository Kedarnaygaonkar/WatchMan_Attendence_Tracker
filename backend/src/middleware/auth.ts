import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config';
import { JwtPayload, UserRole } from '../types';

// Extend Express Request to carry authenticated user data
declare global {
  namespace Express {
    interface Request {
      user?: JwtPayload;
    }
  }
}

/**
 * Middleware: verify JWT access token.
 * Attaches decoded user payload to req.user.
 */
export function authenticate(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ success: false, message: 'Authentication required' });
    return;
  }

  const token = authHeader.split(' ')[1];

  try {
    const decoded = jwt.verify(token, config.jwt.secret) as JwtPayload;
    req.user = decoded;
    next();
  } catch {
    res.status(401).json({ success: false, message: 'Invalid or expired token' });
  }
}

/**
 * Middleware factory: restrict access to specific roles.
 * Usage: requireRole('agency_admin') or requireRole(['agency_admin', 'super_admin'])
 */
export function requireRole(roles: UserRole | UserRole[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ success: false, message: 'Authentication required' });
      return;
    }

    const allowedRoles = Array.isArray(roles) ? roles : [roles];
    if (!allowedRoles.includes(req.user.role)) {
      res.status(403).json({ success: false, message: 'Access denied' });
      return;
    }

    next();
  };
}

/**
 * Middleware: ensure agency_admin can only access their own agency's data.
 * Attach agencyId to req for use in route handlers.
 *
 * Super admin can optionally filter by agency_id query param.
 */
export function enforceAgencyScope(req: Request, res: Response, next: NextFunction): void {
  if (!req.user) {
    res.status(401).json({ success: false, message: 'Authentication required' });
    return;
  }

  if (req.user.role === 'super_admin') {
    // Super admin — no restriction, pass through
    next();
    return;
  }

  if (req.user.role === 'agency_admin' || req.user.role === 'watchman') {
    if (!req.user.agencyId) {
      res.status(403).json({ success: false, message: 'No agency associated with this account' });
      return;
    }
    // Force agency scope — override any passed agency_id param to prevent cross-agency access
    req.body.agencyId = req.user.agencyId;
    next();
    return;
  }

  res.status(403).json({ success: false, message: 'Access denied' });
}
