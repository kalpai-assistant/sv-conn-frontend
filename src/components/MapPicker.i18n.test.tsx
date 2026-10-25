/**
 * MapPicker's own chrome follows the route's language (SVC-376).
 *
 * It is shared: the SP's onboarding step 3 and Service location screen, and
 * the customer's address sheet. On a customer route it must stay English even
 * for someone with i18n_enabled and Hindi chosen — the language goes by route,
 * not by account. The real LanguageProvider and PlacesSearchBar are used; the
 * map, the geocoder and the router are stubbed.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { GEOCODE_FAILED } from "@/lib/geocode-result";

const { pathname, online, geocode } = vi.hoisted(() => ({
  pathname: { current: "/" },
  online: { current: true },
  // Never resolves by default: the address line stays on "Locating...".
  geocode: { current: (): Promise<unknown> => new Promise(() => {}) },
}));

vi.mock("react-leaflet", () => ({
  MapContainer: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
  TileLayer: () => null,
  useMapEvents: () => null,
  useMap: () => ({
    setView: vi.fn(),
    flyTo: vi.fn(),
    getZoom: () => 16,
    getCenter: () => ({ lat: 0, lng: 0 }),
  }),
}));
vi.mock("@/lib/google-maps", () => ({
  reverseGeocode: () => geocode.current(),
  createAutocompleteSession: () => Promise.resolve(null),
  queryPlaces: vi.fn().mockResolvedValue([]),
  placeDetails: vi.fn(),
}));
vi.mock("@/lib/geolocation", () => ({
  isNativeLocation: () => true,
  requestLocation: vi.fn(),
}));
vi.mock("@/lib/open-app-settings", () => ({
  canOpenAppSettings: () => true,
  openAppSettings: vi.fn(),
}));
vi.mock("@/hooks/useOnlineStatus", () => ({ useOnlineStatus: () => online.current }));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
vi.mock("@/lib/auth-context", () => ({
  useAuth: () => ({ user: { id: "u1", i18n_enabled: true, preferred_language: "hi" } }),
}));
vi.mock("@tanstack/react-router", () => ({
  useRouterState: ({ select }: { select: (s: unknown) => unknown }) =>
    select({ location: { pathname: pathname.current } }),
}));

import { MapPicker } from "@/components/MapPicker";
import { LanguageProvider } from "@/i18n/LanguageProvider";
import { resetStoredLanguageForTests, setStoredLanguage } from "@/i18n/language";

function renderAt(path: string, onLocationSelected = vi.fn()) {
  pathname.current = path;
  return render(
    <LanguageProvider>
      <MapPicker initialCenter={[18.52, 73.85]} onLocationSelected={onLocationSelected} />
    </LanguageProvider>,
  );
}

beforeEach(() => {
  resetStoredLanguageForTests();
  setStoredLanguage("hi");
  online.current = true;
  geocode.current = () => new Promise(() => {});
});
afterEach(() => resetStoredLanguageForTests());

describe("MapPicker's language", () => {
  it("stays English on a customer route, whatever was chosen", () => {
    // Where the customer address sheet is opened.
    renderAt("/");
    expect(screen.getByText("Select Location")).toBeInTheDocument();
    expect(screen.getByText("Locating...")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Use my current location" })).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Search area, street or landmark")).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/[ऀ-ॿ]/);
  });

  it("follows the SP's Hindi on the provider location screen", () => {
    renderAt("/provider/location");
    expect(screen.getByText("लोकेशन चुनें")).toBeInTheDocument();
    expect(screen.getByText("लोकेशन ढूँढ रहे हैं...")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "मेरी अभी की लोकेशन इस्तेमाल करें" }),
    ).toBeInTheDocument();
    expect(screen.getByPlaceholderText("इलाका, गली या लैंडमार्क खोजें")).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/Select Location|Locating/);
  });

  it("words the offline banner by route too", () => {
    online.current = false;
    const customer = renderAt("/");
    expect(screen.getByText("You're offline")).toBeInTheDocument();
    customer.unmount();
    renderAt("/provider/onboarding");
    expect(screen.getByText("आप ऑफ़लाइन हैं")).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/You're offline/);
  });

  // SVC-395, found on device: a failed lookup showed the English sentinel on
  // a Hindi screen. Shown translated; still reported in English, because
  // callers compare against the sentinel.
  it("shows a failed address lookup in the screen's language", async () => {
    geocode.current = () => Promise.reject(new Error("no key"));
    const onLocationSelected = vi.fn();
    const sp = renderAt("/provider/location", onLocationSelected);
    expect(await screen.findByText("पता नहीं मिल सका")).toBeInTheDocument();
    expect(onLocationSelected).toHaveBeenCalledWith(18.52, 73.85, GEOCODE_FAILED);
    sp.unmount();

    renderAt("/");
    expect(await screen.findByText("Could not fetch address")).toBeInTheDocument();
  });
});
