import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { ChevronLeft, Loader2, MapPin, Navigation } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { MapPicker } from "@/components/MapPicker";
import { isNativeLocation } from "@/lib/geolocation";
import { useProviderProfile, useUpdateServiceArea } from "@/hooks/useApi";

export const Route = createFileRoute("/provider/location")({
  component: ProviderLocationPage,
});

/**
 * Provider → Location (SVC-279).
 *
 * ## Why this screen has to exist
 *
 * The service area was captured once, in step 3 of onboarding, and never again.
 * `__root.tsx` only forces a provider back through onboarding while their name
 * is missing or KYC is still pending — so once KYC is submitted the only screen
 * that can set a service area becomes unreachable. A provider who moves, or who
 * onboarded before SVC-257 shipped, had no route to fix it.
 *
 * `ServiceAreaStep`'s own copy already promised this screen: *"You can change it
 * any time from your profile."* It has never existed until now.
 *
 * ## Why getting it wrong is expensive
 *
 * The dispatch geo-fence needs `service_area_center`, and a NULL centre matches
 * no booking at all — however online the provider is, however many services they
 * subscribe to. The failure is completely silent from their side: no error, no
 * empty state, just no work. That is why this screen says plainly when no area
 * is set rather than rendering an innocuous empty map.
 *
 * ## The map is the point, not decoration
 *
 * A pair of coordinates (`18.5204, 73.8567`) is accurate and tells a provider
 * nothing. AC3 asks for the location *on a map*, and seeing the pin sit over a
 * recognisable street is the only way someone can confirm the area is right
 * before saving.
 */
function ProviderLocationPage() {
  const { data: profile, isLoading, isError } = useProviderProfile();
  const updateServiceArea = useUpdateServiceArea();
  const navigate = useNavigate();

  // Null until the provider picks somewhere in this session; the saved centre
  // is read from `profile` so the map can open on it.
  const [picked, setPicked] = useState<{ lat: number; lng: number; address: string } | null>(null);
  const [radiusKm, setRadiusKm] = useState<number | null>(null);
  const [locating, setLocating] = useState(false);
  // True once the provider has actually dragged the pin. Distinguishes a real
  // choice from MapPicker's mount-time report of its own default centre.
  const userMoved = useRef(false);

  const savedLat = profile?.service_area_lat ?? null;
  const savedLng = profile?.service_area_lng ?? null;
  const hasSavedArea = savedLat !== null && savedLng !== null;

  // The value being edited, falling back to what is stored. `radiusKm` stays
  // null until touched so a provider who only moves the pin keeps their radius.
  const effectiveRadius = radiusKm ?? profile?.service_area_radius_km ?? 10;
  const lat = picked?.lat ?? savedLat;
  const lng = picked?.lng ?? savedLng;

  // MapPicker reverse-geocodes on mount and reports the result, so `picked` is
  // set even when the provider has touched nothing. Comparing against the saved
  // centre is what actually answers "did they move it" — labelling an untouched
  // centre "New centre" tells them they changed something they didn't.
  // Rounded to ~1m: the map hands back more precision than it was given, so an
  // exact comparison is never equal.
  const hasMoved =
    picked !== null &&
    (savedLat === null ||
      savedLng === null ||
      Math.abs(picked.lat - savedLat) > 1e-5 ||
      Math.abs(picked.lng - savedLng) > 1e-5);

  const useCurrentLocation = () => {
    if (!("geolocation" in navigator)) {
      toast.error("Location isn't available on this device.");
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false);
        userMoved.current = true;
        setPicked({
          lat: Number(pos.coords.latitude.toFixed(6)),
          lng: Number(pos.coords.longitude.toFixed(6)),
          address: "Your current location",
        });
      },
      (err) => {
        setLocating(false);
        // Code 1 is a denial, which on Android is one-shot — the OS will not
        // ask again, so say where to fix it rather than inviting a retry that
        // resolves instantly with the same answer.
        //
        // The browser collapses two causes into that one code (SVC-318): a
        // switched-off OS toggle rejects with PERMISSION_DENIED exactly as a
        // refusal does, so on web the copy names both rather than picking the
        // wrong settings screen.
        toast.error(
          err.code === 1
            ? isNativeLocation()
              ? "Location permission is off. Turn it on in your device settings."
              : "Check that Location is on in your settings and allowed for this site."
            : "Couldn't get your location. Drag the pin instead.",
        );
      },
      { enableHighAccuracy: true, timeout: 15_000, maximumAge: 0 },
    );
  };

  const save = async () => {
    if (lat === null || lng === null) {
      toast.error("Pick your location first.");
      return;
    }
    try {
      await updateServiceArea.mutateAsync({
        service_area_lat: lat,
        service_area_lng: lng,
        service_area_radius_km: effectiveRadius,
      });
      toast.success("Service area saved");
      navigate({ to: "/provider/profile" });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't save. Please try again.");
    }
  };

  return (
    <div className="min-h-screen pb-24">
      <div className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-border bg-card px-4">
        <Link
          to="/provider/profile"
          className="flex h-9 w-9 items-center justify-center rounded-full bg-secondary"
          aria-label="Back"
        >
          <ChevronLeft className="h-4 w-4 text-foreground" />
        </Link>
        <h1 className="text-base font-semibold text-foreground">Service location</h1>
      </div>

      {isLoading ? (
        <div className="space-y-3 p-4">
          <Skeleton className="h-64 w-full rounded-xl" />
          <Skeleton className="h-10 w-full" />
        </div>
      ) : isError ? (
        <p className="p-4 text-sm text-muted-foreground">
          Couldn&apos;t load your profile. Pull down to retry.
        </p>
      ) : (
        <div className="space-y-5 p-4">
          {/* Said out loud because the consequence is invisible: no centre means
              the geo-fence excludes this provider from every broadcast, and
              nothing else in the app would tell them. */}
          {!hasSavedArea && !hasMoved && (
            <p className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
              You haven&apos;t set a service area yet, so job requests can&apos;t reach you. Pick
              where you work to start receiving them.
            </p>
          )}

          <div className="overflow-hidden rounded-xl border border-border">
            <div className="h-64">
              <MapPicker
                initialCenter={lat !== null && lng !== null ? [lat, lng] : null}
                onLocationSelected={(pickedLat, pickedLng, address) => {
                  // MapPicker reverse-geocodes on mount and reports whatever it
                  // opened on — including its own Bangalore fallback when this
                  // provider has no saved centre. Accepting that would enable
                  // Save and let one tap move their service area 800km, so the
                  // first report is only taken when it tells us something we
                  // did not already know.
                  if (!hasSavedArea && !userMoved.current) return;
                  setPicked({ lat: pickedLat, lng: pickedLng, address });
                }}
                onUserMoved={() => {
                  userMoved.current = true;
                }}
              />
            </div>
          </div>

          <Button
            type="button"
            variant="secondary"
            onClick={useCurrentLocation}
            disabled={locating}
            className="w-full justify-start gap-2"
          >
            {locating ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Navigation className="h-4 w-4" />
            )}
            {locating ? "Locating…" : "Use my current location"}
          </Button>

          {lat !== null && lng !== null && (
            <div className="flex items-start gap-2 rounded-lg bg-secondary/50 p-3">
              <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
              <div className="min-w-0">
                <p className="text-sm font-medium text-foreground">
                  {hasMoved ? "New centre" : "Your service centre"}
                </p>
                <p className="text-xs text-muted-foreground">
                  {picked?.address ?? `${lat.toFixed(4)}, ${lng.toFixed(4)}`}
                </p>
              </div>
            </div>
          )}

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="radius">How far will you travel?</Label>
              <span className="text-sm font-medium text-foreground">{effectiveRadius} km</span>
            </div>
            <input
              id="radius"
              type="range"
              min={1}
              max={50}
              step={1}
              value={effectiveRadius}
              onChange={(e) => setRadiusKm(Number(e.target.value))}
              className="w-full accent-primary"
            />
            <p className="text-xs text-muted-foreground">
              Bookings outside this radius won&apos;t reach you.
            </p>
          </div>

          {/* Inline, not a fixed footer. `__root.tsx` renders BottomNav over
              every provider route, so anything pinned to bottom-0 sits behind
              it — which made this button unreachable on a real device even
              though it rendered fine in tests. provider/payout flows its
              actions the same way for the same reason. */}
          <Button
            className="w-full"
            disabled={updateServiceArea.isPending || lat === null || lng === null}
            onClick={save}
          >
            {updateServiceArea.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              "Save service area"
            )}
          </Button>
        </div>
      )}
    </div>
  );
}
