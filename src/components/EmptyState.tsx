/**
 * The "there is genuinely nothing here" screen (SVC-390).
 *
 * Markup was first lifted from `EmptyCart` (icon in a circle + headline +
 * one-line subhead + optional CTA), the one surface that already had the
 * shape the rest of the app wanted. SVC-390 upgraded the surface itself:
 * the circled icon is now optional, replaced by a line illustration when
 * one is provided, so empty states read as considered rather than
 * boilerplate.
 *
 * Pairs with `ErrorState`. They look deliberately different: a user who
 * sees this should believe their data is fine and simply empty, which is
 * only true if a failure never renders here. See the ordering note in
 * `ErrorState`.
 *
 * The action can be either a TanStack `Link` (internal nav) or a plain
 * callback (a retry handler for the offline/no-service-area scenarios).
 * These are the only two shapes the ticket calls out — exposing both an
 * `href` AND a `to` would be noise.
 */
import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { ArrowRight, CircleAlert } from "lucide-react";

export interface EmptyStateProps {
  title: string;
  description?: string;
  /**
   * Simple icon rendered inside a tinted circle — the "I used to be icon-only"
   * fallback. Pass a Lucide icon as JSX: `<ShoppingCart />`.
   */
  icon?: ReactNode;
  /**
   * A richer line-art illustration. When supplied, replaces the circled-icon
   * block entirely. See `EmptyStateIllustrations.tsx` for the shipped set.
   */
  illustration?: ReactNode;
  /**
   * Either a TanStack internal nav (`to`) OR a retry callback (`onClick`).
   * The offline + no-service-area scenarios need a callback, not a route.
   */
  action?: { label: string; to?: string; onClick?: () => void };
}

export function EmptyState({ title, description, icon, illustration, action }: EmptyStateProps) {
  return (
    <section
      className="flex flex-col items-center px-6 text-center"
      aria-labelledby="empty-state-title"
    >
      {illustration ?? (
        <div className="mb-6 flex size-20 items-center justify-center rounded-full border border-primary/15 bg-primary/10 text-primary">
          {icon ?? <CircleAlert aria-hidden="true" className="size-8" />}
        </div>
      )}
      <h2 id="empty-state-title" className="text-xl font-semibold tracking-tight text-foreground">
        {title}
      </h2>
      {description && (
        <p className="mt-2 max-w-70 text-sm leading-6 text-muted-foreground">{description}</p>
      )}
      {action && <ActionButton {...action} />}
    </section>
  );
}

function ActionButton({
  label,
  to,
  onClick,
}: {
  label: string;
  to?: string;
  onClick?: () => void;
}) {
  // Shared pill class so the Link + button paths render identically — the
  // same `rounded-xl bg-primary` surface the brand uses on every primary CTA.
  const className =
    "mt-7 inline-flex h-11 items-center gap-2 rounded-xl bg-primary px-5 text-sm font-semibold text-primary-foreground shadow-md transition-transform hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2";
  if (to) {
    return (
      <Link to={to} className={className}>
        {label}
        <ArrowRight aria-hidden="true" className="size-4" />
      </Link>
    );
  }
  return (
    <button type="button" onClick={onClick} className={className}>
      {label}
      <ArrowRight aria-hidden="true" className="size-4" />
    </button>
  );
}
