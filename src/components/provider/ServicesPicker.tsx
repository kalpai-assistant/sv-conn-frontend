import { useMemo, useState } from "react";
import { formatRupees } from "@/lib/currency";
import { toast } from "sonner";
import { AlertTriangle, ArrowLeft, Check, Loader2, Lock, Search, X } from "lucide-react";
import { ApiError } from "@/lib/api";
import { categoryIcon, categoryColor } from "@/lib/category-icons";
import {
  useCategories,
  useServices,
  useProviderServices,
  useToggleProviderService,
} from "@/hooks/useApi";

interface ServicesPickerProps {
  // When locked (e.g. KYC not yet verified) selection is disabled and a hint
  // is shown instead of letting the provider subscribe (SVC-93 Step 3).
  locked?: boolean;
  title?: string;
  description?: string;
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
 * - **Earnings, not prices.** A provider decides on what they take home, so
 *   cards read "from ₹349" against `variant.provider_payout`, never the
 *   customer price. Same "cheapest variant" rule the consumer side uses for
 *   `price`, in the currency that matters here.
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
  title = "Services I offer",
  description = "Pick the categories you work in, then the services you offer.",
}: ServicesPickerProps) {
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

  // 403 fallback for the unlocked (profile) usage; when `locked` we already block.
  const [kycBlocked, setKycBlocked] = useState(false);
  const [pendingId, setPendingId] = useState<string | null>(null);
  // Null = showing the category grid. Set = drilled into that category.
  const [openCategoryId, setOpenCategoryId] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  const subscribed = useMemo(() => new Set(subscribedIds), [subscribedIds]);

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
    toggle.mutate(
      { serviceId, subscribe },
      {
        onSuccess: () => setKycBlocked(false),
        onError: (err) => {
          if (err instanceof ApiError && err.status === 403) {
            setKycBlocked(true);
          } else {
            toast.error(err instanceof Error ? err.message : "Something went wrong");
          }
        },
        onSettled: () => setPendingId(null),
      },
    );
  };

  const loading = servicesLoading || subsLoading || catsLoading;
  const hasError = servicesError || subsError || catsError;
  const showingList = Boolean(trimmedQuery) || Boolean(openCategoryId);

  return (
    <section className="mt-6">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-base font-semibold text-foreground">{title}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{description}</p>
        </div>
        {subscribedIds.length > 0 && (
          <span className="shrink-0 rounded-full bg-primary/10 px-2.5 py-1 text-xs font-semibold text-primary">
            {subscribedIds.length} selected
          </span>
        )}
      </div>

      {locked && (
        <div className="mt-4 flex items-start gap-3 rounded-lg border border-amber-300 bg-amber-50 p-3">
          <Lock className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
          <p className="text-sm font-medium text-amber-900">
            Services unlock once your KYC is verified.
          </p>
        </div>
      )}

      {kycBlocked && !locked && (
        <div className="mt-4 flex items-start gap-3 rounded-lg border border-amber-300 bg-amber-50 p-3">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
          <p className="text-sm font-medium text-amber-900">
            Complete KYC to start receiving jobs.
          </p>
        </div>
      )}

      {loading && (
        <div className="mt-6 flex items-center justify-center py-8 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
        </div>
      )}

      {hasError && !loading && (
        <div className="mt-6 flex flex-col items-center gap-3 py-6 text-center">
          <p className="text-sm text-destructive">Couldn’t load your services.</p>
          <button
            type="button"
            onClick={() => {
              if (servicesError) refetchServices();
              if (subsError) refetchSubs();
              if (catsError) refetchCats();
            }}
            className="rounded-md bg-secondary px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-secondary/80"
          >
            Try again
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
              placeholder="Search services"
              aria-label="Search services"
              className="w-full rounded-xl border border-border bg-card py-2.5 pl-9 pr-9 text-sm text-foreground outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-primary"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery("")}
                aria-label="Clear search"
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
                const Icon = categoryIcon(cat.slug);
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
                  <ArrowLeft className="h-4 w-4" /> All categories
                </button>
              )}

              {openCategory && !trimmedQuery && (
                <h3 className="mt-3 text-sm font-semibold text-foreground">{openCategory.name}</h3>
              )}

              <ul className="mt-3 divide-y divide-border overflow-hidden rounded-xl border border-border">
                {visibleServices.map((service) => {
                  const isOn = subscribed.has(service.id);
                  const isPending = pendingId === service.id;
                  return (
                    <li key={service.id}>
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
                            {trimmedQuery ? `${service.categoryName} · ` : ""}
                            {/* Earnings, not the customer price. 0 means the
                                catalogue has priced no variant yet, and "from
                                ₹0" would be a worse answer than none. */}
                            {service.payout > 0
                              ? `from ${formatRupees(service.payout)}`
                              : "Payout not set"}
                          </span>
                        </span>
                      </button>
                    </li>
                  );
                })}

                {visibleServices.length === 0 && (
                  <li className="p-4 text-sm text-muted-foreground">
                    {trimmedQuery
                      ? `No services match “${query.trim()}”.`
                      : "No active services in this category."}
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
