/**
 * SVC-430: which icon a category gets. The curated slug map wins (Tushar's call:
 * the original categories keep their designed icon), then the admin's icon_key,
 * then Sparkles.
 */
import { describe, expect, it } from "vitest";
import { Camera, Drill, Sparkles, Wrench } from "lucide-react";
import { categoryIcon } from "./category-icons";

describe("categoryIcon", () => {
  it("uses the curated icon for a curated slug, whatever icon_key says", () => {
    expect(categoryIcon("plumber", "camera")).toBe(Wrench);
    expect(categoryIcon("plumber", "not-a-key")).toBe(Wrench);
    expect(categoryIcon("plumber")).toBe(Wrench);
  });

  it("uses icon_key for a slug the curated map doesn't cover", () => {
    expect(categoryIcon("water-tank-cleaning", "drill")).toBe(Drill);
    expect(categoryIcon("water-tank-cleaning", "camera")).toBe(Camera);
  });

  it("falls back to Sparkles with no icon_key, or one this build doesn't know", () => {
    expect(categoryIcon("water-tank-cleaning", null)).toBe(Sparkles);
    expect(categoryIcon("water-tank-cleaning", undefined)).toBe(Sparkles);
    expect(categoryIcon("water-tank-cleaning", "")).toBe(Sparkles);
    expect(categoryIcon("water-tank-cleaning", "rocket")).toBe(Sparkles);
  });
});
