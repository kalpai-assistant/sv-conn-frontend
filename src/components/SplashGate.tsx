/**
 * Root-level splash gate.
 *
 * On first mount, renders `SplashAnimation` for the animation window,
 * then swaps to `children`. Runs regardless of auth state — a
 * logged-in user opening the app cold sees the splash exactly like a
 * new user does. That's the spec ("when the app opens").
 *
 * Fires once per component lifetime. In practice that's once per
 * page load / cold launch:
 *   - Native (Capacitor): cold launch = fresh WebView → fresh
 *     component mount → splash. App switcher resume keeps the
 *     WebView alive, so the gate stays past its 2s window and does
 *     not re-fire. That's the right behaviour: users don't want a
 *     splash every time they tab-switch back.
 *   - Web / PWA: page load = fresh mount → splash. Route navigation
 *     within the SPA keeps the component mounted, so the splash
 *     does not replay on `<Link>` clicks.
 *
 * Timer is 2s to match the animation's internal timeline (mark
 * spring + wordmark + tagline + small hold). Kept as a constant so
 * a designer can tune it without threading a prop through the
 * render tree.
 */
import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { SplashAnimation } from "./SplashAnimation";

const SPLASH_HOLD_MS = 2000;

export function SplashGate({ children }: { children: React.ReactNode }) {
  const [showSplash, setShowSplash] = useState(true);

  useEffect(() => {
    const t = setTimeout(() => setShowSplash(false), SPLASH_HOLD_MS);
    return () => clearTimeout(t);
  }, []);

  return (
    <>
      {children}
      <AnimatePresence>
        {showSplash && (
          <motion.div
            key="root-splash"
            initial={{ opacity: 1 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.35, ease: "easeOut" }}
            // Sits above every route + overlay in the app so the
            // splash covers the shell during boot. Below any modal
            // that lives on z-[60]+ (there are none currently but
            // this leaves headroom).
            className="fixed inset-0 z-[55]"
          >
            <SplashAnimation />
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
