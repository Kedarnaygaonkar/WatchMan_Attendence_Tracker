import { Request, Response, NextFunction } from 'express';
import { config } from '../config';

/**
 * Global error handler middleware.
 * Catches unhandled errors and returns consistent JSON responses.
 * Never leaks stack traces to watchman role.
 */
export function errorHandler(
  err: Error & { statusCode?: number; isOperational?: boolean },
  req: Request,
  res: Response,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _next: NextFunction
): void {
  const statusCode = err.statusCode || 500;
  const isWatchman = req.user?.role === 'watchman';

  if (config.isDev) {
    console.error('❌ Error:', err);
  }

  // Watchmen get friendly messages, not technical details
  if (isWatchman || statusCode === 500) {
    res.status(statusCode).json({
      success: false,
      message: isWatchman
        ? 'Something went wrong. Please try again.'
        : config.isDev
        ? err.message
        : 'Internal server error',
    });
    return;
  }

  res.status(statusCode).json({
    success: false,
    message: err.message || 'An error occurred',
  });
}

/**
 * Helper to create operational errors with HTTP status codes
 */
export class AppError extends Error {
  statusCode: number;
  isOperational: boolean;

  constructor(message: string, statusCode: number) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = true;
    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * Async route handler wrapper — catches async errors and passes to next()
 */
export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>
) {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

import { AuditLog } from '../models/AuditLog';

/**
 * Audit log helper — records important actions
 */
export async function logAudit(
  _pool: any, // kept for backward compatibility if needed, though we passed null as any
  {
    agencyId,
    userId,
    action,
    entityType,
    entityId,
    oldValues,
    newValues,
    req,
  }: {
    agencyId: string | null;
    userId: string;
    action: string;
    entityType: string;
    entityId?: string;
    oldValues?: any;
    newValues?: any;
    req?: Request;
  }
) {
  try {
    await AuditLog.create({
      agency_id: agencyId || undefined,
      user_id: userId,
      action,
      entity_type: entityType,
      entity_id: entityId,
      old_values: oldValues,
      new_values: newValues,
      ip_address: req?.ip,
      user_agent: req?.headers['user-agent'],
    });
  } catch (err) {
    // Never let audit log failure break the main flow
    console.error('Audit log failed:', err);
  }
}
