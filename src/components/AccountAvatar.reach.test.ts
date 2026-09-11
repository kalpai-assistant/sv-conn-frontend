/**
 * Profile must stay reachable from every tab (SVC-273).
 *
 * Moving Profile out of the bottom bar and into a header avatar was meant to
 * be a *relocation*. Built naively it is a regression instead: the avatar first
 * landed only on each role's Home, so from Bookings, Cart, Activity, Jobs or
 * Earnings there was no way to Profile at all — you had to return to Home
 * first. The tab it replaced was reachable from everywhere.
 *
 * Found on device by walking the tabs. Asserted here against the sources
 * because the alternative is five route tests standing up React Query, auth,
 * the cart and pull-to-refresh apiece — scaffolding that would mostly prove
 * the mocks work. This is narrow, and it fails for the right reason: someone
 * adding a sixth tab, or deleting an avatar, has to see it.
 */
import { describe, expect, it } from "vitest";

/** Every tab destination, and the Profile its avatar must point at. */
const TAB_SCREENS: Array<{ file: string; to: string }> = [
  // Consumer. Home's avatar lives in LocationBar, not the route file.
  { file: "@/components/home/LocationBar?raw", to: "/profile" },
  { file: "@/routes/bookings?raw", to: "/profile" },
  { file: "@/routes/cart?raw", to: "/profile" },
  { file: "@/routes/activity?raw", to: "/profile" },
  // Provider. Home's avatar comes via ProviderHeader.
  { file: "@/components/provider/ProviderHeader?raw", to: "/provider/profile" },
  { file: "@/routes/provider/bookings/index?raw", to: "/provider/profile" },
  { file: "@/routes/provider/earnings?raw", to: "/provider/profile" },
];

describe("every tab offers a way to Profile", () => {
  it.each(TAB_SCREENS)("$file renders an AccountAvatar to $to", async ({ file, to }) => {
    const mod = await import(/* @vite-ignore */ file);
    const source = mod.default as unknown as string;

    expect(source).toContain("AccountAvatar");
    // The right Profile, too: a provider sent to /profile is bounced by the
    // role guard and lands somewhere they did not ask for.
    expect(source).toContain(`to="${to}"`);
  });
});
