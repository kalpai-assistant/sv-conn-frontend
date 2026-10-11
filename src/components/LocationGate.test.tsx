/**
 * The gate shown when we cannot locate the user (SVC-281).
 *
 * Three properties are load-bearing and all three are easy to erode later:
 *
 * 1. **The copy names the actual problem.** Three states have three different
 *    remedies, and sending someone to the wrong settings screen wastes their
 *    time.
 * 2. **Enable is disabled when permission is denied.** Android will not ask
 *    twice, so an enabled button would silently do nothing — and get tapped
 *    repeatedly until the user concludes the app is broken.
 * 3. **Manual entry is always available.** Without it a blocking screen strands
 *    anyone who declined the OS permission, which on Android cannot be
 *    re-requested. That would lock a user out of the app entirely.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const requestLocation = vi.fn();
const enableDeviceLocation = vi.fn();
const peekLocationPermission = vi.fn();
const isNativeLocation = vi.fn();
const peekBrowserPermission = vi.fn();

vi.mock("@/lib/geolocation", () => ({
  requestLocation: (...a: unknown[]) => requestLocation(...a),
  enableDeviceLocation: (...a: unknown[]) => enableDeviceLocation(...a),
  peekLocationPermission: () => peekLocationPermission(),
  isNativeLocation: () => isNativeLocation(),
  peekBrowserPermission: () => peekBrowserPermission(),
}));

import { LocationGate } from "@/components/LocationGate";

const HOME = { id: "a1", label: "Karve Nagar", full: "Lane Number 7, Karve Nagar, Pune" };
const WORK = { id: "a2", label: "Kothrud", full: "Paud Road, Kothrud, Pune" };

function props(over: Partial<Parameters<typeof LocationGate>[0]> = {}) {
  return {
    reason: "device-off" as const,
    saved: [],
    onConfirmSaved: vi.fn(),
    onUseCurrent: vi.fn(),
    onEnterManually: vi.fn(),
    ...over,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  // Native by default: the existing cases below were all written against the
  // plugin's behaviour. The web differences get their own describe block.
  isNativeLocation.mockReturnValue(true);
  peekLocationPermission.mockResolvedValue("prompt");
  peekBrowserPermission.mockResolvedValue(null);
  requestLocation.mockResolvedValue({ ok: false, failure: "unavailable", coords: null });
  enableDeviceLocation.mockResolvedValue({ ok: false, failure: "location-disabled", coords: null });
});

describe("naming the actual problem", () => {
  it("blames the device toggle when that is what is off", async () => {
    render(<LocationGate {...props({ reason: "device-off" })} />);

    // Not "allow location for this app" — that would send them to a screen
    // where the app permission already looks correct, and the real toggle is
    // somewhere else entirely.
    expect(await screen.findByText(/your device location is off/i)).toBeInTheDocument();
  });

  it("blames the app permission when that is what is off", async () => {
    render(<LocationGate {...props({ reason: "permission-prompt" })} />);

    expect(await screen.findByText(/location permission is off/i)).toBeInTheDocument();
  });

  it("falls back to a neutral question when the cause is unknown", async () => {
    render(<LocationGate {...props({ reason: "unknown" })} />);

    // Guessing wrong is worse than admitting we do not know: naming a fix that
    // is not the problem sends the user somewhere pointless.
    expect(await screen.findByText(/where are you\?/i)).toBeInTheDocument();
  });

  it("lets a caller override the headline entirely", async () => {
    // The provider gate has something more useful to say when the real problem
    // is a missing service area rather than a location toggle.
    render(<LocationGate {...props({ title: "Set your service area" })} />);

    expect(await screen.findByText("Set your service area")).toBeInTheDocument();
    expect(screen.queryByText(/your device location is off/i)).not.toBeInTheDocument();
  });
});

describe("the Enable button", () => {
  it("prompts only when tapped", async () => {
    // permission-prompt, not the default device-off: this is about the app
    // permission dialog, which requestLocation raises. device-off takes the
    // other branch entirely (see the enable-location test below).
    const p = props({ reason: "permission-prompt" });
    render(<LocationGate {...p} />);
    await screen.findByRole("button", { name: /enable/i });

    // Rendering must not ask. The OS dialog is one-shot on Android, and
    // spending it without the user asking is how a denial happens — which is
    // why the launch check peeks rather than requests, and only this tap
    // reaches requestLocation.
    expect(requestLocation).not.toHaveBeenCalled();

    requestLocation.mockResolvedValue({
      ok: true,
      failure: null,
      coords: { lat: 18.5204, lng: 73.8567 },
    });
    await userEvent.click(screen.getByRole("button", { name: /enable/i }));

    await vi.waitFor(() => expect(p.onUseCurrent).toHaveBeenCalledWith(18.5204, 73.8567));
  });

  it("offers to turn location on when that is what is off", async () => {
    // SVC-283. With the OS toggle off, `requestLocation` is useless: the plugin
    // refuses every one of its calls with LOCATION_DISABLED, which is why
    // Enable used to dead-end at "couldn't get your location".
    // `enableDeviceLocation` reaches Play Services' settings check instead and
    // raises the "Turn on" dialog. Taking the wrong branch here silently
    // restores the dead end.
    const p = props({ reason: "device-off" });
    enableDeviceLocation.mockResolvedValue({
      ok: true,
      failure: null,
      coords: { lat: 18.5204, lng: 73.8567 },
    });
    render(<LocationGate {...p} />);

    await userEvent.click(await screen.findByRole("button", { name: /enable/i }));

    expect(enableDeviceLocation).toHaveBeenCalled();
    expect(requestLocation).not.toHaveBeenCalled();
    await vi.waitFor(() => expect(p.onUseCurrent).toHaveBeenCalledWith(18.5204, 73.8567));
  });

  it("asks again when the GPS has not caught up yet", async () => {
    // Found on device: "Turn on" flipped the toggle, and the very next read
    // timed out because the GPS had not acquired — so the gate stayed up over
    // a phone whose location now worked. Turning location on is not the same
    // as having a position.
    const p = props({ reason: "device-off" });
    enableDeviceLocation.mockResolvedValue({ ok: false, failure: "timeout", coords: null });
    requestLocation.mockResolvedValue({
      ok: true,
      failure: null,
      coords: { lat: 18.5204, lng: 73.8567 },
    });
    render(<LocationGate {...p} />);

    await userEvent.click(await screen.findByRole("button", { name: /enable/i }));

    await vi.waitFor(() => expect(p.onUseCurrent).toHaveBeenCalledWith(18.5204, 73.8567));
  });

  it("stays usable when the user declines turning location on", async () => {
    // Declining is not a denial of the app's permission, so Enable must remain
    // tappable — raising the dialog again is exactly what should work.
    enableDeviceLocation.mockResolvedValue({
      ok: false,
      failure: "location-disabled",
      coords: null,
    });
    render(<LocationGate {...props({ reason: "device-off" })} />);

    await userEvent.click(await screen.findByRole("button", { name: /enable/i }));

    await vi.waitFor(() => expect(screen.getByRole("button", { name: /enable/i })).toBeEnabled());
  });

  it("is disabled when permission is denied, rather than doing nothing", async () => {
    // Android will not ask twice. An enabled button here is a button that
    // silently fails, and it gets tapped repeatedly.
    render(<LocationGate {...props({ reason: "permission-denied" })} />);

    await vi.waitFor(() => expect(screen.getByRole("button", { name: /enable/i })).toBeDisabled());
    expect(screen.getByText(/turn this on in settings/i)).toBeInTheDocument();
  });

  it("explains where to fix a denial rather than looping", async () => {
    requestLocation.mockResolvedValue({ ok: false, failure: "permission-denied", coords: null });
    render(<LocationGate {...props({ reason: "permission-prompt" })} />);

    await userEvent.click(await screen.findByRole("button", { name: /enable/i }));

    // "Try again" would be a lie — the OS will not ask a second time.
    expect(await screen.findByText(/turn it on in settings/i)).toBeInTheDocument();
  });
});

describe("saved locations", () => {
  it("lists every one, so the common case is a single tap", async () => {
    // "Location is off but I'm at home" is the case Zepto's sheet handles in
    // one tap. Showing only the selected address would force a map on someone
    // whose answer is already on file.
    render(<LocationGate {...props({ saved: [HOME, WORK] })} />);

    expect(await screen.findByText("Karve Nagar")).toBeInTheDocument();
    expect(screen.getByText("Kothrud")).toBeInTheDocument();
  });

  it("reports which one was picked", async () => {
    const p = props({ saved: [HOME, WORK] });
    render(<LocationGate {...p} />);

    await userEvent.click(await screen.findByText("Kothrud"));

    // The id, not the index — the caller has to know which address to select.
    expect(p.onConfirmSaved).toHaveBeenCalledWith("a2");
    // Already stored and already known: picking one is a selection, not a write.
    expect(p.onUseCurrent).not.toHaveBeenCalled();
  });

  it("shows no list when there is nothing saved", async () => {
    render(<LocationGate {...props({ saved: [] })} />);

    await screen.findByRole("button", { name: /enable/i });
    expect(screen.queryByText(/saved locations/i)).not.toBeInTheDocument();
  });
});

describe("the exit that needs no permission", () => {
  it("is offered when there are saved locations", async () => {
    // Same name whether or not anything is saved (SVC-287). It used to read
    // "Somewhere else" here — which described where the user was going rather
    // than what they would do, and was the branch anyone with a saved address
    // actually saw, so the earlier rename shipped to nobody.
    const p = props({ saved: [HOME] });
    render(<LocationGate {...p} />);

    await userEvent.click(await screen.findByRole("button", { name: /enter address manually/i }));

    expect(p.onEnterManually).toHaveBeenCalledOnce();
  });

  it("is offered when there are none", async () => {
    const p = props({ saved: [] });
    render(<LocationGate {...p} />);

    await userEvent.click(await screen.findByRole("button", { name: /enter address manually/i }));

    expect(p.onEnterManually).toHaveBeenCalledOnce();
  });

  it("survives a denied permission with nothing saved", async () => {
    // The reason a blocking screen is safe at all. This user cannot use Enable
    // (Android will not re-ask) and has no saved location to tap. Without this
    // path they would be locked out of the app permanently.
    const p = props({ reason: "permission-denied", saved: [] });
    render(<LocationGate {...p} />);

    const manual = await screen.findByRole("button", { name: /enter address manually/i });
    expect(manual).toBeEnabled();

    await userEvent.click(manual);
    expect(p.onEnterManually).toHaveBeenCalledOnce();
  });
});

describe("the saved list (SVC-287)", () => {
  it("marks only the address in use", async () => {
    // It used to draw a check on every row, which tells the user nothing: if
    // all three are ticked, none of them is the answer to "which one is on".
    render(
      <LocationGate
        {...props({
          saved: [
            { ...HOME, isSelected: true },
            { ...WORK, isSelected: false },
          ],
        })}
      />,
    );

    expect(await screen.findAllByText(/in use/i)).toHaveLength(1);
  });

  it("does not trail rows with a check or a chevron", async () => {
    // A chevron promises a screen that never opens — tapping a row selects and
    // dismisses. A permanent check reads as "already done". The badge above
    // says which is active; the row itself stays the tap target.
    render(<LocationGate {...props({ saved: [HOME] })} />);

    const row = await screen.findByText("Karve Nagar");
    expect(row.closest("button")?.querySelector("svg")).toBeTruthy(); // the leading icon
    expect(screen.queryByText(/in use/i)).toBeNull(); // nothing selected here
  });

  it("names the section by what it is for", async () => {
    render(<LocationGate {...props({ saved: [HOME] })} />);

    expect(await screen.findByText(/select from saved locations/i)).toBeInTheDocument();
  });

  it("offers See all only when the caller has a list to open", async () => {
    // The provider gate has a single service area, not a list, so it passes no
    // handler and the control does not render.
    const p = props({ saved: [HOME], onSeeAll: vi.fn() });
    render(<LocationGate {...p} />);

    await userEvent.click(await screen.findByRole("button", { name: /see all/i }));
    expect(p.onSeeAll).toHaveBeenCalledOnce();
  });

  it("hides See all when there is nowhere to send them", async () => {
    render(<LocationGate {...props({ saved: [HOME] })} />);

    await screen.findByText("Karve Nagar");
    expect(screen.queryByRole("button", { name: /see all/i })).toBeNull();
  });
});

/**
 * The PWA behaves differently in two ways, and both were user-reported
 * (SVC-318). Neither is reachable on native, so both need their own cases.
 */
describe("on the web", () => {
  beforeEach(() => {
    isNativeLocation.mockReturnValue(false);
  });

  it("names both remedies for a denial, because the toggle is indistinguishable", () => {
    render(<LocationGate {...props({ reason: "permission-denied" })} />);

    // Chrome reports a switched-off OS toggle as PERMISSION_DENIED with
    // `permissions.query` still "prompt", so naming only the site permission
    // would send half of these users to the wrong place.
    expect(
      screen.getByText(/Location is on in your phone's settings and allowed for this site/i),
    ).toBeInTheDocument();
  });

  it("keeps Enable usable when denied", () => {
    render(<LocationGate {...props({ reason: "permission-denied" })} />);

    // Still labelled "Enable" — the word names what the button does, and one
    // label across platforms is one less thing to explain (SVC-319).
    const button = screen.getByRole("button", { name: /enable/i });
    // A browser denial is reversible from the site's own permission menu, and
    // the user returns to this very page — so the button has to stay live.
    expect(button).toBeEnabled();
    // The banner above names which of the two causes applies; this line only
    // says what to do next, so it cannot contradict it.
    expect(screen.getByText(/Fix the above, then tap Enable/i)).toBeInTheDocument();
  });

  it("still disables Enable when denied on native", () => {
    isNativeLocation.mockReturnValue(true);
    render(<LocationGate {...props({ reason: "permission-denied" })} />);

    // Android will not ask twice; an enabled button would do nothing.
    expect(screen.getByRole("button", { name: /enable/i })).toBeDisabled();
  });
});

/**
 * SVC-351: offline branch replaces the normal choices.
 *
 * Everything the usual gate offers assumes the network: "Enable" has to
 * reverse-geocode on success, "Enter address manually" opens a map that
 * fetches tiles, and the saved list is empty by definition in this branch
 * (we were sent here because the address fetch did not resolve). A spinner
 * is the exact failure mode SVC-351 is replacing, so this view is
 * synchronous — honest message, Try again button, and nothing to await.
 */
describe("the offline branch", () => {
  it("replaces the normal screen with an offline message", () => {
    render(<LocationGate {...props({ offline: true })} />);

    expect(screen.getByText(/you're offline/i)).toBeInTheDocument();
    // None of the usual choices: each would call network and fail in a
    // different silent way. The offline screen names the problem instead.
    expect(screen.queryByRole("button", { name: /enable/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /enter address manually/i })).toBeNull();
  });

  it("renders no spinner — a spinner is what this ticket exists to kill", () => {
    render(<LocationGate {...props({ offline: true })} />);

    // The SVG icon under "You're offline" is the WifiOff glyph, so there is
    // an svg on screen — but nothing with the Loader2 animate-spin class.
    const spinners = document.querySelectorAll(".animate-spin");
    expect(spinners.length).toBe(0);
  });

  it("offers a Try again that the caller wires to the retry", async () => {
    const onRetry = vi.fn();
    render(<LocationGate {...props({ offline: true, onRetry })} />);

    await userEvent.click(screen.getByRole("button", { name: /try again/i }));
    expect(onRetry).toHaveBeenCalledOnce();
  });

  it("omits Try again when the caller has no retry to offer", () => {
    // The provider gate has nothing meaningful to re-run here (it has no
    // backend address list to re-fetch), so it leaves onRetry unset — and
    // a dead button is worse than no button.
    render(<LocationGate {...props({ offline: true })} />);

    expect(screen.queryByRole("button", { name: /try again/i })).toBeNull();
  });
});

/**
 * Two causes, one error code, and only the tap tells them apart.
 *
 * The web reports a switched-off device location and a user's refusal
 * identically. Measured on an iPhone: the system refusal came back in 6ms with
 * nothing shown, where a real prompt-and-answer took ~1500ms. That gap is the
 * only available signal, so it picks which remedy the copy names — and it only
 * runs after a tap, because before one there is no evidence at all.
 */
describe("after a tap that the browser refused", () => {
  beforeEach(() => {
    isNativeLocation.mockReturnValue(false);
  });

  it("blames the device switch when the browser still reports no decision", async () => {
    // Location Services off: the browser was never asked, so nothing was
    // recorded. Measured on an iPhone — this reads "prompt" even though the
    // call was just refused.
    requestLocation.mockResolvedValue({
      ok: false,
      failure: "permission-denied",
      coords: null,
      refusedInstantly: true,
    });
    peekBrowserPermission.mockResolvedValue("prompt");

    render(<LocationGate {...props({ reason: "unknown" })} />);
    await userEvent.click(screen.getByRole("button", { name: /enable/i }));

    expect(await screen.findByText(/Location Services in Settings/i)).toBeInTheDocument();
  });

  it("blames the site permission when the browser recorded a refusal", async () => {
    // Safari refuses a previously-denied site from memory, just as fast as a
    // switched-off device — so the timing says "instant" here too. The stored
    // permission is what separates them.
    requestLocation.mockResolvedValue({
      ok: false,
      failure: "permission-denied",
      coords: null,
      refusedInstantly: true,
    });
    peekBrowserPermission.mockResolvedValue("denied");

    render(<LocationGate {...props({ reason: "unknown" })} />);
    await userEvent.click(screen.getByRole("button", { name: /enable/i }));

    expect(await screen.findByText(/blocked for this site/i)).toBeInTheDocument();
  });

  it("falls back to the timing where there is no Permissions API", async () => {
    requestLocation.mockResolvedValue({
      ok: false,
      failure: "permission-denied",
      coords: null,
      refusedInstantly: false,
    });
    peekBrowserPermission.mockResolvedValue(null);

    render(<LocationGate {...props({ reason: "unknown" })} />);
    await userEvent.click(screen.getByRole("button", { name: /enable/i }));

    expect(await screen.findByText(/blocked for this site/i)).toBeInTheDocument();
  });

  it("keeps the native wording on a real device", async () => {
    // Native has distinct error codes and needs no heuristic.
    isNativeLocation.mockReturnValue(true);
    requestLocation.mockResolvedValue({
      ok: false,
      failure: "permission-denied",
      coords: null,
      refusedInstantly: true,
    });

    render(<LocationGate {...props({ reason: "unknown" })} />);
    await userEvent.click(screen.getByRole("button", { name: /enable/i }));

    expect(await screen.findByText(/Location is off for this app/i)).toBeInTheDocument();
  });
});
