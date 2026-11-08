/**
 * The /operator/payouts page through the real router and guard. Only fetch is faked.
 * jsdom applies no CSS, so the cards and the tables both render: queries for a
 * row take the first match.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { setSessionToken } from "@/lib/api";
import { resetAuthState, type AdminRole } from "@/lib/auth";
import {
  payOutPath,
  payoutBookingsPath,
  payoutHistoryPath,
  payoutProvidersPath,
  requeuePath,
  type PayoutProvider,
} from "@/lib/payouts";
import { adminUser, appError, json, mockApi, renderApp } from "@/test/harness";
import {
  OTHER_SP_ID,
  PAYOUT_BOOKING_ID,
  SP_ID,
  historyEntry,
  payoutBooking,
  payoutProvider,
} from "@/test/payout-fixtures";

const ME = "GET /admin/auth/me";
const LIST = `GET ${payoutProvidersPath({})}`;
const BOOKINGS = `GET ${payoutBookingsPath(SP_ID, undefined, 1)}`;
const HISTORY = `GET ${payoutHistoryPath(SP_ID, 1)}`;
const PAY_OUT = `POST ${payOutPath(SP_ID)}`;
const REQUEUE_FAILED = `POST ${requeuePath(SP_ID, "failed")}`;
const REQUEUE_REVERSED = `POST ${requeuePath(SP_ID, "reversed")}`;

type Routes = Record<string, () => Response | Promise<Response>>;

const listOf = (providers: PayoutProvider[], total = providers.length) =>
  json({ providers, total, page: 1, per_page: 25 });

const TROUBLED = payoutProvider({
  failed_count: 3,
  failed_paise: 300_000,
  reversed_count: 2,
  reversed_paise: 200_000,
  latest_failure_reason: "IMPS_BENEFICIARY_ACCOUNT_INVALID",
});

function signedIn(role: AdminRole, routes: Routes = {}, provider = payoutProvider()) {
  setSessionToken("t1");
  return mockApi({
    [ME]: () => json(adminUser(role)),
    [LIST]: () =>
      listOf([
        provider,
        payoutProvider({ provider_id: OTHER_SP_ID, business_name: "Gupta Electricals" }),
      ]),
    [BOOKINGS]: () =>
      json({
        bookings: [
          payoutBooking(),
          payoutBooking({
            booking_id: "9e4a5b6c-7d8e-4f9a-8b1c-2d3e4f5a6b7c",
            settlement_status: "failed",
            settlement_failure_reason: "IMPS_BENEFICIARY_ACCOUNT_INVALID",
            professional_name: null,
          }),
        ],
        total: 2,
        page: 1,
        per_page: 25,
      }),
    [HISTORY]: () =>
      json({
        entries: [
          historyEntry(),
          historyEntry({
            audit_id: "a0000000-0000-4000-8000-000000000002",
            outcome: "completed",
            source: "reconciliation",
            admin_user_id: null,
            admin_name: null,
            created_at: "2026-10-20T10:00:00Z",
          }),
        ],
        total: 2,
        page: 1,
        per_page: 25,
      }),
    ...routes,
  });
}

const pane = () => screen.findByRole("region", { name: "Service provider detail" });

async function openPane(role: AdminRole, routes: Routes = {}, provider = payoutProvider()) {
  const api = signedIn(role, routes, provider);
  renderApp(`/operator/payouts?sp=${SP_ID}`);
  const detail = await pane();
  await within(detail).findByRole("region", { name: "Reconciliation" });
  return { api, detail };
}

const payOutButton = (detail: HTMLElement) =>
  within(detail).findByRole("button", { name: /^Pay out ₹/ });

beforeEach(() => {
  resetAuthState();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("the list", () => {
  it("shows one row per SP, and opens one into the URL", async () => {
    const api = signedIn("support");
    const router = renderApp("/operator/payouts");

    const list = await screen.findByRole("region", { name: "Service provider list" });
    const [open] = await within(list).findAllByRole("button", { name: "Open Ramesh Cleaning Co" });
    expect(within(list).getAllByText("Gupta Electricals").length).toBeGreaterThan(0);
    // ₹7,499.50 pending, the same figure as Sends now in the fixture.
    expect(within(list).getAllByText("₹7,499.50").length).toBeGreaterThan(0);
    expect(screen.getByText(/Page 1 of 1 · 2 service providers/)).toBeInTheDocument();

    await userEvent.click(open);
    await pane();
    expect(router.state.location.search).toMatchObject({ sp: SP_ID });
    // StrictMode mounts effects twice, so "was called", not "called once".
    expect(api.count(BOOKINGS)).toBeGreaterThan(0);
  });

  it("filters by status into the URL and the list call", async () => {
    signedIn("admin", {
      [`GET ${payoutProvidersPath({ status: "failed" })}`]: () => listOf([TROUBLED]),
    });
    const router = renderApp("/operator/payouts?status=failed");
    await screen.findAllByRole("button", { name: "Open Ramesh Cleaning Co" });
    expect(router.state.location.search).toMatchObject({ status: "failed" });
  });

  it("drops bad URL values and asks for the default list", async () => {
    const api = signedIn("admin");
    const router = renderApp("/operator/payouts?status=paid&page=0&sp=not-an-id&hpage=x");
    await screen.findAllByRole("button", { name: "Open Ramesh Cleaning Co" });
    // Any other list path would be unmocked and fail the test.
    expect(api.count(LIST)).toBeGreaterThan(0);
    expect(screen.queryByRole("region", { name: "Service provider detail" })).toBeNull();
    expect(router.state.location.search).toEqual({});
  });
});

describe("the detail", () => {
  it("shows the reconciliation, the bookings behind it and the history", async () => {
    const { detail } = await openPane("support", {}, TROUBLED);

    const recon = within(detail).getByRole("region", { name: "Reconciliation" });
    expect(recon).toHaveTextContent("Earned₹12,619.50(9 bookings)");
    expect(recon).toHaveTextContent("Paid₹5,120(4 bookings)");
    expect(recon).toHaveTextContent("Failed₹3,000(3 bookings)");
    expect(recon).toHaveTextContent("Sends now₹7,499.50");
    expect(recon).toHaveTextContent(/can be lower than pending/);

    expect(within(detail).getByRole("note", { name: "Latest failure" })).toHaveTextContent(
      "IMPS_BENEFICIARY_ACCOUNT_INVALID",
    );

    const bookings = await within(detail).findByRole("region", { name: "Contributing bookings" });
    const [link] = await within(bookings).findAllByRole("link", { name: "Booking 8d3f4e5a" });
    expect(link).toHaveAttribute("href", `/operator/bookings?booking=${PAYOUT_BOOKING_ID}`);
    expect(bookings).toHaveTextContent("Price at booking₹1,499");
    expect(bookings).toHaveTextContent("Discount− ₹100");
    expect(bookings).toHaveTextContent("Commission₹224.85");
    expect(bookings).toHaveTextContent("SP payout₹1,174.15");
    expect(bookings).toHaveTextContent("Tip₹50");
    expect(bookings).toHaveTextContent("ProVikram Sharma");

    const history = await within(detail).findByRole("region", { name: "Payout history" });
    const [card] = await within(history).findAllByRole("list", { name: "Payout attempts" });
    const items = within(card).getAllByRole("listitem");
    expect(items[0]).toHaveTextContent("Source: Admin · By Asha Admin");
    expect(items[1]).toHaveTextContent("Source: System · By System");
  });

  it("filters the SP's bookings into the URL and the bookings call", async () => {
    const filtered = `GET ${payoutBookingsPath(SP_ID, "failed", 1)}`;
    const { api, detail } = await openPane("admin", {
      [filtered]: () => json({ bookings: [], total: 0, page: 1, per_page: 25 }),
    });
    await userEvent.click(within(detail).getByRole("combobox", { name: "Payout status" }));
    await userEvent.click(await screen.findByRole("option", { name: "Failed" }));
    await waitFor(() => expect(api.count(filtered)).toBe(1));
    expect(await within(detail).findByText("No failed bookings.")).toBeInTheDocument();
  });

  it("renders a failure reason from outside as text, never markup", async () => {
    const { detail } = await openPane(
      "admin",
      {},
      payoutProvider({ latest_failure_reason: "<img src=x onerror=alert(1)>bad" }),
    );
    expect(within(detail).getByRole("note", { name: "Latest failure" })).toHaveTextContent(
      "<img src=x onerror=alert(1)>bad",
    );
    expect(detail.querySelector("img")).toBeNull();
  });

  it("says when the open SP isn't on the list, and offers no actions", async () => {
    const bookings = `GET ${payoutBookingsPath(OTHER_SP_ID.replace("6c", "7d"), undefined, 1)}`;
    const missing = OTHER_SP_ID.replace("6c", "7d");
    signedIn("admin", {
      [bookings]: () => json({ bookings: [], total: 0, page: 1, per_page: 25 }),
      [`GET ${payoutHistoryPath(missing, 1)}`]: () =>
        json({ entries: [], total: 0, page: 1, per_page: 25 }),
    });
    renderApp(`/operator/payouts?sp=${missing}`);
    const detail = await pane();
    expect(await within(detail).findByText(/isn't on the list as filtered/)).toBeInTheDocument();
    expect(within(detail).queryByRole("region", { name: "Actions" })).toBeNull();
    expect(await within(detail).findByText("No payouts yet.")).toBeInTheDocument();
  });
});

describe("role gates", () => {
  it("shows admin all three actions", async () => {
    const { detail } = await openPane("admin", {}, TROUBLED);
    expect(await payOutButton(detail)).toBeEnabled();
    expect(within(detail).getByRole("button", { name: "Re-queue failed (3)" })).toBeInTheDocument();
    expect(
      within(detail).getByRole("button", { name: "Re-queue reversed (2)" }),
    ).toBeInTheDocument();
  });

  it("shows ops Pay out and Re-queue failed, but not Re-queue reversed", async () => {
    const { detail } = await openPane("ops", {}, TROUBLED);
    expect(await payOutButton(detail)).toBeInTheDocument();
    expect(within(detail).getByRole("button", { name: "Re-queue failed (3)" })).toBeInTheDocument();
    expect(within(detail).queryByRole("button", { name: /Re-queue reversed/ })).toBeNull();
  });

  it("shows support no action buttons at all", async () => {
    const { detail } = await openPane("support", {}, TROUBLED);
    await within(detail).findByRole("region", { name: "Payout history" });
    expect(within(detail).queryByRole("region", { name: "Actions" })).toBeNull();
    expect(within(detail).queryByRole("button", { name: /Pay out|Re-queue/ })).toBeNull();
  });

  it("hides each re-queue when there's nothing to re-queue", async () => {
    const { detail } = await openPane("admin");
    await payOutButton(detail);
    expect(within(detail).queryByRole("button", { name: /Re-queue/ })).toBeNull();
  });
});

describe("Pay out is disabled", () => {
  const blocked = async (provider: PayoutProvider, routes: Routes, reason: RegExp) => {
    const { detail } = await openPane("admin", routes, provider);
    await waitFor(async () => expect(await payOutButton(detail)).toBeDisabled());
    const button = await payOutButton(detail);
    const note = document.getElementById(button.getAttribute("aria-describedby")!);
    expect(note).toHaveTextContent(reason);
  };

  it("with nothing to send", () =>
    blocked(payoutProvider({ payable_paise: 0 }), {}, /Nothing to send right now/));

  it("with no payout method", () =>
    blocked(payoutProvider({ payout_set: false }), {}, /No payout method on file/));

  it("when KYC isn't approved", () =>
    blocked(payoutProvider({ kyc_status: "submitted" }), {}, /KYC isn't approved \(Pending\)/));

  it("while a payout from the last minute is in flight", () =>
    blocked(
      payoutProvider(),
      {
        [HISTORY]: () =>
          json({
            entries: [
              historyEntry({
                outcome: "initiated",
                created_at: new Date(Date.now() - 20_000).toISOString(),
              }),
            ],
            total: 1,
            page: 1,
            per_page: 25,
          }),
      },
      /still initiated/,
    ));

  it("while an old attempt is unresolved", () =>
    blocked(
      payoutProvider(),
      {
        [HISTORY]: () =>
          json({
            entries: [historyEntry({ outcome: "unknown", created_at: "2026-10-01T10:00:00Z" })],
            total: 1,
            page: 1,
            per_page: 25,
          }),
      },
      /Previous attempt unresolved; wait for reconciliation/,
    ));
});

describe("the actions", () => {
  it("ops pays out: the dialog restates the amount, then everything reloads", async () => {
    const { api, detail } = await openPane(
      "ops",
      {
        [PAY_OUT]: () =>
          json(
            { status: "queued", task_id: "task-1", amount_paise: 749_950, booking_count: 5 },
            202,
          ),
      },
      payoutProvider({ pending_paise: 800_000 }),
    );
    await userEvent.click(await payOutButton(detail));

    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveTextContent("Pay out Ramesh Cleaning Co?");
    expect(dialog).toHaveTextContent("Sends ₹7,499.50 through RazorpayX for 5 bookings pending.");
    expect(dialog).toHaveTextContent("Pending is ₹8,000. The payout sends less");
    const [list, bookings, history] = [api.count(LIST), api.count(BOOKINGS), api.count(HISTORY)];

    await userEvent.click(within(dialog).getByRole("button", { name: "Pay out ₹7,499.50" }));

    expect(await within(detail).findByRole("status")).toHaveTextContent(
      "Queued ₹7,499.50 for 5 bookings.",
    );
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(api.count(PAY_OUT)).toBe(1);
    await waitFor(() => {
      expect(api.count(LIST)).toBe(list + 1);
      expect(api.count(BOOKINGS)).toBe(bookings + 1);
      expect(api.count(HISTORY)).toBe(history + 1);
    });
    // The worker may not have written its row yet, so the screen holds off itself.
    expect(await payOutButton(detail)).toBeDisabled();
    expect(within(detail).getByText(/A payout was just queued/)).toBeInTheDocument();
  });

  it("polls the history after a 202, so the worker's unresolved row keeps Pay out off past the hold", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      const entries = [historyEntry()];
      const { api, detail } = await openPane("ops", {
        [HISTORY]: () =>
          json({ entries: [...entries], total: entries.length, page: 1, per_page: 25 }),
        [PAY_OUT]: () =>
          json({ status: "queued", task_id: "t", amount_paise: 749_950, booking_count: 5 }, 202),
      });
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      await user.click(await payOutButton(detail));
      await user.click(
        within(await screen.findByRole("dialog")).getByRole("button", { name: /^Pay out/ }),
      );
      expect(await within(detail).findByText(/A payout was just queued/)).toBeInTheDocument();

      // The worker writes its row about 6 s after the 202, after the first reload,
      // so the row goes in only once that reload has fetched.
      const fetched = api.count(HISTORY);
      await vi.advanceTimersByTimeAsync(5_000);
      await waitFor(() => expect(api.count(HISTORY)).toBeGreaterThan(fetched));
      expect(within(detail).getByText(/A payout was just queued/)).toBeInTheDocument();
      entries.unshift(
        historyEntry({
          audit_id: "a0000000-0000-4000-8000-000000000009",
          outcome: "unknown",
          error: "Client error '401 Unauthorized'",
          created_at: new Date().toISOString(),
        }),
      );
      await vi.advanceTimersByTimeAsync(5_000);
      expect(
        await within(detail).findByText("Previous attempt unresolved; wait for reconciliation."),
      ).toBeInTheDocument();

      // Past the 60 s hold, it stays off: the history, not the hold, says why.
      await vi.advanceTimersByTimeAsync(61_000);
      expect(await payOutButton(detail)).toBeDisabled();
      expect(within(detail).getByText(/Previous attempt unresolved/)).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it("shows a 402's message and closes the dialog", async () => {
    const { detail } = await openPane("admin", {
      [PAY_OUT]: () =>
        appError(
          402,
          "PAYMENT_ERROR",
          "Payout batch of 12000000 paise exceeds cap of 10000000 paise",
        ),
    });
    await userEvent.click(await payOutButton(detail));
    await userEvent.click(
      within(await screen.findByRole("dialog")).getByRole("button", { name: /^Pay out/ }),
    );
    expect(await within(detail).findByRole("alert")).toHaveTextContent(/exceeds cap/);
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(within(detail).queryByText(/Queued/)).toBeNull();
  });

  it("keeps the dialog open on a 403, saying the role can't", async () => {
    const { detail } = await openPane("ops", {
      [PAY_OUT]: () => json({ detail: "Requires role: admin, ops" }, 403),
    });
    await userEvent.click(await payOutButton(detail));
    const dialog = await screen.findByRole("dialog");
    await userEvent.click(within(dialog).getByRole("button", { name: /^Pay out/ }));
    expect(await within(dialog).findByRole("alert")).toHaveTextContent("Your role can't do this.");
  });

  it("re-queues failed bookings after a confirm", async () => {
    const { api, detail } = await openPane(
      "ops",
      { [REQUEUE_FAILED]: () => json({ requeued: 3 }) },
      TROUBLED,
    );
    await userEvent.click(within(detail).getByRole("button", { name: "Re-queue failed (3)" }));
    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveTextContent("Moves ₹3,000 back to pending");
    expect(dialog).toHaveTextContent("Last failure: IMPS_BENEFICIARY_ACCOUNT_INVALID");
    await userEvent.click(within(dialog).getByRole("button", { name: "Re-queue failed" }));
    expect(await within(detail).findByRole("status")).toHaveTextContent(
      "Re-queued 3 bookings. They go out with the next Pay out.",
    );
    expect(api.count(REQUEUE_FAILED)).toBe(1);
  });

  it("warns admin that a reversal can be a compliance signal before re-queuing it", async () => {
    const { api, detail } = await openPane(
      "admin",
      { [REQUEUE_REVERSED]: () => json({ requeued: 2 }) },
      TROUBLED,
    );
    await userEvent.click(within(detail).getByRole("button", { name: "Re-queue reversed (2)" }));
    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveTextContent(/It can be a\s+compliance signal/);
    expect(dialog).toHaveTextContent(/genuinely owed this money and the cause is fixed/);

    await userEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
    expect(api.count(REQUEUE_REVERSED)).toBe(0);

    await userEvent.click(within(detail).getByRole("button", { name: "Re-queue reversed (2)" }));
    await userEvent.click(
      within(await screen.findByRole("dialog")).getByRole("button", { name: "Re-queue reversed" }),
    );
    expect(await within(detail).findByRole("status")).toHaveTextContent("Re-queued 2 bookings.");
    expect(api.count(REQUEUE_REVERSED)).toBe(1);
  });
});

describe("the CSV export", () => {
  it("shows the backend's 422 inline", async () => {
    const path = "GET /admin/payouts/export.csv?from=2025-01-01&to=2026-11-01";
    signedIn("support", {
      [path]: () => json({ detail: "Range is longer than 366 days" }, 422),
    });
    renderApp("/operator/payouts");
    const form = await screen.findByRole("form", { name: "Export CSV" });

    await userEvent.click(within(form).getByRole("button", { name: /Download CSV/ }));
    expect(within(form).getByRole("alert")).toHaveTextContent("Pick both dates.");

    await userEvent.type(within(form).getByLabelText("Completed from (IST)"), "2025-01-01");
    await userEvent.type(within(form).getByLabelText("Completed to (IST)"), "2026-11-01");
    await userEvent.click(within(form).getByRole("button", { name: /Download CSV/ }));
    expect(await within(form).findByRole("alert")).toHaveTextContent(
      "Range is longer than 366 days",
    );
  });
});
