/**
 * Earnings, payouts and the payout method in Hindi and Marathi (SVC-376).
 *
 * The chart is where Latin digits are easiest to lose: day and month names
 * come from Intl, and `mr-IN` left to itself writes १, २, ३. The endpoint
 * strip under the month chart and its readout are what a Marathi SP reads,
 * so those are pinned in mr. Everything is pinned in English beside it: with
 * i18n off the strings must be what they were.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

const { summary } = vi.hoisted(() => ({ summary: vi.fn() }));
vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, ...props }: React.PropsWithChildren<Record<string, unknown>>) => (
    <a {...props}>{children}</a>
  ),
}));
vi.mock("@/hooks/useApi", () => ({ useProviderPayoutSummary: () => summary() }));

import { MonthEarningsChart } from "@/components/provider/MonthEarningsChart";
import { EarningsWindow } from "@/components/provider/EarningsWindow";
import { PayoutSummary } from "@/components/provider/PayoutSummary";
import { FixedLanguage } from "@/i18n/LanguageProvider";
import i18n from "@/i18n";
import type { AppLanguage } from "@/i18n/languages";
import { bucketMonth, bucketWeek } from "@/lib/earnings-buckets";
import { RANGE_META, rangeMeta } from "@/lib/earnings-ranges";
import { payoutState } from "@/lib/payout-status";
import { validateAccountNumber, validateIfsc, validateVpa } from "@/lib/payout-validation";

const RAW_KEY = /\b[a-z]+[A-Za-z]*\.[a-z][A-Za-z_]+\b/;
const DEVANAGARI = /[ऀ-ॿ]/;
const DEVANAGARI_DIGIT = /[०-९]/;

const inLang = (lang: AppLanguage, ui: React.ReactNode) =>
  render(<FixedLanguage lang={lang}>{ui}</FixedLanguage>);
const pageText = () => document.body.textContent ?? "";

const job = (completed_at: string, payout_amount: number, over: Record<string, unknown> = {}) => ({
  booking_id: Math.random().toString(36).slice(2),
  service_name: "Bathroom deep cleaning",
  completed_at,
  payout_amount,
  tip_amount: 0,
  ...over,
});

/** The 12th of the current IST month at midday — a two-digit day on purpose. */
function twelfthThisMonth() {
  const ist = new Date(Date.now() + (5 * 60 + 30) * 60 * 1000);
  return new Date(Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), 12, 6, 30)).toISOString();
}

beforeEach(() => vi.clearAllMocks());

describe("the month chart in Marathi", () => {
  it("names the day in Marathi with Latin digits", () => {
    inLang("mr", <MonthEarningsChart bookings={[job(twelfthThisMonth(), 125000)]} />);
    const text = pageText();
    // The resting readout names the best day: "12 <month>" — Latin 12, a
    // Devanagari month.
    expect(text).toMatch(/12 [ऀ-ॿ]/);
    // The endpoint strip's first label is the 1st, also Latin.
    expect(text).toMatch(/1 [ऀ-ॿ]/);
    expect(text).toContain("₹1,25,000");
    expect(text).toContain("त्या दिवसासाठी एखाद्या बारवर टॅप करा");
    expect(text).not.toMatch(DEVANAGARI_DIGIT);
    expect(text).not.toMatch(/By day|Tap a bar/);
  });
});

describe("chart buckets", () => {
  const THU = new Date("2026-09-17T06:00:00Z");

  it("keep English exactly as before", () => {
    const week = bucketWeek([], THU);
    expect(week.map((b) => b.label)).toEqual(["M", "T", "W", "T", "F", "S", "S"]);
    expect(week[0].fullLabel).toBe("Monday");
    expect(bucketMonth([], THU)[23].fullLabel).toBe("24 Sep");
  });

  it.each(["hi", "mr"] as const)("name days and months in %s with Latin digits", (lang) => {
    const week = bucketWeek([], THU, lang);
    for (const b of week) {
      expect(b.label).toMatch(DEVANAGARI);
      expect(b.fullLabel).toMatch(DEVANAGARI);
    }
    // Monday stays first, whatever the locale's own week start.
    expect(week[0].fullLabel).toBe("सोमवार");
    const month = bucketMonth([], THU, lang);
    expect(month[23].fullLabel).toMatch(/^24 [ऀ-ॿ]/);
    expect(month.map((b) => b.fullLabel).join(" ")).not.toMatch(DEVANAGARI_DIGIT);
  });
});

describe("range labels", () => {
  it("say in English exactly what RANGE_META says", () => {
    for (const range of ["today", "week", "month", "all"] as const) {
      const { inline, ...meta } = rangeMeta(range);
      expect(meta).toEqual(RANGE_META[range]);
      expect(inline).toBe(RANGE_META[range].tab.toLowerCase());
    }
  });
});

describe.each(["hi", "mr"] as const)("earnings and payouts in %s", (lang) => {
  const t = i18n.getFixedT(lang, "provider");

  it("translates the window, the payout chip and the tip, with Latin digits", () => {
    inLang(
      lang,
      <EarningsWindow
        range="today"
        period={{
          data: {
            range: "today",
            total_payout: 125000,
            completed_count: 1,
            bookings: [
              job("2026-09-14T11:00:00Z", 125000, {
                tip_amount: 50,
                payment_method: "cash",
                settlement_status: null,
              }),
            ],
          } as never,
          isLoading: false,
          isError: false,
          refetch: vi.fn(),
        }}
      />,
    );
    expect(screen.getByText("Bathroom deep cleaning")).toBeInTheDocument();
    expect(pageText()).toContain(t("payoutStatus.cash"));
    expect(pageText()).toContain(t("earnings.tipIncluded", { amount: "₹50" }));
    expect(pageText()).not.toMatch(DEVANAGARI_DIGIT);
    expect(pageText()).not.toMatch(RAW_KEY);
    expect(pageText()).not.toMatch(/TODAY|Collected in cash|incl\./);
  });

  it("translates the payout summary's netting explanation", () => {
    summary.mockReturnValue({
      data: {
        balance_owed: 0,
        payout_set: true,
        pending_amount: 2900,
        gross_amount: 3480,
        pending_booking_count: 3,
        last_paid_at: "2026-09-14T11:00:00Z",
        last_paid_amount: 1500,
      },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });
    inLang(lang, <PayoutSummary />);
    expect(pageText()).toContain(t("payoutSummary.awaitingJobs", { count: 3 }));
    expect(pageText()).toContain("₹2,900");
    expect(pageText()).not.toMatch(DEVANAGARI_DIGIT);
    expect(pageText()).not.toMatch(RAW_KEY);
    expect(pageText()).not.toMatch(/Coming to you|Held back|Paid out/);
  });

  it("translates the payout chips and the validation messages", () => {
    expect(payoutState("online", "completed", t)?.label).toBe(t("payoutStatus.paid"));
    for (const message of [
      validateVpa("", t),
      validateVpa("bad", t),
      validateAccountNumber("12", t),
      validateIfsc("x", t),
    ]) {
      expect(message).toMatch(DEVANAGARI);
      expect(message).not.toMatch(RAW_KEY);
    }
  });
});

describe("earnings and payouts in English", () => {
  it("keep the helpers' strings when no t is passed", () => {
    expect(payoutState("cash", null)?.label).toBe("Collected in cash");
    expect(payoutState("online", "reversed")?.label).toBe("Payout reversed");
    expect(validateVpa("")).toBe("Enter your UPI ID.");
    expect(validateAccountNumber("12")).toBe("Account number must be 5–34 digits.");
    expect(validateIfsc("x")).toBe("Enter a valid IFSC, e.g. HDFC0001234.");
  });

  it("render the summary as before", () => {
    summary.mockReturnValue({
      data: {
        balance_owed: 0,
        payout_set: true,
        pending_amount: 2900,
        gross_amount: 3480,
        pending_booking_count: 1,
        last_paid_at: null,
        last_paid_amount: null,
      },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });
    inLang("en", <PayoutSummary />);
    expect(screen.getByText("1 job awaiting payout")).toBeInTheDocument();
    expect(screen.getByText("no payouts yet")).toBeInTheDocument();
    expect(screen.getByText("Coming to you")).toBeInTheDocument();
  });
});
