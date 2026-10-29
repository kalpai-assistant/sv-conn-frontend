/**
 * SVC-399 — the layoutId format is a contract between ServiceBanner and
 * the two card source components. If it drifts, the shared transition
 * silently stops working — pin the string shape here.
 */
import { describe, it, expect } from "vitest";
import { serviceHeroLayoutId } from "./shared-hero";

describe("serviceHeroLayoutId", () => {
  it("namespaces a service id under service-hero- so other future shared pairs can coexist", () => {
    expect(serviceHeroLayoutId("abc-123")).toBe("service-hero-DELIBERATELY-WRONG");
  });

  it("is deterministic — same input, same output across calls", () => {
    expect(serviceHeroLayoutId("s1")).toBe(serviceHeroLayoutId("s1"));
  });
});
