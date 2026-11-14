/** The /audit page through the real router and guard. Only fetch is faked. */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { setSessionToken } from "@/lib/api";
import {
  NO_AUDIT_FILTERS,
  auditPath,
  type AuditEntry,
  type AuditFilterOptions,
  type AuditFilters,
} from "@/lib/audit";
import { resetAuthState, type AdminRole } from "@/lib/auth";
import { adminUser, appError, json, mockApi, renderApp } from "@/test/harness";

const ME = "GET /admin/auth/me";
const FILTERS = "GET /admin/audit/filters";
const key = (filters: Partial<AuditFilters> = {}, page = 1) =>
  `GET ${auditPath({ ...NO_AUDIT_FILTERS, ...filters }, page)}`;

const OPTIONS: AuditFilterOptions = {
  admins: [
    { id: "a1", name: "Asha", email: "asha@eazyserv.local" },
    { id: "a2", name: null, email: "noname@eazyserv.local" },
  ],
  actions: ["kyc.approve", "service.create"],
  target_types: ["provider", "service"],
};

function entry(overrides: Partial<AuditEntry> = {}): AuditEntry {
  return {
    id: "e1",
    admin_user_id: "a1",
    admin_name: "Asha",
    admin_email: "asha@eazyserv.local",
    action: "kyc.approve",
    target_type: "provider",
    target_id: "t1",
    sp_user_id: null,
    to_sp_user_id: null,
    reason: "Documents match",
    details: {},
    before_json: { kyc_status: "pending" },
    after_json: { kyc_status: "verified" },
    ip_address: "203.0.113.9",
    user_agent: "Mozilla/5.0",
    created_at: "2026-11-06T14:37:03Z",
    ...overrides,
  };
}

const page = (items: AuditEntry[], total = items.length, pageNumber = 1) =>
  json({ items, total, page: pageNumber, per_page: 50 });

function signedIn(
  routes: Record<string, () => Response | Promise<Response>> = {},
  role: AdminRole = "admin",
) {
  setSessionToken("t1");
  return mockApi({
    [ME]: () => json(adminUser(role)),
    [FILTERS]: () => json(OPTIONS),
    ...routes,
  });
}

async function pick(label: string, option: string) {
  await userEvent.click(await screen.findByRole("combobox", { name: label }));
  await userEvent.click(await screen.findByRole("option", { name: option }));
}

async function expandRow(action: string) {
  const row = (await screen.findByRole("cell", { name: action })).closest("tr")!;
  await userEvent.click(within(row).getByRole("button", { name: "Show details" }));
}

beforeEach(() => {
  resetAuthState();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("/audit table", () => {
  it("shows a row with its time, admin, action and target", async () => {
    signedIn({ [key()]: () => page([entry()]) });
    renderApp("/audit");

    expect(await screen.findByRole("heading", { name: "Audit log" })).toBeInTheDocument();
    expect(await screen.findByRole("cell", { name: "kyc.approve" })).toBeInTheDocument();
    expect(screen.getByRole("cell", { name: "Asha" })).toBeInTheDocument();
    expect(screen.getByText("t1")).toBeInTheDocument();
    expect(screen.getByText(/Page 1 of 1 · 1 entry$/)).toBeInTheDocument();
  });

  it("sends the session token", async () => {
    const api = signedIn({ [key()]: () => page([entry()]) });
    renderApp("/audit");

    await screen.findByRole("cell", { name: "kyc.approve" });
    expect(api.headers(key()).Authorization).toBe("Bearer t1");
    expect(api.headers(FILTERS).Authorization).toBe("Bearer t1");
  });

  it("shows the email for an admin with no name", async () => {
    signedIn({ [key()]: () => page([entry({ admin_name: null })]) });
    renderApp("/audit");

    expect(await screen.findByRole("cell", { name: "asha@eazyserv.local" })).toBeInTheDocument();
  });

  it("offers no way to change or remove an entry", async () => {
    signedIn({ [key()]: () => page([entry()]) });
    renderApp("/audit");
    await expandRow("kyc.approve");

    for (const name of [/edit/i, /delete/i, /export/i]) {
      expect(screen.queryByRole("button", { name })).not.toBeInTheDocument();
    }
  });
});

describe("/audit filters", () => {
  it.each<[string, string, Partial<AuditFilters>]>([
    ["Admin", "Asha (asha@eazyserv.local)", { adminUserId: "a1" }],
    ["Admin", "noname@eazyserv.local", { adminUserId: "a2" }],
    ["Action", "service.create", { action: "service.create" }],
    ["Target type", "service", { targetType: "service" }],
  ])("%s: choosing %s filters the list", async (label, option, filters) => {
    const api = signedIn({
      [key()]: () => page([entry()]),
      [key(filters)]: () => page([entry({ id: "e2", action: "filtered.result" })]),
    });
    renderApp("/audit");
    await screen.findByRole("cell", { name: "kyc.approve" });

    await pick(label, option);

    expect(await screen.findByRole("cell", { name: "filtered.result" })).toBeInTheDocument();
    expect(api.count(key(filters))).toBeGreaterThan(0);
  });

  it("choosing All removes the filter", async () => {
    const action = { action: "service.create" };
    signedIn({
      [key()]: () => page([entry()]),
      [key(action)]: () => page([entry({ id: "e2", action: "filtered.result" })]),
    });
    renderApp("/audit");

    await pick("Action", "service.create");
    await screen.findByRole("cell", { name: "filtered.result" });
    await pick("Action", "All");

    expect(await screen.findByRole("cell", { name: "kyc.approve" })).toBeInTheDocument();
  });

  it("sends local dates as ISO datetimes, with the end date's whole day", async () => {
    signedIn({
      [key()]: () => page([entry()]),
      [key({ from: "2026-11-01" })]: () => page([entry({ id: "e2", action: "from.only" })]),
      [key({ from: "2026-11-01", to: "2026-11-06" })]: () =>
        page([entry({ id: "e3", action: "both.dates" })]),
    });
    renderApp("/audit");
    await screen.findByRole("cell", { name: "kyc.approve" });

    fireEvent.change(screen.getByLabelText("From"), { target: { value: "2026-11-01" } });
    await screen.findByRole("cell", { name: "from.only" });
    fireEvent.change(screen.getByLabelText("To"), { target: { value: "2026-11-06" } });

    expect(await screen.findByRole("cell", { name: "both.dates" })).toBeInTheDocument();
  });

  it("doesn't refetch for a date that is still being typed", async () => {
    const api = signedIn({ [key()]: () => page([entry()]) });
    renderApp("/audit");
    await screen.findByRole("cell", { name: "kyc.approve" });
    const before = api.count(key());

    fireEvent.change(screen.getByLabelText("From"), { target: { value: "0002-11-06" } });

    expect(screen.getByLabelText("From")).toHaveValue("0002-11-06");
    expect(screen.getByRole("cell", { name: "kyc.approve" })).toBeInTheDocument();
    expect(api.count(key())).toBe(before);
  });

  it.each<[string, () => Promise<void>, Partial<AuditFilters>]>([
    ["a dropdown", () => pick("Action", "service.create"), { action: "service.create" }],
    [
      "a date",
      async () => {
        fireEvent.change(screen.getByLabelText("To"), { target: { value: "2026-11-06" } });
      },
      { to: "2026-11-06" },
    ],
  ])("changing %s returns to page 1", async (_name, change, filters) => {
    const api = signedIn({
      [key()]: () => page([entry()], 68),
      [key({}, 2)]: () => page([entry({ id: "e2", action: "second.page" })], 68, 2),
      [key(filters)]: () => page([entry({ id: "e3", action: "filtered.result" })]),
    });
    renderApp("/audit");

    await userEvent.click(await screen.findByRole("button", { name: "Next" }));
    await screen.findByRole("cell", { name: "second.page" });
    await change();

    expect(await screen.findByRole("cell", { name: "filtered.result" })).toBeInTheDocument();
    expect(screen.getByText(/Page 1 of 1/)).toBeInTheDocument();
    expect(api.calls.at(-1)?.key).toBe(key(filters));
  });

  it("still lists entries when the filter options fail, and can retry them", async () => {
    const api = signedIn({
      [FILTERS]: () => appError(500, "BOOM"),
      [key()]: () => page([entry()]),
    });
    renderApp("/audit");

    expect(await screen.findByRole("cell", { name: "kyc.approve" })).toBeInTheDocument();
    expect(await screen.findByText("Couldn't load the filter options.")).toBeInTheDocument();

    api.routes[FILTERS] = () => json(OPTIONS);
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));

    await waitFor(() =>
      expect(screen.queryByText("Couldn't load the filter options.")).not.toBeInTheDocument(),
    );
    await pick("Action", "kyc.approve");
  });
});

describe("/audit paging", () => {
  it("moves between pages and stops at each end", async () => {
    signedIn({
      [key()]: () => page([entry()], 68),
      [key({}, 2)]: () => page([entry({ id: "e2", action: "second.page" })], 68, 2),
    });
    renderApp("/audit");

    await screen.findByText(/Page 1 of 2 · 68 entries/);
    expect(screen.getByRole("button", { name: "Previous" })).toBeDisabled();

    await userEvent.click(screen.getByRole("button", { name: "Next" }));

    expect(await screen.findByRole("cell", { name: "second.page" })).toBeInTheDocument();
    expect(screen.getByText(/Page 2 of 2 · 68 entries/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Next" })).toBeDisabled();

    await userEvent.click(screen.getByRole("button", { name: "Previous" }));

    expect(await screen.findByRole("cell", { name: "kyc.approve" })).toBeInTheDocument();
  });
});

describe("/audit row expansion", () => {
  it("shows reason, IP, User-Agent and the before and after JSON", async () => {
    signedIn({ [key()]: () => page([entry({ details: { amount: 500 } })]) });
    renderApp("/audit");

    expect(screen.queryByText("Documents match")).not.toBeInTheDocument();
    await expandRow("kyc.approve");

    expect(screen.getByText("Documents match")).toBeInTheDocument();
    expect(screen.getByText("203.0.113.9")).toBeInTheDocument();
    expect(screen.getByText("Mozilla/5.0")).toBeInTheDocument();
    expect(screen.getByText(/"kyc_status": "pending"/)).toBeInTheDocument();
    expect(screen.getByText(/"kyc_status": "verified"/)).toBeInTheDocument();
    expect(screen.getByText(/"amount": 500/)).toBeInTheDocument();
  });

  it("closes again, and only the row that was toggled", async () => {
    signedIn({
      [key()]: () => page([entry(), entry({ id: "e2", action: "other.row", reason: "Other" })]),
    });
    renderApp("/audit");

    await expandRow("kyc.approve");
    expect(screen.getByText("Documents match")).toBeInTheDocument();
    expect(screen.queryByText("Other")).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Hide details" }));
    expect(screen.queryByText("Documents match")).not.toBeInTheDocument();
  });

  it('shows "None" for every empty value', async () => {
    signedIn({
      [key()]: () =>
        page([
          entry({
            reason: null,
            ip_address: null,
            user_agent: null,
            before_json: null,
            after_json: null,
            details: {},
          }),
        ]),
    });
    renderApp("/audit");
    await expandRow("kyc.approve");

    // Reason, IP address, User-Agent, Before, After, Details.
    expect(screen.getAllByText("None")).toHaveLength(6);
  });

  it("shows the service provider fields only for an entry that has them", async () => {
    signedIn({ [key()]: () => page([entry({ sp_user_id: "sp1", to_sp_user_id: "sp2" })]) });
    renderApp("/audit");
    await expandRow("kyc.approve");

    expect(screen.getByText("sp1")).toBeInTheDocument();
    expect(screen.getByText("sp2")).toBeInTheDocument();
  });

  it("renders markup from outside as text", async () => {
    const attack = '<img src=x onerror="window.pwned=1">';
    signedIn({
      [key()]: () =>
        page([
          entry({
            reason: attack,
            user_agent: attack,
            after_json: { note: attack },
          }),
        ]),
    });
    renderApp("/audit");
    await expandRow("kyc.approve");

    expect(screen.getAllByText(attack)).toHaveLength(2);
    expect(document.body.querySelector("img")).toBeNull();
  });
});

describe("/audit states", () => {
  it("shows the loading state until the list arrives", async () => {
    let answer!: () => void;
    const answered = new Promise<void>((resolve) => (answer = resolve));
    // A new Response per call: StrictMode asks twice, and a body reads only once.
    signedIn({ [key()]: () => answered.then(() => page([entry()])) });
    renderApp("/audit");

    expect(await screen.findByRole("status")).toBeInTheDocument();

    answer();
    expect(await screen.findByRole("cell", { name: "kyc.approve" })).toBeInTheDocument();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("shows the empty message when nothing matches", async () => {
    signedIn({ [key()]: () => page([]) });
    renderApp("/audit");

    expect(await screen.findByText("No audit entries match these filters")).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });

  it("shows a failure as an error, not as empty, and retries", async () => {
    const api = signedIn({ [key()]: () => appError(500, "BOOM") });
    renderApp("/audit");

    expect(await screen.findByText("Couldn't load the audit log.")).toBeInTheDocument();
    expect(screen.queryByText("No audit entries match these filters")).not.toBeInTheDocument();

    api.routes[key()] = () => page([entry()]);
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));

    expect(await screen.findByRole("cell", { name: "kyc.approve" })).toBeInTheDocument();
  });

  it("says so plainly on a 403, for a role that changed under the page", async () => {
    signedIn({
      [FILTERS]: () => appError(403, "FORBIDDEN"),
      [key()]: () => appError(403, "FORBIDDEN"),
    });
    renderApp("/audit");

    expect(await screen.findByText("You don't have access to the audit log.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Try again" })).not.toBeInTheDocument();
    expect(screen.queryByText("Couldn't load the filter options.")).not.toBeInTheDocument();
  });

  it("ignores a slow answer to a filter the admin has already changed", async () => {
    let answerOld!: () => void;
    const old = new Promise<void>((resolve) => (answerOld = resolve));
    const action = { action: "service.create" };
    signedIn({
      [key()]: () => old.then(() => page([entry({ id: "e3", action: "stale.answer" })])),
      [key(action)]: () => page([entry({ id: "e2", action: "new.answer" })]),
    });
    renderApp("/audit");

    await pick("Action", "service.create");
    await screen.findByRole("cell", { name: "new.answer" });

    answerOld();
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(screen.queryByRole("cell", { name: "stale.answer" })).not.toBeInTheDocument();
    expect(screen.getByRole("cell", { name: "new.answer" })).toBeInTheDocument();
  });

  it("signs out on a 401", async () => {
    signedIn({ [key()]: () => appError(401, "SESSION_ENDED") });
    const router = renderApp("/audit");

    await screen.findByRole("heading", { name: "Sign in" });
    expect(router.state.location.pathname).toBe("/login");
  });
});

describe("/audit role access", () => {
  it.each<AdminRole>(["ops", "support"])(
    "sends %s to the home page without calling the audit API",
    async (role) => {
      const api = signedIn({}, role);
      const router = renderApp("/audit");

      expect(await screen.findByRole("heading", { name: "Admin console" })).toBeInTheDocument();
      expect(router.state.location.pathname).toBe("/");
      expect(api.calls.filter((call) => call.key.includes("/admin/audit"))).toEqual([]);
    },
  );

  it("opens for an admin from the sidebar", async () => {
    signedIn({ [key()]: () => page([entry()]) });
    const router = renderApp("/");
    const nav = await screen.findByRole("navigation", { name: "Admin sections" });

    await userEvent.click(within(nav).getByRole("link", { name: "Audit log" }));

    expect(await screen.findByRole("heading", { name: "Audit log" })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe("/audit");
  });
});
