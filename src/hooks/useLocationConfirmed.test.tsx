/**
 * The gate must actually dismiss when answered (SVC-281).
 *
 * This exists because the first build did not. `hasConfirmedLocation()` was a
 * plain module read, so confirming flipped the flag and React never
 * re-evaluated — the user tapped "Yes, I'm here" and stayed on the same screen,
 * locked out of the app.
 *
 * Every unit test passed at the time. The store worked, the component worked;
 * the bug lived in the wiring between them, which only a subscriber test or a
 * real device can see. Found on a device.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { act } from "react";
import { markLocationConfirmed, resetLocationGate } from "@/lib/location-gate";
import { useLocationConfirmed } from "@/hooks/useLocationConfirmed";

function Gated() {
  const confirmed = useLocationConfirmed();
  return <div>{confirmed ? "app" : "gate"}</div>;
}

beforeEach(() => {
  resetLocationGate();
});

describe("answering the gate", () => {
  it("re-renders the app away from the gate", () => {
    render(<Gated />);
    expect(screen.getByText("gate")).toBeInTheDocument();

    act(() => markLocationConfirmed());

    // The whole bug: this used to stay on "gate" forever.
    expect(screen.getByText("app")).toBeInTheDocument();
  });

  it("stays answered, so the gate does not flicker back mid-session", () => {
    render(<Gated />);
    act(() => markLocationConfirmed());
    act(() => markLocationConfirmed());

    expect(screen.getByText("app")).toBeInTheDocument();
  });
});
