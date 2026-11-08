import { describe, expect, it } from "vitest";
import { canOpen, sectionsFor } from "@/lib/nav";
import type { AdminRole } from "@/lib/auth";

const titles = (role: AdminRole) => sectionsFor(role).map((section) => section.title);

describe("role-based sidebar", () => {
  it("shows ops the Operator section only", () => {
    expect(titles("ops")).toEqual(["Operator"]);
  });

  it("shows support everything except Audit", () => {
    expect(titles("support")).toEqual(["Operator", "Analytics", "Support"]);
  });

  it("shows admin every section", () => {
    expect(titles("admin")).toEqual(["Operator", "Analytics", "Support", "Audit"]);
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

  it("opens the audit log to admin only", () => {
    expect(canOpen("admin", "/audit")).toBe(true);
    expect(canOpen("ops", "/audit")).toBe(false);
    expect(canOpen("support", "/audit")).toBe(false);
  });

  it.each<AdminRole>(["admin", "ops", "support"])("lets %s open the bookings screen", (role) => {
    expect(canOpen(role, "/operator/bookings")).toBe(true);
  });

  it("denies a path no sidebar lists, for every role", () => {
    expect(canOpen("admin", "/operator/not-in-the-sidebar")).toBe(false);
    expect(canOpen("admin", "/operator/kyc-lookalike")).toBe(false);
  });
});
