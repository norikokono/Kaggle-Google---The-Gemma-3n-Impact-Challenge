import os
import time
import json
import requests
import folium
import folium.plugins  # For MiniMap and other plugins
from pathlib import Path
from datetime import datetime, timedelta
import numpy as np
from io import BytesIO
from PIL import Image, ImageDraw, ImageFont
import matplotlib.pyplot as plt
import matplotlib.dates as mdates
from matplotlib.patches import Rectangle

# Number of retry attempts for fetching NASA images
MAX_RETRIES = 3

def create_fire_map(lat, lon, fire_data, out_path, width_km=50, height_km=50, zoom_start=10):
    """
    Create a fire map using folium with fire data.
    
    Args:
        lat (float): Center latitude
        lon (float): Center longitude
        fire_data (list): List of fire detections
        out_path (str): Path to save the map HTML
        width_km (int): Map width in km
        height_km (int): Map height in km
        zoom_start (int): Initial zoom level
    """
    # Create a map centered at the given coordinates
    m = folium.Map(location=[lat, lon], zoom_start=zoom_start, 
                  tiles='https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
                  attr='Esri World Imagery')
    
    # Add fire markers
    for fire in fire_data:
        # Get the acquisition date and time, handling different possible field names
        acq_date = fire.get('acq_date', fire.get('acq_date_time', 'N/A'))
        if isinstance(acq_date, str) and 'T' in acq_date:
            acq_date = acq_date.split('T')[0]  # Just show the date part if it's a timestamp
            
        # Get the confidence value, handling different possible field names
        confidence = fire.get('confidence', fire.get('confidence_final', fire.get('confidence_final_fire', 'N/A')))
        
        # Create the popup content
        popup_content = f"Date: {acq_date}"
        if confidence != 'N/A':
            popup_content += f"<br>Confidence: {confidence}"
        
        # Add fire radiative power if available
        if 'frp' in fire and fire['frp']:
            popup_content += f"<br>Fire Power: {fire['frp']} MW"
        
        # Add the marker to the map
        folium.CircleMarker(
            location=[fire['latitude'], fire['longitude']],
            radius=3,
            color='red',
            fill=True,
            fill_color='red',
            fill_opacity=0.7,
            popup=popup_content
        ).add_to(m)
    
    # Add a scale bar
    folium.plugins.MiniMap(tile_layer='Esri.WorldStreetMap', position='bottomright').add_to(m)
    
    # Save the map to HTML
    m.save(out_path)
    return out_path

def fetch_nasa_firms_data(lat, lon, days_back=7, distance_km=50):
    """
    Fetch fire data from NASA FIRMS API.
    
    Args:
        lat (float): Center latitude
        lon (float): Center longitude
        days_back (int): Number of past days to fetch data for
        distance_km (int): Search radius in kilometers
        
    Returns:
        list: List of fire detections
    """
    # Calculate date range
    end_date = datetime.utcnow()
    start_date = end_date - timedelta(days=days_back)
    
    # FIRMS API endpoint
    base_url = "https://firms.modaps.eosdis.nasa.gov/api/area/csv"
    
    # FIRMS API key (use DEMO_KEY for testing, but it's rate-limited)
    api_key = os.environ.get('NASA_FIRMS_API_KEY', 'DEMO_KEY')
    
    # Request parameters
    params = {
        'source': 'MODIS_NRT',  # or 'VIIRS_SNPP_NRT' for higher resolution but less frequent
        'area': f"{lat},{lon},{distance_km}",
        'start_date': start_date.strftime('%Y-%m-%d'),
        'end_date': end_date.strftime('%Y-%m-%d'),
        'api_key': api_key
    }
    
    if api_key == 'DEMO_KEY':
        print("[FIRMS API] Using DEMO_KEY. This is heavily rate-limited. Set NASA_FIRMS_API_KEY for production use.")
    
    print(f"[FIRMS API] Requesting fire data for {lat}, {lon} (last {days_back} days)")
    
    try:
        response = requests.get(base_url, params=params, timeout=30)
        if response.status_code == 200:
            # Parse CSV response
            lines = response.text.split('\n')
            if len(lines) < 2:  # Only header or empty
                print("[FIRMS API] No fire data found for the specified area and date range")
                return []
                
            # Parse CSV (skip header)
            headers = [h.strip('"') for h in lines[0].split(',')]
            fires = []
            for line in lines[1:]:
                if not line.strip():
                    continue
                values = [v.strip('"') for v in line.split(',')]
                fire = dict(zip(headers, values))
                try:
                    # Convert numeric fields
                    fire['latitude'] = float(fire.get('latitude', 0))
                    fire['longitude'] = float(fire.get('longitude', 0))
                    fire['bright_ti4'] = float(fire.get('bright_ti4', 0))  # Fire radiative power
                    fire['frp'] = float(fire.get('frp', 0))  # Fire radiative power
                    fire['confidence'] = fire.get('confidence', 'n/a')
                    fires.append(fire)
                except (ValueError, KeyError) as e:
                    print(f"[FIRMS API] Error parsing fire data: {e}")
                    continue
            
            print(f"[FIRMS API] Found {len(fires)} fire detections")
            return fires
            
        else:
            print(f"[FIRMS API] Error {response.status_code}: {response.text}")
            return []
            
    except Exception as e:
        print(f"[FIRMS API] Exception: {e}")
        return []

def fetch_nasa_firms_image(lat, lon, out_path, width_deg=1.0, height_deg=1.0, days_back=7):
    """
    Fetch a fire map image using NASA FIRMS data and create a visualization.
    
    Args:
        lat (float): Center latitude (-90 to 90)
        lon (float): Center longitude (-180 to 180)
        out_path (str): Where to save the output HTML
        width_deg (float): Width of the map in degrees (0.1 to 50.0, default 1.0)
        height_deg (float): Height of the map in degrees (0.1 to 50.0, default 1.0)
        days_back (int): Number of days of fire data to include (1-10, default 7)
    """
    try:
        # Calculate search radius in km (approximate)
        distance_km = int(max(width_deg, height_deg) * 111)  # ~111 km per degree
        
        # Fetch fire data
        fire_data = fetch_nasa_firms_data(lat, lon, days_back=days_back, distance_km=distance_km)
        
        if not fire_data:
            print("[FIRMS] No fire data available to create map")
            return None
            
        # Create a map with fire data
        map_path = out_path.replace('.png', '.html')
        create_fire_map(lat, lon, fire_data, map_path)
        
        print(f"[FIRMS] Fire map created at: {map_path}")
        return map_path
        
        print(f"[FIRMS Fetch] Requesting fire map for {lat}, {lon} from {start_str} to {end_str}")
        
        # Create output directory if it doesn't exist
        output_dir = Path(out_path).parent
        output_dir.mkdir(parents=True, exist_ok=True)
        
        # Return the path to the generated map
        return out_path
        
    except Exception as e:
        print(f"[FIRMS] Exception: {e}")
        import traceback
        traceback.print_exc()
        return None

# Keep the old function name for backward compatibility
fetch_nasa_earth_image = fetch_nasa_firms_image

# Add required dependencies to requirements.txt
def add_requirements():
    requirements = [
        'folium>=0.12.0',
        'matplotlib>=3.3.0',
        'pillow>=8.0.0',
        'numpy>=1.19.0',
        'requests>=2.25.0'
    ]
    
    req_path = Path(__file__).parent / 'requirements.txt'
    with open(req_path, 'a') as f:
        for req in requirements:
            f.write(f"{req}\n")

def fetch_fire_map(lat, lon, days=7, output_path=None):
    """
    Fetch fire data and generate an interactive fire map.
    
    Args:
        lat (float): Center latitude
        lon (float): Center longitude
        days (int): Number of days of fire data to include
        output_path (str): Path to save the HTML map. If None, generates a temp file.
        
    Returns:
        str: Path to the generated HTML file
    """
    try:
        if output_path is None:
            import tempfile
            output_path = tempfile.mktemp(suffix='.html')
            
        # Fetch fire data
        fire_data = fetch_nasa_firms_data(lat, lon, days_back=days)
        
        if not fire_data:
            print("No fire data available for the specified location and time range.")
            return None
            
        # Create the map
        map_path = create_fire_map(
            lat=lat,
            lon=lon,
            fire_data=fire_data,
            out_path=output_path,
            width_km=100,  # 100km width
            height_km=100,  # 100km height
            zoom_start=9
        )
        
        print(f"Fire map generated successfully at: {map_path}")
        return map_path
        
    except Exception as e:
        print(f"Error generating fire map: {str(e)}")
        import traceback
        traceback.print_exc()
        return None

if __name__ == '__main__':
    import sys
    if len(sys.argv) < 3:
        print("Usage: python nasa_fetch_image.py <latitude> <longitude> [output_path]")
        print("Example: python nasa_fetch_image.py 37.7749 -122.4194 fire_map.html")
        sys.exit(1)
        
    lat = float(sys.argv[1])
    lon = float(sys.argv[2])
    out_path = sys.argv[3] if len(sys.argv) > 3 else 'fire_map.html'
    
    # Add dependencies to requirements.txt
    try:
        add_requirements()
    except Exception as e:
        print(f"Note: Could not update requirements.txt: {e}")
    
    # Generate the fire map
    result = fetch_nasa_earth_image(lat, lon, out_path)
    if result:
        print(f"✅ Successfully created fire map: {result}")
        print("Open this file in a web browser to view the interactive map.")
    else:
        print("❌ Failed to create fire map")
