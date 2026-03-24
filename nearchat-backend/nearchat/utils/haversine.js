/**
 * utils/haversine.js
 * 
 * Haversine formula — calculates the great-circle distance between two
 * points on a sphere given their lat/lon coordinates.
 * 
 * Formula:
 *   a = sin²(Δlat/2) + cos(lat1) · cos(lat2) · sin²(Δlon/2)
 *   c = 2 · atan2(√a, √(1−a))
 *   d = R · c
 *
 * Where R = 6,371 km (Earth's mean radius).
 */

const EARTH_RADIUS_KM = 6371;
const EARTH_RADIUS_MILES = 3958.8;

/**
 * Convert degrees to radians
 * @param {number} deg
 * @returns {number}
 */
function toRad(deg) {
  return deg * (Math.PI / 180);
}

/**
 * Calculate distance between two coordinates using the Haversine formula.
 * @param {number} lat1 - Latitude of point 1 (degrees)
 * @param {number} lon1 - Longitude of point 1 (degrees)
 * @param {number} lat2 - Latitude of point 2 (degrees)
 * @param {number} lon2 - Longitude of point 2 (degrees)
 * @param {'km'|'miles'|'meters'} unit - Output unit (default: 'km')
 * @returns {number} Distance in the requested unit
 */
function haversine(lat1, lon1, lat2, lon2, unit = 'km') {
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  const R = unit === 'miles' ? EARTH_RADIUS_MILES : EARTH_RADIUS_KM;
  const distance = R * c;

  return unit === 'meters' ? distance * 1000 : distance;
}

/**
 * Format a raw distance into a human-readable string.
 * @param {number} meters - Distance in meters
 * @returns {string} e.g. "120m", "2.4km", "14,230km"
 */
function formatDistance(meters) {
  if (meters < 1000) {
    return `${Math.round(meters)}m`;
  }
  const km = meters / 1000;
  if (km < 100) {
    return `${km.toFixed(1)}km`;
  }
  return `${Math.round(km).toLocaleString()}km`;
}

/**
 * Scope radius limits in meters.
 * Used to determine which "scope bucket" two users fall into.
 */
const SCOPE_RADIUS = {
  area:  2_000,        //    2 km  — neighbourhood / block
  city:  50_000,       //   50 km  — city / metro
  state: 500_000,      //  500 km  — state / region
  world: Infinity,     //  ∞       — global
};

/**
 * Determine the tightest scope that covers the given distance.
 * @param {number} distanceMeters
 * @returns {'area'|'city'|'state'|'world'}
 */
function scopeForDistance(distanceMeters) {
  if (distanceMeters <= SCOPE_RADIUS.area)  return 'area';
  if (distanceMeters <= SCOPE_RADIUS.city)  return 'city';
  if (distanceMeters <= SCOPE_RADIUS.state) return 'state';
  return 'world';
}

/**
 * Filter an array of users by scope and sort by distance (ascending).
 * @param {{ lat, lon, ...rest }[]} users
 * @param {number} myLat
 * @param {number} myLon
 * @param {'area'|'city'|'state'|'world'} scope
 * @returns {{ ...user, distanceMeters, distanceLabel, scope }[]}
 */
function filterUsersByScope(users, myLat, myLon, scope) {
  const maxRadius = SCOPE_RADIUS[scope];

  return users
    .map(user => {
      const distanceMeters = haversine(myLat, myLon, user.lat, user.lon, 'meters');
      return {
        ...user,
        distanceMeters,
        distanceLabel: formatDistance(distanceMeters),
        scope: scopeForDistance(distanceMeters),
      };
    })
    .filter(user => user.distanceMeters <= maxRadius)
    .sort((a, b) => a.distanceMeters - b.distanceMeters);
}

module.exports = {
  haversine,
  formatDistance,
  filterUsersByScope,
  scopeForDistance,
  SCOPE_RADIUS,
};
