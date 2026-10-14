/**
 * SVC-329 admin UI pieces: the shared menu and the two team dialogs.
 *
 * Load-bearing:
 * - a reason is required before anything is sent
 * - each refusal reads as copy, and an active job offers the Bookings page
 * - success says whether the owner was switched back to taking jobs, and for
 *   a reassign which KYC outcome happened (Option A: never copied)
 */
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError } from "@/lib/api";
import type { API_AdminProviderRow, API_AdminTeamPro } from "@/hooks/useApi";

const apiFetch = vi.fn();
const navigate = vi.fn();
const logout = vi.fn();
let pathname = "/admin/kyc";

vi.mock("@/lib/auth-context", () => ({
  useAuth: () => ({ logout }),
}));

vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api");
  return { ...actual, apiFetch: (...args: unknown[]) => apiFetch(...args) };
});

// Outside a router tree: Link becomes a plain anchor, the path is injected.
vi.mock("@tanstack/react-router", async () => {
  const actual =
    await vi.importActual<typeof import("@tanstack/react-router")>("@tanstack/react-router");
  return {
    ...actual,
    useNavigate: () => navigate,
    useRouterState: ({ select }: { select: (s: unknown) => unknown }) =>
      select({ location: { pathname } }),
    Link: ({
      to,
      params,
      search,
      children,
      onClick,
      className,
      "aria-current": ariaCurrent,
    }: {
      to: string;
      params?: Record<string, string>;
      search?: Record<string, string>;
      children: React.ReactNode;
      onClick?: () => void;
      className?: string;
      "aria-current"?: "page";
    }) => (
      <a
        href={
          (params ? to.replace("$spUserId", params.spUserId) : to) +
          (search ? `?${new URLSearchParams(search).toString()}` : "")
        }
        onClick={onClick}
        className={className}
        aria-current={ariaCurrent}
      >
        {children}
      </a>
    ),
  };
});

import { AdminMenu } from "@/components/admin/AdminMenu";
import { ForceRemoveDialog } from "@/components/admin/ForceRemoveDialog";
import { ReassignDialog } from "@/components/admin/ReassignDialog";

const PRO: API_AdminTeamPro = {
  id: "pro-7",
  service_provider_id: "sp-1",
  user_id: "u-7",
  display_name: "Test Pro Seven",
  phone: "+919876500007",
  user_is_active: true,
  profile_photo_url: null,
  kyc_status: "verified",
  is_online: true,
  is_active: true,
  is_self: false,
  accepts_direct_jobs: true,
  active_job_count: 0,
  created_at: "2026-10-01T00:00:00Z",
};

const owner = (o: Partial<API_AdminProviderRow>): API_AdminProviderRow => ({
  user_id: "sp-2",
  name: "Ravi",
  phone: "+919876500002",
  business_name: "Ravi Services",
  kyc_status: "verified",
  is_online: false,
  user_is_active: true,
  active_pro_count: 1,
  created_at: "2026-10-01T00:00:00Z",
  ...o,
});

function wrap(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("AdminMenu", () => {
  it.each(["/admin/bookings", "/admin/kyc", "/admin/payouts", "/admin/teams", "/admin/profile"])(
    "links every admin page from %s",
    (path) => {
      pathname = path;
      render(<AdminMenu />);
      const nav = screen.getByRole("navigation", { name: "Admin" });
      const links = within(nav).getAllByRole("link");
      expect(links.map((a) => a.getAttribute("href"))).toEqual([
        "/admin/bookings",
        "/admin/kyc",
        "/admin/payouts",
        "/admin/teams",
        "/admin/profile",
      ]);
      const current = links.filter((a) => a.getAttribute("aria-current") === "page");
      expect(current.map((a) => a.getAttribute("href"))).toEqual([path]);
    },
  );

  it("marks Teams current on an owner's page", () => {
    pathname = "/admin/teams/sp-1";
    render(<AdminMenu />);
    expect(screen.getByRole("link", { name: "Teams" })).toHaveAttribute("aria-current", "page");
    // Filled blue like My Bookings' selected tab; the others stay plain.
    expect(screen.getByRole("link", { name: "Teams" })).toHaveClass("bg-primary");
    expect(screen.getByRole("link", { name: "KYC" })).not.toHaveClass("bg-primary");
  });

  it("has no Log out: it lives on /admin/profile (SVC-355)", () => {
    pathname = "/admin/teams";
    render(<AdminMenu />);
    expect(screen.queryByRole("button", { name: /Log ?out/i })).toBeNull();
    expect(screen.getByRole("link", { name: "Profile" })).toHaveAttribute("href", "/admin/profile");
  });

  it("scrolls the current item into view, so Profile is never selected off-screen", () => {
    const scrollIntoView = vi.fn();
    Element.prototype.scrollIntoView = scrollIntoView;
    try {
      pathname = "/admin/profile";
      render(<AdminMenu />);
      expect(scrollIntoView).toHaveBeenCalledTimes(1);
      expect(scrollIntoView.mock.contexts[0]).toBe(screen.getByRole("link", { name: "Profile" }));
      expect(scrollIntoView).toHaveBeenCalledWith({ inline: "nearest", block: "nearest" });
    } finally {
      delete (Element.prototype as Partial<Element>).scrollIntoView;
    }
  });
});

describe("ForceRemoveDialog", () => {
  const open = () => wrap(<ForceRemoveDialog pro={PRO} onClose={vi.fn()} />);
  const confirm = () => screen.getByRole("button", { name: "Remove" });

  it("refuses to send without a reason", async () => {
    open();
    await userEvent.click(confirm());
    expect(screen.getByRole("alert")).toHaveTextContent(/reason is required/i);
    expect(apiFetch).not.toHaveBeenCalled();
  });

  it("sends the trimmed reason to force-remove", async () => {
    apiFetch.mockResolvedValue({ professional_id: "pro-7", self_reenabled: false });
    open();
    await userEvent.type(screen.getByLabelText(/reason/i), "  Left the business  ");
    await userEvent.click(confirm());
    await waitFor(() =>
      expect(apiFetch).toHaveBeenCalledWith("/admin/pros/pro-7/force-remove", {
        method: "POST",
        body: JSON.stringify({ reason: "Left the business" }),
      }),
    );
  });

  it("maps an active job to copy plus a link to that booking", async () => {
    apiFetch.mockRejectedValue(
      new ApiError(409, "raw", undefined, "PRO_HAS_ACTIVE_JOB", { booking_ids: ["bk-1", "bk-2"] }),
    );
    open();
    await userEvent.type(screen.getByLabelText(/reason/i), "Left the business");
    await userEvent.click(confirm());
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Has an active job. Resolve it first (cancel or re-pick).");
    expect(within(alert).getByRole("link", { name: "Open the booking" })).toHaveAttribute(
      "href",
      "/admin/bookings?booking=bk-1",
    );
  });

  it("falls back to the Bookings list when no booking ids came back", async () => {
    apiFetch.mockRejectedValue(new ApiError(409, "raw", undefined, "PRO_HAS_ACTIVE_JOB"));
    open();
    await userEvent.type(screen.getByLabelText(/reason/i), "Left the business");
    await userEvent.click(confirm());
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Has an active job. Resolve it first (cancel or re-pick).");
    expect(within(alert).getByRole("link", { name: "Open Bookings" })).toHaveAttribute(
      "href",
      "/admin/bookings",
    );
  });

  it("maps a member who's already gone, with no Bookings link", async () => {
    apiFetch.mockRejectedValue(new ApiError(404, "raw", undefined, "PRO_NOT_FOUND"));
    open();
    await userEvent.type(screen.getByLabelText(/reason/i), "Left the business");
    await userEvent.click(confirm());
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(/already removed/);
    expect(within(alert).queryByRole("link")).toBeNull();
  });

  it.each([
    [true, /switched back on/],
    [false, /job setting is unchanged/],
  ])("on success with self_reenabled=%s says so", async (selfReenabled, copy) => {
    apiFetch.mockResolvedValue({ professional_id: "pro-7", self_reenabled: selfReenabled });
    open();
    await userEvent.type(screen.getByLabelText(/reason/i), "Left the business");
    await userEvent.click(confirm());
    expect(await screen.findByText("Test Pro Seven was removed")).toBeInTheDocument();
    expect(screen.getByText(copy)).toBeInTheDocument();
  });
});

describe("ReassignDialog", () => {
  const owners = [
    owner({ user_id: "sp-1", name: "Current Owner", business_name: null }),
    owner({
      user_id: "sp-3",
      name: "Unverified Owner",
      business_name: null,
      kyc_status: "pending",
    }),
    owner({ user_id: "sp-2", name: "Ravi", business_name: "Ravi Services" }),
  ];

  beforeEach(() => {
    apiFetch.mockImplementation((path: string) => {
      if (path.startsWith("/admin/providers?")) return Promise.resolve(owners);
      return Promise.reject(new Error(`unexpected ${path}`));
    });
  });

  const open = () => wrap(<ReassignDialog pro={PRO} onClose={vi.fn()} />);
  const ownerButton = (name: RegExp) => screen.findByRole("button", { name });
  const move = () => screen.getByRole("button", { name: "Move" });

  it("explains both Option A KYC outcomes before anything is sent", async () => {
    open();
    const kyc = screen.getByTestId("kyc-outcome");
    expect(kyc).toHaveTextContent(/doesn't move with them/);
    expect(kyc).toHaveTextContent(/KYC pending/);
    expect(kyc).toHaveTextContent(/earlier row comes back with its own KYC/);
  });

  it("won't let the current owner or an unverified one be picked", async () => {
    open();
    expect(await ownerButton(/Current Owner/)).toBeDisabled();
    expect(await ownerButton(/Unverified Owner/)).toBeDisabled();
    expect(await ownerButton(/Ravi Services/)).toBeEnabled();
  });

  it("needs an owner and a reason", async () => {
    open();
    await userEvent.click(move());
    expect(screen.getByRole("alert")).toHaveTextContent(/Pick the owner/);
    await userEvent.click(await ownerButton(/Ravi Services/));
    await userEvent.click(move());
    expect(screen.getByRole("alert")).toHaveTextContent(/reason is required/i);
    expect(apiFetch).not.toHaveBeenCalledWith(expect.stringMatching(/reassign/), expect.anything());
  });

  async function submitTo(result: () => Promise<unknown>) {
    apiFetch.mockImplementation((path: string) =>
      path.startsWith("/admin/providers?") ? Promise.resolve(owners) : result(),
    );
    open();
    await userEvent.click(await ownerButton(/Ravi Services/));
    await userEvent.type(screen.getByLabelText(/reason/i), "Business merged");
    await userEvent.click(move());
  }

  it("sends the target and reason", async () => {
    await submitTo(() => new Promise(() => {}));
    await waitFor(() =>
      expect(apiFetch).toHaveBeenCalledWith("/admin/pros/pro-7/reassign", {
        method: "POST",
        body: JSON.stringify({ target_sp_user_id: "sp-2", reason: "Business merged" }),
      }),
    );
  });

  it("maps a refusal code to copy", async () => {
    await submitTo(() => Promise.reject(new ApiError(409, "raw", undefined, "ALREADY_ON_TEAM")));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "This person is already an active member of that owner's team.",
    );
  });

  it("maps an active job with a link to that booking", async () => {
    await submitTo(() =>
      Promise.reject(
        new ApiError(409, "raw", undefined, "PRO_HAS_ACTIVE_JOB", { booking_ids: ["bk-9"] }),
      ),
    );
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(/Has an active job/);
    expect(within(alert).getByRole("link", { name: "Open the booking" })).toHaveAttribute(
      "href",
      "/admin/bookings?booking=bk-9",
    );
  });

  it("on a new row, says they start KYC pending", async () => {
    await submitTo(() =>
      Promise.resolve({
        old_professional_id: "pro-7",
        professional: { ...PRO, id: "pro-9", service_provider_id: "sp-2", kyc_status: "pending" },
        reactivated: false,
        self_reenabled: false,
      }),
    );
    expect(await screen.findByText(/start KYC pending under the new owner/)).toBeInTheDocument();
    expect(screen.queryByText(/switched back on/)).toBeNull();
    expect(screen.getByRole("link", { name: "Open the new team" })).toHaveAttribute(
      "href",
      "/admin/teams/sp-2",
    );
  });

  it("on a reactivated row, says which KYC it kept, and a self re-enable", async () => {
    await submitTo(() =>
      Promise.resolve({
        old_professional_id: "pro-7",
        professional: { ...PRO, id: "pro-4", service_provider_id: "sp-2", kyc_status: "rejected" },
        reactivated: true,
        self_reenabled: true,
      }),
    );
    expect(
      await screen.findByText(/that row is back with its own KYC: KYC rejected/),
    ).toBeInTheDocument();
    expect(screen.getByText(/switched back on/)).toBeInTheDocument();
  });
});
