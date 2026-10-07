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

function setup(members: unknown[], sent: unknown[] = []) {
  team.mockReturnValue({ data: members, isLoading: false, isError: false });
  invites.mockReturnValue({ data: sent, isLoading: false, isError: false });
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
