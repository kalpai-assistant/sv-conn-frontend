/**
 * The variant editor on /operator/catalog/services/$serviceId (SVC-481), through
 * the real router and guard. Only fetch is faked. jsdom applies no CSS, so the
 * cards and the table both render: queries for a row's control take the first match.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { setSessionToken } from "@/lib/api";
import { resetAuthState, type AdminRole } from "@/lib/auth";
import {
  CATALOG_PATH,
  servicePath,
  variantPath,
  type ServiceDetail,
  type ServiceVariantRow,
} from "@/lib/catalog";
import { adminUser, appError, json, mockApi, renderApp } from "@/test/harness";

const SERVICE = "s0000000-0000-4000-8000-000000000001";
const CATEGORY = "c0000000-0000-4000-8000-000000000001";

function variant(id: string, extra: Partial<ServiceVariantRow> = {}): ServiceVariantRow {
  return {
    id,
    label: id,
    subcategory: null,
    base_price: 799,
    duration_minutes: null,
    sort_order: 0,
    is_active: true,
    platform_commission: 240,
    provider_payout: 559,
    commission_pct: 30.04,
    gst_percent: 18,
    ...extra,
  };
}

const ONE_BHK = variant("1 BHK");
const TWO_BHK = variant("2 BHK", {
  base_price: 2999,
  platform_commission: 900,
  provider_payout: 2099,
  commission_pct: 30.01,
  sort_order: 1,
  duration_minutes: 240,
});

function detail(extra: Partial<ServiceDetail> = {}): ServiceDetail {
  return {
    id: SERVICE,
    category_id: CATEGORY,
    name: "Full home deep cleaning",
    price_unit: "PER_VISIT",
    min_qty: null,
    base_price: 799,
    duration_minutes: 180,
    icon_key: null,
    is_active: true,
    active_variant_count: 2,
    active_bookings: 0,
    description: null,
    created_at: "2026-11-01T00:00:00Z",
    updated_at: "2026-11-01T00:00:00Z",
    variants: [ONE_BHK, TWO_BHK],
    priced_per_variant: true,
    ...extra,
  };
}

const TREE = {
  categories: [
    {
      id: CATEGORY,
      name: "Cleaning",
      slug: "cleaning",
      description: null,
      icon_key: null,
      sort_order: 0,
      is_active: true,
      parent_id: null,
      children: [],
      services: [],
    },
  ],
};

type Routes = Record<string, () => Response | Promise<Response>>;

const V1 = variantPath(SERVICE, ONE_BHK.id);
const PATCH_V1 = `PATCH ${V1}`;

function signedIn(role: AdminRole, routes: Routes = {}, service = detail()) {
  setSessionToken("t1");
  return mockApi({
    "GET /admin/auth/me": () => json(adminUser(role)),
    [`GET ${servicePath(SERVICE)}`]: () => json(service),
    [`GET ${CATALOG_PATH}`]: () => json(TREE),
    ...routes,
  });
}

const open = () => renderApp(`/operator/catalog/services/${SERVICE}`);
const first = async (role: string, name: string | RegExp) =>
  (await screen.findAllByRole(role, { name }))[0];
const bodies = (api: ReturnType<typeof mockApi>, key: string) =>
  api.calls.filter((call) => call.key === key).map((call) => JSON.parse(String(call.init.body)));

async function editOneBhk() {
  await userEvent.click(await first("button", "Edit 1 BHK"));
  return screen.findByRole("dialog");
}

beforeEach(() => {
  resetAuthState();
});

describe("who edits", () => {
  it("support reads the list with no switch, edit or add", async () => {
    signedIn("support");
    open();
    const list = await screen.findByRole("list", { name: "Variants" });
    expect(within(list).getByText("1 BHK")).toBeInTheDocument();
    expect(screen.queryByRole("switch")).toBeNull();
    expect(screen.queryByRole("button", { name: /edit 1 bhk/i })).toBeNull();
    expect(screen.queryByRole("button", { name: "Add variant" })).toBeNull();
  });

  it("ops gets the editor: commission, amounts, read-only GST and a switch per row", async () => {
    signedIn("ops");
    open();
    expect(await first("switch", "Active: 1 BHK")).toHaveAttribute("aria-checked", "true");
    expect(screen.getAllByText(/30\.04% commission · ₹240 \/ ₹559 payout/).length).toBeGreaterThan(
      0,
    );
    expect(screen.getAllByText(/GST 18% \(read-only\)/).length).toBeGreaterThan(0);
    expect(
      screen.getByRole("columnheader", { name: "Customer GST (read-only)" }),
    ).toBeInTheDocument();
    expect(screen.getByText("from ₹799 / visit")).toBeInTheDocument();
  });
});

describe("a price edit", () => {
  it("shows the impact first; Back saves nothing; Save price sends only the price", async () => {
    const saved = detail({
      variants: [
        { ...ONE_BHK, base_price: 849, platform_commission: 255.02, provider_payout: 593.98 },
        TWO_BHK,
      ],
      base_price: 849,
    });
    const api = signedIn("admin", {
      [`GET ${V1}/price-impact?base_price=849`]: () =>
        json({ sp_prices: 4, outside_now: 0, outside_after: 2, moving_out: 2, moving_in: 0 }),
      [PATCH_V1]: () => json(saved),
    });
    open();
    const dialog = await editOneBhk();
    const price = within(dialog).getByLabelText("Price (₹)");
    await userEvent.clear(price);
    await userEvent.type(price, "849");
    // The preview keeps the exact stored ratio.
    expect(within(dialog).getByText("₹255.02 commission · ₹593.98 payout")).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole("button", { name: "Save" }));

    expect(
      await screen.findByText("2 pros move outside the recommended range, 0 move back in."),
    ).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(api.count(PATCH_V1)).toBe(0);

    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    await userEvent.click(await screen.findByRole("button", { name: "Save price" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(bodies(api, PATCH_V1)).toEqual([{ base_price: 849 }]);
    // The returned service is on screen, without a refetch.
    const gets = api.count(`GET ${servicePath(SERVICE)}`);
    expect(await screen.findByText("from ₹849 / visit")).toBeInTheDocument();
    expect(screen.getByText("1 BHK is saved.")).toBeInTheDocument();
    expect(api.count(`GET ${servicePath(SERVICE)}`)).toBe(gets);
  });

  it("says no pros are affected when nobody moves", async () => {
    signedIn("admin", {
      [`GET ${V1}/price-impact?base_price=800`]: () =>
        json({ sp_prices: 0, outside_now: 0, outside_after: 0, moving_out: 0, moving_in: 0 }),
    });
    open();
    const dialog = await editOneBhk();
    const price = within(dialog).getByLabelText("Price (₹)");
    await userEvent.clear(price);
    await userEvent.type(price, "800");
    await userEvent.click(within(dialog).getByRole("button", { name: "Save" }));
    expect(
      await screen.findByText("No pros move in or out of the recommended range."),
    ).toBeInTheDocument();
    expect(screen.getByText("No pros have a price on this variant yet.")).toBeInTheDocument();
  });
});

describe("a commission increase", () => {
  const notice = () =>
    appError(
      409,
      "COMMISSION_INCREASE_NEEDS_NOTICE",
      "Give pros at least 14 days' notice before saving",
      {
        old_pct: 30.04,
        new_pct: 35,
        notice_days: 14,
      },
    );

  it("asks for the 14 days' notice, then re-sends the same change with confirm", async () => {
    let sends = 0;
    const api = signedIn("admin", {
      [PATCH_V1]: () => (++sends === 1 ? notice() : json(detail())),
    });
    open();
    const dialog = await editOneBhk();
    const pct = within(dialog).getByLabelText("Commission (%)");
    await userEvent.clear(pct);
    await userEvent.type(pct, "35");
    await userEvent.click(within(dialog).getByRole("button", { name: "Save" }));

    expect(
      await screen.findByText("Give pros at least 14 days' notice before saving."),
    ).toBeInTheDocument();
    expect(screen.getByText("1 BHK: 30.04% → 35%")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Confirm increase" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(bodies(api, PATCH_V1)).toEqual([
      { commission_pct: 35 },
      { commission_pct: 35, confirm: true },
    ]);
  });

  it("Back from the notice saves nothing", async () => {
    const api = signedIn("admin", { [PATCH_V1]: notice });
    open();
    const dialog = await editOneBhk();
    const pct = within(dialog).getByLabelText("Commission (%)");
    await userEvent.clear(pct);
    await userEvent.type(pct, "35");
    await userEvent.click(within(dialog).getByRole("button", { name: "Save" }));
    await userEvent.click(await screen.findByRole("button", { name: "Back" }));
    expect(bodies(api, PATCH_V1)).toEqual([{ commission_pct: 35 }]);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("with a price change too: impact, then notice, and one impact call", async () => {
    let sends = 0;
    const impactKey = `GET ${V1}/price-impact?base_price=849`;
    const api = signedIn("admin", {
      [impactKey]: () =>
        json({ sp_prices: 1, outside_now: 0, outside_after: 0, moving_out: 0, moving_in: 0 }),
      [PATCH_V1]: () => (++sends === 1 ? notice() : json(detail())),
    });
    open();
    const dialog = await editOneBhk();
    const price = within(dialog).getByLabelText("Price (₹)");
    await userEvent.clear(price);
    await userEvent.type(price, "849");
    const pct = within(dialog).getByLabelText("Commission (%)");
    await userEvent.clear(pct);
    await userEvent.type(pct, "35");
    await userEvent.click(within(dialog).getByRole("button", { name: "Save" }));
    await userEvent.click(await screen.findByRole("button", { name: "Save price" }));
    await userEvent.click(await screen.findByRole("button", { name: "Confirm increase" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(bodies(api, PATCH_V1)).toEqual([
      { base_price: 849, commission_pct: 35 },
      { base_price: 849, commission_pct: 35, confirm: true },
    ]);
    expect(api.count(impactKey)).toBe(1);
  });
});

describe("refusals", () => {
  it("explains the last active variant", async () => {
    const single = detail({
      variants: [ONE_BHK],
      active_variant_count: 1,
      priced_per_variant: false,
    });
    signedIn(
      "admin",
      { [`POST ${V1}/deactivate`]: () => appError(409, "LAST_ACTIVE_VARIANT", "backend text") },
      single,
    );
    open();
    await userEvent.click(await first("switch", "Active: 1 BHK"));
    expect(
      await screen.findByText(/last active variant, so it can't be switched off/),
    ).toBeInTheDocument();
    expect(await first("switch", "Active: 1 BHK")).toHaveAttribute("aria-checked", "true");
  });

  it("switches another variant off and shows the returned service", async () => {
    const off = detail({
      variants: [ONE_BHK, { ...TWO_BHK, is_active: false }],
      active_variant_count: 1,
    });
    signedIn("admin", {
      [`POST ${variantPath(SERVICE, TWO_BHK.id)}/deactivate`]: () => json(off),
    });
    open();
    await userEvent.click(await first("switch", "Active: 2 BHK"));
    await waitFor(async () =>
      expect(await first("switch", "Active: 2 BHK")).toHaveAttribute("aria-checked", "false"),
    );
  });

  it("puts a taken label under Label on add", async () => {
    const api = signedIn("admin", {
      [`POST ${servicePath(SERVICE)}/variants`]: () =>
        appError(409, "VARIANT_LABEL_TAKEN", "This service already has a variant named 1 BHK", {
          field: "label",
        }),
    });
    open();
    await userEvent.click(await first("button", "Add variant"));
    const dialog = await screen.findByRole("dialog");
    expect(
      within(dialog).getByText(/18% · read-only, copied from the service's first variant/),
    ).toBeInTheDocument();
    await userEvent.type(within(dialog).getByLabelText("Label"), "1 bhk");
    await userEvent.type(within(dialog).getByLabelText("Price (₹)"), "999");
    await userEvent.type(within(dialog).getByLabelText("Commission (%)"), "30");
    await userEvent.click(within(dialog).getByRole("button", { name: "Add variant" }));
    expect(
      await within(dialog).findByText("This service already has a variant named 1 BHK"),
    ).toBeInTheDocument();
    expect(within(dialog).getByLabelText("Label")).toHaveAttribute("aria-invalid", "true");
    expect(bodies(api, `POST ${servicePath(SERVICE)}/variants`)).toEqual([
      { label: "1 bhk", base_price: 999, commission_pct: 30 },
    ]);
  });

  it("puts a 422 on the field it names", async () => {
    signedIn("admin", {
      [PATCH_V1]: () =>
        appError(422, "CATALOG_INVALID", "duration_minutes must be 15 to 480", {
          field: "duration_minutes",
        }),
    });
    open();
    const dialog = await editOneBhk();
    await userEvent.type(within(dialog).getByLabelText("Duration (minutes)"), "60");
    await userEvent.click(within(dialog).getByRole("button", { name: "Save" }));
    expect(await within(dialog).findByText("Duration must be 15 to 480")).toBeInTheDocument();
    expect(within(dialog).getByLabelText("Duration (minutes)")).toHaveAttribute(
      "aria-invalid",
      "true",
    );
  });

  it("nothing changed sends nothing", async () => {
    const api = signedIn("admin");
    open();
    const dialog = await editOneBhk();
    await userEvent.click(within(dialog).getByRole("button", { name: "Save" }));
    expect(within(dialog).getByText("Nothing changed.")).toBeInTheDocument();
    expect(api.count(PATCH_V1)).toBe(0);
  });
});

describe("the service form's base price", () => {
  it("is read-only with the note when priced per variant", async () => {
    signedIn("admin");
    open();
    const input = await screen.findByLabelText("Base price (₹)");
    expect(input).toHaveAttribute("readonly");
    expect(screen.getByText(/Priced per variant, from ₹799/)).toBeInTheDocument();
  });

  it("still edits on a single-variant service", async () => {
    signedIn(
      "admin",
      {},
      detail({ variants: [ONE_BHK], active_variant_count: 1, priced_per_variant: false }),
    );
    open();
    const input = await screen.findByLabelText("Base price (₹)");
    expect(input).not.toHaveAttribute("readonly");
    expect(screen.queryByText(/Priced per variant/)).toBeNull();
  });
});
