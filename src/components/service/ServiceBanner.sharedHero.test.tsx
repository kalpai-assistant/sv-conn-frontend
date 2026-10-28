/**
 * SVC-399 — the service-hero shared-element pair.
 *
 * We pin ONE thing here: ServiceBanner emits the `service-hero-${id}`
 * `layoutId` the sources on ServiceCard / ServiceCardCompact listen for,
 * and drops it under `prefers-reduced-motion: reduce`. The visual spring
 * is framer-motion's; the pair contract is ours.
 *
 * Framer-motion is Proxy-mocked so `layoutId` lands on the DOM as a
 * data attribute we can assert on — the stock `vi.mock("framer-motion",
 * () => ({ motion: { div: ... } }))` shape used elsewhere strips the
 * prop before it reaches the node, which is what the ticket cannot
 * tolerate: a dropped layoutId is exactly the bug it would prevent.
 */
import type { ReactElement, ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";
import type { Service } from "@/lib/mock-data";

const useReducedMotionMock = vi.fn<() => boolean | null>(() => false);

vi.mock("framer-motion", async () => {
  const React = await import("react");
  type MotionProps = React.HTMLAttributes<HTMLElement> & {
    children?: ReactNode;
    layoutId?: string;
    initial?: unknown;
    animate?: unknown;
    exit?: unknown;
    variants?: unknown;
    transition?: unknown;
    layout?: unknown;
  };
  return {
    motion: new Proxy(
      {},
      {
        get:
          (_t, tag: string) =>
          ({
            children,
            layoutId,
            initial: _initial,
            animate: _animate,
            exit: _exit,
            variants: _variants,
            transition: _transition,
            layout: _layout,
            ...rest
          }: MotionProps) =>
            React.createElement(
              tag,
              {
                ...rest,
                "data-layout-id": layoutId,
              },
              children,
            ),
      },
    ),
    useReducedMotion: () => useReducedMotionMock(),
  };
});

const SERVICE: Service = {
  id: "s42",
  name: "Deep clean",
  categoryId: "c1",
  categoryName: "Cleaning",
  description: "",
  price: 999,
  payout: 800,
  duration: "2 hrs",
  variants: [],
};

beforeEach(() => {
  useReducedMotionMock.mockReturnValue(false);
});

// Keeps the test file side-effect-free until each spec runs — the two
// `motion.div` children of a card variant need the component imports
// deferred past the top-level mock.
async function renderBanner(): Promise<ReactElement> {
  const { ServiceBanner } = await import("./ServiceBanner");
  return <ServiceBanner service={SERVICE} categories={[]} />;
}

async function renderCard(): Promise<ReactElement> {
  const { ServiceCard } = await import("@/components/ServiceCard");
  return <ServiceCard service={SERVICE} />;
}

async function renderCompact(): Promise<ReactElement> {
  const { ServiceCardCompact } = await import("@/components/home/ServiceCardCompact");
  return <ServiceCardCompact service={SERVICE} />;
}

describe("SVC-399 shared-hero pair", () => {
  it("ServiceBanner carries the service-scoped layoutId when motion is enabled", async () => {
    const { container } = render(await renderBanner());
    const banner = container.firstElementChild as HTMLElement | null;
    expect(banner).not.toBeNull();
    expect(banner!.getAttribute("data-layout-id")).toBe("service-hero-s42");
  });

  it("drops the layoutId under prefers-reduced-motion so the sheet opens without a shared morph", async () => {
    useReducedMotionMock.mockReturnValue(true);
    const { container } = render(await renderBanner());
    const banner = container.firstElementChild as HTMLElement | null;
    expect(banner).not.toBeNull();
    // Attribute present but set to no value: our Proxy mock forwards the
    // undefined `layoutId` as a null attribute, which React renders as absent.
    expect(banner!.hasAttribute("data-layout-id")).toBe(false);
  });

  it("ServiceCard's avatar tile mirrors the banner's layoutId so framer-motion pairs them", async () => {
    vi.resetModules();
    useReducedMotionMock.mockReturnValue(false);
    vi.doMock("@/lib/service-sheet-context", () => ({
      useServiceSheet: () => ({ openService: vi.fn(), closeService: vi.fn(), openServiceId: null }),
    }));
    vi.doMock("@/components/service/QuickAddButton", () => ({ QuickAddButton: () => null }));
    const { container } = render(await renderCard());
    const tile = container.querySelector<HTMLElement>("[data-layout-id]");
    expect(tile).not.toBeNull();
    expect(tile!.getAttribute("data-layout-id")).toBe("service-hero-s42");
  });

  it("ServiceCardCompact's image tile mirrors the banner's layoutId", async () => {
    vi.resetModules();
    useReducedMotionMock.mockReturnValue(false);
    vi.doMock("@/lib/service-sheet-context", () => ({
      useServiceSheet: () => ({ openService: vi.fn(), closeService: vi.fn(), openServiceId: null }),
    }));
    vi.doMock("@/components/service/QuickAddButton", () => ({ QuickAddButton: () => null }));
    const { container } = render(await renderCompact());
    const tile = container.querySelector<HTMLElement>("[data-layout-id]");
    expect(tile).not.toBeNull();
    expect(tile!.getAttribute("data-layout-id")).toBe("service-hero-s42");
  });
});
