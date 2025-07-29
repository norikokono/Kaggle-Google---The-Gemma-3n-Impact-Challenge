import os
import logging
from pathlib import Path
from typing import Optional, Dict, Any
from dotenv import load_dotenv

# Initialize genai as None at module level
genai = None
GENAI_AVAILABLE = False

# Try to import google.generativeai, but make it optional
try:
    import google.generativeai as genai_module
    genai = genai_module
    GENAI_AVAILABLE = True
except ImportError:
    import warnings
    warnings.warn("google.generativeai not available. Running in offline-only mode.")

# Set up logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Configuration
CACHE_DIR = Path("./model_cache")
CACHE_DIR.mkdir(exist_ok=True)

class WildGuardAI:
    def __init__(self, offline_mode: bool = True):
        """Initialize the WildGuard AI model with offline-first capabilities."""
        self.offline_mode = offline_mode
        self.model = None
        self.genai = genai  # Store reference to genai module
        self._init_model()

    def _init_model(self):
        """Initialize the Gemma model with offline support."""
        if not GENAI_AVAILABLE:
            self.offline_mode = True
            logger.warning("google.generativeai not available. Forcing offline mode.")
            
        try:
            if not self.offline_mode and GENAI_AVAILABLE and self.genai is not None:
                # Online mode - requires API key
                load_dotenv()
                api_key = os.getenv('GOOGLE_AI_STUDIO_API_KEY')
                if not api_key:
                    logger.warning("API key not found. Falling back to offline mode.")
                    self.offline_mode = True
                else:
                    self.genai.configure(api_key=api_key)
                    self.model = self.genai.GenerativeModel('gemma-3n-e4b-it')
                    logger.info("Initialized Gemma 3n model in online mode")
                    return

            # Offline mode - try to load from cache or use simplified model
            self._load_model_from_cache()
            
        except Exception as e:
            logger.error(f"Failed to initialize model: {e}")
            self.offline_mode = True
            self._load_model_from_cache()

    def _load_model_from_cache(self):
        """Attempt to load model from local cache or use simplified model."""
        try:
            logger.info("Running in offline mode with simplified analysis")
            self.model = {"status": "offline", "capabilities": ["text_generation"]}
        except Exception as e:
            logger.error(f"Failed to load model from cache: {e}")
            self.model = None

    async def generate_analysis(self, prompt: str, **kwargs) -> Dict[str, Any]:
        """Generate analysis with fallback to offline mode if needed."""
        try:
            if self.model and not isinstance(self.model, dict) and hasattr(self.model, 'generate_content_async'):
                response = await self.model.generate_content_async(prompt, **kwargs)
                return {
                    "status": "success",
                    "analysis": response.text,
                    "source": "online" if not self.offline_mode else "offline_cache"
                }
            
            # Fallback to offline processing
            return await self._offline_analysis(prompt)
            
        except Exception as e:
            logger.error(f"Error in generate_analysis: {e}")
            return await self._offline_analysis(prompt, str(e))

    async def _offline_analysis(self, prompt: str, error_msg: str = None) -> Dict[str, Any]:
        """Handle analysis when offline or model loading fails."""
        return {
            "status": "offline_limited",
            "message": error_msg or "Running in offline mode with limited capabilities",
            "analysis": "Detailed analysis requires an internet connection. Basic features are available offline.",
            "source": "offline_fallback",
            "confidence": 0.0,
            "risk_level": "unknown",
            "recommendations": [
                "Enable internet connection for full analysis capabilities.",
                "Check your network settings and try again.",
                "Basic fire detection is still available offline."
            ]
        }

# Singleton instance
wildguard_ai = WildGuardAI(offline_mode=os.getenv('OFFLINE_MODE', 'false').lower() == 'true')

# --- Whisper STT Integration ---
# Requirements: pip install git+https://github.com/openai/whisper.git torch soundfile fastapi uvicorn
try:
    import whisper
    WHISPER_AVAILABLE = True
    whisper_model = whisper.load_model("base")  # or "tiny", "small", etc.
except ImportError:
    WHISPER_AVAILABLE = False
    whisper_model = None
    logger.warning("Whisper not available. Local STT will be disabled.")

from fastapi import FastAPI, File, UploadFile
from fastapi.responses import JSONResponse
import tempfile

# If not already created elsewhere, create FastAPI app
try:
    app
except NameError:
    app = FastAPI()

@app.post("/api/transcribe")
async def transcribe_audio(file: UploadFile = File(...)):
    if not WHISPER_AVAILABLE or whisper_model is None:
        return JSONResponse(status_code=503, content={"error": "Whisper STT not available on this server."})
    with tempfile.NamedTemporaryFile(delete=False, suffix=".wav") as tmp:
        tmp.write(await file.read())
        tmp_path = tmp.name
    try:
        result = whisper_model.transcribe(tmp_path)
        text = result["text"]
    except Exception as e:
        logger.error(f"Whisper transcription error: {e}")
        text = ""
    finally:
        os.unlink(tmp_path)
    return {"text": text}