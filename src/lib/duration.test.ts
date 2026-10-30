import { describe, expect, it } from "vitest";
import { mapService } from "@/hooks/useApi";
import { formatDuration } from "./duration";

describe("formatDuration", () => {
  it.each([
    [59, "59 mins"],
    [60, "60 mins"],
    [119, "119 mins"],
    [120, "2 hrs"],
    [150, "2 hrs 30 mins"],
    [480, "8 hrs"],
  ])("%i → %s", (minutes, label) => {
    expect(formatDuration(minutes)).toBe(label);
  });
});

describe("mapService — duration", () => {
  it("labels a 480-minute service and its variant in hours", () => {
    const s = mapService(
      {
        id: "s1",
        name: "Full room painting",
        category_id: "c1",
        description: null,
        base_price: 4999,
        duration_minutes: 480,
        variants: [
          {
            id: "v1",
            label: "1 room",
            subcategory: null,
            base_price: 4999,
            provider_payout: 4000,
            duration_minutes: 480,
            is_active: true,
            sort_order: 0,
          },
        ],
      } as unknown as Parameters<typeof mapService>[0],
      [],
    );
    expect(s.duration).toBe("8 hrs");
    expect(s.variants?.[0].duration).toBe("8 hrs");
  });
});
