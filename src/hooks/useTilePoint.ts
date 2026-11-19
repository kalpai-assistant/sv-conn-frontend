/**
 * Where the service tiles price from (SVC-415, Jira comment 14943).
 *
 * 1. The selected address, when it has coordinates: the booking address, the
 *    same one the pro sheet ranks from.
 * 2. Otherwise the launch fix (`lib/tile-location.ts`), while it is under 2 h
 *    old.
 * 3. Otherwise null: the tiles show catalogue prices.
 *
 * The tiles never ask the device. `requestLocation` can raise the permission
 * dialog and is documented as "never speculatively mid-session", so the only
 * position calls here are the launch check's (already made) and the silent,
 * permission-peeked refresh below. The pro sheet keeps its own rule.
 */
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useSelectedAddress } from "@/hooks/useSelectedAddress";
import { peekCurrentPosition, peekLocationPermission } from "@/lib/geolocation";
import { MAP_PICKER_LOCATE_TIMEOUT_MS } from "@/lib/map-picker-timeouts";
import {
  FIX_MAX_AGE_MS,
  getLaunchFix,
  markRefreshAttempt,
  setLaunchFix,
  shouldRefresh,
  subscribeToLaunchFix,
  usableFix,
} from "@/lib/tile-location";

export interface TilePoint {
  lat: number;
  lng: number;
}

/** True when the selected address carries coordinates: it wins over any fix. */
function pinnedPoint(selected: { lat?: number | null; lng?: number | null } | undefined) {
  return selected && selected.lat != null && selected.lng != null
    ? { lat: selected.lat, lng: selected.lng }
    : null;
}

export function useTilePoint(): TilePoint | null {
  const { selected } = useSelectedAddress();
  const fix = useSyncExternalStore(subscribeToLaunchFix, getLaunchFix, () => null);

  // Re-render when the fix expires, so a tile left on screen does not keep a
  // 2 h-old place's labels until something else happens to re-render it.
  const [, setExpiredTick] = useState(0);
  useEffect(() => {
    if (!fix) return;
    const remaining = fix.at + FIX_MAX_AGE_MS - Date.now();
    if (remaining < 0) return;
    const timer = setTimeout(() => setExpiredTick((n) => n + 1), remaining + 1);
    return () => clearTimeout(timer);
  }, [fix]);

  const pinned = pinnedPoint(selected);
  if (pinned) return pinned;
  const usable = fix ? usableFix(Date.now()) : null;
  return usable ? { lat: usable.lat, lng: usable.lng } : null;
}

/**
 * Silently refresh the launch fix when the app returns to the foreground.
 *
 * Only for customers without a pinned address, only when the fix is missing
 * or over 30 min old, and at most one attempt per 30 min (success or not).
 * Never prompts: `peekLocationPermission` reads without asking, and only a
 * "granted" answer leads to the bare coarse position call. A failure keeps
 * the old fix. Uses the `useAppVersionCheck` resume pattern; the location
 * GATE is not wired to resume, and this does not touch it.
 *
 * Mount once, for an authenticated consumer (see `__root.tsx`).
 */
export function useLaunchFixRefresh(): void {
  const { selected, isLoading } = useSelectedAddress();
  // Read inside the listener, which is registered once.
  const skipRef = useRef(true);
  skipRef.current = isLoading || pinnedPoint(selected) != null;

  useEffect(() => {
    if (typeof window === "undefined") return;
    let disposed = false;
    let inFlight = false;

    const refresh = async () => {
      if (disposed || inFlight || skipRef.current) return;
      const now = Date.now();
      if (!shouldRefresh(now)) return;
      markRefreshAttempt(now);
      inFlight = true;
      try {
        if ((await peekLocationPermission()) !== "granted") return;
        const coords = await peekCurrentPosition(MAP_PICKER_LOCATE_TIMEOUT_MS);
        if (coords && !disposed) setLaunchFix(coords, Date.now());
      } finally {
        inFlight = false;
      }
    };

    let cleanupNative: (() => void) | undefined;
    void (async () => {
      try {
        const { Capacitor } = await import("@capacitor/core");
        if (!Capacitor.isNativePlatform()) return;
        const { App } = await import("@capacitor/app");
        const handle = await App.addListener("appStateChange", ({ isActive }) => {
          if (isActive) void refresh();
        });
        if (disposed) void handle.remove();
        else
          cleanupNative = () => {
            void handle.remove();
          };
      } catch {
        // Native import failed → web path only.
      }
    })();

    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      disposed = true;
      document.removeEventListener("visibilitychange", onVisibilityChange);
      cleanupNative?.();
    };
  }, []);
}
