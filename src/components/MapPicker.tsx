import { useState, useEffect } from "react";
import { MapContainer, TileLayer, useMapEvents, useMap } from "react-leaflet";
import { MapPin, Navigation } from "lucide-react";
import { toast } from "sonner";
import "leaflet/dist/leaflet.css";
import { GEOCODE_FAILED, GEOCODE_UNKNOWN } from "@/lib/geocode-result";

const DEFAULT_CENTER: [number, number] = [12.9716, 77.5946];

function MapEvents({ onCenterChanged }: { onCenterChanged: (lat: number, lng: number) => void }) {
  useMapEvents({
    dragend: (e) => {
      const map = e.target;
      const newCenter = map.getCenter();
      onCenterChanged(newCenter.lat, newCenter.lng);
    },
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

export function MapPicker({
  onLocationSelected,
  initialCenter,
  onUserMoved,
}: {
  onLocationSelected: (lat: number, lng: number, address: string) => void;
  /**
   * Fired only when the *user* moves the pin, never for the mount-time
   * reverse-geocode of whatever centre the map opened on. Callers that must
   * tell "they chose this" from "this is just where the map started" need the
   * difference — see the provider Location screen, where confusing the two
   * would save a default centre as a real service area.
   */
  onUserMoved?: () => void;
  /**
   * Where to open the map (SVC-279). Omit and it falls back to DEFAULT_CENTER.
   *
   * Exists because a provider editing their service area must see the area they
   * already set — opening on a constant would show them somewhere they have
   * never been and invite them to overwrite it by accident.
   *
   * SVC-281 is what makes the *consumer* pickers pass this too: today they take
   * the fallback, which is Bangalore, so a user anywhere else opens the map ~800km
   * from where they are.
   */
  initialCenter?: [number, number] | null;
}) {
  const [center, setCenter] = useState<[number, number]>(initialCenter ?? DEFAULT_CENTER);
  const [address, setAddress] = useState("Fetching location...");
  const [isFetching, setIsFetching] = useState(false);

  const fetchAddress = async (lat: number, lng: number) => {
    setIsFetching(true);
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`,
      );
      const data = await res.json();
      const displayAddress = data.display_name || GEOCODE_UNKNOWN;
      setAddress(displayAddress);
      onLocationSelected(lat, lng, displayAddress);
    } catch (err) {
      setAddress(GEOCODE_FAILED);
      onLocationSelected(lat, lng, GEOCODE_FAILED);
    } finally {
      setIsFetching(false);
    }
  };

  useEffect(() => {
    fetchAddress(center[0], center[1]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleCenterChanged = (lat: number, lng: number) => {
    onUserMoved?.();
    setCenter([lat, lng]);
    fetchAddress(lat, lng);
  };

  /**
   * Locate-me, with the three ways this used to strand the user fixed.
   *
   * It called `alert()`, which on Android is a **native modal that blocks the
   * entire WebView** — nothing on the screen responds until someone taps OK.
   * Found on device: the map sat behind an unanswered dialog with the pin
   * mid-move. A toast says the same thing without seizing the app.
   *
   * It also passed no `timeout`, and Android does not fail fast when the OS
   * location toggle is off — it simply never answers (measured: still silent at
   * 20s; see useLocationAvailability). So "Locating…" could spin indefinitely
   * and neither callback would ever run.
   *
   * And a device without geolocation fell through the `if` entirely, leaving
   * the button dead with no explanation.
   */
  const handleLocateMe = () => {
    if (!("geolocation" in navigator)) {
      toast.error("Location isn't available on this device. Move the pin instead.");
      return;
    }

    setIsFetching(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        handleCenterChanged(pos.coords.latitude, pos.coords.longitude);
      },
      (err) => {
        setIsFetching(false);
        // Naming the cause matters: "turn on location" is useless advice to
        // someone who denied the permission, and vice versa.
        toast.error(
          err.code === err.PERMISSION_DENIED
            ? "Location is off for this app. Turn it on in settings, or move the pin."
            : "Couldn't get your location. Move the pin to set it instead.",
        );
      },
      // Bounded so a disabled toggle surfaces as a message rather than a
      // spinner that never resolves.
      { enableHighAccuracy: true, timeout: 15_000, maximumAge: 60_000 },
    );
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

        {/* Locate Me Button. Icon-only, so it needs a name of its own —
            without one a screen reader announces "button" and nothing else. */}
        <button
          type="button"
          aria-label="Use my current location"
          disabled={isFetching}
          onClick={handleLocateMe}
          className="absolute bottom-4 right-4 z-10 h-12 w-12 bg-card rounded-full shadow-lg border border-border flex items-center justify-center disabled:opacity-60"
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
