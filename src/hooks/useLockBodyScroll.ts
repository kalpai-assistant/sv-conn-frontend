/**
 * Freezes page scroll while an overlay is open.
 *
 * Every sheet in the app is a `fixed inset-0` backdrop plus a `fixed
 * bottom-0` panel, and nothing stopped the page behind from scrolling — so
 * dragging on the backdrop, or past the end of a sheet's own scroller,
 * scrolled the content underneath it. Most obvious in the slot picker and
 * search sheet, where scrolling is the main interaction.
 *
 * `position: fixed` is what actually stops touch scrolling on Android —
 * `overflow: hidden` alone does not. But fixing the body collapses it to the
 * viewport and jumps the user to the top, so the current offset is captured,
 * applied as a negative `top`, and restored on close. Getting that restore
 * wrong is a worse bug than the one being fixed, which is why this is one
 * hook rather than an effect copy-pasted into five components.
 *
 * Reference-counted: nested overlays (a sheet opening another) would
 * otherwise have the inner one unlock the body while the outer is still up.
 */
import { useEffect } from "react";

let lockCount = 0;
let savedScrollY = 0;

function lock() {
  if (lockCount === 0) {
    savedScrollY = window.scrollY;
    document.body.style.position = "fixed";
    document.body.style.top = `-${savedScrollY}px`;
    document.body.style.left = "0";
    document.body.style.right = "0";
  }
  lockCount += 1;
}

function unlock() {
  lockCount = Math.max(0, lockCount - 1);
  if (lockCount === 0) {
    document.body.style.position = "";
    document.body.style.top = "";
    document.body.style.left = "";
    document.body.style.right = "";
    // Instant, not smooth: this is restoring a position the user never
    // visibly left, so animating it would look like an unexplained jump.
    window.scrollTo({ top: savedScrollY, behavior: "instant" as ScrollBehavior });
  }
}

export function useLockBodyScroll(active: boolean): void {
  useEffect(() => {
    if (!active) return;
    lock();
    return unlock;
  }, [active]);
}
