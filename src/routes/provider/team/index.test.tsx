/**
 * My Team (SVC-321) for 0, 1 and many members and invites. "0" still has the
 * SP's own row: the backend always returns it, so empty means nobody else.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { toast } from "sonner";
import { ApiError } from "@/lib/api";

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
const selfPro = vi.fn();
const setSelfProMutate = vi.fn();
vi.mock("@/hooks/useTeam", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/hooks/useTeam")>();
  return {
    ...actual,
    useTeam: () => team(),
    useTeamInvites: () => invites(),
    useRemoveMember: () => ({ mutate: removeMutate, isPending: false }),
    useRevokeInvite: () => ({ mutate: revokeMutate, isPending: false }),
    useSelfPro: (enabled: boolean) => selfPro(enabled),
    useSetSelfPro: () => ({ mutate: setSelfProMutate, isPending: false }),
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
  accepts_direct_jobs: true,
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

beforeEach(() => {
  vi.clearAllMocks();
  selfPro.mockReturnValue({ data: undefined });
});

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

/**
 * SVC-326: "I take jobs myself". Only a team SP can switch it off (the backend
 * refuses a solo SP), switching off asks first, and while off the SP is warned
 * when nobody on the team could take a job.
 */
describe("I take jobs myself", () => {
  const OFF = member("Priya", { is_self: true, is_online: true, accepts_direct_jobs: false });
  const toggle = () => screen.getByRole("switch", { name: /i take jobs myself/i });

  it("is hidden from a solo SP", () => {
    setup([SELF]);
    expect(screen.queryByRole("switch")).toBeNull();
    setup([SELF], [invite("1")]);
    expect(screen.queryByRole("switch")).toBeNull();
  });

  it("is on for a team SP, and never calls itself online/offline", () => {
    setup([SELF, member("Asha")]);
    expect(toggle()).toBeChecked();
    expect(toggle().closest("label")).not.toHaveTextContent(/online|offline/i);
  });

  it("switches off only after confirming", () => {
    setup([SELF, member("Asha")]);
    fireEvent.click(toggle());
    const dialog = screen.getByRole("alertdialog");
    expect(dialog).toHaveTextContent(
      "New jobs go to your team. You can still accept and assign them.",
    );
    expect(setSelfProMutate).not.toHaveBeenCalled();
    fireEvent.click(within(dialog).getByRole("button", { name: /^switch off$/i }));
    expect(setSelfProMutate).toHaveBeenCalledWith(false, expect.anything());
  });

  it("keeps taking jobs when the confirm is cancelled", () => {
    setup([SELF, member("Asha")]);
    fireEvent.click(toggle());
    fireEvent.click(screen.getByRole("button", { name: /keep taking jobs/i }));
    expect(setSelfProMutate).not.toHaveBeenCalled();
  });

  it("switches back on without asking", () => {
    setup([OFF, member("Asha")]);
    expect(toggle()).not.toBeChecked();
    fireEvent.click(toggle());
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(setSelfProMutate).toHaveBeenCalledWith(true, expect.anything());
  });

  it("explains NO_TEAM_TO_DISPATCH in a toast", () => {
    setSelfProMutate.mockImplementationOnce((_on, opts) =>
      opts.onError(new ApiError(409, "x", undefined, "NO_TEAM_TO_DISPATCH")),
    );
    setup([SELF, member("Asha")]);
    fireEvent.click(toggle());
    fireEvent.click(screen.getByRole("button", { name: /^switch off$/i }));
    expect(toast.error).toHaveBeenCalledWith(expect.stringMatching(/add someone to your team/i));
  });

  it("stays visible while off, so the SP can always switch back on", () => {
    setup([OFF]);
    expect(toggle()).not.toBeChecked();
  });

  describe("the no-one-available banner", () => {
    const banner = () => screen.queryByText(/nobody on your team is available right now/i);

    it("shows while off and nobody on the team is assignable", () => {
      selfPro.mockReturnValue({
        data: { accepts_direct_jobs: false, team_has_assignable_pro: false },
      });
      setup([OFF, member("Asha")]);
      expect(banner()).toHaveTextContent(
        "Nobody on your team is available right now, so you won’t get new jobs.",
      );
    });

    it("hides when someone on the team is assignable", () => {
      selfPro.mockReturnValue({
        data: { accepts_direct_jobs: false, team_has_assignable_pro: true },
      });
      setup([OFF, member("Asha")]);
      expect(banner()).toBeNull();
    });

    it("isn't fetched, or shown, while the SP takes jobs", () => {
      selfPro.mockReturnValue({
        data: { accepts_direct_jobs: true, team_has_assignable_pro: false },
      });
      setup([SELF, member("Asha")]);
      expect(selfPro).toHaveBeenLastCalledWith(false);
      expect(banner()).toBeNull();
    });

    it("is asked for only while off", () => {
      setup([OFF, member("Asha")]);
      expect(selfPro).toHaveBeenLastCalledWith(true);
    });
  });

  it("says so when removing the last member switched the SP back on", () => {
    removeMutate.mockImplementationOnce((_id, opts) => opts.onSuccess({ self_reenabled: true }));
    setup([OFF, member("Asha")]);
    fireEvent.click(screen.getByRole("button", { name: /^remove$/i }));
    fireEvent.click(
      within(screen.getByRole("alertdialog")).getByRole("button", { name: /^remove$/i }),
    );
    expect(toast).toHaveBeenCalledWith("You're taking jobs yourself again");
  });

  it("says nothing extra on an ordinary removal", () => {
    removeMutate.mockImplementationOnce((_id, opts) => opts.onSuccess({ self_reenabled: false }));
    setup([SELF, member("Asha"), member("Ravi")]);
    fireEvent.click(screen.getAllByRole("button", { name: /^remove$/i })[0]);
    fireEvent.click(
      within(screen.getByRole("alertdialog")).getByRole("button", { name: /^remove$/i }),
    );
    expect(toast.success).toHaveBeenCalled();
    expect(toast).not.toHaveBeenCalled();
  });
});
