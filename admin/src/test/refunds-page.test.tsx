/**
 * The /operator/refunds screens through the real router and guard. Only fetch is
 * faked. jsdom applies no CSS, so the queue's cards and table both render.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { setSessionToken } from "@/lib/api";
import { resetAuthState, type AdminRole } from "@/lib/auth";
import {
  DISPUTES_PATH,
  disputeDetailPath,
  disputesListPath,
  type DisputeDetail,
  type DisputeRow,
} from "@/lib/disputes";
import { adminUser, json, mockApi, renderApp } from "@/test/harness";

const BOOKING = "d29db776-a9d7-449f-bcd2-b819eb62b8c6";
const DISPUTE = "b8878b14-483f-4ec2-bad9-d7d43f727db2";
const RESOLVE = `POST ${DISPUTES_PATH}/${DISPUTE}/resolve`;
const REVIEW = `POST ${DISPUTES_PATH}/${DISPUTE}/review`;
const DETAIL = `GET ${disputeDetailPath(BOOKING)}`;

function row(overrides: Partial<DisputeRow> = {}): DisputeRow {
  return {
    id: DISPUTE,
    booking_id: BOOKING,
    booking_status: "completed",
    payment_method: "online",
    reason_code: "NO_SHOW",
    description: "Pro never came",
    status: "RAISED",
    resolution_type: null,
    refund_amount: null,
    refund_channel: null,
    refund_status: null,
    refund_failed_reason: null,
    razorpay_refund_id: null,
    resolution_notes: null,
    customer_id: "u1",
    customer_name: "Asha Rao",
    customer_phone: "+919876500001",
    created_by: "a1",
    created_by_name: "Support One",
    resolved_by: null,
    resolved_by_name: null,
    created_at: "2026-11-10T06:00:00Z",
    updated_at: "2026-11-10T06:00:00Z",
    resolved_at: null,
    closed_at: null,
    ...overrides,
  };
}

function detail(
  overrides: Partial<DisputeDetail> = {},
  open: DisputeRow | null = row(),
): DisputeDetail {
  return {
    booking: {
      id: BOOKING,
      status: "completed",
      payment_method: "online",
      payment_status: "paid",
      settlement_status: "pending",
      service_amount: 999,
      discount_amount: 0,
      tip_amount: 50,
      scheduled_at: null,
      created_at: "2026-11-09T06:00:00Z",
      cancellation_reason: null,
      customer: { id: "u1", name: "Asha Rao" },
      customer_phone: "+919876500001",
      provider: { id: "sp1", name: "Ravi Services" },
      professional: null,
    },
    refunds: {
      channel: "RAZORPAY",
      captured: 999,
      cancel_refund: 0,
      cancel_refund_id: null,
      cancel_refunded_at: null,
      dispute_refunds: 0,
      refundable: 999,
      support_refund_limit: 500,
    },
    open_dispute: open,
    disputes: open ? [open] : [],
    ...overrides,
  };
}

type Routes = Record<string, () => Response | Promise<Response>>;

function signedIn(role: AdminRole, routes: Routes = {}) {
  setSessionToken("t1");
  return mockApi({
    "GET /admin/auth/me": () => json(adminUser(role)),
    [`GET ${disputesListPath({})}`]: () =>
      json({
        items: [
          row(),
          row({
            id: "d2",
            booking_id: "fe274a3a-67ed-496e-a8c5-9382ceaca65b",
            status: "RESOLVED",
            resolution_type: "PARTIAL_REFUND",
            refund_amount: 200,
            refund_channel: "RAZORPAY",
            refund_status: "FAILED",
          }),
        ],
        total: 2,
        page: 1,
        per_page: 50,
      }),
    [DETAIL]: () => json(detail()),
    ...routes,
  });
}

const bodyOf = (api: ReturnType<typeof signedIn>, key: string) =>
  JSON.parse(String(api.calls.find((c) => c.key === key)?.init.body));

beforeEach(() => {
  resetAuthState();
});

describe("the queue", () => {
  it("shows each dispute and links to its booking", async () => {
    signedIn("support");
    renderApp("/operator/refunds");
    const table = await screen.findByRole("table", { name: "Disputes" });
    const rows = within(table).getAllByRole("row");
    expect(rows[1]).toHaveTextContent("Asha Rao");
    expect(rows[1]).toHaveTextContent("No-show");
    expect(rows[1]).toHaveTextContent("Raised");
    expect(rows[2]).toHaveTextContent("₹200 · Razorpay");
    expect(within(rows[2]).getByText("Refund failed")).toBeInTheDocument();
    expect(within(rows[1]).getByRole("link")).toHaveAttribute(
      "href",
      `/operator/refunds/${BOOKING}`,
    );
  });

  it("reads its filters from the URL", async () => {
    const filtered = disputesListPath({ status: "RESOLVED", from: "2026-11-01" });
    const api = signedIn("admin", {
      [`GET ${filtered}`]: () => json({ items: [], total: 0, page: 1, per_page: 50 }),
    });
    renderApp("/operator/refunds?status=RESOLVED&from=2026-11-01");
    expect(await screen.findByText("No dispute matches.")).toBeInTheDocument();
    expect(api.count(`GET ${filtered}`)).toBeGreaterThan(0);
    expect(filtered).toContain("date_from=2026-10-31T18%3A30%3A00.000Z");
  });
});

describe("a booking's dispute page", () => {
  it("shows the refund math, the cap and that Paid stays", async () => {
    signedIn("admin");
    renderApp(`/operator/refunds/${BOOKING}`);
    const refund = await screen.findByRole("region", { name: "Refund" });
    expect(within(refund).getByText("Left to refund").parentElement).toHaveTextContent("₹999");
    expect(refund).toHaveTextContent("₹500 per dispute. Your role has no cap.");
    expect(refund).toHaveTextContent(/payment status: "Paid" stays/);
    expect(refund).toHaveTextContent(/provider's payout is untouched/);
  });

  it("shows not found for an id that isn't one, without calling the API", async () => {
    const api = signedIn("admin");
    renderApp("/operator/refunds/not-a-uuid");
    expect(await screen.findByText("No booking with this ID.")).toBeInTheDocument();
    expect(api.calls.some((c) => c.key.includes("/bookings/not-a-uuid"))).toBe(false);
  });

  it("shows not found for a codeless 422 too", async () => {
    signedIn("admin", {
      [DETAIL]: () => json({ detail: [{ msg: "bad uuid" }] }, 422),
    });
    renderApp(`/operator/refunds/${BOOKING}`);
    expect(await screen.findByText("No booking with this ID.")).toBeInTheDocument();
  });

  it("logs a dispute when none is open", async () => {
    let logged = false;
    const api = signedIn("support", {
      [DETAIL]: () => json(logged ? detail() : detail({}, null)),
      [`POST ${DISPUTES_PATH}`]: () => {
        logged = true;
        return json(row(), 201);
      },
    });
    const user = userEvent.setup();
    renderApp(`/operator/refunds/${BOOKING}`);
    await user.click(await screen.findByRole("combobox", { name: "Reason" }));
    await user.click(await screen.findByRole("option", { name: "Quality" }));
    await user.type(screen.getByLabelText("What the customer says"), "  Stains left  ");
    await user.click(screen.getByRole("button", { name: "Log dispute" }));

    expect(await screen.findByText(/Dispute logged/)).toBeInTheDocument();
    expect(bodyOf(api, `POST ${DISPUTES_PATH}`)).toEqual({
      booking_id: BOOKING,
      reason_code: "QUALITY",
      description: "Stains left",
    });
    expect(await screen.findByRole("region", { name: "Open dispute" })).toBeInTheDocument();
  });

  it("offers no log form on a booking that isn't over", async () => {
    signedIn("admin", {
      [DETAIL]: () =>
        json(detail({ booking: { ...detail().booking, status: "in_progress" } }, null)),
    });
    renderApp(`/operator/refunds/${BOOKING}`);
    expect(
      await screen.findByText(/once the booking is completed or cancelled/),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Log dispute" })).not.toBeInTheDocument();
  });

  it("picks up a RAISED dispute", async () => {
    const api = signedIn("ops", {
      [REVIEW]: () => json(row({ status: "IN_REVIEW" })),
    });
    const user = userEvent.setup();
    renderApp(`/operator/refunds/${BOOKING}`);
    await user.click(await screen.findByRole("button", { name: "Pick up" }));
    expect(await screen.findByText(/in review/)).toBeInTheDocument();
    expect(api.count(REVIEW)).toBe(1);
  });
});

describe("resolving", () => {
  it("sends nothing until the confirm, which names the amount and channel", async () => {
    let resolved = false;
    const api = signedIn("admin", {
      [DETAIL]: () => json(resolved ? detail({}, null) : detail()),
      [RESOLVE]: () => {
        resolved = true;
        return json(
          row({
            status: "RESOLVED",
            resolution_type: "FULL_REFUND",
            refund_amount: 999,
            refund_channel: "RAZORPAY",
            refund_status: "PENDING",
          }),
        );
      },
    });
    const user = userEvent.setup();
    renderApp(`/operator/refunds/${BOOKING}`);
    await user.type(await screen.findByLabelText("Notes"), "No-show confirmed");
    await user.click(screen.getByRole("button", { name: "Resolve…" }));

    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveTextContent("Refund ₹999 through Razorpay?");
    expect(dialog).toHaveTextContent("can't be undone");
    expect(api.count(RESOLVE)).toBe(0);

    await user.click(within(dialog).getByRole("button", { name: "Go back" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(api.count(RESOLVE)).toBe(0);

    await user.click(screen.getByRole("button", { name: "Resolve…" }));
    await user.click(
      within(await screen.findByRole("dialog")).getByRole("button", { name: "Refund ₹999" }),
    );
    expect(await screen.findByText(/pending until Razorpay confirms/)).toBeInTheDocument();
    expect(api.count(RESOLVE)).toBe(1);
    expect(bodyOf(api, RESOLVE)).toEqual({
      resolution_type: "FULL_REFUND",
      refund_amount: 999,
      notes: "No-show confirmed",
    });
  });

  it("starts a partial refund empty and confirms no refund too", async () => {
    const api = signedIn("admin", {
      [RESOLVE]: () => json(row({ status: "CLOSED", resolution_type: "NO_REFUND" })),
    });
    const user = userEvent.setup();
    renderApp(`/operator/refunds/${BOOKING}`);
    await user.click(await screen.findByRole("radio", { name: "Partial refund" }));
    expect(screen.getByLabelText("Amount (₹)")).toHaveValue("");
    await user.type(screen.getByLabelText("Notes"), "Not our fault");
    await user.click(screen.getByRole("button", { name: "Resolve…" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByText("Enter the amount to refund.")).toBeInTheDocument();

    await user.click(screen.getByRole("radio", { name: "No refund" }));
    await user.click(screen.getByRole("button", { name: "Resolve…" }));
    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveTextContent("Close with no refund?");
    await user.click(within(dialog).getByRole("button", { name: "Close with no refund" }));
    expect(await screen.findByText("Closed with no refund.")).toBeInTheDocument();
    expect(bodyOf(api, RESOLVE)).toEqual({ resolution_type: "NO_REFUND", notes: "Not our fault" });
  });

  it("labels a cash refund as manual", async () => {
    signedIn("admin", {
      [DETAIL]: () => json(detail({ refunds: { ...detail().refunds, channel: "MANUAL" } })),
    });
    const user = userEvent.setup();
    renderApp(`/operator/refunds/${BOOKING}`);
    const section = await screen.findByRole("region", { name: "Open dispute" });
    expect(section).toHaveTextContent(
      "Manual refund: record only, pay the customer outside the app",
    );
    await user.type(screen.getByLabelText("Notes"), "Paid by UPI ref 123");
    await user.click(screen.getByRole("button", { name: "Resolve…" }));
    expect(await screen.findByRole("dialog")).toHaveTextContent("Record a ₹999 manual refund?");
  });

  it("stops support over the cap before sending", async () => {
    const api = signedIn("support");
    const user = userEvent.setup();
    renderApp(`/operator/refunds/${BOOKING}`);
    const refund = await screen.findByRole("region", { name: "Refund" });
    expect(refund).toHaveTextContent("₹500 per dispute. It applies to you.");
    await user.type(screen.getByLabelText("Notes"), "Full refund please");
    await user.click(screen.getByRole("button", { name: "Resolve…" }));
    expect(screen.getByText(/Support can refund up to ₹500 per dispute/)).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(api.count(RESOLVE)).toBe(0);
  });

  it("explains a 502, keeps the form, and reloads the page", async () => {
    const api = signedIn("admin", {
      [RESOLVE]: () =>
        json(
          { error: true, message: "gateway", status_code: 502, code: "REFUND_GATEWAY_ERROR" },
          502,
        ),
    });
    const user = userEvent.setup();
    renderApp(`/operator/refunds/${BOOKING}`);
    await user.type(await screen.findByLabelText("Notes"), "No-show");
    await user.click(screen.getByRole("button", { name: "Resolve…" }));
    await user.click(
      within(await screen.findByRole("dialog")).getByRole("button", { name: "Refund ₹999" }),
    );
    const alert = await screen.findByText(/may or may not have gone through/);
    expect(alert).toHaveTextContent(/Razorpay dashboard/);
    expect(alert).toHaveTextContent(/Retrying is safe/);
    expect(screen.getByLabelText("Notes")).toHaveValue("No-show");
    await waitFor(() => expect(api.count(DETAIL)).toBeGreaterThan(1));
  });

  it("shows Razorpay's reason for a rejection", async () => {
    signedIn("admin", {
      [RESOLVE]: () =>
        json(
          {
            error: true,
            message: "Razorpay refused",
            status_code: 422,
            code: "REFUND_REJECTED",
            details: { razorpay_error: "The payment id provided does not exist" },
          },
          422,
        ),
    });
    const user = userEvent.setup();
    renderApp(`/operator/refunds/${BOOKING}`);
    await user.type(await screen.findByLabelText("Notes"), "No-show");
    await user.click(screen.getByRole("button", { name: "Resolve…" }));
    await user.click(
      within(await screen.findByRole("dialog")).getByRole("button", { name: "Refund ₹999" }),
    );
    expect(
      await screen.findByText(
        /Razorpay refused the refund: The payment id provided does not exist/,
      ),
    ).toBeInTheDocument();
  });

  it("offers only no refund when nothing is left", async () => {
    signedIn("admin", {
      [DETAIL]: () => json(detail({ refunds: { ...detail().refunds, refundable: 0 } })),
    });
    renderApp(`/operator/refunds/${BOOKING}`);
    expect(await screen.findByRole("radio", { name: "No refund" })).toBeChecked();
    expect(screen.queryByRole("radio", { name: "Full refund" })).not.toBeInTheDocument();
  });
});
