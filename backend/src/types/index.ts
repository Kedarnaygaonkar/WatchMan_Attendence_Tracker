/**
 * Shared type definitions for the API layer.
 * These match the database schema and are used across routes and services.
 */

export type UserRole = 'super_admin' | 'agency_admin' | 'watchman';

export type AttendanceStatus = 'present' | 'late' | 'absent' | 'rejected';

export type VerificationStatus =
  | 'verified'
  | 'warning'
  | 'suspicious'
  | 'review_required'
  | 'rejected';

export type WatchmanStatus = 'active' | 'inactive' | 'suspended';

export type AgencyStatus = 'active' | 'inactive' | 'suspended';

export type ReplacementStatus = 'pending' | 'active' | 'completed' | 'cancelled';

export interface JwtPayload {
  userId: string;
  agencyId?: string;
  role: UserRole;
  email: string;
  name?: string;
  watchmanId?: string;
}

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  message?: string;
  errors?: Record<string, string>;
}

export interface PaginationQuery {
  page?: number;
  limit?: number;
  search?: string;
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}
