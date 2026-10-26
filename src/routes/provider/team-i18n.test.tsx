/**
 * My Team, a member's earnings and the invite in Hindi and Marathi (SVC-376),
 * and the invite share text: in the sender's language with today's English
 * underneath, and byte-for-byte today's string in English (which is also what
 * i18n off always gives, since the screen's language is then English).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

const { byPro } = vi.hoisted(() => ({ byPro: vi.fn() }));

vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (opts: unknown) => opts,
  Link: ({ children, ...props }: React.PropsWithChildren<Record<string, unknown>>) => (
    <a {...props}>{children}</a>
  ),
}));
vi.mock("sonner", () => ({ toast: Object.assign(vi.fn(), { error: vi.fn(), success: vi.fn() }) }));
vi.mock("@/components/BackButton", () => ({ BackButton: () => null }));
vi.mock("@/hooks/useApi", () => ({
  useProviderProfile: () => ({ data: { kyc_status: "verified" } }),
}));
vi.mock("@/hooks/useTeam", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/hooks/useTeam")>()),
  useTeam: () => ({
    data: [
      {
        id: "me",
        display_name: "Ravi",
        is_self: true,
        is_online: true,
        kyc_status: "verified",
        accepts_direct_jobs: true,
        profile_photo_url: null,
      },
      {
        id: "p2",
        display_name: "Suresh Patil",
        is_self: false,
        is_online: false,
        kyc_status: "submitted",
        accepts_direct_jobs: true,
        profile_photo_url: null,
      },
    ],
    isLoading: false,
    isError: false,
  }),
  useTeamInvites: () => ({
    data: [
      {
        id: "i1",
        status: "PENDING",
        invitee_phone: "+919876500002",
        token: "482913",
        invite_url: "https://app.eazyserv.com/invite?code=482913",
        expires_at: "2026-10-31T10:00:00Z",
      },
    ],
    isLoading: false,
    isError: false,
  }),
  useRemoveMember: () => ({ mutate: vi.fn(), isPending: false }),
  useRevokeInvite: () => ({ mutate: vi.fn(), isPending: false }),
  useSelfPro: () => ({ data: undefined }),
  useSetSelfPro: () => ({ mutate: vi.fn(), isPending: false }),
  useCreateInvite: () => ({ mutate: vi.fn(), isPending: false }),
}));
vi.mock("@/hooks/useProEarnings", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/hooks/useProEarnings")>()),
  useEarningsByPro: (range: string) => byPro(range),
}));

import { Route as TeamRoute } from "@/routes/provider/team/index";
import { Route as InviteRoute } from "@/routes/provider/team/invite";
import { inviteMessage } from "@/hooks/useTeam";
import { FixedLanguage } from "@/i18n/LanguageProvider";
import i18n from "@/i18n";
import type { AppLanguage } from "@/i18n/languages";

const Team = (TeamRoute as unknown as { component: () => React.ReactElement }).component;
const Invite = (InviteRoute as unknown as { component: () => React.ReactElement }).component;

const RAW_KEY = /\b[a-z]+[A-Za-z]*\.[a-z][A-Za-z_]+\b/;
const DEVANAGARI = /[ऀ-ॿ]/;
const DEVANAGARI_DIGIT = /[०-९]/;
const inLang = (lang: AppLanguage, ui: React.ReactNode) =>
  render(<FixedLanguage lang={lang}>{ui}</FixedLanguage>);
const pageText = () => document.body.textContent ?? "";

const INVITE = { token: "482913", invite_url: "https://app.eazyserv.com/invite?code=482913" };
/** Today's string, written out — not built from the code under test. */
const TODAYS_ENGLISH =
  "You're invited to join my team on Eazyserv. Your invite code is 482913 (valid for 7 days). https://app.eazyserv.com/invite?code=482913";

beforeEach(() => {
  vi.clearAllMocks();
  byPro.mockImplementation((range: string) => ({
    data: {
      range,
      total_payout: 125000,
      completed_count: 3,
      pros: [
        {
          professional_id: "me",
          display_name: "Ravi",
          is_self: true,
          is_active: true,
          payout: 100000,
          completed_count: 2,
        },
        {
          professional_id: "p2",
          display_name: "Suresh Patil",
          is_self: false,
          is_active: true,
          payout: 25000,
          completed_count: 1,
        },
      ],
    },
    isError: false,
  }));
});

describe("the invite share text", () => {
  it("is byte-for-byte today's string in English", () => {
    expect(inviteMessage(INVITE)).toBe(TODAYS_ENGLISH);
    expect(inviteMessage(INVITE, "en")).toBe(TODAYS_ENGLISH);
  });

  it.each(["hi", "mr"] as const)(
    "in %s, leads with the sender's language and ends with today's English",
    (lang) => {
      const text = inviteMessage(INVITE, lang);
      expect(text.endsWith(`\n\n${TODAYS_ENGLISH}`)).toBe(true);
      const own = text.slice(0, text.length - TODAYS_ENGLISH.length - 2);
      expect(own).toMatch(DEVANAGARI);
      expect(own).toContain("482913");
      // One link, so WhatsApp previews one URL.
      expect(text.split("https://").length - 1).toBe(1);
    },
  );
});

describe.each(["hi", "mr"] as const)("team screens in %s", (lang) => {
  const t = i18n.getFixedT(lang, "provider");

  it("translates My Team and keeps names, phone numbers and codes as typed", () => {
    inLang(lang, <Team />);
    expect(screen.getByText(t("team.title"))).toBeInTheDocument();
    expect(screen.getByText("Suresh Patil")).toBeInTheDocument();
    expect(screen.getByText("+919876500002")).toBeInTheDocument();
    expect(screen.getByText("482913")).toBeInTheDocument();
    expect(pageText()).toContain(t("team.kycSubmitted"));
    expect(pageText()).toContain(t("team.pendingInvites", { count: 1 }));
    expect(pageText()).toContain("₹1,25,000");
    expect(pageText()).not.toMatch(DEVANAGARI_DIGIT);
    expect(pageText()).not.toMatch(RAW_KEY);
    expect(pageText()).not.toMatch(/My Team|KYC in review|Pending invites|Copy invite|Revoke/);
  });

  it("translates the invite form", () => {
    inLang(lang, <Invite />);
    expect(screen.getByText(t("invite.title"))).toBeInTheDocument();
    expect(screen.getByRole("button", { name: t("invite.send") })).toBeInTheDocument();
    expect(pageText()).toContain("+91");
    expect(pageText()).not.toMatch(/Invite to team|Phone number|Send invite/);
  });
});

describe("team screens in English", () => {
  it("are what they were before translation", () => {
    inLang("en", <Team />);
    expect(screen.getByText("My Team")).toBeInTheDocument();
    expect(screen.getByText("KYC in review")).toBeInTheDocument();
    expect(screen.getByText("Pending invites · 1")).toBeInTheDocument();
    expect(screen.getByText("Team · 2")).toBeInTheDocument();
    expect(pageText()).toContain("· 3 jobs this week");
  });
});
