import os
import requests
from pathlib import Path

def fetch_nasa_earth_image(lat, lon, out_path, dim=0.15, date=None):
    """
    Fetch a true-color satellite image from NASA Earth API for given lat/lon.
    Args:
        lat (float): Latitude
        lon (float): Longitude
        out_path (str): Where to save the output PNG
        dim (float): Width and height of image in degrees (default 0.15)
        date (str): Date in YYYY-MM-DD (optional, defaults to today)
    """
    api_key = os.environ.get('NASA_API_KEY', 'DEMO_KEY')
    base_url = "https://api.nasa.gov/planetary/earth/imagery"
    params = {
        'lat': lat,
        'lon': lon,
        'dim': dim,  # size of image in degrees
        'api_key': api_key
    }
    if date:
        params['date'] = date
    resp = requests.get(base_url, params=params)
    if resp.status_code == 200 and resp.headers['Content-Type'].startswith('image'):
        with open(out_path, 'wb') as f:
            f.write(resp.content)
        print(f"Saved NASA Earth satellite image to {out_path}")
        return out_path
    else:
        print(f"Failed to fetch image: {resp.status_code} {resp.text}")
        return None

if __name__ == '__main__':
    import sys
    lat = float(sys.argv[1])
    lon = float(sys.argv[2])
    out_path = sys.argv[3] if len(sys.argv) > 3 else 'nasa_test_image.png'
    fetch_nasa_earth_image(lat, lon, out_path)
