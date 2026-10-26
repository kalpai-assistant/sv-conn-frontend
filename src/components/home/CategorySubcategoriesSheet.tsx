/**
 * SVC-290: the L1-tile → sub-categories picker.
 *
 * A user taps one of the seven illustrated L1 tiles on Home (Salon & Spa,
 * Cleaning & Pest Control, etc.); instead of a full-page navigation, this
 * sheet slides up showing the L1's sub-categories as an illustrated grid.
 * Tapping a sub-category closes the sheet and navigates to that L2's own
 * `/category/{slug}` — the existing services listing page, unchanged.
 *
 * Visually mirrors the old `SubCategoryPicker` (which used to render on
 * `/category/{L1-slug}` in Mode 1) — same 3-column grid of illustrated
 * tiles with the sub-cat name overlaid on a dark bottom gradient. This is
 * just that content, in a sheet, so the "pick a sub-category" step doesn't
 * cost a full page navigation.
 *
 * Mirrors AddAddressSheet's backdrop + slide-up motion pattern. Drag-to-
 * dismiss, backdrop tap, X button, and Android hardware back all close it.
 */
import { useEffect, useMemo } from "react";
import { motion } from "framer-motion";
import { Link } from "@tanstack/react-router";
import { X, Loader2, PackageOpen } from "lucide-react";
import { useLockBodyScroll } from "@/hooks/useLockBodyScroll";
import { useDragDismiss } from "@/hooks/useDragDismiss";
import { pushBackInterceptor } from "@/lib/back-interceptor";
import { useCategories } from "@/hooks/useApi";
import { categoryIcon, categoryColor } from "@/lib/category-icons";
import { subcategoryImage } from "@/lib/subcategory-images";
import { EmptyState } from "@/components/EmptyState";
import { ErrorState } from "@/components/ErrorState";

interface CategorySubcategoriesSheetProps {
  categoryId: string;
  onClose: () => void;
}

export function CategorySubcategoriesSheet({
  categoryId,
  onClose,
}: CategorySubcategoriesSheetProps) {
  useLockBodyScroll(true);

  const { data: categories, isLoading, isError, refetch } = useCategories();

  const category = categories?.find((c) => c.id === categoryId);
  const subCategories = useMemo(() => {
    if (!categories) return [];
    return categories
      .filter((c) => c.parentId === categoryId)
      .sort((a, b) => a.sortOrder - b.sortOrder);
  }, [categories, categoryId]);

  // Hardware-back closes the sheet before the router pops the page underneath.
  useEffect(
    () =>
      pushBackInterceptor(() => {
        onClose();
        return true;
      }),
    [onClose],
  );

  const drag = useDragDismiss(onClose);

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
        {...drag}
        className="fixed bottom-0 left-0 right-0 z-50 mx-auto flex max-h-[85vh] max-w-md flex-col rounded-t-3xl border-t border-border bg-card shadow-2xl safe-bottom"
      >
        {/* Drag handle — visual affordance for drag-to-dismiss. */}
        <div className="flex shrink-0 justify-center pt-3 pb-1">
          <div className="h-1 w-10 rounded-full bg-muted-foreground/30" />
        </div>

        <div className="flex h-12 shrink-0 items-center justify-between px-4">
          <h2 className="truncate text-base font-semibold text-foreground">
            {category?.name ?? "Categories"}
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
              <ErrorState message="Couldn't load categories." onRetry={refetch} />
            </div>
          ) : !category ? (
            <div className="px-4 py-8">
              <EmptyState
                icon={<PackageOpen aria-hidden="true" className="size-8" />}
                title="This category doesn't exist."
              />
            </div>
          ) : subCategories.length === 0 ? (
            <div className="px-4 py-8">
              <EmptyState
                icon={<PackageOpen aria-hidden="true" className="size-8" />}
                title={`No ${category.name.toLowerCase()} sub-categories yet`}
                description="We're adding more in your area soon."
              />
            </div>
          ) : (
            // 3-column grid of illustrated sub-cat tiles — matches the shape
            // the pre-SVC-290 SubCategoryPicker rendered on /category/{L1}.
            // Same fallback ladder for the tile: WebP illustration first,
            // Lucide icon on a tinted background if the illustration isn't
            // bundled yet.
            <div className="grid grid-cols-3 gap-3 px-4 pt-2">
              {subCategories.map((sub) => {
                const image = subcategoryImage(sub.slug);
                const SubIcon = categoryIcon(sub.slug);
                const tint = categoryColor(sub.sortOrder);
                return (
                  <Link
                    key={sub.id}
                    to="/category/$slug"
                    params={{ slug: sub.slug }}
                    onClick={onClose}
                    className="relative aspect-square overflow-hidden rounded-2xl border border-border"
                  >
                    {image ? (
                      <img
                        src={image}
                        alt=""
                        className="absolute inset-0 h-full w-full object-cover"
                        loading="lazy"
                        decoding="async"
                      />
                    ) : (
                      <div className="flex h-full w-full flex-col items-center justify-center gap-2 bg-card p-3">
                        <div
                          className="flex h-12 w-12 items-center justify-center rounded-xl"
                          style={{ backgroundColor: tint + "18" }}
                        >
                          <SubIcon className="h-5 w-5" style={{ color: tint }} />
                        </div>
                        <span className="text-center text-[11px] font-medium leading-tight text-foreground">
                          {sub.name}
                        </span>
                      </div>
                    )}
                    {image && (
                      <>
                        <div className="absolute inset-x-0 bottom-0 h-2/5 bg-gradient-to-t from-black/70 via-black/30 to-transparent" />
                        <span className="absolute inset-x-2 bottom-2 text-center text-[11px] font-bold text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)]">
                          {sub.name}
                        </span>
                      </>
                    )}
                  </Link>
                );
              })}
            </div>
          )}
        </div>
      </motion.div>
    </>
  );
}
