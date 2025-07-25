import React, { useState, useEffect, useCallback } from 'react';
import { Spinner, Alert, Button } from 'react-bootstrap';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import html2canvas from 'html2canvas';

// Fix for default marker icons in Leaflet
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-shadow.png',
});

const WildfireDetection = ({ map }) => {
  const [fireMarkers, setFireMarkers] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [bounds, setBounds] = useState(null);

  // Update bounds when map moves
  useEffect(() => {
    if (!map) return;
    
    const updateBounds = () => {
      const bounds = map.getBounds();
      setBounds([
        bounds.getSouthWest().lat,
        bounds.getSouthWest().lng,
        bounds.getNorthEast().lat,
        bounds.getNorthEast().lng
      ]);
    };
    
    map.on('moveend', updateBounds);
    updateBounds(); // Initial bounds
    
    return () => {
      map.off('moveend', updateBounds);
    };
  }, [map]);

  // Fetch fire data when bounds change
  useEffect(() => {
    if (!bounds || !map) return;
    
    const fetchFireData = async () => {
      setIsLoading(true);
      setError('');
      
      try {
        // Calculate center point
        const centerLat = (bounds[0] + bounds[2]) / 2;
        const centerLng = (bounds[1] + bounds[3]) / 2;
        
        // Calculate approximate radius in kilometers
        const R = 6371; // Earth's radius in km
        const latDistance = (bounds[2] - bounds[0]) * (Math.PI / 180) * R;
        const lngDistance = (bounds[3] - bounds[1]) * (Math.PI / 180) * R * Math.cos(centerLat * (Math.PI / 180));
        const radiusKm = Math.ceil(Math.max(latDistance, lngDistance) / 2);
        
        // Call the backend API
        const response = await fetch('http://127.0.0.1:8000/api/analyze', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            lat: centerLat,
            lng: centerLng,
            radius_km: radiusKm
          })
        });
        
        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(errorData.detail || 'Failed to fetch fire data');
        }
        
        const result = await response.json();
        
        // Transform the response to match the expected format
        const fireData = Array.isArray(result.fire_detections) ? result.fire_detections : [];
        updateFireMarkers(fireData);
        
      } catch (err) {
        console.error('Error fetching fire data:', err);
        setError('Failed to load fire data. Please try again later.');
      } finally {
        setIsLoading(false);
      }
    };
    
    // Add a small debounce to prevent too many API calls
    const timer = setTimeout(fetchFireData, 500);
    return () => clearTimeout(timer);
  }, [bounds, map]);

  // Update fire markers on the map
  const updateFireMarkers = useCallback((fireData) => {
    if (!map) return;
    
    // Clear existing markers
    fireMarkers.forEach(marker => map.removeLayer(marker));
    
    const newMarkers = [];
    
    // Add new markers for each fire detection
    fireData.forEach(fire => {
      try {
        const lat = parseFloat(fire.latitude);
        const lng = parseFloat(fire.longitude);
        
        if (isNaN(lat) || isNaN(lng)) {
          console.warn('Invalid coordinates:', fire);
          return;
        }
        
        // Calculate confidence from available fields
        const confidence = parseFloat(fire.confidence || fire.confidence_level || fire.confidence_value || '50');
        
        const marker = L.circleMarker([lat, lng], {
          radius: 6,
          fillColor: getFireColor(confidence),
          color: '#000',
          weight: 1,
          opacity: 1,
          fillOpacity: 0.8
        }).addTo(map);
        
        // Format date for popup
        const dateStr = fire.acq_date ? 
          new Date(fire.acq_date).toLocaleString() : 
          'Date not available';
        
        // Add popup with fire details
        marker.bindPopup(`
          <div style="min-width: 200px">
            <strong>Fire Detection</strong><br>
            Confidence: ${Math.round(confidence)}%<br>
            Date: ${dateStr}<br>
            ${fire.brightness ? `Brightness: ${fire.brightness} K<br>` : ''}
            <small>Click for details</small>
          </div>
        `);
        
        newMarkers.push(marker);
      } catch (err) {
        console.error('Error creating marker:', err, fire);
      }
    });
    
    setFireMarkers(newMarkers);
  }, [map, fireMarkers]);

  // Determine marker color based on confidence
  const getFireColor = (confidence) => {
    const value = Math.min(100, Math.max(0, confidence || 0));
    if (value > 80) return '#ff0000';
    if (value > 60) return '#ff6600';
    if (value > 40) return '#ff9900';
    return '#ffcc00';
  };

  if (!map) {
    return (
      <div className="alert alert-warning">
        Map is not available. Please check the map initialization.
      </div>
    );
  }

  return (
    <div className="fire-map-container">
      {isLoading && (
        <div className="text-center my-3">
          <Spinner animation="border" role="status">
            <span className="visually-hidden">Loading fire data...</span>
          </Spinner>
          <p>Loading fire data...</p>
        </div>
      )}
      
      {error && (
        <Alert variant="danger" className="mt-3">
          {error}
        </Alert>
      )}
      
      <div className="legend mt-3">
        <h5>Fire Confidence Levels</h5>
        <div className="d-flex flex-wrap gap-3">
          {[
            { color: '#ff0000', label: 'High (80-100%)' },
            { color: '#ff6600', label: 'Medium-High (60-80%)' },
            { color: '#ff9900', label: 'Medium (40-60%)' },
            { color: '#ffcc00', label: 'Low (0-40%)' }
          ].map((item, index) => (
            <div key={index} className="d-flex align-items-center">
              <div style={{
                width: '15px',
                height: '15px',
                backgroundColor: item.color,
                marginRight: '5px',
                borderRadius: '50%',
                border: '1px solid #000'
              }}></div>
              <span>{item.label}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default WildfireDetection;
