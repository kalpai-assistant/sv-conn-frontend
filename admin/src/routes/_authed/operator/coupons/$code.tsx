/**
 * One coupon (SVC-429): its terms, usage stats and latest bookings. Admin and ops
 * edit it, deactivate it (after a confirm) and activate it again (at once: it
 * undoes nothing anyone relied on). Support reads only. There is no delete:
 * bookings reference the coupon, so deactivate is the soft delete (ticket).
 *
 * The code in the URL is matched case-insensitively by the backend.
 */
import { useState } from "react";
import { Link, createFileRoute } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { CouponStatusPill, PersonalTag } from "@/components/coupons/CouponBadges";
import { CouponForm } from "@/components/coupons/CouponForm";
import { CouponStats } from "@/components/coupons/CouponStats";
import { DeactivateDialog } from "@/components/coupons/DeactivateDialog";
import { EmptyState } from "@/components/EmptyState";
import { ErrorState } from "@/components/ErrorState";
import { LoadingState } from "@/components/LoadingState";
import { Fact, PageSection } from "@/components/teams/PageSection";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { ApiError } from "@/lib/api";
import { formatIst } from "@/lib/bookings";
import {
  canEditCoupons,
  activatedNotice,
  couponErrorMessage,
  couponPath,
  discountLabel,
  minOrderLabel,
  setCouponActive,
  type CouponDetail,
  type CouponRow,
} from "@/lib/coupons";
import { useApiGet } from "@/lib/use-api-get";

export const Route = createFileRoute("/_authed/operator/coupons/$code")({
  component: CouponPage,
});

const WRAP = "[overflow-wrap:anywhere]";

type Notice = { kind: "success" | "error"; text: string };

function CouponPage() {
  const { code } = Route.useParams();
  // Keyed, so nothing typed for one coupon shows under another.
  return <CouponView key={code} code={code} />;
}

function CouponView({ code }: { code: string }) {
  const { admin } = Route.useRouteContext();
  const canEdit = canEditCoupons(admin.role);
  const detail = useApiGet<CouponDetail>(couponPath(code));
  const [confirming, setConfirming] = useState(false);
  const [activating, setActivating] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);
  const coupon = detail.status === "ready" ? detail.data : null;

  if (
    detail.status === "error" &&
    detail.error instanceof ApiError &&
    detail.error.status === 404
  ) {
    return (
      <div className="space-y-6">
        <BackLink />
        <EmptyState message={`No coupon with the code ${code}.`} detail="The link may be wrong." />
      </div>
    );
  }

  async function activate(current: CouponRow) {
    if (activating) return;
    setActivating(true);
    setNotice(null);
    try {
      const row = await setCouponActive(current.code, true);
      setNotice({ kind: "success", text: activatedNotice(row) });
      detail.refresh();
    } catch (err) {
      setNotice({ kind: "error", text: couponErrorMessage(err) });
    } finally {
      setActivating(false);
    }
  }

  return (
    <div className="space-y-6">
      <BackLink />

      {detail.status === "loading" && <LoadingState rows={3} />}
      {detail.status === "error" && (
        <ErrorState message="Couldn't load this coupon." onRetry={detail.retry} />
      )}

      {coupon && (
        <>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0 space-y-2">
              <h1 className={`font-mono text-2xl font-semibold tracking-tight ${WRAP}`}>
                {coupon.code}
              </h1>
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <CouponStatusPill status={coupon.status} />
                <PersonalTag row={coupon} />
                <span className="text-muted-foreground">{discountLabel(coupon)}</span>
              </div>
              <p className="text-xs text-muted-foreground">
                Created {formatIst(coupon.created_at)} (IST)
              </p>
            </div>
            {canEdit &&
              (coupon.is_active ? (
                <Button variant="outline" onClick={() => setConfirming(true)}>
                  Deactivate
                </Button>
              ) : (
                <Button disabled={activating} onClick={() => activate(coupon)}>
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
            <CouponStats coupon={coupon} />
            <PageSection title={canEdit ? "Edit" : "Terms"}>
              {canEdit ? (
                <CouponForm
                  mode="edit"
                  row={coupon}
                  onSaved={() => {
                    setNotice(null);
                    detail.refresh();
                  }}
                />
              ) : (
                <Terms coupon={coupon} />
              )}
            </PageSection>
          </div>

          {canEdit && (
            <DeactivateDialog
              code={coupon.code}
              open={confirming}
              onClose={() => setConfirming(false)}
              onDeactivated={(row) => {
                setConfirming(false);
                setNotice({
                  kind: "success",
                  text: `${row.code} is deactivated. Customers can no longer apply it.`,
                });
                detail.refresh();
              }}
            />
          )}
        </>
      )}
    </div>
  );
}

function BackLink() {
  return (
    <Button asChild variant="ghost" size="sm" className="-ml-2">
      <Link to="/operator/coupons">
        <ArrowLeft aria-hidden="true" />
        All coupons
      </Link>
    </Button>
  );
}

function Terms({ coupon }: { coupon: CouponDetail }) {
  return (
    <dl className="grid gap-3 sm:grid-cols-2">
      <Fact label="Discount">{discountLabel(coupon)}</Fact>
      <Fact label="Min order">{minOrderLabel(coupon.min_order_amount)}</Fact>
      <Fact label="Valid from (IST)">{formatIst(coupon.valid_from)}</Fact>
      <Fact label="Valid until (IST)">{formatIst(coupon.valid_until)}</Fact>
      <Fact label="Usage limit">
        <span className="tabular-nums">{coupon.usage_limit ?? "Unlimited"}</span>
      </Fact>
      <Fact label="Uses per customer">
        <span className="tabular-nums">{coupon.usage_limit_per_user}</span>
      </Fact>
    </dl>
  );
}
