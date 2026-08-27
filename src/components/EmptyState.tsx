/**
 * The "there is genuinely nothing here" screen.
 *
 * Markup is lifted from `EmptyCart`, which was already the design the rest of
 * the app wanted — circled icon, headline, one-line subhead, optional CTA —
 * and was the only screen that had it. `cart.tsx` now renders this so there
 * is one copy rather than two that drift.
 *
 * Pairs with `ErrorState`. They look deliberately different: a user who sees
 * this should believe their data is fine and simply empty, which is only true
 * if a failure never renders here. See the ordering note in `ErrorState`.
 */
import { Link } from "@tanstack/react-router";
import type { LucideIcon } from "lucide-react";

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  subtitle?: string;
  /** Optional call to action. Omit on states where there is nothing useful
   *  to do — an empty Activity feed isn't a problem to solve. */
  action?: { label: string; to: string };
  /** Full-screen centring for a whole route, versus sitting inside a list
   *  that already has a header above it. */
  fullScreen?: boolean;
}

export function EmptyState({
  icon: Icon,
  title,
  subtitle,
  action,
  fullScreen = false,
}: EmptyStateProps) {
  return (
    <div
      className={`flex flex-col items-center justify-center gap-4 px-8 text-center ${
        fullScreen ? "min-h-screen" : "py-12"
      }`}
    >
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-accent">
        <Icon className="h-8 w-8 text-primary" />
      </div>
      <div className="flex flex-col gap-1">
        <h2 className="text-lg font-semibold text-foreground">{title}</h2>
        {subtitle && <p className="text-sm text-muted-foreground">{subtitle}</p>}
      </div>
      {action && (
        <Link
          to={action.to}
          className="rounded-xl bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground"
        >
          {action.label}
        </Link>
      )}
    </div>
  );
}
