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
  const currentUtterance = useRef(null);

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
      let reqBody;
      if (locationText) {
        // Optionally: geocode locationText to lat/lng
        reqBody = {
          coordinates: { lat: coords[0], lng: coords[1] },
          radius_km: 50,
          date_range: "7d",
          generate_image: true,
          include_evacuation: true
        };
      } else {
        reqBody = {
          coordinates: { lat: coords[0], lng: coords[1] },
          radius_km: 50,
          date_range: "7d",
          generate_image: true,
          include_evacuation: true
        };
      }
      const res = await fetch('http://127.0.0.1:8000/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(reqBody)
      });
      const data = await res.json();
      setAnalysis(data);
    } catch (err) {
      setAnalysis({ error: 'Failed to fetch analysis.' });
    }
    setLoading(false);
  };

  return (
    <div className="App">
      <header className="App-header">
        <h1>WildGuard: Wildfire Detection & Crisis Response Accross North America</h1>
        <p>Powered by Google Gemma 3n</p>
      </header>
      <main>
        <div className="search-row">
          <input
            type="text"
            placeholder="Search for a city, landmark, or address..."
            value={searchText}
            onChange={e => setSearchText(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleSearch(); }}
          />
          <button onClick={handleSearch}>Search</button>
          <AudioRecorder
            onTranscription={text => {
              setSearchText(text);
              handleSearch();
            }}
            disabled={loading}
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
                  {/* Play/Pause Button */}
                  <button
                  onClick={async () => {
                    if (!speechSynthesis) {
                      alert('Text-to-speech is not available. Please try again or use a different browser.');
                      return;
                    }

                    try {
                      // Get fresh instance of speech synthesis
                      const synth = window.speechSynthesis;
                      
                      if (isSpeaking) {
                        // Pause current speech
                        synth.pause();
                        setIsSpeaking(false);
                        return;
                      }

                      // If paused, resume
                      if (synth.paused) {
                        synth.resume();
                        setIsSpeaking(true);
                        return;
                      }

                      // Create a new utterance with the report text (with emojis removed)
                      const removeEmojis = (text) => {
                        if (!text) return '';
                        // Remove common emojis and symbols
                        return text.replace(/[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F1E0}-\u{1F1FF}]/gu, '')
                                  .replace(/[\u{1F900}-\u{1F9FF}]/gu, ''); // Additional emoji ranges
                      };
                      
                      const rawText = analysis.report || analysis.analysis || 'No report available to read.';
                      const textToSpeak = removeEmojis(rawText);
                      console.log('Preparing to speak text (emojis removed):', textToSpeak.substring(0, 100) + '...');
                      
                      const utterance = new SpeechSynthesisUtterance(textToSpeak);
                      
                      // Get fresh voices list
                      const voices = synth.getVoices();
                      console.log('Available voices at speak time:', voices);
                      
                      if (voices.length === 0) {
                        throw new Error('No voices available for speech synthesis');
                      }
                      
                      // Log the currently selected voice for debugging
                      console.log('Current selectedVoice:', selectedVoice);
                      
                      // Try to find the selected voice, or fall back to default
                      let voiceToUse = selectedVoice ? 
                        voices.find(v => v.voiceURI === selectedVoice.voiceURI) : null;
                      
                      // If selected voice not found, try to find a default voice
                      if (!voiceToUse) {
                        console.log('Selected voice not found, trying to find default voice');
                        voiceToUse = voices.find(v => v.default) || voices[0];
                      }
                      
                      if (voiceToUse) {
                        console.log('Using voice:', voiceToUse.name, voiceToUse.lang, voiceToUse);
                        // Important: Must set both voice and lang
                        utterance.voice = voiceToUse;
                        utterance.lang = voiceToUse.lang || 'en-US';
                        console.log('Utterance voice set to:', utterance.voice);
                      } else {
                        console.warn('No suitable voice found, using browser default');
                        // Let the browser choose the default voice
                      }
                      
                      // Set speech parameters
                      utterance.rate = 1.0;    // 0.1 to 10
                      utterance.pitch = 1.0;   // 0 to 2
                      utterance.volume = 1.0;  // 0 to 1
                      
                      console.log('Utterance prepared:', {
                        text: textToSpeak.substring(0, 50) + '...',
                        voice: utterance.voice?.name || 'default',
                        lang: utterance.lang,
                        rate: utterance.rate,
                        pitch: utterance.pitch,
                        volume: utterance.volume
                      });

                      // Set up event handlers
                      utterance.onstart = () => {
                        console.log('Speech started');
                        currentUtterance.current = utterance;
                        setIsSpeaking(true);
                      };
                      
                      utterance.onend = () => {
                        console.log('Speech ended');
                        setIsSpeaking(false);
                        currentUtterance.current = null;
                      };
                      
                      utterance.onerror = (event) => {
                        console.error('SpeechSynthesis error:', event);
                        setIsSpeaking(false);
                        currentUtterance.current = null;
                        alert(`Error reading the report: ${event.error}. Please try again.`);
                      };
                      
                      // Cancel any ongoing speech
                      console.log('Cancelling any ongoing speech...');
                      synth.cancel();
                      
                      // Add a small delay to ensure the previous speech is fully cancelled
                      setTimeout(() => {
                        try {
                          console.log('Attempting to speak...');
                          synth.speak(utterance);
                          console.log('Speech started successfully');
                        } catch (error) {
                          console.error('Error starting speech:', error);
                          setIsSpeaking(false);
                          alert(`Failed to start speech: ${error.message}. Please try again.`);
                        }
                      }, 200);
                    } catch (error) {
                      console.error('Text-to-speech error:', error);
                      setIsSpeaking(false);
                      alert('Failed to initialize text-to-speech. Please check your browser permissions.');
                    }
                  }}
                    className={`btn ${isSpeaking ? 'btn-warning' : 'btn-primary'} me-3`}
                    aria-label={isSpeaking ? 'Pause reading' : 'Listen to report'}
                    title={isSpeaking ? 'Pause reading' : 'Listen to report'}
                  >
                    <i className={`bi ${isSpeaking ? 'bi-pause-fill' : 'bi-play-fill'} me-2`}></i>
                    {isSpeaking ? 'Pause' : 'Play'}
                  </button>

                  {/* Stop Button */}
                  <button
                    onClick={() => {
                      if (speechSynthesis) {
                        speechSynthesis.cancel();
                        setIsSpeaking(false);
                      }
                    }}
                    className="btn btn-outline-secondary me-3"
                    disabled={!isSpeaking && !speechSynthesis?.speaking}
                    aria-label="Stop reading"
                    title="Stop reading"
                  >
                    <i className="bi bi-stop-fill me-2"></i>
                    Stop
                  </button>

                  {/* Voice Selection */}
                  {!isLoadingVoices && availableVoices.length > 0 ? (
                    <div className="voice-selection">
                      <select
                        value={selectedVoice?.voiceURI || ''}
                        onChange={(e) => {
                          const voice = availableVoices.find(v => v.voiceURI === e.target.value);
                          if (voice) {
                            console.log('Selected voice:', voice.name, voice.lang);
                            setSelectedVoice(voice);
                          }
                        }}
                        className="form-select form-select-sm"
                        style={{ width: 'auto' }}
                        disabled={isSpeaking}
                      >
                        {availableVoices.map((voice, index) => (
                          <option key={index} value={voice.voiceURI}>
                            {voice.name} ({voice.lang}){voice.default ? ' - Default' : ''}
                          </option>
                        ))}
                      </select>
                    </div>
                  ) : (
                    <div className="text-muted ms-auto">
                      <small>Loading voices...</small>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Wildfire Detection from Satellite Imagery */}
            {mapInstance && <WildfireDetection map={mapInstance} />}
            
            {/* Interactive Fire Map Card */}
            <div className="card mb-4">
              <div className="card-header bg-success text-white">
                <h5 className="mb-0">Interactive Fire Map</h5>
              </div>
              <div className="card-body" style={{ padding: 0 }}>
                <div style={{ height: '600px', width: '100%' }}>
                  <MapContainer 
                    center={coords} 
                    zoom={8} 
                    style={{ height: '100%', width: '100%' }}
                    whenCreated={(map) => {
                      // Add fire data layer
                      if (analysis && analysis.fire_detections && analysis.fire_detections.length > 0) {
                        analysis.fire_detections.forEach(fire => {
                          if (fire.latitude && fire.longitude) {
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
                            marker.addTo(map);
                          }
                        });
                      }
                    }}
                  >
                    <TileLayer
                      url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                      attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                    />
                    {analysis && analysis.fire_detections && analysis.fire_detections.length === 0 && (
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
