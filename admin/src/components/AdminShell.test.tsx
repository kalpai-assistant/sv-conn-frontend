import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { RouterProvider, createMemoryHistory } from "@tanstack/react-router";
import { getSessionToken, setSessionToken } from "@/lib/api";
import { resetAuthState, type AdminRole } from "@/lib/auth";
import { KYC_PENDING_COUNT_PATH, kycQueuePath } from "@/lib/kyc";
import { getRouter } from "@/router";
import { adminUser, json, mockApi } from "@/test/harness";

const ME = "GET /admin/auth/me";
const LOGOUT = "POST /admin/auth/logout";
const KYC_COUNT = `GET ${KYC_PENDING_COUNT_PATH}`;
const KYC_QUEUE = `GET ${kycQueuePath("pending", 1)}`;

function renderAt(path: string) {
  const router = getRouter({ history: createMemoryHistory({ initialEntries: [path] }) });
  render(<RouterProvider router={router} />);
  return router;
}

function signedInAs(role: AdminRole = "admin") {
  setSessionToken("t1");
  return mockApi({
    [ME]: () => json(adminUser(role)),
    [KYC_COUNT]: () => json({ count: 0 }),
    [KYC_QUEUE]: () => json([]),
  });
}

beforeEach(() => {
  resetAuthState();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("admin shell", () => {
  it("shows every sidebar section with its screens to an admin", async () => {
    signedInAs("admin");
    renderAt("/");
    const nav = await screen.findByRole("navigation", { name: "Admin sections" });

    for (const section of ["Operator", "Analytics", "Support", "Audit"]) {
      expect(within(nav).getByRole("heading", { name: section })).toBeInTheDocument();
    }
    for (const link of [
      "KYC",
      "Bookings",
      "Pricing",
      "Coupons",
      "Catalog",
      "Service providers",
      "Pros",
      "Refunds",
      "Overview",
      "Supply",
      "Lookup",
      "Audit log",
    ]) {
      expect(within(nav).getByRole("link", { name: link })).toBeInTheDocument();
    }
  });

  it("hides, rather than greys, the sections ops can't use", async () => {
    signedInAs("ops");
    renderAt("/");
    const nav = await screen.findByRole("navigation", { name: "Admin sections" });

    expect(within(nav).getByRole("heading", { name: "Operator" })).toBeInTheDocument();
    expect(within(nav).getByRole("link", { name: "KYC" })).toBeInTheDocument();
    expect(within(nav).getByRole("heading", { name: "Analytics" })).toBeInTheDocument();
    expect(within(nav).getByRole("link", { name: "Overview" })).toBeInTheDocument();
    expect(within(nav).getByRole("link", { name: "Supply" })).toBeInTheDocument();
    // Support is every role's (SVC-433); the audit log stays admin's.
    expect(within(nav).getByRole("heading", { name: "Support" })).toBeInTheDocument();
    expect(within(nav).getByRole("link", { name: "Lookup" })).toBeInTheDocument();
    expect(within(nav).queryByRole("link", { name: "Audit log" })).not.toBeInTheDocument();
  });

  it("hides Analytics and the audit log from support, who keep Operator and Support", async () => {
    signedInAs("support");
    renderAt("/");
    const nav = await screen.findByRole("navigation", { name: "Admin sections" });

    expect(within(nav).getByRole("link", { name: "Lookup" })).toBeInTheDocument();
    expect(within(nav).queryByRole("heading", { name: "Analytics" })).not.toBeInTheDocument();
    expect(within(nav).queryByRole("link", { name: "Overview" })).not.toBeInTheDocument();
    expect(within(nav).queryByRole("heading", { name: "Audit" })).not.toBeInTheDocument();
    expect(within(nav).queryByRole("link", { name: "Audit log" })).not.toBeInTheDocument();
  });

  it("applies the same role filter to the phone menu", async () => {
    signedInAs("support");
    renderAt("/");

    await userEvent.click(await screen.findByRole("button", { name: "Open menu" }));
    const dialog = await screen.findByRole("dialog");

    expect(within(dialog).getByRole("link", { name: "KYC" })).toBeInTheDocument();
    expect(within(dialog).queryByRole("link", { name: "Overview" })).not.toBeInTheDocument();
    expect(within(dialog).queryByRole("link", { name: "Audit log" })).not.toBeInTheDocument();
  });

  it("shows who is signed in", async () => {
    signedInAs("support");
    renderAt("/");

    expect(await screen.findByText("support@eazyserv.local")).toBeInTheDocument();
  });

  it("puts the brand Button on the home screen", async () => {
    signedInAs();
    renderAt("/");
    const button = await screen.findByRole("button", { name: "Primary action" });
    expect(button).toHaveClass("bg-primary");
  });

  it("goes to a section's page when its nav link is clicked", async () => {
    signedInAs();
    const router = renderAt("/");
    const nav = await screen.findByRole("navigation", { name: "Admin sections" });

    await userEvent.click(within(nav).getByRole("link", { name: "KYC" }));

    expect(
      await screen.findByRole("heading", { level: 1, name: "KYC review queue" }),
    ).toBeInTheDocument();
    expect(router.state.location.pathname).toBe("/operator/kyc");
  });

  it("does not call /me again on every navigation", async () => {
    const api = signedInAs();
    renderAt("/");
    const nav = await screen.findByRole("navigation", { name: "Admin sections" });

    await userEvent.click(within(nav).getByRole("link", { name: "KYC" }));
    await screen.findByRole("heading", { level: 1, name: "KYC review queue" });

    expect(api.count(ME)).toBe(1);
  });

  describe("the KYC badge", () => {
    it.each<AdminRole>(["admin", "ops", "support"])(
      "shows %s the pending count, with a label that says what it is",
      async (role) => {
        const api = signedInAs(role);
        api.routes[KYC_COUNT] = () => json({ count: 6 });
        renderAt("/");
        const nav = await screen.findByRole("navigation", { name: "Admin sections" });

        const link = await within(nav).findByRole("link", { name: "KYC, 6 pending" });
        expect(link).toHaveTextContent("6");
        expect(api.count(KYC_COUNT)).toBe(1);
      },
    );

    it("shows the same count in the phone menu, from the same call", async () => {
      const api = signedInAs();
      api.routes[KYC_COUNT] = () => json({ count: 6 });
      renderAt("/");
      await screen.findByRole("link", { name: "KYC, 6 pending" });

      await userEvent.click(screen.getByRole("button", { name: "Open menu" }));
      const dialog = await screen.findByRole("dialog");

      expect(within(dialog).getByRole("link", { name: "KYC, 6 pending" })).toBeInTheDocument();
      expect(api.count(KYC_COUNT)).toBe(1);
    });

    it("hides at 0", async () => {
      const api = signedInAs();
      renderAt("/");
      const nav = await screen.findByRole("navigation", { name: "Admin sections" });

      await waitFor(() => expect(api.count(KYC_COUNT)).toBe(1));
      expect(within(nav).getByRole("link", { name: "KYC" })).toHaveTextContent(/^KYC$/);
    });

    it("hides on an error, without raising an alert", async () => {
      const api = signedInAs();
      api.routes[KYC_COUNT] = () => json({ message: "Boom" }, 500);
      renderAt("/");
      const nav = await screen.findByRole("navigation", { name: "Admin sections" });

      await waitFor(() => expect(api.count(KYC_COUNT)).toBe(1));
      expect(within(nav).getByRole("link", { name: "KYC" })).toHaveTextContent(/^KYC$/);
      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    });

    it("stays on the screen, and isn't refetched, across a navigation", async () => {
      const api = signedInAs();
      api.routes[KYC_COUNT] = () => json({ count: 6 });
      renderAt("/");
      const nav = await screen.findByRole("navigation", { name: "Admin sections" });

      await userEvent.click(await within(nav).findByRole("link", { name: "KYC, 6 pending" }));
      await screen.findByRole("heading", { level: 1, name: "KYC review queue" });

      expect(within(nav).getByRole("link", { name: "KYC, 6 pending" })).toBeInTheDocument();
      expect(api.count(KYC_COUNT)).toBe(1);
    });
  });

  it("renders /login outside the shell", async () => {
    renderAt("/login");
    expect(await screen.findByRole("heading", { name: "Sign in" })).toBeInTheDocument();
    expect(screen.queryByRole("navigation", { name: "Admin sections" })).not.toBeInTheDocument();
  });

  it("signs out through the backend and lands on /login", async () => {
    const api = signedInAs();
    api.routes[LOGOUT] = () => new Response(null, { status: 204 });
    const router = renderAt("/");

    await userEvent.click(await screen.findByRole("button", { name: "Sign out" }));

    await screen.findByRole("heading", { name: "Sign in" });
    expect(router.state.location.pathname).toBe("/login");
    expect(api.headers(LOGOUT).Authorization).toBe("Bearer t1");
    expect(getSessionToken()).toBeNull();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("says so when the server could not confirm the sign-out", async () => {
    const api = signedInAs();
    api.routes[LOGOUT] = () => {
      throw new TypeError("Failed to fetch");
    };
    renderAt("/");

    await userEvent.click(await screen.findByRole("button", { name: "Sign out" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("couldn't confirm it");
    expect(getSessionToken()).toBeNull();
  });
});
