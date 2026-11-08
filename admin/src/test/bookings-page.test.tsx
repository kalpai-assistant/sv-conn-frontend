/**
 * The /operator/bookings page through the real router and guard. Only fetch is faked.
 * jsdom applies no CSS, so the cards and the table both render: queries for a row
 * take the first match.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { setSessionToken } from "@/lib/api";
import { resetAuthState, type AdminRole } from "@/lib/auth";
import { bookingPath, bookingsListPath, type Booking, type BookingsSearch } from "@/lib/bookings";
import { adminUser, appError, json, mockApi, renderApp } from "@/test/harness";
import {
  BOOKING_ID,
  OTHER_ID,
  assignmentItem,
  booking,
  bookingDetail,
  statusItem,
} from "@/test/booking-fixtures";

const ME = "GET /admin/auth/me";
const list = (search: BookingsSearch = {}) => `GET ${bookingsListPath(search)}`;
const DETAIL = `GET ${bookingPath(BOOKING_ID)}`;
const TIMELINE = `GET ${bookingPath(BOOKING_ID)}/timeline`;
const CANCEL = `POST ${bookingPath(BOOKING_ID)}/cancel`;

const pageOf = (bookings: Booking[], total = bookings.length, page = 1) =>
  json({ bookings, total, page, per_page: 25 });

const TIMELINE_ITEMS = [
  statusItem({
    from_status: "requested",
    to_status: "accepted",
    created_at: "2026-11-05T06:31:00Z",
  }),
  assignmentItem({ note: "Picked from the team" }),
  statusItem({
    from_status: "accepted",
    to_status: "expired",
    actor_user_id: null,
    actor_name: null,
    note: "No Pro took it",
  }),
];

type Routes = Record<string, () => Response | Promise<Response>>;

function signedIn(routes: Routes = {}, role: AdminRole = "admin") {
  setSessionToken("t1");
  return mockApi({
    [ME]: () => json(adminUser(role)),
    [list()]: () => pageOf([booking(), booking({ id: OTHER_ID, is_disputed: true })], 60),
    [DETAIL]: () => json(bookingDetail()),
    [TIMELINE]: () => json(TIMELINE_ITEMS),
    ...routes,
  });
}

const detailPane = () => screen.findByRole("region", { name: "Booking detail" });

async function openFirstRow() {
  const [button] = await screen.findAllByRole("button", { name: "Open booking 3f2c9a1e" });
  await userEvent.click(button);
  return detailPane();
}

beforeEach(() => {
  resetAuthState();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("the list", () => {
  it("shows each booking's row, and pages from the total", async () => {
    signedIn();
    renderApp("/operator/bookings");

    const [row] = await screen.findAllByRole("button", { name: "Open booking 3f2c9a1e" });
    const card = row.closest("li")!;
    expect(card).toHaveTextContent("Deep Clean + 1 more");
    expect(card).toHaveTextContent("+919876542501");
    expect(card).toHaveTextContent("Ramesh Cleaning Co");
    expect(card).toHaveTextContent("₹1,849");
    expect(card).toHaveTextContent("Accepted");
    expect(card).toHaveTextContent("5 Nov 2026");
    expect(screen.getAllByText("Disputed").length).toBeGreaterThan(0);
    expect(screen.getByText("Page 1 of 3 · 60 bookings")).toBeInTheDocument();
  });

  it("goes to the next page, and back to page 1 when a filter changes", async () => {
    const api = signedIn({
      [list({ page: 2 })]: () => pageOf([booking({ id: OTHER_ID })], 60, 2),
      [list({ status: "completed" })]: () => pageOf([], 0),
    });
    const router = renderApp("/operator/bookings");

    await userEvent.click(await screen.findByRole("link", { name: "Next" }));
    expect(await screen.findByText("Page 2 of 3 · 60 bookings")).toBeInTheDocument();
    expect(router.state.location.search).toMatchObject({ page: 2 });

    await userEvent.click(screen.getByRole("combobox", { name: "Status" }));
    await userEvent.click(await screen.findByRole("option", { name: "Completed" }));

    expect(await screen.findByText("No bookings match these filters.")).toBeInTheDocument();
    expect(api.count(list({ status: "completed" }))).toBeGreaterThan(0);
    expect(router.state.location.search).toEqual({ status: "completed" });
  });

  it("applies the phone and SP name only on Apply, not per keystroke", async () => {
    const filtered = list({ phone: "98765 42501", sp: "sharma" });
    const api = signedIn({ [filtered]: () => pageOf([booking()]) });
    const router = renderApp("/operator/bookings");
    await screen.findAllByRole("button", { name: "Open booking 3f2c9a1e" });

    await userEvent.type(screen.getByLabelText("Customer phone"), "98765 42501");
    await userEvent.type(screen.getByLabelText("Service provider name"), "sharma");
    expect(api.calls.filter((call) => call.key.includes("consumer_phone"))).toHaveLength(0);

    await userEvent.click(screen.getByRole("button", { name: "Apply" }));
    await waitFor(() => expect(api.count(filtered)).toBeGreaterThan(0));
    expect(router.state.location.search).toMatchObject({ phone: "98765 42501", sp: "sharma" });
  });

  it("sends only whole dates, and shows the backend's refusal inline", async () => {
    const bad = list({ from: "2026-11-07", to: "2026-11-01" });
    const api = signedIn({
      [list({ from: "2026-11-07" })]: () => pageOf([booking()]),
      [bad]: () => json({ detail: "created_from must be on or before created_to" }, 422),
    });
    renderApp("/operator/bookings");
    await screen.findAllByRole("button", { name: "Open booking 3f2c9a1e" });

    fireEvent.change(screen.getByLabelText("Created from (IST)"), {
      target: { value: "0202-11-07" },
    });
    expect(api.calls.some((call) => call.key.includes("0202"))).toBe(false);

    fireEvent.change(screen.getByLabelText("Created from (IST)"), {
      target: { value: "2026-11-07" },
    });
    await waitFor(() => expect(api.count(list({ from: "2026-11-07" }))).toBeGreaterThan(0));
    fireEvent.change(screen.getByLabelText("Created to (IST)"), {
      target: { value: "2026-11-01" },
    });

    expect(
      await screen.findByText("created_from must be on or before created_to"),
    ).toBeInTheDocument();
    expect(screen.queryByText("Couldn't load bookings.")).not.toBeInTheDocument();
  });

  it("keeps filters from the URL, including a phone the router reads as a number", async () => {
    const api = signedIn({
      [list({ status: "cancelled", phone: "9876542501", disputed: true })]: () => pageOf([]),
    });
    renderApp("/operator/bookings?status=cancelled&phone=9876542501&disputed=true");

    expect(await screen.findByText("No bookings match these filters.")).toBeInTheDocument();
    expect(
      api.count(list({ status: "cancelled", phone: "9876542501", disputed: true })),
    ).toBeGreaterThan(0);
    expect(screen.getByLabelText("Customer phone")).toHaveValue("9876542501");
    expect(screen.getByLabelText("Disputed only")).toBeChecked();
  });
});

describe("opening a booking", () => {
  it("puts the booking in the URL, so a refresh or a shared link reopens it", async () => {
    signedIn();
    const router = renderApp("/operator/bookings");

    await openFirstRow();
    expect(router.state.location.search).toEqual({ booking: BOOKING_ID });

    const pane = await detailPane();
    await userEvent.click(within(pane).getByRole("button", { name: "Close booking" }));
    await waitFor(() =>
      expect(screen.queryByRole("region", { name: "Booking detail" })).not.toBeInTheDocument(),
    );
    expect(router.state.location.search).toEqual({});
  });

  it("opens straight from a link", async () => {
    signedIn();
    renderApp(`/operator/bookings?booking=${BOOKING_ID}`);
    const pane = await detailPane();
    expect(await within(pane).findByText(BOOKING_ID)).toBeInTheDocument();
    expect(await within(pane).findByText(/JP Nagar/)).toBeInTheDocument();
  });

  it("asks for the full id in the ID box, and opens it when given", async () => {
    signedIn();
    const router = renderApp("/operator/bookings");
    await screen.findAllByRole("button", { name: "Open booking 3f2c9a1e" });

    await userEvent.type(screen.getByLabelText("Booking ID"), "3f2c9a1e");
    await userEvent.click(screen.getByRole("button", { name: "Open" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Paste the full booking ID");
    expect(router.state.location.search).toEqual({});

    await userEvent.clear(screen.getByLabelText("Booking ID"));
    await userEvent.type(screen.getByLabelText("Booking ID"), ` ${BOOKING_ID.toUpperCase()} `);
    await userEvent.click(screen.getByRole("button", { name: "Open" }));
    await detailPane();
    expect(router.state.location.search).toEqual({ booking: BOOKING_ID });
  });

  it("says so when no booking has the id", async () => {
    signedIn({
      [`GET ${bookingPath(OTHER_ID)}`]: () =>
        appError(404, "BOOKING_NOT_FOUND", `Booking ${OTHER_ID} not found`),
      [`GET ${bookingPath(OTHER_ID)}/timeline`]: () =>
        appError(404, "BOOKING_NOT_FOUND", `Booking ${OTHER_ID} not found`),
    });
    renderApp(`/operator/bookings?booking=${OTHER_ID}`);
    const pane = await detailPane();
    expect(await within(pane).findByText("No booking with this ID")).toBeInTheDocument();
    expect(within(pane).queryByText("Couldn't load the timeline.")).not.toBeInTheDocument();
  });
});

describe("the detail", () => {
  it("shows the money, the people and the place", async () => {
    signedIn();
    renderApp("/operator/bookings");
    const pane = await openFirstRow();

    const payment = await within(pane).findByRole("region", { name: "Payment" });
    expect(payment).toHaveTextContent("Service amount₹1,999");
    expect(payment).toHaveTextContent("Discount− ₹200");
    expect(payment).toHaveTextContent("Tip₹50");
    expect(payment).toHaveTextContent("Total charged₹1,849");
    expect(payment).toHaveTextContent("Platform commission₹299.85");
    expect(payment).toHaveTextContent("Provider payout₹1,699.15");
    expect(payment).toHaveTextContent("Online");
    expect(payment).toHaveTextContent("Paid");

    const people = within(pane).getByRole("region", { name: "People and place" });
    expect(people).toHaveTextContent("+919876542501");
    expect(people).toHaveTextContent("Ramesh Cleaning Co");
    expect(people).toHaveTextContent("ProRamesh");
    expect(people).toHaveTextContent("42, 7th Cross, JP Nagar, Bengaluru 560078");

    const items = within(pane).getByRole("region", { name: "Items" });
    expect(items).toHaveTextContent("Deep Clean · 2 BHK × 1₹1,499");
    expect(items).toHaveTextContent("Sofa Shampoo × 2₹500");
  });

  it("shows the reason, settlement and dispute once the backend sends them", async () => {
    signedIn({
      [DETAIL]: () =>
        json(
          bookingDetail({
            status: "cancelled",
            is_disputed: true,
            cancellation_reason: "Customer asked",
            settlement_status: "pending",
            settled_at: null,
          }),
        ),
    });
    renderApp(`/operator/bookings?booking=${BOOKING_ID}`);
    const pane = await detailPane();

    const summary = await within(pane).findByRole("region", { name: "Summary" });
    expect(summary).toHaveTextContent("Cancellation reasonCustomer asked");
    expect(summary).toHaveTextContent("DisputedYes");
    expect(within(pane).getByRole("region", { name: "Payment" })).toHaveTextContent(
      "SP payout statusPending",
    );
    expect(
      within(pane).queryByText("Customer payment settled to us (IST)"),
    ).not.toBeInTheDocument();
  });

  it("labels settled_at as the customer's payment reaching us, not the SP's payout", async () => {
    signedIn({
      [DETAIL]: () =>
        json(
          bookingDetail({
            status: "completed",
            settlement_status: "completed",
            settled_at: "2026-11-06T04:30:00Z",
          }),
        ),
    });
    renderApp(`/operator/bookings?booking=${BOOKING_ID}`);
    const pane = await detailPane();

    const payment = await within(pane).findByRole("region", { name: "Payment" });
    expect(payment).toHaveTextContent("SP payout statusCompleted");
    expect(payment).toHaveTextContent("Customer payment settled to us (IST)6 Nov 2026");
    expect(within(pane).queryByText("Settlement")).not.toBeInTheDocument();
    expect(within(pane).queryByText("Settled (IST)")).not.toBeInTheDocument();
  });

  it("leaves out the optional fields when the backend doesn't send them", async () => {
    signedIn();
    renderApp(`/operator/bookings?booking=${BOOKING_ID}`);
    const pane = await detailPane();
    await within(pane).findByRole("region", { name: "Summary" });
    expect(within(pane).queryByText("Cancellation reason")).not.toBeInTheDocument();
    expect(within(pane).queryByText("SP payout status")).not.toBeInTheDocument();
  });

  it("renders values from outside as text, never markup", async () => {
    signedIn({
      [DETAIL]: () => json(bookingDetail({ provider_name: "<img src=x onerror=alert(1)>Evil Co" })),
    });
    renderApp(`/operator/bookings?booking=${BOOKING_ID}`);
    const pane = await detailPane();
    expect(
      await within(pane).findByText(/<img src=x onerror=alert\(1\)>Evil Co/),
    ).toBeInTheDocument();
    expect(pane.querySelector("img")).toBeNull();
  });
});

describe("the timeline", () => {
  it("lists status changes and assignments in order, with the actor and the note", async () => {
    signedIn();
    renderApp(`/operator/bookings?booking=${BOOKING_ID}`);
    const pane = await detailPane();
    const entries = within(await within(pane).findByRole("list", { name: "Timeline entries" }))
      .getAllByRole("listitem")
      .map((item) => item.textContent);

    expect(entries).toHaveLength(3);
    expect(entries[0]).toContain("Requested → Accepted");
    expect(entries[0]).toContain("By Ramesh Cleaning Co");
    expect(entries[1]).toContain("Pro assigned");
    expect(entries[1]).toContain("nobody → Ramesh");
    expect(entries[1]).toContain("Note: Picked from the team");
    expect(entries[2]).toContain("Accepted → Expired");
    expect(entries[2]).toContain("By System");
    expect(entries[2]).toContain("Note: No Pro took it");
  });

  it("can fail on its own and be retried, while the booking still shows", async () => {
    let fail = true;
    signedIn({
      [TIMELINE]: () => (fail ? json({ message: "boom" }, 500) : json(TIMELINE_ITEMS)),
    });
    renderApp(`/operator/bookings?booking=${BOOKING_ID}`);
    const pane = await detailPane();
    expect(await within(pane).findByText("Couldn't load the timeline.")).toBeInTheDocument();
    expect(within(pane).getByRole("region", { name: "Payment" })).toBeInTheDocument();

    fail = false;
    await userEvent.click(within(pane).getByRole("button", { name: /try again/i }));
    expect(await within(pane).findByText("Pro assigned")).toBeInTheDocument();
  });
});

describe("force cancel", () => {
  it.each<[AdminRole, boolean]>([
    ["admin", true],
    ["ops", true],
    ["support", false],
  ])("%s sees the button: %s", async (role, shown) => {
    signedIn({}, role);
    renderApp(`/operator/bookings?booking=${BOOKING_ID}`);
    const pane = await detailPane();
    await within(pane).findByRole("region", { name: "Summary" });
    expect(Boolean(within(pane).queryByRole("button", { name: "Force cancel" }))).toBe(shown);
  });

  it.each(["completed", "cancelled", "expired"])(
    "isn't offered for a %s booking",
    async (status) => {
      signedIn({ [DETAIL]: () => json(bookingDetail({ status })) });
      renderApp(`/operator/bookings?booking=${BOOKING_ID}`);
      const pane = await detailPane();
      await within(pane).findByRole("region", { name: "Summary" });
      expect(within(pane).queryByRole("button", { name: "Force cancel" })).not.toBeInTheDocument();
    },
  );

  it("says plainly that a job in progress gets no automatic refund", async () => {
    signedIn({ [DETAIL]: () => json(bookingDetail({ status: "in_progress" })) }, "ops");
    renderApp(`/operator/bookings?booking=${BOOKING_ID}`);
    const pane = await detailPane();
    await userEvent.click(await within(pane).findByRole("button", { name: "Force cancel" }));
    expect(await screen.findByRole("dialog")).toHaveTextContent(/no automatic refund/);
  });

  it("needs a reason, sends it trimmed, then refreshes the detail, timeline and list", async () => {
    let cancelled = false;
    const api = signedIn(
      {
        [DETAIL]: () =>
          json(bookingDetail(cancelled ? { status: "cancelled", cancellation_reason: "dup" } : {})),
        [CANCEL]: () => {
          cancelled = true;
          return json(bookingDetail({ status: "cancelled", payment_status: "refund_processing" }));
        },
      },
      "ops",
    );
    renderApp(`/operator/bookings?booking=${BOOKING_ID}`);
    const pane = await detailPane();
    await userEvent.click(await within(pane).findByRole("button", { name: "Force cancel" }));
    const dialog = await screen.findByRole("dialog");

    await userEvent.type(within(dialog).getByLabelText("Reason (required)"), "   ");
    await userEvent.click(within(dialog).getByRole("button", { name: "Force cancel" }));
    expect(within(dialog).getByRole("alert")).toHaveTextContent("Enter a reason.");
    expect(api.count(CANCEL)).toBe(0);

    const before = {
      list: api.count(list()),
      detail: api.count(DETAIL),
      timeline: api.count(TIMELINE),
    };
    await userEvent.type(within(dialog).getByLabelText("Reason (required)"), "  dup  ");
    await userEvent.click(within(dialog).getByRole("button", { name: "Force cancel" }));

    expect(await within(pane).findByRole("status")).toHaveTextContent(
      "Booking cancelled. The refund has started.",
    );
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    const sent = api.calls.find((call) => call.key === CANCEL)!;
    expect(JSON.parse(String(sent.init.body))).toEqual({ reason: "dup" });
    await waitFor(() => {
      expect(api.count(list())).toBeGreaterThan(before.list);
      expect(api.count(DETAIL)).toBeGreaterThan(before.detail);
      expect(api.count(TIMELINE)).toBeGreaterThan(before.timeline);
    });
    expect(await within(pane).findByText("Cancellation reason")).toBeInTheDocument();
    expect(within(pane).queryByRole("button", { name: "Force cancel" })).not.toBeInTheDocument();
  });

  it("on a 409 shows the backend's message and refreshes", async () => {
    let finished = false;
    const api = signedIn({
      [DETAIL]: () => json(bookingDetail(finished ? { status: "completed" } : {})),
      [CANCEL]: () => {
        finished = true;
        return appError(
          409,
          "INVALID_STATE_TRANSITION",
          "Cannot force-cancel a booking that is already completed.",
        );
      },
    });
    renderApp(`/operator/bookings?booking=${BOOKING_ID}`);
    const pane = await detailPane();
    await userEvent.click(await within(pane).findByRole("button", { name: "Force cancel" }));
    const dialog = await screen.findByRole("dialog");
    await userEvent.type(within(dialog).getByLabelText("Reason (required)"), "stuck");
    await userEvent.click(within(dialog).getByRole("button", { name: "Force cancel" }));

    expect(await within(pane).findByRole("alert")).toHaveTextContent(
      "Cannot force-cancel a booking that is already completed.",
    );
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    await waitFor(() =>
      expect(within(pane).queryByRole("button", { name: "Force cancel" })).not.toBeInTheDocument(),
    );
    expect(api.count(CANCEL)).toBe(1);
  });

  it("keeps the dialog and the reason open when the call fails, so it can be tried again", async () => {
    signedIn({ [CANCEL]: () => json({ message: "boom" }, 503) });
    renderApp(`/operator/bookings?booking=${BOOKING_ID}`);
    const pane = await detailPane();
    await userEvent.click(await within(pane).findByRole("button", { name: "Force cancel" }));
    const dialog = await screen.findByRole("dialog");
    await userEvent.type(within(dialog).getByLabelText("Reason (required)"), "stuck");
    await userEvent.click(within(dialog).getByRole("button", { name: "Force cancel" }));

    expect(await within(dialog).findByRole("alert")).toHaveTextContent(
      "Couldn't cancel this booking. Please try again.",
    );
    expect(within(dialog).getByLabelText("Reason (required)")).toHaveValue("stuck");
  });
});
