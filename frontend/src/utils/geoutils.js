// Geocode utility (OpenStreetMap Nominatim)
export async function geocodeLocation(locationText) {
  const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(locationText)}`;
  try {
    const res = await fetch(url);
    const results = await res.json();
    if (results && results.length > 0) {
      return [parseFloat(results[0].lat), parseFloat(results[0].lon)];
    }
  } catch (error) {
    console.error('Geocoding error:', error);
  }
  return null;
}

// Get color based on fire detection confidence level
export function getFireColor(confidence) {
  const value = Math.min(100, Math.max(0, confidence || 0));
  if (value > 80) return '#ff0000';     // Red for high confidence
  if (value > 60) return '#ff6600';     // Orange-red
  if (value > 40) return '#ff9900';     // Orange
  if (value > 20) return '#ffcc00';     // Yellow-orange
  return '#ffff00';                     // Yellow for low confidence
}

// Format coordinate for display
export function formatCoordinate(coord, isLat) {
  const absCoord = Math.abs(coord);
  const degrees = Math.floor(absCoord);
  const minutes = Math.floor((absCoord - degrees) * 60);
  const seconds = ((absCoord - degrees - minutes / 60) * 3600).toFixed(1);
  const direction = coord >= 0 
    ? isLat ? 'N' : 'E'
    : isLat ? 'S' : 'W';
    
  return `${degrees}°${minutes}'${seconds}"${direction}`;
}

/**
 * Gets the cardinal direction from an angle in degrees
 * @param {number} angle - Angle in degrees (0-360)
 * @returns {string} Cardinal direction (e.g., "N", "NE", "E", etc.)
 */
export function getCardinalDirection(angle) {
  const directions = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
  return directions[Math.round(angle / 22.5) % 16] || '';
}

/**
 * Formats a distance in meters to a human-readable string
 * @param {number} meters - Distance in meters
 * @returns {string} Formatted distance (e.g., "1.2 km" or "500 m")
 */
export function formatDistance(meters) {
  if (meters < 1000) {
    return `${Math.round(meters)} meters`;
  }
  return `${(meters / 1000).toFixed(1)} kilometers`;
}

// Default coordinates (San Francisco)
export const DEFAULT_COORDS = [37.7749, -122.4194];
