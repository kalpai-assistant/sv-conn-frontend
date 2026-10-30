/** Vitest setup: jest-dom matchers, jsdom gaps, and a clean DOM between tests. */
import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { MotionGlobalConfig } from "framer-motion";
import { afterAll, afterEach, vi } from "vitest";
// SVC-375: every test starts in English, so the existing assertions on copy
// hold. A test that wants hi/mr switches it and this puts it back.
import i18n from "@/i18n";

// jsdom implements neither of these, and `input-otp` — which owns the OTP
// boxes — constructs a ResizeObserver on mount. Without the stub every test
// that reaches the OTP step dies in a passive effect, far from the assertion.
globalThis.ResizeObserver = class {
  observe() {}
  unobserve() {}
  disconnect() {}
} as unknown as typeof ResizeObserver;

if (!Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = vi.fn();
}

// `input-otp` probes this from a deferred timer to keep its fake caret aligned.
// jsdom has no layout, so it is absent — and because the call lands after the
// test has finished, the failure surfaces as an unattributable uncaught
// exception rather than a failing assertion.
if (!document.elementFromPoint) {
  document.elementFromPoint = () => null;
}

// framer-motion otherwise runs real exit animations in jsdom, and every step
// change behind `AnimatePresence mode="wait"` waits out that wall-clock time.
// Under full-suite CPU load it doubled, putting a multi-step AuthFlow test at
// 4.4s of the 5s timeout (SVC-403). Skipped, animations still land on their
// end state, so assertions on what renders are unchanged.
//
// The cost: no unit test can observe animation behaviour — exit timing,
// layoutId shared-element transitions, spring feel. Those stay device-checked.
MotionGlobalConfig.skipAnimations = true;

afterEach(() => {
  cleanup();
  void i18n.changeLanguage("en");
});

// `input-otp` re-reads the caret on every value or focus change from timers at
// 0, 10 and 50ms that it never clears on unmount. After a file's last test they
// can fire once jsdom is torn down, and the setState inside throws "window is
// not defined" as an unhandled error, which fails the whole run. That happened
// in 2 of the first 3 CI runs and never locally, where teardown is slower than
// 50ms (SVC-403). Waiting them out here, while the window still exists, lets
// them land on an unmounted component, which React ignores.
//
// 60ms because input-otp 1.4.2 schedules that setState at 0/10/50ms with no
// cleanup. Re-check this on any input-otp upgrade.
afterAll(() => new Promise((resolve) => setTimeout(resolve, 60)));
