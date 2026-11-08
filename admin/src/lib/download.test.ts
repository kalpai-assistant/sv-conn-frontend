import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError, clearSessionToken, getSessionToken, setSessionToken } from "@/lib/api";
import { apiDownload, filenameFromDisposition } from "@/lib/download";
import { json, mockApi } from "@/test/harness";

describe("filenameFromDisposition", () => {
  it.each([
    [
      'attachment; filename="payouts_2026-10-01_2026-10-31.csv"',
      "payouts_2026-10-01_2026-10-31.csv",
    ],
    ["attachment; filename=payouts.csv", "payouts.csv"],
    ["attachment;filename=payouts.csv; size=10", "payouts.csv"],
    ["attachment; filename*=UTF-8''pay%20outs%E2%82%B9.csv", "pay outs₹.csv"],
    // filename* wins over the plain one, as RFC 6266 says.
    [`attachment; filename="fallback.csv"; filename*=UTF-8''real.csv`, "real.csv"],
    ['attachment; FILENAME="Upper.csv"', "Upper.csv"],
  ])("reads %s", (header, expected) => {
    expect(filenameFromDisposition(header)).toBe(expected);
  });

  it.each([
    ['attachment; filename="../../etc/passwd"', "passwd"],
    ['attachment; filename="C:\\Windows\\evil.csv"', "evil.csv"],
    ['attachment; filename="a\u0007b.csv"', "ab.csv"],
  ])("keeps only a plain name from %s", (header, expected) => {
    expect(filenameFromDisposition(header)).toBe(expected);
  });

  it.each([null, "", "attachment", 'attachment; filename=""', 'attachment; filename=".."'])(
    "gives null for %j",
    (header) => {
      expect(filenameFromDisposition(header)).toBeNull();
    },
  );

  it("falls back to the plain name when filename* doesn't decode", () => {
    expect(filenameFromDisposition(`attachment; filename*=UTF-8''%E0%A4; filename="ok.csv"`)).toBe(
      "ok.csv",
    );
  });
});

describe("apiDownload", () => {
  const PATH = "/admin/payouts/export.csv?from=2026-10-01&to=2026-10-31";
  let saved: { href: string; download: string }[];
  let clickSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    clearSessionToken();
    setSessionToken("t1");
    saved = [];
    // jsdom has neither, so they're defined here rather than spied on.
    Object.defineProperty(URL, "createObjectURL", {
      value: vi.fn(() => "blob:1"),
      configurable: true,
      writable: true,
    });
    Object.defineProperty(URL, "revokeObjectURL", {
      value: vi.fn(),
      configurable: true,
      writable: true,
    });
    clickSpy = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      saved.push({ href: this.href, download: this.download });
    });
  });

  afterEach(() => {
    clickSpy.mockRestore();
    vi.unstubAllGlobals();
    clearSessionToken();
  });

  function csv(headers: Record<string, string> = {}) {
    return new Response("sp_id,sp_name\n1,A\n", {
      status: 200,
      headers: { "Content-Type": "text/csv; charset=utf-8", ...headers },
    });
  }

  it("saves under the header's name when the browser lets us read it, with the session token", async () => {
    const api = mockApi({
      [`GET ${PATH}`]: () =>
        csv({ "Content-Disposition": 'attachment; filename="from-header.csv"' }),
    });

    await expect(apiDownload(PATH, "fallback.csv")).resolves.toBe("from-header.csv");

    expect(saved).toEqual([{ href: "blob:1", download: "from-header.csv" }]);
    expect(api.headers(`GET ${PATH}`).Authorization).toBe("Bearer t1");
    expect(URL.createObjectURL).toHaveBeenCalledOnce();
  });

  it("uses the fallback when the header is hidden, as on a cross-origin response", async () => {
    mockApi({ [`GET ${PATH}`]: () => csv() });

    await expect(apiDownload(PATH, "payouts_2026-10-01_2026-10-31.csv")).resolves.toBe(
      "payouts_2026-10-01_2026-10-31.csv",
    );
    expect(saved[0].download).toBe("payouts_2026-10-01_2026-10-31.csv");
  });

  it("rolls the session token like any other call", async () => {
    mockApi({ [`GET ${PATH}`]: () => csv({ "X-Admin-Token": "t2" }) });
    await apiDownload(PATH, "x.csv");
    expect(getSessionToken()).toBe("t2");
  });

  it("throws the backend's 422 message and saves nothing", async () => {
    mockApi({ [`GET ${PATH}`]: () => json({ detail: "Range is longer than 366 days" }, 422) });

    const error = await apiDownload(PATH, "x.csv").catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 422, message: "Range is longer than 366 days" });
    expect(saved).toEqual([]);
  });
});
