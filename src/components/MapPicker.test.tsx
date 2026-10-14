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
//
// SVC-357: capture the TileLayer's `eventHandlers` prop so a test can
// trigger `tileerror` without a real tile load. The real react-leaflet
// TileLayer forwards event handlers to the underlying Leaflet tile layer,
// which we cannot drive from jsdom — so we drive the handler directly
// through the captured prop.
const tileLayerProps: { eventHandlers?: { tileerror?: () => void } } = {};
vi.mock("react-leaflet", () => ({
  MapContainer: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
  TileLayer: (props: { eventHandlers?: { tileerror?: () => void } }) => {
    tileLayerProps.eventHandlers = props.eventHandlers;
    return null;
  },
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
//
// SVC-357: `requestLocation` is the shared path to the native plugin on native
// and the web `GeolocationPositionError` fallback on web — the picker calls it
// in place of `navigator.geolocation.getCurrentPosition`. Mocked here so each
// test can mint its own `LocationResult` without reaching the real plugin.
const { isNativeLocation, requestLocation } = vi.hoisted(() => ({
  isNativeLocation: vi.fn().mockReturnValue(true),
  requestLocation: vi.fn(),
}));
vi.mock("@/lib/geolocation", () => ({ isNativeLocation, requestLocation }));

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

// SVC-357: `useOnlineStatus` reads `navigator.onLine`, which jsdom defaults to
// `true`. Mocked so individual tests can simulate offline without having to
// stub-and-restore the global between tests.
const { useOnlineStatus } = vi.hoisted(() => ({
  useOnlineStatus: vi.fn().mockReturnValue(true),
}));
vi.mock("@/hooks/useOnlineStatus", () => ({ useOnlineStatus }));

import { MapPicker } from "@/components/MapPicker";

/** The shape `requestLocation` returns — see `lib/geolocation.ts`. */
const DENIED_RESULT = { ok: false, failure: "permission-denied", coords: null } as const;
const TIMED_OUT_RESULT = { ok: false, failure: "timeout", coords: null } as const;
const DISABLED_RESULT = { ok: false, failure: "location-disabled", coords: null } as const;
const UNAVAILABLE_RESULT = { ok: false, failure: "unavailable", coords: null } as const;

beforeEach(() => {
  vi.clearAllMocks();
  // clearAllMocks drops the return value too, so re-assert the defaults.
  isNativeLocation.mockReturnValue(true);
  canOpenAppSettings.mockReturnValue(true);
  reverseGeocode.mockResolvedValue({ formattedAddress: "", components: [] });
  useOnlineStatus.mockReturnValue(true);
  requestLocation.mockResolvedValue(UNAVAILABLE_RESULT);
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
    requestLocation.mockResolvedValue(DENIED_RESULT);
    renderPicker();

    await userEvent.click(screen.getByRole("button", { name: /use my current location/i }));

    // A toast, not alert(). The distinction is the whole point: alert() is a
    // native modal that blocks every other interaction until dismissed.
    await vi.waitFor(() =>
      expect(toastError).toHaveBeenCalledWith(expect.stringMatching(/turn it on in settings/i)),
    );
  });

  it("names both remedies on web, where the two causes are one error", async () => {
    // This screen is the gate's "Enter address manually" escape hatch, so a
    // blocked user lands here next. The browser rejects a switched-off OS
    // toggle with PERMISSION_DENIED exactly as it does a refusal, so pointing
    // only at the app permission would strand them twice (SVC-318).
    isNativeLocation.mockReturnValue(false);
    requestLocation.mockResolvedValue(DENIED_RESULT);
    renderPicker();

    await userEvent.click(screen.getByRole("button", { name: /use my current location/i }));

    await vi.waitFor(() =>
      expect(toastError).toHaveBeenCalledWith(
        expect.stringMatching(/Location is on in your settings and allowed for this site/i),
      ),
    );
  });

  it("says something different when the position simply failed", async () => {
    // Naming the cause matters: "turn on location" is useless advice to
    // someone who denied the permission, and vice versa.
    requestLocation.mockResolvedValue(TIMED_OUT_RESULT);
    renderPicker();

    await userEvent.click(screen.getByRole("button", { name: /use my current location/i }));

    await vi.waitFor(() =>
      expect(toastError).toHaveBeenCalledWith(expect.stringMatching(/move the pin/i)),
    );
    expect(toastError).not.toHaveBeenCalledWith(expect.stringMatching(/settings/i));
  });

  it("names the device-off remedy separately from a permission denial (SVC-179)", async () => {
    // SVC-357: `requestLocation` returns `location-disabled` as its own
    // failure on native, distinct from `permission-denied`. The copy must
    // name the OS Location toggle, not the app permission — sending someone
    // whose GPS is off to the EazyServ settings page strands them twice.
    requestLocation.mockResolvedValue(DISABLED_RESULT);
    renderPicker();

    await userEvent.click(screen.getByRole("button", { name: /use my current location/i }));

    await vi.waitFor(() =>
      expect(toastError).toHaveBeenCalledWith(
        expect.stringMatching(/phone's location is off/i),
      ),
    );
    // Also the SVC-356 deeplink must not appear — Settings is the wrong
    // remedy for a disabled OS toggle. See the deeplink describe below.
    expect(screen.queryByRole("button", { name: /open settings/i })).toBeNull();
  });

  it("stops the spinner, so the button can be used again", async () => {
    requestLocation.mockResolvedValue(TIMED_OUT_RESULT);
    renderPicker();

    const button = screen.getByRole("button", { name: /use my current location/i });
    await userEvent.click(button);

    await vi.waitFor(() => expect(button).toBeEnabled());
  });
});

describe("the request itself", () => {
  it("is bounded by the shared timeout constant (SVC-357)", async () => {
    // Android does not fail fast when the OS location toggle is off — it
    // never answers at all (measured: still silent at 20s; see
    // useLocationAvailability). The shared `MAP_PICKER_LOCATE_TIMEOUT_MS`
    // is the bound; a bare call with no timeout would spin "Locating…"
    // forever.
    requestLocation.mockResolvedValue(TIMED_OUT_RESULT);
    renderPicker();

    await userEvent.click(screen.getByRole("button", { name: /use my current location/i }));

    await vi.waitFor(() => expect(requestLocation).toHaveBeenCalled());
    const timeoutArg = requestLocation.mock.calls[0][0];
    expect(timeoutArg).toBeGreaterThan(0);
  });
});

describe("on a device with no geolocation at all", () => {
  it("says so instead of leaving a dead button", async () => {
    // `requestLocation` returns `unavailable` on a device without geolocation
    // (no Capacitor plugin, no `navigator.geolocation`). The toast still has
    // to fire, otherwise the button sits dead with no explanation.
    requestLocation.mockResolvedValue(UNAVAILABLE_RESULT);
    renderPicker();

    await userEvent.click(screen.getByRole("button", { name: /use my current location/i }));

    await vi.waitFor(() =>
      expect(toastError).toHaveBeenCalledWith(expect.stringMatching(/move the pin/i)),
    );
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
    requestLocation.mockResolvedValue(DENIED_RESULT);
    renderPicker();

    await userEvent.click(screen.getByRole("button", { name: /use my current location/i }));

    // Keyboard-focusable `<Button>`, not a sonner action baked into a toast
    // that may have dismissed by the time the user decides to tap.
    expect(await screen.findByRole("button", { name: /open settings/i })).toBeEnabled();
  });

  it("deeplinks to the OS settings page when tapped", async () => {
    requestLocation.mockResolvedValue(DENIED_RESULT);
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
    requestLocation.mockResolvedValue(DENIED_RESULT);
    renderPicker();

    await userEvent.click(screen.getByRole("button", { name: /use my current location/i }));

    // The toast still fires with the web-flavoured copy; only the button hides.
    await vi.waitFor(() => expect(toastError).toHaveBeenCalled());
    expect(screen.queryByRole("button", { name: /open settings/i })).toBeNull();
  });

  it("stays hidden when the failure is not a denial", async () => {
    // A timeout is not a permission problem — Settings cannot fix it, so the
    // button would mis-name the remedy. The toast already handles this case.
    requestLocation.mockResolvedValue(TIMED_OUT_RESULT);
    renderPicker();

    await userEvent.click(screen.getByRole("button", { name: /use my current location/i }));

    await vi.waitFor(() => expect(toastError).toHaveBeenCalled());
    expect(screen.queryByRole("button", { name: /open settings/i })).toBeNull();
  });
});

/**
 * SVC-357: offline-while-open and tileerror affordances.
 *
 * A user who drops offline *while* inside the map picker previously saw
 * "Fetching location…" → `GEOCODE_FAILED`, with no explanation that the
 * problem was the connection and not the pin. The sheet now skips the
 * reverse-geocode when offline and renders an inline "You're offline" row
 * that promises to resolve the address on reconnect.
 *
 * `tileerror` sits beside it: an OSM CDN block renders a silent grey grid at
 * every zoom level, and `TileLayer`'s event handler is where a one-shot toast
 * belongs — once per sheet-open, guarded by a ref so a thousand missing tiles
 * do not light up a thousand toasts.
 */
describe("offline-while-open (SVC-357)", () => {
  it("skips the reverse-geocode when offline on mount", async () => {
    useOnlineStatus.mockReturnValue(false);
    renderPicker();

    // The initial fetchAddress on mount must bail out; `reverseGeocode` is the
    // round-trip we promised not to make when there is no network to serve it.
    await vi.waitFor(() =>
      expect(screen.getByText(/you're offline/i)).toBeInTheDocument(),
    );
    expect(reverseGeocode).not.toHaveBeenCalled();
  });

  it("shows the in-sheet affordance when offline, not GEOCODE_FAILED", async () => {
    useOnlineStatus.mockReturnValue(false);
    renderPicker();

    // The promised copy — the user needs to know (a) they are offline and
    // (b) that dropping the pin is still a useful thing to do.
    expect(await screen.findByText(/you're offline/i)).toBeInTheDocument();
    expect(screen.getByText(/we'll resolve the address when you reconnect/i)).toBeInTheDocument();
  });
});

describe("the tileerror toast (SVC-357)", () => {
  it("fires once even if dozens of tiles fail", async () => {
    // An OSM CDN block renders a silent grey grid at every zoom level —
    // `tileerror` can fire hundreds of times in a session. One toast is the
    // ceiling, enforced by a per-mount ref on the component.
    renderPicker();

    expect(tileLayerProps.eventHandlers?.tileerror).toBeDefined();

    tileLayerProps.eventHandlers?.tileerror?.();
    tileLayerProps.eventHandlers?.tileerror?.();
    tileLayerProps.eventHandlers?.tileerror?.();

    const matching = toastError.mock.calls.filter(([msg]) =>
      typeof msg === "string" && /map tiles aren't loading/i.test(msg),
    );
    expect(matching).toHaveLength(1);
  });

  it("re-arms the toast on a fresh sheet-open (fresh mount)", () => {
    // The ref lives on the component instance, so unmount + remount is a
    // fresh sheet-open and the ceiling resets. A user who closes the sheet,
    // reconnects, re-opens, and still hits the block deserves to be told
    // again that it is still broken.
    const first = render(<MapPicker onLocationSelected={vi.fn()} />);
    tileLayerProps.eventHandlers?.tileerror?.();
    first.unmount();

    render(<MapPicker onLocationSelected={vi.fn()} />);
    tileLayerProps.eventHandlers?.tileerror?.();

    const matching = toastError.mock.calls.filter(([msg]) =>
      typeof msg === "string" && /map tiles aren't loading/i.test(msg),
    );
    expect(matching).toHaveLength(2);
  });
});
