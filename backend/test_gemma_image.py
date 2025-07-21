import os
import sys
from pathlib import Path

try:
    import google.generativeai as genai
except ImportError:
    print("google.generativeai not installed. Please install the Google Generative AI SDK.")
    sys.exit(1)

IMAGE_GEN_MODEL = os.environ.get('IMAGE_GEN_MODEL', 'gemma-3n-e2b-it')
API_KEY = os.environ.get('GOOGLE_AI_STUDIO_API_KEY')

if not API_KEY:
    print("GOOGLE_AI_STUDIO_API_KEY environment variable is not set.")
    sys.exit(1)

genai.configure(api_key=API_KEY)
model = genai.GenerativeModel(IMAGE_GEN_MODEL)

prompt = """
Create a realistic image of an active wildfire in a dense pine forest, with visible flames and smoke, viewed from above. No text or labels.
"""

print(f"Testing image generation with model: {IMAGE_GEN_MODEL}")
response = model.generate_content(prompt)

if hasattr(response, 'images') and response.images:
    out_path = Path("gemma_image_test_output.png")
    with open(out_path, 'wb') as f:
        f.write(response.images[0])
    print(f"Image generated and saved to {out_path}")
else:
    print("No image returned by model. Response attributes:", dir(response))
    print("Response: ", response)
