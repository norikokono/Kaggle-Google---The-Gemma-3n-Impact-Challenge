# WildGuard: AI-Powered Wildfire Detection

![WildGuard Logo](https://via.placeholder.com/800x200/1a5f7a/ffffff?text=WildGuard)

## 🚀 Overview
WildGuard is an AI solution designed to detect and respond to wildfires in real-time. It processes satellite imagery, weather data, and ground sensor inputs to provide early warnings and critical information to communities at risk.

## 🌟 Key Features

### 🔥 Early Detection
- **AI-Powered Analysis**: Processes satellite and camera feeds
- **Multimodal Data**: Combines visual, thermal, and environmental data
- **Real-time Alerts**: Immediate notifications for potential fire incidents

### � Connectivity
- **Online Mode**: Full functionality with internet connection
- **Offline Support**: Basic features available without internet (in development)
  - Service worker caches essential assets
  - Offline fallback page available
  - Local data storage for critical information

> **Note**: Advanced AI features require an internet connection. Full offline functionality is currently in development.

### 🚨 Emergency Response
- **Evacuation Planning**: Generates optimized routes based on real-time conditions
- **Resource Allocation**: Helps first responders identify critical areas
- **Community Alerts**: Broadcasts warnings to nearby devices

## 🛠️ Technical Architecture

### Backend (Python/FastAPI)
- **Gemma 3n Integration**: On-device model inference
- **Data Processing**: Handles satellite, weather, and sensor data
- **API Endpoints**: RESTful interface for mobile and web clients
- **Google Earth Engine**: Satellite data processing and analysis

### Frontend (React/TypeScript)
- **Progressive Web App**: Works across all devices
- **Offline Support**: Service workers for offline functionality
- **Interactive Map**: Real-time visualization of fire risks and incidents
- **Voice Search**: Hands-free location search with voice commands

## 🚀 Getting Started

### Prerequisites
- Python 3.9+
- Node.js 16+
- Google Cloud account with Earth Engine API enabled
- Google Earth Engine service account credentials

### Installation

#### Backend Setup
```bash
# Clone the repository
git clone https://github.com/yourusername/wildguard.git
cd wildguard/backend

# Create and activate virtual environment
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Set up Google Earth Engine credentials
# 1. Go to Google Cloud Console
# 2. Create a new project or select existing
# 3. Enable Earth Engine API
# 4. Create service account and download private key as 'private-key.json'

# Copy environment file and update with your details
cp .env.example .env
# Edit .env with your service account email and key path
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

## 🧪 Testing Offline Mode

1. **Using Chrome DevTools**:
   - Open DevTools (F12 or Cmd+Option+I)
   - Go to "Application" tab > "Service Workers"
   - Check "Offline" checkbox
   - Refresh the page

2. **System-Level Testing**:
   - Disconnect from the internet
   - Reload the application
   - The app should load from cache and show the offline indicator

## 🌐 API Documentation

### Assess Wildfire Risk

**POST** `/api/assess_risk`

Assess wildfire risk for a specific location.

**Request Body:**
```json
{
  "latitude": 37.7749,
  "longitude": -122.4194,
  "date_range": ["2023-01-01", "2023-12-31"]
}
```

**Response:**
```json
{
  "status": "success",
  "location": {
    "latitude": 37.7749,
    "longitude": -122.4194,
    "date_range": ["2023-01-01", "2023-12-31"]
  },
  "risk_score": 65.5,
  "risk_level": "High",
  "factors": {
    "vegetation_dryness": 75.2,
    "temperature": 68.3,
    "humidity": 42.1,
    "precipitation": 35.7,
    "slope": 12.4
  }
}
```

## 🤝 Contributing
We welcome contributions! Please read our [Contributing Guidelines](CONTRIBUTING.md) for details.

## 📄 License
This project is licensed under the Apache 2.0 License - see the [LICENSE](LICENSE) file for details.
