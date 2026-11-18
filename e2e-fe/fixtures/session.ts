/**
 * Seed `localStorage` with the shape a signed-in app cold-start expects.
 *
 * The keys mirror what `src/lib/api.ts` and `src/lib/auth-context.tsx` read
 * on boot — see those files for the authoritative list. Must be awaited
 * BEFORE `page.goto()`, since both modules read storage at module-eval time.
 *
 * Why not drive the OTP flow? SVC-468 tests the chained money path, not
 * authentication — the AuthFlow is covered by its own vitest suite and
 * SVC-472 adds the dedicated Playwright. Seeding session state here keeps
 * this spec focused on what it means to verify.
 */
import type { BrowserContext, Page } from "@playwright/test";
import { DEFAULT_USER, type MockUser } from "./backend";

export interface SessionSeed {
  user?: MockUser;
  accessToken?: string;
  refreshToken?: string;
  cartItems?: Array<{
    key: string;
    serviceId: string;
    variantId?: string;
    variantLabel?: string;
    name: string;
    unitPrice: number;
    quantity: number;
    duration?: string;
  }>;
  selectedAddressId?: string;
}

export async function seedSession(
  context: BrowserContext | Page,
  seed: SessionSeed = {},
): Promise<void> {
  const user = seed.user ?? DEFAULT_USER;
  const accessToken = seed.accessToken ?? "test-access-token";
  const refreshToken = seed.refreshToken ?? "test-refresh-token";
  const cartItems = seed.cartItems ?? [];
  const selectedAddressId = seed.selectedAddressId ?? "addr-test-1";

  await context.addInitScript(
    ({ user, accessToken, refreshToken, cartItems, selectedAddressId }) => {
      localStorage.setItem("eazyserv:access_token", accessToken);
      localStorage.setItem("eazyserv:refresh_token", refreshToken);
      localStorage.setItem("eazyserv:user", JSON.stringify(user));
      if (cartItems.length > 0) {
        // src/lib/cart-context.tsx: `sc_cart_v2_<userId>`.
        localStorage.setItem(`sc_cart_v2_${user.id}`, JSON.stringify(cartItems));
      }
      if (selectedAddressId) {
        // Non-user-scoped per SVC-350: lives outside the sc_cart_v2_<id> pattern.
        localStorage.setItem("sc_selected_address_id", selectedAddressId);
      }
    },
    { user, accessToken, refreshToken, cartItems, selectedAddressId },
  );
}
