/**
 * My Team (SVC-321) for 0, 1 and many members and invites. "0" still has the
 * SP's own row: the backend always returns it, so empty means nobody else.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";

vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (opts: unknown) => opts,
  Link: ({ children, to }: React.PropsWithChildren<{ to: string }>) => <a href={to}>{children}</a>,
  useRouter: () => ({ history: { back: vi.fn(), length: 1 }, navigate: vi.fn() }),
}));
vi.mock("sonner", () => ({ toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }) }));

const team = vi.fn();
const invites = vi.fn();
const removeMutate = vi.fn();
const revokeMutate = vi.fn();
vi.mock("@/hooks/useTeam", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/hooks/useTeam")>();
  return {
    ...actual,
    useTeam: () => team(),
    useTeamInvites: () => invites(),
    useRemoveMember: () => ({ mutate: removeMutate, isPending: false }),
    useRevokeInvite: () => ({ mutate: revokeMutate, isPending: false }),
  };
});

// SVC-323. Keyed by range; unset ranges read as a solo SP's response.
const byPro = vi.fn();
vi.mock("@/hooks/useProEarnings", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/hooks/useProEarnings")>()),
  useEarningsByPro: (range: string) => byPro(range),
}));

import { Route } from "@/routes/provider/team/index";

const Page = (Route as unknown as { component: () => React.ReactElement }).component;

const member = (id: string, over: Record<string, unknown> = {}) => ({
  id,
  display_name: id,
  profile_photo_url: null,
  kyc_status: "verified",
  is_online: false,
  is_active: true,
  is_self: false,
  ...over,
});
const SELF = member("Priya", { is_self: true, is_online: true });
const invite = (id: string, status = "PENDING") => ({
  id,
  invitee_phone: `+91987650000${id}`,
  status,
  expires_at: "2026-10-13T10:00:00Z",
  created_at: "2026-10-06T10:00:00Z",
  token: `00421${id}`,
  invite_url: "https://app.eazyserv.com/invite",
});

const pro = (id: string | null, over: Record<string, unknown> = {}) => ({
  professional_id: id,
  display_name: id ?? "Not assigned",
  profile_photo_url: null,
  is_self: false,
  is_active: id !== null,
  payout: 0,
  completed_count: 0,
  ...over,
});
const loaded = (range: string, pros: ReturnType<typeof pro>[]) => ({
  data: {
    range,
    total_payout: pros.reduce((s, p) => s + p.payout, 0),
    completed_count: pros.reduce((s, p) => s + p.completed_count, 0),
    pros,
  },
  isLoading: false,
  isError: false,
  refetch: vi.fn(),
});
const SOLO = [pro("Priya", { is_self: true })];

function setup(
  members: unknown[],
  sent: unknown[] = [],
  earnings: Record<string, ReturnType<typeof pro>[]> = {},
) {
  team.mockReturnValue({ data: members, isLoading: false, isError: false });
  invites.mockReturnValue({ data: sent, isLoading: false, isError: false });
  byPro.mockImplementation((range: string) => loaded(range, earnings[range] ?? SOLO));
  render(<Page />);
}

beforeEach(() => vi.clearAllMocks());

describe("0 members", () => {
  it("shows the invite CTA, not a one-row list", () => {
    setup([SELF]);
    expect(screen.getByText(/invite your first team member/i)).toBeInTheDocument();
    expect(screen.queryByText(/^Team ·/)).toBeNull();
  });

  it("ignores invites that are no longer pending", () => {
    setup([SELF], [invite("1", "REVOKED"), invite("2", "EXPIRED")]);
    expect(screen.getByText(/invite your first team member/i)).toBeInTheDocument();
  });
});

describe("1 member", () => {
  it("lists them under the SP, with KYC and no way to remove the SP", () => {
    setup([SELF, member("Asha", { kyc_status: "submitted" })]);
    expect(screen.getByText("Team · 2")).toBeInTheDocument();
    expect(screen.getByText("KYC in review")).toBeInTheDocument();
    // One Remove button: Asha's. The SP's own row has none.
    expect(screen.getAllByRole("button", { name: /^remove$/i })).toHaveLength(1);
  });
});

describe("many members and invites", () => {
  it("lists members and pending invites with their codes", () => {
    setup([SELF, member("Asha"), member("Ravi", { is_online: true })], [invite("1"), invite("2")]);
    expect(screen.getByText("Team · 3")).toBeInTheDocument();
    expect(screen.getByText("Pending invites · 2")).toBeInTheDocument();
    expect(screen.getByText("004211")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /copy invite/i })).toHaveLength(2);
  });
});

describe("confirmations", () => {
  it("removes only after confirming, with copy that says nothing is deleted", () => {
    setup([SELF, member("Asha")]);
    fireEvent.click(screen.getByRole("button", { name: /^remove$/i }));
    const dialog = screen.getByRole("alertdialog");
    expect(dialog).toHaveTextContent(/past jobs and reviews stay on record/i);
    expect(dialog).not.toHaveTextContent(/delete/i);
    expect(removeMutate).not.toHaveBeenCalled();
    fireEvent.click(within(dialog).getByRole("button", { name: /^remove$/i }));
    expect(removeMutate).toHaveBeenCalledWith("Asha", expect.anything());
  });

  it("revokes only after confirming", () => {
    setup([SELF], [invite("1")]);
    fireEvent.click(screen.getByRole("button", { name: /^revoke$/i }));
    const dialog = screen.getByRole("alertdialog");
    expect(revokeMutate).not.toHaveBeenCalled();
    fireEvent.click(within(dialog).getByRole("button", { name: /^revoke$/i }));
    expect(revokeMutate).toHaveBeenCalledWith("1", expect.anything());
  });
});

/**
 * SVC-323: each member's earnings inline, from one by-pro call per window.
 * Week figures and all-time membership differ on purpose below, so a test can
 * tell which response a figure came from.
 */
describe("earnings", () => {
  const ALL = [
    pro("Priya", { is_self: true, payout: 5000, completed_count: 10 }),
    pro("Asha", { payout: 3000, completed_count: 6 }),
    pro("Test Pro Seven"),
    pro("Ravi", { is_active: false, payout: 900, completed_count: 2 }),
    pro("Gone", { is_active: false }),
    pro(null, { payout: 400, completed_count: 1 }),
  ];
  const WEEK = [
    pro("Priya", { is_self: true, payout: 700, completed_count: 2 }),
    pro("Asha", { payout: 1250, completed_count: 3 }),
    pro("Test Pro Seven"),
    pro("Ravi", { is_active: false }),
    pro("Gone", { is_active: false }),
    pro(null, { payout: 150, completed_count: 1 }),
  ];
  const MEMBERS = [SELF, member("Asha"), member("Test Pro Seven")];

  it("shows a solo SP no earnings at all", () => {
    setup([SELF]);
    expect(screen.queryByRole("tablist")).toBeNull();
    expect(screen.queryByText(/no jobs yet/i)).toBeNull();
    expect(screen.queryByText(/past members/i)).toBeNull();
  });

  it("puts each member's window figure on their row", () => {
    setup(MEMBERS, [], { all: ALL, week: WEEK });
    expect(screen.getByRole("tab", { name: "This week" })).toHaveAttribute("aria-selected", "true");
    // Total line: ₹2,100 = 700 + 1,250 + 150.
    expect(screen.getByText("₹2,100")).toBeInTheDocument();
    const asha = screen.getByText("Asha").closest("li")!;
    expect(asha).toHaveTextContent("₹1,250");
    expect(asha).toHaveTextContent("3 jobs");
  });

  it("says 'No jobs yet' for a member with none, never ₹0", () => {
    setup(MEMBERS, [], { all: ALL, week: WEEK });
    const seven = screen.getByText("Test Pro Seven").closest("li")!;
    expect(seven).toHaveTextContent(/no jobs yet/i);
    expect(seven).not.toHaveTextContent("₹0");
  });

  it("asks for one window and the lifetime list, never one call per Pro", () => {
    setup(MEMBERS, [], { all: ALL, week: WEEK });
    expect(new Set(byPro.mock.calls.map(([r]) => r))).toEqual(new Set(["all", "week"]));

    fireEvent.click(screen.getByRole("tab", { name: "All time" }));
    expect(byPro).toHaveBeenLastCalledWith("all");
  });

  it("lists removed Pros with history as past members, with the window's figure", () => {
    setup(MEMBERS, [], { all: ALL, week: WEEK });
    const past = screen.getByText("Past members · 1").closest("section")!;
    // Ravi has lifetime jobs but none this week; "Gone" never had any.
    expect(past).toHaveTextContent("Ravi");
    expect(past).toHaveTextContent(/no jobs yet/i);
    expect(past).not.toHaveTextContent("Gone");
    expect(past.querySelector("a")).toHaveAttribute(
      "href",
      "/provider/team/$professionalId/earnings",
    );
  });

  it("shows jobs that finished with no Pro as Not assigned", () => {
    setup(MEMBERS, [], { all: ALL, week: WEEK });
    expect(screen.getByText("Not assigned").parentElement!.parentElement).toHaveTextContent("₹150");
  });

  it("still shows past members to an SP who has removed everyone", () => {
    setup([SELF], [], { all: ALL, week: WEEK });
    expect(screen.getByText(/invite your first team member/i)).toBeInTheDocument();
    expect(screen.getByText("Past members · 1")).toBeInTheDocument();
  });

  it("makes a member row open their earnings, but keeps Remove out of the link", () => {
    setup(MEMBERS, [], { all: ALL, week: WEEK });
    const asha = screen.getByText("Asha").closest("li")!;
    const remove = within(asha).getByRole("button", { name: /^remove$/i });
    expect(remove.closest("a")).toBeNull();
    expect(within(asha).getByRole("link")).toHaveAttribute(
      "href",
      "/provider/team/$professionalId/earnings",
    );

    fireEvent.click(remove);
    expect(screen.getByRole("alertdialog")).toHaveTextContent(/remove asha/i);
  });

  it("shows no figures from a previous window while the next one loads", () => {
    setup(MEMBERS, [], { all: ALL, week: WEEK });
    // The placeholder still carries week data under the month tab.
    byPro.mockImplementation((range: string) =>
      range === "all" ? loaded("all", ALL) : loaded("week", WEEK),
    );
    fireEvent.click(screen.getByRole("tab", { name: "This month" }));
    expect(screen.queryByText("₹1,250")).toBeNull();
  });
});
