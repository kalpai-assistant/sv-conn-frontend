import { useState, useEffect } from "react";
import { MapContainer, TileLayer, useMapEvents, useMap } from "react-leaflet";
import { MapPin, Navigation } from "lucide-react";
import "leaflet/dist/leaflet.css";

const DEFAULT_CENTER: [number, number] = [12.9716, 77.5946];

function MapEvents({ onCenterChanged }: { onCenterChanged: (lat: number, lng: number) => void }) {
  useMapEvents({
    dragend: (e) => {
      const map = e.target;
      const newCenter = map.getCenter();
      onCenterChanged(newCenter.lat, newCenter.lng);
    }
  });
  return null;
}

function RecenterMap({ center }: { center: [number, number] }) {
  const map = useMap();
  useEffect(() => {
    map.flyTo(center, map.getZoom());
  }, [center, map]);
  return null;
}

export function MapPicker({ onLocationSelected }: { onLocationSelected: (lat: number, lng: number, address: string) => void }) {
  const [center, setCenter] = useState<[number, number]>(DEFAULT_CENTER);
  const [address, setAddress] = useState("Fetching location...");
  const [isFetching, setIsFetching] = useState(false);

  const fetchAddress = async (lat: number, lng: number) => {
    setIsFetching(true);
    try {
      const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`);
      const data = await res.json();
      const displayAddress = data.display_name || "Unknown Location";
      setAddress(displayAddress);
      onLocationSelected(lat, lng, displayAddress);
    } catch (err) {
      setAddress("Could not fetch address");
      onLocationSelected(lat, lng, "Could not fetch address");
    } finally {
      setIsFetching(false);
    }
  };

  useEffect(() => {
    fetchAddress(center[0], center[1]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleCenterChanged = (lat: number, lng: number) => {
    setCenter([lat, lng]);
    fetchAddress(lat, lng);
  };

  const handleLocateMe = () => {
    if ("geolocation" in navigator) {
      setIsFetching(true);
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          handleCenterChanged(pos.coords.latitude, pos.coords.longitude);
        },
        () => {
          setIsFetching(false);
          alert("Could not get your location automatically.");
        }
      );
    }
  };

  return (
    <div className="relative h-full w-full bg-muted flex flex-col">
      <div className="flex-1 relative z-0">
        <MapContainer 
          center={center} 
          zoom={16} 
          scrollWheelZoom={true} 
          className="h-full w-full z-0"
          zoomControl={false}
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <MapEvents onCenterChanged={handleCenterChanged} />
          <RecenterMap center={center} />
        </MapContainer>
        
        {/* Fixed Center Pin */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-full z-10 pointer-events-none drop-shadow-lg">
          <MapPin className="h-10 w-10 text-primary" fill="currentColor" />
        </div>

        {/* Locate Me Button */}
        <button 
          onClick={handleLocateMe}
          className="absolute bottom-4 right-4 z-10 h-12 w-12 bg-card rounded-full shadow-lg border border-border flex items-center justify-center"
        >
          <Navigation className="h-5 w-5 text-primary" />
        </button>
      </div>

      <div className="p-4 bg-card border-t border-border z-20">
        <div className="flex items-start gap-3">
          <div className="mt-1 h-2 w-2 bg-success rounded-full animate-pulse shrink-0" />
          <div className="flex-1">
            <h3 className="font-semibold text-foreground text-sm">Select Location</h3>
            <p className="text-xs text-muted-foreground mt-1 line-clamp-2 min-h-[32px]">
              {isFetching ? "Locating..." : address}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
