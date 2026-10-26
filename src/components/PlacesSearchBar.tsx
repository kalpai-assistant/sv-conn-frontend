/**
 * Type-to-search entry on the address picker (SVC-284).
 *
 * Sits on top of the map at the map step. A user types "Kharadi Lane 1",
 * sees Google Places suggestions as they type, taps one, and the pin jumps to
 * that place — a faster path than dragging the map from Bangalore to Pune by
 * hand. The map's own drag + locate-me still work, so this is an addition to
 * the flow rather than a replacement of it.
 *
 * ## Session billing
 *
 * Google prices autocomplete *per session*, not per request, when the same
 * `AutocompleteSessionToken` is passed to every prediction call and the final
 * place-details lookup. A session opens on mount and closes on the first
 * successful pick; typing → picking is one billed session regardless of how
 * many characters the user backspaced through. The next search starts a fresh
 * one.
 *
 * ## Why hand-rolled rather than a wrapper library
 *
 * `react-places-autocomplete` and friends pull in the SDK differently from
 * `google-maps.ts` and duplicate the loader. This component uses the shared
 * loader in `@/lib/google-maps`, so the API key is defined once and the
 * script tag appears in the page once.
 */

import { useEffect, useRef, useState } from "react";
import { Search, Loader2 } from "lucide-react";
import {
  createAutocompleteSession,
  placeDetails,
  queryPlaces,
  type PlaceDetails,
  type PlacePrediction,
} from "@/lib/google-maps";
import { useT } from "@/i18n/LanguageProvider";

const DEBOUNCE_MS = 200;

export function PlacesSearchBar({
  onPick,
  placeholder,
}: {
  onPick: (details: PlaceDetails) => void;
  placeholder?: string;
}) {
  // SVC-376: route-gated like MapPicker — English on customer routes. The
  // suggestions themselves are Google's and pass through untouched.
  const { t } = useT();
  const [query, setQuery] = useState("");
  const [predictions, setPredictions] = useState<PlacePrediction[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [open, setOpen] = useState(false);
  // A ref rather than state — a session token update should never trigger a
  // re-render, and useEffect dependencies must not see it change.
  const sessionRef = useRef<google.maps.places.AutocompleteSessionToken | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const token = await createAutocompleteSession();
        if (!cancelled) sessionRef.current = token;
      } catch {
        // A missing key or network failure. The search bar stays visible but
        // typing produces no suggestions — the caller falls back to the
        // map's drag/locate-me path, which does not depend on this.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const trimmed = query.trim();
    if (!trimmed) {
      setPredictions([]);
      setIsLoading(false);
      return;
    }
    let cancelled = false;
    setIsLoading(true);
    // Naive debounce. 200ms is enough to skip a burst of keystrokes without
    // making the dropdown feel sticky against a slow typer.
    const timer = setTimeout(async () => {
      try {
        const session = sessionRef.current;
        if (!session) {
          if (!cancelled) setPredictions([]);
          return;
        }
        const results = await queryPlaces(trimmed, session);
        if (!cancelled) setPredictions(results);
      } catch {
        if (!cancelled) setPredictions([]);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }, DEBOUNCE_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query]);

  const handlePick = async (prediction: PlacePrediction) => {
    const session = sessionRef.current;
    if (!session) return;
    try {
      const details = await placeDetails(prediction.placeId, session);
      if (details) {
        onPick(details);
        // Session closes on a successful pick — anything else Google bills as
        // a new session. Open a fresh one for the next search.
        sessionRef.current = await createAutocompleteSession();
      }
    } catch {
      // Ignored. The map's manual paths remain — the pick failed, the user
      // can still drag or locate-me.
    }
    setQuery(prediction.primaryText);
    setPredictions([]);
    setOpen(false);
  };

  return (
    <div className="relative">
      <div className="flex items-center gap-2 rounded-xl bg-card border border-border shadow-md px-3 py-2">
        <Search className="h-4 w-4 text-muted-foreground shrink-0" aria-hidden />
        <input
          type="text"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          // A short delay so a click on a suggestion registers before the blur
          // closes the dropdown. Without it the click races and cancels.
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          placeholder={placeholder ?? t("map.searchPlaceholder")}
          aria-label={t("map.searchLabel")}
          role="combobox"
          aria-expanded={open && predictions.length > 0}
          className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
        />
        {isLoading && (
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground shrink-0" aria-hidden />
        )}
      </div>
      {open && predictions.length > 0 && (
        <ul
          role="listbox"
          className="absolute top-full left-0 right-0 z-30 mt-1 max-h-[280px] overflow-y-auto rounded-xl border border-border bg-card shadow-lg"
        >
          {predictions.map((prediction) => (
            <li key={prediction.placeId} role="option" aria-selected="false">
              <button
                type="button"
                // preventDefault on mousedown so the input's blur does not
                // fire before the click. Same class of race as the timeout
                // above; both are needed on iOS + Android WebView.
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => void handlePick(prediction)}
                className="w-full px-3 py-2 text-left hover:bg-secondary focus:bg-secondary focus:outline-none"
              >
                <div className="truncate text-sm font-medium text-foreground">
                  {prediction.primaryText}
                </div>
                {prediction.secondaryText && (
                  <div className="truncate text-xs text-muted-foreground">
                    {prediction.secondaryText}
                  </div>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
