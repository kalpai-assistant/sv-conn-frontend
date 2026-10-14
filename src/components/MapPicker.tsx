import { useState, useEffect, useRef } from "react";
import { MapContainer, TileLayer, useMapEvents, useMap } from "react-leaflet";
import { MapPin, Navigation, Settings, WifiOff } from "lucide-react";
import { toast } from "sonner";
import "leaflet/dist/leaflet.css";
import { Button } from "@/components/ui/button";
import { GEOCODE_FAILED, GEOCODE_UNKNOWN } from "@/lib/geocode-result";
import { isNativeLocation, requestLocation } from "@/lib/geolocation";
import { reverseGeocode, type PlaceDetails } from "@/lib/google-maps";
import { MAP_PICKER_LOCATE_TIMEOUT_MS } from "@/lib/map-picker-timeouts";
import { canOpenAppSettings, openAppSettings } from "@/lib/open-app-settings";
import { PlacesSearchBar } from "@/components/PlacesSearchBar";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";

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
  // SVC-357: `=== false` is the only truth the browser's online boolean tells.
  // A `true` from the hook does not mean the backend is reachable (measured on
  // OEM Android WebViews — see `useOnlineStatus`), so we trust `false` and let
  // a failed `reverseGeocode` do the rest. This is only the fast-path.
  const isOnline = useOnlineStatus();

  // SVC-357: `tileerror` fires per missing tile, which on an OSM CDN block is
  // every tile at every zoom level. One toast per sheet-open is the ceiling —
  // reset by component unmount, which is how the picker is torn down between
  // sheet-open sessions. Guarded by a ref rather than state so the handler
  // closure never re-reads a stale value.
  const tileErrorToastedRef = useRef(false);

  const fetchAddress = async (lat: number, lng: number) => {
    // SVC-357: offline — skip the round-trip and tell the user we will resolve
    // the address when they reconnect. The alternative is a GEOCODE_FAILED
    // toast + a blanked address line, both of which read as a bug on the pin
    // the user just set. The sheet surfaces the status instead; see the
    // offline affordance in the footer.
    if (!isOnline) {
      setAddress("");
      onLocationSelected(lat, lng, "");
      return;
    }
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

  // SVC-357: when the user comes back online with no resolved address, honour
  // the "we'll resolve the address when you reconnect" promise. Only fires on
  // the offline-to-online transition, and only when there is nothing we have
  // already resolved — a user who dragged the pin while offline and then
  // reconnected should see the address they would have seen if they had never
  // dropped offline, not a stale blank. Not a dependency of `fetchAddress`:
  // the handler reads `isOnline` at call time and keeps the short-circuit.
  const prevOnlineRef = useRef(isOnline);
  useEffect(() => {
    const wasOffline = !prevOnlineRef.current;
    prevOnlineRef.current = isOnline;
    if (isOnline && wasOffline && !address) {
      void fetchAddress(center[0], center[1]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOnline]);

  const handleCenterChanged = (lat: number, lng: number) => {
    onUserMoved?.();
    setCenter([lat, lng]);
    fetchAddress(lat, lng);
  };

  /**
   * Locate-me, routed through the shared `requestLocation` (SVC-357).
   *
   * Previously called `navigator.geolocation.getCurrentPosition` directly,
   * which on native WebView bypasses the Capacitor plugin and loses the
   * distinct Android error codes (`LOCATION_DISABLED` vs
   * `LOCATION_PERMISSIONS_DENIED`) that let us name a real remedy — see
   * `lib/geolocation.ts`. Using `requestLocation` gets the plugin on native
   * and the same web `GeolocationPositionError` fallback on web.
   *
   * The three strandings it used to produce are still fixed:
   *
   *   - `alert()` is never called (toast only). On Android alert() blocks the
   *     entire WebView until dismissed — the exact failure the picker test
   *     file was written against.
   *   - The request is bounded by `MAP_PICKER_LOCATE_TIMEOUT_MS`. Android does
   *     not fail fast when the OS toggle is off; without a bound neither path
   *     ever resolves.
   *   - A device with no geolocation surfaces a message rather than a dead
   *     button — `requestLocation` returns `unavailable` here.
   *
   * The SVC-179 denied-vs-device-off split survives the swap: `requestLocation`
   * already returns `location-disabled` separately from `permission-denied`
   * on native, and the web `GeolocationPositionError.code === 1` still maps to
   * `permission-denied`. On web both causes still collapse to one code — the
   * copy names both remedies in that branch, as it did before.
   */
  const handleLocateMe = async () => {
    setIsFetching(true);
    // Clear a stale denial banner before trying again — the user may have
    // granted permission in Settings and come back; if they refuse again the
    // branch below will put it back.
    setPermissionDenied(false);

    const result = await requestLocation(MAP_PICKER_LOCATE_TIMEOUT_MS);

    if (result.ok && result.coords) {
      handleCenterChanged(result.coords.lat, result.coords.lng);
      return;
    }

    setIsFetching(false);

    // Naming the cause matters: "turn on location" is useless advice to
    // someone who denied the permission, and vice versa. The split from
    // SVC-179 is preserved — `requestLocation` returns `location-disabled`
    // and `permission-denied` as separate values on native, so the copy
    // below can name the exact remedy.
    //
    // On web both causes still collapse to one code (SVC-318). Measured on
    // device: switching the OS toggle off makes the browser reject with
    // PERMISSION_DENIED and report `permissions.query` as "prompt", which is
    // indistinguishable from a refusal. This screen is where a blocked user
    // lands after taking the gate's "Enter address manually" escape hatch,
    // so sending them to the app-permission screen — where everything
    // already looks correct — strands them a second time. The web copy names
    // both remedies instead.
    const denied = result.failure === "permission-denied";
    toast.error(
      denied
        ? isNativeLocation()
          ? "Location is off for this app. Turn it on in settings, or move the pin."
          : "Check that Location is on in your settings and allowed for this site, or move the pin."
        : result.failure === "location-disabled"
          ? "Your phone's location is off. Turn it on in settings, or move the pin."
          : "Couldn't get your location. Move the pin to set it instead.",
    );

    // SVC-356: a denial on native raises the Open-settings banner, which
    // deep-links to the EazyServ settings page so the user does not have to
    // dig through two or three settings screens for the Location toggle.
    // Web stays with the toast alone — browser-permission settings have no
    // reliable cross-browser deeplink. `location-disabled` is deliberately
    // not here: the right screen for that is the device Location toggle, not
    // the EazyServ settings page.
    if (denied && isNativeLocation()) {
      setPermissionDenied(true);
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
            eventHandlers={{
              // SVC-357: an OSM CDN block (seen on some corporate networks)
              // renders a silent grey grid at every zoom level, with no
              // indication the tiles are failing to load. `tileerror` fires
              // per missing tile — one toast per sheet-open is the ceiling
              // or the user drowns under duplicates. The ref resets on
              // component unmount, which is how the picker is torn down
              // between sheet-open sessions.
              tileerror: () => {
                if (tileErrorToastedRef.current) return;
                tileErrorToastedRef.current = true;
                toast.error(
                  "Map tiles aren't loading. Check your connection or your network's content filter.",
                );
              },
            }}
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
          onClick={() => void handleLocateMe()}
          className="absolute bottom-4 right-4 z-10 h-12 w-12 bg-card rounded-full shadow-lg border border-border flex items-center justify-center disabled:opacity-60"
        >
          <Navigation className="h-5 w-5 text-primary" />
        </button>
      </div>

      {/* SVC-357: offline — tell the user we skipped the reverse-geocode, but
          promise to resolve it when they reconnect. Rendered inside the sheet
          rather than as a floating toast so it survives the whole offline
          session instead of auto-dismissing. Separate from the SVC-356 denied
          banner because the two can coexist (denied the permission, now also
          offline) and lumping them would conflate two unrelated remedies. */}
      {!isOnline && (
        <div
          role="status"
          className="z-20 flex items-start gap-3 border-t border-border bg-muted p-4"
        >
          <WifiOff className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-foreground">You're offline</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Drop the pin — we'll resolve the address when you reconnect.
            </p>
          </div>
        </div>
      )}

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
