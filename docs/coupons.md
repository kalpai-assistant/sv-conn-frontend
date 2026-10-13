# Coupon banner flows

Where the four coupon-anchored home-banner flows live, how they share one
`pendingCouponStore`, and how to add a fifth one without touching more than
four files.

> Scope note: this document covers the *frontend* flow for a user tapping a
> promotional banner and landing on `/cart` with a coupon ready to apply.
> Coupon validation, time-window enforcement, and per-user caps are backend
> concerns ([`app/models/coupon.py`](../../backend/app/models/coupon.py) +
> [`app/services/coupon_service.py`](../../backend/app/services/coupon_service.py))
> and are not described here.

## Handler model

A banner is one `BannerDestination` ([src/components/home/banner-destination.ts](../src/components/home/banner-destination.ts)).
`HeroBanner` and `PromoCarousel` are two renderers over that shape — both
go through `useCouponBannerHandlers` so the handler cannot drift between
them. Six `kind`s total; four involve coupons.

| `kind` | Behaviour on tap | Example copy |
| --- | --- | --- |
| `coupon` (SVC-310) | Stash code via `pendingCouponStore`, navigate to `/cart?coupon=CODE`. If cart has items, CouponsSheet auto-opens and auto-applies. If empty, the sticky "will apply when you add items" row renders. **Never dead-ends anymore** (SVC-347 §7). | "FIRST20 — tap to apply at checkout" |
| `coupon-prefill-cart` (SVC-347) | `cart.addMany(items)` → stash code → navigate to `/cart`. Sheet auto-opens on arrival. If the service catalogue hasn't hydrated when the user taps, the button is disabled with a spinner — never silently noop. | "Weekend ₹200 off Home Deep Cleaning — tap to add + apply" |
| `coupon-stash` (SVC-347) | Stash code → navigate to `navigateTo` (defaults to `/`). The code auto-applies the next time the user lands on `/cart` with items. | "₹100 off next booking — stash and apply later" |
| `coupon-category` (SVC-347) | Stash code → navigate to `/category/$slug`. Narrower than `coupon-stash`, broader than `coupon-prefill-cart`. | "20% off all Spa services" |
| `route` | In-app `<Link>`. Unchanged. | "Explore a new category" |
| `external` | External `<a target="_blank">` with the usual opener-safety attrs. Unchanged. | Marketing microsite |

The decorative banner (banner with no `destination`) is **not a flow** — it's
a plain `<div role="img">` with no handler and no press feedback. Festival
greetings use this.

## The pending-coupon store contract

File: [src/lib/pending-coupon.ts](../src/lib/pending-coupon.ts).

Three pure functions over `localStorage`:

- `getPendingCoupon(userId): string | null`
- `setPendingCoupon(userId, code): void` — upper-cases + trims. No-op when
  `userId` is undefined (pre-auth banner taps lose the write; the cart
  they would apply against doesn't exist).
- `clearPendingCoupon(userId): void`

**Three invariants hold:**

1. **Key shape** is `sc_pending_coupon_v1_<userId>`. The `sc_` prefix is
   load-bearing — `session.ts::clearSession` (SVC-350) sweeps every `sc_*`
   key on logout, so this store's teardown is free. **A new user-scoped
   store MUST use the `sc_` prefix or the leak reappears quietly.**
2. **Codes are stored uppercase.** CouponsSheet uppercases its typed
   input, the backend normalises on validate. The store matches.
3. **Clear only on three events:**
   - `onApplied` fires in CouponsSheet (success).
   - User taps "Clear" on the sticky row.
   - User logs out (free via `sc_*` sweep).

   **Never clear earlier.** A mid-mutation validate error (min-order,
   expired, per-user cap) must leave the code recoverable — the user may
   add another item or re-open the sheet manually and retry.

## Where each flow's render branch lives

| Component | File:line |
| --- | --- |
| `coupon` button handler | [src/components/home/HeroBanner.tsx](../src/components/home/HeroBanner.tsx), [src/components/home/PromoCarousel.tsx](../src/components/home/PromoCarousel.tsx) — the `destination.kind === "coupon"` block |
| `coupon-prefill-cart` button handler | Same two files, `destination.kind === "coupon-prefill-cart"` block |
| `coupon-stash` button handler | Same two files, `destination.kind === "coupon-stash"` block |
| `coupon-category` button handler | Same two files, `destination.kind === "coupon-category"` block |
| Shared stash + navigate logic | [src/components/home/coupon-banner-handlers.ts](../src/components/home/coupon-banner-handlers.ts) |
| `cart.addMany` resolution against the service catalogue | [src/lib/cart-context.tsx](../src/lib/cart-context.tsx) — `addMany` callback |
| Cart boot-hook (auto-open sheet vs sticky row) | [src/routes/cart.tsx](../src/routes/cart.tsx) — `pendingCouponCode` state + `autoOpenedRef` effect |
| Sticky row component | [src/routes/cart.tsx](../src/routes/cart.tsx) — `PendingCouponStickyRow` at bottom of file |

## Add a new coupon flow in 15 minutes

**Scenario:** marketing wants a "Monsoon special — tap to open AC service
with COOL10 ready" banner. That's `coupon-prefill-cart` with the AC
service — already supported. If it were a *new* kind — say
`coupon-timeslot` that stashes a code AND pre-fills a scheduled slot — the
four touchpoints are:

1. **Add the variant to the union** in
   [src/components/home/banner-destination.ts](../src/components/home/banner-destination.ts).

   ```ts
   | { kind: "coupon-timeslot"; code: string; slotIso: string }
   ```

2. **Add the handler** in
   [src/components/home/coupon-banner-handlers.ts](../src/components/home/coupon-banner-handlers.ts).

   ```ts
   const onCouponTimeslot = useCallback(
     (code: string, slotIso: string) => {
       setPendingCoupon(userId, code);
       setPendingSlot(userId, slotIso); // whatever your slot store is
       void navigate({ to: "/cart" });
     },
     [navigate, userId],
   );
   ```

   Expose it on the returned object. The two renderers now both have it
   available.

3. **Wire the render branch** in both
   [HeroBanner.tsx](../src/components/home/HeroBanner.tsx) and
   [PromoCarousel.tsx](../src/components/home/PromoCarousel.tsx) — follow
   the pattern the three existing `coupon-*` branches already use
   (shared `renderCouponButton` helper, pass handler + a11y label).

4. **Add a vitest case** in both
   [HeroBanner.test.tsx](../src/components/home/HeroBanner.test.tsx) and
   [PromoCarousel.test.tsx](../src/components/home/PromoCarousel.test.tsx)
   — one test per surface asserting that the tap calls the right handler
   with the right args.

Four files, one new variant. The pending-coupon store doesn't need
touching; the cart boot-hook doesn't need touching; the SVC-350 teardown
sweeps the new key for free as long as it uses the `sc_` prefix.

## Pitfalls

- **Never ship a banner without `activeUntil`.** The hero slot's
  `pickActiveBanner` relies on the window to retire stale banners
  automatically — a missing `activeUntil` means a Diwali banner shows up
  in March. See [HeroBanner.tsx](../src/components/home/HeroBanner.tsx)
  `BANNERS` config for the pattern.
- **Never clear `pendingCouponStore` before `onApplied` fires.** A
  `/coupons/validate` error (min-order, expired, per-user cap) must leave
  the code recoverable — the user may add another item and retry. Only
  three events clear it: successful apply, explicit "Clear" tap on the
  sticky row, or logout (free via SVC-350).
- **`cart.addMany` depends on service-catalogue hydration.** The handler
  reads `queryClient.getQueryData(["services", undefined])`. If the user
  taps `coupon-prefill-cart` before `useServices()` has resolved, the
  helper would silently drop every item. The banner render branches
  guard against this: `useServices().data === undefined` → button
  disabled + spinner overlay. **Preserve this guard on any new flow that
  calls `addMany`.**
- **Match the catalogue's variant shape when configuring `items`.** If a
  service has priced variants, pass `variantId` — otherwise `cart.add`
  falls back to the first active variant (SVC-232 regression surface).
  For a service with no priced variants, omit `variantId`.
- **The `sc_` prefix is load-bearing.** A new user-scoped store under any
  other prefix will NOT be swept on logout and the next user on a shared
  device will inherit it. Match the prefix.

## Example configurations (not shipped — illustrative only)

These show the config shape without putting them in `BANNERS`.

```ts
// coupon-prefill-cart — Diwali deep-cleaning promo:
{
  id: "diwali-deep-clean-2026",
  image: "/images/banners/diwali-2026.webp",
  title: "Deep clean before Diwali",
  subtitle: "₹200 off home deep cleaning this weekend",
  ctaLabel: "Add & apply DIWALI20",
  activeFrom: "2026-10-25",
  activeUntil: "2026-11-02",
  destination: {
    kind: "coupon-prefill-cart",
    code: "DIWALI20",
    items: [{ serviceId: "svc_home_deep_clean", quantity: 1 }],
  },
}

// coupon-stash — referral reward:
{
  id: "referral-reward-2026",
  image: "/images/banners/referral.webp",
  title: "₹100 waiting for you",
  subtitle: "On your next booking",
  ctaLabel: "Save for later",
  activeFrom: "2026-10-12",
  activeUntil: "2026-12-31",
  destination: { kind: "coupon-stash", code: "REFER100" },
}

// coupon-category — Spa Week:
{
  id: "spa-week-2026",
  image: "/images/banners/spa-week.webp",
  title: "Spa Week — 20% off",
  subtitle: "All spa services",
  ctaLabel: "Browse spa",
  activeFrom: "2026-11-10",
  activeUntil: "2026-11-17",
  destination: {
    kind: "coupon-category",
    code: "SPA20",
    categorySlug: "spa",
  },
}
```

## Decorative-only banner

Not a coupon flow. Festival-greeting mode: the banner has no `destination`,
renders as a `<div role="img" aria-label="Happy Ganesh Chaturthi">`, has
no press feedback, no handler. The CTA pill is wired to `destination`
presence, so "Apply FIRST20 →" cannot render on a decorative banner.

## Non-goals

Called out in the SVC-347 ticket, documented here so future implementers
don't re-litigate:

- **No `coupon.allowed_service_ids` backend field.** Service-restriction is
  enforced by the FLOW (we populate the cart for `coupon-prefill-cart`),
  not by a backend check. If a user removes a prefilled service and the
  coupon's min-order no longer holds, `/coupons/validate` refuses it —
  acceptable for v1.
- **No admin UI for banner config.** Banners stay hardcoded in
  `HeroBanner.tsx` and `PromoCarousel.tsx` until marketing demand
  justifies a `/banners` endpoint.
- **No coupon stacking.** The backend's `UNIQUE(coupon_redemptions.booking_id)`
  stays. One coupon per booking.
- **No banner analytics funnel** (tap → stash → apply → redeem). Deferred.
