/**
 * SVC-391: iOS edge-swipe-back gesture for the Capacitor shell.
 *
 * TanStack Router inside a WebView gives the user nothing when they drag
 * from the left edge — the native UIKit back gesture needs a
 * UINavigationController we don't own. This hook listens on `document` and
 * calls the same back path the Android hardware button already uses:
 * `runBackInterceptors()` first (so an open sheet or AuthFlow OTP claims the
 * gesture the same way), then `router.history.back()` if there is history.
 *
 * iOS only (`Capacitor.getPlatform() === "ios"`); on Android the system owns
 * the gesture, and on the web the browser does. The pointer listeners stay
 * out of the capture phase so a child element (a horizontal rail, a sheet's
 * own drag handle) can short-circuit by setting `data-no-edge-swipe` or by
 * being its own `overflow-x: auto|scroll` container with content wider than
 * its client box — a swipe that starts inside that element is treated as
 * scroll, not navigation.
 */
import { useEffect } from "react";
import { Capacitor } from "@capacitor/core";
import type { AnyRouter } from "@tanstack/react-router";
import { runBackInterceptors } from "@/lib/back-interceptor";
import { isEdgeSwipeBackBlocked } from "@/lib/edge-swipe";

/** Pointer must start within this many px of the left viewport edge. */
const EDGE_PX = 20;
/** Minimum rightward travel before the gesture commits to a back. */
const COMMIT_DX_PX = 60;
/** `|dy|/|dx|` must stay under this — swipes too steep read as scrolls. */
const MAX_ANGLE_RATIO = 0.75;
/** The commit must happen within this many ms of pointer-down; past that
 *  the finger is more likely selecting text or starting a long press. */
const MAX_DURATION_MS = 600;

/**
 * Walk up from `el` looking for a reason to skip the gesture:
 * - any ancestor marked `data-no-edge-swipe="true"` (explicit opt-out)
 * - any ancestor that is horizontally scrollable with content wider than its
 *   client box (promo carousel, snap rails, related rails)
 *
 * Walks only until `document.body` so a top-level scroll never counts.
 */
function startsInsideScroller(target: EventTarget | null): boolean {
  let el: Element | null = target instanceof Element ? target : null;
  while (el && el !== document.body) {
    if (el instanceof HTMLElement && el.dataset.noEdgeSwipe === "true") return true;
    const style = window.getComputedStyle(el);
    const overflowX = style.overflowX;
    if (overflowX === "auto" || overflowX === "scroll") {
      if ((el as HTMLElement).scrollWidth > (el as HTMLElement).clientWidth) return true;
    }
    el = el.parentElement;
  }
  return false;
}

/**
 * Register the edge-swipe handler for the current pathname.
 *
 * `router` and `pathname` are read live inside the listener via refs — the
 * effect re-runs when either reference changes, which happens every
 * navigation, but inside one route the listener is registered once per mount.
 */
export function useEdgeSwipeBack(router: AnyRouter, pathname: string): void {
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    if (Capacitor.getPlatform() !== "ios") return;
    if (isEdgeSwipeBackBlocked(pathname)) return;

    let startX = 0;
    let startY = 0;
    let startedAt = 0;
    let tracking = false;

    const onPointerDown = (e: PointerEvent) => {
      if (e.clientX > EDGE_PX) return;
      if (startsInsideScroller(e.target)) return;
      startX = e.clientX;
      startY = e.clientY;
      startedAt = performance.now();
      tracking = true;
    };

    const onPointerMove = (e: PointerEvent) => {
      if (!tracking) return;
      const dx = e.clientX - startX;
      const dy = Math.abs(e.clientY - startY);
      if (dx < COMMIT_DX_PX) return;
      if (performance.now() - startedAt > MAX_DURATION_MS) {
        tracking = false;
        return;
      }
      if (dy / Math.max(dx, 1) >= MAX_ANGLE_RATIO) {
        tracking = false;
        return;
      }
      tracking = false;
      // Interceptor path first (open sheets, AuthFlow OTP), then router. If
      // nothing claims it and there is no history, the swipe is a no-op —
      // deliberately not the "double-tap to exit" branch the hardware back
      // uses, because swiping to exit the app would be surprising.
      if (runBackInterceptors()) return;
      if (router.history.canGoBack()) router.history.back();
    };

    const onPointerEnd = () => {
      tracking = false;
    };

    document.addEventListener("pointerdown", onPointerDown, { passive: true });
    document.addEventListener("pointermove", onPointerMove, { passive: true });
    document.addEventListener("pointerup", onPointerEnd, { passive: true });
    document.addEventListener("pointercancel", onPointerEnd, { passive: true });
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("pointermove", onPointerMove);
      document.removeEventListener("pointerup", onPointerEnd);
      document.removeEventListener("pointercancel", onPointerEnd);
    };
  }, [router, pathname]);
}

export const EDGE_SWIPE_CONSTANTS = {
  EDGE_PX,
  COMMIT_DX_PX,
  MAX_ANGLE_RATIO,
  MAX_DURATION_MS,
} as const;
