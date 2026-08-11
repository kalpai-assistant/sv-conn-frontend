/**
 * Read-only tracking map — customer pin, with a "provider on the way"
 * label overlay when the booking is EN_ROUTE.
 *
 * Uses react-leaflet + OSM tiles (the same stack as MapPicker) so we
 * don't need a Google Maps API key for the visual upgrade. Real live
 * provider-position streaming needs the WebSocket at
 * ``backend/app/routers/tracking.py``; that's a phase-2 wire-up, not
 * blocking this map.
 *
 * Falls back to a neutral card when the booking's address has no
 * lat/lng (older rows, ungeocoded addresses) — a broken/empty map
 * tile grid would be worse than a plain "provider is on the way"
 * card.
 */
import { useEffect } from "react";
import { MapContainer, Marker, TileLayer, useMap } from "react-leaflet";
import { divIcon } from "leaflet";
import { MapPin, Navigation } from "lucide-react";
import "leaflet/dist/leaflet.css";

interface TrackingMapProps {
  lat: number | null | undefined;
  lng: number | null | undefined;
  /** True when the provider is en route — surfaces the ETA chip. */
  enRoute?: boolean;
  etaMinutes?: number;
  className?: string;
}

// Leaflet's default marker icon URLs break under Vite bundling (they
// resolve at module load and can't find the images at runtime). Use
// a tiny inline SVG divIcon so the marker survives any bundler config
// and stays on-brand with the app palette.
const CUSTOMER_ICON = divIcon({
  className: "sc-marker-customer",
  html: `<div style="
    width: 36px; height: 36px; border-radius: 999px;
    background: white;
    display: flex; align-items: center; justify-content: center;
    box-shadow: 0 4px 12px rgba(25,87,210,0.35);
    border: 3px solid #1957D2;
  "><div style="
    width: 12px; height: 12px; border-radius: 999px;
    background: #1957D2;
  "></div></div>`,
  iconSize: [36, 36],
  iconAnchor: [18, 18],
});

/** Force the map to recenter when the address changes. */
function RecenterMap({ lat, lng }: { lat: number; lng: number }) {
  const map = useMap();
  useEffect(() => {
    map.setView([lat, lng], map.getZoom() ?? 15);
  }, [lat, lng, map]);
  return null;
}

export function TrackingMap({
  lat,
  lng,
  enRoute = false,
  etaMinutes,
  className = "",
}: TrackingMapProps) {
  // No coordinates → show a neutral card. Better than a
  // world-map-centered-on-null-island tile grid.
  if (lat == null || lng == null) {
    return (
      <div
        className={`flex flex-col items-center justify-center rounded-xl border border-border bg-accent p-6 text-center ${className}`}
      >
        <MapPin className="mb-2 h-8 w-8 text-primary" />
        <p className="text-sm font-medium text-foreground">
          {enRoute ? "Provider is on the way" : "Location saved"}
        </p>
        {enRoute && etaMinutes != null && (
          <p className="mt-1 text-xs text-muted-foreground">ETA ~{etaMinutes} min</p>
        )}
      </div>
    );
  }

  return (
    <div
      className={`relative overflow-hidden rounded-xl border border-border ${className}`}
      // Fixed aspect so the map doesn't collapse in a flex container
      // that hasn't decided on a height yet.
      style={{ height: 220 }}
    >
      <MapContainer
        // 15 = neighbourhood-ish zoom, tight enough to see the pin in
        // context of nearby streets, loose enough that most of India's
        // addresses render sensibly on the first tile pass.
        center={[lat, lng]}
        zoom={15}
        zoomControl={false}
        // Read-only; disable interactions so users don't accidentally
        // drag the map and lose the pin context.
        dragging={false}
        touchZoom={false}
        doubleClickZoom={false}
        scrollWheelZoom={false}
        boxZoom={false}
        keyboard={false}
        style={{ height: "100%", width: "100%" }}
      >
        <TileLayer
          attribution='&copy; <a href="https://openstreetmap.org">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <Marker position={[lat, lng]} icon={CUSTOMER_ICON} />
        <RecenterMap lat={lat} lng={lng} />
      </MapContainer>

      {/* ETA chip overlays the map when the provider is en route.
          Placed inside the map container so it hugs the corner even
          on tall screens where the map is offset from viewport top. */}
      {enRoute && (
        <div className="pointer-events-none absolute left-3 top-3 flex items-center gap-1.5 rounded-full bg-card px-3 py-1.5 shadow-md">
          <Navigation className="h-3.5 w-3.5 text-primary" />
          <span className="text-xs font-semibold text-foreground">
            Provider on the way{etaMinutes != null && ` · ETA ~${etaMinutes} min`}
          </span>
        </div>
      )}
    </div>
  );
}
