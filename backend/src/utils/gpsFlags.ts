/**
 * GPS Security Flag Detection
 *
 * Flags suspicious GPS scenarios without blocking legitimate use.
 * Each flag is stored in attendance.gps_flags as a JSON array.
 *
 * Flags:
 *   poor_accuracy        - GPS accuracy is worse than threshold (unreliable)
 *   very_poor_accuracy   - GPS accuracy so bad it may indicate no real GPS
 *   far_outside_geofence - Location is many times outside allowed radius
 *   impossible_jump      - Speed from last known location is physically impossible
 *   possible_emulator    - User agent or behavior suggests an emulator
 *
 * Verification status mapping:
 *   no flags             → 'verified'
 *   poor_accuracy only   → 'warning'
 *   far_outside          → 'suspicious'
 *   impossible_jump      → 'suspicious'
 *   very_poor_accuracy   → 'review_required'
 */

import { haversineDistance } from './haversine';

export type GpsFlag =
  | 'poor_accuracy'
  | 'very_poor_accuracy'
  | 'far_outside_geofence'
  | 'impossible_jump'
  | 'possible_emulator';

export type VerificationStatus =
  | 'verified'
  | 'warning'
  | 'suspicious'
  | 'review_required'
  | 'rejected';

export interface GpsAnalysisInput {
  accuracy: number;          // GPS accuracy in meters
  distance: number;          // Distance from society center in meters
  societyRadius: number;     // Allowed radius in meters
  userAgent?: string;
  // Optional: previous known location for jump detection
  previousLocation?: {
    lat: number;
    lon: number;
    timestamp: Date;
  };
  currentLocation?: {
    lat: number;
    lon: number;
    timestamp: Date;
  };
}

export interface GpsAnalysisResult {
  flags: GpsFlag[];
  verificationStatus: VerificationStatus;
  isSuspicious: boolean;
}

const ACCURACY_WARNING_THRESHOLD = 50;    // meters — warn
const ACCURACY_REJECT_THRESHOLD = 500;    // meters — too unreliable
const FAR_OUTSIDE_MULTIPLIER = 3;         // 3x the allowed radius
const MAX_REALISTIC_SPEED_KMH = 200;      // km/h (faster = impossible without plane)

export function analyzeGpsFlags(input: GpsAnalysisInput): GpsAnalysisResult {
  const flags: GpsFlag[] = [];

  // ── Accuracy checks ──────────────────────────────────────────
  if (input.accuracy > ACCURACY_REJECT_THRESHOLD) {
    flags.push('very_poor_accuracy');
  } else if (input.accuracy > ACCURACY_WARNING_THRESHOLD) {
    flags.push('poor_accuracy');
  }

  // ── Distance checks ───────────────────────────────────────────
  if (input.distance > input.societyRadius * FAR_OUTSIDE_MULTIPLIER) {
    flags.push('far_outside_geofence');
  }

  // ── Impossible jump detection ──────────────────────────────────
  if (input.previousLocation && input.currentLocation) {
    const distanceTraveled = haversineDistance(
      input.previousLocation.lat,
      input.previousLocation.lon,
      input.currentLocation.lat,
      input.currentLocation.lon
    );

    const timeDiffMs =
      input.currentLocation.timestamp.getTime() -
      input.previousLocation.timestamp.getTime();

    if (timeDiffMs > 0) {
      const speedMs = distanceTraveled / (timeDiffMs / 1000); // meters/second
      const speedKmh = speedMs * 3.6;

      if (speedKmh > MAX_REALISTIC_SPEED_KMH) {
        flags.push('impossible_jump');
      }
    }
  }

  // ── Emulator / fake GPS detection (basic heuristics) ─────────
  if (input.userAgent) {
    const ua = input.userAgent.toLowerCase();
    if (ua.includes('emulator') || ua.includes('android sdk built for x86')) {
      flags.push('possible_emulator');
    }
  }

  // ── Determine overall verification status ────────────────────
  const verificationStatus = computeVerificationStatus(flags);

  return {
    flags,
    verificationStatus,
    isSuspicious:
      verificationStatus === 'suspicious' ||
      verificationStatus === 'review_required',
  };
}

function computeVerificationStatus(flags: GpsFlag[]): VerificationStatus {
  if (flags.includes('impossible_jump')) return 'suspicious';
  if (flags.includes('possible_emulator')) return 'suspicious';
  if (flags.includes('far_outside_geofence')) return 'suspicious';
  if (flags.includes('very_poor_accuracy')) return 'review_required';
  if (flags.includes('poor_accuracy')) return 'warning';
  return 'verified';
}
