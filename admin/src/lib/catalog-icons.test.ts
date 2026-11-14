import { describe, expect, it } from "vitest";
import { Drill, Sparkles } from "lucide-react";
import { CATALOG_ICONS, catalogIcon } from "./catalog-icons";

// The backend's CATALOG_ICON_KEYS (app/seed_data/catalog_icons.py), verbatim and
// in its order. A key here that the backend lacks is a 422 on every save.
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
    expect(CATALOG_ICONS.map((icon) => icon.key)).toEqual(BACKEND_KEYS);
  });

  it("gives every key a label and a real component", () => {
    for (const icon of CATALOG_ICONS) {
      expect(icon.label.trim()).not.toBe("");
      expect(icon.Icon).toBeTruthy();
    }
    expect(new Set(CATALOG_ICONS.map((icon) => icon.label)).size).toBe(30);
  });
});

describe("catalogIcon", () => {
  it("finds a known key", () => {
    expect(catalogIcon("drill")?.Icon).toBe(Drill);
    expect(catalogIcon("sparkles")?.Icon).toBe(Sparkles);
  });

  it("is null for no key or an unknown one", () => {
    expect(catalogIcon(null)).toBeNull();
    expect(catalogIcon(undefined)).toBeNull();
    expect(catalogIcon("")).toBeNull();
    expect(catalogIcon("rocket")).toBeNull();
  });
});
