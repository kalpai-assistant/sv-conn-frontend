/**
 * Pull-down-to-refresh for body-scrolled list screens.
 *
 * Deliberately opt-in per route rather than mounted globally. Scoping it to
 * the two list screens that have a refresh to offer means the tracking map —
 * which handles its own drag — never competes with it, at no cost and with
 * less code than an exclusion attribute would need.
 *
 * The app scrolls the document rather than an inner container on these
 * screens, so "am I at the top" is just `window.scrollY <= 0`.
 *
 * Note this is an affordance, not a correctness fix: the QueryClient is
 * constructed with no options, so `refetchOnWindowFocus` is on and returning
 * to the app already refetches. This exists because users expect the gesture.
 */
import { useCallback, useEffect, useRef, useState } from "react";

/** Pull distance, in px, that commits to a refresh. */
const THRESHOLD = 70;
/** Past this the indicator stops following the finger, so an aggressive pull
 *  doesn't drag the whole header down the screen. */
const MAX_PULL = 110;

export function usePullToRefresh(onRefresh: () => Promise<unknown> | unknown) {
  const [pull, setPull] = useState(0);
  const [refreshing, setRefreshing] = useState(false);

  const startY = useRef<number | null>(null);
  const startX = useRef(0);
  // Latched once a gesture is judged to be horizontal, so a diagonal drag
  // can't cross the axis threshold mid-swipe and trigger a refresh.
  const rejected = useRef(false);

  // Mirrors of everything the listeners read.
  //
  // The listeners are registered ONCE, so they cannot close over state — a
  // stale closure would read `pull` as 0 at touchend and never fire. Refs are
  // the alternative to putting these in the dependency array, which would
  // re-register all four listeners on every `touchmove`: dozens of
  // teardown/re-add cycles per gesture, and a real chance of dropping an
  // event mid-drag on a slower device.
  const pullRef = useRef(0);
  const refreshingRef = useRef(false);
  const onRefreshRef = useRef(onRefresh);

  // Kept current without re-running the listener effect, so a caller passing
  // an inline arrow — the obvious thing to write — costs nothing.
  useEffect(() => {
    onRefreshRef.current = onRefresh;
  });

  const applyPull = useCallback((next: number) => {
    pullRef.current = next;
    setPull(next);
  }, []);

  useEffect(() => {
    const onTouchStart = (e: TouchEvent) => {
      if (window.scrollY > 0 || refreshingRef.current) {
        startY.current = null;
        return;
      }
      startY.current = e.touches[0].clientY;
      startX.current = e.touches[0].clientX;
      rejected.current = false;
    };

    const onTouchMove = (e: TouchEvent) => {
      if (startY.current === null || rejected.current) return;
      const dy = e.touches[0].clientY - startY.current;
      const dx = Math.abs(e.touches[0].clientX - startX.current);

      // Upward, or more horizontal than vertical — the latter is a flick on
      // one of the snap-scrolling rails, not a pull.
      if (dy <= 0 || dx > Math.abs(dy)) {
        rejected.current = true;
        applyPull(0);
        return;
      }
      // Resisted so the indicator decelerates as it approaches the cap.
      applyPull(Math.min(MAX_PULL, dy * 0.5));
    };

    const onTouchEnd = async () => {
      if (startY.current === null) return;
      startY.current = null;

      if (pullRef.current < THRESHOLD * 0.5) {
        applyPull(0);
        return;
      }

      refreshingRef.current = true;
      setRefreshing(true);
      // Hold the indicator at rest height while the request is in flight.
      applyPull(THRESHOLD * 0.5);
      try {
        await onRefreshRef.current();
      } finally {
        refreshingRef.current = false;
        setRefreshing(false);
        applyPull(0);
      }
    };

    // Passive: this never calls preventDefault — `overscroll-behavior-y:
    // contain` on the body is what stops the native gesture, so there is no
    // reason to make the browser wait on this handler before scrolling.
    document.addEventListener("touchstart", onTouchStart, { passive: true });
    document.addEventListener("touchmove", onTouchMove, { passive: true });
    document.addEventListener("touchend", onTouchEnd, { passive: true });
    document.addEventListener("touchcancel", onTouchEnd, { passive: true });
    return () => {
      document.removeEventListener("touchstart", onTouchStart);
      document.removeEventListener("touchmove", onTouchMove);
      document.removeEventListener("touchend", onTouchEnd);
      document.removeEventListener("touchcancel", onTouchEnd);
    };
    // Registered once for the lifetime of the screen. Everything the handlers
    // need is read through a ref.
  }, [applyPull]);

  return { pull, refreshing };
}
