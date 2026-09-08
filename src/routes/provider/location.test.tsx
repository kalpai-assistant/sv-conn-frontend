/**
 * Provider → Location (SVC-279).
 *
 * The failure this guards against is quiet and expensive: a provider opens the
 * screen, their saved area does not load, they pick somewhere plausible, and
 * save — silently relocating their service area and, with it, every job they
 * are eligible for. Nothing on screen would look wrong at any point.
 *
 * So the assertions are about what reaches the map and what reaches the server,
 * not about pixels.
 */
import { useEffect, type ReactElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const updateServiceArea = vi.fn();
let profile: Record<string, unknown> | undefined;
let profileState = { isLoading: false, isError: false };

/** What MapPicker was handed — the assertion target for "opens on the saved area". */
let mapProps: { initialCenter?: [number, number] | null } = {};

/** MapPicker's own default — Bangalore — which it reports when given no centre. */
const MAP_FALLBACK: [number, number] = [12.9716, 77.5946];

vi.mock("@/hooks/useApi", () => ({
  useProviderProfile: () => ({ data: profile, ...profileState }),
  useUpdateServiceArea: () => ({ mutateAsync: updateServiceArea, isPending: false }),
}));
vi.mock("@/components/MapPicker", () => ({
  // Mirrors the real component: it reverse-geocodes on mount and reports the
  // result straight back, so the screen receives an `onLocationSelected` for a
  // centre the provider never touched. Mocking that away hid two bugs.
  MapPicker: (props: {
    initialCenter?: [number, number] | null;
    onLocationSelected: (lat: number, lng: number, address: string) => void;
    onUserMoved?: () => void;
  }) => {
    mapProps = props;
    // Unconditional, like the real one: it reverse-geocodes whatever centre it
    // opened on — including its own Bangalore fallback when no initialCenter is
    // given. That is the case that made the no-area warning disappear.
    const c = props.initialCenter ?? MAP_FALLBACK;
    useEffect(() => {
      props.onLocationSelected(c[0], c[1], "Somewhere");
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);
    return <div data-testid="map" />;
  },
}));
vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (opts: { component: unknown }) => opts,
  Link: ({ children }: { children: React.ReactNode }) => <a>{children}</a>,
  useNavigate: () => vi.fn(),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { Route } from "@/routes/provider/location";

const Page = (Route as unknown as { component: () => ReactElement }).component;

beforeEach(() => {
  vi.clearAllMocks();
  mapProps = {};
  profileState = { isLoading: false, isError: false };
  updateServiceArea.mockResolvedValue(undefined);
  profile = {
    service_area_lat: 18.5204,
    service_area_lng: 73.8567,
    service_area_radius_km: 15,
  };
});

describe("a provider who already has an area", () => {
  it("opens the map on it rather than a default", () => {
    render(<Page />);

    // The whole point of the backend change in #156. Without this the map opens
    // somewhere else and an edit becomes an accidental relocation.
    expect(mapProps.initialCenter).toEqual([18.5204, 73.8567]);
  });

  it("shows their saved radius, not a hardcoded one", () => {
    render(<Page />);

    expect(screen.getByText("15 km")).toBeInTheDocument();
  });

  it("keeps the radius when only the pin moves", async () => {
    render(<Page />);

    await userEvent.click(screen.getByRole("button", { name: /save service area/i }));

    // A provider who nudges their centre must not silently have their travel
    // distance reset to the default.
    expect(updateServiceArea).toHaveBeenCalledWith(
      expect.objectContaining({ service_area_radius_km: 15 }),
    );
  });
});

describe("a provider with no area set", () => {
  beforeEach(() => {
    profile = { service_area_lat: null, service_area_lng: null };
  });

  it("says so, because nothing else in the app would", () => {
    render(<Page />);

    // The dispatch geo-fence silently excludes them — no error, no empty state,
    // just no work ever arriving.
    expect(screen.getByText(/job requests can't reach you/i)).toBeInTheDocument();
  });

  it("cannot save without picking somewhere", () => {
    render(<Page />);

    expect(screen.getByRole("button", { name: /save service area/i })).toBeDisabled();
  });

  it("does not hand the map a null island centre", () => {
    render(<Page />);

    // `null` means "never set". Coercing that to 0,0 would drop every such
    // provider in the Gulf of Guinea.
    expect(mapProps.initialCenter).toBeNull();
  });
});

describe("saving", () => {
  it("sends the centre and radius together", async () => {
    render(<Page />);

    await userEvent.click(screen.getByRole("button", { name: /save service area/i }));

    expect(updateServiceArea).toHaveBeenCalledWith({
      service_area_lat: 18.5204,
      service_area_lng: 73.8567,
      service_area_radius_km: 15,
    });
  });
});

describe("the map reporting its own centre on mount", () => {
  it("does not call an untouched centre 'New centre'", () => {
    // MapPicker reverse-geocodes on mount and reports back, so the screen hears
    // about a centre nobody moved. Labelling that "New centre" tells a provider
    // they changed something they did not.
    render(<Page />);

    expect(screen.getByText("Your service centre")).toBeInTheDocument();
    expect(screen.queryByText("New centre")).not.toBeInTheDocument();
  });

  it("keeps the no-area warning visible for a provider who has none", () => {
    // The worse half of the same bug: the mount callback made the one message
    // that explains why they receive no work vanish the instant it rendered.
    profile = { service_area_lat: null, service_area_lng: null };

    render(<Page />);

    expect(screen.getByText(/job requests can't reach you/i)).toBeInTheDocument();
  });
});

describe("a provider with no area, when the map reports its own default", () => {
  beforeEach(() => {
    profile = { service_area_lat: null, service_area_lng: null };
  });

  it("does not treat the map's fallback centre as a choice", () => {
    // The dangerous one. MapPicker opens on Bangalore when given no centre and
    // reverse-geocodes it on mount. Accepting that would enable Save and let a
    // single tap move this provider's service area ~840km.
    render(<Page />);

    expect(screen.getByRole("button", { name: /save service area/i })).toBeDisabled();
  });

  it("still tells them they will receive no jobs", () => {
    render(<Page />);

    expect(screen.getByText(/job requests can't reach you/i)).toBeInTheDocument();
  });
});
