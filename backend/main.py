#!/usr/bin/env python3
"""
WildGuard: Offline-First AI for Early Wildfire Detection
Uses NASA FIRMS API for fire detection and Google's Gemma 3n for analysis
"""
import os
import json
import logging
import asyncio
import numpy as np
import geopandas as gpd
import matplotlib.pyplot as plt
import contextily as cx
import math  # Import the entire math module
from contextlib import asynccontextmanager
from datetime import datetime, timezone, timedelta
from pathlib import Path
from typing import Dict, List, Optional, Any, Union, Tuple, Callable
from pydantic import BaseModel, Field
import ssl  
import uuid
import aiohttp
import httpx
import shutil
import re
import filelock
from shapely.geometry import Point
import aiofiles
import aiofiles.os
import pandas as pd
from io import StringIO, BytesIO
import csv
from fastapi import FastAPI, HTTPException, Depends, Request, UploadFile, File, Form, BackgroundTasks, status
from fastapi.staticfiles import StaticFiles
from fastapi.responses import JSONResponse, FileResponse, HTMLResponse, Response
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

# Local imports
from gemma import WildGuardAI
from utils import Coordinates, BoundingBox

# Set up logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# System prompt for wildfire analysis
WILDFIRE_SYSTEM_PROMPT = """
You are WildGuard, an advanced AI wildfire detection and analysis system. Your task is to analyze satellite and sensor data to provide comprehensive wildfire intelligence. Focus on accuracy, clarity, and actionable insights.

For each analysis, provide a detailed report including:
1. Fire detection confidence level
2. Current fire behavior and progression
3. Potential risk to nearby areas
4. Recommended actions for emergency response
5. Evacuation guidance if necessary

Use clear, concise language and prioritize human safety in all recommendations.
"""

# Pydantic Models
class WildfireRequest(BaseModel):
    coordinates: Coordinates
    date_range: str = Field("7d", description="Time range to analyze (e.g., 7d, 30d)")
    radius_km: float = Field(50.0, description="Search radius in kilometers")
    generate_image: bool = Field(True, description="Whether to generate a visualization image")
    include_evacuation: bool = Field(True, description="Include evacuation planning")

class WildfireResponse(BaseModel):
    """Response model for wildfire analysis."""
    status: str
    analysis: str
    risk_level: str
    confidence: float
    recommendations: List[str]
    evacuation_plan: Optional[Dict] = None
    image_id: Optional[str] = None
    timestamp: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    source: str = "online"

class EvacuationRequest(BaseModel):
    """Request model for evacuation planning."""
    current_location: Coordinates
    safe_locations: List[Coordinates]
    hazards: List[Dict[str, Any]]
    accessibility_needs: List[str] = Field(default_factory=list)
    group_size: int = Field(1, ge=1, description="Number of people in the group")

class EvacuationResponse(BaseModel):
    """Response model for evacuation planning."""
    status: str
    routes: List[Dict]
    estimated_duration: str
    warnings: List[str]
    timestamp: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())

class FireAnalysisResponse(BaseModel):
    """Response model for fire analysis."""
    status: str
    analysis_id: str
    fire_detections: List[Dict]
    analysis: Dict
    map_url: str
    map_html: str
    timestamp: str
    metadata: Dict

class FireAnalysisRequest(BaseModel):
    lat: float
    lng: float
    radius_km: float = 50.0

# Application configuration
class Config:
    # Base directory
    BASE_DIR = Path(__file__).parent
    
    # File upload configuration
    UPLOAD_FOLDER = BASE_DIR / "uploads"
    STATIC_FOLDER = BASE_DIR / "static"
    
    # Create necessary directories
    UPLOAD_FOLDER.mkdir(exist_ok=True)
    STATIC_FOLDER.mkdir(exist_ok=True)
    
    # NASA FIRMS API Configuration
    NASA_FIRMS_API_KEY = os.getenv("NASA_FIRMS_API_KEY", "")
    FIRMS_BASE_URL = "https://firms.modaps.eosdis.nasa.gov/api/area/csv"
    
    # Default extent (min_lon, min_lat, max_lon, max_lat)
    DEFAULT_EXTENT = [-180, -90, 180, 90]
    
    # Offline mode flag
    OFFLINE_MODE = os.getenv("OFFLINE_MODE", "false").lower() == "true"

    # Cache settings
    CACHE_EXPIRY = 3600  # 1 hour in seconds

# Initialize WildGuard AI
def init_genai():
    """Initialize the WildGuard AI with offline-first capabilities."""
    try:
        # Initialize the WildGuardAI which handles both online and offline modes
        detector = WildGuardAI(offline_mode=Config.OFFLINE_MODE)
        logger.info("WildGuard AI initialized successfully")
        return detector
    except Exception as e:
        logger.error(f"Error initializing WildGuard AI: {str(e)}")
        # Return a basic detector in offline mode if initialization fails
        return WildGuardAI(offline_mode=True)

# Application lifespan management
@asynccontextmanager
async def lifespan(app: FastAPI):
    """Handle application startup and shutdown events."""
    # Startup
    logger.info("Starting WildGuard API server...")
    
    # Create upload directory if it doesn't exist
    os.makedirs(Config.UPLOAD_FOLDER, exist_ok=True)
    
    # Initialize AI models
    try:
        global wildguard_ai
        wildguard_ai = init_genai()
        logger.info("AI models initialized successfully")
    except Exception as e:
        logger.error(f"Failed to initialize AI models: {str(e)}")
        raise
    
    yield  # Application runs here
    
    # Shutdown
    logger.info("Shutting down WildGuard API server...")
    try:
        # Clean up any resources
        if 'wildguard_ai' in globals() and wildguard_ai is not None:
            # Add any necessary cleanup for the AI models
            pass
            
        # Clean up any temporary files
        for filename in os.listdir(Config.UPLOAD_FOLDER):
            file_path = os.path.join(Config.UPLOAD_FOLDER, filename)
            try:
                if os.path.isfile(file_path):
                    os.unlink(file_path)
            except Exception as e:
                logger.error(f"Error deleting file {file_path}: {e}")
                
    except Exception as e:
        logger.error(f"Error during shutdown: {str(e)}")
    
    # Gracefully close gRPC channels
    try:
        import grpc
        await grpc.aio.shutdown_channel()
    except Exception as e:
        logger.debug(f"gRPC shutdown warning: {str(e)}")
    
    logger.info("Shutdown complete")

# Initialize WildGuard AI
wildguard_ai = init_genai()

# Initialize FastAPI app with lifespan
app = FastAPI(
    title="WildGuard API",
    description="Offline-first AI for Early Wildfire Detection and Response",
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc"
)

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",  # React dev server
        "http://127.0.0.1:3000",  # React dev server alternative
        "http://localhost:8000",  # Local FastAPI server
        "http://127.0.0.1:8000"   # Local FastAPI server alternative
    ],
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["*"],
    expose_headers=["*"],
    max_age=600,
)

# Add security headers middleware
@app.middleware("http")
async def add_security_headers(request: Request, call_next):
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["X-XSS-Protection"] = "1; mode=block"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    response.headers["Content-Security-Policy"] = "default-src 'self'"
    return response

# Mount static files for serving the frontend
app.mount("/static", StaticFiles(directory=Config.STATIC_FOLDER), name="static")

# Mount describe.py router for /api/describe
try:
    from describe import router as describe_router
    app.include_router(describe_router, prefix="/api/describe")
except ImportError as e:
    logger.warning(f"Failed to load describe router: {e}")

# Mount voice_intent.py router if it exists
try:
    from voice_intent import router as voice_router
    app.include_router(voice_router, prefix="/api/voice")
except ImportError as e:
    logger.warning(f"Voice intent module not available: {e}")

from fastapi.responses import RedirectResponse

@app.get("/")
async def root():
    return RedirectResponse(url="/docs")

def get_cached_data(cache_key: str) -> Optional[Any]:
    """
    Retrieve data from local cache if available and not expired.
    
    Args:
        cache_key: The key used to identify the cache file
        
    Returns:
        The cached data if valid and not expired, None otherwise
    """
    cache_file = Config.UPLOAD_FOLDER / f"{cache_key}.json"
    
    # Check if file exists and has content
    if not cache_file.exists():
        return None
        
    if cache_file.stat().st_size == 0:
        try:
            cache_file.unlink()  # Clean up empty cache files
        except Exception as e:
            logger.warning(f"Failed to remove empty cache file {cache_file}: {e}")
        return None
        
    try:
        # Read file content with explicit encoding
        try:
            content = cache_file.read_text(encoding='utf-8').strip()
            if not content:  # Empty file after stripping whitespace
                logger.warning(f"Empty cache file: {cache_file}")
                cache_file.unlink()  # Clean up empty files
                return None
        except UnicodeDecodeError as e:
            logger.warning(f"Encoding error in cache file {cache_file}: {e}")
            return None
            
        # Parse JSON with better error handling
        try:
            data = json.loads(content)
        except json.JSONDecodeError as e:
            logger.warning(f"Invalid JSON in cache file {cache_file}: {e}")
            try:
                cache_file.unlink()  # Remove corrupted cache
            except Exception as e:
                logger.warning(f"Failed to remove corrupted cache file {cache_file}: {e}")
            return None
            
        # Validate cache structure
        if not isinstance(data, dict) or 'timestamp' not in data or 'data' not in data:
            logger.warning(f"Invalid cache format in {cache_file}")
            try:
                cache_file.unlink()  # Remove invalid cache
            except Exception as e:
                logger.warning(f"Failed to remove invalid cache file {cache_file}: {e}")
            return None
            
        # Check if cache is expired
        try:
            cache_time = datetime.fromisoformat(data['timestamp'])
            if (datetime.now(timezone.utc) - cache_time).total_seconds() > Config.CACHE_EXPIRY:
                logger.debug(f"Cache expired for {cache_key}")
                return None
        except (ValueError, TypeError) as e:
            logger.warning(f"Invalid timestamp in cache {cache_file}: {e}")
            return None
            
        return data['data']
        
    except Exception as e:
        logger.warning(f"Error reading cache {cache_file}: {str(e)}", exc_info=True)
        return None

def save_to_cache(cache_key: str, data: Any) -> None:
    """
    Save data to local cache with timestamp and file locking.
    Uses atomic writes to prevent corruption and file locking to prevent race conditions.
    
    Args:
        cache_key: The key to use for the cache
        data: The data to cache (must be JSON serializable)
    """
    if not cache_key or not isinstance(cache_key, str):
        logger.warning(f"Invalid cache key: {cache_key}")
        return
        
    if data is None:
        logger.warning(f"Not caching None data for key: {cache_key}")
        return
        
    try:
        # Ensure upload directory exists
        Config.UPLOAD_FOLDER.mkdir(parents=True, exist_ok=True)
        
        cache_file = Config.UPLOAD_FOLDER / f"{cache_key}.json"
        lock_file = cache_file.with_suffix('.lock')
        temp_file = cache_file.with_suffix('.tmp')
        
        # Prepare cache data with timestamp
        cache_data = {
            'timestamp': datetime.now(timezone.utc).isoformat(),
            'data': data
        }
        
        try:
            # Create a lock file with timeout
            with filelock.FileLock(str(lock_file), timeout=5):
                try:
                    # Write to a temporary file first
                    with open(temp_file, 'w', encoding='utf-8') as f:
                        json.dump(
                            cache_data, 
                            f, 
                            default=str, 
                            ensure_ascii=False, 
                            indent=2  # Pretty print for debugging
                        )
                    
                    # On POSIX systems this is atomic, on Windows it's best effort
                    temp_file.replace(cache_file)
                    logger.debug(f"Successfully cached data for key: {cache_key}")
                    
                except (IOError, OSError) as e:
                    logger.error(f"Failed to write cache file {cache_file}: {e}")
                    # Clean up temp file if it exists
                    if temp_file.exists():
                        try:
                            temp_file.unlink()
                        except Exception as e:
                            logger.warning(f"Failed to clean up temp file {temp_file}: {e}")
                
        except filelock.Timeout:
            logger.warning(f"Could not acquire lock for cache file {cache_key}")
            
        except Exception as e:
            logger.error(f"Unexpected error while caching {cache_key}: {e}", exc_info=True)
            
        finally:
            # Clean up lock file if it exists
            if lock_file.exists():
                try:
                    lock_file.unlink()
                except Exception as e:
                    logger.warning(f"Failed to remove lock file {lock_file}: {e}")
                    
    except Exception as e:
        logger.error(f"Unexpected error in save_to_cache for {cache_key}: {e}", exc_info=True)

async def generate_analysis_prompt(coords: Coordinates, fire_data: Union[Dict, List[Dict]]) -> str:
    """
    Generate a detailed prompt for the AI based on fire data and location.
    
    Args:
        coords: Coordinates object with lat/lng
        fire_data: Either a list of fire records or a dict with a 'data' key containing fire records
    """
    from datetime import datetime, timezone
    
    # Get current time in local timezone
    local_time = datetime.now(timezone.utc).astimezone()
    local_date = local_time.strftime('%Y-%m-%d')
    local_time_str = local_time.strftime('%H:%M:%S')
    local_tz = local_time.strftime('%Z')
    
    # Handle both old dict format and new list format
    if isinstance(fire_data, dict) and 'data' in fire_data:
        fire_records = fire_data['data']
    elif isinstance(fire_data, list):
        fire_records = fire_data
    else:
        fire_records = []
    
    # Format fire data for the prompt
    fire_count = len(fire_records) if fire_records else 0
    fire_details = []
    
    if fire_count > 0:
        for i, fire in enumerate(fire_records[:5], 1):  # Limit to first 5 fires for brevity
            # Extract relevant fields with fallbacks
            lat = fire.get('latitude', 'N/A')
            lng = fire.get('longitude', 'N/A')
            brightness = fire.get('brightness', fire.get('bright_ti4', 'N/A'))
            confidence = fire.get('confidence', fire.get('confidence_fire', 'N/A'))
            acq_date = fire.get('acq_date', fire.get('acq_date_time', 'N/A'))
            
            fire_details.append(
                f"{i}. Latitude: {lat}, Longitude: {lng}, "
                f"Date: {acq_date}, "
                f"Confidence: {confidence}, "
                f"Brightness: {brightness}K"
            )
    
    # Format the prompt with all necessary context
    prompt = f"""
    # WILDFIRE ANALYSIS REQUEST
    
    ## LOCATION INFORMATION
    - Coordinates: Latitude {coords.lat}, Longitude {coords.lng}
    - Analysis Time: {local_date} {local_time_str} {local_tz}
    - Detected Fires: {fire_count} potential fire events in the area
    
    ## FIRE DETECTION DETAILS
    {chr(10).join(fire_details) if fire_details else 'No fire detection data available'}
    
    ## ANALYSIS INSTRUCTIONS
    {WILDFIRE_SYSTEM_PROMPT.format(local_date=local_date, local_time=local_time_str, local_tz=local_tz)}
    
    ## ADDITIONAL CONTEXT
    - Data Source: NASA FIRMS (Fire Information for Resource Management System)
    - Analysis Purpose: Early wildfire detection and risk assessment
    - Target Audience: Emergency responders, local authorities, and affected communities
    
    Please provide a comprehensive analysis based on the above data, following the format and guidelines provided.
    """
    
    return prompt.strip()

async def generate_evacuation_plan(request: EvacuationRequest) -> Dict:
    """Generate an evacuation plan using AI."""
    prompt = f"""
    {EVACUATION_PROMPT}
    
    Current location: {request.current_location}
    Safe locations: {request.safe_locations}
    Hazards: {request.hazards}
    Group size: {request.group_size}
    Accessibility needs: {request.accessibility_needs}
    """
    
    try:
        analysis = await wildguard_ai.generate_analysis(prompt)
        return {
            "status": "success",
            "routes": [
                {
                    "destination": "Nearest Shelter",
                    "distance_km": 5.2,
                    "estimated_time": "45 min",
                    "hazards_avoided": ["Active fire zone", "Road closure"]
                }
            ],
            "estimated_duration": "45-60 minutes",
            "warnings": ["High traffic expected on evacuation routes"],
            "analysis": analysis.get("analysis", "")
        }
    except Exception as e:
        logger.error(f"Error generating evacuation plan: {e}")
        return {
            "status": "error",
            "message": "Failed to generate evacuation plan",
            "fallback_instructions": "Move away from the fire in the opposite direction of the wind."
        }

# System prompt for evacuation planning
EVACUATION_PROMPT = """
You are WildGuard, an advanced AI evacuation planning system. Your task is to generate a safe evacuation plan based on the provided information. Focus on minimizing risk and ensuring the safety of all individuals involved.

## Response Guidelines
1. Provide clear, step-by-step instructions for evacuation
2. Include specific routes and destinations
3. Consider accessibility needs and provide accommodations as necessary
4. Account for potential hazards and provide alternative routes if possible
5. Estimate the duration of the evacuation and provide regular updates

## Required Plan Components
- Evacuation route(s) with specific directions and distances
- Safe destination(s) with addresses and contact information
- Hazard avoidance strategies
- Accessibility accommodations (if applicable)
- Estimated duration and regular updates

## Response Format

## EVACUATION PLAN
### Step-by-Step Instructions
1. [Specific action item with clear instructions]
2. [Specific action item with clear instructions]
3. [Specific action item with clear instructions]

### Routes and Destinations
- **Route 1**: [Specific route with directions and distance]
- **Destination**: [Specific destination with address and contact information]

### Hazard Avoidance
- [Specific hazard] - [Avoidance strategy]

### Accessibility Accommodations
- [Specific accommodation] - [Description of accommodation]

### Estimated Duration and Updates
- Estimated duration: [Specific time frame]
- Regular updates: [Specific frequency and method]

---
This plan was automatically generated by the WildGuard Evacuation Planning System on {local_date} at {local_time} {local_tz}.
For emergencies, please contact local authorities.

**Note**: This plan is based on the provided information and may not account for all potential hazards or circumstances.
---
"""

async def fetch_firms_fire_data(extent: List[float] = None, days: int = 7) -> List[Dict]:
    """
    Fetch fire data from NASA FIRMS API.
    
    Args:
        extent: Bounding box as [min_lon, min_lat, max_lon, max_lat]
        days: Number of days of data to fetch (1-10)
        
    Returns:
        List of fire detection records
    """
    def get_sample_data():
        """Return sample data when API is unavailable."""
        logger.warning("Using sample fire data")
        return [
            {
                'latitude': 34.5,
                'longitude': -118.2,
                'brightness': 320.5,
                'acq_date': datetime.now(timezone.utc).strftime('%Y-%m-%d'),
                'confidence': 'high',
                'frp': 5.2,
                'daynight': 'D',
                'type': '0'  # 0 for VIIRS, 1 for MODIS
            }
        ]
    
    def validate_fire_data(data):
        """Validate the structure of fire data."""
        if not data:
            return False
            
        if not isinstance(data, list):
            return False
            
        # Check first item for required fields
        required_fields = {'latitude', 'longitude', 'brightness', 'acq_date'}
        first_item = data[0] if data else {}
        
        # Skip validation if no data
        if not first_item:
            return True
            
        missing_fields = [f for f in required_fields if f not in first_item]
        
        if missing_fields:
            logger.warning(f"Missing required fields in fire data: {missing_fields}")
            # Don't fail validation for missing fields, as we'll add defaults
            
        return True
    
    def parse_fire_data(csv_content: str) -> List[Dict]:
        """Parse FIRMS CSV data into a list of dictionaries with robust error handling."""
        try:
            if not csv_content or not csv_content.strip():
                logger.warning("Empty or invalid CSV content received")
                return []
            
            # Standardize line endings and remove BOM if present
            csv_content = csv_content.strip()
            if csv_content.startswith('\ufeff'):
                csv_content = csv_content[1:]
            
            # Create a StringIO object for the content
            csv_file = StringIO(csv_content)
            
            # First, try to read as JSON (in case the API returns JSON)
            if csv_content.strip().startswith('{'):
                try:
                    data = json.loads(csv_content)
                    if isinstance(data, dict) and 'data' in data:
                        return data['data']
                    elif isinstance(data, list):
                        return data
                except json.JSONDecodeError:
                    # Not JSON, continue with CSV parsing
                    csv_file.seek(0)
            else:
                # Reset file pointer if we didn't try JSON
                csv_file.seek(0)
            
            records = []
            current_date = datetime.now(timezone.utc).strftime('%Y-%m-%d')
            
            # Define field mappings with type conversion and default values
            field_mappings = {
                'latitude': {
                    'type': float,
                    'default': None,
                    'aliases': ['lat', 'y', 'lat_deg', 'ycoord', 'y_coord'],
                    'required': True
                },
                'longitude': {
                    'type': float,
                    'default': None,
                    'aliases': ['lon', 'lng', 'x', 'long', 'long_deg', 'xcoord', 'x_coord'],
                    'required': True
                },
                'brightness': {
                    'type': float,
                    'default': 0.0,
                    'aliases': ['bright_ti4', 'brightness_temp', 'temp', 'bright_ti5', 'brightness_ti4'],
                    'required': True
                },
                'acq_date': {
                    'type': str,
                    'default': current_date,
                    'aliases': ['acq_date_time', 'date', 'timestamp', 'scan_date', 'acq_time', 'acquisition_date'],
                    'required': True
                },
                'confidence': {
                    'type': str,
                    'default': 'medium',
                    'aliases': ['conf', 'confidence_level', 'frp_confidence', 'frp_quality'],
                    'required': False
                },
                'frp': {
                    'type': float,
                    'default': 0.0,
                    'aliases': ['fire_radiative_power', 'power', 'fire_power', 'frp_mw'],
                    'required': False
                },
                'daynight': {
                    'type': str,
                    'default': 'D',
                    'aliases': ['day_night', 'dn_flag', 'daynight_flag', 'daynight_indicator'],
                    'required': False
                },
                'type': {
                    'type': str,
                    'default': '0',
                    'aliases': ['instrument', 'sensor', 'satellite', 'platform'],
                    'required': False
                }
            }
            
            # Try pandas first if available
            try:
                import pandas as pd
                df = pd.read_csv(csv_file, dtype=str)
                
                # Standardize column names
                df.columns = df.columns.str.strip().str.lower()
                
                # Map alternative column names to standard names
                for std_name, mapping in field_mappings.items():
                    for alias in [std_name] + mapping['aliases']:
                        if alias in df.columns:
                            if alias != std_name:
                                df.rename(columns={alias: std_name}, inplace=True)
                            break
                
                # Add missing required columns with defaults
                for field, mapping in field_mappings.items():
                    if field not in df.columns and mapping['required']:
                        df[field] = mapping['default']
                
                # Convert to list of dicts
                records = df.to_dict('records')
                
            except Exception as e:
                logger.warning(f"Pandas parsing failed, falling back to manual CSV parsing: {e}")
                csv_file.seek(0)
                reader = csv.DictReader(csv_file)
                records = list(reader)
            
            # Process and validate records
            processed_records = []
            
            for record in records:
                if not record:
                    continue
                    
                clean_record = {}
                has_errors = False
                
                # Process each field
                for field, mapping in field_mappings.items():
                    try:
                        # Try to find the field value by checking all possible aliases
                        value = None
                        for alias in [field] + mapping['aliases']:
                            if alias in record and record[alias] not in (None, '', 'null', 'None', 'nan'):
                                value = record[alias]
                                break
                        
                        # Convert the value to the correct type
                        if value is not None:
                            try:
                                clean_record[field] = mapping['type'](value)
                            except (ValueError, TypeError):
                                clean_record[field] = mapping['default']
                        else:
                            clean_record[field] = mapping['default']
                            
                    except Exception as e:
                        logger.warning(f"Error processing field {field}: {e}")
                        clean_record[field] = mapping['default']
                
                # Validate required fields
                missing_required = [
                    field for field, mapping in field_mappings.items() 
                    if mapping['required'] and clean_record.get(field) is None
                ]
                
                if missing_required:
                    logger.warning(f"Skipping record with missing required fields: {missing_required}")
                    continue
                    
                # Validate coordinate ranges
                lat = clean_record.get('latitude')
                lon = clean_record.get('longitude')
                
                if lat is not None and lon is not None:
                    if not (-90 <= lat <= 90) or not (-180 <= lon <= 180):
                        logger.warning(f"Skipping record with invalid coordinates: {lat}, {lon}")
                        continue
                else:
                    logger.warning("Skipping record with missing coordinates")
                    continue
                    
                # Add to processed records if all validations pass
                processed_records.append(clean_record)
            
            if not processed_records:
                logger.warning("No valid fire records found after processing")
                
            return processed_records
            
        except Exception as e:
            logger.error(f"Failed to parse FIRMS data: {e}", exc_info=True)
            return []
        
async def get_generated_image(
    image_id: str,
    request: Request = None,
    background_tasks: BackgroundTasks = None
):
    """
    Retrieve a generated image or FIRMS map by its ID with retry logic.
    
    Args:
        image_id: The ID of the image to retrieve (alphanumeric with dots, hyphens, and underscores)
        request: The FastAPI Request object (automatically injected)
        background_tasks: BackgroundTasks instance (automatically injected)
        
    Returns:
        Response containing the image or HTML content
        
    Raises:
        HTTPException: If the image is not found or an error occurs
    """
    MAX_ATTEMPTS = 10
    MAX_FILE_SIZE = 10 * 1024 * 1024  # 10MB
    VALID_EXTENSIONS = {'.html', '.png', '.jpg', '.jpeg'}
    
    def is_valid_filename(filename: str) -> bool:
        """Check if the filename is valid and secure."""
        if not filename or not isinstance(filename, str):
            return False
        # Only allow alphanumeric, dots, hyphens, and underscores
        return bool(re.match(r'^[a-zA-Z0-9_.-]+$', filename))
    
    # Validate image_id
    if not is_valid_filename(image_id):
        logger.warning(f"Invalid image_id provided: {image_id}")
        raise HTTPException(
            status_code=400, 
            detail=(
                "Invalid image ID. Only alphanumeric characters, "
                "dots, hyphens, and underscores are allowed."
            )
        )
    
    # Ensure UPLOAD_FOLDER exists and is a directory
    try:
        Config.UPLOAD_FOLDER.mkdir(exist_ok=True, parents=True)
        upload_folder = Config.UPLOAD_FOLDER.resolve(strict=True)
    except (FileNotFoundError, RuntimeError) as e:
        logger.error(f"Upload folder error: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail="Server configuration error: Invalid upload directory"
        )
    
    attempt = 0
    wait_time = 0.5  # Start with 500ms wait
    file_path = None
    
    while attempt < MAX_ATTEMPTS:
        # Try to find the file with supported extensions
        for ext in VALID_EXTENSIONS:
            current_path = (upload_folder / image_id).with_suffix(ext)
            try:
                if current_path.exists() and current_path.is_file():
                    file_path = current_path
                    break
            except OSError as e:
                logger.warning(f"Error checking file {current_path}: {str(e)}")
                continue
        
        if file_path is None:
            attempt += 1
            if attempt >= MAX_ATTEMPTS:
                logger.warning(f"File not found after {MAX_ATTEMPTS} attempts: {image_id}")
                raise HTTPException(
                    status_code=404, 
                    detail="The requested image could not be found. It may have expired or been deleted."
                )
            
            await asyncio.sleep(wait_time)
            wait_time = min(5.0, wait_time * 1.5)  # Exponential backoff with max 5s
            continue
            
        try:
            # Resolve the full path and check for directory traversal
            try:
                file_path = file_path.resolve(strict=True)
                file_path.relative_to(upload_folder)  # Ensure file is within upload folder
            except (RuntimeError, ValueError) as e:
                logger.warning(f"Potential directory traversal attempt: {str(e)}")
                raise HTTPException(status_code=403, detail="Access denied")
            
            # Check file size
            try:
                file_size = file_path.stat().st_size
                if file_size == 0:
                    raise ValueError("File is empty")
                if file_size > MAX_FILE_SIZE:
                    raise ValueError(f"File too large: {file_size} bytes")
            except (OSError, ValueError) as e:
                logger.error(f"File error {file_path}: {str(e)}")
                attempt += 1
                if attempt >= MAX_ATTEMPTS:
                    raise HTTPException(
                        status_code=413 if "too large" in str(e) else 400,
                        detail=str(e)
                    )
                await asyncio.sleep(wait_time)
                wait_time = min(5.0, wait_time * 1.5)
                continue
            
            # Handle HTML files
            if file_path.suffix.lower() == '.html':
                try:
                    async with aiofiles.open(file_path, 'r', encoding='utf-8') as f:
                        content = await f.read()
                        if not content:
                            raise ValueError("File is empty")
                            
                        # Security headers
                        headers = {
                            "Content-Type": "text/html; charset=utf-8",
                            "Cache-Control": "no-cache, no-store, must-revalidate",
                            "Pragma": "no-cache",
                            "Expires": "0",
                            "X-Content-Type-Options": "nosniff",
                            "Content-Security-Policy": (
                                "default-src 'self'; "
                                "script-src 'self' 'unsafe-inline' 'unsafe-eval'; "
                                "style-src 'self' 'unsafe-inline';"
                            ),
                            "X-Frame-Options": "DENY",
                            "Referrer-Policy": "strict-origin-when-cross-origin"
                        }
                        
                        # Use request base URL for dynamic base href if available
                        base_url = "http://localhost:8000"  # Default fallback
                        if request and hasattr(request, 'url') and request.url:
                            base_url = f"{request.url.scheme}://{request.url.netloc}"
                            
                        content = content.replace(
                            "<head>", 
                            f"<head>\n<base href=\"{base_url}/\" target=\"_blank\">",
                            1  # Only replace first occurrence
                        )
                        
                        return Response(
                            content=content, 
                            media_type="text/html",
                            headers=headers
                        )
                except (aiofiles.OSError, UnicodeDecodeError) as e:
                    logger.error(f"Error reading HTML file {file_path}: {str(e)}")
                    raise HTTPException(
                        status_code=500,
                        detail="Error reading file content"
                    )
            # Handle image files
            else:
                media_type = {
                    '.png': 'image/png',
                    '.jpg': 'image/jpeg',
                    '.jpeg': 'image/jpeg'
                }.get(file_path.suffix.lower(), 'application/octet-stream')
                
                # Clean up old files in the background if background_tasks is available
                if background_tasks is not None:
                    try:
                        background_tasks.add_task(cleanup_old_files, upload_folder)
                    except Exception as e:
                        logger.warning(f"Failed to schedule cleanup task: {str(e)}")
                
                return FileResponse(
                    str(file_path),
                    media_type=media_type,
                    filename=file_path.name,
                    headers={
                        "Content-Disposition": f"inline; filename=\"{file_path.name}\"",
                        "Cache-Control": "no-cache, no-store, must-revalidate",
                        "Pragma": "no-cache",
                        "Expires": "0"
                    }
                )
                
        except HTTPException:
            raise
        except Exception as e:
            logger.error(f"Error processing file {file_path}: {str(e)}", exc_info=True)
            attempt += 1
            if attempt >= MAX_ATTEMPTS:
                raise HTTPException(
                    status_code=500, 
                    detail="An error occurred while processing your request"
                )
            await asyncio.sleep(wait_time)
            wait_time = min(5.0, wait_time * 1.5)
    
    raise HTTPException(status_code=404, detail="Image not found")

@app.post("/api/analyze-fire-map", response_model=FireAnalysisResponse)
async def analyze_fire_map(
    request_data: FireAnalysisRequest,
    background_tasks: BackgroundTasks,
    request: Request = None
):
    """
    Analyze fire map data for a specific location.
    
    This endpoint processes the request data and fetches fire data from NASA FIRMS API
    to provide a comprehensive fire analysis for the specified location.
    """
    try:
        # Log the received request data
        logger.info(f"Received request data: {request_data}")
        
        # Extract values from the request
        lat = request_data.lat
        lng = request_data.lng
        radius_km = request_data.radius_km
        
        # Generate a unique ID for this analysis
        analysis_id = str(uuid.uuid4())
        
        # Calculate bounding box for fire data
        extent = calculate_bounding_box(lat, lng, radius_km)
        
        # Fetch fire data from FIRMS API
        fire_data = await fetch_firms_fire_data(extent, days=3)  # Last 3 days of data
        
        # Log the number of fire detections
        fire_detections = fire_data if isinstance(fire_data, list) else []
        logger.info(f"Retrieved {len(fire_detections)} fire detections from FIRMS")
        
        # Prepare analysis prompt
        analysis_prompt = await generate_analysis_prompt(Coordinates(lat=lat, lng=lng), fire_data)
        
        # Generate analysis using the AI model
        logger.info("Sending data to WildGuard AI for analysis...")
        analysis_result = await wildguard_ai.generate_analysis(analysis_prompt)
        
        # Process the analysis to extract structured data
        processed_analysis = {
            "summary": analysis_result.get("analysis", "No analysis available"),
            "risk_level": analysis_result.get("risk_level", "unknown"),
            "confidence": analysis_result.get("confidence", 0.0),
            "recommendations": analysis_result.get("recommendations", [])
        }
        
        # Generate a map with the fire data
        map_html_path = await generate_fire_map(fire_detections, lat, lng, radius_km, analysis_id)
        
        # Get base URL for generating absolute URLs
        base_url = "http://localhost:8000"  # Default fallback
        if request:
            request_scope = request.scope
            scheme = request_scope.get('scheme', 'http')
            server_host = request_scope.get('server', ('localhost', 8000))[0]
            server_port = request_scope.get('server', ('localhost', 8000))[1]
            base_url = f"{scheme}://{server_host}"
            if server_port not in (80, 443):  # Only add port if it's not standard
                base_url += f":{server_port}"
        
        map_image_url = f"{base_url}/api/image/{analysis_id}"
        map_html_url = f"{base_url}/map/{analysis_id}"
        
        # Return the analysis results
        return {
            "status": "success",
            "analysis_id": analysis_id,
            "fire_detections": fire_detections,
            "analysis": processed_analysis,
            "map_url": map_image_url,
            "map_html": map_html_url,
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "metadata": {
                "location": {"lat": lat, "lng": lng},
                "radius_km": radius_km,
                "detection_count": len(fire_detections),
                "data_source": "NASA FIRMS"
            }
        }
        
    except Exception as e:
        logger.error(f"Error in analyze_fire_map: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/analyze", response_model=WildfireResponse)
async def analyze_wildfire(
    request: WildfireRequest, 
    background_tasks: BackgroundTasks,
    ai: WildGuardAI = Depends(lambda: wildguard_ai)  # Inject wildguard_ai
) -> Dict[str, Any]:
    """
    Analyze wildfire data for a specific location.
    
    Args:
        request: WildfireRequest containing coordinates and analysis parameters
        background_tasks: FastAPI background tasks for async processing
        ai: Injected WildGuardAI instance for analysis
        
    Returns:
        Dictionary containing wildfire analysis results
        
    Raises:
        HTTPException: If there's an error processing the request
    """
    # Generate a unique ID for this analysis
    analysis_id = str(uuid.uuid4())
    
    try:
        # Get coordinates from request with validation
        try:
            lat = request.coordinates.lat
            lng = request.coordinates.lng
            radius_km = max(0.1, min(1000.0, float(request.radius_km)))  # Clamp radius between 0.1 and 1000 km
        except (ValueError, AttributeError) as e:
            logger.error(f"Invalid coordinate data: {str(e)}", exc_info=True)
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Invalid coordinate data: {str(e)}"
            )
        
        # Calculate bounding box
        try:
            bbox = calculate_bounding_box(lat, lng, radius_km)
            logger.info(f"Analysis {analysis_id}: Processing wildfire analysis for coordinates: {lat}, {lng}")
        except Exception as e:
            logger.error(f"Error calculating bounding box: {str(e)}", exc_info=True)
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid location parameters"
            )
        
        # Fetch fire data with error handling
        try:
            fire_data = await fetch_firms_fire_data(bbox, request.date_range)
            if not fire_data or 'data' not in fire_data:
                logger.warning(f"Analysis {analysis_id}: No fire data available from FIRMS API")
                fire_data = {'data': [], 'status': 'no_data'}
            
            logger.info(f"Analysis {analysis_id}: Fetched {len(fire_data.get('data', []))} fire events")
            
            # Generate analysis prompt
            try:
                prompt = await generate_analysis_prompt(Coordinates(lat=lat, lng=lng), fire_data)
                logger.debug(f"Analysis {analysis_id}: Generated analysis prompt")
            except Exception as e:
                logger.error(f"Analysis {analysis_id}: Error generating analysis prompt: {str(e)}", exc_info=True)
                prompt = ""
            
            # Generate analysis using AI (if available)
            analysis = None
            if ai is not None and not isinstance(ai, str):  # Check if ai is not a string (mock)
                try:
                    logger.info(f"Analysis {analysis_id}: Generating analysis with AI...")
                    ai_response = await ai.generate_analysis(prompt)
                    
                    # Validate AI response structure
                    if not isinstance(ai_response, dict) or 'analysis' not in ai_response:
                        logger.warning(f"Analysis {analysis_id}: Invalid AI response format")
                        analysis = generate_basic_analysis(fire_data)
                    else:
                        analysis = ai_response['analysis']
                        logger.info(f"Analysis {analysis_id}: Successfully generated analysis with AI")
                        
                except Exception as e:
                    logger.error(f"Analysis {analysis_id}: Error in AI analysis: {str(e)}", exc_info=True)
                    analysis = generate_basic_analysis(fire_data)
            else:
                logger.info(f"Analysis {analysis_id}: Using basic analysis (AI not available)")
                analysis = generate_basic_analysis(fire_data)
            
            # Process the analysis text
            try:
                # Ensure analysis is a string
                if isinstance(analysis, dict):
                    analysis_text = analysis.get('summary', str(analysis))
                else:
                    analysis_text = str(analysis) if analysis is not None else 'No analysis available'
                    
                # Ensure recommendations is a list of strings
                if isinstance(analysis, dict) and 'recommendations' in analysis:
                    recommendations = [str(r) for r in analysis['recommendations'] if r]
                else:
                    recommendations = [
                        'Monitor the situation as conditions may change rapidly.',
                        'Follow local emergency services for updates.'
                    ]
                    
            except Exception as e:
                logger.error(f"Analysis {analysis_id}: Error processing analysis: {str(e)}", exc_info=True)
                analysis_text = 'Analysis unavailable. Please try again later.'
                recommendations = [
                    'Monitor the situation as conditions may change rapidly.',
                    'Follow local emergency services for updates.'
                ]
            
            # Prepare response data with analysis as a string
            response_data = {
                "status": "success",
                "analysis": analysis_text,  # This is now a string
                "risk_level": calculate_risk_level(fire_data),
                "confidence": calculate_confidence(fire_data),
                "recommendations": recommendations,
                "source": "online",
                "timestamp": datetime.now(timezone.utc).isoformat(),
                "analysis_id": analysis_id,
                "image_id": None,  # Will be set below if needed
                "evacuation_plan": None  # Default to None as it's optional
            }
            
            # Generate image in background if requested and we have fire data
            if request.generate_image and fire_data.get('data'):
                try:
                    # Create a wrapper function to run the async function
                    async def generate_map_wrapper():
                        try:
                            await generate_fire_map(
                                fire_data['data'],
                                lat,
                                lng,
                                radius_km,
                                analysis_id
                            )
                        except Exception as e:
                            logger.error(f"Error in background map generation: {str(e)}", exc_info=True)
                    
                    # Run the async function in the event loop
                    background_tasks.add_task(
                        asyncio.create_task,
                        generate_map_wrapper()
                    )
                    response_data["image_id"] = analysis_id
                    logger.info(f"Analysis {analysis_id}: Started background task to generate fire map")
                except Exception as e:
                    logger.error(f"Analysis {analysis_id}: Failed to start background task: {str(e)}", exc_info=True)
            
            return response_data
            
        except HTTPException:
            # Re-raise HTTP exceptions
            raise
            
        except Exception as e:
            logger.error(f"Analysis {analysis_id}: Error processing fire data: {str(e)}", exc_info=True)
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Error processing fire data: {str(e)[:200]}"  # Limit error message length
            )
            
    except HTTPException:
        # Re-raise HTTP exceptions
        raise
        
    except Exception as e:
        logger.error(f"Analysis {analysis_id}: Unexpected error in analyze_wildfire: {str(e)}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="An unexpected error occurred while processing your request."
        )

def generate_basic_analysis(fire_data: dict) -> str:
    """
    Generate a basic analysis of fire data when the AI model is not available.
    
    Args:
        fire_data: Dictionary containing fire detection data with a 'data' key containing a list of fire detections
        
    Returns:
        str: Basic analysis of the fire data
    """
    if not fire_data or not isinstance(fire_data, dict):
        return "No fire data available for analysis."
    
    try:
        fire_detections = fire_data.get('data', [])
        if not isinstance(fire_detections, list):
            return "Invalid fire data format. Expected a list of fire detections."
            
        fire_count = len(fire_detections)
        
        if fire_count == 0:
            return "No active fire detections in the area. The risk of wildfire appears to be low."
            
        # Get basic statistics
        intensities = []
        confidences = []
        dates = set()
        
        for fire in fire_detections:
            if not isinstance(fire, dict):
                continue
                
            # Get intensity if available
            intensity = fire.get('brightness') or fire.get('bright_ti4')
            if intensity is not None:
                try:
                    intensities.append(float(intensity))
                except (ValueError, TypeError):
                    pass
                    
            # Get confidence if available
            confidence = fire.get('confidence')
            if confidence is not None:
                try:
                    confidences.append(float(confidence))
                except (ValueError, TypeError):
                    pass
                    
            # Get acquisition date if available
            acq_date = fire.get('acq_date')
            if acq_date:
                dates.add(str(acq_date))
        
        # Generate analysis text
        analysis = [
            f"Basic Analysis (AI Model Unavailable):",
            f"- Detected {fire_count} potential fire event{'s' if fire_count != 1 else ''}"
        ]
        
        if dates:
            analysis.append(f"- Fires detected on {len(dates)} different day{'s' if len(dates) != 1 else ''}")
            
        if intensities and len(intensities) > 0:  # Explicit length check
            avg_intensity = sum(intensities) / len(intensities)
            analysis.append(f"- Average fire intensity: {avg_intensity:.1f} Kelvin")
            
        if confidences and len(confidences) > 0:  # Explicit length check
            avg_confidence = sum(confidences) / len(confidences)
            analysis.append(f"- Average detection confidence: {avg_confidence:.1f}%")
            
        analysis.extend([
            "",
            "Recommendations:",
            "- Verify with local authorities for official updates",
            "- Check for any evacuation orders in your area",
            "- Prepare an emergency kit if in or near the affected area"
        ])
        
        return "\n".join(analysis)
        
    except Exception as e:
        logger.error(f"Error in generate_basic_analysis: {str(e)}", exc_info=True)
        return "Unable to generate analysis due to an error. Please try again later."

def calculate_confidence(fire_data):
    """Calculate confidence level based on fire data."""
    num_fires = len(fire_data.get('data', []))
    if num_fires == 0:
        return 0.9  # High confidence in no fires
    return min(0.1 + (num_fires * 0.1), 0.9)  # More fires = higher confidence

def generate_recommendations(fire_data, analysis):
    """Generate basic recommendations based on fire data and analysis."""
    num_fires = len(fire_data.get('data', []))
    recommendations = []
    
    if num_fires > 0:
        recommendations.append("Monitor the situation closely as active fires are detected in the area.")
        recommendations.append("Check local authorities for any evacuation orders or warnings.")
    else:
        recommendations.append("No immediate action required. Continue to monitor the situation.")
    
    # Safely check if analysis contains 'high' risk
    analysis_text = str(analysis).lower() if analysis else ""
    if "high" in analysis_text or "extreme" in analysis_text:
        recommendations.append("Consider preparing an emergency kit and evacuation plan.")
    
    return recommendations

@app.post("/api/tts")
async def text_to_speech(request: dict):
    """Convert text to speech using browser's built-in TTS."""
    try:
        text = request.get("text", "")
        if not text:
            raise HTTPException(status_code=400, detail="No text provided")
            
        # Remove emojis from text before TTS
        import re
        text = re.sub(r'[\U0001F600-\U0001F64F\U0001F300-\U0001F5FF\U0001F680-\U0001F6FF\U0001F1E0-\U0001F1FF\U00002702-\U000027B0\U000024C2-\U0001F251]', '', text)
        
        # Use browser's built-in speech synthesis
        return {"status": "success", "message": "TTS request received", "text": text}
    except Exception as e:
        logger.error(f"TTS error: {str(e)}")
        raise HTTPException(status_code=500, detail=f"TTS error: {str(e)}")

@app.get("/api/health")
async def health_check():
    """Health check endpoint."""
    return {
        "status": "ok",
        "version": "1.0.0",
        "models": {
            "text_generation": "gemma-3n-e2b-it",
            "image_generation": "gemma-3n-e2b-it",
            "tts": "gemma-3n-e2b-it"
        }
    }

def calculate_risk_level(fire_data: dict) -> str:
    """
    Calculate the risk level based on fire data with enhanced assessment.
    
    Args:
        fire_data: Dictionary containing fire detection data
        
    Returns:
        str: Risk level ("low", "moderate", "high", or "extreme")
    """
    if not fire_data or 'data' not in fire_data or not fire_data['data']:
        return "low"
    
    try:
        fires = fire_data.get('data', [])
        if not isinstance(fires, list):
            return "low"
            
        num_fires = len(fires)
        if num_fires == 0:
            return "low"
        
        # Collect metrics
        confidences = []
        intensities = []
        fire_areas = []
        
        for fire in fires:
            if not isinstance(fire, dict):
                continue
                
            # Get confidence (0-100%)
            confidence = fire.get('confidence') or fire.get('confidence_fill')
            if confidence is not None:
                try:
                    confidences.append(min(100, max(0, float(confidence))))
                except (ValueError, TypeError):
                    pass
            
            # Get intensity (brightness temperature in Kelvin)
            intensity = fire.get('bright_ti4') or fire.get('brightness')
            if intensity is not None:
                try:
                    intensities.append(max(0, float(intensity)))
                except (ValueError, TypeError):
                    pass
            
            # Estimate fire area if possible (some APIs provide this)
            if 'frp' in fire and 'brightness' in fire:  # Fire Radiative Power
                try:
                    frp = float(fire['frp'])
                    brightness = float(fire['brightness'])
                    # Simple area estimation based on FRP and brightness
                    if brightness > 0 and frp > 0:
                        area = (frp / brightness) * 1000  # Simplified model
                        fire_areas.append(area)
                except (ValueError, TypeError):
                    pass
        
        # Calculate statistics
        avg_confidence = sum(confidences) / len(confidences) if confidences else 0
        max_intensity = max(intensities) if intensities else 0
        total_area = sum(fire_areas) if fire_areas else 0
        
        # Enhanced risk assessment
        risk_score = 0
        
        # Number of fires component
        if num_fires >= 10:
            risk_score += 3
        elif num_fires >= 5:
            risk_score += 2
        elif num_fires >= 1:
            risk_score += 1
        
        # Intensity component
        if max_intensity > 400:  # Very hot fires
            risk_score += 3
        elif max_intensity > 350:
            risk_score += 2
        elif max_intensity > 300:
            risk_score += 1
        
        # Confidence component
        if avg_confidence > 80:
            risk_score += 2
        elif avg_confidence > 50:
            risk_score += 1
        
        # Fire area component (if available)
        if total_area > 1000:  # hectares
            risk_score += 3
        elif total_area > 100:
            risk_score += 2
        elif total_area > 10:
            risk_score += 1
        
        # Determine risk level
        if risk_score >= 8:
            return "extreme"
        elif risk_score >= 5:
            return "high"
        elif risk_score >= 3:
            return "moderate"
        return "low"
            
    except Exception as e:
        logger.error(f"Error in calculate_risk_level: {str(e)}", exc_info=True)
        return "unknown"

def calculate_bounding_box(lat: float, lng: float, radius_km: float = 50.0) -> List[float]:
    """
    Calculate a bounding box around a point given a radius in kilometers.
    
    Args:
        lat: Center latitude in decimal degrees
        lng: Center longitude in decimal degrees
        radius_km: Radius in kilometers (default: 50km)
        
    Returns:
        List of [min_lon, min_lat, max_lon, max_lat]
    """
    # Earth's radius in kilometers
    R = 6371.0
    
    # Convert latitude and longitude from degrees to radians
    lat_rad = math.radians(lat)
    lng_rad = math.radians(lng)
    
    # Calculate the angular distance in radians
    angular_distance = radius_km / R
    
    # Calculate the latitude bounds
    min_lat = lat_rad - angular_distance
    max_lat = lat_rad + angular_distance
    
    # Calculate the longitude bounds (adjust for latitude)
    delta_lng = angular_distance / math.cos(lat_rad)
    min_lng = lng_rad - delta_lng
    max_lng = lng_rad + delta_lng
    
    # Convert back to degrees
    min_lat_deg = math.degrees(min_lat)
    max_lat_deg = math.degrees(max_lat)
    min_lng_deg = math.degrees(min_lng)
    max_lng_deg = math.degrees(max_lng)
    
    # Ensure valid latitude/longitude ranges
    min_lat_deg = max(min_lat_deg, -90.0)
    max_lat_deg = min(max_lat_deg, 90.0)
    min_lng_deg = max(min_lng_deg, -180.0)
    max_lng_deg = min(max_lng_deg, 180.0)
    
    return [min_lng_deg, min_lat_deg, max_lng_deg, max_lat_deg]

import folium

async def generate_fire_map(fire_data: List[Dict], lat: float, lng: float, radius_km: float, analysis_id: str) -> str:
    """
    Generate an interactive map visualization of fire data using Folium.
    
    Args:
        fire_data: List of fire detection data points
        lat: Center latitude of the map
        lng: Center longitude of the map
        radius_km: Radius in kilometers to display around the center point
        analysis_id: Unique ID for this analysis (used for filenames)
        
    Returns:
        str: Path to the generated map HTML file
    """
    try:
        # Ensure the upload directory exists
        os.makedirs(Config.UPLOAD_FOLDER, exist_ok=True)
        
        # Create a map centered at the given coordinates
        m = folium.Map(
            location=[lat, lng],
            zoom_start=10,
            tiles='OpenStreetMap'
        )
        
        # Add a marker for the center location
        folium.Marker(
            [lat, lng],
            popup=f'Search Center\n({lat:.4f}, {lng:.4f})',
            icon=folium.Icon(color='blue', icon='info-sign')
        ).add_to(m)
        
        # Add a circle for the search radius
        folium.Circle(
            radius=radius_km * 1000,  # Convert km to meters
            location=[lat, lng],
            color='blue',
            fill=True,
            fill_opacity=0.1,
            popup=f'Search Radius: {radius_km}km'
        ).add_to(m)
        
        # Add fire detection markers
        for fire in fire_data:
            fire_lat = float(fire.get('latitude', 0))
            fire_lng = float(fire.get('longitude', 0))
            brightness = fire.get('brightness', 'N/A')
            confidence = fire.get('confidence', 'N/A')
            
            # Create popup content
            popup_html = f"""
            <div style="width: 200px;">
                <h4>Fire Detection</h4>
                <p><b>Location:</b> {fire_lat:.4f}, {fire_lng:.4f}</p>
                <p><b>Brightness:</b> {brightness}</p>
                <p><b>Confidence:</b> {confidence}</p>
            </div>
            """
            
            folium.Marker(
                [fire_lat, fire_lng],
                popup=folium.Popup(popup_html, max_width=300),
                icon=folium.Icon(color='red', icon='fire', prefix='fa')
            ).add_to(m)
        
        # Fit the map to show all markers with some padding
        m.fit_bounds(m.get_bounds(), padding=(30, 30))
        
        # Save the map to an HTML file
        map_path = os.path.join(Config.UPLOAD_FOLDER, f"{analysis_id}.html")
        m.save(map_path)
        
        logger.info(f"Generated interactive fire map at {map_path}")
        return map_path
        
    except Exception as e:
        logger.error(f"Error generating fire map: {str(e)}", exc_info=True)
        return ""

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)