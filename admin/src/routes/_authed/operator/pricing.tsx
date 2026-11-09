/**
 * The pricing config surface (SVC-428): the layout over its two tabs. The tabs
 * are route links (the Link sets aria-current="page" on the open one), so each
 * tab has its own URL and the admin kit needs no tabs primitive.
 *
 * Every operator role opens it; support reads only (lib/pricing canEditPricing).
 */
import { Link, Outlet, createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_authed/operator/pricing")({
  component: PricingLayout,
});

const TAB = "rounded-md px-3 py-1.5 text-sm font-medium";

const TABS = [
  { to: "/operator/pricing/categories", label: "Categories" },
  { to: "/operator/pricing/formula", label: "Formula" },
] as const;

function PricingLayout() {
  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Pricing</h1>
        <p className="text-sm text-muted-foreground">
          These values aren't used yet: marketplace pricing (SVC-406) will read them. Each save is
          recorded in the audit log.
        </p>
      </div>
      <nav
        aria-label="Pricing sections"
        className="flex w-fit flex-wrap gap-1 rounded-lg bg-muted p-1"
      >
        {TABS.map((tab) => (
          <Link
            key={tab.to}
            to={tab.to}
            className={TAB}
            activeProps={{ className: "bg-background text-foreground shadow-sm" }}
            inactiveProps={{ className: "text-muted-foreground hover:text-foreground" }}
          >
            {tab.label}
          </Link>
        ))}
      </nav>
      <Outlet />
    </div>
  );
}
