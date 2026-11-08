import { describe, expect, it } from "vitest";
import type { AdminRole } from "@/lib/auth";
import {
  IN_FLIGHT_WINDOW_MS,
  canPayOut,
  canRequeueFailed,
  canRequeueReversed,
  exportCsvFilename,
  exportCsvPath,
  findInFlightPayout,
  findUnresolvedAttempt,
  historyActor,
  historySource,
  nextGuardChange,
  payOutBlock,
  payoutBookingsPath,
  payoutHistoryPath,
  payoutProvidersPath,
  providerDisplayName,
  requeuePath,
  validatePayoutsSearch,
  type GuardHistory,
} from "@/lib/payouts";
import { SP_ID, historyEntry, payoutProvider } from "@/test/payout-fixtures";

const NOW = Date.parse("2026-11-08T12:00:00Z");
const ago = (ms: number) => new Date(NOW - ms).toISOString();
const ready = (...entries: ReturnType<typeof historyEntry>[]): GuardHistory => ({
  status: "ready",
  entries,
});

describe("validatePayoutsSearch", () => {
  it("keeps every known value", () => {
    expect(
      validatePayoutsSearch({
        status: "failed",
        page: 3,
        sp: SP_ID,
        bstatus: "reversed",
        bpage: 2,
        hpage: 4,
      }),
    ).toEqual({ status: "failed", page: 3, sp: SP_ID, bstatus: "reversed", bpage: 2, hpage: 4 });
  });

  it("sets each bad value to undefined explicitly, so the router can't keep it", () => {
    const result = validatePayoutsSearch({
      status: "paid",
      page: 0,
      sp: "not-a-uuid",
      bstatus: 7,
      bpage: 1.5,
      hpage: "2",
    });
    expect(Object.keys(result).sort()).toEqual(
      ["bpage", "bstatus", "hpage", "page", "sp", "status"].sort(),
    );
    expect(Object.values(result).every((value) => value === undefined)).toBe(true);
  });

  it("leaves page 1 out of the URL", () => {
    expect(validatePayoutsSearch({ page: 1, bpage: 1, hpage: 1 })).toMatchObject({
      page: undefined,
      bpage: undefined,
      hpage: undefined,
    });
  });

  it("lower-cases a pasted SP id", () => {
    expect(validatePayoutsSearch({ sp: SP_ID.toUpperCase() }).sp).toBe(SP_ID);
  });
});

describe("paths", () => {
  it("asks for 25 SPs a page, with the status when there is one", () => {
    expect(payoutProvidersPath({})).toBe("/admin/payouts/providers?page=1&per_page=25");
    expect(payoutProvidersPath({ status: "failed", page: 2 })).toBe(
      "/admin/payouts/providers?status=failed&page=2&per_page=25",
    );
  });

  it("builds the per-SP reads and writes", () => {
    expect(payoutBookingsPath(SP_ID, "pending", 2)).toBe(
      `/admin/providers/${SP_ID}/payout-bookings?settlement_status=pending&page=2&per_page=25`,
    );
    expect(payoutBookingsPath(SP_ID, undefined, 1)).toBe(
      `/admin/providers/${SP_ID}/payout-bookings?page=1&per_page=25`,
    );
    expect(payoutHistoryPath(SP_ID, 1)).toBe(
      `/admin/providers/${SP_ID}/payouts?page=1&per_page=25`,
    );
    expect(requeuePath(SP_ID, "failed")).toBe(`/admin/providers/${SP_ID}/payout/requeue-failed`);
    expect(requeuePath(SP_ID, "reversed")).toBe(
      `/admin/providers/${SP_ID}/payout/requeue-reversed`,
    );
  });

  it("names the CSV the way the backend's Content-Disposition does", () => {
    expect(exportCsvPath("2026-10-01", "2026-10-31")).toBe(
      "/admin/payouts/export.csv?from=2026-10-01&to=2026-10-31",
    );
    expect(exportCsvFilename("2026-10-01", "2026-10-31")).toBe("payouts_2026-10-01_2026-10-31.csv");
  });
});

describe("providerDisplayName", () => {
  it("prefers the business name, then the name, then the phone", () => {
    expect(providerDisplayName(payoutProvider())).toBe("Ramesh Cleaning Co");
    expect(providerDisplayName(payoutProvider({ business_name: null }))).toBe("Ramesh Kumar");
    expect(providerDisplayName(payoutProvider({ business_name: "  ", name: null }))).toBe(
      "+919876500001",
    );
  });
});

describe("history labels", () => {
  it("shows a reconciliation row as the system", () => {
    const row = historyEntry({ source: "reconciliation", admin_user_id: null, admin_name: null });
    expect(historySource(row)).toBe("System");
    expect(historyActor(row)).toBe("System");
  });

  it("names the admin who triggered a payout", () => {
    expect(historySource(historyEntry())).toBe("Admin");
    expect(historyActor(historyEntry())).toBe("Asha Admin");
    expect(historyActor(historyEntry({ admin_name: null }))).toBe("Unnamed admin");
  });
});

describe("the in-flight guard (legacy's 60 s rule)", () => {
  it.each(["attempting", "unknown", "initiated", "queued", "processing"])(
    "finds a %s entry from 30 s ago",
    (outcome) => {
      const entry = historyEntry({ outcome, created_at: ago(30_000) });
      expect(findInFlightPayout([entry], NOW)).toBe(entry);
    },
  );

  it.each(["processed", "completed", "failed", "rejected", "reversed", "requeued"])(
    "ignores a final %s entry",
    (outcome) => {
      expect(
        findInFlightPayout([historyEntry({ outcome, created_at: ago(1_000) })], NOW),
      ).toBeNull();
    },
  );

  it("lets go once the entry is a minute old", () => {
    const entry = historyEntry({ outcome: "initiated", created_at: ago(IN_FLIGHT_WINDOW_MS + 1) });
    expect(findInFlightPayout([entry], NOW)).toBeNull();
  });

  it("matches any in-flight entry in the window, not only the newest entry, as legacy did", () => {
    const newest = historyEntry({ audit_id: "n", outcome: "requeued", created_at: ago(5_000) });
    const inFlight = historyEntry({
      audit_id: "f",
      outcome: "processing",
      created_at: ago(20_000),
    });
    expect(findInFlightPayout([newest, inFlight], NOW)).toBe(inFlight);
  });
});

describe("findUnresolvedAttempt", () => {
  it("finds attempting or unknown at any age", () => {
    const old = historyEntry({ outcome: "unknown", created_at: ago(86_400_000) });
    expect(findUnresolvedAttempt([historyEntry(), old])).toBe(old);
    expect(findUnresolvedAttempt([historyEntry({ outcome: "initiated" })])).toBeNull();
  });
});

describe("payOutBlock", () => {
  const clear = ready(historyEntry());

  it("allows a payout when everything is in order", () => {
    expect(payOutBlock(payoutProvider(), clear, NOW)).toBeNull();
  });

  it("blocks with no payout method", () => {
    expect(payOutBlock(payoutProvider({ payout_set: false }), clear, NOW)).toMatch(
      /No payout method on file/,
    );
  });

  it.each(["pending", "submitted", "rejected"])(
    "blocks when KYC is %s, since the task would refuse after its 202",
    (kyc_status) => {
      expect(payOutBlock(payoutProvider({ kyc_status }), clear, NOW)).toMatch(/KYC isn't approved/);
    },
  );

  it.each([0, -5_000])("blocks when Sends now is %i paise", (payable_paise) => {
    expect(payOutBlock(payoutProvider({ payable_paise }), clear, NOW)).toBe(
      "Nothing to send right now.",
    );
  });

  it("blocks with a balance but no pending booking, which the task would refuse", () => {
    expect(payOutBlock(payoutProvider({ pending_count: 0, pending_paise: 0 }), clear, NOW)).toBe(
      "No pending bookings to pay out.",
    );
  });

  it("blocks for a minute after this screen's own 202", () => {
    expect(payOutBlock(payoutProvider(), clear, NOW, NOW - 10_000)).toMatch(/just queued/);
    expect(payOutBlock(payoutProvider(), clear, NOW, NOW - IN_FLIGHT_WINDOW_MS)).toBeNull();
  });

  it("names the worker's row over its own hold once the history has it", () => {
    const history = ready(historyEntry({ outcome: "unknown", created_at: ago(5_000) }));
    expect(payOutBlock(payoutProvider(), history, NOW, NOW - 6_000)).toBe(
      "Previous attempt unresolved; wait for reconciliation.",
    );
  });

  it("blocks until the history is in, and when it failed to load", () => {
    expect(payOutBlock(payoutProvider(), { status: "loading" }, NOW)).toMatch(/Checking/);
    expect(payOutBlock(payoutProvider(), { status: "error" }, NOW)).toMatch(/Couldn't load/);
  });

  it("blocks on an unresolved attempt of any age, the backend's SVC-172 gate", () => {
    const history = ready(historyEntry({ outcome: "unknown", created_at: ago(3_600_000) }));
    expect(payOutBlock(payoutProvider(), history, NOW)).toBe(
      "Previous attempt unresolved; wait for reconciliation.",
    );
  });

  it("blocks on an in-flight payout from the last minute, saying how old it is", () => {
    const history = ready(historyEntry({ outcome: "processing", created_at: ago(30_000) }));
    expect(payOutBlock(payoutProvider(), history, NOW)).toBe(
      "A payout from 30s ago is still processing. Wait for it to finish.",
    );
  });

  it("names the first problem: the method before KYC before the amount", () => {
    const everything = payoutProvider({
      payout_set: false,
      kyc_status: "rejected",
      payable_paise: 0,
    });
    expect(payOutBlock(everything, { status: "loading" }, NOW)).toMatch(/No payout method/);
  });
});

describe("nextGuardChange", () => {
  it("is when the newest window ends, or null with none open", () => {
    const history = ready(historyEntry({ outcome: "initiated", created_at: ago(20_000) }));
    expect(nextGuardChange(history, NOW, null)).toBe(NOW + 40_000);
    expect(nextGuardChange(history, NOW, NOW - 50_000)).toBe(NOW + 10_000);
    expect(nextGuardChange(ready(historyEntry()), NOW, null)).toBeNull();
    expect(nextGuardChange({ status: "loading" }, NOW, null)).toBeNull();
  });
});

describe("role gates", () => {
  const cases: [AdminRole, boolean, boolean, boolean][] = [
    ["admin", true, true, true],
    ["ops", true, true, false],
    ["support", false, false, false],
  ];
  it.each(cases)("%s: pay out %s, re-queue failed %s, re-queue reversed %s", (role, p, f, r) => {
    expect(canPayOut(role)).toBe(p);
    expect(canRequeueFailed(role)).toBe(f);
    expect(canRequeueReversed(role)).toBe(r);
  });
});
