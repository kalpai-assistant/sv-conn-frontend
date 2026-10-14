/**
 * The locate-me button on the map picker (SVC-281, SVC-284).
 *
 * This component is mocked out by every other test in the suite, which is how
 * it shipped a `alert()` — on Android a **native modal that blocks the entire
 * WebView** until someone taps OK. Found on a device: the map sat frozen behind
 * an unanswered dialog, and nothing on screen responded.
 *
 * The tests below cover the button's three failure paths rather than the map
 * itself. Leaflet is stubbed because jsdom has no layout for it to measure, and
 * the map is not what broke. Google Maps + PlacesSearchBar are stubbed too:
 * both would try to load the real SDK against a live key, which these tests
 * are not the place for (see google-maps.ts + PlacesSearchBar's own coverage).
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

// SVC-284: no live SDK load in tests. `reverseGeocode` returns a placeholder
// so the "Locating…" spinner resolves. Hoisted so the factory sees the same
// `vi.fn()` as the tests do — vi.mock lifts to the top of the file, ahead of
// any plain top-level const.
const { reverseGeocode } = vi.hoisted(() => ({
  reverseGeocode: vi.fn().mockResolvedValue({ formattedAddress: "", components: [] }),
}));
vi.mock("@/lib/google-maps", () => ({
  reverseGeocode,
}));

// SVC-318: the denial copy differs by platform, and importing the real module
// would pull in Capacitor. Native by default — the cases below were written
// against the plugin's wording; the web variant has its own test.
const { isNativeLocation } = vi.hoisted(() => ({
  isNativeLocation: vi.fn().mockReturnValue(true),
}));
vi.mock("@/lib/geolocation", () => ({ isNativeLocation }));

// SVC-356: the Open-settings deeplink is native-only. Mocked here so the
// denied-branch tests below can assert the button is shown or hidden, and
// that tapping it fires the deeplink without reaching the real plugin.
const { canOpenAppSettings, openAppSettings } = vi.hoisted(() => ({
  canOpenAppSettings: vi.fn().mockReturnValue(true),
  openAppSettings: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/lib/open-app-settings", () => ({ canOpenAppSettings, openAppSettings }));

// SVC-284: the search bar is its own unit, tested separately. Rendered here
// as an empty passthrough — the locate-me tests below only care that the map
// area renders and the button responds.
vi.mock("@/components/PlacesSearchBar", () => ({
  PlacesSearchBar: () => null,
}));

const getCurrentPosition = vi.fn();

import { MapPicker } from "@/components/MapPicker";

/** Geolocation error codes, as the real PositionError carries them. */
const DENIED = { code: 1, PERMISSION_DENIED: 1 };
const TIMED_OUT = { code: 3, PERMISSION_DENIED: 1 };

beforeEach(() => {
  vi.clearAllMocks();
  // clearAllMocks drops the return value too, so re-assert the default.
  isNativeLocation.mockReturnValue(true);
  canOpenAppSettings.mockReturnValue(true);
  reverseGeocode.mockResolvedValue({ formattedAddress: "", components: [] });
  vi.stubGlobal("navigator", { geolocation: { getCurrentPosition } });
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

  it("names both remedies on web, where the two causes are one error", async () => {
    // This screen is the gate's "Enter address manually" escape hatch, so a
    // blocked user lands here next. The browser rejects a switched-off OS
    // toggle with PERMISSION_DENIED exactly as it does a refusal, so pointing
    // only at the app permission would strand them twice (SVC-318).
    isNativeLocation.mockReturnValue(false);
    getCurrentPosition.mockImplementation((_ok, fail) => fail(DENIED));
    renderPicker();

    await userEvent.click(screen.getByRole("button", { name: /use my current location/i }));

    expect(toastError).toHaveBeenCalledWith(
      expect.stringMatching(/Location is on in your settings and allowed for this site/i),
    );
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

/**
 * SVC-356: the Open-settings deeplink.
 *
 * The toast on a denied permission names "Settings" as the remedy, but Settings
 * on Android is three to five taps away under the OEM skin and two under iOS,
 * so the button exists to make the remedy a single tap. Native-only — on web
 * there is no reliable deeplink to the browser's permission screen and a
 * button that goes nowhere strands the user harder than the toast's copy
 * already does.
 */
describe("the Open-settings deeplink (SVC-356)", () => {
  it("shows the button after a native denial", async () => {
    getCurrentPosition.mockImplementation((_ok, fail) => fail(DENIED));
    renderPicker();

    await userEvent.click(screen.getByRole("button", { name: /use my current location/i }));

    // Keyboard-focusable `<Button>`, not a sonner action baked into a toast
    // that may have dismissed by the time the user decides to tap.
    expect(await screen.findByRole("button", { name: /open settings/i })).toBeEnabled();
  });

  it("deeplinks to the OS settings page when tapped", async () => {
    getCurrentPosition.mockImplementation((_ok, fail) => fail(DENIED));
    renderPicker();

    await userEvent.click(screen.getByRole("button", { name: /use my current location/i }));
    await userEvent.click(await screen.findByRole("button", { name: /open settings/i }));

    // The helper picks the per-platform URL (`app-settings:` on iOS,
    // `package:com.eazyserv.app` on Android); the component only has to call
    // it. Keeping the per-URL assertion in `open-app-settings` would double-
    // mock the test without buying anything.
    expect(openAppSettings).toHaveBeenCalledOnce();
  });

  it("stays hidden on web, where no cross-browser settings deeplink exists", async () => {
    // Chrome has `chrome://settings/content/location`, which the URL bar
    // refuses to navigate to from a script; Safari has nothing comparable.
    // A button that goes nowhere is worse than the toast's existing copy.
    isNativeLocation.mockReturnValue(false);
    canOpenAppSettings.mockReturnValue(false);
    getCurrentPosition.mockImplementation((_ok, fail) => fail(DENIED));
    renderPicker();

    await userEvent.click(screen.getByRole("button", { name: /use my current location/i }));

    // The toast still fires with the web-flavoured copy; only the button hides.
    await vi.waitFor(() => expect(toastError).toHaveBeenCalled());
    expect(screen.queryByRole("button", { name: /open settings/i })).toBeNull();
  });

  it("stays hidden when the failure is not a denial", async () => {
    // A timeout is not a permission problem — Settings cannot fix it, so the
    // button would mis-name the remedy. The toast already handles this case.
    getCurrentPosition.mockImplementation((_ok, fail) => fail(TIMED_OUT));
    renderPicker();

    await userEvent.click(screen.getByRole("button", { name: /use my current location/i }));

    await vi.waitFor(() => expect(toastError).toHaveBeenCalled());
    expect(screen.queryByRole("button", { name: /open settings/i })).toBeNull();
  });
});
