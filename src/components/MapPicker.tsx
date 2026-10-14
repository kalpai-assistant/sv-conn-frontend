import { useState, useEffect } from "react";
import { MapContainer, TileLayer, useMapEvents, useMap } from "react-leaflet";
import { MapPin, Navigation, Settings } from "lucide-react";
import { toast } from "sonner";
import "leaflet/dist/leaflet.css";
import { Button } from "@/components/ui/button";
import { GEOCODE_FAILED, GEOCODE_UNKNOWN } from "@/lib/geocode-result";
import { isNativeLocation } from "@/lib/geolocation";
import { reverseGeocode, type PlaceDetails } from "@/lib/google-maps";
import { canOpenAppSettings, openAppSettings } from "@/lib/open-app-settings";
import { PlacesSearchBar } from "@/components/PlacesSearchBar";

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
  // SVC-356: a denial sticks around after the toast dismisses, because the
  // remedy (Settings) is one tap away and the user may need a moment to find
  // the button. The banner stays visible until the next locate attempt or
  // user-driven pin move resets it below.
  const [permissionDenied, setPermissionDenied] = useState(false);

  const fetchAddress = async (lat: number, lng: number) => {
    setIsFetching(true);
    try {
      // Google Geocoding via the shared SDK loader (SVC-284). Nominatim was
      // returning a wrong PIN for Kharadi (411001 for what is really 411014)
      // at every zoom, and no smarter request fixed it: the postcode resolved
      // against the municipal boundary rather than the locality.
      const result = await reverseGeocode(lat, lng);
      const displayAddress = result?.formattedAddress || GEOCODE_UNKNOWN;
      setAddress(displayAddress);
      onLocationSelected(lat, lng, displayAddress);
    } catch {
      // Offline, rate-limited, key missing, or Google rejected. The caller
      // recognises GEOCODE_FAILED (see geocode-result.ts) and blanks the
      // saved line rather than storing our failure as an address.
      setAddress(GEOCODE_FAILED);
      onLocationSelected(lat, lng, GEOCODE_FAILED);
    } finally {
      setIsFetching(false);
    }
  };

  /**
   * A picked suggestion from the search bar (SVC-284).
   *
   * `placeDetails` already returned the formatted address, so no reverse
   * geocode is needed — we skip the round-trip and use what Google gave the
   * search bar. Treated as a user-initiated move: `onUserMoved` fires so the
   * provider Location screen counts it as a real choice, and the pin flies to
   * the picked point.
   */
  const handlePlacePicked = (details: PlaceDetails) => {
    onUserMoved?.();
    setCenter([details.lat, details.lng]);
    setAddress(details.formattedAddress);
    onLocationSelected(details.lat, details.lng, details.formattedAddress);
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
    // Clear a stale denial banner before trying again — the user may have
    // granted permission in Settings and come back; if they refuse again the
    // error callback below will put it back.
    setPermissionDenied(false);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        handleCenterChanged(pos.coords.latitude, pos.coords.longitude);
      },
      (err) => {
        setIsFetching(false);
        // Naming the cause matters: "turn on location" is useless advice to
        // someone who denied the permission, and vice versa.
        //
        // On web that distinction is not available (SVC-318). Measured on
        // device: switching the OS toggle off makes the browser reject with
        // PERMISSION_DENIED and report `permissions.query` as "prompt", which
        // is indistinguishable from a refusal. This screen is where a blocked
        // user lands after taking the gate's "Enter address manually" escape
        // hatch, so sending them to the app-permission screen — where
        // everything already looks correct — strands them a second time. The
        // web copy names both remedies instead.
        toast.error(
          err.code === err.PERMISSION_DENIED
            ? isNativeLocation()
              ? "Location is off for this app. Turn it on in settings, or move the pin."
              : "Check that Location is on in your settings and allowed for this site, or move the pin."
            : "Couldn't get your location. Move the pin to set it instead.",
        );
        // SVC-356: a denial on native raises the Open-settings banner, which
        // deep-links to the EazyServ settings page so the user does not have
        // to dig through two or three settings screens for the Location
        // toggle. Web stays with the toast alone — browser-permission
        // settings have no reliable cross-browser deeplink.
        if (err.code === err.PERMISSION_DENIED && isNativeLocation()) {
          setPermissionDenied(true);
        }
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

        {/* SVC-284: Places search bar over the top of the map.

            Not inside a portal — the map area is already `position: relative`
            and the dropdown handles its own z-index. Kept above the pin so
            the suggestion list can drop over the map surface without the pin
            poking through it. */}
        <div className="absolute top-3 left-3 right-3 z-20">
          <PlacesSearchBar onPick={handlePlacePicked} />
        </div>

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

      {/* SVC-356: Denied-permission banner with a one-tap deeplink to the OS
          settings page for EazyServ. Native only — on web the browser-settings
          deeplink is not reliable cross-browser and we would strand the user on
          a tap that goes nowhere. See `lib/open-app-settings.ts`.

          Rendered inline rather than inside the toast so the Settings control
          is a real `<Button>` — keyboard-focusable, labelled, styled with the
          rest of the app — not a secondary action baked into a transient
          notification that may already have dismissed by the time the user
          decides to act on it. */}
      {permissionDenied && canOpenAppSettings() && (
        <div
          role="status"
          className="z-20 flex items-start gap-3 border-t border-border bg-destructive/10 p-4"
        >
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-foreground">Location is off for this app</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Turn it on in Settings, or move the pin to set it instead.
            </p>
          </div>
          <Button size="sm" variant="outline" onClick={() => void openAppSettings()}>
            <Settings className="h-4 w-4" />
            Open settings
          </Button>
        </div>
      )}

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
