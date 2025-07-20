import os
from dotenv import load_dotenv
import google.generativeai as genai

# Load environment variables from .env file
load_dotenv()

# Configure the API key
api_key = os.getenv('GOOGLE_AI_STUDIO_API_KEY')
if not api_key:
    raise ValueError("API key not found. Please set GOOGLE_AI_STUDIO_API_KEY in your .env file")

genai.configure(api_key=api_key)

# Initialize the model
model = genai.GenerativeModel('gemma-3n-e2b-it')

try:
    # Generate content
    response = model.generate_content("Roses are red...")
    print(response.text)
except Exception as e:
    print(f"An error occurred: {e}")