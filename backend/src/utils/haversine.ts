/**
 * Haversine formula to calculate distance between two GPS coordinates.
 * Returns distance in meters.
 *
 * Formula accounts for Earth's curvature and is accurate enough for
 * short distances (< 1km) used in geofencing.
 */

const EARTH_RADIUS_METERS = 6371000; // 6,371 km

export function haversineDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;

  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return EARTH_RADIUS_METERS * c; // distance in meters
}

/**
 * Check whether a watchman's GPS location is within the society's geofence.
 *
 * @param watchmanLat  Current latitude of watchman
 * @param watchmanLon  Current longitude of watchman
 * @param societyLat   Society's center latitude
 * @param societyLon   Society's center longitude
 * @param radiusMeters Allowed radius in meters (from society record)
 * @returns Object with distance and whether it's within the geofence
 */
export function checkGeofence(
  watchmanLat: number,
  watchmanLon: number,
  societyLat: number,
  societyLon: number,
  radiusMeters: number
): { distance: number; isInside: boolean } {
  const distance = haversineDistance(
    watchmanLat,
    watchmanLon,
    societyLat,
    societyLon
  );

  return {
    distance: Math.round(distance * 100) / 100, // Round to cm
    isInside: distance <= radiusMeters,
  };
}
