import { describe, expect, it } from "vitest";
import { addDays, formatEffectiveDate, todayIst } from "./ist-date";

describe("todayIst", () => {
  it("is still the same IST day at 23:59 IST (18:29 UTC)", () => {
    expect(todayIst(new Date("2026-11-23T18:29:59Z"))).toBe("2026-11-23");
  });

  it("is the next IST day from 00:00 IST (18:30 UTC), while UTC is still on the old one", () => {
    expect(todayIst(new Date("2026-11-23T18:30:00Z"))).toBe("2026-11-24");
  });

  it("rolls the year over at 00:00 IST on 1 January", () => {
    expect(todayIst(new Date("2026-12-31T18:30:00Z"))).toBe("2027-01-01");
  });
});

describe("addDays", () => {
  it("adds 14 days across a month and a year", () => {
    expect(addDays("2026-11-23", 14)).toBe("2026-12-07");
    expect(addDays("2026-12-25", 14)).toBe("2027-01-08");
  });

  it("crosses the end of February in common and leap years", () => {
    expect(addDays("2027-02-27", 2)).toBe("2027-03-01");
    expect(addDays("2028-02-27", 2)).toBe("2028-02-29");
    expect(addDays("2028-02-20", 14)).toBe("2028-03-05");
  });
});

describe("formatEffectiveDate", () => {
  it("shows the date as sent", () => {
    expect(formatEffectiveDate("2026-12-06")).toBe("6 Dec 2026");
  });

  it("keeps the 1st of the month on the 1st", () => {
    expect(formatEffectiveDate("2027-03-01")).toBe("1 Mar 2027");
    expect(formatEffectiveDate("2027-01-01")).toBe("1 Jan 2027");
  });
});
