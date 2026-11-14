/**
 * The /operator/coupons screens through the real router and guard. Only fetch is
 * faked. jsdom applies no CSS, so the list's cards and table both render: queries
 * for a row take the first match.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { setSessionToken } from "@/lib/api";
import { resetAuthState, type AdminRole } from "@/lib/auth";
import { COUPONS_PATH, couponPath, couponsListPath, type CouponDetail } from "@/lib/coupons";
import { adminUser, json, mockApi, renderApp } from "@/test/harness";

function coupon(overrides: Partial<CouponDetail> = {}): CouponDetail {
  return {
    id: "c0000000-0000-4000-8000-000000000001",
    code: "WELCOME10",
    discount_type: "percent",
    discount_value: 10,
    max_discount: 150,
    min_order_amount: 500,
    valid_from: "2026-11-01T04:30:00Z",
    valid_until: "2027-12-31T18:29:00Z",
    usage_limit: 10,
    usage_limit_per_user: 1,
    is_active: true,
    user_id: null,
    owner_name: null,
    owner_phone: null,
    usage_count: 1,
    status: "active",
    created_at: "2026-11-01T04:30:00Z",
    total_discount: 150,
    recent_redemptions: [
      {
        booking_id: "b0000000-0000-4000-8000-00000000000a",
        booking_status: "cancelled",
        redeemed_at: "2026-11-05T06:00:00Z",
        discount_applied: 150,
        customer_id: "u1",
        customer_name: "Asha Rao",
      },
    ],
    ...overrides,
  };
}

const LIST = {
  items: [
    coupon(),
    coupon({
      id: "c2",
      code: "REFTESTER",
      user_id: "u9",
      owner_name: "Ravi Kumar",
      owner_phone: "+919999900009",
      usage_count: 1,
      usage_limit: 1,
      status: "exhausted",
    }),
  ],
  total: 2,
  page: 1,
  per_page: 50,
};

type Routes = Record<string, () => Response | Promise<Response>>;

function signedIn(role: AdminRole, routes: Routes = {}) {
  setSessionToken("t1");
  return mockApi({
    "GET /admin/auth/me": () => json(adminUser(role)),
    [`GET ${couponsListPath({})}`]: () => json(LIST),
    [`GET ${couponPath("WELCOME10")}`]: () => json(coupon()),
    ...routes,
  });
}

function refusal(status: number, code: string, message: string, field: string) {
  return json({ error: true, message, status_code: status, code, details: { field } }, status);
}

async function fillCreateForm(user: ReturnType<typeof userEvent.setup>) {
  await user.type(await screen.findByLabelText("Code"), "diwali-25");
  await user.type(screen.getByLabelText("Discount value"), "25");
  await user.type(screen.getByLabelText("Max discount (₹)"), "200");
  fireEvent.change(screen.getByLabelText("Valid until"), {
    target: { value: "2099-12-31T23:59" },
  });
}

function describedBy(input: HTMLElement): string {
  return (input.getAttribute("aria-describedby") ?? "")
    .split(" ")
    .map((id) => document.getElementById(id)?.textContent ?? "")
    .join(" | ");
}

beforeEach(() => {
  resetAuthState();
});

describe("the coupon list", () => {
  it("shows each coupon's terms, usage, status and owner", async () => {
    signedIn("ops");
    renderApp("/operator/coupons");
    const table = await screen.findByRole("table", { name: "Coupons" });
    const welcome = within(table).getByRole("row", { name: /WELCOME10/ });
    expect(welcome).toHaveTextContent("10% · cap ₹150");
    expect(welcome).toHaveTextContent("₹500");
    expect(welcome).toHaveTextContent("1 / 10");
    expect(welcome).toHaveTextContent("Active");
    const ref = within(table).getByRole("row", { name: /REFTESTER/ });
    expect(ref).toHaveTextContent("Personal · Ravi Kumar");
    expect(ref).toHaveTextContent("Limit reached");
    expect(screen.getByRole("link", { name: "New coupon" })).toBeInTheDocument();
  });

  it("support gets no New coupon button", async () => {
    signedIn("support");
    renderApp("/operator/coupons");
    await screen.findByRole("table", { name: "Coupons" });
    expect(screen.queryByRole("link", { name: "New coupon" })).not.toBeInTheDocument();
    expect(screen.getByText(/Read only/)).toBeInTheDocument();
  });
});

describe("creating a coupon", () => {
  it("uppercases the code as it's typed, then opens the new coupon", async () => {
    const api = signedIn("admin", {
      [`POST ${COUPONS_PATH}`]: () => json(coupon({ code: "DIWALI25" }), 201),
      [`GET ${couponPath("DIWALI25")}`]: () => json(coupon({ code: "DIWALI25" })),
    });
    const user = userEvent.setup();
    renderApp("/operator/coupons/new");
    await fillCreateForm(user);
    expect(screen.getByLabelText("Code")).toHaveValue("DIWALI25");
    await user.click(screen.getByRole("button", { name: "Create coupon" }));

    expect(await screen.findByRole("heading", { name: "DIWALI25" })).toBeInTheDocument();
    const body = JSON.parse(
      String(api.calls.find((c) => c.key === `POST ${COUPONS_PATH}`)?.init.body),
    );
    expect(body).toEqual({
      code: "DIWALI25",
      discount_type: "percent",
      discount_value: 25,
      max_discount: 200,
      valid_until: "2099-12-31T23:59:00+05:30",
      usage_limit_per_user: 1,
      is_active: true,
    });
  });

  it("puts the backend's 422 under the field it names", async () => {
    signedIn("admin", {
      [`POST ${COUPONS_PATH}`]: () =>
        refusal(
          422,
          "COUPON_INVALID",
          "max_discount must be more than 0, or empty",
          "max_discount",
        ),
    });
    const user = userEvent.setup();
    renderApp("/operator/coupons/new");
    await fillCreateForm(user);
    await user.click(screen.getByRole("button", { name: "Create coupon" }));

    const max = screen.getByLabelText("Max discount (₹)");
    await waitFor(() => expect(max).toHaveAttribute("aria-invalid", "true"));
    expect(describedBy(max)).toContain("Max discount must be more than 0, or empty");
    expect(max).toHaveValue("200"); // nothing to retype
  });

  it("puts a 409 under the code", async () => {
    signedIn("ops", {
      [`POST ${COUPONS_PATH}`]: () =>
        refusal(409, "COUPON_CODE_TAKEN", "A coupon with code DIWALI25 already exists", "code"),
    });
    const user = userEvent.setup();
    renderApp("/operator/coupons/new");
    await fillCreateForm(user);
    await user.click(screen.getByRole("button", { name: "Create coupon" }));

    const code = screen.getByLabelText("Code");
    await waitFor(() => expect(code).toHaveAttribute("aria-invalid", "true"));
    expect(describedBy(code)).toContain("A coupon with code DIWALI25 already exists");
    expect(code).toHaveFocus();
  });

  it("refuses NEW before anything is sent", async () => {
    const api = signedIn("admin");
    const user = userEvent.setup();
    renderApp("/operator/coupons/new");
    await user.type(await screen.findByLabelText("Code"), "new");
    await user.click(screen.getByRole("button", { name: "Create coupon" }));
    expect(describedBy(screen.getByLabelText("Code"))).toMatch(/NEW is reserved/);
    expect(api.count(`POST ${COUPONS_PATH}`)).toBe(0);
  });

  it("hides max discount on a flat coupon", async () => {
    signedIn("admin");
    const user = userEvent.setup();
    renderApp("/operator/coupons/new");
    await user.click(await screen.findByRole("radio", { name: "Flat amount" }));
    expect(screen.queryByLabelText("Max discount (₹)")).not.toBeInTheDocument();
  });

  it("sends support back to the list", async () => {
    signedIn("support");
    const router = renderApp("/operator/coupons/new");
    await screen.findByRole("table", { name: "Coupons" });
    expect(router.state.location.pathname).toBe("/operator/coupons");
  });
});

describe("a coupon's page", () => {
  it("shows usage, the total and the bookings, each linked into Bookings", async () => {
    signedIn("admin");
    renderApp("/operator/coupons/WELCOME10");
    const usage = await screen.findByRole("region", { name: "Usage" });
    expect(usage).toHaveTextContent("1 / 10");
    expect(usage).toHaveTextContent("₹150");
    expect(usage).toHaveTextContent("Cancelled bookings still count toward the limit.");
    expect(usage).toHaveTextContent("Asha Rao");
    expect(within(usage).getByRole("link", { name: "Booking b0000000" })).toHaveAttribute(
      "href",
      "/operator/bookings?booking=b0000000-0000-4000-8000-00000000000a",
    );
  });

  it("saves only the changed fields", async () => {
    const api = signedIn("ops", {
      [`PATCH ${couponPath("WELCOME10")}`]: () => json(coupon({ discount_value: 12 })),
    });
    const user = userEvent.setup();
    renderApp("/operator/coupons/WELCOME10");
    const value = await screen.findByLabelText("Discount value");
    await user.clear(value);
    await user.type(value, "12");
    await user.click(screen.getByRole("button", { name: "Save changes" }));

    expect(await screen.findByText("Saved.")).toBeInTheDocument();
    expect(api.calls.find((c) => c.key === `PATCH ${couponPath("WELCOME10")}`)?.init.body).toBe(
      JSON.stringify({ discount_value: 12 }),
    );
  });

  it("deactivates only after the confirm", async () => {
    const api = signedIn("admin", {
      [`POST ${couponPath("WELCOME10")}/deactivate`]: () =>
        json(coupon({ is_active: false, status: "inactive" })),
    });
    const user = userEvent.setup();
    renderApp("/operator/coupons/WELCOME10");
    await user.click(await screen.findByRole("button", { name: "Deactivate" }));
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveTextContent("Customers can no longer apply it.");
    expect(api.count(`POST ${couponPath("WELCOME10")}/deactivate`)).toBe(0);
    await user.click(within(dialog).getByRole("button", { name: "Deactivate" }));
    expect(
      await screen.findByText("WELCOME10 is deactivated. Customers can no longer apply it."),
    ).toBeInTheDocument();
    expect(api.count(`POST ${couponPath("WELCOME10")}/deactivate`)).toBe(1);
  });

  it("support sees the terms with no edit, deactivate or activate controls", async () => {
    signedIn("support");
    renderApp("/operator/coupons/WELCOME10");
    const terms = await screen.findByRole("region", { name: "Terms" });
    expect(terms).toHaveTextContent("10% · cap ₹150");
    expect(screen.queryByRole("button", { name: "Deactivate" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Activate" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Save changes" })).not.toBeInTheDocument();
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  });

  it("says so when there's no such coupon", async () => {
    signedIn("admin", {
      [`GET ${couponPath("NOPE1")}`]: () =>
        json({ message: "Coupon not found", code: "COUPON_NOT_FOUND" }, 404),
    });
    renderApp("/operator/coupons/NOPE1");
    expect(await screen.findByText("No coupon with the code NOPE1.")).toBeInTheDocument();
  });
});
