/**
 * One category (SVC-430): its details, what it holds, and the edit form. Admin and
 * ops edit it, deactivate it (after a confirm; refused while it holds active
 * services or sub-categories) and activate it again. Support reads only.
 *
 * The slug is shown read-only: it keys the consumer app's URLs and icons, so it
 * never changes, whatever the name becomes.
 */
import { useState } from "react";
import { Link, createFileRoute } from "@tanstack/react-router";
import { Plus } from "lucide-react";
import { ActivePill, IconFact } from "@/components/catalog/CatalogBadges";
import { CatalogBackLink } from "@/components/catalog/CatalogBackLink";
import { CatalogTree } from "@/components/catalog/CatalogTree";
import { CategoryForm, ICON_HINT } from "@/components/catalog/CategoryForm";
import { DeactivateCategoryDialog } from "@/components/catalog/DeactivateDialogs";
import { EmptyState } from "@/components/EmptyState";
import { ErrorState } from "@/components/ErrorState";
import { LoadingState } from "@/components/LoadingState";
import { Fact, PageSection } from "@/components/teams/PageSection";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { ApiError } from "@/lib/api";
import { formatIst } from "@/lib/bookings";
import {
  CATALOG_PATH,
  canEditCatalog,
  catalogErrorMessage,
  categoryPath,
  findCategory,
  setCategoryActive,
  type CatalogTree as Tree,
  type CategoryDetail,
} from "@/lib/catalog";
import { useApiGet } from "@/lib/use-api-get";

export const Route = createFileRoute("/_authed/operator/catalog/categories/$categoryId")({
  component: CategoryPage,
});

const WRAP = "[overflow-wrap:anywhere]";

type Notice = { kind: "success" | "error"; text: string };

function CategoryPage() {
  const { categoryId } = Route.useParams();
  // Keyed, so nothing typed for one category shows under another.
  return <CategoryView key={categoryId} categoryId={categoryId} />;
}

function CategoryView({ categoryId }: { categoryId: string }) {
  const { admin } = Route.useRouteContext();
  const canEdit = canEditCatalog(admin.role);
  const detail = useApiGet<CategoryDetail>(categoryPath(categoryId));
  const tree = useApiGet<Tree>(CATALOG_PATH);
  const [confirming, setConfirming] = useState(false);
  const [activating, setActivating] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);
  const category = detail.status === "ready" ? detail.data : null;
  const categories = tree.status === "ready" ? tree.data.categories : null;
  const node = categories ? findCategory(categories, categoryId) : undefined;
  const parent =
    categories && category?.parent_id ? findCategory(categories, category.parent_id) : undefined;

  function refresh() {
    detail.refresh();
    tree.refresh();
  }

  if (
    detail.status === "error" &&
    detail.error instanceof ApiError &&
    detail.error.status === 404
  ) {
    return (
      <div className="space-y-6">
        <CatalogBackLink />
        <EmptyState message="No such category." detail="The link may be wrong." />
      </div>
    );
  }

  async function activate(current: CategoryDetail) {
    if (activating) return;
    setActivating(true);
    setNotice(null);
    try {
      const row = await setCategoryActive(current.id, true);
      setNotice({ kind: "success", text: `${row.name} is active again. Customers can see it.` });
      refresh();
    } catch (err) {
      setNotice({ kind: "error", text: catalogErrorMessage(err) });
    } finally {
      setActivating(false);
    }
  }

  const loading = detail.status === "loading" || tree.status === "loading";
  const failed = detail.status === "error" || tree.status === "error";

  return (
    <div className="space-y-6">
      <CatalogBackLink />

      {loading && !failed && <LoadingState rows={3} />}
      {failed && (
        <ErrorState
          message="Couldn't load this category."
          onRetry={() => {
            detail.retry();
            tree.retry();
          }}
        />
      )}

      {category && categories && (
        <>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0 space-y-2">
              <h1 className={`text-2xl font-semibold tracking-tight ${WRAP}`}>{category.name}</h1>
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <ActivePill active={category.is_active} />
                <span className="text-muted-foreground">
                  {parent ? `Sub-category of ${parent.name}` : "Top-level (home tile)"}
                </span>
              </div>
              <p className="text-xs text-muted-foreground">
                Created {formatIst(category.created_at)} (IST)
              </p>
            </div>
            {canEdit && (
              <div className="flex flex-wrap gap-2">
                {category.parent_id === null && category.service_count === 0 && (
                  <Button asChild variant="outline">
                    <Link to="/operator/catalog/categories/new" search={{ parent: category.id }}>
                      <Plus aria-hidden="true" />
                      Sub-category
                    </Link>
                  </Button>
                )}
                {category.subcategory_count === 0 && (
                  <Button asChild variant="outline">
                    <Link to="/operator/catalog/services/new" search={{ category: category.id }}>
                      <Plus aria-hidden="true" />
                      Service
                    </Link>
                  </Button>
                )}
                {category.is_active ? (
                  <Button variant="outline" onClick={() => setConfirming(true)}>
                    Deactivate
                  </Button>
                ) : (
                  <Button disabled={activating} onClick={() => activate(category)}>
                    {activating ? "Activating…" : "Activate"}
                  </Button>
                )}
              </div>
            )}
          </div>

          {notice && (
            <Alert
              variant={notice.kind === "error" ? "destructive" : "default"}
              role={notice.kind === "error" ? "alert" : "status"}
              className={notice.kind === "success" ? "border-success/40 bg-success/10" : ""}
            >
              <AlertDescription className={WRAP}>{notice.text}</AlertDescription>
            </Alert>
          )}

          <div className="grid items-start gap-4 lg:grid-cols-2">
            <PageSection title="Details">
              <dl className="grid gap-3 sm:grid-cols-2">
                <Fact label="Slug">
                  <span className="font-mono">{category.slug}</span>
                  <span className="block text-xs text-muted-foreground">
                    Made from the name at create. It never changes: the consumer app's links use it.
                  </span>
                </Fact>
                <Fact label="Sort order">
                  <span className="tabular-nums">{category.sort_order}</span>
                </Fact>
                <Fact label="Sub-categories">
                  <span className="tabular-nums">
                    {category.active_subcategory_count} active of {category.subcategory_count}
                  </span>
                </Fact>
                <Fact label="Services">
                  <span className="tabular-nums">
                    {category.active_service_count} active of {category.service_count}
                  </span>
                </Fact>
                {!canEdit && (
                  <Fact label="Icon">
                    <IconFact iconKey={category.icon_key} />
                    <span className="block text-xs text-muted-foreground">{ICON_HINT}</span>
                  </Fact>
                )}
              </dl>
            </PageSection>
            {canEdit && (
              <PageSection title="Edit">
                <CategoryForm
                  mode="edit"
                  detail={category}
                  categories={categories}
                  onSaved={() => {
                    setNotice(null);
                    refresh();
                  }}
                />
              </PageSection>
            )}
          </div>

          {node && (node.children.length > 0 || node.services.length > 0) && (
            <PageSection title="Contents">
              <CatalogTree categories={[node]} />
            </PageSection>
          )}

          {canEdit && confirming && (
            <DeactivateCategoryDialog
              category={category}
              open
              onClose={() => setConfirming(false)}
              onDeactivated={(row) => {
                setConfirming(false);
                setNotice({
                  kind: "success",
                  text: `${row.name} is deactivated. Customers no longer see it.`,
                });
                refresh();
              }}
            />
          )}
        </>
      )}
    </div>
  );
}
