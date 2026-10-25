/**
 * The SP's own screens in Hindi and Marathi (SVC-376): the copy is translated,
 * nothing renders as a raw key, digits stay Latin, and what the SP or the
 * customer typed — service names, addresses, team members' names — stays as
 * typed. English is pinned beside each, because with i18n off it must be
 * exactly what the screens said before.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { ApiError } from "@/lib/api";

const { toast, profile, services, bookings, teamQuery, offer } = vi.hoisted(() => ({
  toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }),
  profile: vi.fn(),
  services: vi.fn(),
  bookings: vi.fn(),
  teamQuery: vi.fn(),
  offer: vi.fn(),
}));

vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (opts: unknown) => opts,
  Link: ({ children, ...props }: React.PropsWithChildren<Record<string, unknown>>) => (
    <a {...props}>{children}</a>
  ),
  useNavigate: () => vi.fn(),
  useRouterState: ({ select }: { select: (s: unknown) => unknown }) =>
    select({ location: { pathname: "/provider" } }),
}));
vi.mock("sonner", () => ({ toast }));
vi.mock("framer-motion", () => ({
  motion: {
    div: ({ children, ...props }: React.PropsWithChildren<Record<string, unknown>>) => (
      <div {...props}>{children}</div>
    ),
  },
}));
vi.mock("@/components/AccountAvatar", () => ({ AccountAvatar: () => null }));
vi.mock("@/components/InstallSheet", () => ({ InstallSheet: () => null }));
vi.mock("@/components/provider/EarningsRow", () => ({ EarningsRow: () => null }));
vi.mock("@/lib/auth-context", () => ({ useAuth: () => ({ user: { name: "Ravi" } }) }));
vi.mock("@/lib/install", () => ({
  useInstallState: () => ({ state: "installed", promptInstall: vi.fn() }),
}));
vi.mock("@/lib/fcm", () => ({
  getPushPermission: () => Promise.resolve("granted"),
  enablePushNotifications: vi.fn(),
}));
vi.mock("@/hooks/useApi", () => ({
  useBookings: () => bookings(),
  useProviderProfile: () => profile(),
  useProviderServices: () => services(),
  useSetOnlineStatus: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useCancelBooking: () => ({ mutate: vi.fn(), isPending: false }),
  useMarkEnRoute: () => ({ mutate: vi.fn(), isPending: false }),
  useStartBooking: () => ({ mutate: vi.fn(), isPending: false }),
  useCompleteBooking: () => ({ mutate: vi.fn(), isPending: false }),
}));
vi.mock("@/hooks/useTeam", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/hooks/useTeam")>()),
  useTeam: () => teamQuery(),
  useAssignPro: () => ({ mutate: vi.fn(), isPending: false }),
}));
vi.mock("@/hooks/useBookingOffer", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/hooks/useBookingOffer")>()),
  useBookingOffer: () => ({ data: offer(), error: null, isLoading: false }),
  useAcceptOffer: () => ({ mutate: vi.fn(), isPending: false }),
}));

import { Route as HomeRoute } from "@/routes/provider/index";
import { LiveJobs } from "@/components/provider/LiveJobs";
import { IncomingRequestCard } from "@/components/provider/IncomingRequestCard";
import { TeamPicker } from "@/components/provider/TeamPicker";
import { teamErrorMessage } from "@/hooks/useTeam";
import { acceptErrorMessage } from "@/hooks/useBookingOffer";
import { FixedLanguage } from "@/i18n/LanguageProvider";
import { englishT } from "@/i18n";
import i18n from "@/i18n";
import type { AppLanguage } from "@/i18n/languages";
import type { Booking } from "@/lib/mock-data";

const Home = (HomeRoute as unknown as { component: () => React.ReactElement }).component;

/** A rendered i18n key looks like `home.title` / `picker.assignTo`. */
const RAW_KEY = /\b[a-z]+[A-Za-z]*\.[a-z][A-Za-z_]+\b/;
const DEVANAGARI_DIGIT = /[०-९]/;
const LATIN_LETTERS_ONLY_ENGLISH = /You're|Provider Home|Identity verified|No jobs right now/;

function inLang(lang: AppLanguage, ui: React.ReactNode) {
  return render(<FixedLanguage lang={lang}>{ui}</FixedLanguage>);
}

const pageText = () => document.body.textContent ?? "";

const job = (over: Partial<Booking> = {}) =>
  ({
    id: "b1",
    status: "ACCEPTED",
    service: { name: "Bathroom deep cleaning" },
    address: { id: "a1", full: "12 MG Road, Kharadi", label: "Home", lat: 1, lng: 2 },
    providerPayout: 125000,
    scheduledAt: undefined,
    ...over,
  }) as unknown as Booking;

const OFFER = {
  booking_id: "b1",
  service_name: "Bathroom deep cleaning",
  service_amount: 125000,
  full_address: "Flat 7, Karve Nagar, Pune",
  distance_km: 0.4,
  expires_at: "2026-09-14T18:35:37.541591Z",
  seconds_remaining: 104,
};

const PROS = [
  {
    id: "me",
    display_name: "Ravi",
    profile_photo_url: null,
    is_self: true,
    busy: false,
    accepts_direct_jobs: true,
  },
  {
    id: "p2",
    display_name: "Suresh Patil",
    profile_photo_url: null,
    is_self: false,
    busy: true,
    accepts_direct_jobs: true,
  },
];

beforeEach(() => {
  vi.clearAllMocks();
  profile.mockReturnValue({
    data: { kyc_status: "submitted", is_online: false, profile_photo_url: null },
    isLoading: false,
  });
  services.mockReturnValue({ data: [] });
  bookings.mockReturnValue({ data: [], isLoading: false, isError: false });
  teamQuery.mockReturnValue({ data: undefined });
  offer.mockReturnValue(OFFER);
});

const COPY = {
  hi: {
    homeTitle: "प्रोवाइडर होम",
    kyc: "पहचान सत्यापित",
    accepted: "स्वीकार किया",
    away: "0.4 km दूर",
    accept: "स्वीकार करें",
    picker: "यह काम कौन करेगा?",
    assignTo: "Suresh Patil को सौंपें",
    busy: "काम पर है",
  },
  mr: {
    homeTitle: "प्रोव्हायडर होम",
    kyc: "ओळख पडताळली",
    accepted: "स्वीकारले",
    away: "0.4 km दूर",
    accept: "स्वीकारा",
    picker: "हे काम कोण करेल?",
    assignTo: "Suresh Patil यांना सोपवा",
    busy: "कामावर आहे",
  },
} as const;

describe.each(["hi", "mr"] as const)("SP screens in %s", (lang) => {
  it("translates Home: header, switch, readiness checklist", () => {
    inLang(lang, <Home />);
    expect(screen.getByText(COPY[lang].homeTitle)).toBeInTheDocument();
    expect(screen.getByText(COPY[lang].kyc)).toBeInTheDocument();
    expect(pageText()).not.toMatch(RAW_KEY);
    expect(pageText()).not.toMatch(LATIN_LETTERS_ONLY_ENGLISH);
  });

  it("translates the live job card, keeps the address and Latin digits", () => {
    inLang(lang, <LiveJobs jobs={[job()]} isLoading={false} isError={false} />);
    expect(screen.getByText(COPY[lang].accepted)).toBeInTheDocument();
    expect(screen.getByText("12 MG Road, Kharadi")).toBeInTheDocument();
    expect(screen.getByText("Bathroom deep cleaning")).toBeInTheDocument();
    // Indian grouping, Latin digits, in every language.
    expect(screen.getByText("₹1,25,000")).toBeInTheDocument();
    expect(pageText()).not.toMatch(DEVANAGARI_DIGIT);
    expect(pageText()).not.toMatch(RAW_KEY);
    expect(pageText()).not.toMatch(/View all jobs|Accepted/);
  });

  it("translates the incoming request card, keeps the service and address", () => {
    inLang(lang, <IncomingRequestCard bookingId="b1" onDismiss={vi.fn()} />);
    expect(screen.getByText(COPY[lang].away)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: COPY[lang].accept })).toBeInTheDocument();
    expect(screen.getByText("Flat 7, Karve Nagar, Pune")).toBeInTheDocument();
    expect(screen.getByText("₹1,25,000")).toBeInTheDocument();
    expect(pageText()).not.toMatch(DEVANAGARI_DIGIT);
    expect(pageText()).not.toMatch(/New job nearby|Ignore/);
  });

  it("translates the team picker, keeps the member's name", () => {
    inLang(
      lang,
      <TeamPicker
        bookingId="b1"
        pros={PROS}
        expired={false}
        onBack={vi.fn()}
        onDismiss={vi.fn()}
      />,
    );
    expect(screen.getByText(COPY[lang].picker)).toBeInTheDocument();
    expect(screen.getByText(COPY[lang].busy)).toBeInTheDocument();
    expect(screen.getByText("Suresh Patil")).toBeInTheDocument();
    expect(pageText()).not.toMatch(RAW_KEY);
    expect(pageText()).not.toMatch(/Who's doing|On a job|\(You\)/);
  });

  it("translates every team error code, and keeps an uncoded server message", () => {
    const t = i18n.getFixedT(lang, "provider");
    for (const code of [
      "PRO_BUSY",
      "PRO_OFFLINE",
      "INVITE_ALREADY_PENDING",
      "NO_TEAM_TO_DISPATCH",
    ]) {
      const text = teamErrorMessage(new ApiError(409, "english", undefined, code), t);
      expect(text, code).not.toMatch(RAW_KEY);
      expect(text, code).not.toBe("english");
    }
    expect(teamErrorMessage(new ApiError(400, "Server said so"), t)).toBe("Server said so");
    expect(teamErrorMessage(new TypeError("Failed to fetch"), t)).not.toMatch(/Failed to fetch/);
  });

  it("translates the accept failure, never a raw browser string", () => {
    const t = i18n.getFixedT(lang, "provider");
    expect(acceptErrorMessage(new TypeError("Failed to fetch"), t, lang)).not.toMatch(
      /Failed to fetch|Could not accept/,
    );
  });
});

describe("SP screens in English", () => {
  it("are what they were before translation", () => {
    profile.mockReturnValue({
      data: { kyc_status: "verified", is_online: true, profile_photo_url: null },
      isLoading: false,
    });
    services.mockReturnValue({ data: ["s1", "s2"] });
    inLang("en", <Home />);
    expect(screen.getByText("Provider Home")).toBeInTheDocument();
    expect(screen.getByText("You're online")).toBeInTheDocument();
    expect(screen.getByText("You're subscribed to 2 services.")).toBeInTheDocument();
    expect(screen.getByRole("switch", { name: "Accept job requests" })).toBeInTheDocument();
  });

  it("keeps the singular service line", () => {
    services.mockReturnValue({ data: ["s1"] });
    profile.mockReturnValue({
      data: { kyc_status: "verified", is_online: true, profile_photo_url: null },
      isLoading: false,
    });
    inLang("en", <Home />);
    expect(screen.getByText("You're subscribed to 1 service.")).toBeInTheDocument();
  });

  it("keeps the helpers' English when no t is passed", () => {
    expect(teamErrorMessage(new ApiError(409, "x", undefined, "PRO_BUSY"))).toBe(
      "They're on another job right now. Pick someone else.",
    );
    expect(teamErrorMessage(new ApiError(429, "x"))).toBe(
      "Too many invites in the last hour. Try again later.",
    );
    expect(teamErrorMessage("??")).toBe(
      "Something went wrong. Check your connection and try again.",
    );
    expect(acceptErrorMessage("??")).toBe("Could not accept this job.");
    expect(englishT("provider")("incoming.selfNotTaking")).toBe(
      "You've switched off taking jobs yourself. Switch it back on in My Team to take this one.",
    );
  });
});
