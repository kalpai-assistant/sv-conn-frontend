/**
 * Onboarding's other steps, the profile, services and business pieces in
 * Hindi and Marathi (SVC-376). What the SP typed (business name), what the
 * catalogue says (service and category names) and what the map says (the
 * fallback city) stay as given; only our own labels move.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

const { profileQuery } = vi.hoisted(() => ({ profileQuery: vi.fn() }));

vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (opts: unknown) => opts,
  Link: ({ children, ...props }: React.PropsWithChildren<Record<string, unknown>>) => (
    <a {...props}>{children}</a>
  ),
  useNavigate: () => vi.fn(),
}));
vi.mock("sonner", () => ({ toast: Object.assign(vi.fn(), { error: vi.fn(), success: vi.fn() }) }));
vi.mock("@/hooks/useApi", () => ({
  useUpdateServiceArea: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useUpdateBusinessName: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useUploadBusinessImage: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useProviderProfile: () => profileQuery(),
  useServices: () => ({
    data: [
      {
        id: "s1",
        name: "Bathroom deep cleaning",
        categoryId: "c1",
        categoryName: "Cleaning",
        payout: 125000,
      },
    ],
    isLoading: false,
    isError: false,
  }),
  useCategories: () => ({
    data: [{ id: "c1", name: "Cleaning", slug: "cleaning", sortOrder: 1 }],
    isLoading: false,
    isError: false,
  }),
  useProviderServices: () => ({ data: ["s1"], isLoading: false, isError: false }),
  useToggleProviderService: () => ({ mutate: vi.fn() }),
}));
vi.mock("@/hooks/useMapOpeningCentre", () => ({
  useMapOpeningCentre: () => ({
    centre: [12.97, 77.59],
    source: "fallback",
    fallbackLabel: "Bangalore",
  }),
}));
vi.mock("@/components/MapPicker", () => ({ MapPicker: () => <div data-testid="map" /> }));
vi.mock("@/components/BackButton", () => ({ BackButton: () => null }));
vi.mock("@/components/LogoutButton", () => ({ LogoutButton: () => null }));
vi.mock("@/components/DeleteAccountButton", () => ({ DeleteAccountButton: () => null }));
vi.mock("@/components/NotificationsRow", () => ({ NotificationsRow: () => null }));
vi.mock("@/components/language/LanguageRow", () => ({ LanguageRow: () => <p>language-row</p> }));
vi.mock("@/lib/auth-context", () => ({
  useAuth: () => ({ user: { id: "sp1", i18n_enabled: true } }),
}));
vi.mock("@/hooks/useTeam", () => ({
  useTeam: () => ({
    data: [
      { id: "me", is_self: true },
      { id: "p2", is_self: false },
    ],
  }),
}));

import { ServiceAreaStep } from "@/components/provider/ServiceAreaStep";
import { ServicesPicker } from "@/components/provider/ServicesPicker";
import { BusinessSection } from "@/components/provider/BusinessSection";
import { Route as ProfileRoute } from "@/routes/provider/profile";
import { FixedLanguage } from "@/i18n/LanguageProvider";
import i18n from "@/i18n";
import type { AppLanguage } from "@/i18n/languages";

const Profile = (ProfileRoute as unknown as { component: () => React.ReactElement }).component;

const RAW_KEY = /\b[a-z]+[A-Za-z]*\.[a-z][A-Za-z_]+\b/;
const DEVANAGARI_DIGIT = /[०-९]/;
const inLang = (lang: AppLanguage, ui: React.ReactNode) =>
  render(<FixedLanguage lang={lang}>{ui}</FixedLanguage>);
const pageText = () => document.body.textContent ?? "";

const PROFILE = {
  business_name: "Sparkle Cleaners",
  business_image_url: null,
  payout_set: true,
  payout_display: null,
  payout_method: "upi",
  service_area_lat: 18.5,
  service_area_lng: 73.8,
  service_area_radius_km: 12,
  is_online: false,
};

beforeEach(() => {
  vi.clearAllMocks();
  profileQuery.mockReturnValue({ data: PROFILE });
});

describe.each(["hi", "mr"] as const)("SP set-up screens in %s", (lang) => {
  const t = i18n.getFixedT(lang, "provider");

  it("translates the service-area step and keeps the map's own place name", () => {
    inLang(lang, <ServiceAreaStep onBack={vi.fn()} onDone={vi.fn()} />);
    expect(screen.getByText(t("serviceArea.title"))).toBeInTheDocument();
    expect(pageText()).toContain("Bangalore");
    expect(pageText()).toContain("10 km");
    expect(pageText()).not.toMatch(/Where do you work|How far will you travel/);
    expect(pageText()).not.toMatch(RAW_KEY);
  });

  it("translates the services picker and keeps the catalogue's names", () => {
    inLang(lang, <ServicesPicker />);
    expect(screen.getByText(t("services.title"))).toBeInTheDocument();
    expect(screen.getByText("Cleaning")).toBeInTheDocument();
    expect(pageText()).toContain(t("services.selected", { count: 1 }));
    expect(pageText()).not.toMatch(/Services I offer|selected/);
    expect(pageText()).not.toMatch(DEVANAGARI_DIGIT);
  });

  it("translates the profile rows and keeps the business name", () => {
    inLang(lang, <Profile />);
    expect(screen.getByText(t("profile.title"))).toBeInTheDocument();
    expect(pageText()).toContain("Sparkle Cleaners");
    expect(pageText()).toContain(t("profile.locationWithin", { km: 12 }));
    expect(pageText()).toContain(t("profile.teamCount", { count: 1 }));
    expect(pageText()).toContain(t("payout.onFileUpi"));
    // SVC-375's Language row stays where it was.
    expect(screen.getByText("language-row")).toBeInTheDocument();
    expect(pageText()).not.toMatch(/Provider Profile|Service location|My Team|besides you/);
    expect(pageText()).not.toMatch(RAW_KEY);
  });

  it("translates the business row", () => {
    inLang(lang, <BusinessSection profile={PROFILE as never} />);
    expect(screen.getByText("Sparkle Cleaners")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: t("business.edit") })).toBeInTheDocument();
    expect(pageText()).not.toMatch(/Your business|Edit/);
  });
});

describe("SP set-up screens in English", () => {
  it("are what they were before translation", () => {
    inLang("en", <Profile />);
    expect(screen.getByText("Provider Profile")).toBeInTheDocument();
    expect(screen.getByText("Within 12 km of your centre")).toBeInTheDocument();
    expect(screen.getByText("1 member besides you")).toBeInTheDocument();
    expect(screen.getByText("UPI ID on file")).toBeInTheDocument();
  });

  it("keep the step's fallback banner word for word", () => {
    inLang("en", <ServiceAreaStep onBack={vi.fn()} onDone={vi.fn()} />);
    expect(
      screen.getByText(
        "We don't know where you are yet, so this map is a guess (showing Bangalore). Drag the pin to where you work, or tap the locate button.",
      ),
    ).toBeInTheDocument();
  });
});
