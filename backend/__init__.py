"""
Firebase Functions entry point for WildGuard.
"""
from firebase_functions import https_fn
from firebase_admin import initialize_app, firestore, storage

# Initialize Firebase Admin SDK
initialize_app()

# Import the FastAPI app
from main import app

# Export the FastAPI app as a Firebase Function
analyzeFireMap = https_fn.on_request(
    timeout_sec=540,  # 9 minutes (max timeout for 2nd gen functions)
    min_instances=0,  # Allow scaling to zero when not in use
    max_instances=10,  # Maximum number of instances
    region="us-central1",
    cors=True
)(app)
