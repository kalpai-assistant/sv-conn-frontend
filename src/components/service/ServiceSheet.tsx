/**
 * SVC-290: the service detail as a bottom sheet.
 *
 * Previously a dedicated `/service/$serviceId` route. The route still exists
 * as a redirect for shared deep-links (see `routes/service.$serviceId.tsx`),
 * but the primary path is now a card tap that slides this sheet up over
 * whatever page the user is on — Home, category listing, search results.
 *
 * Add-to-cart is the ONLY affordance that puts something in the cart. Card
 * taps used to be ambiguous ("did I open the service or add it?"); a card is
 * now purely a preview trigger, and the button in here is the commit.
 *
 * SVC-292 layers the three related-services sections below the trust
 * statements: "You might also like" (cross-domain hook rail), "Add these
 * too" (obvious same-context upsell rail), "More like this" (similar
 * services list). Rails use `ServiceCardCompact`; list uses `ServiceCard`.
 * Every entry taps to `openService(newId)` — no sheet stack, the sheet's
 * body swaps to the new service. `useEffect` on `serviceId` change resets
 * the scroll position + variant selection so the swap reads as a fresh
 * detail view.
 *
 * Mirrors AddAddressSheet's backdrop + slide-up motion pattern rather than
 * the shadcn Sheet primitive because that pattern is what the app's other
 * sheets (Coupons, SlotPicker, AddressPicker, Search) already look like.
 * Drag-to-dismiss is real: framer-motion's `drag="y"` with a downward-only
 * constraint. Backdrop tap + hardware back also close it.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { motion, useMotionValue, type PanInfo } from "framer-motion";
import { useNavigate } from "@tanstack/react-router";
import {
  X,
  ShieldCheck,
  LockKeyhole,
  Clock,
  Loader2,
  Check,
  ChevronDown,
  CircleX,
} from "lucide-react";
import { useLockBodyScroll } from "@/hooks/useLockBodyScroll";
import { pushBackInterceptor } from "@/lib/back-interceptor";
import { useCategories, useServices, useServiceDetail } from "@/hooks/useApi";
import type { UI_RelatedServiceEntry } from "@/hooks/useApi";
import { useCart } from "@/lib/cart-context";
import type { Service } from "@/lib/mock-data";
import { VariantPicker } from "@/components/service/VariantPicker";
import { ServiceBanner } from "@/components/service/ServiceBanner";
import { ErrorState } from "@/components/ErrorState";
import { ServiceCard } from "@/components/ServiceCard";
import { ServiceCardCompact } from "@/components/home/ServiceCardCompact";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { formatRupees } from "@/lib/currency";

interface ServiceSheetProps {
  serviceId: string;
  onClose: () => void;
}

export function ServiceSheet({ serviceId, onClose }: ServiceSheetProps) {
  useLockBodyScroll(true);

  const navigate = useNavigate();
  const { data: services, isLoading, isError, refetch } = useServices();
  const { data: categories } = useCategories();
  const { data: detail } = useServiceDetail(serviceId);
  const related = detail?.related;
  const service = services?.find((s) => s.id === serviceId);
  const cart = useCart();

  // Undefined until the catalogue resolves, then defaulted to the first
  // variant in render. Deliberately not seeded from `service` in an effect:
  // the service arrives asynchronously, and a null-selection render would
  // flash the CTA with no price.
  const [selectedVariantId, setSelectedVariantId] = useState<string | undefined>(undefined);

  // Reset per-service state when the sheet swaps (SVC-292 — tapping a
  // related-service card calls openService(newId) which re-renders this
  // component with a new prop). Without this the second service opens with
  // the first service's variant pre-selected and scrolled halfway down.
  const bodyRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    setSelectedVariantId(undefined);
    bodyRef.current?.scrollTo({ top: 0, behavior: "instant" as ScrollBehavior });
  }, [serviceId]);

  // Android hardware back closes the sheet before the router pops the page
  // underneath. Push-then-cleanup keeps this scoped to the mounted lifetime;
  // last-registered wins in `runBackInterceptors`, so a sheet on top of a
  // sheet still claims back first.
  useEffect(
    () =>
      pushBackInterceptor(() => {
        onClose();
        return true;
      }),
    [onClose],
  );

  const variants = service?.variants ?? [];
  // Match the backend fallback — a user who never touches the picker gets
  // exactly what they were getting before, at the price the sheet shows them.
  const selectedVariant = variants.find((v) => v.id === selectedVariantId) ?? variants[0];

  // Cart holds at most one line per service (uix_booking_item_service). Three
  // CTA states: not added, added with THIS variant, added with a different one.
  const cartLine = service ? cart.items.find((i) => i.serviceId === service.id) : undefined;
  const inCart = !!cartLine && cartLine.variantId === selectedVariant?.id;
  const inCartAsOtherVariant = !!cartLine && cartLine.variantId !== selectedVariant?.id;

  const ctaPrice = selectedVariant?.price ?? service?.price ?? 0;

  const handleAddToCart = () => {
    if (!service) return;
    cart.add(service, 1, selectedVariant?.id);
  };

  const handleGoToCart = () => {
    onClose();
    void navigate({ to: "/cart" });
  };

  // Drag-to-dismiss: framer-motion drags the sheet by `y`, snap back if the
  // gesture is short and slow, close if it's long or fast. Numbers copied from
  // the drawer-close heuristic in shadcn/ui: 100px OR >500px/s.
  const y = useMotionValue(0);
  const handleDragEnd = (_: unknown, info: PanInfo) => {
    if (info.offset.y > 100 || info.velocity.y > 500) {
      onClose();
    }
  };

  // Resolve related entries → full Service objects from the cached catalogue
  // so the rails / list can reuse ServiceCard(Compact). An entry not in the
  // cache is a soft-deleted service (the backend already filters is_active in
  // the WHERE clause; a race with a fresh deletion would show here as a miss)
  // — dropped silently rather than rendering a partial card.
  const hookServices = useMemo(
    () => resolveRelated(related?.hook ?? [], services),
    [related, services],
  );
  const upsellServices = useMemo(
    () => resolveRelated(related?.upsell ?? [], services),
    [related, services],
  );
  const relatedServices = useMemo(
    () => resolveRelated(related?.related ?? [], services),
    [related, services],
  );

  return (
    <>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm"
      />
      <motion.div
        initial={{ y: "100%" }}
        animate={{ y: 0 }}
        exit={{ y: "100%" }}
        transition={{ type: "spring", damping: 25, stiffness: 200 }}
        drag="y"
        dragConstraints={{ top: 0, bottom: 0 }}
        dragElastic={{ top: 0, bottom: 0.4 }}
        onDragEnd={handleDragEnd}
        style={{ y }}
        className="fixed bottom-0 left-0 right-0 z-50 mx-auto flex h-[85vh] max-w-md flex-col rounded-t-3xl border-t border-border bg-card shadow-2xl safe-bottom"
      >
        {/* Drag handle. Visual affordance for the drag-to-dismiss gesture —
            iOS/Android users read this as "I can pull this down". */}
        <div className="flex shrink-0 justify-center pt-3 pb-1">
          <div className="h-1 w-10 rounded-full bg-muted-foreground/30" />
        </div>

        <div className="flex h-12 shrink-0 items-center justify-between px-4">
          <h2 className="truncate text-base font-semibold text-foreground">
            {service?.name ?? "Service"}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-2 hover:bg-secondary"
            aria-label="Close"
          >
            <X className="h-5 w-5 text-muted-foreground" />
          </button>
        </div>

        {isLoading ? (
          <div className="flex flex-1 items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : isError ? (
          <div className="flex flex-1 items-center justify-center px-4">
            <ErrorState message="Couldn't load this service." onRetry={refetch} />
          </div>
        ) : !service ? (
          <div className="flex flex-1 items-center justify-center px-4">
            <p className="text-sm text-muted-foreground">Service not found.</p>
          </div>
        ) : (
          <>
            {/* Scrollable body — leaves room for the sticky CTA below. */}
            <div ref={bodyRef} className="flex-1 overflow-y-auto pb-4">
              {/* SVC-293 banner slot. Full-bleed, no horizontal padding —
                  the sheet's rounded corners at the top already crop it
                  cleanly. Falls through a 5-state chain (video → image →
                  sub-cat tile → L1 tile → colour block) so partial
                  coverage renders intentionally. */}
              <ServiceBanner service={service} categories={categories} />
              <div className="px-4 pt-4">
                <div className="rounded-xl border border-border bg-card p-4">
                  <h3 className="text-lg font-semibold text-foreground">{service.name}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                    {service.description}
                  </p>
                  <div className="mt-4 flex items-center justify-between">
                    <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                      <Clock className="h-4 w-4" />
                      {selectedVariant?.duration ?? service.duration}
                    </div>
                    <span className="text-xl font-bold text-primary">
                      {variants.length > 1 && (
                        <span className="mr-1 text-xs font-medium text-muted-foreground">from</span>
                      )}
                      {formatRupees(service.price)}
                    </span>
                  </div>
                </div>
              </div>

              {variants.length > 1 && (
                <VariantPicker
                  variants={variants}
                  selectedId={selectedVariant?.id}
                  onSelect={setSelectedVariantId}
                />
              )}

              <div className="px-4 pt-5">
                <div className="rounded-xl border border-border bg-card p-4">
                  <div className="flex items-start gap-3">
                    <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent">
                      <ShieldCheck className="h-4 w-4 text-primary" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-foreground">
                        KYC-verified professionals
                      </p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        Every service pro on EazyServ has passed our identity + document check.
                      </p>
                    </div>
                  </div>
                  <div className="mt-4 flex items-start gap-3">
                    <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent">
                      <LockKeyhole className="h-4 w-4 text-primary" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-foreground">Doorstep OTP required</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        Service starts only after you share a 4-digit OTP at your door.
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {/* SVC-341 scope clarity. Below the trust card rather than
                  under the description: these arrive with the detail
                  response, same as the rails, so landing here moves nothing
                  already on screen — the variant picker never shifts under a
                  finger mid-tap. Nothing renders while the query is loading
                  or when the service has none. */}
              <StepsSection steps={detail?.steps ?? []} />
              <ExclusionsSection exclusions={detail?.exclusions ?? []} />

              {/* SVC-292 related surfaces. Section titles are human — the
                  ticket calls out "Hooks / Upsells / Related" as internal
                  terminology that must not bleed into UI. Empty sections
                  render nothing (no placeholder), per the ticket. */}
              <RelatedRail
                title="You might also like"
                services={hookServices}
                categories={categories}
              />
              <RelatedRail
                title="Add these too"
                services={upsellServices}
                categories={categories}
              />
              <RelatedList title="More like this" services={relatedServices} />
            </div>

            {/* Sticky CTA — the sole add-to-cart affordance now. */}
            <div className="shrink-0 border-t border-border bg-card p-4">
              {inCart ? (
                <div className="flex flex-col gap-2">
                  <div className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-success/10 text-sm font-medium text-success">
                    <Check className="h-4 w-4" /> Added to your cart
                  </div>
                  <button
                    type="button"
                    onClick={handleGoToCart}
                    className="flex h-14 w-full items-center justify-center rounded-xl bg-primary text-base font-semibold text-primary-foreground"
                  >
                    Go to cart →
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={handleAddToCart}
                  className="flex h-14 w-full items-center justify-center rounded-xl bg-primary text-base font-semibold text-primary-foreground"
                >
                  {/* "Update" not "Add" when the service is already in the cart
                      under another variant — tapping replaces the choice, it
                      does not add a second line. */}
                  {inCartAsOtherVariant ? "Update to" : "Add to cart —"} {formatRupees(ctaPrice)}
                </button>
              )}
            </div>
          </>
        )}
      </motion.div>
    </>
  );
}

/**
 * "What's involved" — the service's steps, numbered, collapsed by default so
 * the sheet stays scannable. The header carries a count hint so a collapsed
 * section still says how much is behind it. Radix Collapsible unmounts the
 * list while closed and animates nothing, so there is no inner overflow box
 * for an Android WebView to trap the sheet's scroll in.
 */
function StepsSection({ steps }: { steps: string[] }) {
  if (steps.length === 0) return null;
  return (
    <section className="px-4 pt-5">
      <Collapsible className="rounded-xl border border-border bg-card">
        <h4>
          <CollapsibleTrigger className="group flex w-full items-center justify-between gap-3 p-4 text-left">
            <span className="text-sm font-semibold text-foreground">
              What's involved
              <span className="ml-2 text-xs font-normal text-muted-foreground">
                {steps.length} {steps.length === 1 ? "step" : "steps"}
              </span>
            </span>
            <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-data-[state=open]:rotate-180" />
          </CollapsibleTrigger>
        </h4>
        <CollapsibleContent>
          <ol className="flex flex-col gap-3 px-4 pb-4">
            {steps.map((step, i) => (
              <li key={i} className="flex items-start gap-3">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent text-xs font-semibold text-primary">
                  {i + 1}
                </span>
                <span className="pt-0.5 text-sm text-foreground">{step}</span>
              </li>
            ))}
          </ol>
        </CollapsibleContent>
      </Collapsible>
    </section>
  );
}

/**
 * "Not included" — always open, because this is the list that heads off the
 * "why wasn't this done?" dispute. Amber, not red: it is a heads-up, not an
 * error. Same amber + dark: pairing InstallSheet and the download page use;
 * the theme has no warning token of its own.
 */
function ExclusionsSection({ exclusions }: { exclusions: string[] }) {
  if (exclusions.length === 0) return null;
  return (
    <section className="px-4 pt-5">
      <div className="rounded-xl border border-amber-400/40 bg-amber-50 p-4 dark:bg-amber-950/40">
        <h4 className="text-sm font-semibold text-amber-900 dark:text-amber-100">Not included</h4>
        <ul className="mt-3 flex flex-col gap-2">
          {exclusions.map((item, i) => (
            <li
              key={i}
              className="flex items-start gap-2 text-sm text-amber-900 dark:text-amber-100"
            >
              <CircleX
                className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400"
                aria-hidden
              />
              {item}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

/**
 * Resolve `{ id }`-shaped related entries against the cached catalogue.
 *
 * The API bucket carries only `{id, name, price, sortOrder}` per entry — enough
 * for the sheet to render a rail without a second request, but not enough to
 * plug into `ServiceCard` (which reads variants for the quick-add pill). Cross-
 * reference against the already-cached `useServices` list to get the full
 * `Service`; an entry not in the cache (soft-deleted between the seed and
 * this fetch) is skipped rather than rendering a partial card.
 *
 * Preserves the API's ordering — the entries are already sorted by
 * `sort_order` on the backend, and the lookup respects that ordering as it
 * walks the input list.
 */
function resolveRelated(
  entries: UI_RelatedServiceEntry[],
  services: Service[] | undefined,
): Service[] {
  if (!services || entries.length === 0) return [];
  const byId = new Map(services.map((s) => [s.id, s]));
  const out: Service[] = [];
  for (const entry of entries) {
    const full = byId.get(entry.id);
    if (full) out.push(full);
  }
  return out;
}

/**
 * Horizontal snap-scroll rail — the shape `CategoryRail` / `PromoCarousel`
 * already use. Kept inline so ServiceSheet is the one file to edit when a
 * fourth related surface lands, and so the "empty section renders nothing"
 * invariant is co-located with the section that would otherwise render it.
 */
function RelatedRail({
  title,
  services,
  categories,
}: {
  title: string;
  services: Service[];
  categories: ReturnType<typeof useCategories>["data"];
}) {
  if (services.length === 0) return null;
  return (
    <section className="pt-5">
      <h4 className="px-4 pb-3 text-base font-semibold text-foreground">{title}</h4>
      <div className="flex snap-x snap-mandatory gap-3 overflow-x-auto pl-4 scrollbar-none">
        {services.map((s) => {
          const cat = categories?.find((c) => c.id === s.categoryId);
          return (
            <ServiceCardCompact
              key={s.id}
              service={s}
              categorySlug={cat?.slug}
              categorySortOrder={cat?.sortOrder}
            />
          );
        })}
        {/* Trailing gutter so the last card's edge shadow isn't clipped and
            the swipe-past feels intentional — same trick as BookAgainRow. */}
        <div className="w-4 shrink-0" aria-hidden />
      </div>
    </section>
  );
}

/** Vertical list — mirrors the layout `/category/{L2-slug}` renders under
 *  services. Ticket calls for the existing `ServiceCard` here rather than a
 *  bespoke list card, so a service on this list looks identical to a service
 *  on its category page. */
function RelatedList({ title, services }: { title: string; services: Service[] }) {
  if (services.length === 0) return null;
  return (
    <section className="pt-5">
      <h4 className="px-4 pb-3 text-base font-semibold text-foreground">{title}</h4>
      <div className="flex flex-col gap-3 px-4">
        {services.map((s) => (
          <ServiceCard key={s.id} service={s} />
        ))}
      </div>
    </section>
  );
}
