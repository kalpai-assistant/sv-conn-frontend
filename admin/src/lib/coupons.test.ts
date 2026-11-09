import { describe, expect, it } from "vitest";
import { ApiError } from "@/lib/api";
import {
  activatedNotice,
  canEditCoupons,
  changedFields,
  couponErrorField,
  couponErrorMessage,
  couponPath,
  couponsListPath,
  createBody,
  discountLabel,
  emptyCouponForm,
  formFromRow,
  isoToIstLocal,
  istLocalToIso,
  minOrderLabel,
  normaliseCode,
  statusLabel,
  usageLabel,
  validateCouponForm,
  validateCouponsSearch,
  type CouponForm,
  type CouponRow,
} from "@/lib/coupons";

const NOW = new Date("2026-11-09T06:30:00Z"); // 12:00 IST

function row(overrides: Partial<CouponRow> = {}): CouponRow {
  return {
    id: "c1",
    code: "WELCOME10",
    discount_type: "percent",
    discount_value: 10,
    max_discount: 150,
    min_order_amount: 500,
    valid_from: "2026-11-01T04:30:00Z",
    valid_until: "2026-12-31T18:29:00Z",
    usage_limit: 10,
    usage_limit_per_user: 1,
    is_active: true,
    user_id: null,
    owner_name: null,
    owner_phone: null,
    usage_count: 3,
    status: "active",
    created_at: "2026-11-01T04:30:00Z",
    ...overrides,
  };
}

function form(overrides: Partial<CouponForm> = {}): CouponForm {
  return {
    ...emptyCouponForm(),
    code: "DIWALI25",
    discount_value: "25",
    valid_until: "2026-11-30T23:59",
    ...overrides,
  };
}

const create = (f: CouponForm) => validateCouponForm(f, { mode: "create", now: NOW });
const createErrors = (f: Partial<CouponForm>) => {
  const check = create(form(f));
  return check.ok ? {} : check.errors;
};

describe("normaliseCode", () => {
  it("uppercases and drops anything outside A–Z0–9, as the user types", () => {
    expect(normaliseCode("diwali-25 off!")).toBe("DIWALI25OFF");
    expect(normaliseCode("  expo 25 ")).toBe("EXPO25");
    expect(normaliseCode("ñandú9")).toBe("AND9");
  });

  it("stops at 20 characters", () => {
    expect(normaliseCode("A".repeat(25))).toBe("A".repeat(20));
  });
});

describe("validateCouponForm: the code", () => {
  it("takes 3 to 20 letters or digits", () => {
    expect(createErrors({ code: "AB3" }).code).toBeUndefined();
    expect(createErrors({ code: "A".repeat(20) }).code).toBeUndefined();
    expect(createErrors({ code: "AB" }).code).toBe("3 to 20 letters or digits.");
    expect(createErrors({ code: "A".repeat(21) }).code).toBe("3 to 20 letters or digits.");
    expect(createErrors({ code: "" }).code).toBe("3 to 20 letters or digits.");
  });

  it("refuses NEW, the create page's address, in any case", () => {
    expect(createErrors({ code: "NEW" }).code).toMatch(/^NEW is reserved/);
    expect(createErrors({ code: "new" }).code).toMatch(/^NEW is reserved/);
    expect(createErrors({ code: "NEW1" }).code).toBeUndefined();
  });

  it("trims and uppercases what it sends", () => {
    const check = create(form({ code: " diwali25 " }));
    expect(check.ok && check.values.code).toBe("DIWALI25");
  });

  it("isn't checked on edit: it can't change, and old codes may not match", () => {
    const old = row({ code: "OLD-PROMO" });
    const check = validateCouponForm(formFromRow(old), { mode: "edit", now: NOW, row: old });
    expect(check.ok).toBe(true);
  });
});

describe("validateCouponForm: the discount", () => {
  it("must be more than 0", () => {
    expect(createErrors({ discount_value: "" }).discount_value).toBe("Enter the discount.");
    expect(createErrors({ discount_value: "0" }).discount_value).toBe("More than 0.");
    expect(createErrors({ discount_value: "0.01" }).discount_value).toBeUndefined();
    expect(createErrors({ discount_value: "-5" }).discount_value).toBe("Enter a number.");
    expect(createErrors({ discount_value: "abc" }).discount_value).toBe("Enter a number.");
  });

  it("is at most 100 for percent, and has no ceiling for flat but the column's", () => {
    expect(createErrors({ discount_value: "100" }).discount_value).toBeUndefined();
    expect(createErrors({ discount_value: "100.01" }).discount_value).toBe(
      "A percent discount can be at most 100.",
    );
    expect(
      createErrors({ discount_type: "flat", discount_value: "250" }).discount_value,
    ).toBeUndefined();
    expect(
      createErrors({ discount_type: "flat", discount_value: "10000000000" }).discount_value,
    ).toBe("That's too large.");
  });

  it("takes at most 2 decimal places, and a stray ₹ or comma", () => {
    expect(createErrors({ discount_value: "12.5" }).discount_value).toBeUndefined();
    expect(createErrors({ discount_value: "12.55" }).discount_value).toBeUndefined();
    expect(createErrors({ discount_value: "12.555" }).discount_value).toBe(
      "At most 2 decimal places.",
    );
    const check = create(form({ discount_type: "flat", discount_value: "₹1,000" }));
    expect(check.ok && check.values.discount_value).toBe(1000);
  });
});

describe("validateCouponForm: max discount and min order", () => {
  it("max discount is optional, and more than 0 when set", () => {
    expect(createErrors({ max_discount: "" }).max_discount).toBeUndefined();
    expect(createErrors({ max_discount: "0" }).max_discount).toBe(
      "More than ₹0, or leave it empty for no cap.",
    );
    expect(createErrors({ max_discount: "0.5" }).max_discount).toBeUndefined();
  });

  it("max discount is ignored on a flat coupon, whatever the hidden input holds", () => {
    const check = create(form({ discount_type: "flat", max_discount: "0" }));
    expect(check.ok && check.values.max_discount).toBeNull();
  });

  it("min order is optional, and 0 or more", () => {
    expect(createErrors({ min_order_amount: "" }).min_order_amount).toBeUndefined();
    expect(createErrors({ min_order_amount: "0" }).min_order_amount).toBeUndefined();
    expect(createErrors({ min_order_amount: "-1" }).min_order_amount).toBe("Enter a number.");
    expect(createErrors({ min_order_amount: "99.999" }).min_order_amount).toBe(
      "At most 2 decimal places.",
    );
  });
});

describe("validateCouponForm: validity", () => {
  it("valid until must be after valid from", () => {
    const f = { valid_from: "2026-11-20T10:00" };
    expect(createErrors({ ...f, valid_until: "2026-11-20T10:00" }).valid_until).toBe(
      "Must be after valid from.",
    );
    expect(createErrors({ ...f, valid_until: "2026-11-20T10:01" }).valid_until).toBeUndefined();
  });

  it("valid until must be in the future on create", () => {
    // NOW is 12:00 IST.
    expect(createErrors({ valid_until: "2026-11-09T12:00" }).valid_until).toBe(
      "Must be in the future.",
    );
    expect(createErrors({ valid_until: "2026-11-09T12:01" }).valid_until).toBeUndefined();
    expect(createErrors({ valid_until: "" }).valid_until).toBe("Pick an end date and time.");
  });

  it("but not on edit: an expired coupon's terms can still be fixed", () => {
    const old = row({ valid_until: "2026-11-02T04:30:00Z", status: "expired" });
    const f = { ...formFromRow(old), discount_value: "12" };
    expect(validateCouponForm(f, { mode: "edit", now: NOW, row: old }).ok).toBe(true);
  });

  it("an empty valid from is left out of the POST, so the server uses its own now", () => {
    const check = create(form({ valid_from: "" }));
    expect(check.ok).toBe(true);
    if (!check.ok) return;
    expect(check.values.valid_from).toBeNull();
    expect(createBody(check.values)).not.toHaveProperty("valid_from");
  });

  it("an empty valid from is refused on edit: the backend won't null it", () => {
    const f = { ...formFromRow(row()), valid_from: "" };
    const check = validateCouponForm(f, { mode: "edit", now: NOW, row: row() });
    expect(!check.ok && check.errors.valid_from).toBe("Pick a start date and time.");
  });
});

describe("validateCouponForm: limits", () => {
  it("usage limit is empty for unlimited, else 1 or more", () => {
    expect(createErrors({ usage_limit: "" }).usage_limit).toBeUndefined();
    expect(createErrors({ usage_limit: "1" }).usage_limit).toBeUndefined();
    expect(createErrors({ usage_limit: "0" }).usage_limit).toBe(
      "1 or more, or leave it empty for unlimited.",
    );
    expect(createErrors({ usage_limit: "2.5" }).usage_limit).toBe("A whole number.");
  });

  it("usage limit can't go below the uses so far, when changed", () => {
    const stored = row({ usage_limit: 2, usage_count: 3 });
    const edit = (usage_limit: string) => {
      const check = validateCouponForm(
        { ...formFromRow(stored), usage_limit },
        { mode: "edit", now: NOW, row: stored },
      );
      return check.ok ? undefined : check.errors.usage_limit;
    };
    expect(edit("2")).toBeUndefined(); // unchanged: the backend checks it only when sent
    expect(edit("1")).toBe("Can't be below the 3 uses so far. Deactivate the coupon to stop it.");
    expect(edit("3")).toBeUndefined();
    expect(edit("")).toBeUndefined();
  });

  it("uses per customer is 1 or more, and starts at 1", () => {
    expect(emptyCouponForm().usage_limit_per_user).toBe("1");
    expect(createErrors({ usage_limit_per_user: "0" }).usage_limit_per_user).toBe("1 or more.");
    expect(createErrors({ usage_limit_per_user: "" }).usage_limit_per_user).toBe("1 or more.");
    expect(createErrors({ usage_limit_per_user: "3" }).usage_limit_per_user).toBeUndefined();
  });
});

describe("createBody", () => {
  it("sends correct JSON types and leaves empty optionals out", () => {
    const check = create(form({ min_order_amount: "499", usage_limit: "100" }));
    expect(check.ok && createBody(check.values)).toEqual({
      code: "DIWALI25",
      discount_type: "percent",
      discount_value: 25,
      min_order_amount: 499,
      valid_until: "2026-11-30T23:59:00+05:30",
      usage_limit: 100,
      usage_limit_per_user: 1,
      is_active: true,
    });
  });

  it("sends valid from with the IST offset when it's set", () => {
    const check = create(form({ valid_from: "2026-11-10T09:00", is_active: false }));
    expect(check.ok && createBody(check.values)).toMatchObject({
      valid_from: "2026-11-10T09:00:00+05:30",
      is_active: false,
    });
  });
});

describe("IST datetimes", () => {
  it("shows a UTC timestamp as IST wall time", () => {
    expect(isoToIstLocal("2026-11-01T04:30:00Z")).toBe("2026-11-01T10:00");
    expect(isoToIstLocal("2026-12-31T18:29:59.999Z")).toBe("2026-12-31T23:59");
    // Past midnight UTC, same IST day; before 18:30 UTC, the next IST day.
    expect(isoToIstLocal("2026-11-01T19:00:00Z")).toBe("2026-11-02T00:30");
    expect(isoToIstLocal("not a date")).toBe("");
  });

  it("round-trips through the input", () => {
    const iso = istLocalToIso("2026-11-02T00:30")!;
    expect(iso).toBe("2026-11-02T00:30:00+05:30");
    expect(new Date(iso).toISOString()).toBe("2026-11-01T19:00:00.000Z");
    expect(isoToIstLocal(iso)).toBe("2026-11-02T00:30");
  });

  it("drops seconds and refuses anything that isn't a datetime-local value", () => {
    expect(istLocalToIso("2026-11-02T00:30:45")).toBe("2026-11-02T00:30:00+05:30");
    expect(istLocalToIso("2026-11-02")).toBeNull();
    expect(istLocalToIso("")).toBeNull();
    expect(istLocalToIso("2026-13-45T25:00")).toBeNull();
  });
});

describe("changedFields", () => {
  const values = (stored: CouponRow, overrides: Partial<CouponForm> = {}) => {
    const check = validateCouponForm(
      { ...formFromRow(stored), ...overrides },
      { mode: "edit", now: NOW, row: stored },
    );
    if (!check.ok) throw new Error(JSON.stringify(check.errors));
    return check.values;
  };

  it("is empty for the untouched form, and for 150 retyped as 150.00", () => {
    expect(changedFields(row(), values(row()))).toEqual({});
    expect(changedFields(row(), values(row(), { max_discount: "150.00" }))).toEqual({});
  });

  it("ignores a stored valid from's seconds: times compare at input precision", () => {
    const stored = row({ valid_from: "2026-11-01T04:30:42.123Z" });
    expect(changedFields(stored, values(stored))).toEqual({});
  });

  it("sends only what changed, with correct types", () => {
    expect(
      changedFields(
        row(),
        values(row(), { discount_value: "12", valid_until: "2027-01-15T18:00", usage_limit: "" }),
      ),
    ).toEqual({
      discount_value: 12,
      valid_until: "2027-01-15T18:00:00+05:30",
      usage_limit: null,
    });
  });

  it("clears a stored cap on a switch to flat", () => {
    expect(
      changedFields(row(), values(row(), { discount_type: "flat", discount_value: "100" })),
    ).toEqual({ discount_type: "flat", discount_value: 100, max_discount: null });
  });

  it("sends no max_discount on a switch to flat when no cap was stored", () => {
    const stored = row({ max_discount: null });
    expect(changedFields(stored, values(stored, { discount_type: "flat" }))).toEqual({
      discount_type: "flat",
    });
  });

  it("clears min order with null", () => {
    expect(changedFields(row(), values(row(), { min_order_amount: "" }))).toEqual({
      min_order_amount: null,
    });
  });
});

describe("labels", () => {
  it("discountLabel", () => {
    expect(discountLabel(row())).toBe("10% · cap ₹150");
    expect(discountLabel(row({ max_discount: null, discount_value: 12.5 }))).toBe("12.5% · no cap");
    expect(
      discountLabel(row({ discount_type: "flat", discount_value: 100, max_discount: null })),
    ).toBe("₹100 off");
  });

  it("usageLabel", () => {
    expect(usageLabel(row())).toBe("3 / 10");
    expect(usageLabel(row({ usage_limit: null }))).toBe("3 / ∞");
  });

  it("minOrderLabel", () => {
    expect(minOrderLabel(500)).toBe("Min order ₹500");
    expect(minOrderLabel(null)).toBe("No minimum");
    expect(minOrderLabel(0)).toBe("No minimum");
  });

  it("statusLabel: exhausted is the global limit, said plainly", () => {
    expect(statusLabel("exhausted")).toBe("Limit reached");
    expect(statusLabel("scheduled")).toBe("Scheduled");
    expect(statusLabel("something_new")).toBe("something_new");
  });

  it("activatedNotice says when active still isn't usable", () => {
    expect(activatedNotice(row())).toBe("WELCOME10 is active again.");
    expect(activatedNotice(row({ status: "expired" }))).toBe(
      "WELCOME10 is activated, but it's expired, so customers still can't apply it.",
    );
    expect(activatedNotice(row({ status: "scheduled" }))).toMatch(/can apply it from/);
  });
});

describe("paths and search", () => {
  it("encodes the code: old codes may hold anything", () => {
    expect(couponPath("WELCOME10")).toBe("/admin/coupons/WELCOME10");
    expect(couponPath("50% OFF/1")).toBe("/admin/coupons/50%25%20OFF%2F1");
  });

  it("builds the list query", () => {
    expect(couponsListPath({})).toBe("/admin/coupons?per_page=50");
    expect(couponsListPath({ status: "exhausted", q: "wel", personal: false, page: 2 })).toBe(
      "/admin/coupons?status=exhausted&q=wel&personal=false&page=2&per_page=50",
    );
  });

  it("drops anything unknown from the URL", () => {
    expect(validateCouponsSearch({ status: "bogus", q: "  ", personal: "maybe", page: 1 })).toEqual(
      { status: undefined, q: undefined, personal: undefined, page: undefined },
    );
    expect(validateCouponsSearch({ status: "active", q: "wel", personal: true, page: 3 })).toEqual({
      status: "active",
      q: "wel",
      personal: true,
      page: 3,
    });
  });
});

describe("roles", () => {
  it("admin and ops write; support reads", () => {
    expect(canEditCoupons("admin")).toBe(true);
    expect(canEditCoupons("ops")).toBe(true);
    expect(canEditCoupons("support")).toBe(false);
  });
});

describe("errors", () => {
  const invalid = (field: string, message: string) =>
    new ApiError(422, message, "COUPON_INVALID", undefined, { field });

  it("puts a 422 under the field it names, in the form's words", () => {
    const err = invalid("discount_value", "discount_value must be more than 0");
    expect(couponErrorField(err)).toBe("discount_value");
    expect(couponErrorMessage(err)).toBe("Discount must be more than 0");
    expect(
      couponErrorMessage(invalid("usage_limit_per_user", "usage_limit_per_user must be 1 or more")),
    ).toBe("Per-customer limit must be 1 or more");
  });

  it("keeps a body-level 422 at form level", () => {
    expect(couponErrorField(invalid("body", "Send at least one field to change"))).toBeNull();
  });

  it("puts a 409 under the code", () => {
    const err = new ApiError(
      409,
      "A coupon with code WELCOME10 already exists",
      "COUPON_CODE_TAKEN",
      undefined,
      { field: "code" },
    );
    expect(couponErrorField(err)).toBe("code");
    expect(couponErrorMessage(err)).toBe("A coupon with code WELCOME10 already exists");
  });

  it("says 403 and 404 plainly, and FastAPI's own 422 generically", () => {
    expect(couponErrorMessage(new ApiError(403, "Forbidden"))).toBe(
      "Your role can't change coupons.",
    );
    expect(couponErrorMessage(new ApiError(404, "Coupon not found", "COUPON_NOT_FOUND"))).toMatch(
      /no longer exists/,
    );
    expect(couponErrorMessage(new ApiError(422, "API error: 422"))).toMatch(/didn't accept/);
    expect(couponErrorField(new ApiError(422, "API error: 422"))).toBeNull();
    expect(couponErrorMessage(new Error("offline"))).toBe("Couldn't save. Try again.");
  });
});
