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

const getCurrentPosition = vi.fn();
const permissionsQuery = vi.fn();

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
  permissionsQuery.mockResolvedValue({ state: "prompt" });
  vi.stubGlobal("navigator", {
    geolocation: { getCurrentPosition },
    permissions: { query: permissionsQuery },
  });
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
    const p = props();
    render(<LocationGate {...p} />);
    await screen.findByRole("button", { name: /enable/i });

    // Rendering must not ask. The OS dialog is one-shot on Android, and
    // spending it without the user asking is how a denial happens.
    expect(getCurrentPosition).not.toHaveBeenCalled();

    getCurrentPosition.mockImplementation((ok) =>
      ok({ coords: { latitude: 18.5204, longitude: 73.8567 } }),
    );
    await userEvent.click(screen.getByRole("button", { name: /enable/i }));

    expect(p.onUseCurrent).toHaveBeenCalledWith(18.5204, 73.8567);
  });

  it("is disabled when permission is denied, rather than doing nothing", async () => {
    // Android will not ask twice. An enabled button here is a button that
    // silently fails, and it gets tapped repeatedly.
    render(<LocationGate {...props({ reason: "permission-denied" })} />);

    await vi.waitFor(() => expect(screen.getByRole("button", { name: /enable/i })).toBeDisabled());
    expect(screen.getByText(/turn this on in settings/i)).toBeInTheDocument();
  });

  it("explains where to fix a denial rather than looping", async () => {
    getCurrentPosition.mockImplementation((_ok, fail) => fail({ code: 1 }));
    render(<LocationGate {...props()} />);

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
    const p = props({ saved: [HOME] });
    render(<LocationGate {...p} />);

    await userEvent.click(await screen.findByRole("button", { name: /somewhere else/i }));

    expect(p.onEnterManually).toHaveBeenCalledOnce();
  });

  it("is offered when there are none", async () => {
    const p = props({ saved: [] });
    render(<LocationGate {...p} />);

    await userEvent.click(await screen.findByRole("button", { name: /enter location manually/i }));

    expect(p.onEnterManually).toHaveBeenCalledOnce();
  });

  it("survives a denied permission with nothing saved", async () => {
    // The reason a blocking screen is safe at all. This user cannot use Enable
    // (Android will not re-ask) and has no saved location to tap. Without this
    // path they would be locked out of the app permanently.
    const p = props({ reason: "permission-denied", saved: [] });
    render(<LocationGate {...p} />);

    const manual = await screen.findByRole("button", { name: /enter location manually/i });
    expect(manual).toBeEnabled();

    await userEvent.click(manual);
    expect(p.onEnterManually).toHaveBeenCalledOnce();
  });
});
