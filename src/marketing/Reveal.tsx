/**
 * Scroll-reveal wrapper — fades and lifts its children in the first time
 * they enter the viewport.
 *
 * IntersectionObserver rather than a scroll listener: the browser does the
 * work off the main thread, and there is nothing to throttle. No animation
 * library — this bundle is deliberately free of the app's framer-motion
 * dependency, and a fade plus an 8px translate does not need one.
 *
 * Three things worth keeping:
 *
 * 1. `prefers-reduced-motion` is honoured by showing the content
 *    immediately. Motion-sensitive users get the page, just not the
 *    movement — never leave content hidden behind an animation they opted
 *    out of.
 * 2. The observer disconnects after the first intersection. These are
 *    one-shot reveals; re-animating on every scroll past is distracting
 *    and keeps observers alive for the life of the page.
 * 3. Initial state is `opacity-0`, so if JS fails the content would be
 *    invisible. The effect runs on mount regardless of intersection
 *    support, so the only way to stay hidden is JS never executing at
 *    all — in which case this SPA renders nothing anyway.
 *
 * Do not wrap the hero. It is above the fold and its text is the LCP
 * element; fading it in delays the largest paint for no benefit.
 */
import { useEffect, useRef, useState, type ReactNode } from "react";

type RevealProps = {
  children: ReactNode;
  /** Stagger in ms, for sibling cards revealing in sequence. */
  delay?: number;
  className?: string;
};

export function Reveal({ children, delay = 0, className = "" }: RevealProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    // Respect the OS-level motion preference, and fail open if the browser
    // has no IntersectionObserver — better to show everything than to hide
    // the page behind a feature check.
    const prefersReduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (prefersReduced || typeof IntersectionObserver === "undefined") {
      setShown(true);
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setShown(true);
            observer.disconnect();
          }
        }
      },
      // Fire slightly before the element is fully on screen so the movement
      // has finished by the time the reader's eye arrives.
      { threshold: 0.1, rootMargin: "0px 0px -8% 0px" },
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      style={{ transitionDelay: shown ? `${delay}ms` : "0ms" }}
      className={`transition-[opacity,transform] duration-700 ease-out ${
        shown ? "translate-y-0 opacity-100" : "translate-y-2 opacity-0"
      } ${className}`}
    >
      {children}
    </div>
  );
}
