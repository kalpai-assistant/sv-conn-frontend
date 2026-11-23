/**
 * The variant editor on /operator/catalog/services/$serviceId (SVC-481), through
 * the real router and guard. Only fetch is faked. jsdom applies no CSS, so the
 * cards and the table both render: queries for a row's control take the first match.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { setSessionToken } from "@/lib/api";
import { resetAuthState, type AdminRole } from "@/lib/auth";
import {
  CATALOG_PATH,
  servicePath,
  variantPath,
  type CommissionChange,
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
    pending_commission_change: null,
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

describe("a commission change (SVC-486)", () => {
  const SCHEDULE_V1 = `POST ${V1}/commission-changes`;
  const GET_SERVICE = `GET ${servicePath(SERVICE)}`;
  // 11:30 IST on 23 Nov 2026.
  const NOW = new Date("2026-11-23T06:00:00Z");

  function change(extra: Partial<CommissionChange> = {}): CommissionChange {
    return {
      id: "cc1",
      service_variant_id: ONE_BHK.id,
      old_pct: 30.04,
      new_pct: 35,
      effective_from: "2026-12-07",
      status: "scheduled",
      created_at: "2026-11-23T06:00:00Z",
      applied_at: null,
      cancelled_at: null,
      ...extra,
    };
  }

  const PENDING = {
    id: "cc1",
    new_pct: 35,
    effective_from: "2026-12-07",
    created_at: "2026-11-23T06:00:00Z",
  };
  const pendingDetail = () =>
    detail({ variants: [{ ...ONE_BHK, pending_commission_change: PENDING }, TWO_BHK] });

  /** The service the GET answers with: before the writes, then after them. */
  function serviceAfterWrites(after: ServiceDetail) {
    let writes = 0;
    return {
      onWrite: () => writes++,
      route: () => json(writes > 0 ? after : detail()),
    };
  }

  async function typePct(dialog: HTMLElement, value: string) {
    const pct = within(dialog).getByLabelText("Commission (%)");
    await userEvent.clear(pct);
    await userEvent.type(pct, value);
  }

  const keys = (api: ReturnType<typeof mockApi>) =>
    api.calls.map((call) => call.key).filter((key) => !key.startsWith("GET"));

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(NOW);
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("an increase needs a date 14 days out: it starts there, and the day before is refused", async () => {
    const after = serviceAfterWrites(pendingDetail());
    const api = signedIn("admin", {
      [GET_SERVICE]: after.route,
      [SCHEDULE_V1]: () => {
        after.onWrite();
        return json(change(), 201);
      },
    });
    open();
    const dialog = await editOneBhk();
    expect(within(dialog).queryByLabelText("Effective from")).toBeNull();
    await typePct(dialog, "35");

    const date = within(dialog).getByLabelText("Effective from");
    expect(date).toHaveValue("2026-12-07");
    expect(date).toHaveAttribute("min", "2026-12-07");
    expect(within(dialog).getByText(/7 Dec 2026 or later/)).toBeInTheDocument();

    fireEvent.change(date, { target: { value: "2026-12-06" } });
    await userEvent.click(within(dialog).getByRole("button", { name: "Save" }));
    expect(
      await within(dialog).findByText("An increase needs 14 days' notice: 7 Dec 2026 or later."),
    ).toBeInTheDocument();
    expect(api.count(SCHEDULE_V1)).toBe(0);

    fireEvent.change(date, { target: { value: "2026-12-07" } });
    await userEvent.click(within(dialog).getByRole("button", { name: "Save" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(bodies(api, SCHEDULE_V1)).toEqual([{ new_pct: 35, effective_from: "2026-12-07" }]);
    expect(api.count(PATCH_V1)).toBe(0);
    expect(
      screen.getByText("1 BHK's commission changes to 35% from 7 Dec 2026."),
    ).toBeInTheDocument();
    // The refetched service shows it pending.
    expect(screen.getAllByText("→ 35% from 7 Dec 2026").length).toBeGreaterThan(0);
  });

  it("a decrease starts today and applies at once", async () => {
    const after = serviceAfterWrites(
      detail({
        variants: [
          { ...ONE_BHK, commission_pct: 25, platform_commission: 199.75, provider_payout: 599.25 },
          TWO_BHK,
        ],
      }),
    );
    const api = signedIn("admin", {
      [GET_SERVICE]: after.route,
      [SCHEDULE_V1]: () => {
        after.onWrite();
        return json(
          change({
            new_pct: 25,
            effective_from: "2026-11-23",
            status: "applied",
            applied_at: "2026-11-23T06:00:00Z",
          }),
          201,
        );
      },
    });
    open();
    const dialog = await editOneBhk();
    await typePct(dialog, "25");
    const date = within(dialog).getByLabelText("Effective from");
    expect(date).toHaveValue("2026-11-23");
    expect(date).toHaveAttribute("min", "2026-11-23");
    await userEvent.click(within(dialog).getByRole("button", { name: "Save" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(bodies(api, SCHEDULE_V1)).toEqual([{ new_pct: 25, effective_from: "2026-11-23" }]);
    expect(screen.getByText("1 BHK's commission is now 25%.")).toBeInTheDocument();
  });

  it("counts today in IST: at 00:00 IST a decrease starts on the new IST day", async () => {
    // 18:30 UTC on 23 Nov is 00:00 IST on 24 Nov.
    vi.setSystemTime(new Date("2026-11-23T18:30:00Z"));
    signedIn("admin");
    open();
    const dialog = await editOneBhk();
    await typePct(dialog, "25");
    expect(within(dialog).getByLabelText("Effective from")).toHaveValue("2026-11-24");
    await typePct(dialog, "35");
    expect(within(dialog).getByLabelText("Effective from")).toHaveValue("2026-12-08");
  });

  it("schedules FIRST, then PATCHes the rest without the percent", async () => {
    const api = signedIn("admin", {
      [SCHEDULE_V1]: () => json(change(), 201),
      [PATCH_V1]: () => json(pendingDetail()),
    });
    open();
    const dialog = await editOneBhk();
    await typePct(dialog, "35");
    await userEvent.type(within(dialog).getByLabelText("Duration (minutes)"), "60");
    await userEvent.click(within(dialog).getByRole("button", { name: "Save" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(keys(api)).toEqual([SCHEDULE_V1, PATCH_V1]);
    expect(bodies(api, PATCH_V1)).toEqual([{ duration_minutes: 60 }]);
    expect(
      screen.getByText("1 BHK is saved. 1 BHK's commission changes to 35% from 7 Dec 2026."),
    ).toBeInTheDocument();
  });

  it("with a price change: the impact read, then the schedule, then the PATCH", async () => {
    const impactKey = `GET ${V1}/price-impact?base_price=849`;
    const api = signedIn("admin", {
      [impactKey]: () =>
        json({ sp_prices: 1, outside_now: 0, outside_after: 0, moving_out: 0, moving_in: 0 }),
      [SCHEDULE_V1]: () => json(change(), 201),
      [PATCH_V1]: () => json(pendingDetail()),
    });
    open();
    const dialog = await editOneBhk();
    const price = within(dialog).getByLabelText("Price (₹)");
    await userEvent.clear(price);
    await userEvent.type(price, "849");
    await typePct(dialog, "35");
    await userEvent.click(within(dialog).getByRole("button", { name: "Save" }));
    await userEvent.click(await screen.findByRole("button", { name: "Save price" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(keys(api)).toEqual([SCHEDULE_V1, PATCH_V1]);
    expect(bodies(api, PATCH_V1)).toEqual([{ base_price: 849 }]);
    expect(api.count(impactKey)).toBe(1);
  });

  it("a refused schedule sends no PATCH; a 422 on effective_from goes under the date", async () => {
    const api = signedIn("admin", {
      [SCHEDULE_V1]: () =>
        appError(
          422,
          "CATALOG_INVALID",
          "An increase needs 14 days' notice: effective_from must be 2026-12-07 or later",
          { field: "effective_from" },
        ),
    });
    open();
    const dialog = await editOneBhk();
    await typePct(dialog, "35");
    await userEvent.type(within(dialog).getByLabelText("Duration (minutes)"), "60");
    await userEvent.click(within(dialog).getByRole("button", { name: "Save" }));
    expect(
      await within(dialog).findByText(
        "An increase needs 14 days' notice: the effective date must be 2026-12-07 or later",
      ),
    ).toBeInTheDocument();
    expect(within(dialog).getByLabelText("Effective from")).toHaveAttribute("aria-invalid", "true");
    expect(api.count(PATCH_V1)).toBe(0);
  });

  it("a 422 on new_pct goes under the commission", async () => {
    signedIn("admin", {
      [SCHEDULE_V1]: () =>
        appError(422, "CATALOG_INVALID", "new_pct is already this option's commission", {
          field: "new_pct",
        }),
    });
    open();
    const dialog = await editOneBhk();
    await typePct(dialog, "35");
    await userEvent.click(within(dialog).getByRole("button", { name: "Save" }));
    expect(
      await within(dialog).findByText("The new commission % is already this option's commission"),
    ).toBeInTheDocument();
    expect(within(dialog).getByLabelText("Commission (%)")).toHaveAttribute("aria-invalid", "true");
  });

  it("a 409 COMMISSION_CHANGE_SCHEDULED is a form-level message", async () => {
    const api = signedIn("admin", {
      [SCHEDULE_V1]: () =>
        appError(
          409,
          "COMMISSION_CHANGE_SCHEDULED",
          "This option already has a commission change scheduled; cancel it first",
          { change_id: "cc0", new_pct: 28, effective_from: "2026-12-01" },
        ),
    });
    open();
    const dialog = await editOneBhk();
    await typePct(dialog, "25");
    await userEvent.click(within(dialog).getByRole("button", { name: "Save" }));
    expect(
      await within(dialog).findByText(
        "This option already has a commission change scheduled; cancel it first",
      ),
    ).toBeInTheDocument();
    expect(within(dialog).getByLabelText("Commission (%)")).not.toHaveAttribute("aria-invalid");
    expect(api.count(PATCH_V1)).toBe(0);
  });

  it("a refused PATCH after the schedule refetches, so the pending change shows", async () => {
    const after = serviceAfterWrites(pendingDetail());
    const api = signedIn("admin", {
      [GET_SERVICE]: after.route,
      [SCHEDULE_V1]: () => {
        after.onWrite();
        return json(change(), 201);
      },
      [PATCH_V1]: () =>
        appError(422, "CATALOG_INVALID", "sort_order must be 0 to 9999", { field: "sort_order" }),
    });
    open();
    const dialog = await editOneBhk();
    await typePct(dialog, "35");
    const sort = within(dialog).getByLabelText("Sort order");
    await userEvent.clear(sort);
    await userEvent.type(sort, "5");
    const gets = api.count(GET_SERVICE);
    await userEvent.click(within(dialog).getByRole("button", { name: "Save" }));

    expect(await within(dialog).findByText("Sort order must be 0 to 9999")).toBeInTheDocument();
    expect(api.count(GET_SERVICE)).toBe(gets + 1);
    // The dialog stays open on the fresh row: the percent is locked behind the change.
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    const pct = within(dialog).getByLabelText("Commission (%)");
    expect(pct).toBeDisabled();
    expect(pct).toHaveValue("30.04");
    expect(within(dialog).queryByLabelText("Effective from")).toBeNull();
    expect(screen.getAllByText("→ 35% from 7 Dec 2026").length).toBeGreaterThan(0);
  });

  it("a pending change shows on the row, and locks only the percent in the dialog", async () => {
    signedIn("admin", {}, pendingDetail());
    open();
    expect((await screen.findAllByText("→ 35% from 7 Dec 2026")).length).toBeGreaterThan(0);
    const dialog = await editOneBhk();
    expect(within(dialog).getByLabelText("Commission (%)")).toBeDisabled();
    expect(
      within(dialog).getByText(
        "→ 35% from 7 Dec 2026 is scheduled. Cancel it first to change the commission.",
      ),
    ).toBeInTheDocument();
    expect(within(dialog).getByLabelText("Price (₹)")).toBeEnabled();
    expect(within(dialog).getByLabelText("Label")).toBeEnabled();
  });

  it("Cancel confirms, cancels and refetches", async () => {
    const CANCEL = `POST ${V1}/commission-changes/cc1/cancel`;
    let cancelled = false;
    const api = signedIn("admin", {
      [GET_SERVICE]: () => json(cancelled ? detail() : pendingDetail()),
      [CANCEL]: () => {
        cancelled = true;
        return json(change({ status: "cancelled", cancelled_at: "2026-11-23T06:01:00Z" }));
      },
    });
    open();
    await userEvent.click(await first("button", "Cancel the commission change on 1 BHK"));
    const confirm = await screen.findByRole("alertdialog");
    expect(within(confirm).getByText("Cancel the commission change on 1 BHK?")).toBeInTheDocument();
    expect(confirm).toHaveAccessibleDescription(/30\.04% → 35% from 7 Dec 2026 won't happen/);

    await userEvent.click(within(confirm).getByRole("button", { name: "Keep it" }));
    expect(api.count(CANCEL)).toBe(0);

    await userEvent.click(await first("button", "Cancel the commission change on 1 BHK"));
    await userEvent.click(
      within(await screen.findByRole("alertdialog")).getByRole("button", {
        name: "Cancel the change",
      }),
    );
    expect(
      await screen.findByText("The commission change on 1 BHK is cancelled. It stays at 30.04%."),
    ).toBeInTheDocument();
    expect(api.count(CANCEL)).toBe(1);
    expect(screen.queryByText("→ 35% from 7 Dec 2026")).toBeNull();
  });

  it("Cancel on a change that already applied refetches and says so", async () => {
    const CANCEL = `POST ${V1}/commission-changes/cc1/cancel`;
    let answered = false;
    const applied = detail({
      variants: [
        { ...ONE_BHK, commission_pct: 35, platform_commission: 279.65, provider_payout: 519.35 },
        TWO_BHK,
      ],
    });
    signedIn("admin", {
      [GET_SERVICE]: () => json(answered ? applied : pendingDetail()),
      [CANCEL]: () => {
        answered = true;
        return appError(
          409,
          "COMMISSION_CHANGE_NOT_SCHEDULED",
          "This commission change is applied and can't be cancelled",
          { status: "applied" },
        );
      },
    });
    open();
    await userEvent.click(await first("button", "Cancel the commission change on 1 BHK"));
    await userEvent.click(
      within(await screen.findByRole("alertdialog")).getByRole("button", {
        name: "Cancel the change",
      }),
    );
    expect(
      await screen.findByText("This commission change is applied and can't be cancelled"),
    ).toBeInTheDocument();
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(screen.getAllByText(/35% commission/).length).toBeGreaterThan(0);
    expect(screen.queryByText("→ 35% from 7 Dec 2026")).toBeNull();
  });

  it("creating a variant still sends commission_pct, with no date", async () => {
    const api = signedIn("admin", {
      [`POST ${servicePath(SERVICE)}/variants`]: () => json(detail()),
    });
    open();
    await userEvent.click(await first("button", "Add variant"));
    const dialog = await screen.findByRole("dialog");
    await userEvent.type(within(dialog).getByLabelText("Label"), "3 BHK");
    await userEvent.type(within(dialog).getByLabelText("Price (₹)"), "3999");
    await userEvent.type(within(dialog).getByLabelText("Commission (%)"), "30");
    expect(within(dialog).queryByLabelText("Effective from")).toBeNull();
    await userEvent.click(within(dialog).getByRole("button", { name: "Add variant" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(bodies(api, `POST ${servicePath(SERVICE)}/variants`)).toEqual([
      { label: "3 BHK", base_price: 3999, commission_pct: 30 },
    ]);
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
