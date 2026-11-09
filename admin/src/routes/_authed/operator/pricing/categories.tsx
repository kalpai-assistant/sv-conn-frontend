/**
 * The categories tab (SVC-428): every category's pricing columns, edited one
 * cell at a time. Each save is one PATCH and one audit row; there is no
 * "save all" on purpose (ticket: bulk saves blur attribution).
 */
import { createFileRoute } from "@tanstack/react-router";
import { EmptyState } from "@/components/EmptyState";
import { ErrorState } from "@/components/ErrorState";
import { LoadingState } from "@/components/LoadingState";
import { CategoryPricingTable } from "@/components/pricing/CategoryPricingTable";
import { useCategoryRows } from "@/components/pricing/use-category-rows";
import { CATEGORIES_PATH, canEditPricing, type CategoryPricingRow } from "@/lib/pricing";
import { useApiGet } from "@/lib/use-api-get";

export const Route = createFileRoute("/_authed/operator/pricing/categories")({
  component: CategoriesTab,
});

function CategoriesTab() {
  const { admin } = Route.useRouteContext();
  const list = useApiGet<CategoryPricingRow[]>(CATEGORIES_PATH);
  const canEdit = canEditPricing(admin.role);

  return (
    <section aria-label="Category pricing" className="min-w-0 space-y-3">
      <p className="text-sm text-muted-foreground">
        {canEdit
          ? "Click a value to change it. Enter or clicking away saves; Esc cancels. Ticking Sensitive asks for its bounds."
          : "Read only: your role can view pricing but not change it."}
      </p>
      {list.status === "loading" && <LoadingState rows={8} />}
      {list.status === "error" && (
        <ErrorState message="Couldn't load the categories." onRetry={list.retry} />
      )}
      {list.status === "ready" && list.data.length === 0 && (
        <EmptyState message="No categories yet." />
      )}
      {list.status === "ready" && list.data.length > 0 && (
        <CategoryEditor initial={list.data} canEdit={canEdit} />
      )}
    </section>
  );
}

function CategoryEditor({ initial, canEdit }: { initial: CategoryPricingRow[]; canEdit: boolean }) {
  const { rows, errors, save } = useCategoryRows(initial);
  return <CategoryPricingTable rows={rows} canEdit={canEdit} errors={errors} onSave={save} />;
}
