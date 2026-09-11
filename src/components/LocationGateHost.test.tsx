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
const requestLocation = vi.fn();

vi.mock("@/lib/geolocation", () => ({
  requestLocation: (...a: unknown[]) => requestLocation(...a),
  peekLocationPermission: () => Promise.resolve("prompt"),
}));
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
  useUpdateAddress: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useUpdateServiceArea: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

/**
 * Stands in for the address picker so the confirm step can be inspected.
 *
 * Mocked rather than rendered because the real sheet mounts Leaflet, and what
 * matters here is only what the gate hands it — above all whether it was given
 * the position the user just waited for.
 */
const sheetProps = vi.fn();
vi.mock("@/components/AddAddressSheet", () => ({
  AddAddressSheet: (props: { initialCentre?: [number, number] | null }) => {
    sheetProps(props);
    return <div data-testid="address-sheet">address picker</div>;
  },
}));

import { ConsumerLocationGate } from "@/components/LocationGateHost";

const AT_KARVE_NAGAR = "Lane Number 7, Mavale vasti, Karve Nagar, Pune, 411052";
const AT_KOTHRUD = "Paud Road, Shastrinagar, Kothrud, Pune, 411038";

beforeEach(() => {
  vi.clearAllMocks();
  requestLocation.mockResolvedValue({ ok: false, failure: "unavailable", coords: null });
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

describe("what happens when a position is found", () => {
  it("opens the confirm step instead of saving a coordinate string", async () => {
    // The bug this replaced: `onUseCurrent` wrote an address immediately,
    // synthesising `full_address` from the coordinates because the backend
    // requires the field. Users ended up with a saved address called
    // "18.52040, 73.85670" — not a rendering problem, but what we persisted.
    //
    // Measured against Blinkit, Zepto, Urban Company and Pronto with device
    // location off: none of them stores an address at this moment. They show
    // the fix and save only once the user confirms it.
    addresses.mockReturnValue([]);
    const user = userEvent.setup();
    requestLocation.mockResolvedValue({
      ok: true,
      failure: null,
      coords: { lat: 18.5204, lng: 73.8567 },
    });

    render(<ConsumerLocationGate reason="permission-prompt" />);
    await user.click(await screen.findByRole("button", { name: /enable/i }));

    expect(await screen.findByTestId("address-sheet")).toBeInTheDocument();
    // The assertion that matters: nothing was written.
    expect(addAddress).not.toHaveBeenCalled();
  });

  it("opens the map on the position the user just waited for", async () => {
    // Handing the fix over is the whole point. Without it the sheet resolves
    // its own centre and can open somewhere else entirely — having just told
    // the user we found them.
    addresses.mockReturnValue([]);
    const user = userEvent.setup();
    requestLocation.mockResolvedValue({
      ok: true,
      failure: null,
      coords: { lat: 18.5204, lng: 73.8567 },
    });

    render(<ConsumerLocationGate reason="permission-prompt" />);
    await user.click(await screen.findByRole("button", { name: /enable/i }));

    await vi.waitFor(() => expect(sheetProps).toHaveBeenCalled());
    expect(sheetProps.mock.calls.at(-1)?.[0].initialCentre).toEqual([18.5204, 73.8567]);
  });

  it("lets the picker choose its own centre when there is no position", async () => {
    // Manual entry is the no-permission path, and we genuinely do not know
    // where they are. Passing a stale fix here would open the map on a place
    // the user never asked for; null lets the sheet say it is guessing.
    addresses.mockReturnValue([]);
    const user = userEvent.setup();

    render(<ConsumerLocationGate reason="permission-denied" />);
    await user.click(await screen.findByRole("button", { name: /enter location manually/i }));

    await vi.waitFor(() => expect(sheetProps).toHaveBeenCalled());
    expect(sheetProps.mock.calls.at(-1)?.[0].initialCentre).toBeNull();
    expect(addAddress).not.toHaveBeenCalled();
  });
});
