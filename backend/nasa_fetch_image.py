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
    import traceback
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
    if api_key == 'DEMO_KEY':
        print("[NASA Fetch] Warning: Using DEMO_KEY. This is heavily rate-limited. Set NASA_API_KEY for production use.")
    print(f"[NASA Fetch] Requesting: {base_url} with params {params}")

    for attempt in range(retries):
        try:
            resp = requests.get(base_url, params=params, timeout=30)
            print(f"[NASA Fetch] Response: {resp.status_code} {resp.headers.get('Content-Type')}")
            if resp.status_code == 200 and resp.headers.get('Content-Type', '').startswith('image'):
                with open(out_path, 'wb') as f:
                    f.write(resp.content)
                print(f"[NASA Fetch] Saved satellite image to {out_path}")
                return out_path
            else:
                print(f"[NASA Fetch] Failed to fetch image: {resp.status_code} {resp.text[:300]}")
                return None
        except requests.exceptions.ReadTimeout as e:
            print(f"[NASA Fetch] Timeout occurred (attempt {attempt+1}/{retries}): {e}")
            if attempt < retries - 1:
                time.sleep(2 ** attempt)  # Exponential backoff
            else:
                print("[NASA Fetch] Max retries reached. NASA API is not responding.")
                return None
        except Exception as e:
            print(f"[NASA Fetch] Exception during image fetch: {e}")
            traceback.print_exc()
            return None

if __name__ == '__main__':
    import sys
    lat = float(sys.argv[1])
    lon = float(sys.argv[2])
    out_path = sys.argv[3] if len(sys.argv) > 3 else 'nasa_test_image.png'
    fetch_nasa_earth_image(lat, lon, out_path)
