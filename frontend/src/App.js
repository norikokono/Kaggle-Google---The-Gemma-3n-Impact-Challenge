import React, { useState, useRef, useEffect } from 'react';
import './App.css';
import { MapContainer, TileLayer, Marker, useMap, useMapEvents } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import MarkdownReport from './MarkdownReport';
import ImageWithPlaceholder from './ImageWithPlaceholder';

import L from 'leaflet';
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png';
import markerIcon from 'leaflet/dist/images/marker-icon.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';

// Fix leaflet's default icon path
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: markerIcon2x,
  iconUrl: markerIcon,
  shadowUrl: markerShadow,
});

// AccessibleAnalysis: parses simple markdown to accessible HTML
function AccessibleAnalysis({ text }) {
  if (!text) return null;
  const lines = text.split('\n');
  const elements = [];
  let currentList = null;
  lines.forEach((line, i) => {
    if (/^##\s+/.test(line)) {
      if (currentList) { elements.push(<ul key={i+'ul'}>{currentList}</ul>); currentList = null; }
      elements.push(<h3 key={i+'h3'}>{line.replace(/^##\s+/, '')}</h3>);
    } else if (/^-\s+/.test(line)) {
      if (!currentList) currentList = [];
      currentList.push(<li key={i+'li'}>{line.replace(/^-\s+/, '')}</li>);
    } else if (/^\*.*\*$/.test(line.trim())) {
      if (currentList) { elements.push(<ul key={i+'ul'}>{currentList}</ul>); currentList = null; }
      elements.push(<p key={i+'em'}><em>{line.replace(/^\*|\*$/g, '').trim()}</em></p>);
    } else if (line.trim() === '---') {
      if (currentList) { elements.push(<ul key={i+'ul'}>{currentList}</ul>); currentList = null; }
      elements.push(<hr key={i+'hr'} />);
    } else if (line.trim() !== '') {
      if (currentList) { elements.push(<ul key={i+'ul'}>{currentList}</ul>); currentList = null; }
      elements.push(<p key={i+'p'}>{line}</p>);
    }
  });
  if (currentList) elements.push(<ul key={'endul'}>{currentList}</ul>);
  return <div style={{whiteSpace: 'pre-line', fontSize: '1rem', color: '#222'}} aria-live="polite">{elements}</div>;
}

// Geocode utility (OpenStreetMap Nominatim)
async function geocodeLocation(locationText) {
  const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(locationText)}`;
  const res = await fetch(url);
  const results = await res.json();
  if (results && results.length > 0) {
    return [parseFloat(results[0].lat), parseFloat(results[0].lon)];
  }
  return null;
}

function MovableMap({ coords, setCoords }) {
  const mapRef = useRef();
  const [mapCenter, setMapCenter] = useState(coords);

  // Only update map center when coords change from input, not from user panning
  useEffect(() => {
    if (mapRef.current) {
      mapRef.current.setView(coords, mapRef.current.getZoom());
      setMapCenter(coords);
    }
  }, [coords]);

  return (
    <MapContainer
      center={mapCenter}
      zoom={8}
      style={{ height: '100%', width: '100%', borderRadius: 12 }}
      whenCreated={mapInstance => { mapRef.current = mapInstance; }}
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
  const recognitionRef = useRef(null);

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

  // Handle voice search
  const handleVoiceInput = () => {
    if (!('webkitSpeechRecognition' in window)) {
      alert('Voice recognition not supported.');
      return;
    }
    const recognition = new window.webkitSpeechRecognition();
    recognition.lang = 'en-US';
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;
    recognition.onresult = async (event) => {
      const transcript = event.results[0][0].transcript;
      const foundCoords = await geocodeLocation(transcript);
      if (foundCoords) {
        setCoords(foundCoords);
      } else {
        alert('Location not found.');
      }
    };
    recognition.onerror = (event) => {
      alert('Voice input error: ' + event.error);
    };
    recognition.onend = () => setVoiceActive(false);
    recognition.start();
    recognitionRef.current = recognition;
    setVoiceActive(true);
  };

  // Voice input handler
  const handleVoiceInput2 = () => {
    if (!('webkitSpeechRecognition' in window)) {
      alert('Voice recognition not supported.');
      return;
    }
    if (!voiceActive) {
      const recognition = new window.webkitSpeechRecognition();
      recognition.lang = 'en-US';
      recognition.interimResults = false;
      recognition.maxAlternatives = 1;
      recognition.onresult = (event) => {
        const transcript = event.results[0][0].transcript;
        fetchAnalysis(transcript);
      };
      recognition.onend = () => setVoiceActive(false);
      recognition.start();
      recognitionRef.current = recognition;
      setVoiceActive(true);
    } else {
      recognitionRef.current && recognitionRef.current.stop();
      setVoiceActive(false);
    }
  };

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
          <button
            onClick={handleVoiceInput}
            title="Voice search"
            disabled={voiceActive || !('webkitSpeechRecognition' in window)}
            style={{display: 'flex', alignItems: 'center', gap: 4, opacity: ('webkitSpeechRecognition' in window) ? 1 : 0.5, cursor: ('webkitSpeechRecognition' in window) ? 'pointer' : 'not-allowed'}}
          >
            <span role="img" aria-label="mic">🎤</span>
            {voiceActive ? 'Listening...' : 'Voice Search'}
          </button>
        </div>
        <div className="card" style={{ width: '100%', maxWidth: 480, height: 320, marginBottom: 16 }}>
          <MovableMap coords={coords} setCoords={setCoords} />
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
                style={{ width: '170px', fontSize: '1em' }}
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
          <div className="card" style={{ padding: 0, marginBottom: 0 }}>
            <MarkdownReport text={analysis.report} />
            <button
              style={{margin: '12px 0 0 0', padding: '0.5em 1em', borderRadius: '7px', background: 'linear-gradient(90deg,#6366f1 60%,#38bdf8 100%)', color: '#fff', fontWeight: 600, border: 'none', fontSize: '1em', cursor: 'pointer'}}
              onClick={() => {
                if (window.speechSynthesis) {
                  window.speechSynthesis.cancel();
                  const utter = new window.SpeechSynthesisUtterance(analysis.report);
                  utter.rate = 1.01;
                  utter.pitch = 1.02;
                  utter.lang = 'en-US';
                  window.speechSynthesis.speak(utter);
                } else {
                  alert('Text-to-speech not supported in this browser.');
                }
              }}
              aria-label="Listen to wildfire report"
            >
              <span role="img" aria-label="speaker">🔊</span> Listen
            </button>
            {analysis.image_id && (
              <ImageWithPlaceholder
                src={`http://127.0.0.1:8000/api/image/${analysis.image_id}`}
                alt="Wildfire satellite"
                placeholder={'/wildfire_placeholder.png'}
                style={{ width: '100%', borderRadius: 12, marginTop: 18 }}
              />
            )}
          </div>
        )}
      </main>
    </div>
  );
}

export default App;
