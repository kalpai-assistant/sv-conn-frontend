/**
 * Whether the on-screen keyboard is open (found on the SVC-412 device pass).
 *
 * Android resizes the WebView when the keyboard opens (684 → 404 CSS px on the
 * test phone), so anything `fixed bottom-0` rides up and sits on top of the
 * keyboard. The BottomNav did exactly that: it covered the price box the SP
 * was typing into, and that box's Save button. Callers hide such elements
 * while this is true.
 *
 * There is no keyboard event in a plain WebView, and `@capacitor/keyboard`
 * would be a new native plugin (an iOS sync from a Mac). So this infers it
 * from two signals that are both needed:
 *
 * - an editable element has focus (a tap on a button never counts), and
 * - the visual viewport is at least {@link KEYBOARD_MIN_PX} shorter than the
 *   tallest it has been, which a keyboard is and browser chrome isn't.
 *
 * The tallest height resets on rotation, where the viewport legitimately
 * changes size with nothing focused.
 */
import { useEffect, useState } from "react";

/** A phone keyboard is 250px+; browser toolbars that collapse are < 100px. */
export const KEYBOARD_MIN_PX = 150;

// Inputs that raise a keyboard. Checkboxes, radios, ranges, buttons and the
// like don't.
const TYPING_INPUTS = new Set([
  "text",
  "search",
  "tel",
  "url",
  "email",
  "password",
  "number",
  "date",
  "datetime-local",
  "month",
  "time",
  "week",
]);

export function isEditable(el: Element | null): boolean {
  if (!el) return false;
  if (el instanceof HTMLTextAreaElement) return !el.readOnly && !el.disabled;
  if (el instanceof HTMLInputElement) {
    return TYPING_INPUTS.has(el.type) && !el.readOnly && !el.disabled;
  }
  // `=== true`: jsdom leaves isContentEditable undefined.
  return el instanceof HTMLElement && el.isContentEditable === true;
}

/**
 * Without `visualViewport` (an old WebView, jsdom) this is always false: no
 * signal means the nav stays, never a guess that hides it. On a desktop,
 * focusing a field doesn't shrink the viewport, so it stays false there too.
 */
export function useSoftKeyboardOpen(): boolean {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    let tallest = vv.height;

    const check = () => {
      if (vv.height > tallest) tallest = vv.height;
      setOpen(isEditable(document.activeElement) && tallest - vv.height >= KEYBOARD_MIN_PX);
    };
    // focusout fires before the next element takes focus, so look once it has.
    let pending: number | undefined;
    const checkSoon = () => {
      window.clearTimeout(pending);
      pending = window.setTimeout(check, 0);
    };
    const rotated = () => {
      // The new orientation's height is the new baseline.
      window.clearTimeout(pending);
      pending = window.setTimeout(() => {
        tallest = vv.height;
        check();
      }, 300);
    };

    // A resize covers both ways the keyboard closes: blur, and the back button
    // with focus left where it was.
    vv.addEventListener("resize", check);
    window.addEventListener("focusin", check);
    window.addEventListener("focusout", checkSoon);
    window.addEventListener("orientationchange", rotated);
    return () => {
      window.clearTimeout(pending);
      vv.removeEventListener("resize", check);
      window.removeEventListener("focusin", check);
      window.removeEventListener("focusout", checkSoon);
      window.removeEventListener("orientationchange", rotated);
    };
  }, []);

  return open;
}
