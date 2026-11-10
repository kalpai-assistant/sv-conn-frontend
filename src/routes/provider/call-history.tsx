/**
 * SVC-453 — the SP's call history screen.
 *
 * Reached from Account → Call History. One row per bridged call Exotel has
 * recorded against this provider's bookings. Rows carry the customer's first
 * name, the service, timestamp, duration, direction, and the terminal
 * outcome — never a phone number, real or virtual (SVC-446 privacy default).
 *
 * The SP's audit trail of their own calling activity. Not a dialer: tapping
 * a row goes nowhere, because dialing from here would need a per-booking
 * mapping lookup (and most booking mappings are released within 48h of
 * completion), and even when one exists, dialing the *historic* mapping
 * instead of the *current* booking's would route the call at the wrong
 * conversation. Call initiation stays on booking-details.
 *
 * Pagination = 50/page (baked default). "Load more" at the bottom hits the
 * next page; the infinite-query cache concatenates in place.
 */
import { createFileRoute } from "@tanstack/react-router";
import { PhoneCall, PhoneIncoming, PhoneMissed, PhoneOutgoing } from "lucide-react";
import { BackButton } from "@/components/BackButton";
import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/ErrorState";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDate } from "@/i18n/format";
import { useT } from "@/i18n/LanguageProvider";
import type { AppLanguage } from "@/i18n/languages";
import { useProviderCallHistory, type API_CallHistoryEntry } from "@/hooks/useApi";

export const Route = createFileRoute("/provider/call-history")({
  component: ProviderCallHistoryPage,
});

function formatCallStartedAt(iso: string, lang: AppLanguage): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const options = {
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  } as const;
  return lang === "en"
    ? date.toLocaleDateString("en-IN", options)
    : formatDate(date, options, lang);
}

function formatDuration(seconds: number | null, t: ReturnType<typeof useT>["t"]): string {
  if (seconds === null || seconds <= 0) return t("callHistory.noDuration");
  if (seconds < 60) return t("callHistory.durationSeconds", { count: seconds });
  const min = Math.floor(seconds / 60);
  const sec = seconds % 60;
  return t("callHistory.durationMinutes", { min, sec });
}

// Exotel terminal statuses the webhook stamps (see backend SVC-450). Keeping
// the map here, not on the API shape, so an unknown value from a newer
// backend falls back to showing the raw status string rather than crashing.
function outcomeLabel(outcome: string, t: ReturnType<typeof useT>["t"]): string {
  switch (outcome) {
    case "completed":
      return t("callHistory.outcomeCompleted");
    case "no_answer":
      return t("callHistory.outcomeNoAnswer");
    case "busy":
      return t("callHistory.outcomeBusy");
    case "failed":
      return t("callHistory.outcomeFailed");
    case "in_progress":
      return t("callHistory.outcomeInProgress");
    case "ringing":
      return t("callHistory.outcomeRinging");
    case "declined_consent":
      return t("callHistory.outcomeDeclined");
    default:
      return t("callHistory.outcomeUnknown", { status: outcome });
  }
}

function directionIcon(direction: API_CallHistoryEntry["direction"]) {
  if (direction === "customer_to_sp") return PhoneIncoming;
  if (direction === "sp_to_customer") return PhoneOutgoing;
  // Unmatched: stranger dialled the virtual number with no active mapping
  // between them and this SP. Audited for disputes (SVC-448), shown here so
  // the SP knows about the attempt without us surfacing who called.
  return PhoneMissed;
}

function directionLabel(
  direction: API_CallHistoryEntry["direction"],
  t: ReturnType<typeof useT>["t"],
): string {
  if (direction === "customer_to_sp") return t("callHistory.directionIn");
  if (direction === "sp_to_customer") return t("callHistory.directionOut");
  return t("callHistory.directionUnmatched");
}

function CallHistoryRow({ entry, divided }: { entry: API_CallHistoryEntry; divided: boolean }) {
  const { t, lang } = useT("provider");
  const Icon = directionIcon(entry.direction);
  // First-name-only is a baked privacy default (SVC-453). Backend sends null
  // when the customer has no name on file *or* the call was unmatched; both
  // read as the same placeholder on this screen.
  const who = entry.customer_first_name ?? t("callHistory.unknownCustomer");
  const what = entry.service_name ?? t("callHistory.unknownService");
  return (
    <div className={`flex items-start gap-3 p-3.5 ${divided ? "border-t border-border" : ""}`}>
      <div className="mt-0.5 shrink-0 text-muted-foreground">
        <Icon className="h-5 w-5" aria-hidden="true" />
        <span className="sr-only">{directionLabel(entry.direction, t)}</span>
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-foreground">{who}</p>
        <p className="mt-0.5 truncate text-xs text-muted-foreground">
          {what} · {formatCallStartedAt(entry.started_at, lang)}
        </p>
      </div>
      <div className="shrink-0 text-right">
        <p className="text-xs font-medium text-foreground tabular-nums">
          {formatDuration(entry.duration_sec, t)}
        </p>
        <p className="mt-0.5 text-xs text-muted-foreground">{outcomeLabel(entry.outcome, t)}</p>
      </div>
    </div>
  );
}

function ProviderCallHistoryPage() {
  const { t } = useT("provider");
  const query = useProviderCallHistory();

  const rows = query.data?.pages.flatMap((p) => p.items) ?? [];

  return (
    <div className="min-h-screen p-6 pb-24">
      <div className="flex items-center gap-3">
        <BackButton fallbackTo="/provider/profile" />
        <h1 className="text-lg font-semibold text-foreground">{t("callHistory.title")}</h1>
      </div>

      {query.isLoading && (
        <div className="mt-6 space-y-3">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </div>
      )}

      {query.isError && (
        <div className="mt-6">
          <ErrorState message={t("callHistory.loadFailed")} onRetry={() => query.refetch()} />
        </div>
      )}

      {!query.isLoading && !query.isError && rows.length === 0 && (
        <div className="mt-10 rounded-lg bg-muted p-6 text-center">
          <PhoneCall className="mx-auto h-8 w-8 text-muted-foreground" aria-hidden="true" />
          <p className="mt-3 text-sm font-medium text-foreground">{t("callHistory.empty")}</p>
          <p className="mt-1 text-xs text-muted-foreground">{t("callHistory.emptyDetail")}</p>
        </div>
      )}

      {rows.length > 0 && (
        <div className="mt-4 overflow-hidden rounded-xl border border-border bg-card">
          {rows.map((entry, i) => (
            <CallHistoryRow key={entry.id} entry={entry} divided={i > 0} />
          ))}
        </div>
      )}

      {query.hasNextPage && (
        <div className="mt-4 text-center">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => query.fetchNextPage()}
            disabled={query.isFetchingNextPage}
          >
            {query.isFetchingNextPage ? t("callHistory.loadingMore") : t("callHistory.loadMore")}
          </Button>
        </div>
      )}
    </div>
  );
}
