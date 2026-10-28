/**
 * SVC-399: naming the shared-layout pair that animates a service card's
 * hero tile into the service sheet's banner.
 *
 * Keeping the format in one place matters for two reasons: (1) a drift
 * between source and destination strings turns the shared transition into
 * a double mount with no morph, and (2) framer-motion's layout group is
 * global by default, so bare `service-${id}` would collide with any other
 * future shared element on the same `id`. The `service-hero-` prefix
 * namespaces this specific pair.
 *
 * Reduced-motion is honoured at the call sites via `useReducedMotion()`:
 * when it's on, the helper is simply not called and the two elements fall
 * back to static renders — kept outside this file so the branch stays
 * next to the component that owns the fallback.
 */
export function serviceHeroLayoutId(serviceId: string): string {
  return `service-hero-${serviceId}`;
}
