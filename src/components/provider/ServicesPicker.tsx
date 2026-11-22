import { useEffect, useMemo, useRef, useState } from "react";
import { formatRupees } from "@/i18n/format";
import { errorText } from "@/i18n/errors";
import { useT } from "@/i18n/LanguageProvider";
import { toast } from "sonner";
import {
  AlertTriangle,
  ArrowLeft,
  Check,
  ChevronDown,
  Loader2,
  Lock,
  Search,
  X,
} from "lucide-react";
import { ApiError } from "@/lib/api";
import { Skeleton } from "@/components/ui/skeleton";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { VariantPriceRow } from "@/components/provider/VariantPriceRow";
import { LoadingRegion } from "@/components/skeletons/LoadingRegion";
import { TileGridSkeleton } from "@/components/skeletons/TileGridSkeleton";
import { categoryIcon, categoryColor } from "@/lib/category-icons";
import {
  useCategories,
  useServices,
  useProviderServices,
  useToggleProviderService,
  useMyPricing,
  type API_SpPricingResponse,
} from "@/hooks/useApi";

type PricingGroup = API_SpPricingResponse["services"][number];

interface ServicesPickerProps {
  // When locked (e.g. KYC not yet verified) selection is disabled and a hint
  // is shown instead of letting the provider subscribe (SVC-93 Step 3).
  locked?: boolean;
  title?: string;
  description?: string;
  // SVC-487: a service whose Prices panel to open and scroll to once the lists
  // load (a "variant_added" push tap, via /provider/profile?pricing=). Only
  // for a service the SP offers, and never while locked. `onPricingHandled`
  // runs once it has been dealt with either way, so the caller can drop the
  // param. Onboarding passes neither.
  openPricingFor?: string;
  // The new option's row to scroll to in that panel. The card is the fallback
  // when the row isn't there (switched off since, or unknown).
  openPricingVariant?: string;
  onPricingHandled?: () => void;
}

/**
 * "Services I offer" — browse the catalogue by category and tap to subscribe.
 *
 * Replaces the flat toggle list this used to be (SVC-258). That list rendered
 * every active service in one scroll, which the catalogue outgrew: there are
 * 363 of them, so a plumber scrolled past every cleaning, AC and salon service
 * to reach their own. It now mirrors the consumer's browse shape — category
 * grid, then that category's services — because both sides are picking from the
 * same catalogue and the provider's version had no reason to be a spreadsheet.
 *
 * Two deliberate differences from the consumer surface:
 *
 * - **The SP's own prices (SVC-412).** A subscribed card reads "Your price
 *   from ₹X" (its lowest price that is switched on) and opens a "Prices" panel
 *   below it, one row per active variant (`VariantPriceRow`). A card the SP
 *   hasn't taken reads "Platform price from ₹X", the cheapest active variant.
 *   The panel sits below the card's button, never inside it: a text box can't
 *   live inside a <button>. Subscribing opens it, because a new service starts
 *   unpriced and the SP isn't listed for it until it has a price.
 * - **Tap toggles immediately** rather than collecting into a Save button. The
 *   flow is two levels deep, so a batched save invites the trap where backing
 *   out of a category silently discards the selection. The existing per-item
 *   mutation is already optimistic with rollback, so each tap is instant and
 *   self-correcting, and no bulk endpoint is needed.
 *
 * Icons come from `lib/category-icons`, the same derivation the consumer grid
 * uses — the backend supplies no imagery for either side.
 */
export function ServicesPicker({
  locked = false,
  title,
  description,
  openPricingFor,
  openPricingVariant,
  onPricingHandled,
}: ServicesPickerProps) {
  const { t, lang } = useT("provider");
  const {
    data: services,
    isLoading: servicesLoading,
    isError: servicesError,
    refetch: refetchServices,
  } = useServices();
  const {
    data: categories,
    isLoading: catsLoading,
    isError: catsError,
    refetch: refetchCats,
  } = useCategories();
  const {
    data: subscribedIds = [],
    isLoading: subsLoading,
    isError: subsError,
    refetch: refetchSubs,
  } = useProviderServices();
  const toggle = useToggleProviderService();
  const pricing = useMyPricing();

  // 403 fallback for the unlocked (profile) usage; when `locked` we already block.
  const [kycBlocked, setKycBlocked] = useState(false);
  const [pendingId, setPendingId] = useState<string | null>(null);
  // Null = showing the category grid. Set = drilled into that category.
  const [openCategoryId, setOpenCategoryId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  // Services whose "Prices" panel is open.
  const [pricesOpen, setPricesOpen] = useState<ReadonlySet<string>>(() => new Set());

  const subscribed = useMemo(() => new Set(subscribedIds), [subscribedIds]);

  const pricingByService = useMemo(
    () => new Map((pricing.data?.services ?? []).map((g) => [g.service_id, g])),
    [pricing.data],
  );

  const setOpen = (serviceId: string, open: boolean) =>
    setPricesOpen((prev) => {
      const next = new Set(prev);
      if (open) next.add(serviceId);
      else next.delete(serviceId);
      return next;
    });

  // How many of this provider's subscriptions sit in each category, so a tile
  // can say "2 selected" without drilling in. Built once per data change rather
  // than filtering the 363-service list per tile.
  const selectedPerCategory = useMemo(() => {
    const counts = new Map<string, number>();
    for (const svc of services ?? []) {
      if (!subscribed.has(svc.id)) continue;
      counts.set(svc.categoryId, (counts.get(svc.categoryId) ?? 0) + 1);
    }
    return counts;
  }, [services, subscribed]);

  const trimmedQuery = query.trim().toLowerCase();

  // Search deliberately flattens both levels: someone who knows they fit
  // "geyser" should not have to guess whether it lives under Plumber or
  // Appliances. An empty query falls back to the two-step browse.
  const visibleServices = useMemo(() => {
    const all = services ?? [];
    if (trimmedQuery) {
      return all.filter(
        (s) =>
          s.name.toLowerCase().includes(trimmedQuery) ||
          s.categoryName.toLowerCase().includes(trimmedQuery),
      );
    }
    if (openCategoryId) return all.filter((s) => s.categoryId === openCategoryId);
    return [];
  }, [services, trimmedQuery, openCategoryId]);

  const openCategory = categories?.find((c) => c.id === openCategoryId);

  const handleToggle = (serviceId: string, subscribe: boolean) => {
    if (locked) return;
    setPendingId(serviceId);
    setOpen(serviceId, subscribe);
    toggle.mutate(
      { serviceId, subscribe },
      {
        onSuccess: () => setKycBlocked(false),
        onError: (err) => {
          if (subscribe) setOpen(serviceId, false);
          if (err instanceof ApiError && err.status === 403) {
            setKycBlocked(true);
          } else {
            toast.error(errorText(err, t("services.toggleFailed"), lang));
          }
        },
        onSettled: () => setPendingId(null),
      },
    );
  };

  // "Your price from ₹X" / "Set your prices" for a subscribed card, "Platform
  // price from ₹X" otherwise. `price` is the cheapest active variant's (0
  // when the catalogue priced none, where "from ₹0" would be wrong). Never
  // `provider_payout`: what the SP receives is shown per row, at its price.
  const cardSubtitle = (serviceId: string, platformFrom: number, isOn: boolean) => {
    if (!isOn) {
      return platformFrom > 0
        ? t("services.platformFrom", { amount: formatRupees(platformFrom, lang) })
        : null;
    }
    if (pricing.isPending) return null;
    const own = (pricingByService.get(serviceId)?.variants ?? []).flatMap((v) =>
      v.is_active === true && v.price_amount !== null ? [v.price_amount] : [],
    );
    return own.length > 0
      ? t("services.yourPriceFrom", { amount: formatRupees(Math.min(...own), lang) })
      : t("services.setPrices");
  };

  const loading = servicesLoading || subsLoading || catsLoading;
  const hasError = servicesError || subsError || catsError;
  const showingList = Boolean(trimmedQuery) || Boolean(openCategoryId);

  // SVC-487 deep-open. Decided once per requested service, after the catalogue
  // and the subscriptions have loaded (`subscribedIds` reads [] until then, so
  // an earlier check would call every service unsubscribed). The ref resets
  // when the caller clears the request, so a second push for the same service
  // opens it again.
  const handledPricingFor = useRef<string | null>(null);
  const [scrollTarget, setScrollTarget] = useState<{
    serviceId: string;
    variantId?: string;
  } | null>(null);
  const serviceRows = useRef(new Map<string, HTMLLIElement>());
  useEffect(() => {
    if (!openPricingFor) {
      handledPricingFor.current = null;
      return;
    }
    if (handledPricingFor.current === openPricingFor || loading) return;
    handledPricingFor.current = openPricingFor;
    const service = hasError ? undefined : services?.find((s) => s.id === openPricingFor);
    if (service && subscribed.has(service.id) && !locked) {
      setQuery("");
      setOpenCategoryId(service.categoryId);
      setOpen(service.id, true);
      setScrollTarget({ serviceId: service.id, variantId: openPricingVariant });
    }
    onPricingHandled?.();
    // setOpen and onPricingHandled are new each render; the ref makes this
    // one-shot, so they can't re-run it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openPricingFor, loading, hasError, services, subscribed, locked]);

  // Scrolled once the prices have settled, so it lands on the rows rather
  // than a skeleton that then grows (or on the error row with its Retry).
  // The new option's row is centred, never under the bottom nav; without it,
  // the card goes to the top.
  const pricingSettled = !pricing.isPending && !pricing.isFetching;
  useEffect(() => {
    if (!scrollTarget || !pricingSettled) return;
    // A frame later, so the panel has opened. Cleared inside the frame: clearing
    // it here would re-run this effect, whose cleanup cancels the frame.
    const frame = requestAnimationFrame(() => {
      const card = serviceRows.current.get(scrollTarget.serviceId);
      // Matched by value, not a selector: the id comes from a URL.
      const row = [...(card?.querySelectorAll<HTMLElement>("[data-variant-id]") ?? [])].find(
        (el) => el.dataset.variantId === scrollTarget.variantId,
      );
      if (row) row.scrollIntoView({ behavior: "smooth", block: "center" });
      else card?.scrollIntoView({ behavior: "smooth", block: "start" });
      setScrollTarget(null);
    });
    return () => cancelAnimationFrame(frame);
  }, [scrollTarget, pricingSettled]);

  return (
    <section className="mt-6">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-base font-semibold text-foreground">
            {title ?? t("services.title")}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {description ?? t("services.description")}
          </p>
        </div>
        {subscribedIds.length > 0 && (
          <span className="shrink-0 rounded-full bg-primary/10 px-2.5 py-1 text-xs font-semibold text-primary">
            {t("services.selected", { count: subscribedIds.length })}
          </span>
        )}
      </div>

      {locked && (
        <div className="mt-4 flex items-start gap-3 rounded-lg border border-amber-300 bg-amber-50 p-3">
          <Lock className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
          <p className="text-sm font-medium text-amber-900">{t("services.locked")}</p>
        </div>
      )}

      {kycBlocked && !locked && (
        <div className="mt-4 flex items-start gap-3 rounded-lg border border-amber-300 bg-amber-50 p-3">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
          <p className="text-sm font-medium text-amber-900">{t("services.kycBlocked")}</p>
        </div>
      )}

      {loading && (
        // What loads first is the search field and the category grid, so
        // that is what this stands in for (input: py-2.5 text-sm + border).
        <LoadingRegion>
          <Skeleton className="mt-4 h-[42px] w-full rounded-xl" />
          <TileGridSkeleton className="mt-4" />
        </LoadingRegion>
      )}

      {hasError && !loading && (
        <div className="mt-6 flex flex-col items-center gap-3 py-6 text-center">
          <p className="text-sm text-destructive">{t("services.loadFailed")}</p>
          <button
            type="button"
            onClick={() => {
              if (servicesError) refetchServices();
              if (subsError) refetchSubs();
              if (catsError) refetchCats();
            }}
            className="rounded-md bg-secondary px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-secondary/80"
          >
            {t("services.tryAgain")}
          </button>
        </div>
      )}

      {!loading && !hasError && (
        <>
          <div className="relative mt-4">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              // `type="text"` with a search inputMode, not `type="search"`:
              // the latter draws the browser's own clear button, which sat
              // next to ours and gave the field two ✕ controls.
              type="text"
              inputMode="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t("services.search")}
              aria-label={t("services.search")}
              className="w-full rounded-xl border border-border bg-card py-2.5 pl-9 pr-9 text-sm text-foreground outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-primary"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery("")}
                aria-label={t("services.clear")}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1.5 text-muted-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>

          {/* Category grid — only when not searching and not drilled in. */}
          {!showingList && (
            <div className="mt-4 grid grid-cols-3 gap-3">
              {(categories ?? []).map((cat) => {
                const Icon = categoryIcon(cat.slug, cat.iconKey);
                const tint = categoryColor(cat.sortOrder);
                const count = selectedPerCategory.get(cat.id) ?? 0;
                return (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => setOpenCategoryId(cat.id)}
                    className="relative flex aspect-square flex-col items-center justify-center gap-2 rounded-2xl border border-border bg-card p-3 text-center transition-colors focus-visible:ring-2 focus-visible:ring-primary"
                  >
                    <div
                      // Inline styling because the palette is arbitrary hex and
                      // can't be enumerated as Tailwind classes. `+ "18"` is a
                      // 9% alpha overlay, legible on both light and dark cards.
                      className="flex h-12 w-12 items-center justify-center rounded-xl"
                      style={{ backgroundColor: tint + "18" }}
                    >
                      <Icon className="h-5 w-5" style={{ color: tint }} />
                    </div>
                    <span className="text-[11px] font-medium leading-tight text-foreground">
                      {cat.name}
                    </span>
                    {count > 0 && (
                      <span className="absolute right-1.5 top-1.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold text-primary-foreground">
                        {count}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          )}

          {/* Service list — a drilled-into category, or search results. */}
          {showingList && (
            <>
              {openCategoryId && !trimmedQuery && (
                <button
                  type="button"
                  onClick={() => setOpenCategoryId(null)}
                  className="mt-4 flex items-center gap-1 text-sm font-semibold text-primary"
                >
                  <ArrowLeft className="h-4 w-4" /> {t("services.allCategories")}
                </button>
              )}

              {openCategory && !trimmedQuery && (
                <h3 className="mt-3 text-sm font-semibold text-foreground">{openCategory.name}</h3>
              )}

              <ul className="mt-3 divide-y divide-border overflow-hidden rounded-xl border border-border">
                {visibleServices.map((service) => {
                  const isOn = subscribed.has(service.id);
                  const isPending = pendingId === service.id;
                  const subtitle = cardSubtitle(service.id, service.price, isOn);
                  return (
                    <li
                      key={service.id}
                      ref={(el) => {
                        if (el) serviceRows.current.set(service.id, el);
                        else serviceRows.current.delete(service.id);
                      }}
                    >
                      <button
                        type="button"
                        disabled={locked || isPending}
                        aria-pressed={isOn}
                        onClick={() => handleToggle(service.id, !isOn)}
                        className="flex w-full items-center gap-3 p-4 text-left transition-colors disabled:opacity-60 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary"
                      >
                        <span
                          className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border ${
                            isOn
                              ? "border-primary bg-primary text-primary-foreground"
                              : "border-border bg-card"
                          }`}
                        >
                          {isPending ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            isOn && <Check className="h-3.5 w-3.5" />
                          )}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium text-foreground">
                            {service.name}
                          </span>
                          <span className="block truncate text-xs text-muted-foreground">
                            {[trimmedQuery ? service.categoryName : null, subtitle]
                              .filter(Boolean)
                              .join(" · ")}
                          </span>
                        </span>
                      </button>

                      {/* Locked (KYC not verified) shows no rows, in search
                          results too: the same card renders both. */}
                      {isOn && !locked && (
                        <Collapsible
                          open={pricesOpen.has(service.id)}
                          onOpenChange={(open) => setOpen(service.id, open)}
                        >
                          <CollapsibleTrigger asChild>
                            <button
                              type="button"
                              className="group flex w-full items-center justify-between border-t border-border px-4 py-2.5 text-xs font-semibold text-primary focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary"
                            >
                              {t("services.pricing.toggle")}
                              <ChevronDown
                                className="h-4 w-4 transition-transform group-data-[state=open]:rotate-180"
                                aria-hidden
                              />
                            </button>
                          </CollapsibleTrigger>
                          <CollapsibleContent>
                            <PricingRows
                              group={pricingByService.get(service.id)}
                              // Until the subscribe settles and the refetch
                              // brings the new service in.
                              loading={isPending || pricing.isPending || pricing.isFetching}
                              failed={pricing.isError}
                              onRetry={() => pricing.refetch()}
                            />
                          </CollapsibleContent>
                        </Collapsible>
                      )}
                    </li>
                  );
                })}

                {visibleServices.length === 0 && (
                  <li className="p-4 text-sm text-muted-foreground">
                    {trimmedQuery
                      ? t("services.noMatch", { query: query.trim() })
                      : t("services.noActive")}
                  </li>
                )}
              </ul>
            </>
          )}
        </>
      )}
    </section>
  );
}

/** The "Prices" panel of one subscribed service. */
function PricingRows({
  group,
  loading,
  failed,
  onRetry,
}: {
  group: PricingGroup | undefined;
  loading: boolean;
  failed: boolean;
  onRetry: () => void;
}) {
  const { t } = useT("provider");
  if (failed && !group) {
    return (
      <div className="flex items-center justify-between gap-3 border-t border-border px-4 py-3">
        <p className="text-xs text-destructive">{t("services.pricing.loadFailed")}</p>
        <button
          type="button"
          onClick={onRetry}
          className="shrink-0 rounded-md bg-secondary px-3 py-1.5 text-xs font-medium text-foreground"
        >
          {t("services.tryAgain")}
        </button>
      </div>
    );
  }
  if (!group && loading) {
    // Just subscribed: the pricing query is refetching to bring it in.
    return (
      <LoadingRegion>
        <div className="space-y-2 border-t border-border p-4">
          <Skeleton className="h-4 w-1/2" />
          <Skeleton className="h-9 w-full" />
        </div>
      </LoadingRegion>
    );
  }
  if (!group || group.variants.length === 0) {
    return (
      <p className="border-t border-border px-4 py-3 text-xs text-muted-foreground">
        {t("services.pricing.noVariants")}
      </p>
    );
  }
  return (
    <ul className="divide-y divide-border border-t border-border bg-muted/30">
      {group.variants.map((variant) => (
        <VariantPriceRow key={variant.variant_id} variant={variant} />
      ))}
    </ul>
  );
}
