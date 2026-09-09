/**
 * The locate-me button on the map picker (SVC-281).
 *
 * This component is mocked out by every other test in the suite, which is how
 * it shipped a `alert()` — on Android a **native modal that blocks the entire
 * WebView** until someone taps OK. Found on a device: the map sat frozen behind
 * an unanswered dialog, and nothing on screen responded.
 *
 * The tests below cover the button's three failure paths rather than the map
 * itself. Leaflet is stubbed because jsdom has no layout for it to measure, and
 * the map is not what broke.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// Hoisted: vi.mock is lifted above the file, so a plain const would not exist
// yet when the factory runs.
const { toastError } = vi.hoisted(() => ({ toastError: vi.fn() }));
vi.mock("sonner", () => ({ toast: { error: toastError, success: vi.fn() } }));

// Leaflet needs real layout; jsdom has none, and none of it is under test here.
vi.mock("react-leaflet", () => ({
  MapContainer: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
  TileLayer: () => null,
  useMapEvents: () => null,
  useMap: () => ({
    setView: vi.fn(),
    flyTo: vi.fn(),
    getZoom: () => 16,
    getCenter: () => ({ lat: 0, lng: 0 }),
  }),
}));

const getCurrentPosition = vi.fn();

import { MapPicker } from "@/components/MapPicker";

/** Geolocation error codes, as the real PositionError carries them. */
const DENIED = { code: 1, PERMISSION_DENIED: 1 };
const TIMED_OUT = { code: 3, PERMISSION_DENIED: 1 };

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("navigator", { geolocation: { getCurrentPosition } });
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ json: async () => ({ display_name: "" }) }));
  // If this is ever called the test must fail loudly: a native dialog freezes
  // the whole WebView, which is the bug this file exists for.
  vi.stubGlobal(
    "alert",
    vi.fn(() => {
      throw new Error("alert() blocks the entire WebView — use a toast");
    }),
  );
});

function renderPicker() {
  return render(<MapPicker onLocationSelected={vi.fn()} />);
}

describe("when the location cannot be read", () => {
  it("reports a denial without freezing the app", async () => {
    getCurrentPosition.mockImplementation((_ok, fail) => fail(DENIED));
    renderPicker();

    await userEvent.click(screen.getByRole("button", { name: /use my current location/i }));

    // A toast, not alert(). The distinction is the whole point: alert() is a
    // native modal that blocks every other interaction until dismissed.
    expect(toastError).toHaveBeenCalledWith(expect.stringMatching(/turn it on in settings/i));
  });

  it("says something different when the position simply failed", async () => {
    // Naming the cause matters: "turn on location" is useless advice to
    // someone who denied the permission, and vice versa.
    getCurrentPosition.mockImplementation((_ok, fail) => fail(TIMED_OUT));
    renderPicker();

    await userEvent.click(screen.getByRole("button", { name: /use my current location/i }));

    expect(toastError).toHaveBeenCalledWith(expect.stringMatching(/move the pin/i));
    expect(toastError).not.toHaveBeenCalledWith(expect.stringMatching(/settings/i));
  });

  it("stops the spinner, so the button can be used again", async () => {
    getCurrentPosition.mockImplementation((_ok, fail) => fail(TIMED_OUT));
    renderPicker();

    const button = screen.getByRole("button", { name: /use my current location/i });
    await userEvent.click(button);

    await vi.waitFor(() => expect(button).toBeEnabled());
  });
});

describe("the request itself", () => {
  it("is bounded by a timeout", async () => {
    // Android does not fail fast when the OS location toggle is off — it never
    // answers at all (measured: still silent at 20s; see
    // useLocationAvailability). Without a timeout neither callback ever runs
    // and "Locating…" spins forever.
    getCurrentPosition.mockImplementation(() => {});
    renderPicker();

    await userEvent.click(screen.getByRole("button", { name: /use my current location/i }));

    const options = getCurrentPosition.mock.calls[0][2];
    expect(options?.timeout).toBeGreaterThan(0);
  });
});

describe("on a device with no geolocation at all", () => {
  it("says so instead of leaving a dead button", async () => {
    // This used to fall through the `if` entirely: no call, no message, and
    // the spinner state never reset.
    vi.stubGlobal("navigator", {});
    renderPicker();

    await userEvent.click(screen.getByRole("button", { name: /use my current location/i }));

    expect(toastError).toHaveBeenCalledWith(expect.stringMatching(/isn't available/i));
  });
});
