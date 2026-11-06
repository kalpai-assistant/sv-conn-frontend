import { describe, expect, it } from "vitest";
import { canOpen, sectionsFor } from "@/lib/nav";
import type { AdminRole } from "@/lib/auth";

const titles = (role: AdminRole) => sectionsFor(role).map((section) => section.title);

describe("role-based sidebar", () => {
  it("shows ops the Operator section only", () => {
    expect(titles("ops")).toEqual(["Operator"]);
  });

  it.each<AdminRole>(["admin", "support"])("shows %s every section", (role) => {
    expect(titles(role)).toEqual(["Operator", "Analytics", "Support"]);
  });
});

describe("canOpen", () => {
  it.each<AdminRole>(["admin", "ops", "support"])("always lets %s open the home page", (role) => {
    expect(canOpen(role, "/")).toBe(true);
  });

  it("lets ops open Operator screens, including sub-paths and a trailing slash", () => {
    expect(canOpen("ops", "/operator/kyc")).toBe(true);
    expect(canOpen("ops", "/operator/kyc/")).toBe(true);
    expect(canOpen("ops", "/operator/kyc/some-id")).toBe(true);
  });

  it("closes the hidden sections to ops", () => {
    expect(canOpen("ops", "/analytics/overview")).toBe(false);
    expect(canOpen("ops", "/support/lookup")).toBe(false);
  });

  it("denies a path no sidebar lists, for every role", () => {
    expect(canOpen("admin", "/operator/not-in-the-sidebar")).toBe(false);
    expect(canOpen("admin", "/operator/kyc-lookalike")).toBe(false);
  });
});
