/**
 * SVC-430: the icon on a compact service card. The service's own icon_key wins;
 * without one the card shows its category's icon (curated slug, then the
 * category's icon_key); with neither, the name's first letter. The rendered svg
 * carries Lucide's `lucide-<name>` class, which is what these assert.
 */
import { describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";
import type { Service } from "@/lib/mock-data";
import { ServiceCardCompact } from "./ServiceCardCompact";

vi.mock("@/lib/service-sheet-context", () => ({
  useServiceSheet: () => ({ openService: vi.fn(), closeService: vi.fn(), openServiceId: null }),
}));
vi.mock("@/components/service/QuickAddButton", () => ({ QuickAddButton: () => null }));

const SERVICE: Service = {
  id: "s1",
  name: "Basin installation",
  categoryId: "c1",
  categoryName: "Plumber",
  description: "",
  price: 499,
  payout: 0,
  duration: "1 hr",
  variants: [],
};

// The image tile at the top of the card; the duration row has its own Clock icon.
const TILE_SVG = ".h-24 svg";

const iconClass = (container: HTMLElement) =>
  container.querySelector(TILE_SVG)?.getAttribute("class") ?? "";

describe("ServiceCardCompact icon", () => {
  it("shows the service's icon_key over its category's icon", () => {
    const { container } = render(
      <ServiceCardCompact service={{ ...SERVICE, iconKey: "drill" }} categorySlug="plumber" />,
    );
    expect(iconClass(container)).toContain("lucide-drill");
    expect(iconClass(container)).not.toContain("lucide-wrench");
  });

  it("shows the service's icon_key on a mixed rail with no category", () => {
    const { container } = render(<ServiceCardCompact service={{ ...SERVICE, iconKey: "fan" }} />);
    expect(iconClass(container)).toContain("lucide-fan");
  });

  it("falls back to the curated category icon without one", () => {
    const { container } = render(
      <ServiceCardCompact service={{ ...SERVICE, iconKey: null }} categorySlug="plumber" />,
    );
    expect(iconClass(container)).toContain("lucide-wrench");
  });

  it("uses the category's icon_key for a slug the curated map doesn't cover", () => {
    const { container } = render(
      <ServiceCardCompact
        service={SERVICE}
        categorySlug="water-tank-cleaning"
        categoryIconKey="shower-head"
      />,
    );
    expect(iconClass(container)).toContain("lucide-shower-head");
  });

  it("ignores an icon_key this build doesn't know", () => {
    const { container } = render(
      <ServiceCardCompact service={{ ...SERVICE, iconKey: "rocket" }} categorySlug="plumber" />,
    );
    expect(iconClass(container)).toContain("lucide-wrench");
  });

  it("shows the first letter with no icon and no category", () => {
    const { container } = render(<ServiceCardCompact service={SERVICE} />);
    expect(container.querySelector(TILE_SVG)).toBeNull();
    expect(container.textContent).toContain("B");
  });
});
