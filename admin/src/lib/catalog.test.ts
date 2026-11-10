import { describe, expect, it } from "vitest";
import { ApiError } from "./api";
import {
  activeBookingsCount,
  canEditCatalog,
  catalogErrorField,
  catalogErrorMessage,
  categoryCreateBody,
  categoryFormFrom,
  categoryPath,
  changedCategoryFields,
  changedServiceFields,
  durationLabel,
  emptyCategoryForm,
  emptyServiceForm,
  filterTree,
  minQtyLabel,
  needsMinQty,
  notEmptyCounts,
  parentOptions,
  priceLabel,
  serviceCategoryGroups,
  serviceCreateBody,
  serviceFormFrom,
  servicePath,
  treeCounts,
  validateCategoryForm,
  validateServiceForm,
  CATEGORY_FIELDS,
  SERVICE_FIELDS,
  type CatalogCategoryNode,
  type CatalogServiceRow,
  type CategoryDetail,
  type ServiceDetail,
  type ServiceForm,
} from "./catalog";

// --- Fixtures: the shape of GET /admin/catalog ---------------------------------

function service(id: string, extra: Partial<CatalogServiceRow> = {}): CatalogServiceRow {
  return {
    id,
    category_id: "plumber",
    name: `Service ${id}`,
    price_unit: "PER_VISIT",
    min_qty: null,
    base_price: 499,
    duration_minutes: 60,
    icon_key: null,
    is_active: true,
    active_variant_count: 0,
    active_bookings: 0,
    ...extra,
  };
}

function category(id: string, extra: Partial<CatalogCategoryNode> = {}): CatalogCategoryNode {
  return {
    id,
    name: id[0].toUpperCase() + id.slice(1),
    slug: id,
    description: null,
    icon_key: null,
    sort_order: 0,
    is_active: true,
    parent_id: null,
    children: [],
    services: [],
    ...extra,
  };
}

const plumber = category("plumber", {
  parent_id: "home",
  services: [service("basin", { name: "Basin installation", active_bookings: 1 })],
});
const carpenter = category("carpenter", { parent_id: "home", services: [] });
const retired = category("retired", { parent_id: "home", is_active: false });
const home = category("home", {
  name: "Electrician, plumber",
  children: [plumber, carpenter, retired],
});
const misc = category("misc", {
  name: "Miscellaneous",
  services: [service("odd", { category_id: "misc", name: "Odd jobs" })],
});
const dormant = category("dormant", { is_active: false });
const TREE = [home, misc, dormant];

function serviceDetail(extra: Partial<ServiceDetail> = {}): ServiceDetail {
  return {
    ...service("basin", { name: "Basin installation" }),
    description: null,
    created_at: "2026-11-01T00:00:00Z",
    updated_at: "2026-11-01T00:00:00Z",
    variants: [],
    ...extra,
  };
}

function categoryDetail(extra: Partial<CategoryDetail> = {}): CategoryDetail {
  return {
    id: "carpenter",
    name: "Carpenter",
    slug: "carpenter",
    description: null,
    icon_key: null,
    sort_order: 2,
    is_active: true,
    parent_id: "home",
    created_at: "2026-11-01T00:00:00Z",
    subcategory_count: 0,
    active_subcategory_count: 0,
    service_count: 0,
    active_service_count: 0,
    ...extra,
  };
}

const apiError = (status: number, code: string, details?: Record<string, unknown>, message = "m") =>
  new ApiError(status, message, code, undefined, details);

// --- Paths and roles -------------------------------------------------------------

describe("paths and roles", () => {
  it("encodes ids in the URL", () => {
    expect(categoryPath("a/b c")).toBe("/admin/catalog/categories/a%2Fb%20c");
    expect(servicePath("x?y")).toBe("/admin/catalog/services/x%3Fy");
  });

  it("lets admin and ops write, not support", () => {
    expect(canEditCatalog("admin")).toBe(true);
    expect(canEditCatalog("ops")).toBe(true);
    expect(canEditCatalog("support")).toBe(false);
  });
});

// --- Labels -------------------------------------------------------------------------

describe("labels", () => {
  it("shows price and unit, and the minimum where one applies", () => {
    expect(priceLabel({ base_price: 499, price_unit: "PER_VISIT", min_qty: null })).toBe(
      "₹499 / visit",
    );
    expect(priceLabel({ base_price: 12.5, price_unit: "PER_SQFT", min_qty: 100 })).toBe(
      "₹12.50 / sq ft · min 100",
    );
    expect(priceLabel({ base_price: 0, price_unit: "PER_ITEM", min_qty: null })).toBe("₹0 / item");
  });

  it("names the minimum after the unit", () => {
    expect(minQtyLabel("PER_SQFT")).toBe("Minimum sq ft");
    expect(minQtyLabel("PER_HOUR")).toBe("Minimum hours");
    expect(needsMinQty("PER_SQFT")).toBe(true);
    expect(needsMinQty("PER_HOUR")).toBe(true);
    expect(needsMinQty("PER_VISIT")).toBe(false);
    expect(needsMinQty("PER_ITEM")).toBe(false);
  });

  it("formats durations", () => {
    expect(durationLabel(45)).toBe("45 min");
    expect(durationLabel(60)).toBe("1 hr");
    expect(durationLabel(90)).toBe("1 hr 30 min");
  });
});

// --- The tree -------------------------------------------------------------------------

describe("filterTree", () => {
  it("returns the whole tree for an empty query", () => {
    expect(filterTree(TREE, "  ")).toBe(TREE);
  });

  it("keeps a matching service with its parents, and nothing else", () => {
    const shown = filterTree(TREE, "BASIN");
    expect(shown.map((c) => c.id)).toEqual(["home"]);
    expect(shown[0].children.map((c) => c.id)).toEqual(["plumber"]);
    expect(shown[0].children[0].services.map((s) => s.id)).toEqual(["basin"]);
  });

  it("keeps everything under a matching category", () => {
    const shown = filterTree(TREE, "plumber");
    // "Electrician, plumber" matches, so all three of its children stay.
    expect(shown[0].children).toHaveLength(3);
  });

  it("drops what doesn't match", () => {
    expect(filterTree(TREE, "nothing like this")).toEqual([]);
  });

  it("counts every category and service, inactive included", () => {
    expect(treeCounts(TREE)).toEqual({ categories: 6, services: 2 });
  });
});

describe("serviceCategoryGroups", () => {
  it("groups by L1: its sub-categories, or the L1 itself when it has none", () => {
    expect(serviceCategoryGroups(TREE)).toEqual([
      {
        label: "Electrician, plumber",
        options: [
          { id: "plumber", label: "Plumber", isActive: true },
          { id: "carpenter", label: "Carpenter", isActive: true },
          { id: "retired", label: "Retired (inactive)", isActive: false },
        ],
      },
      { label: "Miscellaneous", options: [{ id: "misc", label: "Miscellaneous", isActive: true }] },
      {
        label: "Dormant (inactive)",
        options: [{ id: "dormant", label: "Dormant (inactive)", isActive: false }],
      },
    ]);
  });
});

describe("parentOptions", () => {
  it("lists L1s that hold no services, never the category itself", () => {
    expect(parentOptions(TREE, null).map((o) => o.id)).toEqual(["home", "dormant"]);
    expect(parentOptions(TREE, "home").map((o) => o.id)).toEqual(["dormant"]);
    expect(parentOptions(TREE, null)[1].label).toBe("Dormant (inactive)");
  });
});

// --- Category form --------------------------------------------------------------------

describe("validateCategoryForm", () => {
  const valid = { ...emptyCategoryForm(), name: "Water tank cleaning" };

  it("accepts a top-level category", () => {
    expect(validateCategoryForm(valid, { categories: TREE })).toEqual({
      ok: true,
      values: {
        name: "Water tank cleaning",
        parent_id: null,
        icon_key: null,
        sort_order: 0,
        is_active: true,
      },
    });
  });

  it("checks the name's length after trimming, counting code points", () => {
    const check = (name: string) => validateCategoryForm({ ...valid, name }, { categories: TREE });
    expect(check("  ")).toEqual({ ok: false, errors: { name: "Enter a name." } });
    expect(check(" A ")).toEqual({ ok: false, errors: { name: "2 to 100 characters." } });
    expect(check("a".repeat(101))).toEqual({ ok: false, errors: { name: "2 to 100 characters." } });
    expect(check("😀a").ok).toBe(true);
  });

  it("needs a letter or digit on create, as the slug is made from them", () => {
    const check = validateCategoryForm({ ...valid, name: "पानी" }, { categories: TREE });
    expect(check.ok).toBe(false);
  });

  it("checks the sort order", () => {
    const check = (sort_order: string) =>
      validateCategoryForm({ ...valid, sort_order }, { categories: TREE });
    expect(check("")).toMatchObject({
      ok: false,
      errors: { sort_order: "Enter a number, 0 or more." },
    });
    expect(check("-1")).toMatchObject({ ok: false, errors: { sort_order: "A whole number." } });
    expect(check("10000")).toMatchObject({ ok: false, errors: { sort_order: "0 to 9999." } });
    expect(check("9999")).toMatchObject({ ok: true, values: { sort_order: 9999 } });
  });

  it("refuses an active category under an inactive parent, as the backend does", () => {
    expect(validateCategoryForm({ ...valid, parent_id: "dormant" }, { categories: TREE })).toEqual({
      ok: false,
      errors: { parent_id: "That category is inactive; an active category can't go under it." },
    });
    expect(
      validateCategoryForm(
        { ...valid, parent_id: "dormant", is_active: false },
        { categories: TREE },
      ).ok,
    ).toBe(true);
  });

  it("on edit checks only what changed", () => {
    // A stored row that breaks today's rules saves when that field isn't touched.
    const baseline = categoryDetail({ name: "X", sort_order: 2 });
    const form = { ...categoryFormFrom(baseline), sort_order: "3" };
    expect(validateCategoryForm(form, { baseline, categories: TREE })).toMatchObject({
      ok: true,
      values: { name: "X", sort_order: 3 },
    });
  });
});

describe("changedCategoryFields", () => {
  const baseline = categoryDetail({ icon_key: "hammer" });

  it("is empty when nothing changed", () => {
    const check = validateCategoryForm(categoryFormFrom(baseline), { baseline, categories: TREE });
    expect(check.ok && changedCategoryFields(baseline, check.values)).toEqual({});
  });

  it("sends only the fields that changed, and null to clear the icon or go top-level", () => {
    const form = { ...categoryFormFrom(baseline), parent_id: "", icon_key: null };
    const check = validateCategoryForm(form, { baseline, categories: TREE });
    expect(check.ok && changedCategoryFields(baseline, check.values)).toEqual({
      parent_id: null,
      icon_key: null,
    });
  });

  it("never sends slug or is_active", () => {
    const form = { ...categoryFormFrom(baseline), name: "Carpentry", is_active: false };
    const check = validateCategoryForm(form, { baseline, categories: TREE });
    expect(check.ok && changedCategoryFields(baseline, check.values)).toEqual({
      name: "Carpentry",
    });
  });

  it("creates with every field", () => {
    const check = validateCategoryForm(
      { ...emptyCategoryForm("home"), name: "Tanks", icon_key: "droplets", sort_order: "4" },
      { categories: TREE },
    );
    expect(check.ok && categoryCreateBody(check.values)).toEqual({
      name: "Tanks",
      parent_id: "home",
      icon_key: "droplets",
      sort_order: 4,
      is_active: true,
    });
  });
});

// --- Service form ---------------------------------------------------------------------

describe("validateServiceForm", () => {
  const valid: ServiceForm = {
    ...emptyServiceForm("carpenter"),
    name: "Door repair",
    base_price: "499",
  };
  const check = (patch: Partial<ServiceForm>) =>
    validateServiceForm({ ...valid, ...patch }, { categories: TREE });

  it("accepts a per-visit service with no minimum", () => {
    expect(check({})).toEqual({
      ok: true,
      values: {
        name: "Door repair",
        category_id: "carpenter",
        description: null,
        base_price: 499,
        duration_minutes: 60,
        price_unit: "PER_VISIT",
        min_qty: null,
        icon_key: null,
        is_active: true,
      },
    });
  });

  it("needs a category that can hold services", () => {
    expect(check({ category_id: "" })).toMatchObject({
      errors: { category_id: "Pick a category." },
    });
    expect(check({ category_id: "home" })).toMatchObject({
      errors: { category_id: "That category has sub-categories; pick one of them." },
    });
    expect(check({ category_id: "misc" }).ok).toBe(true);
  });

  it("refuses an inactive category for an active service, not for an inactive one", () => {
    expect(check({ category_id: "retired" })).toMatchObject({
      errors: { category_id: "That category is inactive; an active service can't go in it." },
    });
    expect(check({ category_id: "retired", is_active: false }).ok).toBe(true);
  });

  it("checks the price: above 0, at most ₹10,00,000, 2 decimals", () => {
    expect(check({ base_price: "" })).toMatchObject({ errors: { base_price: "Enter the price." } });
    expect(check({ base_price: "0" })).toMatchObject({ errors: { base_price: "More than ₹0." } });
    expect(check({ base_price: "1000000.01" })).toMatchObject({
      errors: { base_price: "At most ₹10,00,000." },
    });
    expect(check({ base_price: "1.999" })).toMatchObject({
      errors: { base_price: "At most 2 decimal places." },
    });
    expect(check({ base_price: "₹10,00,000" })).toMatchObject({
      values: { base_price: 1_000_000 },
    });
  });

  it("checks the duration: 15 to 480 minutes", () => {
    const message = "15 to 480 minutes.";
    expect(check({ duration_minutes: "14" })).toMatchObject({
      errors: { duration_minutes: message },
    });
    expect(check({ duration_minutes: "481" })).toMatchObject({
      errors: { duration_minutes: message },
    });
    expect(check({ duration_minutes: "" })).toMatchObject({
      errors: { duration_minutes: message },
    });
    expect(check({ duration_minutes: "480" }).ok).toBe(true);
  });

  it("needs a minimum for PER_SQFT and PER_HOUR, 1 to 1,00,000", () => {
    expect(check({ price_unit: "PER_SQFT" })).toMatchObject({
      errors: { min_qty: "Required for per sq ft." },
    });
    expect(check({ price_unit: "PER_HOUR", min_qty: "0" })).toMatchObject({
      errors: { min_qty: "1 to 1,00,000." },
    });
    expect(check({ price_unit: "PER_HOUR", min_qty: "2" })).toMatchObject({
      values: { price_unit: "PER_HOUR", min_qty: 2 },
    });
  });

  it("drops a leftover minimum for PER_VISIT and PER_ITEM", () => {
    expect(check({ price_unit: "PER_ITEM", min_qty: "5" })).toMatchObject({
      values: { min_qty: null },
    });
  });

  it("caps the description at 2000 code points, and sends a blank one as null", () => {
    expect(check({ description: "😀".repeat(2000) }).ok).toBe(true);
    expect(check({ description: "a".repeat(2001) })).toMatchObject({
      errors: { description: "At most 2000 characters." },
    });
    expect(check({ description: "  \n " })).toMatchObject({ values: { description: null } });
    expect(check({ description: "- a\n- b" })).toMatchObject({
      values: { description: "- a\n- b" },
    });
  });

  it("checks the name: 3 to 200 characters", () => {
    expect(check({ name: "ab" })).toMatchObject({ errors: { name: "3 to 200 characters." } });
  });
});

describe("editing a service", () => {
  // The seeded "Emergency/last-minute setup" (cctv-light-event): base price 0.00.
  const seeded = serviceDetail({ name: "Emergency/last-minute setup", base_price: 0 });

  it("saves a seeded zero-price row when the price isn't touched", () => {
    const form = { ...serviceFormFrom(seeded), name: "Emergency setup" };
    const check = validateServiceForm(form, { baseline: seeded, categories: TREE });
    expect(check.ok && changedServiceFields(seeded, check.values)).toEqual({
      name: "Emergency setup",
    });
  });

  it("still checks the price once it's retyped", () => {
    const form = { ...serviceFormFrom(seeded), base_price: "0.00" };
    expect(validateServiceForm(form, { baseline: seeded, categories: TREE })).toMatchObject({
      ok: false,
      errors: { base_price: "More than ₹0." },
    });
    const fixed = { ...serviceFormFrom(seeded), base_price: "99" };
    const check = validateServiceForm(fixed, { baseline: seeded, categories: TREE });
    expect(check.ok && changedServiceFields(seeded, check.values)).toEqual({ base_price: 99 });
  });

  it("sends nothing when nothing changed", () => {
    const check = validateServiceForm(serviceFormFrom(seeded), {
      baseline: seeded,
      categories: TREE,
    });
    expect(check.ok && changedServiceFields(seeded, check.values)).toEqual({});
  });

  it("sends min_qty: null when the unit moves off PER_SQFT", () => {
    const sqft = serviceDetail({ price_unit: "PER_SQFT", min_qty: 100 });
    const form = { ...serviceFormFrom(sqft), price_unit: "PER_VISIT" as const };
    const check = validateServiceForm(form, { baseline: sqft, categories: TREE });
    expect(check.ok && changedServiceFields(sqft, check.values)).toEqual({
      price_unit: "PER_VISIT",
      min_qty: null,
    });
  });

  it("re-checks the minimum when the unit moves onto PER_HOUR", () => {
    const visit = serviceDetail();
    const form = { ...serviceFormFrom(visit), price_unit: "PER_HOUR" as const };
    expect(validateServiceForm(form, { baseline: visit, categories: TREE })).toMatchObject({
      ok: false,
      errors: { min_qty: "Required for per hour." },
    });
    const withQty = { ...form, min_qty: "2" };
    const check = validateServiceForm(withQty, { baseline: visit, categories: TREE });
    expect(check.ok && changedServiceFields(visit, check.values)).toEqual({
      price_unit: "PER_HOUR",
      min_qty: 2,
    });
  });

  it("keeps a stored minimum when neither the unit nor the minimum changes", () => {
    const hour = serviceDetail({ price_unit: "PER_HOUR", min_qty: 2 });
    const form = { ...serviceFormFrom(hour), duration_minutes: "90" };
    const check = validateServiceForm(form, { baseline: hour, categories: TREE });
    expect(check.ok && changedServiceFields(hour, check.values)).toEqual({ duration_minutes: 90 });
  });

  it("clears the description and icon with null", () => {
    const rich = serviceDetail({ description: "**x**", icon_key: "drill" });
    const form = { ...serviceFormFrom(rich), description: "", icon_key: null };
    const check = validateServiceForm(form, { baseline: rich, categories: TREE });
    expect(check.ok && changedServiceFields(rich, check.values)).toEqual({
      description: null,
      icon_key: null,
    });
  });

  it("creates with every field", () => {
    const check = validateServiceForm(
      { ...emptyServiceForm("carpenter"), name: "Door", base_price: "499", icon_key: "drill" },
      { categories: TREE },
    );
    expect(check.ok && serviceCreateBody(check.values)).toMatchObject({
      category_id: "carpenter",
      name: "Door",
      base_price: 499,
      icon_key: "drill",
      is_active: true,
    });
  });
});

// --- Errors -------------------------------------------------------------------------

describe("errors", () => {
  it("puts a 409 CATALOG_NAME_TAKEN under the name", () => {
    const err = apiError(
      409,
      "CATALOG_NAME_TAKEN",
      { field: "name" },
      "A category named X already exists",
    );
    expect(catalogErrorField(err, CATEGORY_FIELDS)).toBe("name");
    expect(catalogErrorMessage(err)).toBe("A category named X already exists");
  });

  it("puts a 422 CATALOG_INVALID under the field it names, in the form's words", () => {
    const err = apiError(
      422,
      "CATALOG_INVALID",
      { field: "min_qty" },
      "min_qty is required for PER_SQFT",
    );
    expect(catalogErrorField(err, SERVICE_FIELDS)).toBe("min_qty");
    expect(catalogErrorMessage(err)).toBe("Minimum quantity is required for per sq ft");
  });

  it("keeps a refusal naming another field, or the body, form-level", () => {
    expect(
      catalogErrorField(apiError(422, "CATALOG_INVALID", { field: "body" }), SERVICE_FIELDS),
    ).toBeNull();
    expect(
      catalogErrorField(apiError(422, "CATALOG_INVALID", { field: "parent_id" }), SERVICE_FIELDS),
    ).toBeNull();
    expect(catalogErrorField(new Error("x"), SERVICE_FIELDS)).toBeNull();
  });

  it("reads CATEGORY_NOT_EMPTY's two counts", () => {
    const err = apiError(409, "CATEGORY_NOT_EMPTY", {
      active_services: 6,
      active_subcategories: 0,
    });
    expect(notEmptyCounts(err)).toEqual({ services: 6, subcategories: 0 });
    expect(catalogErrorMessage(err)).toBe(
      "It still holds 6 active services. Deactivate or move them first.",
    );
    const both = apiError(409, "CATEGORY_NOT_EMPTY", {
      active_services: 1,
      active_subcategories: 2,
    });
    expect(catalogErrorMessage(both)).toBe(
      "It still holds 1 active service and 2 active sub-categories. Deactivate or move them first.",
    );
  });

  it("reads SERVICE_HAS_ACTIVE_BOOKINGS's count", () => {
    expect(
      activeBookingsCount(apiError(409, "SERVICE_HAS_ACTIVE_BOOKINGS", { active_bookings: 3 })),
    ).toBe(3);
    expect(activeBookingsCount(apiError(409, "CATALOG_NAME_TAKEN"))).toBeNull();
  });

  it("words the rest", () => {
    expect(catalogErrorMessage(apiError(403, "FORBIDDEN"))).toBe(
      "Your role can't change the catalog.",
    );
    expect(catalogErrorMessage(apiError(404, "SERVICE_NOT_FOUND"))).toBe(
      "This service no longer exists. Reload the page.",
    );
    expect(catalogErrorMessage(apiError(404, "CATEGORY_NOT_FOUND"))).toBe(
      "This category no longer exists. Reload the page.",
    );
    expect(catalogErrorMessage(new Error("network"))).toBe("Couldn't save. Try again.");
  });
});
