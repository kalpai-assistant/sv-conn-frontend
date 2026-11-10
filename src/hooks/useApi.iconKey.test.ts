/** SVC-430: icon_key passes through the category and service adapters. */
import { describe, expect, it } from "vitest";
import { mapCategory, mapService } from "./useApi";

type ApiCategory = Parameters<typeof mapCategory>[0];
type ApiService = Parameters<typeof mapService>[0];

const CATEGORY = {
  id: "c1",
  name: "Water tank cleaning",
  slug: "water-tank-cleaning",
  icon_url: null,
  description: null,
  sort_order: 3,
  parent_id: null,
} as unknown as ApiCategory;

const SERVICE = {
  id: "s1",
  name: "Tank clean",
  category_id: "c1",
  description: "**Deep** clean",
  base_price: 999,
  duration_minutes: 120,
  variants: [],
} as unknown as ApiService;

describe("icon_key in the adapters", () => {
  it("carries a category's icon_key as iconKey", () => {
    expect(mapCategory({ ...CATEGORY, icon_key: "droplets" }).iconKey).toBe("droplets");
  });

  it("reads a missing or null icon_key as null", () => {
    expect(mapCategory(CATEGORY).iconKey).toBeNull();
    expect(mapCategory({ ...CATEGORY, icon_key: null }).iconKey).toBeNull();
  });

  it("carries a service's icon_key as iconKey", () => {
    expect(mapService({ ...SERVICE, icon_key: "drill" }, []).iconKey).toBe("drill");
    expect(mapService(SERVICE, []).iconKey).toBeNull();
  });

  it("keeps the description as the markdown sent", () => {
    expect(mapService(SERVICE, []).description).toBe("**Deep** clean");
  });
});
