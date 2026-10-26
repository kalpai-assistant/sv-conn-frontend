/**
 * The shared job vocabulary (SVC-296, SVC-274).
 *
 * `dueIn` and `currentJob` are new for the Home worklist; the rest moved out of
 * the Jobs page unchanged so both screens read from one definition.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Booking } from "@/lib/mock-data";
import {
  currentJob,
  dueIn,
  endedAt,
  isActive,
  proStatusLabel,
  statusLabel,
  statusText,
} from "@/lib/job-status";
import i18n from "@/i18n";
import type { Translate } from "@/i18n";

// Source formats with `toLocaleDateString(undefined, ...)`, so the exact
// short-month spelling ("Sep" vs "Sept") depends on which locale and ICU set
// the host resolves. Build the expected string with the same options so the
// assertion follows the formatter instead of locking a specific spelling.
function formattedDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function job(over: Partial<Booking> = {}): Booking {
  return {
    id: "j1",
    status: "ACCEPTED",
    scheduledAt: "",
    createdAt: "2026-09-14T10:00:00Z",
    statusHistory: [],
  } as unknown as Booking;
}

function at(over: Partial<Booking>): Booking {
  return { ...job(), ...over } as Booking;
}

const NOW = new Date("2026-09-16T12:00:00Z");

// Pin TZ to IST so the created/terminal timestamps resolve to a predictable
// calendar date, independent of the dev or CI host.
const ORIGINAL_TZ = process.env.TZ;
beforeEach(() => {
  process.env.TZ = "Asia/Kolkata";
});
afterEach(() => {
  process.env.TZ = ORIGINAL_TZ;
  vi.useRealTimers();
});

describe("which job is the current one", () => {
  it("takes the furthest along the pipeline, not the first in the list", () => {
    // The statuses are a pipeline: a provider in progress somewhere is not also
    // on their way elsewhere. Only one job can honestly be the current one.
    const jobs = [
      at({ id: "a", status: "ACCEPTED" }),
      at({ id: "b", status: "IN_PROGRESS" }),
      at({ id: "c", status: "EN_ROUTE" }),
    ];

    expect(currentJob(jobs)?.id).toBe("b");
  });

  it("falls back down the pipeline when nothing is further along", () => {
    expect(
      currentJob([at({ id: "a", status: "ACCEPTED" }), at({ id: "c", status: "EN_ROUTE" })])?.id,
    ).toBe("c");
    expect(currentJob([at({ id: "a", status: "ACCEPTED" })])?.id).toBe("a");
  });

  it("returns null when nothing is live", () => {
    // The case Home renders its quiet empty row for.
    expect(currentJob([])).toBeNull();
    expect(currentJob([at({ status: "COMPLETED" })])).toBeNull();
  });
});

describe("how soon a job is due", () => {
  it("says now for anything already due", () => {
    // Not "-12 min". The job did not stop existing because the slot passed, and
    // a negative number tells a provider nothing they can act on.
    expect(dueIn(at({ scheduledAt: "2026-09-16T11:48:00Z" }), NOW)).toBe("now");
    expect(dueIn(at({ scheduledAt: "2026-09-16T12:00:00Z" }), NOW)).toBe("now");
  });

  it("counts minutes within the hour", () => {
    expect(dueIn(at({ scheduledAt: "2026-09-16T12:40:00Z" }), NOW)).toBe("in 40 min");
  });

  it("switches to a clock time later the same day", () => {
    // Coarse on purpose: "soon" versus "later" is the decision, and a ticking
    // number on a list is noise.
    expect(dueIn(at({ scheduledAt: "2026-09-16T18:00:00Z" }), NOW)).toMatch(/\d/);
    expect(dueIn(at({ scheduledAt: "2026-09-16T18:00:00Z" }), NOW)).not.toMatch(/min/);
  });

  it("names tomorrow rather than a bare clock time", () => {
    expect(dueIn(at({ scheduledAt: "2026-09-17T09:00:00Z" }), NOW)).toMatch(/tomorrow/i);
  });

  it("says nothing when there is no schedule", () => {
    // Rendering an empty string is right — a blank cell beats an invented one.
    expect(dueIn(at({ scheduledAt: "" }), NOW)).toBe("");
    expect(dueIn(at({ scheduledAt: "not a date" }), NOW)).toBe("");
  });
});

describe("what counts as active", () => {
  it.each(["ACCEPTED", "EN_ROUTE", "IN_PROGRESS"])("%s is work in hand", (status) => {
    expect(isActive(at({ status: status as Booking["status"] }))).toBe(true);
  });

  it.each(["COMPLETED", "CANCELLED", "EXPIRED", "REQUESTED"])("%s is not", (status) => {
    expect(isActive(at({ status: status as Booking["status"] }))).toBe(false);
  });
});

describe("when a job ended", () => {
  it("dates it by the terminal transition", () => {
    const ended = at({
      status: "COMPLETED",
      statusHistory: [
        { status: "ACCEPTED", at: "2026-09-10T09:00:00Z" },
        { status: "COMPLETED", at: "2026-09-12T14:30:00Z" },
      ],
    } as Partial<Booking>);

    expect(endedAt(ended)).toBe(formattedDate("2026-09-12T14:30:00Z"));
  });

  it("falls back to the booking date when history is missing", () => {
    expect(endedAt(at({ status: "COMPLETED", statusHistory: [] }))).toBe(
      formattedDate("2026-09-14T10:00:00Z"),
    );
  });
});

describe("job status in the screen's language (SVC-375)", () => {
  const hi = i18n.getFixedT("hi", "common") as Translate;
  const mr = i18n.getFixedT("mr", "common") as Translate;
  const DEVANAGARI_DIGIT = /[\u0966-\u096F]/;

  it("says in English exactly what the English maps say", () => {
    for (const status of Object.keys(statusLabel)) {
      expect(statusText(status)).toBe(statusLabel[status as keyof typeof statusLabel]);
      expect(statusText(status, undefined, { pro: true })).toBe(
        proStatusLabel[status as keyof typeof proStatusLabel],
      );
    }
  });

  it("translates every status, and Assigned for the Pro", () => {
    for (const status of Object.keys(statusLabel)) {
      expect(statusText(status, hi)).not.toBe(statusLabel[status as keyof typeof statusLabel]);
      expect(statusText(status, hi)).not.toMatch(/jobStatus\./);
    }
    expect(statusText("ACCEPTED", mr, { pro: true })).toBe("तुम्हाला दिले");
  });

  it("renders an unknown status as itself", () => {
    expect(statusText("SOMETHING_NEW", hi)).toBe("SOMETHING_NEW");
  });

  it("says when a job is due in hi and mr, with Latin digits", () => {
    expect(dueIn(at({ scheduledAt: "2026-09-16T12:40:00Z" }), NOW, hi, "hi")).toBe("40 मिनट में");
    expect(dueIn(at({ scheduledAt: "2026-09-16T12:40:00Z" }), NOW, mr, "mr")).toBe("40 मिनिटांत");
    expect(dueIn(at({ scheduledAt: "2026-09-16T11:00:00Z" }), NOW, mr, "mr")).toBe("आता");
    for (const scheduledAt of [
      "2026-09-16T18:00:00Z",
      "2026-09-17T09:00:00Z",
      "2026-09-25T09:00:00Z",
    ]) {
      const due = dueIn(at({ scheduledAt }), NOW, mr, "mr");
      expect(due).toMatch(/\d/);
      expect(due).not.toMatch(DEVANAGARI_DIGIT);
    }
    expect(dueIn(at({ scheduledAt: "2026-09-17T09:00:00Z" }), NOW, hi, "hi")).toMatch(/^कल /);
  });

  it("dates a finished job in mr with Latin digits", () => {
    const ended = endedAt(job(), "mr");
    expect(ended).toMatch(/2026/);
    expect(ended).not.toMatch(DEVANAGARI_DIGIT);
  });
});
