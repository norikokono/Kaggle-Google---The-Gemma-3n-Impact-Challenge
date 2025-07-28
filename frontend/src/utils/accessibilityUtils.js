/**
 * Gets the cardinal direction from an angle in degrees
 * @param {number} angle - Angle in degrees (0-360)
 * @returns {string} Cardinal direction (e.g., "N", "NE", "E", etc.)
 */
export const getCardinalDirection = (angle) => {
  const directions = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
  return directions[Math.round(angle / 22.5) % 16] || '';
};

/**
 * Formats a distance in meters to a human-readable string
 * @param {number} meters - Distance in meters
 * @returns {string} Formatted distance (e.g., "1.2 km" or "500 m")
 */
export const formatDistance = (meters) => {
  if (meters < 1000) {
    return `${Math.round(meters)} meters`;
  }
  return `${(meters / 1000).toFixed(1)} kilometers`;
};

/**
 * Gets a human-readable description of a fire's severity
 * @param {Object} fire - Fire detection object
 * @returns {string} Severity description (e.g., "low", "medium", "high")
 */
export const getFireSeverity = (fire) => {
  const confidence = fire.confidence || 0;
  const brightness = fire.brightness || 0;
  
  if (confidence > 80 || brightness > 330) return 'high';
  if (confidence > 50 || brightness > 310) return 'medium';
  return 'low';
};

/**
 * Gets a human-readable description of a date
 * @param {string} dateString - Date string in ISO format
 * @returns {string} Formatted date (e.g., "today", "yesterday", "2 days ago")
 */
export const getRelativeDate = (dateString) => {
  if (!dateString) return 'an unknown date';
  
  const date = new Date(dateString);
  const now = new Date();
  const diffTime = Math.abs(now - date);
  const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
  
  if (diffDays === 0) return 'today';
  if (diffDays === 1) return 'yesterday';
  if (diffDays < 7) return `${diffDays} days ago`;
  return `on ${date.toLocaleDateString()}`;
};
