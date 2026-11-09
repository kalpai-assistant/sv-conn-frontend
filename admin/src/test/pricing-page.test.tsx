/**
 * The /operator/pricing tabs through the real router and guard. Only fetch is
 * faked. jsdom applies no CSS, so the cards and the table both render: queries
 * for a cell take the first match.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { setSessionToken } from "@/lib/api";
import { resetAuthState, type AdminRole } from "@/lib/auth";
import {
  CATEGORIES_PATH,
  CONFIG_PATH,
  categoryPath,
  configPath,
  type CategoryPricingRow,
} from "@/lib/pricing";
import { adminUser, json, mockApi, renderApp } from "@/test/harness";

const AC = "c0000000-0000-4000-8000-000000000002";

function category(overrides: Partial<CategoryPricingRow> = {}): CategoryPricingRow {
  return {
    id: AC,
    name: "AC servicing",
    slug: "ac-servicing",
    parent_id: "c0000000-0000-4000-8000-000000000001",
    parent_name: "Appliances",
    sort_order: 0,
    is_active: true,
    is_sensitive: false,
    reference_price: 499,
    bounds_pct: null,
    platform_commission_pct: 20,
    platform_commission_min: 30,
    commission_gst_pct: 18,
    ...overrides,
  };
}

const ROWS = [
  category({
    id: "c0000000-0000-4000-8000-000000000001",
    name: "Appliances",
    slug: "appliances",
    parent_id: null,
    parent_name: null,
  }),
  category(),
];

const CONFIG = [
  {
    key: "ranking_weights",
    value: { rating: 0.35, price_vs_ref: 0.25, distance: 0.2, reliability: 0.15, activity: 0.05 },
    updated_at: "2026-11-01T10:00:00Z",
    updated_by: null,
  },
  { key: "boost_window_days", value: 14, updated_at: "2026-11-01T10:00:00Z", updated_by: null },
  { key: "boost_window_jobs", value: 10, updated_at: "2026-11-01T10:00:00Z", updated_by: null },
  { key: "sheet_ttl_seconds", value: 600, updated_at: "2026-11-01T10:00:00Z", updated_by: null },
];

type Routes = Record<string, () => Response | Promise<Response>>;

function signedIn(role: AdminRole, routes: Routes = {}) {
  setSessionToken("t1");
  return mockApi({
    "GET /admin/auth/me": () => json(adminUser(role)),
    [`GET ${CATEGORIES_PATH}`]: () => json(ROWS),
    [`GET ${CONFIG_PATH}`]: () => json(CONFIG),
    ...routes,
  });
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => (resolve = r));
  return { promise, resolve };
}

const editButton = async (name: RegExp) => (await screen.findAllByRole("button", { name }))[0];

beforeEach(() => {
  resetAuthState();
});

describe("the categories tab", () => {
  it("opens from /operator/pricing, with the tab marked current", async () => {
    signedIn("ops");
    renderApp("/operator/pricing");
    await editButton(/^Edit Commission for AC servicing/);
    expect(screen.getByRole("link", { name: "Categories" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(screen.getByRole("link", { name: "Formula" })).not.toHaveAttribute("aria-current");
  });

  it("shows a save at once, then rolls it back with the backend's message under the cell", async () => {
    const answer = deferred<Response>();
    const api = signedIn("ops", { [`PATCH ${categoryPath(AC)}`]: () => answer.promise });
    const user = userEvent.setup();
    renderApp("/operator/pricing/categories");

    await user.click(await editButton(/^Edit Commission for AC servicing, 20%/));
    const input = screen.getByRole("textbox", { name: "Commission for AC servicing" });
    await user.clear(input);
    await user.type(input, "22{Enter}");

    // Optimistic: the new value shows before the backend answers.
    expect(await editButton(/^Edit Commission for AC servicing, 22%/)).toBeInTheDocument();
    expect(api.calls.find((c) => c.key === `PATCH ${categoryPath(AC)}`)?.init.body).toBe(
      JSON.stringify({ platform_commission_pct: 22 }),
    );

    answer.resolve(
      json(
        {
          message: "platform_commission_pct must be between 0 and 100",
          code: "PRICING_INVALID",
          details: { field: "platform_commission_pct" },
        },
        422,
      ),
    );
    expect(
      (await screen.findAllByText("Commission % must be between 0 and 100"))[0],
    ).toBeInTheDocument();
    expect(await editButton(/^Edit Commission for AC servicing, 20%/)).toBeInTheDocument();
  });

  it("ticking Sensitive asks for bounds and sends both in one PATCH", async () => {
    const api = signedIn("admin", {
      [`PATCH ${categoryPath(AC)}`]: () => json(category({ is_sensitive: true, bounds_pct: 25 })),
    });
    const user = userEvent.setup();
    renderApp("/operator/pricing/categories");

    await user.click(
      (await screen.findAllByRole("checkbox", { name: "Sensitive: AC servicing" }))[0],
    );
    expect(api.count(`PATCH ${categoryPath(AC)}`)).toBe(0);
    await user.type(screen.getByRole("textbox", { name: "Bounds for AC servicing" }), "25{Enter}");

    expect(await editButton(/^Edit Bounds for AC servicing, ±25%/)).toBeInTheDocument();
    const patches = api.calls.filter((c) => c.key === `PATCH ${categoryPath(AC)}`);
    expect(patches.map((c) => c.init.body)).toEqual([
      JSON.stringify({ is_sensitive: true, bounds_pct: 25 }),
    ]);
  });

  it("empty bounds undo the tick and send nothing", async () => {
    const api = signedIn("admin");
    const user = userEvent.setup();
    renderApp("/operator/pricing/categories");

    const box = (await screen.findAllByRole("checkbox", { name: "Sensitive: AC servicing" }))[0];
    await user.click(box);
    expect(box).toBeChecked();
    await user.type(screen.getByRole("textbox", { name: "Bounds for AC servicing" }), "{Enter}");
    expect(box).not.toBeChecked();
    expect(api.count(`PATCH ${categoryPath(AC)}`)).toBe(0);
  });

  it("support reads, with no edit controls", async () => {
    signedIn("support");
    renderApp("/operator/pricing/categories");
    expect((await screen.findAllByText("₹499"))[0]).toBeInTheDocument();
    expect(screen.queryAllByRole("button", { name: /^Edit / })).toHaveLength(0);
    for (const box of screen.getAllByRole("checkbox")) expect(box).toBeDisabled();
  });
});

describe("the formula tab", () => {
  it("disables Save while the weights don't sum to 1.00, and sends all five in one PATCH", async () => {
    const api = signedIn("ops", {
      [`PATCH ${configPath("ranking_weights")}`]: () =>
        json({
          ...CONFIG[0],
          value: {
            rating: 0.4,
            price_vs_ref: 0.2,
            distance: 0.2,
            reliability: 0.15,
            activity: 0.05,
          },
          updated_at: "2026-11-09T10:00:00Z",
        }),
    });
    const user = userEvent.setup();
    renderApp("/operator/pricing/formula");

    const save = await screen.findByRole("button", { name: "Save weights" });
    expect(save).toBeDisabled(); // nothing changed yet
    const rating = screen.getByLabelText("Rating");
    await user.clear(rating);
    await user.type(rating, "0.4");
    expect(screen.getByText(/Current sum: 1\.05 ✗/)).toBeInTheDocument();
    expect(save).toBeDisabled();

    const price = screen.getByLabelText("Price vs reference");
    await user.clear(price);
    await user.type(price, "0.2");
    expect(screen.getByText(/Current sum: 1\.00 ✓/)).toBeInTheDocument();
    expect(save).toBeEnabled();
    await user.click(save);

    await screen.findByText("Saved.");
    expect(
      api.calls.find((c) => c.key === `PATCH ${configPath("ranking_weights")}`)?.init.body,
    ).toBe(
      JSON.stringify({
        value: { rating: 0.4, price_vs_ref: 0.2, distance: 0.2, reliability: 0.15, activity: 0.05 },
      }),
    );
  });

  it("saves one key per PATCH", async () => {
    const api = signedIn("admin", {
      [`PATCH ${configPath("sheet_ttl_seconds")}`]: () =>
        json({ ...CONFIG[3], value: 900, updated_at: "2026-11-09T10:00:00Z" }),
    });
    const user = userEvent.setup();
    renderApp("/operator/pricing/formula");

    const ttl = await screen.findByLabelText("Seconds");
    await user.clear(ttl);
    await user.type(ttl, "900");
    await user.click(screen.getByRole("button", { name: "Save Seconds" }));
    await waitFor(() => expect(api.count(`PATCH ${configPath("sheet_ttl_seconds")}`)).toBe(1));
    expect(api.calls.filter((c) => c.key.startsWith("PATCH"))).toHaveLength(1);
    expect(await screen.findByText("Saved.")).toBeInTheDocument();
  });

  it("support sees the values and no Save buttons", async () => {
    signedIn("support");
    renderApp("/operator/pricing/formula");
    expect(await screen.findByText("600")).toBeInTheDocument();
    expect(screen.queryAllByRole("button", { name: /^Save/ })).toHaveLength(0);
    expect(screen.queryAllByRole("textbox")).toHaveLength(0);
  });
});
