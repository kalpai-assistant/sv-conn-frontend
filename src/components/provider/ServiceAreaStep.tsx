import { useState } from "react";
import { Loader2, MapPin } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { useUpdateServiceArea } from "@/hooks/useApi";

/**
 * SVC-257: "Where do you work?" onboarding step. Captures the provider's
 * service-area centre (via device geolocation) + radius, then PATCHes
 * /providers/me. Without this, the PostGIS dispatch renders the provider
 * invisible to every incoming booking — the go-online toggle refuses with
 * `SERVICE_AREA_MISSING` and this step re-appears.
 *
 * Deliberately minimal for the first ship: browser + Capacitor share
 * `navigator.geolocation`, so a single call works both surfaces. Full map
 * picker + reverse geocode are follow-ups tracked in the ticket body.
 */
export function ServiceAreaStep({
  initialLat,
  initialLng,
  initialRadiusKm,
  onBack,
  onDone,
}: {
  initialLat?: number | null;
  initialLng?: number | null;
  initialRadiusKm?: number;
  onBack: () => void;
  onDone: () => void;
}) {
  const updateServiceArea = useUpdateServiceArea();

  const [lat, setLat] = useState<number | null>(initialLat ?? null);
  const [lng, setLng] = useState<number | null>(initialLng ?? null);
  const [radiusKm, setRadiusKm] = useState<number>(initialRadiusKm ?? 10);
  const [error, setError] = useState<string | null>(null);
  const [locating, setLocating] = useState(false);

  const detect = () => {
    setError(null);
    if (!("geolocation" in navigator)) {
      setError("Location isn't available on this device.");
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLat(Number(pos.coords.latitude.toFixed(6)));
        setLng(Number(pos.coords.longitude.toFixed(6)));
        setLocating(false);
      },
      (err) => {
        setLocating(false);
        // ProviderPositionError codes: 1 = permission denied, 2 = unavailable,
        // 3 = timeout. Human message differs so a provider knows what to fix
        // (grant permission vs. move somewhere with GPS reception).
        setError(
          err.code === 1
            ? "Location permission denied. Enable it in your browser/app settings and try again."
            : "Couldn't fetch your location. Try again in a moment.",
        );
      },
      { enableHighAccuracy: true, timeout: 15_000, maximumAge: 0 },
    );
  };

  const save = async () => {
    setError(null);
    if (lat === null || lng === null) {
      setError("Set your location before saving.");
      return;
    }
    try {
      await updateServiceArea.mutateAsync({
        service_area_lat: lat,
        service_area_lng: lng,
        service_area_radius_km: radiusKm,
      });
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save your service area. Try again.");
    }
  };

  const saving = updateServiceArea.isPending;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-lg font-semibold text-foreground">Where do you work?</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          We match you with bookings close to this spot. You can change it any time from your
          profile.
        </p>
      </div>

      {error && (
        <p className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">{error}</p>
      )}

      <div className="space-y-3">
        <Label>Your service centre</Label>
        <Button
          type="button"
          variant="secondary"
          onClick={detect}
          disabled={locating}
          className="w-full justify-start gap-2"
        >
          {locating ? <Loader2 className="h-4 w-4 animate-spin" /> : <MapPin className="h-4 w-4" />}
          {locating
            ? "Locating…"
            : lat !== null
              ? "Update to current location"
              : "Use my current location"}
        </Button>
        {lat !== null && lng !== null && (
          <p className="text-xs text-muted-foreground">
            Saved centre:{" "}
            <span className="font-mono">
              {lat.toFixed(4)}, {lng.toFixed(4)}
            </span>
          </p>
        )}
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label htmlFor="radius">How far will you travel?</Label>
          <span className="text-sm font-medium text-foreground">{radiusKm} km</span>
        </div>
        <input
          id="radius"
          type="range"
          min={1}
          max={50}
          step={1}
          value={radiusKm}
          onChange={(e) => setRadiusKm(Number(e.target.value))}
          className="w-full accent-primary"
        />
        <p className="text-xs text-muted-foreground">
          Bookings outside this radius won't reach you. Start small, expand as you learn your route.
        </p>
      </div>

      <div className="flex gap-3">
        <Button variant="outline" className="flex-1" onClick={onBack}>
          Back
        </Button>
        <Button className="flex-1" disabled={saving || lat === null || lng === null} onClick={save}>
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Continue"}
        </Button>
      </div>
    </div>
  );
}
