/**
 * The Pro app's job steps in Hindi and Marathi (SVC-375): the copy is
 * translated, nothing renders as a raw key, digits stay Latin, and the
 * customer's address and the SP's business name stay as typed.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

const { toast } = vi.hoisted(() => ({
  toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }),
}));

vi.mock("@/hooks/useApi", () => ({
  useCancelBooking: () => ({ mutate: vi.fn(), isPending: false }),
  useMarkEnRoute: () => ({ mutate: vi.fn(), isPending: false }),
  useStartBooking: () => ({ mutate: vi.fn(), isPending: false }),
  useCompleteBooking: () => ({ mutate: vi.fn(), isPending: false }),
}));
vi.mock("@/hooks/usePro", () => ({
  useProEnRoute: () => ({ mutate: vi.fn(), isPending: false }),
  useProStart: () => ({ mutate: vi.fn(), isPending: false }),
  useProComplete: () => ({ mutate: vi.fn(), isPending: false }),
  useDeclineProJob: () => ({ mutate: vi.fn(), isPending: false }),
}));
vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => vi.fn(),
  useRouterState: ({ select }: { select: (s: unknown) => unknown }) =>
    select({ location: { pathname: "/pro/jobs/b1" } }),
}));
vi.mock("@/components/AccountAvatar", () => ({ AccountAvatar: () => null }));
vi.mock("sonner", () => ({ toast }));

import { CompleteStep, DoorstepOtpStep, EnRouteStep } from "@/components/provider/JobActions";
import { JobAddress } from "@/components/provider/JobAddress";
import { ProHeader } from "@/components/pro/ProHeader";
import { FixedLanguage } from "@/i18n/LanguageProvider";
import type { AppLanguage } from "@/i18n/languages";

/** A rendered i18n key looks like `job.onMyWay` / `decline.title`. */
const RAW_KEY = /\b[a-z]+[A-Za-z]*\.[a-z][A-Za-z_]+\b/;
const DEVANAGARI_DIGIT = /[०-९]/;

function inLang(lang: AppLanguage, ui: React.ReactNode) {
  return render(<FixedLanguage lang={lang}>{ui}</FixedLanguage>);
}

function pageText() {
  return document.body.textContent ?? "";
}

beforeEach(() => vi.clearAllMocks());

const COPY = {
  hi: {
    onMyWay: "मैं रास्ते में हूँ",
    decline: "यह काम नहीं कर सकते?",
    pin: "4 अंकों का PIN पूछें",
  },
  mr: { onMyWay: "मी मार्गावर आहे", decline: "हे काम करू शकत नाही?", pin: "4 अंकी PIN विचारा" },
} as const;

describe.each(["hi", "mr"] as const)("Pro job steps in %s", (lang) => {
  it("translates I'm on my way and the decline link", () => {
    inLang(lang, <EnRouteStep bookingId="b1" actor="pro" />);
    expect(screen.getByRole("button", { name: COPY[lang].onMyWay })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: COPY[lang].decline })).toBeInTheDocument();
    expect(pageText()).not.toMatch(RAW_KEY);
    expect(pageText()).not.toMatch(/on my way|Can’t do this job/i);
  });

  it("translates the decline confirmation", () => {
    inLang(lang, <EnRouteStep bookingId="b1" actor="pro" />);
    fireEvent.click(screen.getByRole("button", { name: COPY[lang].decline }));
    expect(screen.getByRole("alertdialog").textContent).not.toMatch(RAW_KEY);
    expect(screen.getByRole("alertdialog").textContent).not.toMatch(/Decline|Keep the job/);
  });

  it("keeps the PIN's digits Latin", () => {
    inLang(lang, <DoorstepOtpStep bookingId="b1" compact actor="pro" />);
    expect(screen.getByText(COPY[lang].pin)).toBeInTheDocument();
    expect(pageText()).not.toMatch(DEVANAGARI_DIGIT);
  });

  it("translates Mark as Complete", () => {
    inLang(lang, <CompleteStep bookingId="b1" actor="pro" />);
    expect(pageText()).not.toMatch(/Mark as Complete|Job in progress/);
    expect(pageText()).not.toMatch(RAW_KEY);
  });

  it("leaves the customer's address as typed and translates Navigate", () => {
    inLang(
      lang,
      <JobAddress
        address={{ id: "a1", full: "12 MG Road, Kharadi", label: "Home", lat: 1, lng: 2 }}
      />,
    );
    expect(screen.getByText("12 MG Road, Kharadi")).toBeInTheDocument();
    expect(screen.queryByText("Navigate")).not.toBeInTheDocument();
  });

  it("leaves the SP's business name as typed", () => {
    inLang(
      lang,
      <ProHeader
        title="x"
        team={{ user_id: "sp1", business_name: "Sparkle Cleaners", business_image_url: null }}
      />,
    );
    expect(pageText()).toContain("Sparkle Cleaners");
    expect(pageText()).not.toMatch(/Working with/);
  });
});

describe("Pro job steps in English", () => {
  it("are what they were before translation", () => {
    inLang("en", <EnRouteStep bookingId="b1" actor="pro" />);
    expect(screen.getByRole("button", { name: "I’m on my way" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Can’t do this job?" })).toBeInTheDocument();
  });
});
