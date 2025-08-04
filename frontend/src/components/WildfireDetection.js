// Enhanced WildfireDetection.js
import React, { useState, useEffect, useCallback } from 'react';
import { Spinner, Alert, Button, Modal } from 'react-bootstrap';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { apiRequest } from '../utils/api';
import 'leaflet.heat';

// North America bounding box (minLat, minLng, maxLat, maxLng)
const NORTH_AMERICA_BOUNDS = [5.499550, -167.276413, 83.162102, -52.233040];

// Check if coordinates are within North America
const isInNorthAmerica = (lat, lng) => {
  return (
    lat >= NORTH_AMERICA_BOUNDS[0] && 
    lng >= NORTH_AMERICA_BOUNDS[1] && 
    lat <= NORTH_AMERICA_BOUNDS[2] && 
    lng <= NORTH_AMERICA_BOUNDS[3]
  );
};

const WildfireDetection = ({ map }) => {
  const [fireMarkers, setFireMarkers] = useState([]);
  const [heatMapLayer, setHeatMapLayer] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [bounds, setBounds] = useState(null);
  const [selectedFire, setSelectedFire] = useState(null);
  const [showDetails, setShowDetails] = useState(false);

  // Fire icon based on confidence
  const getFireIcon = (confidence) => {
    const color = confidence > 80 ? '#ff0000' : 
                 confidence > 60 ? '#ff6600' : 
                 confidence > 40 ? '#ff9900' : '#ffcc00';
    
    return L.divIcon({
      html: `<div style="background: ${color}" class="fire-marker"></div>`,
      iconSize: [20, 20],
      className: 'fire-icon'
    });
  };

  // Fetch fire data
  const fetchFireData = useCallback(async () => {
    if (!bounds || !map) return;
    
    setIsLoading(true);
    setError('');
    try {
      const center = map.getCenter();
      const zoom = map.getZoom();
      const radius = Math.min(500, 1000 / Math.pow(1.5, zoom - 5));
      
      // Prepare request data
      const requestData = {
        lat: center.lat,
        lng: center.lng,
        radius_km: radius
      };
      
      console.log('Sending request with data:', requestData);
      
      let result;
      try {
        // Make the request with JSON data using the apiRequest utility
        result = await apiRequest('analyze-fire-map', {
          method: 'POST',
          body: JSON.stringify(requestData)
        });
        
        console.log('Received fire data:', result);
        
        // Ensure we have fire detections in the response
        if (!result.fire_detections) {
          console.warn('No fire_detections in response:', result);
          setError('No fire data available for this area');
          return;
        }
      } catch (error) {
        console.error('Error fetching fire data:', error);
        setError(`Failed to fetch fire data: ${error.message}`);
        return;
      }
      
      // Process fire detections to ensure required fields exist and filter to North America
      const processedFires = result.fire_detections
        .map(fire => ({
          ...fire,
          // Ensure required fields have defaults if missing
          latitude: fire.latitude || fire.lat || 0,
          longitude: fire.longitude || fire.lng || 0,
          confidence: fire.confidence || 50,
          brightness: fire.brightness || 300,
        }))
        // Filter to only include fires within North America
        .filter(fire => {
          const inBounds = isInNorthAmerica(fire.latitude, fire.longitude);
          if (!inBounds) {
            console.log('Filtered out fire outside North America:', fire);
          }
          return inBounds;
        });
      
      console.log('Processed fire data:', processedFires);
      updateFireMarkers(processedFires);
      updateHeatMap(processedFires);
      
      // Log analysis results if available
      if (result.analysis) {
        console.log('Fire analysis:', result.analysis);
      }
      
    } catch (err) {
      console.error('Error in fetchFireData:', err);
      setError('Failed to load fire data: ' + (err.message || 'Unknown error'));
    } finally {
      setIsLoading(false);
    }
  }, [bounds, map, updateFireMarkers, updateHeatMap]);

  // Update markers
  const updateFireMarkers = useCallback((fires) => {
    if (!map) return;
    
    // Remove existing markers
    fireMarkers.forEach(marker => {
      if (map.hasLayer(marker)) {
        map.removeLayer(marker);
      }
    });
    
    if (!fires || !Array.isArray(fires) || fires.length === 0) {
      console.log('No fire data to display');
      setFireMarkers([]);
      return;
    }
    
    console.log(`Creating ${fires.length} fire markers`);
    
    const newMarkers = fires.map((fire, index) => {
      // Ensure we have valid coordinates
      const lat = fire.latitude || fire.lat;
      const lng = fire.longitude || fire.lng;
      
      if (typeof lat !== 'number' || typeof lng !== 'number' || isNaN(lat) || isNaN(lng)) {
        console.warn('Invalid coordinates for fire:', fire);
        return null;
      }
      
      const confidence = fire.confidence || 50;
      const brightness = fire.brightness || 300;
      
      try {
        const marker = L.marker([lat, lng], {
          icon: getFireIcon(confidence)
        }).bindPopup(`
          <div class="fire-popup">
            <h6>🔥 Wildfire Detection</h6>
            <p><strong>Confidence:</strong> ${confidence}%</p>
            <p><strong>Temperature:</strong> ${brightness}°K</p>
            ${fire.acq_date ? `<p><strong>Detected:</strong> ${new Date(fire.acq_date).toLocaleString()}</p>` : ''}
            ${fire.frp ? `<p><strong>Fire Radiative Power:</strong> ${fire.frp} MW</p>` : ''}
            <button class="btn btn-sm btn-primary w-100 mt-1" 
                    onclick="window.dispatchEvent(new CustomEvent('showFireDetails', { detail: ${JSON.stringify(fire)}}))">
              View Details
            </button>
          </div>
        `).addTo(map);
        
        marker.on('click', () => {
          setSelectedFire(fire);
          setShowDetails(true);
        });
        
        return marker;
      } catch (err) {
        console.error('Error creating marker:', err, fire);
        return null;
      }
    }).filter(marker => marker !== null);
    
    setFireMarkers(newMarkers);
    console.log(`Created ${newMarkers.length} fire markers`);
  }, [map, fireMarkers]);

  // Update heatmap
  const updateHeatMap = useCallback((fires) => {
    if (heatMapLayer) map.removeLayer(heatMapLayer);
    if (!fires.length) return;
    
    const heatData = fires.map(f => [f.latitude, f.longitude, (f.confidence || 50) / 100]);
    const heat = L.heatLayer(heatData, { radius: 25, blur: 15 }).addTo(map);
    setHeatMapLayer(heat);
  }, [map, heatMapLayer]);

  // Effects
  useEffect(() => {
    if (!map) return;
    
    const updateBounds = () => {
      const b = map.getBounds();
      setBounds([b.getSouthWest().lat, b.getSouthWest().lng, 
                 b.getNorthEast().lat, b.getNorthEast().lng]);
    };
    
    map.on('moveend', updateBounds);
    updateBounds();
    
    return () => map.off('moveend', updateBounds);
  }, [map]);

  useEffect(() => {
    const timer = setTimeout(fetchFireData, 500);
    return () => clearTimeout(timer);
  }, [bounds, fetchFireData]);

  return (
    <>
      {isLoading && (
        <div className="loading-overlay">
          <Spinner animation="border" variant="light" />
        </div>
      )}
      
      {error && <Alert variant="danger">{error}</Alert>}
      
      <Modal show={showDetails} onHide={() => setShowDetails(false)}>
        <Modal.Header closeButton>
          <Modal.Title>Fire Details</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          {selectedFire && (
            <div>
              <p><strong>Confidence:</strong> {selectedFire.confidence}%</p>
              {selectedFire.brightness && (
                <p><strong>Temperature:</strong> {selectedFire.brightness}°K</p>
              )}
              {selectedFire.acq_date && (
                <p><strong>Detected:</strong> {new Date(selectedFire.acq_date).toLocaleString()}</p>
              )}
            </div>
          )}
        </Modal.Body>
      </Modal>
    </>
  );
};

export default WildfireDetection;