# WildGuard: AI-Powered Wildfire Detection

🔗 [View Live Demo](https://wildguard-hackathon-2025.web.app/)

## 🚀 Overview
WildGuard is an AI-powered wildfire detection system that analyzes NASA FIRMS satellite data to identify and monitor wildfire hotspots in real-time. It provides critical fire detection and analysis to help communities and first responders.

## 🌟 Key Features

### 🔥 Fire Detection
- **Satellite Data Integration**: Real-time fire detection using NASA FIRMS API
- **AI-Powered Analysis**: Processes thermal anomaly data from VIIRS and MODIS satellites
- **Interactive Maps**: Visualize fire detections with detailed location information

### 🌐 Connectivity
- **RESTful API**: Built with FastAPI for high-performance data processing
- **CORS Support**: Secure cross-origin requests for web applications
- **Real-time Updates**: Get the latest fire detection data for any location
- **Offline Support**: Basic features available without internet (in development)
  - Service worker caches essential assets
  - Offline fallback page available
  - Local data storage for critical information

> **Note**: Real-time fire detection requires an internet connection to access NASA FIRMS data.

### 🚨 Emergency Features
- **Fire Analysis**: Detailed reports on detected wildfires
- **Risk Assessment**: AI-powered evaluation of fire risk levels
- **Interactive Maps**: Visual representation of fire detections and heat maps

## 🛠️ Technical Architecture

### Backend (Python/FastAPI)
- **NASA FIRMS API**: Real-time fire detection data from VIIRS and MODIS satellites
- **FastAPI**: High-performance API for data processing
- **CORS Support**: Secure cross-origin requests
- **Geospatial Analysis**: Process and analyze fire detection data

### Frontend (React/TypeScript)
- **Interactive Map**: Visualize fire detections with Leaflet/OpenStreetMap
- **Responsive Design**: Works on desktop and mobile devices
- **Voice Commands**: Hands-free control of the application

## 🚀 Getting Started

### Prerequisites
- Python 3.9+
- Node.js 16+
- [NASA FIRMS API Key](https://firms.modaps.eosdis.nasa.gov/api/area/) - Required for real-time fire data

### Installation

#### Backend Setup
```bash
# Clone the repository
git clone https://github.com/norikokono/Kaggle-Google---The-Gemma-3n-Impact-Challenge.git

# Navigate to the backend director
cd backend

# Create and activate virtual environment
python -m venv .venv
source .venv/bin/activate  # On Windows: .venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Set up environment variables
cp .env.example .env
# Edit .env and add your NASA FIRMS API key
# NASA_FIRMS_API_KEY=your_api_key_here
```

#### Frontend Setup
```bash
cd ../frontend
npm install
```

### Running the Application

#### Start Backend
```bash
cd backend
uvicorn main:app --reload
```

#### Start Frontend (in a new terminal)
```bash
cd frontend
npm start
```

## 🌐 API Documentation

### Analyze Fire Map

**POST** `/analyze-fire-map`

Analyze fire data for a specific location.

**Request Body:**
```json
{
  "lat": 37.7749,
  "lng": -122.4194,
  "radius_km": 50
}
```

**Response:**
```json
{
  "status": "success",
  "analysis_id": "abc123",
  "fire_detections": [
    {
      "latitude": 37.775,
      "longitude": -122.419,
      "bright_ti4": 320.5,
      "frp": 18.7,
      "confidence": "high"
    }
  ],
  "analysis": {
    "total_fires": 1,
    "risk_level": "high",
    "recommendations": ["Monitor area closely", "Alert local authorities"]
  },
  "map_url": "/api/maps/abc123",
  "map_html": "<div>...</div>",
  "timestamp": "2025-08-04T01:00:00Z"
}
```

### Get Fire Map

**GET** `/api/maps/{analysis_id}`

Retrieve a previously generated fire map.

**Response:**

- HTML page with interactive map

## 📄 License
This project is licensed under the Apache 2.0 License - see the [LICENSE](LICENSE) file for details.

## 🔥 Wildfire Monitoring with Gemma 3n

This implementation showcases a practical application of **Gemma 3n** in environmental monitoring and emergency response.

> ⚠️ **Disclaimer:** This app was developed as a prototype for a hackathon.  
> For accurate and up-to-date wildfire information, please refer to official and established resources.
