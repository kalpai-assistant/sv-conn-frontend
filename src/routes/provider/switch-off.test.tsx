/**
 * With i18n_enabled false, the SP's screens are exactly today's English
 * (SVC-376) — even for an SP whose account and phone both say Hindi. That is
 * the kill switch: I18N_MODE=off on the backend must give back the app as it
 * was. Rendered through the real LanguageProvider on the screens' own routes,
 * so the gate itself is what is under test, not a FixedLanguage.
 */
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

const { pathname, auth, query, mutation } = vi.hoisted(() => ({
  query: (data: unknown) => ({ data, isLoading: false, isError: false, refetch: vi.fn() }),
  mutation: () => ({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false }),
  pathname: { current: "/provider" },
  auth: {
    user: {
      id: "sp1",
      name: "Ravi",
      i18n_enabled: false,
      preferred_language: "hi" as string | null,
    },
  },
}));

vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (opts: unknown) => opts,
  Link: ({ children, ...props }: React.PropsWithChildren<Record<string, unknown>>) => (
    <a {...props}>{children}</a>
  ),
  useNavigate: () => vi.fn(),
  useRouterState: ({ select }: { select: (s: unknown) => unknown }) =>
    select({ location: { pathname: pathname.current } }),
}));
vi.mock("@/lib/auth-context", () => ({
  useAuth: () => ({ user: auth.user, updateUser: vi.fn() }),
}));
vi.mock("sonner", () => ({ toast: Object.assign(vi.fn(), { error: vi.fn(), success: vi.fn() }) }));
vi.mock("framer-motion", () => ({
  AnimatePresence: ({ children }: { children: ReactNode }) => <>{children}</>,
  motion: { div: ({ children }: { children: ReactNode }) => <div>{children}</div> },
}));
vi.mock("@/components/AccountAvatar", () => ({ AccountAvatar: () => null }));
vi.mock("@/components/BackButton", () => ({ BackButton: () => null }));
vi.mock("@/components/InstallSheet", () => ({ InstallSheet: () => null }));
vi.mock("@/components/provider/WeekEarningsChart", () => ({ WeekEarningsChart: () => null }));
vi.mock("@/components/provider/MonthEarningsChart", () => ({ MonthEarningsChart: () => null }));
vi.mock("@/components/provider/ServicesPicker", () => ({ ServicesPicker: () => null }));
vi.mock("@/components/provider/PayoutStep", () => ({ PayoutStep: () => null }));
vi.mock("@/components/provider/ServiceAreaStep", () => ({ ServiceAreaStep: () => null }));
vi.mock("@/lib/install", () => ({
  useInstallState: () => ({ state: "installed", promptInstall: vi.fn() }),
}));
vi.mock("@/lib/fcm", () => ({
  getPushPermission: () => Promise.resolve("granted"),
  enablePushNotifications: vi.fn(),
}));
vi.mock("@/lib/camera", () => ({
  isNativePlatform: () => false,
  captureNativePhoto: vi.fn(),
  captureLivePhoto: vi.fn(),
}));
vi.mock("@/hooks/useApi", () => ({
  useBookings: () => query([]),
  useProviderProfile: () => ({
    data: { kyc_status: "submitted", is_online: false, profile_photo_url: null },
    isLoading: false,
  }),
  useProviderServices: () => query([]),
  useSetOnlineStatus: mutation,
  useMarkEnRoute: mutation,
  useStartBooking: mutation,
  useCompleteBooking: mutation,
  useCancelBooking: mutation,
  useEarningsSummary: () => query({ lifetime_payout: 125000, completed_count: 3 }),
  useEarnings: (range: string) =>
    query({ range, total_payout: 0, completed_count: 0, bookings: [] }),
  useProviderPayoutSummary: () =>
    query({
      balance_owed: 0,
      payout_set: true,
      pending_amount: 2900,
      gross_amount: 3480,
      pending_booking_count: 3,
      last_paid_at: null,
      last_paid_amount: null,
    }),
  useUpdateName: mutation,
  useUpdateLanguages: mutation,
  useUploadPhoto: mutation,
  useUpdateBusinessName: mutation,
  useUploadBusinessImage: mutation,
  useSubmitKyc: mutation,
}));
vi.mock("@/hooks/useProEarnings", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/hooks/useProEarnings")>()),
  useEarningsByPro: (range: string) =>
    query({ range, total_payout: 0, completed_count: 0, pros: [] }),
}));
vi.mock("@/hooks/useTeam", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/hooks/useTeam")>()),
  useTeam: () => query([{ id: "me", display_name: "Ravi", is_self: true, kyc_status: "verified" }]),
  useTeamInvites: () => query([]),
  useRemoveMember: mutation,
  useRevokeInvite: mutation,
  useSelfPro: () => ({ data: undefined }),
  useSetSelfPro: mutation,
}));

import { Route as HomeRoute } from "@/routes/provider/index";
import { Route as EarningsRoute } from "@/routes/provider/earnings";
import { Route as OnboardingRoute } from "@/routes/provider/onboarding";
import { Route as TeamRoute } from "@/routes/provider/team/index";
import { FirstRunLanguagePrompt } from "@/components/language/FirstRunLanguagePrompt";
import { LanguageProvider } from "@/i18n/LanguageProvider";
import { resetStoredLanguageForTests, setStoredLanguage } from "@/i18n/language";

const page = (route: unknown) => (route as { component: () => React.ReactElement }).component;

function renderOn(path: string, Page: () => React.ReactElement) {
  pathname.current = path;
  return render(
    <LanguageProvider>
      <Page />
      <FirstRunLanguagePrompt />
    </LanguageProvider>,
  );
}

const DEVANAGARI = /[ऀ-ॿ]/;

beforeEach(() => {
  window.localStorage.clear();
  resetStoredLanguageForTests();
  // Hindi everywhere it could come from: the account and this phone.
  setStoredLanguage("hi");
  auth.user.preferred_language = "hi";
  auth.user.i18n_enabled = false;
});
afterEach(() => resetStoredLanguageForTests());

describe("i18n_enabled false: the SP's screens are today's English", () => {
  it.each([
    ["/provider", HomeRoute, "Provider Home"],
    ["/provider/earnings", EarningsRoute, "Total earned"],
    ["/provider/onboarding", OnboardingRoute, "Tell us about you"],
    ["/provider/team", TeamRoute, "My Team"],
  ])("%s", async (path, route, english) => {
    renderOn(path, page(route));
    expect(await screen.findByText(english)).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(DEVANAGARI);
    expect(document.documentElement.lang).toBe("en");
    // No first-run prompt while the switch is off — not even on onboarding.
    expect(screen.queryByText("Choose your language")).not.toBeInTheDocument();
  });

  it("and the same screens do switch once it is on (the control)", async () => {
    auth.user.i18n_enabled = true;
    renderOn("/provider", page(HomeRoute));
    expect(await screen.findByText("प्रोवाइडर होम")).toBeInTheDocument();
  });
});
