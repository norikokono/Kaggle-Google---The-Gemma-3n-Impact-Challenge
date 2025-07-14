from fastapi import FastAPI, Request
from pydantic import BaseModel

app = FastAPI()

class ImagePayload(BaseModel):
    image: str

@app.post("/api/describe_vegetation")
async def describe_vegetation(payload: ImagePayload):
    # TODO: Integrate Gemma 3n model here
    return {"description": "This is a simulated vegetation description."}
