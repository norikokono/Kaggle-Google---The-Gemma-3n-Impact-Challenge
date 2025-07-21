import pytz
from timezonefinder import TimezoneFinder
from datetime import datetime

# North America bounding box (approximate)
NORTH_AMERICA_BOUNDS = {
    'min_lat': 5,   # Southernmost (Panama)
    'max_lat': 83,  # Northernmost (Greenland/Canada)
    'min_lng': -168, # Westernmost (Alaska)
    'max_lng': -52   # Easternmost (Newfoundland)
}

def get_timezone_name(lat, lng):
    """Return timezone name for given lat/lng, or None if not in North America."""
    if not (NORTH_AMERICA_BOUNDS['min_lat'] <= lat <= NORTH_AMERICA_BOUNDS['max_lat'] and NORTH_AMERICA_BOUNDS['min_lng'] <= lng <= NORTH_AMERICA_BOUNDS['max_lng']):
        return None
    tf = TimezoneFinder()
    return tf.timezone_at(lng=lng, lat=lat)

def get_local_time(lat, lng, dt_utc=None):
    tz_name = get_timezone_name(lat, lng)
    if not tz_name:
        return None, None, None
    tz = pytz.timezone(tz_name)
    if dt_utc is None:
        dt_utc = datetime.utcnow().replace(tzinfo=pytz.utc)
    dt_local = dt_utc.astimezone(tz)
    return dt_local.strftime('%Y-%m-%d'), dt_local.strftime('%H:%M'), dt_local.tzname()
