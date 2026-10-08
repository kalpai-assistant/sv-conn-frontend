/**
 * Reading the invite code off the clipboard (SVC-322 part 3) — where it can be
 * done, and only without surprising anyone.
 *
 * Measured on device (Samsung, Android 14): the Capacitor app's WebView refuses
 * `navigator.clipboard.readText` outright — "Read permission denied" — even
 * inside a real tap. So in the native app there is no clipboard read at all;
 * the keyboard's own suggestion and long-press paste do that job. In a browser
 * (the PWA on Android Chrome or iPhone Safari) a read inside a tap is allowed,
 * which is what the Paste button is for. Not verified on an iPhone here.
 *
 * On load, a read happens only where the browser already says "granted" —
 * otherwise it would raise a permission prompt (Chrome) or simply fail
 * (Safari, which never allows it without a gesture) the moment the page opens.
 */
import { Capacitor } from "@capacitor/core";

/** Whether a Paste button can ever work here. */
export function canPasteFromClipboard(): boolean {
  if (Capacitor.isNativePlatform()) return false;
  return typeof navigator !== "undefined" && typeof navigator.clipboard?.readText === "function";
}

/** The clipboard on page load, but only if reading it is already allowed. */
export async function readClipboardOnLoad(): Promise<string | null> {
  if (!canPasteFromClipboard()) return null;
  try {
    const status = await navigator.permissions?.query({
      name: "clipboard-read" as PermissionName,
    });
    if (status?.state !== "granted") return null;
    return await navigator.clipboard.readText();
  } catch {
    // Safari has no "clipboard-read" permission to ask about; it throws here.
    return null;
  }
}

export type TapRead = { ok: true; text: string } | { ok: false };

/** The clipboard from a tap. `ok: false` means the browser refused. */
export async function readClipboardOnTap(): Promise<TapRead> {
  try {
    return { ok: true, text: await navigator.clipboard.readText() };
  } catch {
    return { ok: false };
  }
}
