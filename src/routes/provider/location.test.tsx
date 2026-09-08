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
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const updateServiceArea = vi.fn();
let profile: Record<string, unknown> | undefined;
let profileState = { isLoading: false, isError: false };

/** What MapPicker was handed — the assertion target for "opens on the saved area". */
let mapProps: { initialCenter?: [number, number] | null } = {};

vi.mock("@/hooks/useApi", () => ({
  useProviderProfile: () => ({ data: profile, ...profileState }),
  useUpdateServiceArea: () => ({ mutateAsync: updateServiceArea, isPending: false }),
}));
vi.mock("@/components/MapPicker", () => ({
  MapPicker: (props: { initialCenter?: [number, number] | null }) => {
    mapProps = props;
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

const Page = (Route as unknown as { component: () => JSX.Element }).component;

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
