/**
 * One service (SVC-430): its details, the edit form and its variants (read-only:
 * variants are edited elsewhere). Admin and ops edit it, deactivate it and
 * activate it again. Support reads only.
 *
 * Deactivating with bookings in flight warns first and needs a second click
 * (ticket): those bookings carry on, only new ones are refused.
 */
import { useState } from "react";
import { Link, createFileRoute } from "@tanstack/react-router";
import { ActivePill, IconFact } from "@/components/catalog/CatalogBadges";
import { CatalogBackLink } from "@/components/catalog/CatalogBackLink";
import { DeactivateServiceDialog } from "@/components/catalog/DeactivateDialogs";
import { ServiceForm } from "@/components/catalog/ServiceForm";
import { EmptyState } from "@/components/EmptyState";
import { ErrorState } from "@/components/ErrorState";
import { LoadingState } from "@/components/LoadingState";
import { Fact, PageSection } from "@/components/teams/PageSection";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ApiError } from "@/lib/api";
import { formatIst } from "@/lib/bookings";
import {
  CATALOG_PATH,
  activateService,
  bookingsLabel,
  canEditCatalog,
  catalogErrorMessage,
  durationLabel,
  findCategory,
  priceLabel,
  servicePath,
  unitLabel,
  variantsLabel,
  type CatalogTree as Tree,
  type ServiceDetail,
  type ServiceVariantRow,
} from "@/lib/catalog";
import { MarkdownView } from "@/lib/markdown-view";
import { formatRupees } from "@/lib/money";
import { useApiGet } from "@/lib/use-api-get";

export const Route = createFileRoute("/_authed/operator/catalog/services/$serviceId")({
  component: ServicePage,
});

const WRAP = "[overflow-wrap:anywhere]";

type Notice = { kind: "success" | "error"; text: string };

function ServicePage() {
  const { serviceId } = Route.useParams();
  return <ServiceView key={serviceId} serviceId={serviceId} />;
}

function ServiceView({ serviceId }: { serviceId: string }) {
  const { admin } = Route.useRouteContext();
  const canEdit = canEditCatalog(admin.role);
  const detail = useApiGet<ServiceDetail>(servicePath(serviceId));
  const tree = useApiGet<Tree>(CATALOG_PATH);
  const [confirming, setConfirming] = useState(false);
  const [activating, setActivating] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);
  const service = detail.status === "ready" ? detail.data : null;
  const categories = tree.status === "ready" ? tree.data.categories : null;
  const category =
    categories && service ? findCategory(categories, service.category_id) : undefined;

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
        <EmptyState message="No such service." detail="The link may be wrong." />
      </div>
    );
  }

  async function activate(current: ServiceDetail) {
    if (activating) return;
    setActivating(true);
    setNotice(null);
    try {
      const row = await activateService(current.id);
      setNotice({ kind: "success", text: `${row.name} is active again. Customers can book it.` });
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
          message="Couldn't load this service."
          onRetry={() => {
            detail.retry();
            tree.retry();
          }}
        />
      )}

      {service && categories && (
        <>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0 space-y-2">
              <h1 className={`text-2xl font-semibold tracking-tight ${WRAP}`}>{service.name}</h1>
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <ActivePill active={service.is_active} />
                <span className="text-muted-foreground tabular-nums">{priceLabel(service)}</span>
                {category && (
                  <Link
                    to="/operator/catalog/categories/$categoryId"
                    params={{ categoryId: category.id }}
                    className={`text-primary underline-offset-2 hover:underline ${WRAP}`}
                  >
                    {category.name}
                  </Link>
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                Created {formatIst(service.created_at)} · updated {formatIst(service.updated_at)}{" "}
                (IST)
              </p>
            </div>
            {canEdit &&
              (service.is_active ? (
                <Button variant="outline" onClick={() => setConfirming(true)}>
                  Deactivate
                </Button>
              ) : (
                <Button disabled={activating} onClick={() => activate(service)}>
                  {activating ? "Activating…" : "Activate"}
                </Button>
              ))}
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
            <div className="min-w-0 space-y-4">
              <PageSection title="Details">
                <dl className="grid gap-3 sm:grid-cols-2">
                  <Fact label="Active bookings">
                    <span className="tabular-nums">{bookingsLabel(service.active_bookings)}</span>
                  </Fact>
                  <Fact label="Variants">
                    <span className="tabular-nums">
                      {variantsLabel(service.active_variant_count)}
                    </span>
                    {service.active_variant_count === 0 && (
                      <span className="block text-xs text-muted-foreground">
                        It books at its base price.
                      </span>
                    )}
                  </Fact>
                  {!canEdit && (
                    <>
                      <Fact label="Price unit">{unitLabel(service.price_unit)}</Fact>
                      <Fact label="Duration">{durationLabel(service.duration_minutes)}</Fact>
                      <Fact label="Icon">
                        <IconFact iconKey={service.icon_key} />
                      </Fact>
                    </>
                  )}
                </dl>
                {!canEdit && (
                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground">Description</p>
                    {service.description?.trim() ? (
                      <MarkdownView
                        source={service.description}
                        className="space-y-2 text-sm leading-relaxed"
                      />
                    ) : (
                      <p className="text-sm text-muted-foreground">None.</p>
                    )}
                  </div>
                )}
              </PageSection>
              <PageSection title="Variants">
                <Variants variants={service.variants} />
              </PageSection>
            </div>
            {canEdit && (
              <PageSection title="Edit">
                <ServiceForm
                  mode="edit"
                  detail={service}
                  categories={categories}
                  onSaved={() => {
                    setNotice(null);
                    refresh();
                  }}
                />
              </PageSection>
            )}
          </div>

          {canEdit && confirming && (
            <DeactivateServiceDialog
              service={service}
              open
              onClose={() => setConfirming(false)}
              onDeactivated={(row) => {
                setConfirming(false);
                setNotice({
                  kind: "success",
                  text: `${row.name} is deactivated. Customers can no longer book it.`,
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

/** Read-only: variants are edited elsewhere. Stacked rows, so phone width needs no table. */
function Variants({ variants }: { variants: ServiceVariantRow[] }) {
  if (variants.length === 0) {
    return <p className="text-sm text-muted-foreground">No variants.</p>;
  }
  const sorted = [...variants].sort((a, b) => a.sort_order - b.sort_order);
  return (
    <div className="@container">
      <ul aria-label="Variants" className="divide-y rounded-md border @xl:hidden">
        {sorted.map((variant) => (
          <li
            key={variant.id}
            className={`space-y-0.5 px-3 py-2 text-sm ${variant.is_active ? "" : "opacity-60"}`}
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className={WRAP}>{variant.label}</span>
              <span className="tabular-nums">{formatRupees(variant.base_price)}</span>
            </div>
            <p className="text-xs text-muted-foreground">
              {[
                variant.subcategory,
                variant.duration_minutes ? durationLabel(variant.duration_minutes) : null,
                variant.is_active ? null : "Inactive",
              ]
                .filter(Boolean)
                .join(" · ")}
            </p>
          </li>
        ))}
      </ul>
      <div className="hidden overflow-hidden rounded-md border @xl:block">
        <Table aria-label="Variants">
          <TableHeader>
            <TableRow>
              <TableHead>Label</TableHead>
              <TableHead>Group</TableHead>
              <TableHead className="text-right">Price</TableHead>
              <TableHead>Duration</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sorted.map((variant) => (
              <TableRow key={variant.id} className={variant.is_active ? "" : "opacity-60"}>
                <TableCell className={`whitespace-normal ${WRAP}`}>{variant.label}</TableCell>
                <TableCell className="whitespace-normal">{variant.subcategory ?? "—"}</TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatRupees(variant.base_price)}
                </TableCell>
                <TableCell>
                  {variant.duration_minutes ? durationLabel(variant.duration_minutes) : "—"}
                </TableCell>
                <TableCell>{variant.is_active ? "Active" : "Inactive"}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
