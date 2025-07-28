from pydantic import BaseModel
from typing import Optional, List, Dict, Any, Union, Tuple

class Coordinates(BaseModel):
    lat: float
    lng: float

class BoundingBox(BaseModel):
    """Represents a geographic bounding box with southwest and northeast corners."""
    sw: Coordinates  # Southwest corner (min_lat, min_lng)
    ne: Coordinates  # Northeast corner (max_lat, max_lng)
    
    @classmethod
    def from_extent(cls, min_lat: float, min_lng: float, max_lat: float, max_lng: float) -> 'BoundingBox':
        """Create a BoundingBox from min/max latitude and longitude values."""
        return cls(
            sw=Coordinates(lat=min_lat, lng=min_lng),
            ne=Coordinates(lat=max_lat, lng=max_lng)
        )
    
    def to_extent(self) -> Tuple[float, float, float, float]:
        """Convert the bounding box to a tuple of (min_lng, min_lat, max_lng, max_lat)."""
        return (
            self.sw.lng,  # min_lng
            self.sw.lat,  # min_lat
            self.ne.lng,  # max_lng
            self.ne.lat   # max_lat
        )
