/**
 * SVC-290: the L1-tile → services picker.
 *
 * A user taps one of the seven illustrated L1 tiles on Home (Salon & Spa,
 * Cleaning & Pest Control, etc.); instead of a full-page navigation, this
 * sheet slides up listing every service under that L1, grouped by
 * sub-category. Tapping a service in the sheet still opens
 * `/service/$serviceId` — the existing detail page, where SVC-292 will add
 * related-services surfaces and SVC-293 the banner slot.
 *
 * Mirrors AddAddressSheet's backdrop + slide-up motion pattern rather than
 * the shadcn Sheet primitive because that pattern is what the app's other
 * sheets (Coupons, SlotPicker, AddressPicker, Search) already look like.
 * Drag-to-dismiss (framer-motion `drag="y"` with a downward constraint),
 * backdrop tap, X button, and Android hardware back all close it.
 */
import { useEffect, useMemo } from "react";
import { motion, useMotionValue, type PanInfo } from "framer-motion";
import { Link } from "@tanstack/react-router";
import { X, Clock, Loader2, PackageOpen } from "lucide-react";
import { useLockBodyScroll } from "@/hooks/useLockBodyScroll";
import { pushBackInterceptor } from "@/lib/back-interceptor";
import { useCategories, useServices } from "@/hooks/useApi";
import { EmptyState } from "@/components/EmptyState";
import { ErrorState } from "@/components/ErrorState";

interface CategoryServicesSheetProps {
  categoryId: string;
  onClose: () => void;
}

export function CategoryServicesSheet({ categoryId, onClose }: CategoryServicesSheetProps) {
  useLockBodyScroll(true);

  const {
    data: categories,
    isLoading: categoriesLoading,
    isError: categoriesError,
    refetch: refetchCategories,
  } = useCategories();
  const {
    data: services,
    isLoading: servicesLoading,
    isError: servicesError,
    refetch: refetchServices,
  } = useServices();

  const category = categories?.find((c) => c.id === categoryId);
  // L2s under this L1 in catalogue order — used both to filter services and
  // to render the section headings in the order the catalogue intends.
  const subCategories = useMemo(() => {
    if (!categories) return [];
    return categories
      .filter((c) => c.parentId === categoryId)
      .sort((a, b) => a.sortOrder - b.sortOrder);
  }, [categories, categoryId]);

  // Group services under each L2. A given service's `categoryId` points at an
  // L2 (services never hang directly off an L1 in the SVC-286 shape), so the
  // grouping is a per-L2 filter over the already-cached full services list.
  // Sorted by name within each group so users can scan alphabetically.
  const groups = useMemo(() => {
    if (!services) return [];
    return subCategories
      .map((sub) => ({
        subCategory: sub,
        services: services
          .filter((s) => s.categoryId === sub.id)
          .sort((a, b) => a.name.localeCompare(b.name)),
      }))
      .filter((g) => g.services.length > 0);
  }, [services, subCategories]);

  // Hardware-back closes the sheet before the router pops the page underneath.
  // Last-registered wins in `runBackInterceptors`, so nested sheets still get
  // back first.
  useEffect(
    () =>
      pushBackInterceptor(() => {
        onClose();
        return true;
      }),
    [onClose],
  );

  // Drag-to-dismiss: 100px offset OR >500px/s velocity closes. Numbers copied
  // from shadcn/ui's drawer-close heuristic.
  const y = useMotionValue(0);
  const handleDragEnd = (_: unknown, info: PanInfo) => {
    if (info.offset.y > 100 || info.velocity.y > 500) {
      onClose();
    }
  };

  const isLoading = categoriesLoading || servicesLoading;
  const isError = categoriesError || servicesError;

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
        {/* Drag handle — the visual affordance for the drag-to-dismiss
            gesture. iOS/Android users read this as "I can pull this down". */}
        <div className="flex shrink-0 justify-center pt-3 pb-1">
          <div className="h-1 w-10 rounded-full bg-muted-foreground/30" />
        </div>

        <div className="flex h-12 shrink-0 items-center justify-between px-4">
          <h2 className="truncate text-base font-semibold text-foreground">
            {category?.name ?? "Services"}
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

        <div className="flex-1 overflow-y-auto pb-6">
          {isLoading ? (
            <div className="flex flex-1 items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : isError ? (
            <div className="px-4 py-8">
              <ErrorState
                message="Couldn't load services."
                onRetry={() => {
                  void refetchCategories();
                  void refetchServices();
                }}
              />
            </div>
          ) : !category ? (
            <div className="px-4 py-8">
              <EmptyState icon={PackageOpen} title="This category doesn't exist." />
            </div>
          ) : groups.length === 0 ? (
            <div className="px-4 py-8">
              <EmptyState
                icon={PackageOpen}
                title={`No ${category.name.toLowerCase()} services yet`}
                subtitle="We're adding more in your area soon."
              />
            </div>
          ) : (
            <div className="flex flex-col gap-6 px-4 pt-2">
              {groups.map((group) => (
                <section key={group.subCategory.id}>
                  <h3 className="pb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    {group.subCategory.name}
                  </h3>
                  <ul className="flex flex-col gap-2">
                    {group.services.map((s) => (
                      <li key={s.id}>
                        <Link
                          to="/service/$serviceId"
                          params={{ serviceId: s.id }}
                          onClick={onClose}
                          className="flex items-center gap-3 rounded-xl border border-border/50 bg-card p-3"
                        >
                          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-accent text-base font-bold text-accent-foreground">
                            {s.name.charAt(0)}
                          </div>
                          <div className="flex min-w-0 flex-1 flex-col justify-center">
                            <p className="truncate text-sm font-semibold text-foreground">
                              {s.name}
                            </p>
                            {s.duration && (
                              <div className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                                <Clock className="h-3 w-3" />
                                {s.duration}
                              </div>
                            )}
                          </div>
                          <div className="flex flex-col items-end">
                            {/* "from" because `price` is the cheapest variant,
                                not a fixed charge. Matches ServiceCard. */}
                            <span className="text-[10px] text-muted-foreground">from</span>
                            <span className="text-sm font-bold text-primary">
                              ₹{s.price.toLocaleString("en-IN")}
                            </span>
                          </div>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
            </div>
          )}
        </div>
      </motion.div>
    </>
  );
}
