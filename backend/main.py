#!/usr/bin/env python3
"""
WildGuard: Offline-First AI for Early Wildfire Detection
Uses NASA FIRMS API for fire detection and Google's Gemma 3n for analysis
"""

import os
import json
import logging
import asyncio
import aiohttp
import requests
from datetime import datetime, timedelta, UTC
from typing import List, Dict, Optional, Tuple, AsyncGenerator, Any
from contextlib import asynccontextmanager
from pathlib import Path
from pydantic import BaseModel, Field

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Pydantic Models
class Coordinates(BaseModel):
    """Geographic coordinates (latitude/longitude)."""
    lat: float = Field(..., ge=-90, le=90, description="Latitude (-90 to 90)")
    lng: float = Field(..., ge=-180, le=180, description="Longitude (-180 to 180)")

class BoundingBox(BaseModel):
    """Geographic bounding box."""
    north: float = Field(..., ge=-90, le=90, description="Northern boundary latitude")
    south: float = Field(..., ge=-90, le=90, description="Southern boundary latitude")
    east: float = Field(..., ge=-180, le=180, description="Eastern boundary longitude")
    west: float = Field(..., ge=-180, le=180, description="Western boundary longitude")

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
    timestamp: str = Field(default_factory=lambda: datetime.now(UTC).isoformat())
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
    timestamp: str = Field(default_factory=lambda: datetime.now(UTC).isoformat())

# FastAPI and web framework
from fastapi import FastAPI, HTTPException, Query, UploadFile, File, Form, BackgroundTasks, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse, Response
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from pydantic import BaseModel, Field, validator
from dotenv import load_dotenv

# Image processing
from PIL import Image
import io
import base64
import uuid

# Local imports
from gemma import WildGuardAI

# Set up logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Configuration
class Config:
    # File paths
    BASE_DIR = Path(__file__).parent
    UPLOAD_FOLDER = BASE_DIR / "generated_images"
    CACHE_FOLDER = BASE_DIR / "cache"
    UPLOAD_FOLDER.mkdir(exist_ok=True)
    CACHE_FOLDER.mkdir(exist_ok=True)
    
    # API Configuration
    NASA_FIRMS_API_KEY = os.getenv('NASA_FIRMS_API_KEY')
    GOOGLE_AI_STUDIO_API_KEY = os.getenv('GOOGLE_AI_STUDIO_API_KEY')
    
    # API Endpoints
    FIRMS_BASE_URL = "https://firms.modaps.eosdis.nasa.gov/api/area/csv"
    FIRMS_SOURCE = "MODIS_NRT"  # Near Real-Time data
    FIRMS_COVERAGE = "world"    # Can be 'world' or 'us'
    FIRMS_DETECTION_TYPE = 1    # 1 = fire detection
    
    # Offline settings
    OFFLINE_MODE = os.getenv('OFFLINE_MODE', 'true').lower() == 'true'
    CACHE_TTL_HOURS = 24  # How long to cache API responses

# Initialize AI model
wildguard_ai = WildGuardAI(offline_mode=Config.OFFLINE_MODE)

# Application lifespan management
@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    print("Starting up application...")
    try:
        init_genai()
        print("Google Generative AI initialized successfully")
    except Exception as e:
        print(f"Failed to initialize Google Generative AI: {e}")
        raise
    
    yield  # App is running
    
    # Shutdown
    print("Shutting down application...")

# Initialize FastAPI app with lifespan
app = FastAPI(
    title="WildGuard API",
    description="Offline-first AI for Early Wildfire Detection and Response",
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc"
)

# CORS middleware configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # In production, replace with specific origins
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount static files for serving the frontend
app.mount("/static", StaticFiles(directory=Config.BASE_DIR / "static"), name="static")

# Mount describe.py router for /api/describe
from describe import router as describe_router
app.include_router(describe_router)

# Mount voice_intent.py router
from voice_intent import router as voice_intent_router
app.include_router(voice_intent_router)

# Mount fact_check.py router
from fact_check import router as fact_check_router
app.include_router(fact_check_router)

from fastapi.responses import RedirectResponse

@app.get("/")
async def root():
    return RedirectResponse(url="/docs")

def get_cached_data(cache_key: str) -> Optional[Any]:
    """Retrieve data from local cache if available and not expired."""
    cache_file = Config.CACHE_FOLDER / f"{cache_key}.json"
    if not cache_file.exists():
        return None
        
    try:
        data = json.loads(cache_file.read_text())
        cache_time = datetime.fromisoformat(data['timestamp'])
        if (datetime.now(UTC) - cache_time).total_seconds() > Config.CACHE_TTL_HOURS * 3600:
            return None
        return data['data']
    except Exception as e:
        logger.warning(f"Error reading cache {cache_key}: {e}")
        return None

def save_to_cache(cache_key: str, data: Any) -> None:
    """Save data to local cache with timestamp."""
    try:
        cache_file = Config.CACHE_FOLDER / f"{cache_key}.json"
        cache_data = {
            'timestamp': datetime.now(UTC).isoformat(),
            'data': data
        }
        cache_file.write_text(json.dumps(cache_data, default=str))
    except Exception as e:
        logger.error(f"Error saving to cache {cache_key}: {e}")


async def generate_analysis_prompt(coords: Coordinates, fire_data: Dict) -> str:
    """Generate a prompt for the AI based on fire data and location."""
    fire_count = len(fire_data.get('data', [])) if isinstance(fire_data.get('data'), list) else 0
    
    prompt = f"""
    Location: Latitude {coords.lat}, Longitude {coords.lng}
    Detected {fire_count} potential fire events in the area.
    
    {WILDFIRE_SYSTEM_PROMPT}
    
    Please analyze the fire risk and provide:
    1. Risk level (Low/Medium/High/Extreme)
    2. Confidence percentage
    3. Key observations
    4. Immediate actions to take
    5. Safety recommendations
    
    Fire data: {fire_data}
    """
    return prompt



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

# System prompt for wildfire analysis
WILDFIRE_SYSTEM_PROMPT = """
You are WildGuard, an advanced AI wildfire detection and analysis system. Your task is to analyze satellite and sensor data to provide comprehensive wildfire intelligence. Focus on accuracy, clarity, and actionable insights.

## Response Guidelines
1. Be precise with measurements and confidence levels
2. Use clear, non-technical language for all audiences
3. Prioritize human safety and environmental protection
4. Include specific, actionable recommendations
5. Consider both immediate and long-term impacts

## Required Analysis Components
- Fire detection confidence (0-100%)
- Fire perimeter and growth patterns
- Fuel types and conditions
- Weather impact analysis
- Terrain and accessibility factors
- Potential impact on communities and infrastructure
- Wildlife and ecological considerations

## Response Format

## 🔍 EXECUTIVE SUMMARY
[Concise 3-4 sentence overview of the current situation]

## 📊 DETECTION & ANALYSIS
**Detection Confidence**: [X]% (Very High/High/Moderate/Low)
**Fire Characteristics**:
- **Size**: [acres] (approximately [hectares])
- **Intensity**: [Low/Moderate/High/Extreme]
- **Behavior**: [Surface fire/Crown fire/Ground fire], [additional details]
- **Rate of Spread**: [speed], [direction]

## ⚠️ RISK ASSESSMENT
- **Immediate Risk**: [Low/Moderate/High/Extreme]
- **Affected Areas**: [List key areas]
- **Critical Infrastructure at Risk**: [Highways/Power lines/Communities]
- **Evacuation Status**: [Not needed/Recommended/Mandatory in areas]

## 🚨 RECOMMENDED ACTIONS
### For Emergency Services:
1. [Specific action 1]
2. [Specific action 2]
3. [Specific action 3]

### For Residents:
1. [Specific action 1]
2. [Specific action 2]
3. [Specific action 3]

## 🌡️ ENVIRONMENTAL CONDITIONS
- **Current Weather**: [Temperature, humidity, wind speed/direction]
- **Forecast**: [Next 24-48 hours outlook]
- **Air Quality**: [Current AQI and health implications]

## 🗺️ RESOURCES DEPLOYED
- Firefighting crews: [Number/Type]
- Aircraft: [Type/Number]
- Equipment: [Type/Status]

## ℹ️ ADDITIONAL INFORMATION
- Latest update time: [Time/Date]
- Next scheduled update: [Time/Date]
- Information sources: [NASA FIRMS, Local Authorities, etc.]

---
*This report was automatically generated by the Wildfire Detection AI System on {local_date} at {local_time} {local_tz}. For emergencies, please contact local authorities.

Disclaimer: This is an AI-generated analysis and should be used in conjunction with official sources and expert judgment.
---
"""

# Model configurations
TEXT_GEN_MODEL = 'gemma-3n-e2b-it'  # Using Gemma for text generation
IMAGE_GEN_MODEL = 'gemma-3n-e2b-it'  # Using Gemma for image generation prompts

# Try to import google.generativeai, but make it optional
try:
    import google.generativeai as genai
    GENAI_AVAILABLE = True
except ImportError:
    GENAI_AVAILABLE = False
    import warnings
    warnings.warn("google.generativeai not available. Running in offline-only mode.")

def init_genai():
    """Initialize the Google Generative AI client if available."""
    if not GENAI_AVAILABLE:
        print("Google Generative AI not available. Running in offline mode.")
        return
        
    try:
        genai.configure(api_key=Config.GOOGLE_AI_STUDIO_API_KEY)
        print("Google Generative AI configured successfully with Gemma model")
    except Exception as e:
        print(f"Error initializing Google Generative AI: {e}")
        if Config.OFFLINE_MODE:
            print("Continuing in offline mode...")
        else:
            raise



# Pydantic Models
class BoundingBox(BaseModel):
    north: float = Field(..., ge=-90, le=90)
    south: float = Field(..., ge=-90, le=90)
    east: float = Field(..., ge=-180, le=180)
    west: float = Field(..., ge=-180, le=180)

class WildfireRequest(BaseModel):
    coordinates: Coordinates
    date_range: str = Field("7d", description="Time range to analyze (e.g., 7d, 30d)")
    radius_km: float = Field(50.0, description="Search radius in kilometers")
    generate_image: bool = Field(True, description="Whether to generate a visualization image")

# Helper Functions
def get_date_range(days: int) -> str:
    """Generate date range string for FIRMS API."""
    end_date = datetime.now(UTC)
    start_date = end_date - timedelta(days=days)
    return f"{start_date.strftime('%Y-%m-%d')},{end_date.strftime('%Y-%m-%d')}"

def calculate_bounding_box(lat: float, lng: float, radius_km: float) -> BoundingBox:
    """Calculate bounding box from center point and radius."""
    # Approximate conversion: 1 degree ≈ 111 km
    delta = radius_km / 111.0
    return BoundingBox(
        north=min(90, lat + delta),
        south=max(-90, lat - delta),
        east=min(180, lng + delta),
        west=max(-180, lng - delta)
    )

async def fetch_fire_data(bbox: BoundingBox, date_range: str) -> Dict:
    """Fetch fire data from NASA FIRMS API."""
    try:
        print(f"Fetching fire data for bbox: {bbox}, date_range: {date_range}")
        
        # Convert date range
        try:
            days = int(date_range.rstrip('d'))
            date_range_str = get_date_range(days)
            print(f"Converted date range: {date_range} -> {date_range_str}")
        except ValueError as ve:
            error_msg = f"Invalid date range format: {date_range}"
            print(error_msg)
            return {"status": "error", "message": error_msg}
        
        # Prepare bounding box string
        bbox_str = f"{bbox.south},{bbox.west},{bbox.north},{bbox.east}"
        print(f"Using bounding box: {bbox_str}")
        
        # Build URL and parameters
        url = f"{Config.FIRMS_BASE_URL}/{Config.NASA_FIRMS_API_KEY}/{Config.FIRMS_SOURCE}/{Config.FIRMS_COVERAGE}/{Config.FIRMS_DETECTION_TYPE}/{date_range_str}"
        params = {'bbox': bbox_str}
        
        print(f"Making request to FIRMS API: {url}")
        print(f"Query parameters: {params}")
        
        # Make the request
        try:
            response = requests.get(url, params=params, timeout=30)
            response.raise_for_status()
            print(f"Received response with status code: {response.status_code}")
        except requests.exceptions.RequestException as re:
            error_msg = f"Error making request to FIRMS API: {str(re)}"
            print(error_msg)
            if hasattr(re, 'response') and re.response is not None:
                print(f"Response content: {re.response.text}")
            return {"status": "error", "message": error_msg}
        
        # Parse CSV response
        try:
            content = response.text.strip()
            if not content:
                return {
                    "status": "success",
                    "count": 0,
                    "fires": [],
                    "bbox": bbox.model_dump(),
                    "date_range": date_range
                }
                
            lines = content.split('\n')
            if not lines:
                raise ValueError("Empty response from FIRMS API")
                
            headers = [h.strip('"') for h in lines[0].split(',')]
            fires = []
            
            for line in lines[1:]:
                if not line.strip():
                    continue
                values = [v.strip('"') for v in line.split(',')]
                if len(values) == len(headers):
                    fires.append(dict(zip(headers, values)))
            
            print(f"Successfully parsed {len(fires)} fire events")
            
            return {
                "status": "success",
                "count": len(fires),
                "fires": fires,
                "bbox": bbox.model_dump(),
                "date_range": date_range
            }
            
        except Exception as e:
            error_msg = f"Error parsing FIRMS API response: {str(e)}"
            print(error_msg)
            print(f"Response content: {response.text[:500]}...")
            return {"status": "error", "message": error_msg}
            
    except Exception as e:
        error_msg = f"Unexpected error in fetch_fire_data: {str(e)}"
        print(error_msg)
        import traceback
        traceback.print_exc()
        return {"status": "error", "message": error_msg}

@app.get("/api/image/{image_id}")
async def get_generated_image(image_id: str):
    """Retrieve a generated image or FIRMS map by its ID."""
    import time
    max_attempts = 5
    attempt = 0
    
    while attempt < max_attempts:
        # Check for FIRMS map HTML file first
        firms_map_path = Config.UPLOAD_FOLDER / f"{image_id}.html"
        if firms_map_path.exists():
            try:
                # Try to open the file to ensure it's fully written
                with open(firms_map_path, 'r') as f:
                    content = f.read()
                    if content:  # Only return if file has content
                        return FileResponse(
                            firms_map_path,
                            media_type="text/html",
                            headers={"Content-Disposition": f"inline; filename=\"{image_id}.html\""}
                        )
            except (IOError, OSError):
                pass  # File might still be writing, we'll retry
        
        # Fall back to PNG image
        image_path = Config.UPLOAD_FOLDER / f"{image_id}.png"
        if image_path.exists():
            return FileResponse(
                image_path, 
                media_type="image/png",
                headers={"Content-Disposition": f"inline; filename=\"{image_id}.png\""}
            )
        
        # If neither file exists yet, wait a bit and try again
        attempt += 1
        if attempt < max_attempts:
            time.sleep(0.5)  # Wait 500ms before retrying
    
    # If we get here, we've exhausted all attempts
    raise HTTPException(
        status_code=404, 
        detail=f"Image or map not found after {max_attempts} attempts. Please try again."
    )

async def generate_wildfire_image(analysis: str, coordinates: Coordinates, image_path: Path):
    """Generate an image based on the wildfire analysis."""
    import traceback
    try:
        print(f"[WildfireImage] Starting image generation for ({coordinates.lat}, {coordinates.lng}) - path: {image_path}")
        model = genai.GenerativeModel(IMAGE_GEN_MODEL)
        
        # Create a prompt for image generation
        prompt = f"""
        Create a high-resolution, visually striking image for a wildfire situation report at latitude {coordinates.lat}, longitude {coordinates.lng}.
        
        Analysis Summary:
        {analysis[:1000]}...
        
        The image should include:
        - A realistic top-down map of the area, showing forests, rivers, and nearby towns.
        - Clearly visible active fire zones with red/orange flames and smoke plumes drifting according to wind direction.
        - Heatmap overlay for fire intensity (red/yellow gradient), and safe/evacuation zones in green/blue.
        - Firefighting resources (trucks, aircraft) if mentioned in the analysis.
        - Weather effects such as wind arrows, clouds, or sun if relevant.
        - No text labels or legend—visual information only.
        - Modern, clean, and professional style suitable for a dashboard or news report.
        """
        print(f"[WildfireImage] Prompt for Gemma:\n{prompt}")
        
        # Generate the image
        response = await model.generate_content_async(
            prompt,
            generation_config={
                "temperature": 0.7,
                "top_p": 0.8,
                "top_k": 40,
                "max_output_tokens": 2048,
            },
        )
        print("[WildfireImage] Gemma response received.")
        
        # Save the image
        if hasattr(response, 'images') and response.images:
            try:
                image_data = response.images[0]
                with open(image_path, 'wb') as f:
                    f.write(image_data)
                print(f"[WildfireImage] Image saved to {image_path}")
                return str(image_path)
            except Exception as save_err:
                print(f"[WildfireImage] Error saving image: {save_err}")
                traceback.print_exc()
                return None
        else:
            print("[WildfireImage] No image returned by Gemma.")
            return None
    except Exception as e:
        print(f"[WildfireImage] Error generating wildfire image: {e}")
        traceback.print_exc()
        return None

        return None

@app.post("/api/analyze")
async def analyze_wildfire(request: WildfireRequest, background_tasks: BackgroundTasks):
    """Analyze wildfire data for a specific location."""
    try:
        # Check required configurations
        if not Config.NASA_FIRMS_API_KEY:
            raise ValueError("NASA FIRMS API key not configured")
        if not Config.GOOGLE_AI_STUDIO_API_KEY:
            raise ValueError("Google AI Studio API key not configured")
        
        print(f"Starting analysis for coordinates: {request.coordinates}")
        
        # Get bounding box
        try:
            bbox = calculate_bounding_box(
                request.coordinates.lat,
                request.coordinates.lng,
                request.radius_km
            )
            print(f"Calculated bounding box: {bbox}")
        except Exception as e:
            raise ValueError(f"Error calculating bounding box: {str(e)}")
        
        # Fetch fire data
        try:
            print("Fetching fire data...")
            fire_data = await fetch_fire_data(bbox, request.date_range)
            if fire_data["status"] != "success":
                error_msg = fire_data.get("message", "Unknown error fetching fire data")
                print(f"Error in fetch_fire_data: {error_msg}")
                raise ValueError(f"Failed to fetch fire data: {error_msg}")
            print(f"Fetched {fire_data.get('count', 0)} fire events")
        except Exception as e:
            raise ValueError(f"Error in fetch_fire_data: {str(e)}")
        
        # Prepare analysis prompt with system instructions
        try:
            # Determine local time for user's coordinates
            from timezone_utils import get_local_time
            local_date, local_time, local_tz = get_local_time(request.coordinates.lat, request.coordinates.lng)
            # Fallback if outside North America
            if not all([local_date, local_time, local_tz]):
                from datetime import datetime
                local_date = datetime.utcnow().strftime('%Y-%m-%d')
                local_time = datetime.utcnow().strftime('%H:%M')
                local_tz = 'UTC'

            # Format report template with local time
            report_prompt = WILDFIRE_SYSTEM_PROMPT.format(local_date=local_date, local_time=local_time, local_tz=local_tz)
            prompt = f"""
            {report_prompt}
            
            Location: Latitude {request.coordinates.lat}, Longitude {request.coordinates.lng}
            Date Range: {request.date_range}
            Radius: {request.radius_km} km
            
            Fire Data:
            {json.dumps(fire_data.get('fires', []), indent=2)}
            
            Please analyze this data and provide a detailed report.
            """
            print("Prepared analysis prompt with local time")
        except Exception as e:
            raise ValueError(f"Error preparing analysis prompt: {str(e)}")
        
        # Generate analysis using Gemma
        try:
            print("Generating analysis with Gemma...")
            model = genai.GenerativeModel(TEXT_GEN_MODEL)
            response = await model.generate_content_async(
                prompt,
                generation_config={
                    "temperature": 0.7,
                    "top_p": 0.8,
                    "top_k": 40,
                    "max_output_tokens": 2048,
                },
            )
            analysis = response.text
            print("Successfully generated analysis")
        except Exception as e:
            raise ValueError(f"Error generating analysis with Gemma: {str(e)}")
        
        # Prepare response
        response_data = {
            "status": "success",
            "analysis": analysis,
            "fire_data": fire_data
        }
        
        # Generate FIRMS map in background if requested
        image_id = None
        if request.generate_image:
            from pathlib import Path
            import uuid
            import asyncio
            from nasa_fetch_image import fetch_fire_map
            
            image_id = str(uuid.uuid4())
            map_path = Config.UPLOAD_FOLDER / f"{image_id}.html"
            
            # Make sure upload directory exists
            map_path.parent.mkdir(parents=True, exist_ok=True)
            
            # Generate FIRMS map in background
            background_tasks.add_task(
                fetch_fire_map,
                lat=request.coordinates.lat,
                lon=request.coordinates.lng,
                days=7,  # Default to 7 days of fire data
                output_path=str(map_path)
            )
            response_data["image_id"] = image_id
        
        print("Analysis completed successfully")
        return response_data
    
    except ValueError as ve:
        error_msg = f"Validation error: {str(ve)}"
        print(error_msg)
        raise HTTPException(status_code=400, detail=error_msg)
    except Exception as e:
        error_msg = f"Unexpected error: {str(e)}"
        print(error_msg)
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=error_msg)

@app.post("/api/tts")
async def text_to_speech(request: dict):
    """Convert text to speech using Gemma."""
    try:
        text = request.get("text", "")
        if not text:
            raise HTTPException(status_code=400, detail="No text provided")
            
        # For now, we'll return the text as is since we can't directly generate speech with Gemma
        # In a production environment, you would integrate with a TTS service
        return {
            "status": "success",
            "text": text,
            "message": "Text received for TTS processing"
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error processing TTS request: {str(e)}")

@app.get("/api/health")
async def health_check():
    """Health check endpoint."""
    return {
        "status": "ok",
        "version": "1.0.0",
        "models": {
            "text_generation": TEXT_GEN_MODEL,
            "image_generation": IMAGE_GEN_MODEL,
            "tts": "gemma-3n-e2b-it"
        }
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
    uvicorn.run(app, host="0.0.0.0", port=8000)
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)