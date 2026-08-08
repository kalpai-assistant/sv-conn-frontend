/**
 * Header behaviour hooks — scroll position and current section.
 *
 * Both are marketing-page-only. Nothing here touches the app.
 */
import { useEffect, useState } from "react";

/**
 * True once the page has scrolled past `threshold` pixels.
 *
 * A passive scroll listener rather than an IntersectionObserver sentinel:
 * we need the value on mount too (a reload half-way down the page must
 * start in the scrolled state, not flash the top style), and `passive: true`
 * tells the browser it can scroll without waiting on this handler.
 */
export function useScrolled(threshold = 8) {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > threshold);
    onScroll(); // sync with wherever the page already is
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [threshold]);

  return scrolled;
}

/**
 * Id of the section currently under the reader, for highlighting the nav.
 *
 * `rootMargin` shrinks the observation box to a horizontal band roughly a
 * third down the viewport. Without it, tall sections overlap and several
 * count as "visible" at once, which makes the highlight flicker between
 * neighbours. Narrowing to a band means the active section is whichever one
 * the reader is actually looking at.
 *
 * `ids` must be a stable reference (module-level constant). An array built
 * inline during render is a new value every time and re-subscribes the
 * observer on every render.
 */
export function useActiveSection(ids: readonly string[]) {
  const [active, setActive] = useState("");

  useEffect(() => {
    if (typeof IntersectionObserver === "undefined") return;

    const elements = ids
      .map((id) => document.getElementById(id))
      .filter((el): el is HTMLElement => el !== null);

    if (elements.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((entry) => entry.isIntersecting);
        if (visible.length === 0) return;

        // If the band catches more than one, take the highest on screen.
        const topmost = visible.reduce((a, b) =>
          a.boundingClientRect.top <= b.boundingClientRect.top ? a : b,
        );
        setActive(topmost.target.id);
      },
      { rootMargin: "-30% 0px -60% 0px", threshold: 0 },
    );

    elements.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [ids]);

  return active;
}
