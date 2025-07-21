# Wildfire Risk Assessment System

A lightweight system for assessing wildfire risk using Google Earth Engine API and environmental data analysis.

## Features

- **Real-time Risk Assessment**: Analyze wildfire risk for any location worldwide
- **Multiple Risk Factors**: Considers vegetation health, weather conditions, and topography
- **Simple API**: Easy-to-use RESTful API for integration with other applications
- **Lightweight**: Minimal dependencies and efficient data processing

## Prerequisites

1. Python 3.8+
2. Google Cloud Platform (GCP) account with Earth Engine API enabled
3. Google Earth Engine service account credentials

## Setup

1. **Clone the repository**
   ```bash
   git clone <your-repo-url>
   cd wildfire-risk-assessment/backend
   ```

2. **Set up a virtual environment**
   ```bash
   python -m venv venv
   source venv/bin/activate  # On Windows: venv\Scripts\activate
   ```

3. **Install dependencies**
   ```bash
   pip install -r requirements.txt
   ```

4. **Set up Google Earth Engine**
   - Go to [Google Cloud Console](https://console.cloud.google.com/)
   - Create a new project or select an existing one
   - Enable the Earth Engine API
   - Create a service account and download the private key as `private-key.json`
   - Copy `.env.example` to `.env` and update with your service account email

5. **Run the application**
   ```bash
   uvicorn main:app --reload
   ```

## API Endpoints

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
  },
  "raw_data": {
    "ndvi": 0.42,
    "weather": {
      "temperature": 28.5,
      "humidity": 45.2,
      "precipitation": 12.3
    },
    "elevation": {
      "elevation": 123.5,
      "slope": 15.2,
      "aspect": 180.0
    }
  }
}
```

## Development

### Environment Variables

Create a `.env` file based on `.env.example` and set the following variables:

- `GEE_SERVICE_ACCOUNT`: Your Google Earth Engine service account email
- `GEE_PRIVATE_KEY_PATH`: Path to your private key JSON file (default: `private-key.json`)

### Testing

Run the test suite:
```bash
pytest
```

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

# WildGuard: Offline-First AI for Early Wildfire Detection

![WildGuard Logo](https://via.placeholder.com/800x200/1a5f7a/ffffff?text=WildGuard)

## 🚀 Overview
WildGuard is an offline-first AI solution designed to detect and respond to wildfires in real-time, even in areas with limited or no internet connectivity. Built with Google's Gemma 3n, it processes satellite imagery, weather data, and ground sensor inputs to provide early warnings and critical information to communities at risk.

## 🌟 Key Features

### 🔥 Early Detection
- **On-Device AI**: Processes satellite and camera feeds locally using Gemma 3n
- **Multimodal Analysis**: Combines visual, thermal, and environmental data
- **Low-Latency Alerts**: Immediate notifications for potential fire incidents

### 🌍 Offline-First Design
- **Zero Connectivity Needed**: Fully functional without internet access
- **Local Data Storage**: Critical information is cached for offline access
- **Peer-to-Peer Network**: Devices communicate directly in areas without infrastructure

### 🚨 Emergency Response
- **Evacuation Planning**: Generates optimized routes based on real-time conditions
- **Resource Allocation**: Helps first responders identify critical areas
- **Community Alerts**: Broadcasts warnings to nearby devices

## 🛠️ Technical Architecture

### Backend (Python/FastAPI)
- **Gemma 3n Integration**: On-device model inference
- **Data Processing**: Handles satellite, weather, and sensor data
- **API Endpoints**: RESTful interface for mobile and web clients

### Frontend (React/TypeScript)
- **Progressive Web App**: Works across all devices
- **Offline Support**: Service workers for offline functionality
- **Interactive Map**: Real-time visualization of fire risks and incidents

## 🚀 Getting Started

### Prerequisites
- Python 3.9+
- Node.js 16+
- Google Cloud account (for satellite data)

### Installation
```bash
# Clone the repository
git clone https://github.com/yourusername/wildguard.git
cd wildguard

# Set up backend
cd backend
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
pip install -r requirements.txt

# Set up frontend
cd ../frontend
npm install
```

### Configuration
1. Copy `.env.example` to `.env`
2. Add your API keys and configuration

### Running Locally
```bash
# Start backend
cd backend
uvicorn main:app --reload

# Start frontend (in a new terminal)
cd frontend
npm start
```

## 🤝 Contributing
We welcome contributions! Please read our [Contributing Guidelines](CONTRIBUTING.md) for details.

## 📄 License
This project is licensed under the Apache 2.0 License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments
- Google Earth Engine for satellite imagery
- FastAPI for the web framework
- The open-source community for their invaluable tools and libraries
- Kaggle for hosting this challenge
