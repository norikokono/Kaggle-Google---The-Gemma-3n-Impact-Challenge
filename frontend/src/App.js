import React, { useState, useRef, useEffect, useCallback } from 'react';
import './App.css';
import { MapContainer, TileLayer, Marker, useMapEvents } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import markerIcon from 'leaflet/dist/images/marker-icon.png';
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';
import MarkdownReport from './MarkdownReport';
import ImageWithPlaceholder from './ImageWithPlaceholder';
import AudioRecorder from './AudioRecorder';
import WildfireDetection from './components/WildfireDetection';

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
      zoom={8}
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
  const [coords, setCoords] = useState([37.7749, -122.4194]); // Default: San Francisco
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
    setAnalysis(null);
    try {
      const requestData = {
        lat: coords[0],
        lng: coords[1],
        radius_km: 50
      };
      
      const response = await fetch('http://127.0.0.1:8000/api/analyze-fire-map', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestData)
      });
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.detail || `HTTP error! status: ${response.status}`);
      }
      
      const data = await response.json();
      setAnalysis(data);
    } catch (err) {
      console.error('Error fetching analysis:', err);
      setAnalysis({ 
        error: `Failed to fetch analysis: ${err.message}`,
        details: process.env.NODE_ENV === 'development' ? err.stack : undefined
      });
    } finally {
      setLoading(false);
    }
  };

  const speakWithBackendTTS = async (text) => {
    try {
      // Clean the text (remove emojis and special characters)
      const cleanedText = text
        .replace(/[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu, '')
        .replace(/[^\w\s.,!?]/g, '') // Remove any remaining special characters
        .replace(/\s+/g, ' ') // Replace multiple spaces with a single space
        .trim();
      
      // Create a new utterance with the cleaned text
      const utterance = new SpeechSynthesisUtterance(cleanedText);
      
      // Set up event handlers
      utterance.onend = () => {
        console.log('Speech finished');
        setIsSpeaking(false);
        setTtsError(null);
      };
      
      utterance.onerror = (event) => {
        console.error('SpeechSynthesis error:', event);
        setTtsError('Error during speech synthesis');
        setIsSpeaking(false);
      };

      // Cancel any current speech
      speechSynthesis.cancel();
      
      // Start speaking
      speechSynthesis.speak(utterance);
      setIsSpeaking(true);
      setTtsError(null);
      
    } catch (error) {
      console.error('Error with TTS:', error);
      setTtsError('Speech synthesis is not available in this browser');
      setIsSpeaking(false);
    }
  };

  const handleTtsClick = () => {
    if (isSpeaking) {
      // If already speaking, stop it
      speechSynthesis.cancel();
      setIsSpeaking(false);
      return;
    }

    if (speechSynthesis.paused) {
      // If paused, resume
      speechSynthesis.resume();
      setIsSpeaking(true);
      return;
    }

    // Start new speech
    const rawText = analysis.report || analysis.analysis || 'No report available to read.';
    speakWithBackendTTS(rawText);
  };

  return (
    <div className="App">
      <header className="App-header">
        <h1>WildGuard: Wildfire Detection & Crisis Response Accross North America</h1>
        <p>Powered by Google Gemma 3n</p>
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
        <div className="card" style={{ width: '100%', maxWidth: '100%', height: '500px', marginBottom: '16px', position: 'relative' }}>
          <div style={{ position: 'absolute', top: '10px', left: '10px', zIndex: 1000, background: 'white', padding: '5px', borderRadius: '4px', boxShadow: '0 2px 4px rgba(0,0,0,0.2)' }}>
            <LocationDisplay coords={coords} />
          </div>
          <MovableMap 
            coords={coords} 
            setCoords={setCoords} 
            onMapCreated={handleMapCreated}
          />
          {mapInstance && <WildfireDetection map={mapInstance} />}
        </div>
        <div className="card" style={{ marginBottom: 0 }}>
          <div style={{ marginBottom: 8, fontWeight: 500, color: '#345', fontSize: '1.04em' }}>
            <LocationDisplay coords={coords} />
          </div>
          <div style={{display:'flex',flexDirection:'column',gap:'0.7em'}}>
            <div>
              <label htmlFor="lat">Latitude:</label>
              <input
                id="lat"
                type="number"
                value={coords[0]}
                onChange={e => setCoords([parseFloat(e.target.value), coords[1]])}
                step="0.0000001"
                style={{ width: '175px', fontSize: '1em' }}
              />
            </div>
            <div>
              <label htmlFor="lng">Longitude:</label>
              <input id="lng" type="number" value={coords[1]} onChange={e => setCoords([coords[0], parseFloat(e.target.value)])} step="0.0001" />
            </div>
            <button onClick={() => fetchAnalysis()}>Analyze Risk</button>
          </div>
        </div>
        {loading && <div className="card">Analyzing wildfire risk...</div>}
        {analysis && analysis.analysis && (
          <div className="card MarkdownReport" style={{paddingTop:0}}>
            <div className="report-header">
              <span className="report-icon" role="img" aria-label="tree">🌲</span>
              <span className="report-title">WILDFIRE SITUATION REPORT</span>
            </div>
            <MarkdownReport text={analysis.analysis} />
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
                      <i className="bi bi-stop-fill"></i>
                    ) : (
                      <i className="bi bi-volume-up"></i>
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
                    style={{ height: '100%', width: '100%' }}
                    whenCreated={(map) => {
                      // Add fire data layer
                      if (analysis?.fire_detections?.length > 0) {
                        const fireMarkers = analysis.fire_detections
                          .filter(fire => fire.latitude && fire.longitude)
                          .map(fire => {
                            const marker = L.circleMarker(
                              [fire.latitude, fire.longitude], 
                              {
                                radius: 6,
                                fillColor: getFireColor(fire.confidence || 50),
                                color: '#000',
                                weight: 1,
                                opacity: 1,
                                fillOpacity: 0.8
                              }
                            );
                            
                            const popupContent = `
                              <div style="min-width: 200px">
                                <strong>Fire Detection</strong><br>
                                Confidence: ${Math.round(fire.confidence || 50)}%<br>
                                Date: ${fire.acq_date || 'N/A'}<br>
                                ${fire.brightness ? `Brightness: ${fire.brightness} K<br>` : ''}
                                <small>Click for details</small>
                              </div>
                            `;
                            
                            marker.bindPopup(popupContent);
                            return marker;
                          });

                        const fireGroup = L.layerGroup(fireMarkers).addTo(map);
                        
                        // Fit map to show all fire markers with some padding
                        if (fireMarkers.length > 0) {
                          const group = new L.featureGroup(fireMarkers);
                          map.fitBounds(group.getBounds().pad(0.1));
                        }
                      }
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
                <div className="text-muted small p-3 text-center" style={{ borderTop: '1px solid #eee' }}>
                  Data source: NASA FIRMS |{' '}
                  <a href="https://firms.modaps.eosdis.nasa.gov/map/" target="_blank" rel="noopener noreferrer">
                    View on NASA FIRMS
                  </a>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

export default App;
