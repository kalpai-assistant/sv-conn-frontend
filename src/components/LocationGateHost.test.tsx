/**
 * What each role feeds into the location gate (SVC-281).
 *
 * The gate itself is role-agnostic and renders whatever it is handed, so a bad
 * list is invisible to its own tests. This covers the wiring instead — which is
 * where every device-found bug in this feature has actually lived.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const addresses = vi.fn();
const addAddress = vi.fn();
const getCurrentPosition = vi.fn();
const setSelectedId = vi.fn();

vi.mock("@/hooks/useSelectedAddress", () => ({
  useSelectedAddress: () => ({
    addresses: addresses(),
    setSelectedId,
    selected: undefined,
    isLoading: false,
  }),
}));

vi.mock("@/hooks/useApi", () => ({
  useAddAddress: () => ({ mutateAsync: addAddress, isPending: false }),
  useUpdateServiceArea: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

import { ConsumerLocationGate } from "@/components/LocationGateHost";

const AT_KARVE_NAGAR = "Lane Number 7, Mavale vasti, Karve Nagar, Pune, 411052";
const AT_KOTHRUD = "Paud Road, Shastrinagar, Kothrud, Pune, 411038";

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("navigator", {
    geolocation: { getCurrentPosition },
    permissions: { query: vi.fn().mockResolvedValue({ state: "prompt" }) },
  });
});

describe("the saved list a consumer sees", () => {
  it("shows one row per place, not one per record", async () => {
    // Found on device. "Use my current location" writes a new "Home" every
    // time it is tapped, so the address book fills with duplicates — and the
    // gate rendered two rows reading "Karve Nagar / Lane Number 7…", identical
    // in every visible respect, with no way to tell which was which.
    //
    // They were also genuinely the same place, so the second row offered no
    // choice at all: pure noise on a screen whose entire job is a quick
    // decision.
    addresses.mockReturnValue([
      { id: "a1", label: "home", full: AT_KARVE_NAGAR, lat: 18.4, lng: 73.8 },
      { id: "a2", label: "home", full: AT_KARVE_NAGAR, lat: 18.4, lng: 73.8 },
    ]);

    render(<ConsumerLocationGate reason="permission-prompt" />);

    expect(await screen.findAllByText("Karve Nagar")).toHaveLength(1);
  });

  it("keeps distinct places even when they share a label", async () => {
    // The other half of the rule. Two different addresses both called "Home"
    // are two real choices — deduping by label would silently remove the right
    // answer from a screen the user cannot get past.
    addresses.mockReturnValue([
      { id: "a1", label: "home", full: AT_KARVE_NAGAR, lat: 18.4, lng: 73.8 },
      { id: "a2", label: "home", full: AT_KOTHRUD, lat: 18.5, lng: 73.8 },
    ]);

    render(<ConsumerLocationGate reason="permission-prompt" />);

    expect(await screen.findByText("Karve Nagar")).toBeInTheDocument();
    expect(screen.getByText("Kothrud")).toBeInTheDocument();
  });

  it("names each row by locality, so a row can be disagreed with", async () => {
    // "Home" is true in every city — a row saying it confirms nothing, which
    // is the failure the whole naming rule exists to prevent.
    addresses.mockReturnValue([
      { id: "a1", label: "home", full: AT_KOTHRUD, lat: 18.5, lng: 73.8 },
    ]);

    render(<ConsumerLocationGate reason="permission-prompt" />);

    expect(await screen.findByText("Kothrud")).toBeInTheDocument();
    expect(screen.queryByText("home")).not.toBeInTheDocument();
  });

  it("still offers manual entry when there are no addresses at all", async () => {
    // The invariant that makes a blocking screen safe rather than a lockout.
    addresses.mockReturnValue([]);

    render(<ConsumerLocationGate reason="permission-denied" />);

    expect(
      await screen.findByRole("button", { name: /enter location manually/i }),
    ).toBeInTheDocument();
  });
});

describe("saving the current location", () => {
  it("sends a label the backend will accept", async () => {
    // Found on device: Enable failed with "API error: 422" while manual entry
    // worked. CreateAddressRequest pins label to ^(home|work|other)$, and this
    // path sent "Home" — AddAddressSheet lowercases, this did not.
    //
    // Asserted on the payload rather than the outcome because a 422 is silent
    // here: the toast says "couldn't save that location", which reads as a
    // network problem rather than a malformed request.
    addresses.mockReturnValue([]);
    const user = userEvent.setup();
    getCurrentPosition.mockImplementation((ok) =>
      ok({ coords: { latitude: 18.5204, longitude: 73.8567 } }),
    );

    render(<ConsumerLocationGate reason="permission-prompt" />);
    await user.click(await screen.findByRole("button", { name: /enable/i }));

    await vi.waitFor(() => expect(addAddress).toHaveBeenCalled());
    expect(addAddress.mock.calls[0][0].label).toMatch(/^(home|work|other)$/);
  });
});
