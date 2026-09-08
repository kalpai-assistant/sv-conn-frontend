/**
 * The launch-time location question (SVC-281).
 *
 * This screen is the app's front door, and two of its properties are load-
 * bearing in ways that are easy to erode later:
 *
 * 1. **The confirm button names the place.** A returning user in the same city
 *    sees this daily. "Continue" would become a toll — tapped through unread
 *    within a week, and then tapped through on the one day they are in another
 *    city too. Naming the place is what forces the check.
 * 2. **Manual entry is always available.** Without it a blocking screen strands
 *    anyone who declined the OS permission, which on Android cannot be
 *    re-requested. That would lock a user out of the app entirely.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const getCurrentPosition = vi.fn();
const permissionsQuery = vi.fn();

import { LocationGate } from "@/components/LocationGate";

const SAVED = { label: "Karve Nagar", full: "Lane Number 7, Karve Nagar, Pune" };

function props(over: Partial<Parameters<typeof LocationGate>[0]> = {}) {
  return {
    title: "Where do you want your service?",
    subtitle: "Professionals are matched to your location.",
    saved: null,
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

describe("a returning user with a saved location", () => {
  it("names the place on the confirm button", async () => {
    render(<LocationGate {...props({ saved: SAVED })} />);

    // The mechanism, not the wording. A generic label turns a daily check into
    // a reflex, and a reflex cannot notice that the city is wrong.
    expect(await screen.findByRole("button", { name: /I'm at Karve Nagar/i })).toBeInTheDocument();
  });

  it("confirming does not write anything", async () => {
    const p = props({ saved: SAVED });
    render(<LocationGate {...p} />);

    await userEvent.click(await screen.findByRole("button", { name: /I'm at Karve Nagar/i }));

    expect(p.onConfirmSaved).toHaveBeenCalledOnce();
    // Already stored and already selected — re-saving an unchanged value would
    // be a request for nothing.
    expect(p.onUseCurrent).not.toHaveBeenCalled();
  });

  it("still offers a way to say they have moved", async () => {
    render(<LocationGate {...props({ saved: SAVED })} />);

    expect(await screen.findByRole("button", { name: /somewhere else/i })).toBeInTheDocument();
  });
});

describe("a user with no saved location", () => {
  it("does not show a confirm button for a location that does not exist", async () => {
    render(<LocationGate {...props()} />);

    await screen.findByRole("button", { name: /use my current location/i });
    expect(screen.queryByRole("button", { name: /I'm at/i })).not.toBeInTheDocument();
  });

  it("offers manual entry", async () => {
    render(<LocationGate {...props()} />);

    expect(
      await screen.findByRole("button", { name: /enter location manually/i }),
    ).toBeInTheDocument();
  });
});

describe("using the current location", () => {
  it("prompts only when the button is tapped", async () => {
    const p = props();
    render(<LocationGate {...p} />);
    await screen.findByRole("button", { name: /use my current location/i });

    // Rendering must not ask. The OS dialog is one-shot on Android, and
    // spending it without the user asking is how a denial happens.
    expect(getCurrentPosition).not.toHaveBeenCalled();

    getCurrentPosition.mockImplementation((ok) =>
      ok({ coords: { latitude: 18.5204, longitude: 73.8567 } }),
    );
    await userEvent.click(screen.getByRole("button", { name: /use my current location/i }));

    expect(p.onUseCurrent).toHaveBeenCalledWith(18.5204, 73.8567);
  });

  it("explains where to fix a denial rather than looping", async () => {
    getCurrentPosition.mockImplementation((_ok, fail) => fail({ code: 1 }));
    render(<LocationGate {...props()} />);

    await userEvent.click(await screen.findByRole("button", { name: /use my current location/i }));

    // Android will not ask twice, so "try again" would be a lie.
    expect(await screen.findByText(/turn it on in settings/i)).toBeInTheDocument();
  });
});

describe("when permission is already denied", () => {
  beforeEach(() => {
    permissionsQuery.mockResolvedValue({ state: "denied" });
  });

  it("does not offer an action the OS will refuse", async () => {
    render(<LocationGate {...props()} />);

    await vi.waitFor(() =>
      expect(screen.getByRole("button", { name: /use my current location/i })).toBeDisabled(),
    );
  });

  it("still lets them in via manual entry", async () => {
    // The reason a blocking screen is safe at all. Without this, a denied
    // permission would lock the user out of the app permanently.
    const p = props();
    render(<LocationGate {...p} />);

    await userEvent.click(await screen.findByRole("button", { name: /enter location manually/i }));

    expect(p.onEnterManually).toHaveBeenCalledOnce();
  });
});
