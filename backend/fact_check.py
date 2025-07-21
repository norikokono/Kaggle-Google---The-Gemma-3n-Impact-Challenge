from fastapi import APIRouter, Body
from fastapi.responses import JSONResponse

router = APIRouter()

from gemma import WildGuardAI
import re

@router.post('/api/fact-check')
async def fact_check(claim: str = Body(...)):
    """
    Accepts a claim (text) and returns a verdict (true/false/uncertain) and sources if available.
    Uses local Gemma 3n (WildGuardAI) for fact-checking via prompt engineering.
    """
    ai = WildGuardAI.get_instance() if hasattr(WildGuardAI, 'get_instance') else WildGuardAI()
    prompt = f"""
    You are an expert fact-checking AI. Given the following claim, respond with one of: TRUE, FALSE, or UNCERTAIN, and cite any supporting evidence or sources if possible.
    
    Claim: "{claim}"
    
    Respond in the following JSON format:
    {{"verdict": "TRUE|FALSE|UNCERTAIN", "sources": ["source1", "source2"]}}
    """
    try:
        result = await ai.generate_analysis(prompt)
        # Try to extract JSON from the model's output
        m = re.search(r'\{.*\}', result.get('analysis', ''), re.DOTALL)
        if m:
            import json
            try:
                parsed = json.loads(m.group(0))
                verdict = parsed.get('verdict', 'uncertain').lower()
                sources = parsed.get('sources', [])
            except Exception:
                verdict = 'uncertain'
                sources = []
        else:
            verdict = 'uncertain'
            sources = []
        return JSONResponse(content={"verdict": verdict, "sources": sources, "raw": result.get('analysis', '')})
    except Exception as e:
        return JSONResponse(content={"verdict": "uncertain", "sources": [], "error": str(e)})

