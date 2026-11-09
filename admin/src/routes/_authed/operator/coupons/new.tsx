/**
 * Create a coupon (SVC-429). Global coupons only: personal ones come from the
 * referral flow. On success the new coupon's page opens.
 *
 * Support reads coupons but can't create them, so this page sends them to the
 * list rather than showing a form every save of which would 403.
 */
import { Link, createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { CouponForm } from "@/components/coupons/CouponForm";
import { Button } from "@/components/ui/button";
import { canEditCoupons } from "@/lib/coupons";

export const Route = createFileRoute("/_authed/operator/coupons/new")({
  beforeLoad: ({ context }) => {
    if (!canEditCoupons(context.admin.role)) {
      throw redirect({ to: "/operator/coupons", replace: true });
    }
  },
  component: NewCouponPage,
});

function NewCouponPage() {
  const navigate = useNavigate();
  return (
    <div className="max-w-2xl space-y-6">
      <Button asChild variant="ghost" size="sm" className="-ml-2">
        <Link to="/operator/coupons">
          <ArrowLeft aria-hidden="true" />
          All coupons
        </Link>
      </Button>
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">New coupon</h1>
        <p className="text-sm text-muted-foreground">
          A global coupon: any customer can apply it, within its limits. Recorded in the audit log.
        </p>
      </div>
      <div className="rounded-lg border bg-card p-4">
        <CouponForm
          mode="create"
          onCreated={(row) =>
            navigate({ to: "/operator/coupons/$code", params: { code: row.code } })
          }
        />
      </div>
    </div>
  );
}
