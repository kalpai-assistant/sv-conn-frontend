/**
 * "We can't find you" — shown only when that is actually true (SVC-281).
 *
 * ## When this appears
 *
 * Not on every launch. Only when `useLocationAvailability` reports that we
 * cannot locate the user — the OS location toggle is off, or permission is
 * off — or when they have nothing on file to fall back on. Someone with
 * location on and an address saved never sees it.
 *
 * The earlier build asked everyone, every launch, and that was the complaint
 * that produced this screen. It was also self-defeating: a daily prompt becomes
 * a reflex within a week, and a reflex cannot notice that the city is wrong.
 *
 * ## The copy names the actual problem
 *
 * "Location is off" covers three different situations with three different
 * remedies, and sending someone to the wrong one wastes their time:
 *
 *   device-off          the OS toggle. Enable cannot fix it; Settings can.
 *   permission-prompt   we have never asked. Enable fires the OS dialog.
 *   permission-denied   they refused. Android will not ask twice, so Enable
 *                       would silently do nothing — it is disabled and says why.
 *
 * That last one matters most. An enabled button that does nothing gets tapped
 * repeatedly, and the user concludes the app is broken.
 *
 * ## Three exits, and at least two never need permission
 *
 *   1. Enable / use my current location — the OS prompt fires here, on an
 *      explicit tap, which is the only place it should,
 *   2. tap a saved location — one tap, no permission, no map, no typing,
 *   3. enter it manually — a map picker, no permission involved.
 *
 * **(3) renders unconditionally, including when there are no saved locations.**
 * That is what makes a blocking screen safe: on Android a denial is one-shot,
 * so without a no-permission path a denied user would be locked out of the app
 * permanently. Any change that can hide it is the bug.
 */
import { useEffect, useState } from "react";
import { Check, Loader2, MapPin, Navigation } from "lucide-react";
import { Button } from "@/components/ui/button";
import { enableDeviceLocation, peekLocationPermission, requestLocation } from "@/lib/geolocation";
import type { LocationBlockedReason } from "@/hooks/useLocationAvailability";

/** One place the user can pick without granting anything. */
export interface SavedLocation {
  id: string;
  /** What the row is called — a locality, not "Home". See localityFrom. */
  label: string;
  /** The address line under it, or a radius for a provider's service area. */
  full: string;
}

/**
 * The user asked for this and is watching a spinner, so patience is expected —
 * unlike the launch check, this wait is one they chose.
 */
const LOCATE_TIMEOUT_MS = 20_000;

/**
 * How many times to re-ask after a timeout.
 *
 * Only a timeout is retried, and only because a freshly-enabled GPS has not
 * acquired yet — measured on device, two consecutive reads immediately after
 * "Turn on" both timed out while the toggle was demonstrably on. The user is
 * watching a spinner they asked for, so waiting is expected; being told we
 * could not get their location when it plainly works is not.
 */
const LOCATE_RETRIES = 3;

export interface LocationGateProps {
  /** Headline — role- and reason-specific. See `copyFor`. */
  title?: string;
  /** One line under it saying why we are asking. */
  subtitle?: string;
  /** Why we cannot locate them, so the copy can name it. */
  reason?: LocationBlockedReason | null;
  /** Locations already on file. Empty or absent is fine — see the module docs. */
  saved?: SavedLocation[];
  /** Keep one of the saved locations. */
  onConfirmSaved: (id: string) => void;
  /** A position the user asked for, in lat/lng. */
  onUseCurrent: (lat: number, lng: number) => void;
  /** Open the manual picker. Always available — this is the no-permission path. */
  onEnterManually: () => void;
  /** True while a choice is being saved, so the screen can show progress. */
  isSaving?: boolean;
}

/**
 * Headline and hint for each reason.
 *
 * A caller-supplied `title` wins: the provider gate has something more useful
 * to say than "location is off" when the real problem is that they have never
 * set a service area at all.
 */
function copyFor(reason: LocationBlockedReason | null | undefined): {
  title: string;
  subtitle: string;
} {
  switch (reason) {
    case "device-off":
      return {
        title: "Your device location is off",
        // Names the OS toggle rather than the app, because that is what has to
        // change. "Allow location for this app" would send them to a screen
        // where everything already looks correct.
        subtitle: "Turn on Location in your phone's settings, or choose where you are below.",
      };
    case "permission-denied":
      return {
        title: "Location permission is off",
        subtitle: "Allow location for EazyServ in Settings, or choose where you are below.",
      };
    case "permission-prompt":
      return {
        title: "Location permission is off",
        subtitle: "Turn it on to find services near you, or choose where you are below.",
      };
    default:
      return {
        title: "Where are you?",
        subtitle: "We couldn't detect your location. Choose where you'd like your service.",
      };
  }
}

export function LocationGate({
  title,
  subtitle,
  reason,
  saved = [],
  onConfirmSaved,
  onUseCurrent,
  onEnterManually,
  isSaving = false,
}: LocationGateProps) {
  const [locating, setLocating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Starts from the reason the caller resolved, but can be overtaken by a live
  // denial: tapping Enable on a `prompt` and refusing turns this into `denied`
  // without a relaunch.
  const [permission, setPermission] = useState<PermissionState | null>(
    reason === "permission-denied" ? "denied" : null,
  );

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      // The app's permission, not the WebView's. `navigator.permissions.query`
      // reported "prompt" on a device where Android had granted location and a
      // real call succeeded in 81ms — see lib/geolocation.ts.
      const state = await peekLocationPermission();
      if (!cancelled) setPermission(state as PermissionState);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Not `useCurrent`: the `use` prefix makes eslint read it as a hook, and it
  // is a plain event handler.
  const locateMe = async () => {
    setError(null);
    setLocating(true);

    // Two different asks, and which one is right depends on what is wrong.
    //
    // With the OS toggle off (SVC-283), `requestLocation` cannot help: the
    // plugin refuses every one of its calls with LOCATION_DISABLED before
    // anything can be offered, which is why Enable used to dead-end at
    // "couldn't get your location". `enableDeviceLocation` reaches Play
    // Services' settings check instead and raises the "Turn on" dialog.
    //
    // Everywhere else the ordinary request is correct, and it is the call that
    // raises the app-permission dialog for someone who has never granted it.
    let result =
      reason === "device-off"
        ? await enableDeviceLocation(LOCATE_TIMEOUT_MS)
        : await requestLocation(LOCATE_TIMEOUT_MS);

    // Turning location on does not mean a position exists yet. Found on
    // device: "Turn on" flipped the toggle, then the next read timed out
    // because the GPS had not acquired — and so did the one after it, leaving
    // the gate up over a phone whose location now worked.
    //
    // A timeout is the one failure that is not an answer, so it is retried
    // until the GPS catches up. Every other outcome is information and is
    // taken first time.
    for (let attempt = 0; result.failure === "timeout" && attempt < LOCATE_RETRIES; attempt++) {
      result = await requestLocation(LOCATE_TIMEOUT_MS);
    }

    const { ok, failure, coords } = result;
    setLocating(false);

    if (ok && coords) {
      onUseCurrent(coords.lat, coords.lng);
      return;
    }

    if (failure === "permission-denied") setPermission("denied");
    setError(
      failure === "permission-denied"
        ? "Location is off for this app. Turn it on in settings, or choose where you are below."
        : failure === "location-disabled"
          ? "Turn on Location in your phone's settings, or choose where you are below."
          : "Couldn't get your location. Choose where you are instead.",
    );
  };

  const denied = permission === "denied" || reason === "permission-denied";
  const busy = locating || isSaving;
  const copy = copyFor(reason);
  const heading = title ?? copy.title;
  const body = subtitle ?? copy.subtitle;

  return (
    <div className="flex min-h-screen flex-col bg-background px-6 py-10">
      <div className="flex-1">
        <h1 className="text-2xl font-semibold text-foreground">{heading}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{body}</p>

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
        {/* Enable, styled as the primary action: it is the outcome we want, and
            the one that keeps working next launch. Disabled when denied,
            because Android will not ask twice and a button that silently does
            nothing is worse than one that explains itself. */}
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="flex items-center gap-3">
            <Navigation className="h-5 w-5 shrink-0 text-primary" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-foreground">Use my current location</p>
              <p className="text-xs text-muted-foreground">
                {denied ? "Turn this on in Settings to use it" : "Most accurate"}
              </p>
            </div>
            <Button size="sm" disabled={busy || denied} onClick={() => void locateMe()}>
              {locating ? <Loader2 className="h-4 w-4 animate-spin" /> : "Enable"}
            </Button>
          </div>
        </div>

        {saved.length > 0 && (
          <div className="rounded-xl border border-border bg-card p-2">
            <p className="px-2 py-1 text-xs uppercase tracking-wide text-muted-foreground">
              Saved locations
            </p>
            {/* One tap and through — the common case is "location is off and I
                am at home", and this needs no permission and no map. The label
                is the locality on purpose: "Home" is true in every city, so a
                row saying it confirms nothing. See localityFrom. */}
            {saved.map((place) => (
              <button
                key={place.id}
                disabled={busy}
                onClick={() => onConfirmSaved(place.id)}
                className="flex w-full items-start gap-3 rounded-lg p-3 text-left transition-colors hover:bg-secondary disabled:opacity-50"
              >
                <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium capitalize text-foreground">{place.label}</p>
                  <p className="truncate text-xs text-muted-foreground">{place.full}</p>
                </div>
                {isSaving ? (
                  <Loader2 className="mt-0.5 h-4 w-4 shrink-0 animate-spin text-muted-foreground" />
                ) : (
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                )}
              </button>
            ))}
          </div>
        )}

        {/* Always offered, never hidden: the only path that needs no permission
            and no network, and therefore the reason a blocking screen is safe.
            Renders even with an empty saved list — a denied user with no saved
            location would otherwise have no way into the app at all. */}
        <Button variant="ghost" className="w-full" disabled={isSaving} onClick={onEnterManually}>
          {saved.length > 0 ? "Somewhere else" : "Enter location manually"}
        </Button>
      </div>
    </div>
  );
}
