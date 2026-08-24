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
import { useEffect, useRef, useState } from "react";

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

  useEffect(() => {
    const onTouchStart = (e: TouchEvent) => {
      if (window.scrollY > 0 || refreshing) {
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
        setPull(0);
        return;
      }
      // Resisted so the indicator decelerates as it approaches the cap.
      setPull(Math.min(MAX_PULL, dy * 0.5));
    };

    const onTouchEnd = async () => {
      if (startY.current === null) return;
      startY.current = null;
      if (pull < THRESHOLD * 0.5) {
        setPull(0);
        return;
      }
      setRefreshing(true);
      setPull(THRESHOLD * 0.5);
      try {
        await onRefresh();
      } finally {
        setRefreshing(false);
        setPull(0);
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
  }, [onRefresh, pull, refreshing]);

  return { pull, refreshing };
}
