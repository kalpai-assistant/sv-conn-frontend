/**
 * SVC-329 admin teams pages: the owner search and one owner's team.
 *
 * Load-bearing:
 * - search sends `q` only from 2 characters (the backend 422s on 1), pages
 *   on until a short page, and a row opens that owner
 * - removed members are listed and marked, and neither they nor the owner's
 *   own row offer Force-remove / Reassign
 * - invites and the admin history render, a move linking the other team
 */
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError } from "@/lib/api";
import type {
  API_AdminActionRow,
  API_AdminInviteRow,
  API_AdminProviderRow,
  API_AdminTeamPro,
} from "@/hooks/useApi";

const apiFetch = vi.fn();
const navigate = vi.fn();
const params = { spUserId: "sp-1" };

vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api");
  return { ...actual, apiFetch: (...args: unknown[]) => apiFetch(...args) };
});

vi.mock("@tanstack/react-router", async () => {
  const actual =
    await vi.importActual<typeof import("@tanstack/react-router")>("@tanstack/react-router");
  return {
    ...actual,
    useNavigate: () => navigate,
    createFileRoute: () => (opts: { component: unknown }) => ({
      ...opts,
      useParams: () => params,
    }),
    Link: ({
      to,
      params: p,
      children,
    }: {
      to: string;
      params?: Record<string, string>;
      children: React.ReactNode;
    }) => <a href={p ? to.replace("$spUserId", p.spUserId) : to}>{children}</a>,
  };
});

import { Route as ListRoute } from "@/routes/admin.teams.index";
import { Route as OwnerRoute } from "@/routes/admin.teams.$spUserId";

const ListPage = (ListRoute as unknown as { component: React.FC }).component;
const OwnerPage = (OwnerRoute as unknown as { component: React.FC }).component;

function wrap(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

const owner = (i: number, o: Partial<API_AdminProviderRow> = {}): API_AdminProviderRow => ({
  user_id: `sp-${i}`,
  name: `Owner ${i}`,
  phone: `+9198765000${String(i).padStart(2, "0")}`,
  business_name: null,
  kyc_status: "verified",
  is_online: false,
  user_is_active: true,
  active_pro_count: 0,
  created_at: "2026-10-01T00:00:00Z",
  ...o,
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe("/admin/teams search", () => {
  it("lists every owner with no query, then searches from 2 characters", async () => {
    apiFetch.mockResolvedValue([owner(1, { business_name: "Sparkle Co", active_pro_count: 2 })]);
    wrap(<ListPage />);
    // Cards render beside the table in jsdom (no CSS), so read the table.
    const table = await screen.findByRole("table");
    expect(within(table).getByText("Sparkle Co")).toBeInTheDocument();
    expect(within(table).getByText("2 members")).toBeInTheDocument();
    expect(apiFetch).toHaveBeenLastCalledWith("/admin/providers?page=1&per_page=50");

    await userEvent.type(screen.getByLabelText("Search owners"), "9");
    expect(screen.getByText("Type at least 2 characters.")).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText("Search owners"), "8");
    await waitFor(() =>
      expect(apiFetch).toHaveBeenLastCalledWith("/admin/providers?q=98&page=1&per_page=50"),
    );
    expect(apiFetch).not.toHaveBeenCalledWith(expect.stringContaining("q=9&"));
  });

  it("offers the next page only while pages come back full", async () => {
    const full = Array.from({ length: 50 }, (_, i) => owner(i + 1));
    apiFetch.mockImplementation((path: string) =>
      Promise.resolve(path.includes("page=1&") ? full : [owner(99)]),
    );
    wrap(<ListPage />);
    await userEvent.click(await screen.findByRole("button", { name: "Load more" }));
    await waitFor(() =>
      expect(within(screen.getByRole("table")).getByText("Owner 99")).toBeInTheDocument(),
    );
    expect(apiFetch).toHaveBeenLastCalledWith("/admin/providers?page=2&per_page=50");
    expect(screen.queryByRole("button", { name: "Load more" })).toBeNull();
    expect(screen.getByText("Showing 51")).toBeInTheDocument();
  });

  it("opens an owner's team from their row", async () => {
    apiFetch.mockResolvedValue([owner(4)]);
    wrap(<ListPage />);
    await userEvent.click(within(await screen.findByRole("table")).getByText("Owner 4"));
    expect(navigate).toHaveBeenCalledWith({
      to: "/admin/teams/$spUserId",
      params: { spUserId: "sp-4" },
    });
  });

  it("shows team size, KYC and online on the phone card, which opens the team", async () => {
    apiFetch.mockResolvedValue([
      owner(4, { business_name: "Sparkle Co", active_pro_count: 3, is_online: true }),
    ]);
    wrap(<ListPage />);
    const card = await screen.findByTestId("owner-card-sp-4");
    expect(within(card).getByText("3 members")).toBeInTheDocument();
    expect(within(card).getByText("KYC verified")).toBeInTheDocument();
    expect(within(card).getByText("Online")).toBeInTheDocument();
    expect(within(card).getByText("+919876500004")).toBeInTheDocument();
    expect(card).toHaveTextContent("Owner 4 · Sparkle Co");
    await userEvent.click(card);
    expect(navigate).toHaveBeenCalledWith({
      to: "/admin/teams/$spUserId",
      params: { spUserId: "sp-4" },
    });
  });
});

const member = (p: Partial<API_AdminTeamPro>): API_AdminTeamPro => ({
  id: "pro-x",
  service_provider_id: "sp-1",
  user_id: "u-x",
  display_name: "Someone",
  phone: "+919876500050",
  user_is_active: true,
  profile_photo_url: null,
  kyc_status: "verified",
  is_online: false,
  is_active: true,
  is_self: false,
  accepts_direct_jobs: true,
  active_job_count: 0,
  created_at: "2026-10-01T00:00:00Z",
  ...p,
});

const TEAM = [
  member({
    id: "pro-self",
    user_id: "sp-1",
    display_name: "Owner Self",
    is_self: true,
    accepts_direct_jobs: false,
  }),
  member({ id: "pro-7", display_name: "Test Pro Seven", is_online: true, active_job_count: 1 }),
  member({ id: "pro-old", display_name: "Gone Pro", is_active: false, kyc_status: "pending" }),
];

const INVITES: API_AdminInviteRow[] = [
  {
    id: "inv-1",
    invitee_phone: "+919876500007",
    status: "ACCEPTED",
    expires_at: "2026-10-03T00:00:00Z",
    created_at: "2026-10-01T00:00:00Z",
    accepted_at: "2026-10-02T00:00:00Z",
    accepted_by_user_id: "u-7",
    revoked_at: null,
  },
  {
    id: "inv-2",
    invitee_phone: "+919876500099",
    status: "EXPIRED",
    expires_at: "2026-10-05T00:00:00Z",
    created_at: "2026-10-04T00:00:00Z",
    accepted_at: null,
    accepted_by_user_id: null,
    revoked_at: null,
  },
];

const ACTIONS: API_AdminActionRow[] = [
  {
    id: "act-1",
    admin_user_id: "admin-1",
    admin_name: "Vipul",
    action: "pro_reassigned",
    target_type: "professional",
    target_id: "pro-old",
    sp_user_id: "sp-1",
    to_sp_user_id: "sp-2",
    reason: "Business merged",
    details: { reactivated: false, kyc_status: "pending", to_professional_id: "pro-new" },
    created_at: "2026-10-09T00:00:00Z",
  },
];

const OWNER_ROW = owner(1, {
  name: "Tush",
  business_name: "Tush Home Care",
  kyc_status: "verified",
  is_online: true,
  active_pro_count: 1,
});

function stubOwner(
  team: API_AdminTeamPro[] = TEAM,
  ownerRow: () => Promise<unknown> = () => Promise.resolve(OWNER_ROW),
) {
  apiFetch.mockImplementation((path: string) => {
    if (path === "/admin/providers/sp-1") return ownerRow();
    if (path === "/admin/providers/sp-1/team") return Promise.resolve(team);
    if (path === "/admin/providers/sp-1/invites") return Promise.resolve(INVITES);
    if (path.startsWith("/admin/actions?sp_user_id=sp-1")) return Promise.resolve(ACTIONS);
    return Promise.reject(new Error(`unexpected ${path}`));
  });
}

describe("/admin/teams/$spUserId", () => {
  it("lists removed members, marked, without actions", async () => {
    stubOwner();
    wrap(<OwnerPage />);
    const gone = await screen.findByTestId("member-pro-old");
    expect(within(gone).getByText("Removed")).toBeInTheDocument();
    expect(within(gone).getByText("KYC pending")).toBeInTheDocument();
    expect(within(gone).queryByRole("button")).toBeNull();
  });

  it("shows the owner's own row first, with the jobs flag and no actions", async () => {
    stubOwner();
    wrap(<OwnerPage />);
    const self = await screen.findByTestId("member-pro-self");
    expect(within(self).getByText("Owner")).toBeInTheDocument();
    expect(within(self).getByText("No")).toBeInTheDocument();
    expect(within(self).queryByRole("button")).toBeNull();
  });

  it("builds the header from the owner endpoint: business, KYC, online", async () => {
    stubOwner();
    wrap(<OwnerPage />);
    const heading = await screen.findByRole("heading", { level: 1, name: "Tush · Tush Home Care" });
    const header = heading.closest("header")!;
    expect(within(header).getByText("KYC verified")).toBeInTheDocument();
    expect(within(header).getByText("Online")).toBeInTheDocument();
    expect(within(header).queryByText("Deactivated")).toBeNull();
  });

  it("marks a deactivated owner in the header", async () => {
    stubOwner(TEAM, () => Promise.resolve({ ...OWNER_ROW, user_is_active: false }));
    wrap(<OwnerPage />);
    const heading = await screen.findByRole("heading", { level: 1, name: "Tush · Tush Home Care" });
    expect(within(heading.closest("header")!).getByText("Deactivated")).toBeInTheDocument();
  });

  it("falls back to the owner's own row when the owner endpoint fails", async () => {
    stubOwner(TEAM, () => Promise.reject(new ApiError(500, "boom")));
    wrap(<OwnerPage />);
    await screen.findByTestId("member-pro-self");
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Owner Self");
  });

  it("says so for an id that isn't an owner", async () => {
    apiFetch.mockImplementation(() =>
      Promise.reject(new ApiError(404, "Service provider not found.", undefined, "SP_NOT_FOUND")),
    );
    wrap(<OwnerPage />);
    expect(await screen.findByText("No service provider with this id.")).toBeInTheDocument();
  });

  it("offers both actions on an active member, with online and job count", async () => {
    stubOwner();
    wrap(<OwnerPage />);
    const row = await screen.findByTestId("member-pro-7");
    expect(within(row).getByText("Online")).toBeInTheDocument();
    expect(within(row).getByText("1")).toBeInTheDocument();
    expect(within(row).getByRole("button", { name: /Force-remove/ })).toBeInTheDocument();
    expect(within(row).getByRole("button", { name: /Reassign/ })).toBeInTheDocument();
  });

  it("opens the force-remove dialog for that member", async () => {
    stubOwner();
    wrap(<OwnerPage />);
    const row = await screen.findByTestId("member-pro-7");
    await userEvent.click(within(row).getByRole("button", { name: /Force-remove/ }));
    expect(
      await screen.findByRole("alertdialog", { name: /Remove Test Pro Seven/ }),
    ).toBeInTheDocument();
  });

  it("puts Reassign / Force-remove on an active member's phone card, no swipe", async () => {
    stubOwner();
    wrap(<OwnerPage />);
    const card = await screen.findByTestId("member-card-pro-7");
    expect(within(card).getByText("+919876500050")).toBeInTheDocument();
    expect(within(card).getByText("KYC verified")).toBeInTheDocument();
    expect(within(card).getByText("Online")).toBeInTheDocument();
    expect(within(card).getByText("1 active job")).toBeInTheDocument();
    expect(within(card).queryByText(/Takes jobs themselves/)).toBeNull();
    await userEvent.click(within(card).getByRole("button", { name: /Force-remove/ }));
    expect(
      await screen.findByRole("alertdialog", { name: /Remove Test Pro Seven/ }),
    ).toBeInTheDocument();
  });

  it("gives the owner's card the jobs flag and no actions, and a removed one none", async () => {
    stubOwner();
    wrap(<OwnerPage />);
    const self = await screen.findByTestId("member-card-pro-self");
    expect(within(self).getByText("Owner")).toBeInTheDocument();
    expect(within(self).getByText("Takes jobs themselves: No")).toBeInTheDocument();
    expect(within(self).queryByRole("button")).toBeNull();
    const gone = screen.getByTestId("member-card-pro-old");
    expect(within(gone).getByText("Removed")).toBeInTheDocument();
    expect(within(gone).queryByRole("button")).toBeNull();
  });

  it("shows invite history with status and timestamps", async () => {
    stubOwner();
    wrap(<OwnerPage />);
    const expired = (await screen.findByText("+919876500099")).closest("li")!;
    expect(within(expired).getByText("expired")).toBeInTheDocument();
    expect(expired).toHaveTextContent(/Sent .* · Expired /);
    const accepted = screen.getByText("+919876500007").closest("li")!;
    expect(within(accepted).getByText("accepted")).toBeInTheDocument();
    expect(accepted).toHaveTextContent(/Sent .* · Accepted /);
  });

  it("shows the admin history, naming the member and linking the other team", async () => {
    stubOwner();
    wrap(<OwnerPage />);
    expect(await screen.findByText("Gone Pro was moved to another team")).toBeInTheDocument();
    expect(screen.getByText(/By Vipul · Reason: “Business merged”/)).toBeInTheDocument();
    expect(screen.getByText("Started KYC pending on the new team.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open the other team" })).toHaveAttribute(
      "href",
      "/admin/teams/sp-2",
    );
  });
});
