/**
 * Publishes the height of a page's sticky bottom CTA as a CSS custom
 * property, so other fixed-position elements can sit above it.
 *
 * The problem this solves: `CartFab` is `fixed` at `bottom-16` (4rem), which
 * exactly clears the 4rem `BottomNav`. On routes where the nav is hidden and
 * the page supplies its own taller bottom CTA — service detail — the two
 * overlap. A bigger constant doesn't fix it either, because that CTA has two
 * heights (~88px for "Add to cart", ~140px once the item is in the cart), so
 * any single number is wrong in one state.
 *
 * Measuring keeps the direction of knowledge the same as before: the CTA
 * publishes its own height and knows nothing about what floats above it, and
 * the floating element decides what to do with the number. Pages that don't
 * opt in are unaffected — consumers fall back to 4rem, which is today's
 * behaviour.
 *
 * Returns a **callback ref**, not a `useRef`: the CTA mounts only after its
 * route resolves data (service detail early-returns a spinner first), so an
 * effect keyed on `[]` would run while the ref was still null and never
 * re-run once the element appeared.
 */
import { useEffect, useState } from "react";

export const PAGE_CTA_HEIGHT_VAR = "--page-cta-height";

export function usePageCtaHeight<T extends HTMLElement>(): (node: T | null) => void {
  const [node, setNode] = useState<T | null>(null);

  useEffect(() => {
    if (!node || typeof ResizeObserver === "undefined") return;

    const publish = () => {
      document.documentElement.style.setProperty(PAGE_CTA_HEIGHT_VAR, `${node.offsetHeight}px`);
    };

    publish();
    const observer = new ResizeObserver(publish);
    observer.observe(node);

    return () => {
      observer.disconnect();
      // Clear on unmount so the next route doesn't inherit this page's
      // offset — the property is global, the element is not.
      document.documentElement.style.removeProperty(PAGE_CTA_HEIGHT_VAR);
    };
  }, [node]);

  return setNode;
}
