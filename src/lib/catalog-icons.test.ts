import { describe, expect, it } from "vitest";
import { Drill, Sparkles } from "lucide-react";
import { CATALOG_ICONS, catalogIcon } from "./catalog-icons";

// The backend's CATALOG_ICON_KEYS (app/seed_data/catalog_icons.py), verbatim and
// in its order. admin/src/lib/catalog-icons.test.ts pins the same list.
const BACKEND_KEYS = [
  "sparkles",
  "bug",
  "air-vent",
  "layout-grid",
  "zap",
  "wrench",
  "hammer",
  "paintbrush",
  "scissors",
  "brush",
  "hand-heart",
  "droplets",
  "sofa",
  "car",
  "bath",
  "camera",
  "house",
  "shower-head",
  "plug",
  "lightbulb",
  "fan",
  "refrigerator",
  "washing-machine",
  "microwave",
  "paint-roller",
  "drill",
  "cctv",
  "sprout",
  "truck",
  "shirt",
];

describe("CATALOG_ICONS", () => {
  it("is exactly the backend's 30 keys, in its order", () => {
    expect([...CATALOG_ICONS.keys()]).toEqual(BACKEND_KEYS);
  });

  it("maps every key to a real, distinct component", () => {
    const icons = [...CATALOG_ICONS.values()];
    expect(icons.every(Boolean)).toBe(true);
    expect(new Set(icons).size).toBe(30);
  });
});

describe("catalogIcon", () => {
  it("finds a known key", () => {
    expect(catalogIcon("drill")).toBe(Drill);
    expect(catalogIcon("sparkles")).toBe(Sparkles);
  });

  it("is undefined for no key or an unknown one", () => {
    expect(catalogIcon(null)).toBeUndefined();
    expect(catalogIcon(undefined)).toBeUndefined();
    expect(catalogIcon("")).toBeUndefined();
    expect(catalogIcon("rocket")).toBeUndefined();
  });
});
