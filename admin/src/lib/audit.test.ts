import { describe, expect, it } from "vitest";
import {
  NO_AUDIT_FILTERS,
  adminFullLabel,
  adminLabel,
  auditPath,
  endOfLocalDay,
  formatAuditJson,
  formatAuditTime,
  startOfLocalDay,
} from "@/lib/audit";

const search = (path: string) => new URLSearchParams(path.split("?")[1]);

describe("local day boundaries", () => {
  it("starts a day at local midnight", () => {
    expect(startOfLocalDay("2026-11-06")).toBe(new Date(2026, 10, 6).toISOString());
  });

  it("ends a day at the next local midnight, so the whole day is included", () => {
    expect(endOfLocalDay("2026-11-06")).toBe(new Date(2026, 10, 7).toISOString());
  });

  it("rolls the end of a day over a month and a year", () => {
    expect(endOfLocalDay("2026-11-30")).toBe(new Date(2026, 11, 1).toISOString());
    expect(endOfLocalDay("2026-12-31")).toBe(new Date(2027, 0, 1).toISOString());
  });
});

describe("auditPath", () => {
  it("asks for page 1 at 50 per page, with no filters", () => {
    expect(auditPath(NO_AUDIT_FILTERS, 1)).toBe("/admin/audit?page=1&per_page=50");
  });

  it("sends each filter under the backend's name", () => {
    const params = search(
      auditPath(
        {
          adminUserId: "a1",
          action: "kyc.approve",
          targetType: "provider",
          from: "2026-11-01",
          to: "2026-11-06",
        },
        3,
      ),
    );

    expect(params.get("admin_user_id")).toBe("a1");
    expect(params.get("action")).toBe("kyc.approve");
    expect(params.get("target_type")).toBe("provider");
    expect(params.get("date_from")).toBe(startOfLocalDay("2026-11-01"));
    expect(params.get("date_to")).toBe(endOfLocalDay("2026-11-06"));
    expect(params.get("page")).toBe("3");
  });

  it("encodes the query, because an unencoded + is a 422", () => {
    const path = auditPath({ ...NO_AUDIT_FILTERS, action: "a+b" }, 1);
    expect(path).toContain("action=a%2Bb");
  });

  it.each(["0002-11-06", "0020-11-06", "0202-11-06", "12026-11-06"])(
    "leaves out %s, which is a date still being typed",
    (from) => {
      expect(auditPath({ ...NO_AUDIT_FILTERS, from }, 1)).toBe("/admin/audit?page=1&per_page=50");
    },
  );
});

describe("adminLabel", () => {
  it("prefers the name, then the email, then the id", () => {
    expect(adminLabel("Asha", "a@x", "id1")).toBe("Asha");
    expect(adminLabel(null, "a@x", "id1")).toBe("a@x");
    expect(adminLabel(null, null, "id1")).toBe("id1");
  });

  it("gives both name and email in the full form, when there are both", () => {
    expect(adminFullLabel("Asha", "a@x", "id1")).toBe("Asha (a@x)");
    expect(adminFullLabel(null, "a@x", "id1")).toBe("a@x");
    expect(adminFullLabel("Asha", null, "id1")).toBe("Asha");
    expect(adminFullLabel(null, null, "id1")).toBe("id1");
  });
});

describe("formatAuditTime", () => {
  it("shows the instant in local time", () => {
    const iso = "2026-11-06T14:37:03Z";
    expect(formatAuditTime(iso)).toBe(
      new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "medium" }),
    );
  });

  it("shows an unreadable timestamp as it came, rather than Invalid Date", () => {
    expect(formatAuditTime("not a date")).toBe("not a date");
  });
});

describe("formatAuditJson", () => {
  it("indents the JSON", () => {
    expect(formatAuditJson({ a: 1 })).toBe('{\n  "a": 1\n}');
  });

  it("has nothing to show for null or an empty object", () => {
    expect(formatAuditJson(null)).toBeNull();
    expect(formatAuditJson({})).toBeNull();
  });
});
