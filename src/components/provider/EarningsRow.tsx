/**
 * The earnings shortcut on Provider Home (SVC-275).
 *
 * ## One figure, not two
 *
 * Home carries **what is coming to them** and nothing else. The temptation is to show
 * lifetime alongside a window — "₹48,250 all time · ₹3,480 this week" — and it
 * is the wrong call twice over: two numbers on a row this small is a comparison
 * nobody asked for, and the second one is the weaker of the pair on a screen
 * whose job is the work in hand, not the accounting. A provider who wants the
 * breakdown taps through to the tab that exists for it.
 *
 * ## Why the net figure, not the booking sum
 *
 * `pending_amount` is what the transfer will really send. It is smaller than
 * what the queued jobs are worth, for two reasons: cash commission is netted
 * off (the provider kept the whole amount at the door on those jobs), and a
 * T+1 gate holds a job out until Razorpay has settled it with the platform.
 *
 * Showing the gross here and sending the net would be precisely the bug SVC-303
 * exists to close — so Home and the bank agree, and the tab explains the gap.
 *
 * No payout *date* appears: payouts are admin-triggered with no schedule, so
 * any date would be invented.
 *
 * ## Same query as the Earnings tab
 *
 * `useProviderPayoutSummary` is keyed `["payouts", "summary"]` on both screens,
 * so react-query serves one request to both and they cannot drift apart. SVC-275
 * AC3 ("the two figures agree") is then true by construction rather than by two
 * call sites remembering to stay in step.
 *
 * ## States
 *
 * Loading is a skeleton in the figure's place, so the row does not jump. Error
 * shows no number and keeps the row tappable — the tab is still reachable and
 * may well load fine. Zero shows ₹0, which is honest for a provider with nothing
 * queued; that is exactly why error must not fall through to it.
 */
import { Link } from "@tanstack/react-router";
import { ChevronRight, Wallet } from "lucide-react";

import { Skeleton } from "@/components/ui/skeleton";
import { formatRupees } from "@/i18n/format";
import { useT } from "@/i18n/LanguageProvider";
import { useProviderPayoutSummary } from "@/hooks/useApi";

export function EarningsRow() {
  const { data, isLoading, isError } = useProviderPayoutSummary();
  const { t, lang } = useT("provider");

  return (
    <Link
      to="/provider/earnings"
      className="mt-6 flex items-center gap-3 rounded-xl border border-border bg-card p-4 transition-colors hover:bg-accent"
    >
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent">
        <Wallet className="h-4 w-4 text-primary" />
      </span>

      <span className="min-w-0 flex-1">
        <span className="block text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {t("earnings.comingToYou")}
        </span>
        {isLoading ? (
          <Skeleton className="mt-1 h-6 w-24" />
        ) : isError ? (
          // Deliberately not ₹0 — see the note above. The row stays tappable;
          // the tab has its own retry.
          <span className="mt-0.5 block text-sm text-muted-foreground">
            {t("earnings.tapToSee")}
          </span>
        ) : (
          <span className="mt-0.5 block text-xl font-bold tabular-nums text-foreground">
            {formatRupees(data?.pending_amount ?? 0, lang)}
          </span>
        )}
      </span>

      <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
    </Link>
  );
}
