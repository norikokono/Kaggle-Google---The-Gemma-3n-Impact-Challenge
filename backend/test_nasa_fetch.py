#!/usr/bin/env python3
"""
Test script for NASA FIRMS fire map fetching functionality.
"""
import os
import sys
import webbrowser
from pathlib import Path
from nasa_fetch_image import fetch_nasa_firms_image, fetch_nasa_firms_data

def main():
    # Test with San Francisco coordinates
    lat = 37.7749
    lon = -122.4194
    output_file = "test_firms_map.html"  # Changed to HTML for the interactive map
    
    print(f"Testing NASA FIRMS Fire Map Fetch for coordinates: {lat}, {lon}")
    print(f"Output will be saved to: {output_file}")
    print("This may take a moment as we fetch the latest fire data...")
    
    # Ensure the output directory exists
    output_path = Path(output_file)
    
    # First, test fetching just the fire data
    print("\n[1/2] Fetching fire data from NASA FIRMS...")
    fire_data = fetch_nasa_firms_data(lat, lon, days_back=7, distance_km=50)
    
    if not fire_data:
        print("❌ No fire data available. The service might be down or there are no active fires in the area.")
        return 1
    
    print(f"✅ Found {len(fire_data)} fire detections in the area")
    
    # Now generate the interactive map
    print("\n[2/2] Generating interactive fire map...")
    result = fetch_nasa_firms_image(
        lat=lat,
        lon=lon,
        out_path=str(output_path),
        width_deg=1.0,    # 1 degree width (~111km at equator)
        height_deg=1.0,   # 1 degree height
        days_back=7       # Last 7 days of fire data
    )
    
    if result and output_path.exists():
        print(f"✅ Successfully created fire map: {result}")
        print(f"File size: {output_path.stat().st_size / 1024:.1f} KB")
        
        # Try to open in default web browser
        try:
            print("\nOpening the map in your default web browser...")
            webbrowser.open(f'file://{output_path.absolute()}')
        except Exception as e:
            print(f"Could not open browser automatically: {e}")
            print(f"Please open this file manually: {output_path.absolute()}")
            
        print("\nMap Features:")
        print("- Red dots show fire detections from the past 7 days")
        print("- Click on a dot to see the detection date and confidence")
        print("- Use the + and - buttons to zoom in/out")
        print("- The mini-map in the corner helps with navigation")
        
        return 0
    else:
        print("❌ Failed to create fire map")
        print("\nTroubleshooting tips:")
        print("1. Check your internet connection")
        print("2. Make sure you have the required Python packages installed")
        print("   Try: pip install folium matplotlib pillow numpy requests")
        print("3. Visit https://firms.modaps.eosdis.nasa.gov/ to check service status")
        print("4. Try again later if the service is temporarily unavailable")
        return 1

if __name__ == "__main__":
    sys.exit(main())
