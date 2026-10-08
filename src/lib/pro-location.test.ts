/**
 * The Pro's location reads (SVC-322). The rule that matters most: the
 * heartbeat's read never puts a dialog on screen — it runs every 30 s, and a
 * permission prompt every 30 s would make the app unusable.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const { peek, request, enable } = vi.hoisted(() => ({
  peek: vi.fn(),
  request: vi.fn(),
  enable: vi.fn(),
}));
vi.mock("@/lib/geolocation", () => ({
  peekLocationPermission: peek,
  requestLocation: request,
  enableDeviceLocation: enable,
}));

import {
  askForProLocation,
  locationNeedsAttention,
  locationWarning,
  readProLocation,
} from "@/lib/pro-location";

const FIX = { lat: 18.5, lng: 73.8 };

beforeEach(() => vi.clearAllMocks());

describe("readProLocation (the heartbeat's read)", () => {
  it("never asks for a permission that hasn't been answered", async () => {
    peek.mockResolvedValue("prompt");
    expect(await readProLocation()).toEqual({ status: "prompt", coords: null });
    // requestLocation is the call that raises the dialog.
    expect(request).not.toHaveBeenCalled();
  });

  it("never asks once permission was denied", async () => {
    peek.mockResolvedValue("denied");
    expect((await readProLocation()).status).toBe("denied");
    expect(request).not.toHaveBeenCalled();
  });

  it("returns the fix when permission is granted", async () => {
    peek.mockResolvedValue("granted");
    request.mockResolvedValue({ ok: true, failure: null, coords: FIX });
    expect(await readProLocation()).toEqual({ status: "ok", coords: FIX });
  });

  it("reports the device switch being off", async () => {
    peek.mockResolvedValue("granted");
    request.mockResolvedValue({ ok: false, failure: "location-disabled", coords: null });
    expect((await readProLocation()).status).toBe("off");
  });

  it("calls a slow fix 'unknown', not a problem", async () => {
    peek.mockResolvedValue("granted");
    request.mockResolvedValue({ ok: false, failure: "timeout", coords: null });
    expect((await readProLocation()).status).toBe("unknown");
  });
});

describe("askForProLocation (from a tap)", () => {
  it("asks, and stops there when it gets a fix", async () => {
    request.mockResolvedValue({ ok: true, failure: null, coords: FIX });
    expect(await askForProLocation()).toEqual({ status: "ok", coords: FIX });
    expect(enable).not.toHaveBeenCalled();
  });

  it("offers Android's 'Turn on location' sheet when the switch is off", async () => {
    request.mockResolvedValue({ ok: false, failure: "location-disabled", coords: null });
    enable.mockResolvedValue({ ok: true, failure: null, coords: FIX });
    expect(await askForProLocation()).toEqual({ status: "ok", coords: FIX });
    expect(enable).toHaveBeenCalledTimes(1);
  });

  it("reports 'off' when the Pro says no to the sheet", async () => {
    request.mockResolvedValue({ ok: false, failure: "location-disabled", coords: null });
    enable.mockResolvedValue({ ok: false, failure: "location-disabled", coords: null });
    expect((await askForProLocation()).status).toBe("off");
  });
});

describe("the banner", () => {
  it("speaks up for off, denied and unasked, and not for a slow fix or a good one", () => {
    expect(locationNeedsAttention("off")).toBe(true);
    expect(locationNeedsAttention("denied")).toBe(true);
    expect(locationNeedsAttention("prompt")).toBe(true);
    expect(locationNeedsAttention("unknown")).toBe(false);
    expect(locationNeedsAttention("ok")).toBe(false);
    expect(locationNeedsAttention(null)).toBe(false);
  });

  it("sends a denied Pro to Settings, since Android won't ask again", () => {
    expect(locationWarning("denied").detail).toMatch(/settings/i);
    expect(locationWarning("off").title).toBe("Location is off");
  });
});
