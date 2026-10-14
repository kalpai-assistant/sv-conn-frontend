/**
 * ServiceAreaStep (SVC-358).
 *
 * The failure this guards against is quiet and expensive: the step used to be
 * a `getCurrentPosition` call with no visual correction, so a bad GPS fix (mall,
 * basement, stale cache — SVC-352) wrote itself to the dispatch geo-fence and
 * nothing on screen told the provider. The fix is to render MapPicker with the
 * same opening-centre logic the address sheet uses so the pin is a thing the
 * provider confirms, not a thing they inherit.
 *
 * The assertions are about:
 *   - MapPicker is actually mounted (regression guard: this is the whole point)
 *   - The step does not treat MapPicker's mount-time report as a user choice
 *     (same bug as the Service Location screen — see provider/location.test.tsx)
 *   - A moved pin + adjusted radius reach the server as one payload
 *   - The default radius is 10km (matches what onboarding has always sent)
 */
import { useEffect, type ReactElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const updateServiceArea = vi.fn();
const onBack = vi.fn();
const onDone = vi.fn();

/** What MapPicker was handed — the assertion target for "opens on the right centre". */
let mapProps: {
  initialCenter?: [number, number] | null;
  onLocationSelected?: (lat: number, lng: number, address: string) => void;
  onUserMoved?: () => void;
} = {};

/** Stable return from useMapOpeningCentre — tests override `centre`/`source` per case. */
let opening: { centre: [number, number] | null; source: string | null; fallbackLabel: string } = {
  centre: [12.9716, 77.5946],
  source: "fallback",
  fallbackLabel: "Bangalore",
};

vi.mock("@/hooks/useApi", () => ({
  useUpdateServiceArea: () => ({ mutateAsync: updateServiceArea, isPending: false }),
}));
vi.mock("@/hooks/useMapOpeningCentre", () => ({
  useMapOpeningCentre: () => opening,
}));
vi.mock("@/components/MapPicker", () => ({
  // Mirrors the real component: reverse-geocodes on mount and reports whatever
  // centre it opened on, including its own fallback. The step must not treat
  // that mount-time report as a user choice (same bug as provider/location).
  MapPicker: (props: {
    initialCenter?: [number, number] | null;
    onLocationSelected: (lat: number, lng: number, address: string) => void;
    onUserMoved?: () => void;
  }) => {
    mapProps = props;
    const c = props.initialCenter ?? [12.9716, 77.5946];
    useEffect(() => {
      props.onLocationSelected(c[0], c[1], "Somewhere");
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);
    return <div data-testid="map" />;
  },
}));

import { ServiceAreaStep } from "@/components/provider/ServiceAreaStep";

const renderStep = (
  overrides: Partial<Parameters<typeof ServiceAreaStep>[0]> = {},
): ReactElement => <ServiceAreaStep onBack={onBack} onDone={onDone} {...overrides} />;

beforeEach(() => {
  vi.clearAllMocks();
  mapProps = {};
  opening = {
    centre: [12.9716, 77.5946],
    source: "fallback",
    fallbackLabel: "Bangalore",
  };
  updateServiceArea.mockResolvedValue(undefined);
});

describe("rendering", () => {
  it("mounts MapPicker (no more raw getCurrentPosition)", () => {
    // Regression guard: SVC-358's whole point. If someone reverts to a raw
    // geolocation call the "map" testid vanishes and this fails.
    render(renderStep());

    expect(screen.getByTestId("map")).toBeInTheDocument();
  });

  it("defaults the radius to 10km", () => {
    // The number onboarding has always sent — not something to silently change.
    render(renderStep());

    expect(screen.getByText("10 km")).toBeInTheDocument();
  });

  it("honours an initialRadiusKm prop when provided", () => {
    render(renderStep({ initialRadiusKm: 7 }));

    expect(screen.getByText("7 km")).toBeInTheDocument();
  });

  it("waits for the opening-centre hook before mounting the map", () => {
    opening = { centre: null, source: null, fallbackLabel: "Bangalore" };

    render(renderStep());

    // Null centre = still resolving. Mounting the map early would drag the
    // view out from under a provider who starts moving the pin immediately.
    expect(screen.queryByTestId("map")).not.toBeInTheDocument();
  });

  it("names the fallback city when the hook could not resolve a real centre", () => {
    // The SVC-281 banner: without this a Pune provider sees a Bangalore map
    // with no explanation.
    render(renderStep());

    expect(screen.getByText(/showing Bangalore/i)).toBeInTheDocument();
  });

  it("does not show the fallback banner when a seeded centre is used", () => {
    // Editing an existing area mid-onboarding: the pin is already a real
    // choice, no need to apologise for it.
    render(renderStep({ initialLat: 18.5204, initialLng: 73.8567 }));

    expect(screen.queryByText(/this map is a guess/i)).not.toBeInTheDocument();
  });
});

describe("the map reporting its own centre on mount", () => {
  it("does not treat the fallback as a confirmed pin", () => {
    // The dangerous case. MapPicker opens on Bangalore when the hook has no
    // better answer and reverse-geocodes it on mount. Accepting that would
    // enable Continue and let a provider confirm a 840km-wrong pin with no
    // interaction. Save stays disabled until `onUserMoved` fires.
    render(renderStep());

    expect(screen.getByRole("button", { name: /continue/i })).toBeDisabled();
  });

  it("accepts a seeded centre as a real pin without needing a user move", () => {
    // Editing an existing area: the saved pin is already a confirmed choice,
    // not an inference. Continue should be enabled from mount.
    render(renderStep({ initialLat: 18.5204, initialLng: 73.8567 }));

    expect(screen.getByRole("button", { name: /continue/i })).not.toBeDisabled();
  });
});

describe("saving", () => {
  it("sends centre and radius together after a drag + slider adjust", async () => {
    render(renderStep());

    // Simulate the provider actually dragging the pin: MapPicker fires
    // onUserMoved, then onLocationSelected with the new coordinates.
    mapProps.onUserMoved?.();
    mapProps.onLocationSelected?.(19.076, 72.8777, "Mumbai");

    // Range inputs: userEvent.clear/type don't drive them cleanly, so fire a
    // change event with the new value — same approach the slider changes in
    // other tests take (@testing-library's recommended path for type=range).
    const slider = screen.getByLabelText(/service radius/i);
    fireEvent.change(slider, { target: { value: "15" } });

    await userEvent.click(screen.getByRole("button", { name: /continue/i }));

    expect(updateServiceArea).toHaveBeenCalledWith({
      service_area_lat: 19.076,
      service_area_lng: 72.8777,
      service_area_radius_km: 15,
    });
    expect(onDone).toHaveBeenCalled();
  });

  it("sends the default radius when the slider was not touched", async () => {
    render(renderStep());
    mapProps.onUserMoved?.();
    mapProps.onLocationSelected?.(19.076, 72.8777, "Mumbai");

    await userEvent.click(screen.getByRole("button", { name: /continue/i }));

    expect(updateServiceArea).toHaveBeenCalledWith(
      expect.objectContaining({ service_area_radius_km: 10 }),
    );
  });

  it("refuses to save without a pin", async () => {
    render(renderStep());
    // No userMoved, no seeded centre → nothing to save.

    // The button is disabled, so there is nothing to click — asserting that is
    // the test. (Clicking a disabled button and expecting an error message
    // would miss the real contract: Continue is unreachable.)
    expect(screen.getByRole("button", { name: /continue/i })).toBeDisabled();
    expect(updateServiceArea).not.toHaveBeenCalled();
  });

  it("surfaces a server error without closing the step", async () => {
    updateServiceArea.mockRejectedValueOnce(new Error("Network down"));

    render(renderStep());
    mapProps.onUserMoved?.();
    mapProps.onLocationSelected?.(19.076, 72.8777, "Mumbai");

    await userEvent.click(screen.getByRole("button", { name: /continue/i }));

    expect(await screen.findByText(/network down/i)).toBeInTheDocument();
    expect(onDone).not.toHaveBeenCalled();
  });
});

describe("navigation", () => {
  it("fires onBack when Back is clicked", async () => {
    render(renderStep());

    await userEvent.click(screen.getByRole("button", { name: /back/i }));

    expect(onBack).toHaveBeenCalled();
  });
});
