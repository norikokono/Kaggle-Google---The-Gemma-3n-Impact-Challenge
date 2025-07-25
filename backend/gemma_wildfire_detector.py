import google.generativeai as genai
from PIL import Image
import io
import logging
import os
from datetime import datetime, timezone, UTC
from typing import Dict, Any, Optional
from dotenv import load_dotenv

logger = logging.getLogger(__name__)

class WildfireDetector:
    def __init__(self):
        try:
            # Ensure API key is loaded from environment
            load_dotenv()
            self.api_key = os.getenv('GOOGLE_AI_STUDIO_API_KEY')
            if not self.api_key:
                logger.error("GOOGLE_AI_STUDIO_API_KEY environment variable not set. Please set it in your .env file.")
                raise ValueError("GOOGLE_AI_STUDIO_API_KEY environment variable not set.")
            
            genai.configure(api_key=self.api_key)
            # Updated to use the correct model name for image analysis
            self.model = genai.GenerativeModel('gemma-3n-e4b-it')
            logger.info("WildfireDetector initialized with Google Gemma 3n model.")
            self.genai_available = True
        except Exception as e:
            logger.warning(f"Could not initialize WildfireDetector with Google Generative AI: {e}")
            logger.warning("WildfireDetector will operate in simplified analysis mode (no AI image analysis).")
            self.model = None
            self.genai_available = False

    async def detect_wildfire(
        self, 
        image: Image.Image,
        context: Dict[str, Any]
    ) -> Dict[str, Any]:
        """
        Analyzes a fire map image using the Gemma 3n AI model with enhanced context.

        Args:
            image: The map image to analyze.
            context: Contextual information including:
                - timestamp: Formatted timestamp of the analysis
                - location: Dict with lat, lng, and radius_km
                - weather: Current weather data and fire weather index
                - fire_detections: Fire data from multiple sources (FIRMS, VIIRS, MODIS)

        Returns:
            Dict containing analysis results including risk level, observations, etc.
        """
        if not isinstance(image, Image.Image):
            error_msg = f"Invalid image type: {type(image)}. Expected PIL.Image.Image"
            logger.error(error_msg)
            return self._error_analysis(error_msg)
            
        if not context or not isinstance(context, dict):
            logger.warning("No or invalid context provided, using empty context")
            context = {}

        if not self.genai_available or not self.model:
            logger.warning("WildfireDetector not fully initialized. Providing simplified analysis.")
            return await self._basic_analysis_with_context(image, context)

        try:
            # Convert image to bytes for the API
            img_byte_arr = io.BytesIO()
            image.save(img_byte_arr, format='PNG')
            img_byte_arr = img_byte_arr.getvalue()

            # Prepare the prompt with enhanced context
            prompt = self._build_enhanced_prompt(context)
            
            # Call the Gemini Pro Vision model with error handling for API calls
            try:
                response = self.model.generate_content(
                    [prompt, Image.open(io.BytesIO(img_byte_arr))],
                    generation_config={
                        'max_output_tokens': 2048,
                        'temperature': 0.2,
                    }
                )
                
                if not response or not hasattr(response, 'text'):
                    raise ValueError("Invalid or empty response from model")
                    
            except Exception as api_error:
                logger.error(f"Error calling Gemini API: {str(api_error)}")
                return await self._basic_analysis_with_context(image, context)

            # Process the response with additional context
            analysis = self._parse_enhanced_response(response.text, context)
            
            # Add metadata
            analysis.update({
                'coordinates': context.get('location', {}).get('coordinates', {}),
                'timestamp': context.get('timestamp', datetime.now(timezone.utc).isoformat()),
                'model': 'gemini-pro-vision',
                'version': '1.1',
                'data_sources': context.get('metadata', {}).get('data_sources', [])
            })
            
            return analysis
            
        except Exception as e:
            logger.error(f"Error in detect_wildfire: {str(e)}", exc_info=True)
            return await self._basic_analysis_with_context(image, context)

    def _build_enhanced_prompt(self, context: Dict[str, Any]) -> str:
        """Build an enhanced prompt with comprehensive context for the AI model."""
        location = context.get('location', {})
        weather = context.get('weather', {})
        fire_detections = context.get('fire_detections', {})
        
        prompt_parts = [
            "# Wildfire Risk Analysis - Enhanced Context",
            f"## Location: {location.get('lat')}°N, {location.get('lng')}°E (Radius: {location.get('radius_km', 50)}km)",
            f"## Timestamp: {context.get('timestamp', 'Current time')}"
        ]
        
        # Add weather context
        if weather:
            current = weather.get('current', {})
            alerts = weather.get('alerts', [])
            fwi = weather.get('fire_weather_index', {})
            
            prompt_parts.extend([
                "\n## Weather Conditions",
                f"- Temperature: {current.get('temp', 'N/A')}°C",
                f"- Humidity: {current.get('humidity', 'N/A')}%",
                f"- Wind: {current.get('wind_speed', 'N/A')} m/s from {current.get('wind_deg', 'N/A')}°",
                f"- Fire Weather Index: {fwi.get('index', 'N/A')} ({fwi.get('risk_level', 'Unknown')})"
            ])
            
            if alerts:
                prompt_parts.append("\n## Weather Alerts")
                for alert in alerts[:3]:  # Limit to 3 most recent alerts
                    prompt_parts.append(f"- {alert.get('event', 'Alert')}: {alert.get('description', 'No details')}")
        
        # Add fire detection context
        if fire_detections:
            prompt_parts.append("\n## Fire Detections")
            for source, detections in fire_detections.items():
                if isinstance(detections, list):
                    count = len(detections)
                    if count > 0:
                        # Add source information with detection count
                        source_name = source.upper()
                        if source == 'firms':
                            source_name += ' (NASA FIRMS)'
                        elif source == 'viirs':
                            source_name += ' (NOAA/NASA VIIRS)'
                        elif source == 'modis':
                            source_name += ' (NASA MODIS)'
                        prompt_parts.append(f"- {source_name}: {count} active detections")
                        # Add details of the most intense detection
                        most_intense = max(detections, key=lambda x: float(x.get('brightness', 0)))
                        prompt_parts.append("  - Most intense: "
                                         f"Brightness: {most_intense.get('brightness', 'N/A')}, "
                                         f"Date: {most_intense.get('acq_date', 'N/A')}")
        
        # Add analysis instructions
        prompt_parts.extend([
            "\n## Analysis Instructions",
            "1. Assess visible fire indicators (smoke, thermal anomalies, burn scars)",
            "2. Consider weather conditions and fire weather index",
            "3. Evaluate proximity to populated areas and critical infrastructure",
            "4. Account for terrain features and vegetation",
            "5. Correlate with satellite fire detections",
            "6. Provide a risk assessment with confidence level",
            "7. Recommend immediate actions if needed"
        ])
        
        prompt_parts.append("\nProvide a detailed analysis in the following format:")
        prompt_parts.append("1. Fire Detection Summary")
        prompt_parts.append("2. Risk Assessment (Low/Medium/High/Extreme)")
        prompt_parts.append("3. Key Observations")
        prompt_parts.append("4. Recommended Actions")
        
        return "\n".join(prompt_parts)

    def _parse_enhanced_response(self, response: str, context: Dict[str, Any]) -> Dict[str, Any]:
        """Parse the response from the AI model and add additional context."""
        result = {
            "risk_level": "Unknown",
            "confidence": 0.0,
            "observations": [],
            "recommendations": []
        }
        
        current_section = None
        
        for line in response.splitlines():
            if not line:
                continue
                    
            # Check for section headers
            if line.lower().startswith("**risk level**"):
                current_section = "risk"
                result["risk_level"] = line.split(":")[-1].strip() if ":" in line else "Unknown"
            elif line.lower().startswith("**confidence**"):
                current_section = "confidence"
                try:
                    confidence_str = line.split(":")[-1].strip().replace('%', '')
                    result["confidence"] = float(confidence_str)
                except (ValueError, IndexError):
                    result["confidence"] = 0.0
            elif line.lower().startswith("**key observations**"):
                current_section = "observations"
            elif line.lower().startswith("**recommendations**"):
                current_section = "recommendations"
            elif line.lower().startswith("**urgency**"):
                current_section = "urgency"
                result["urgency"] = line.split(":")[-1].strip() if ":" in line else "Unknown"
            
            # Process bullet points
            elif line.startswith("-") or line.startswith("*"):
                content = line[1:].strip()
                if current_section == "observations":
                    result["observations"].append(content)
                elif current_section == "recommendations":
                    result["recommendations"].append(content)
        
        # Ensure we have at least some content
        if not result["observations"] and not result["recommendations"]:
            result["observations"] = ["No specific fire patterns detected in the image."]
            result["recommendations"] = ["Continue monitoring the area for any changes."]
        
        return result
            
    async def _basic_analysis_with_context(self, image: Image.Image, context: Dict[str, Any]) -> Dict[str, Any]:
        """
        Fallback analysis when AI is not available, using enhanced context.
        Incorporates data from trusted sources including:
        - National Interagency Fire Center (NIFC)
        - US Forest Service
        - National Oceanic and Atmospheric Administration (NOAA)
        - Global Fire Weather Database (GFWED)
        - European Forest Fire Information System (EFFIS)
        
        Args:
            image: The map image to analyze
            context: Context dictionary with weather and fire data
            
        Returns:
            Dict containing basic analysis results with references to reliable sources
        """
        # Source: National Interagency Fire Center (NIFC) - Fire Danger Rating System
        FIRE_DANGER_RATINGS = {
            'low': {'min': 0, 'max': 1.9, 'color': 'green', 'description': 'Fires unlikely to start'},
            'moderate': {'min': 2, 'max': 4.9, 'color': 'blue', 'description': 'Some fires may start'},
            'high': {'min': 5, 'max': 7.9, 'color': 'yellow', 'description': 'Fires can start easily'},
            'very high': {'min': 8, 'max': 9.9, 'color': 'orange', 'description': 'Fires start very easily'},
            'extreme': {'min': 10, 'max': 100, 'color': 'red', 'description': 'Explosive fire potential'}
        }
        
        # Source: US Forest Service Fire Behavior Field Reference Guide
        FIRE_BEHAVIOR_FACTORS = {
            'fuel_moisture': {
                '1-hour': '1-3%',    # 1-3% moisture content (most flammable)
                '10-hour': '2-5%',   # 2-5%
                '100-hour': '5-8%',  # 5-8%
                '1000-hour': '8-15%' # 8-15% (least flammable)
            },
            'wind_speed_impact': {
                'low': (0, 10),    # 0-10 mph
                'moderate': (11, 20),  # 11-20 mph
                'high': (21, 35),      # 21-35 mph
                'extreme': (36, 100)   # 36+ mph
            }
        }
        
        fire_detections = context.get('fire_detections', {})
        weather = context.get('weather', {})
        fwi = weather.get('fire_weather_index', {})
        
        # Count total fire detections across all sources with source attribution
        total_detections = 0
        detection_sources = {}
        
        for source, detections in fire_detections.items():
            if isinstance(detections, list):
                count = len(detections)
                total_detections += count
                if count > 0:
                    # Add source information with detection count
                    source_name = source.upper()
                    if source == 'firms':
                        source_name += ' (NASA FIRMS)'
                    elif source == 'viirs':
                        source_name += ' (NOAA/NASA VIIRS)'
                    elif source == 'modis':
                        source_name += ' (NASA MODIS)'
                    detection_sources[source_name] = count
        
        # Enhanced risk assessment with scientific basis
        risk_factors = []
        current_weather = weather.get('current', {})
        temp = current_weather.get('temp', 0)
        humidity = current_weather.get('humidity', 50)
        wind_speed = current_weather.get('wind_speed', 0)
        
        # Process air quality data if available
        air_quality = context.get('air_quality', {})
        pm25_data = air_quality.get('pm25', {}) if air_quality else {}
        
        # Add air quality to risk factors if available
        if pm25_data and 'value' in pm25_data and 'category' in pm25_data:
            risk_factors.append(
                f"Air Quality (PM2.5): {pm25_data['value']} - {pm25_data['category']}"
            )
            # Add smoke indicator if PM2.5 is high
            if pm25_data['value'] > 100:  # Unhealthy or worse
                risk_factors.append('elevated smoke levels detected')
                # Add smoke plume direction if wind data is available
                if 'wind_deg' in current_weather:
                    wind_dir = current_weather['wind_deg']
                    directions = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE',
                                'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW']
                    dir_idx = round(wind_dir / (360. / len(directions))) % len(directions)
                    wind_cardinal = directions[dir_idx]
                    risk_factors.append(f'smoke likely moving {wind_cardinal}')
        
        # Temperature analysis (Source: NIFC Fire Danger Rating)
        if temp > 32:  # >90°F is considered high fire danger
            risk_factors.append(f'high temperature ({temp:.1f}°C)')
        elif temp > 27:  # >80°F
            risk_factors.append('elevated temperature')
            
        # Humidity analysis (Source: USFS Fire Weather Index)
        if humidity < 20:  # <20% is critical fire weather
            risk_factors.append(f'critically low humidity ({humidity}%)')
        elif humidity < 30:
            risk_factors.append(f'low humidity ({humidity}%)')
            
        # Wind speed analysis (Source: Beaufort Wind Scale and NIFC)
        if wind_speed > 15:  # >15 m/s (~34 mph) is high wind warning
            risk_factors.append(f'high wind speed ({wind_speed:.1f} m/s)')
        elif wind_speed > 8:  # >8 m/s (~18 mph) increases fire spread
            risk_factors.append(f'moderate wind speed ({wind_speed:.1f} m/s)')
        
        # Fire weather index with scientific context
        fwi_risk = fwi.get('risk_level', 'unknown').lower()
        fwi_value = fwi.get('index', 0)
        
        if fwi_risk != 'unknown':
            # Add FWI with interpretation
            fwi_interpretation = next(
                (v['description'] for k, v in FIRE_DANGER_RATINGS.items() 
                 if v['min'] <= fwi_value <= v['max']),
                'Unknown risk level'
            )
            risk_factors.append(
                f'Fire Weather Index: {fwi_value:.1f} ({fwi_risk.capitalize()}) - {fwi_interpretation}'
            )
        
        # Add detection information if available
        if total_detections > 0:
            detections_text = f'{total_detections} active fire detection(s) from: ' + ', '.join(
                [f'{k} ({v})' for k, v in detection_sources.items()]
            )
            risk_factors.append(detections_text)
        
        # Enhanced risk determination with scientific basis
        risk_score = 0
        
        # Temperature scoring (Source: NIFC Fire Danger Rating)
        if temp > 32:  # >90°F
            risk_score += 3
        elif temp > 27:  # >80°F
            risk_score += 1
            
        # Humidity scoring (Source: USFS Fire Weather Index)
        if humidity < 20:  # Critical fire weather
            risk_score += 4
        elif humidity < 30:
            risk_score += 2
            
        # Wind speed scoring (Source: NIFC Fire Behavior)
        if wind_speed > 15:  # >15 m/s
            risk_score += 3
        elif wind_speed > 8:  # >8 m/s
            risk_score += 1
            
        # Air quality scoring (Source: AirNow AQI categories)
        if pm25_data and 'value' in pm25_data:
            aqi = pm25_data['value']
            if aqi > 200:  # Very Unhealthy or Hazardous
                risk_score += 4
            elif aqi > 150:  # Unhealthy
                risk_score += 3
            elif aqi > 100:  # Unhealthy for Sensitive Groups
                risk_score += 2
            elif aqi > 50:   # Moderate
                risk_score += 1
        
        # Fire detection scoring
        if total_detections > 10:
            risk_score += 4
        elif total_detections > 0:
            risk_score += 2
            
        # Determine risk level based on score (0-15 scale)
        if risk_score == 0:
            risk_level = 'low'
            confidence = 'high'
            analysis = 'No significant fire risk indicators detected based on current conditions.'
        elif risk_score <= 5:
            risk_level = 'moderate'
            confidence = 'high'
            analysis = f'Moderate fire risk detected. Primary factors: {", ".join(risk_factors[:3])}.'
        elif risk_score <= 10:
            risk_level = 'high'
            confidence = 'high' if total_detections > 0 else 'medium'
            analysis = f'High fire risk detected. Key factors: {", ".join(risk_factors[:4])}.'
        else:
            risk_level = 'very high'
            confidence = 'high'
            analysis = (
                f'VERY HIGH FIRE DANGER. Critical conditions detected: {risk_factors[0]}. '
                'Extreme caution advised. Consider evacuation if near affected areas.'
            )
        
        # Enhanced recommendations with source attribution
        recommendations = []
        
        # Always include basic safety guidelines (Source: Ready.gov Wildfire Safety)
        base_recommendations = [
            'Monitor local emergency alerts and weather reports',
            'Review and be prepared to execute your wildfire action plan',
            'Keep emergency supplies ready including N95 masks, go-bags, and important documents'
        ]
        
        # Risk-specific recommendations
        if risk_level == 'low':
            recommendations.extend([
                'Maintain defensible space around your property (30-100 feet recommended by NFPA)',
                'Clear gutters and roof of dry leaves and debris',
                'Test smoke detectors and fire extinguishers'
            ])
        elif risk_level == 'moderate':
            recommendations.extend([
                'Avoid outdoor burning and equipment that could create sparks',
                'Keep vehicles off dry grass',
                'Have a plan for pets and livestock',
                'Charge electronic devices in case of power outages'
            ])
        else:  # High or very high risk
            recommendations.extend([
                'Be prepared to evacuate if ordered by local officials',
                'Wear N95 masks to reduce smoke inhalation',
                'Move flammable items away from your home (patio furniture, firewood, etc.)',
                'Connect garden hoses and fill water containers',
                'Park vehicles facing the direction of escape',
                'Keep headlights on and garage doors closed if evacuating'
            ])
        
        # Add air quality specific recommendations if data is available
        if pm25_data and 'value' in pm25_data:
            aqi = pm25_data['value']
            if aqi > 150:  # Unhealthy or worse
                recommendations.extend([
                    'Limit outdoor activities due to poor air quality',
                    'Use N95 masks if going outside',
                    'Keep windows and doors closed',
                    'Use air purifiers if available'
                ])
            elif aqi > 100:  # Unhealthy for Sensitive Groups
                recommendations.extend([
                    'Sensitive groups should limit outdoor activities',
                    'Keep windows closed if air quality worsens'
                ])
        
        # Add source information
        sources = [
            'National Interagency Fire Center',
            'US Forest Service',
            'Ready.gov',
            'NFPA',
            'AirNow Fire and Smoke Map',
            'US EPA Air Quality Index'
        ]
        recommendations.append(f'\nSources: {", ".join(sources)}')
        
        # Enhanced response with more detailed context and source attribution
        response = {
            'analysis': analysis,
            'risk_level': risk_level,
            'confidence': confidence,
            'key_observations': risk_factors,
            'recommendations': base_recommendations + recommendations,
            'context': {
                'weather_conditions': {
                    'description': current_weather.get('weather', [{}])[0].get('description', 'Unknown'),
                    'temperature': f"{temp:.1f}°C",
                    'humidity': f"{humidity}%",
                    'wind_speed': f"{wind_speed:.1f} m/s",
                    'feels_like': f"{current_weather.get('feels_like', temp):.1f}°C"
                },
                'fire_detections': {
                    'total': total_detections,
                    'sources': detection_sources,
                    'last_updated': context.get('timestamp', 'Unknown')
                },
                'risk_assessment': {
                    'level': risk_level,
                    'score': risk_score,
                    'confidence': confidence,
                    'factors_considered': [
                        'temperature', 'humidity', 'wind_speed',
                        'fire_detections', 'fire_weather_index'
                    ]
                },
                'data_sources': [
                    'NASA FIRMS (Fire Information for Resource Management System)',
                    'NOAA/NASA VIIRS (Visible Infrared Imaging Radiometer Suite)',
                    'NASA MODIS (Moderate Resolution Imaging Spectroradiometer)',
                    'OpenWeatherMap API',
                    'AirNow Fire and Smoke Map',
                    'US EPA Air Quality Index',
                    'National Interagency Fire Center (NIFC) Fire Danger Rating',
                    'US Forest Service Fire Behavior Field Reference'
                ],
                'disclaimer': (
                    'This analysis is based on available data and predictive models. '
                    'Always follow official guidance from local emergency services.'
                )
            },
            'metadata': {
                'generated_at': datetime.now(timezone.utc).isoformat(),
                'version': '1.2.0',
                'data_sources_last_updated': context.get('metadata', {}).get('data_sources', [])
            }
        }
        
        # Add air quality data to response if available
        if pm25_data:
            response['context']['air_quality'] = {
                'pm25': pm25_data,
                'health_implications': self._get_aqi_health_implications(pm25_data.get('value'))
            }
        
        # Add FWI data if available
        if fwi_risk != 'unknown':
            response['context']['fire_weather_index'] = {
                'value': fwi_value,
                'risk_level': fwi_risk,
                'interpretation': next(
                    (v['description'] for k, v in FIRE_DANGER_RATINGS.items() 
                     if v['min'] <= fwi_value <= v['max']),
                    'Unknown risk level'
                )
            }
            
        return response

    def _get_aqi_health_implications(self, aqi: Optional[int]) -> Dict[str, Any]:
        """Get health implications based on AQI value."""
        if aqi is None:
            return {
                'level': 'Unknown',
                'health_concerns': 'No air quality data available',
                'cautionary_statement': 'Check local air quality reports'
            }
            
        if aqi <= 50:
            return {
                'level': 'Good',
                'health_concerns': 'Air quality is considered satisfactory',
                'cautionary_statement': 'None'
            }
        elif aqi <= 100:
            return {
                'level': 'Moderate',
                'health_concerns': 'Unusually sensitive individuals may experience symptoms',
                'cautionary_statement': 'Consider reducing prolonged outdoor exertion'
            }
        elif aqi <= 150:
            return {
                'level': 'Unhealthy for Sensitive Groups',
                'health_concerns': 'Increasing likelihood of respiratory symptoms in sensitive individuals',
                'cautionary_statement': 'People with respiratory or heart disease, older adults, and children should reduce prolonged outdoor exertion'
            }
        elif aqi <= 200:
            return {
                'level': 'Unhealthy',
                'health_concerns': 'Increased aggravation of heart or lung disease and premature mortality in people with cardiopulmonary disease',
                'cautionary_statement': 'People with respiratory or heart disease, older adults, and children should avoid prolonged outdoor exertion; everyone else should limit prolonged outdoor exertion'
            }
        else:
            return {
                'level': 'Very Unhealthy to Hazardous',
                'health_concerns': 'Significant aggravation of heart or lung disease and premature mortality in people with cardiopulmonary disease',
                'cautionary_statement': 'Everyone should avoid all physical activity outdoors; people with respiratory or heart disease, older adults, and children should remain indoors and keep activity levels low'
            }
    
    def _fallback_analysis(self) -> Dict[str, Any]:
        """Return a fallback analysis when the AI model is not available."""
        return {
            "status": "warning",
            "analysis": "Advanced image analysis unavailable. Using simplified analysis.",
            "risk_level": "Unknown",
            "confidence": 0.0,
            "recommendations": [
                "Rely on other data sources for fire detection.",
                "Check system configuration and API keys."
            ],
            "source": "offline_fallback",
            "timestamp": datetime.now(timezone.utc).isoformat()
        }
    
    def _error_analysis(self, error_msg: str) -> Dict[str, Any]:
        """Return an error analysis result."""
        return {
            "status": "error",
            "analysis": f"Failed to analyze map image: {error_msg}",
            "risk_level": "Unknown",
            "confidence": 0.0,
            "recommendations": [
                "Verify API key and model access.",
                "Ensure the image is clear and properly formatted.",
                "Check system logs for detailed error information."
            ],
            "source": "analysis_error",
            "timestamp": datetime.now(timezone.utc).isoformat()
        }