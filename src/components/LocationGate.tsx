/**
 * "Where do you want your service?" — asked on every launch (SVC-281).
 *
 * ## What this prevents
 *
 * A consumer in Pune yesterday and Mumbai today books against their saved Pune
 * address. The geo-fence searches around Pune, finds nobody, and the booking
 * dies as "no partners found nearby" — in a city full of providers. Nothing on
 * screen explains it, because from the app's side nothing went wrong.
 *
 * The provider side is worse: no `service_area_center` means the dispatch query
 * excludes them from every broadcast. They sit online receiving nothing.
 *
 * ## The confirm button names the place, and that is the whole mechanism
 *
 * A returning user who is still in Pune sees this screen daily. If the button
 * said "Continue" it would become a toll — tapped through on autopilot within a
 * week, and then tapped through on the one day they are in Mumbai too. Naming
 * the place ("Yes, I'm at Karve Nagar") means confirming requires reading, and
 * a wrong answer is visible rather than skipped.
 *
 * **Do not shorten this label.** It is not phrasing; it is the feature.
 *
 * ## No dead ends
 *
 * Three ways off this screen, and one needs no permission at all:
 *
 *   1. confirm the saved location — one tap,
 *   2. use current location — the OS prompt fires here, on an explicit tap,
 *      which is the only place it should,
 *   3. enter it manually — a map picker, no permission involved.
 *
 * Blocking without (3) would strand anyone who declined the permission, and on
 * Android a denial is one-shot. So (3) is always offered, and when the browser
 * reports `denied` the current-location button says where to fix it rather than
 * presenting an action the OS will silently refuse.
 */
import { useEffect, useState } from "react";
import { Loader2, MapPin, Navigation } from "lucide-react";
import { Button } from "@/components/ui/button";

export interface LocationGateProps {
  /** Headline — differs per role ("your service" vs "you working today"). */
  title: string;
  /** One line under it saying why we are asking. */
  subtitle: string;
  /**
   * The location already on file, if any. Its `label` is what the confirm
   * button names, so it must be somewhere a human recognises — a locality, not
   * a coordinate pair.
   */
  saved?: { label: string; full: string } | null;
  /** Keep the saved location. */
  onConfirmSaved: () => void;
  /** A position the user asked for, in lat/lng. */
  onUseCurrent: (lat: number, lng: number) => void;
  /** Open the manual picker. Always available — this is the no-permission path. */
  onEnterManually: () => void;
  /** True while a choice is being saved, so the screen can show progress. */
  isSaving?: boolean;
}

export function LocationGate({
  title,
  subtitle,
  saved,
  onConfirmSaved,
  onUseCurrent,
  onEnterManually,
  isSaving = false,
}: LocationGateProps) {
  const [locating, setLocating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // `null` while unknown. Only "denied" changes what we render — a one-shot
  // denial means the button below cannot work, and saying so beats offering it.
  const [permission, setPermission] = useState<PermissionState | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const status = await navigator.permissions?.query({
          name: "geolocation" as PermissionName,
        });
        if (!cancelled && status) setPermission(status.state);
      } catch {
        // Absent or throwing Permissions API — treat as unknown and keep the
        // button, which is the safe default: it may still work.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const useCurrent = () => {
    if (!("geolocation" in navigator)) {
      setError("Location isn't available on this device. Enter it manually instead.");
      return;
    }
    setError(null);
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false);
        onUseCurrent(pos.coords.latitude, pos.coords.longitude);
      },
      (err) => {
        setLocating(false);
        setPermission(err.code === 1 ? "denied" : permission);
        setError(
          err.code === 1
            ? "Location is off for this app. Turn it on in settings, or enter your location manually."
            : "Couldn't get your location. Enter it manually instead.",
        );
      },
      { enableHighAccuracy: true, timeout: 15_000, maximumAge: 0 },
    );
  };

  const denied = permission === "denied";
  const busy = locating || isSaving;

  return (
    <div className="flex min-h-screen flex-col bg-background px-6 py-10">
      <div className="flex-1">
        <h1 className="text-2xl font-semibold text-foreground">{title}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{subtitle}</p>

        <div className="mt-10 flex justify-center">
          <div className="flex h-32 w-32 items-center justify-center rounded-full bg-accent">
            <MapPin className="h-12 w-12 text-primary" />
          </div>
        </div>
      </div>

      {error && (
        <p className="mb-4 rounded-lg bg-destructive/10 p-3 text-sm text-destructive">{error}</p>
      )}

      <div className="space-y-3">
        {saved && (
          <div className="rounded-xl border border-border bg-card p-4">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">
              Last used location
            </p>
            <p className="mt-1 text-sm font-medium capitalize text-foreground">{saved.label}</p>
            <p className="truncate text-xs text-muted-foreground">{saved.full}</p>
            {/* Names the place on purpose — see the module docs. A generic
                "Continue" turns this into a toll that gets tapped through
                unread, which is exactly the failure the screen exists to
                prevent. */}
            <Button className="mt-3 w-full" disabled={busy} onClick={onConfirmSaved}>
              {isSaving ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                `Yes, I'm at ${saved.label}`
              )}
            </Button>
          </div>
        )}

        <Button
          variant={saved ? "outline" : "default"}
          className="w-full justify-center gap-2"
          disabled={busy || denied}
          onClick={useCurrent}
        >
          {locating ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Navigation className="h-4 w-4" />
          )}
          {locating ? "Locating…" : "Use my current location"}
        </Button>

        {/* Always offered, never disabled: the only path that needs no
            permission, and therefore the reason a blocking screen is safe. */}
        <Button variant="ghost" className="w-full" disabled={isSaving} onClick={onEnterManually}>
          {saved ? "I'm somewhere else" : "Enter location manually"}
        </Button>
      </div>
    </div>
  );
}
