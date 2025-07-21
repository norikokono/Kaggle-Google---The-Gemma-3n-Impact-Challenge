from fastapi import APIRouter, UploadFile, File
from fastapi.responses import JSONResponse
from gemma import WildGuardAI
import tempfile
import traceback
import os

router = APIRouter()

def parse_voice_intent(audio_path):
    """
    Use Gemma 3n to transcribe and parse user intent from audio.
    Returns: dict with 'intent', 'entities', 'transcript'.
    """
    try:
        ai = WildGuardAI.get_instance()
        # Step 1: Transcribe
        transcript = ai.transcribe(audio_path)
        # Step 2: Parse intent (let Gemma 3n do NLU)
        intent_data = ai.parse_intent(transcript)
        return {
            'intent': intent_data.get('intent', 'unknown'),
            'entities': intent_data.get('entities', {}),
            'transcript': transcript
        }
    except Exception as e:
        traceback.print_exc()
        return {'intent': 'unknown', 'entities': {}, 'transcript': '', 'error': str(e)}

@router.post('/api/voice-intent')
async def voice_intent(file: UploadFile = File(...)):
    try:
        with tempfile.NamedTemporaryFile(delete=False, suffix='.wav') as tmp:
            contents = await file.read()
            tmp.write(contents)
            tmp_path = tmp.name
        result = parse_voice_intent(tmp_path)
        os.remove(tmp_path)
        return JSONResponse(content=result)
    except Exception as e:
        traceback.print_exc()
        return JSONResponse(content={'intent': 'unknown', 'entities': {}, 'transcript': '', 'error': str(e)}, status_code=500)
