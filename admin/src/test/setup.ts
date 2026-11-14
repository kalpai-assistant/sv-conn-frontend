/** Vitest setup: jest-dom matchers and a clean DOM between tests. */
import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

// jsdom has no scrollTo; the router's scroll restoration calls it on every
// navigation and would log "Not implemented" for each.
window.scrollTo = () => {};

// Radix Select calls these, and jsdom has none of them.
Element.prototype.hasPointerCapture = () => false;
Element.prototype.setPointerCapture = () => {};
Element.prototype.releasePointerCapture = () => {};
Element.prototype.scrollIntoView = () => {};

afterEach(() => {
  cleanup();
});
