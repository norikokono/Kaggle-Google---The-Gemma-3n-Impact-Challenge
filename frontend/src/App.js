import React, { useState, useRef, useEffect, useCallback } from 'react';
import { ToastContainer, toast } from 'react-toastify';
import ReactMarkdown from 'react-markdown';
import 'react-toastify/dist/ReactToastify.css';
import './App.css';
import { MapContainer, TileLayer, Marker, useMapEvents } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import markerIcon from 'leaflet/dist/images/marker-icon.png';
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';
import MarkdownReport from './MarkdownReport';
import AudioRecorder from './AudioRecorder';
import WildfireDetection from './components/WildfireDetection';
import { post } from './utils/api';

const API_BASE_URL = process.env.REACT_APP_API_URL;

// Geocode utility (OpenStreetMap Nominatim)
async function geocodeLocation(locationText) {
  const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(locationText)}`;
  try {
    const res = await fetch(url);
    const results = await res.json();
    if (results && results.length > 0) {
      return [parseFloat(results[0].lat), parseFloat(results[0].lon)];
    }
  } catch (error) {
    console.error('Geocoding error:', error);
  }
  return null;
}

// Get color based on fire detection confidence level
function getFireColor(confidence) {
  const value = Math.min(100, Math.max(0, confidence || 0));
  if (value > 80) return '#ff0000';     // Red for high confidence
  if (value > 60) return '#ff6600';     // Orange-red
  if (value > 40) return '#ff9900';     // Orange
  if (value > 20) return '#ffcc00';     // Yellow-orange
  return '#ffff00';                     // Yellow for low confidence
}

// Fix leaflet's default icon path
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: markerIcon2x,
  iconUrl: markerIcon,
  shadowUrl: markerShadow,
});

function MovableMap({ coords, setCoords, onMapCreated }) {
  const mapRef = useRef();
  const [mapCenter, setMapCenter] = useState(coords);

  // Only update map center when coords change from input, not from user panning
  useEffect(() => {
    if (mapRef.current) {
      mapRef.current.setView(coords, mapRef.current.getZoom());
      setMapCenter(coords);
    }
  }, [coords]);

  // Set the map reference in the global scope for WildfireDetection to access
  useEffect(() => {
    if (mapRef.current && window.setMapRef) {
      window.setMapRef(mapRef.current);
    }
    
    // Call the onMapCreated callback when the map is created
    if (mapRef.current && onMapCreated) {
      onMapCreated(mapRef.current);
    }
  }, [mapRef.current, onMapCreated]);

  return (
    <MapContainer
      center={mapCenter}
      zoom={4}
      minZoom={3}
      maxBounds={[
        [5.499550, -167.276413], // Southwest coordinates (southern Mexico, western Alaska)
        [83.162102, -52.233040]   // Northeast coordinates (northern Canada, eastern Canada)
      ]}
      maxBoundsViscosity={1.0}
      style={{ height: '100%', width: '100%', borderRadius: 12 }}
      whenCreated={mapInstance => {
        mapRef.current = mapInstance;
        if (window.setMapRef) {
          window.setMapRef(mapInstance);
        }
        
        // Call the onMapCreated callback
        if (onMapCreated) {
          onMapCreated(mapInstance);
        }
      }}
    >
      <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
      <Marker position={coords} />
      <LocationMarker setCoords={setCoords} />
    </MapContainer>
  );
}

function LocationMarker({ setCoords }) {
  useMapEvents({
    click(e) {
      setCoords([e.latlng.lat, e.latlng.lng]);
    },
  });
  return null;
}

function LocationDisplay({ coords }) {
  const [place, setPlace] = React.useState('');
  React.useEffect(() => {
    async function reverseGeocode() {
      const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${coords[0]}&lon=${coords[1]}`;
      try {
        const res = await fetch(url);
        const data = await res.json();
        if (data && data.display_name) {
          setPlace(data.display_name);
        } else {
          setPlace('Unknown location');
        }
      } catch {
        setPlace('Unknown location');
      }
    }
    reverseGeocode();
  }, [coords]);
  return <div>Location: {place}</div>;
}

function App() {
  const [coords, setCoords] = useState([48.1667, -100.1667]); // Default: Center of North America
  const [searchText, setSearchText] = useState('');
  const [analysis, setAnalysis] = useState(null);
  const [loading, setLoading] = useState(false);
  const [voiceActive, setVoiceActive] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [selectedVoice, setSelectedVoice] = useState(null);
  const [availableVoices, setAvailableVoices] = useState([]);
  const [isLoadingVoices, setIsLoadingVoices] = useState(true);
  const [speechSynthesis, setSpeechSynthesis] = useState(null);
  const [mapInstance, setMapInstance] = useState(null);
  const [ttsError, setTtsError] = useState(null);
  const currentUtterance = useRef(null);
  const [mapView, setMapView] = useState('satellite'); // 'satellite' or 'street'
  const mapRef = useRef();

  // Update map instance when it's created
  const handleMapCreated = useCallback((map) => {
    setMapInstance(map);
  }, []);

  // Handle text search
  const handleSearch = async () => {
    if (!searchText.trim()) return;
    const foundCoords = await geocodeLocation(searchText);
    if (foundCoords) {
      setCoords(foundCoords);
    } else {
      alert('Location not found.');
    }
    setSearchText('');
  };

  // Initialize speech synthesis and load available voices when component mounts
  useEffect(() => {
    // Check if speech synthesis is available
    if (!('speechSynthesis' in window)) {
      console.error('Speech Synthesis API not supported in this browser');
      alert('Text-to-speech is not supported in your browser. Please use Chrome, Edge, or Safari.');
      return;
    }

    const synth = window.speechSynthesis;
    console.log('SpeechSynthesis initialized:', !!synth);
    setSpeechSynthesis(synth);
    
    const loadVoices = () => {
      try {
        const voices = synth.getVoices();
        console.log('Available voices:', voices);
        
        if (voices.length > 0) {
          const voiceList = [...voices];
          setAvailableVoices(voiceList);
          
          // Set or update selected voice
          setSelectedVoice(prevSelected => {
            // Try to find a default voice, or fall back to the first available
            const defaultVoice = voiceList.find(v => v.default) || voiceList[0];
            
            // If we already have a selected voice, try to find it in the new voices list
            if (prevSelected) {
              const found = voiceList.find(v => v.voiceURI === prevSelected.voiceURI);
              if (found) return found;
            }
            
            console.log('Setting default voice:', defaultVoice);
            return defaultVoice;
          });
          
          setIsLoadingVoices(false);
          console.log('Voices loaded successfully');
        } else {
          console.log('No voices available yet, will retry...');
          // If no voices are loaded yet, try again after a short delay
          setTimeout(loadVoices, 500);
        }
      } catch (error) {
        console.error('Error loading voices:', error);
      }
    };

    // Initial load
    console.log('Initializing speech synthesis...');
    
    // Some browsers need a user interaction before voices are available
    const handleFirstInteraction = () => {
      console.log('First interaction detected, loading voices...');
      loadVoices();
      document.removeEventListener('click', handleFirstInteraction);
      document.removeEventListener('keydown', handleFirstInteraction);
    };

    // Try to load voices immediately
    if (synth.getVoices().length > 0) {
      loadVoices();
    } else {
      // Set up event listeners for first user interaction
      console.log('Waiting for user interaction to load voices...');
      document.addEventListener('click', handleFirstInteraction, { once: true });
      document.addEventListener('keydown', handleFirstInteraction, { once: true });
      
      // Also try to load after a delay in case the interaction events don't fire
      const timeoutId = setTimeout(() => {
        console.log('Delayed voice load attempt...');
        loadVoices();
      }, 2000);
      
      return () => {
        clearTimeout(timeoutId);
        document.removeEventListener('click', handleFirstInteraction);
        document.removeEventListener('keydown', handleFirstInteraction);
      };
    }

    // Set up voices changed handler
    if (synth.onvoiceschanged !== undefined) {
      console.log('Setting up onvoiceschanged handler');
      synth.onvoiceschanged = loadVoices;
    }

    // Cleanup
    return () => {
      if (synth) {
        console.log('Cleaning up speech synthesis');
        synth.cancel();
        synth.onvoiceschanged = null;
      }
    };
  }, []);

  // Fetch AI analysis
  const fetchAnalysis = async (locationText = null) => {
    setLoading(true);
    setAnalysis(null); // Clear previous analysis when starting a new request
    
    try {
      // Format the request data to match the backend's FireAnalysisRequest model
      const requestData = {
        lat: coords[0],
        lng: coords[1],
        radius_km: 50.0
      };
      
      console.log('Sending request to API with data:', requestData);
      
      const data = await post('/analyze-fire-map', requestData);
      console.log('API Response:', data);
      
      // Process the response to ensure it has the expected structure
      const processedData = {
        fire_detections: data.fire_detections || [],
        fire_count: data.fire_count || data.fire_detections?.length || 0,
        analysis: {
          confidence: data.confidence || data.analysis?.confidence || 0,
          summary: data.analysis?.summary || '',
          recommendations: data.analysis?.recommendations || []
        },
        confidence: data.confidence || data.analysis?.confidence || 0,
        timestamp: data.timestamp || data.last_updated || new Date().toISOString(),
        last_updated: data.last_updated || data.timestamp || new Date().toISOString(),
        risk_level: data.risk_level || 'Unknown',
        map_url: data.map_url,
        map_html: data.map_html,
        ...data // Include any additional fields from the response
      };
      
      console.log('Processed analysis data:', processedData);
      setAnalysis(processedData);
      
    } catch (err) {
      console.error('Error in fetchAnalysis:', err);
      setAnalysis({
        fire_detections: [],
        fire_count: 0,
        analysis: { confidence: 0, summary: '', recommendations: [] },
        confidence: 0,
        timestamp: new Date().toISOString(),
        last_updated: new Date().toISOString(),
        risk_level: 'Error',
        error: `Failed to fetch analysis: ${err.message}`,
        details: process.env.NODE_ENV === 'development' ? err.stack : undefined
      });
      
      // Show error toast to user
      toast.error(`Error: ${err.message}`, {
        position: "top-right",
        autoClose: 5000,
        hideProgressBar: false,
        closeOnClick: true,
        pauseOnHover: true,
        draggable: true
      });
    } finally {
      setLoading(false);
    }
  };

  const speakWithBackendTTS = (text) => {
    // 1. Reset any previous errors and set speaking state
    setTtsError(null);
    
    // 2. Check if speech synthesis is available
    if (!('speechSynthesis' in window)) {
      const errorMsg = 'Text-to-speech is not supported in your browser';
      console.error(errorMsg);
      setTtsError(errorMsg);
      return;
    }
    
    // 3. Convert input to string safely
    let textToSpeak = 'No text available to read.';
    try {
      if (text === null || text === undefined) {
        textToSpeak = 'No text available to read.';
      } else if (typeof text === 'string') {
        textToSpeak = text;
      } else if (typeof text === 'object') {
        // Handle different possible response formats
        textToSpeak = text.analysis || 
                     text.report || 
                     text.text ||
                     (text.data && text.data.analysis) ||
                     'No readable content found in the response.';
        
        // If we still have an object, convert it to string
        if (typeof textToSpeak === 'object') {
          textToSpeak = JSON.stringify(textToSpeak);
        }
      } else {
        // Handle numbers, booleans, etc.
        textToSpeak = String(text);
      }
      
      // 4. Clean the text
      textToSpeak = textToSpeak
        .replace(/<[^>]*>/g, '') // Remove HTML tags
        .replace(/\s+/g, ' ')    // Replace multiple spaces with single space
        .trim();
      
      if (!textToSpeak) {
        throw new Error('No valid text content to read');
      }
      
      // 5. Create and configure the utterance
      const utterance = new SpeechSynthesisUtterance(textToSpeak);
      
      // 6. Set up event handlers
      utterance.onstart = () => {
        console.log('Speech started');
        setIsSpeaking(true);
      };
      
      utterance.onend = () => {
        console.log('Speech ended');
        setIsSpeaking(false);
      };
      
      utterance.onerror = (event) => {
        console.error('Speech synthesis error:', event);
        setTtsError('Error reading the text. Please try again.');
        setIsSpeaking(false);
      };
      
      // 7. Stop any current speech and start the new one
      speechSynthesis.cancel();
      speechSynthesis.speak(utterance);
      
    } catch (error) {
      console.error('Error preparing text for speech:', error);
      setTtsError('Error preparing the text for reading');
      setIsSpeaking(false);
    }
  };

  const handleTtsClick = () => {
    // If already speaking, stop it
    if (isSpeaking) {
      speechSynthesis.cancel();
      setIsSpeaking(false);
      return;
    }
    
    // If paused, resume
    if (speechSynthesis.paused) {
      speechSynthesis.resume();
      setIsSpeaking(true);
      return;
    }
    
    // Start new speech with the analysis data
    // speakWithBackendTTS will handle all the text extraction and cleaning
    speakWithBackendTTS(analysis || 'No analysis available to read.');
  };

  return (
    <div className="App">
      <header className="hero">
        <div className="hero-background"></div>
        <div className="hero-gradient"></div>
        <div className="hero-overlay"></div>
        <div className="hero-content">
          <h1>WildGuard</h1>
          <h2>Wildfire Detection & Crisis Response Across North America</h2>
          <p className="tagline">AI-Powered Early Warning System</p>
          <p className="disclaimer">
            This is a submission for the Google Gemma 3n Impact Challenge on Kaggle Competition. Our mission is to combat the growing threat of wildfires through advanced AI technology, providing timely detection and response solutions to protect communities and ecosystems.
          </p>
        </div>
      </header>
      <main>
        <div className="search-row">
          <p>Please enter a location to search, click on the map to search or speak to search for wildfires</p>
          <input
            type="text"
            placeholder="Search for a city, landmark, or address..."
            value={searchText}
            onChange={e => setSearchText(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleSearch(); }}
          />
          <button 
            onClick={handleSearch}
            disabled={!searchText.trim() || loading}
          >
            {loading ? 'Searching...' : 'Search'}
          </button>
          <div className="or-divider">or</div>
          <AudioRecorder
            onTranscription={(text) => {
              setSearchText(text);
              // Small delay to ensure state is updated before search
              setTimeout(() => {
                handleSearch();
              }, 100);
            }}
            disabled={!('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) || loading}
          />
        </div>
        <div className="card" style={{ 
          width: '100%', 
          maxWidth: '100%', 
          height: '60vh', 
          minHeight: '400px',
          marginBottom: '16px', 
          position: 'relative',
          padding: '0',
          overflow: 'hidden',
          borderRadius: '12px',
          boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)'
        }}>
          <div style={{
            position: 'absolute',
            top: '12px',
            left: '12px',
            zIndex: 1000,
            background: 'rgba(255, 255, 255, 0.9)',
            padding: '6px 12px',
            borderRadius: '20px',
            boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
            fontSize: '0.9em',
            fontWeight: 500,
            color: '#333',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            maxWidth: 'calc(100% - 24px)',
            boxSizing: 'border-box'
          }}>
            <span style={{ color: '#4a6cf7' }}>📍</span>
            <LocationDisplay coords={coords} />
          </div>
          <MovableMap 
            coords={coords} 
            setCoords={setCoords} 
            onMapCreated={handleMapCreated}
            style={{
              width: '100%',
              height: '100%',
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0
            }}
          />
          {mapInstance && <WildfireDetection map={mapInstance} />}
          <div style={{
            position: 'absolute',
            bottom: '12px',
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 1000,
            background: 'rgba(255, 255, 255, 0.9)',
            padding: '8px 16px',
            borderRadius: '20px',
            boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
            fontSize: '0.85em',
            color: '#555',
            textAlign: 'center',
            maxWidth: '90%',
            boxSizing: 'border-box',
            display: 'flex',
            alignItems: 'center',
            gap: '6px'
          }}>
            <span style={{ color: '#e53e3e' }}>🔥</span>
            <span>Click and drag the map to select a location</span>
          </div>
        </div>
        <div className="card" style={{ marginBottom: 0 }}>
          <div style={{ marginBottom: '16px', fontWeight: 500, color: '#345', fontSize: '1.04em' }}>
            <LocationDisplay coords={coords} />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <label htmlFor="lat" style={{ display: 'block', marginBottom: '4px', fontSize: '0.95em' }}>Latitude</label>
              <input
                id="lat"
                type="number"
                value={coords[0]}
                onChange={e => setCoords([parseFloat(e.target.value) || 0, coords[1]])}
                step="0.0000001"
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  borderRadius: '6px',
                  border: '1px solid #ccc',
                  fontSize: '1em',
                  boxSizing: 'border-box'
                }}
              />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <label htmlFor="lng" style={{ display: 'block', marginBottom: '4px', fontSize: '0.95em' }}>Longitude</label>
              <input 
                id="lng" 
                type="number" 
                value={coords[1]} 
                onChange={e => setCoords([coords[0], parseFloat(e.target.value) || 0])} 
                step="0.0001"
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  borderRadius: '6px',
                  border: '1px solid #ccc',
                  fontSize: '1em',
                  boxSizing: 'border-box'
                }}
              />
            </div>
            <button 
              onClick={() => fetchAnalysis()}
              style={{
                padding: '10px 16px',
                backgroundColor: '#4a6cf7',
                color: 'white',
                border: 'none',
                borderRadius: '6px',
                fontSize: '1em',
                fontWeight: 500,
                cursor: 'pointer',
                transition: 'background-color 0.2s',
                marginTop: '8px'
              }}
              onMouseOver={e => e.target.style.backgroundColor = '#3a5ce4'}
              onMouseOut={e => e.target.style.backgroundColor = '#4a6cf7'}
            >
              Analyze Risk
            </button>
          </div>
        </div>
        {loading && <div className="card">Analyzing wildfire risk...</div>}
        {analysis && analysis.analysis && (
          <div className="card MarkdownReport" style={{padding: '16px', overflow: 'auto'}}>
            <div className="report-header">
              <div className="report-header-content">
                <span className="report-icon" role="img" aria-label="fire">🔥</span>
                <h3>Wildfire Risk Analysis</h3>
              </div>
            </div>
            <div className="report-content">
              <ReactMarkdown>
                {typeof (analysis.analysis.summary || analysis.analysis) === 'string' 
                  ? (analysis.analysis.summary || analysis.analysis) 
                  : JSON.stringify(analysis.analysis.summary || analysis.analysis, null, 2)
                }
              </ReactMarkdown>
            </div>
          </div>
        )}
        {analysis && (
          <div>
            {/* Listen to Report Card */}
            <div className="card mb-4">
              <div className="card-header bg-info text-white">
                <h5 className="mb-0">Listen to Report</h5>
              </div>
              <div className="card-body">
                <div className="d-flex align-items-center">
                  {/* TTS Button */}
                  <button 
                    onClick={handleTtsClick}
                    className="btn btn-sm btn-outline-secondary me-2"
                    disabled={!analysis}
                    title={isSpeaking ? 'Stop reading' : 'Listen to report'}
                  >
                    {isSpeaking ? (
                      <span role="img" aria-label="stop">⏹️</span>
                    ) : (
                      <span role="img" aria-label="speaker">🔊</span>
                    )}
                  </button>
                  {ttsError && (
                    <small className="text-danger">{ttsError}</small>
                  )}
                </div>
              </div>
            </div>

            {/* Wildfire Detection from Satellite Imagery */}
            {mapInstance && <WildfireDetection map={mapInstance} />}
            
            {/* Interactive Fire Map Card */}
            <div className="card mb-4">
              <div className="card-header bg-success text-white d-flex justify-content-between align-items-center">
                <h5 className="mb-0">Interactive Fire Map</h5>
                <button 
                  onClick={() => setMapView(mapView === 'satellite' ? 'street' : 'satellite')}
                  className="btn btn-sm btn-light"
                >
                  {mapView === 'satellite' ? '🌍 Satellite View' : '🗺️ Street View'}
                </button>
              </div>
              <div className="card-body" style={{ padding: 0 }}>
                <div style={{ height: '600px', width: '100%' }}>
                  <MapContainer 
                    center={coords} 
                    zoom={8}
                    style={{ 
                      height: '100%', 
                      width: '100%',
                      position: 'relative'
                    }}
                  >
                    {mapView === 'satellite' ? (
                      <TileLayer
                        url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
                        attribution='Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community'
                        maxZoom={19}
                      />
                    ) : (
                      <TileLayer
                        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                        maxZoom={19}
                      />
                    )}
                    
                    {analysis?.fire_detections?.length === 0 && (
                      <div className="text-center py-4">
                        <p>No fire detections found in this area.</p>
                      </div>
                    )}
                  </MapContainer>
                </div>
              </div>
              <div className="text-muted small p-3 text-center" style={{ borderTop: '1px solid #eee' }}>
                Data source: NASA FIRMS |{' '}
                <a href="https://firms.modaps.eosdis.nasa.gov/map/" target="_blank" rel="noopener noreferrer">
                  View on NASA FIRMS
                </a>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

export default App;
