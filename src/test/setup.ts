/** Vitest setup: jest-dom matchers, jsdom gaps, and a clean DOM between tests. */
import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach, vi } from "vitest";

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

afterEach(() => {
  cleanup();
});
