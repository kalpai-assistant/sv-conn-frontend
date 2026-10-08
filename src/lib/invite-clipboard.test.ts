/**
 * Where the invite screen may read the clipboard (SVC-322 part 3). Measured on
 * device: the native app's WebView refuses every read, so it must not offer a
 * Paste button that can only fail; browsers allow a read inside a tap.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const { native } = vi.hoisted(() => ({ native: { value: false } }));
vi.mock("@capacitor/core", () => ({
  Capacitor: { isNativePlatform: () => native.value },
}));

import { canPasteFromClipboard, readClipboardOnLoad } from "@/lib/invite-clipboard";

function setBrowser(permission: PermissionState) {
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: { readText: vi.fn().mockResolvedValue("482913") },
  });
  Object.defineProperty(navigator, "permissions", {
    configurable: true,
    value: { query: vi.fn().mockResolvedValue({ state: permission }) },
  });
}

beforeEach(() => {
  native.value = false;
  setBrowser("granted");
});

describe("the native app", () => {
  it("offers no Paste button: its WebView refuses every clipboard read", () => {
    native.value = true;
    expect(canPasteFromClipboard()).toBe(false);
  });

  it("never reads on load", async () => {
    native.value = true;
    expect(await readClipboardOnLoad()).toBeNull();
    expect(navigator.clipboard.readText).not.toHaveBeenCalled();
  });
});

describe("a browser (the PWA)", () => {
  it("offers Paste", () => {
    expect(canPasteFromClipboard()).toBe(true);
  });

  it("reads on load only once permission is already granted", async () => {
    expect(await readClipboardOnLoad()).toBe("482913");

    setBrowser("prompt");
    expect(await readClipboardOnLoad()).toBeNull();
    expect(navigator.clipboard.readText).not.toHaveBeenCalled();
  });
});
