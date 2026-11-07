/**
 * The KYC queue (SVC-424): the queue on the left, one row's detail on the right.
 * Below lg they stack, because the sidebar leaves too little room for two panes.
 * Names and reasons come from outside, so every value here is rendered as text.
 *
 * The filter and page live in the URL. The selection doesn't, so no document
 * link or person's id ends up in the address bar.
 */
import { useEffect, useRef, useState } from "react";
import { Link, createFileRoute } from "@tanstack/react-router";
import { EmptyState } from "@/components/EmptyState";
import { ErrorState } from "@/components/ErrorState";
import { LoadingState } from "@/components/LoadingState";
import {
  KycDetailPane,
  KycStatusPill,
  type KycAction,
  type KycActionOutcome,
} from "@/components/kyc/KycDetailPane";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { ApiError, apiFetch } from "@/lib/api";
import {
  KYC_PAGE_SIZE,
  KYC_TABS,
  KYC_TAB_COPY,
  canReviewKyc,
  formatKycAge,
  kycAgeDotClass,
  kycDisplayName,
  kycQueuePath,
  kycReviewPath,
  kycRowAgeSource,
  kycRowKey,
  validateKycSearch,
  type KycQueueRow,
  type KycSearch,
  type KycTab,
} from "@/lib/kyc";
import { useRefreshKycBadge } from "@/lib/kyc-badge";
import { useApiGet } from "@/lib/use-api-get";

export const Route = createFileRoute("/_authed/operator/kyc")({
  component: KycQueuePage,
  validateSearch: validateKycSearch,
});

type Notice = { kind: "success" | "error"; text: string };

function searchFor(tab: KycTab, page: number): KycSearch {
  return {
    tab: tab === "pending" ? undefined : tab,
    page: page > 1 ? page : undefined,
  };
}

/** When the panes are stacked, what just changed can be a long way off screen. */
function scrollIfStacked(element: HTMLElement | null) {
  if (window.matchMedia?.("(max-width: 1023px)").matches) {
    element?.scrollIntoView({ block: "start" });
  }
}

function QueueRowContent({ row, tab }: { row: KycQueueRow; tab: KycTab }) {
  const ageSource = kycRowAgeSource(row);
  const age = formatKycAge(ageSource);
  return (
    <>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-foreground">{kycDisplayName(row)}</p>
        <p className="truncate text-xs text-muted-foreground">{row.phone}</p>
        {row.kind === "pro" && (
          <p className="truncate text-xs text-muted-foreground">
            Team Pro{row.sp_business_name ? ` · ${row.sp_business_name}` : ""}
          </p>
        )}
        {row.kyc_status === "rejected" && row.kyc_rejection_reason && (
          <p
            className="mt-1 truncate text-xs text-muted-foreground"
            title={row.kyc_rejection_reason}
          >
            Reason: {row.kyc_rejection_reason}
          </p>
        )}
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1 text-xs text-muted-foreground">
        {tab === "all" && <KycStatusPill status={row.kyc_status} />}
        {age && (
          <span className="flex items-center gap-2">
            {tab === "pending" && ageSource && (
              <span
                aria-hidden="true"
                className={`inline-block h-2 w-2 rounded-full ${kycAgeDotClass(ageSource)}`}
              />
            )}
            <span className="tabular-nums">{age}</span>
          </span>
        )}
      </div>
    </>
  );
}

function FilterLinks({ active, onChoose }: { active: KycTab; onChoose: () => void }) {
  return (
    <nav aria-label="KYC filters" className="flex flex-wrap gap-1 rounded-lg bg-muted p-1">
      {KYC_TABS.map((tab) => {
        const isActive = tab.value === active;
        return (
          <Link
            key={tab.value}
            to="/operator/kyc"
            search={searchFor(tab.value, 1)}
            onClick={onChoose}
            aria-current={isActive ? "page" : undefined}
            className={`rounded-md px-3 py-1.5 text-sm font-medium ${
              isActive
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}

function KycQueuePage() {
  const { admin } = Route.useRouteContext();
  const search = Route.useSearch();
  const tab: KycTab = search.tab ?? "pending";
  const page = search.page ?? 1;
  const copy = KYC_TAB_COPY[tab];
  const canAct = canReviewKyc(admin.role);

  const queuePath = kycQueuePath(tab, page);
  const queue = useApiGet<KycQueueRow[]>(queuePath);
  const refreshBadge = useRefreshKycBadge();

  const [selected, setSelected] = useState<KycQueueRow | null>(null);
  const [running, setRunning] = useState<{ key: string; action: KycAction } | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  // State updates a render late, and a double click is quicker than that.
  const actionInFlight = useRef(false);
  const noticeRef = useRef<HTMLDivElement>(null);
  const detailRef = useRef<HTMLElement>(null);

  const selectedKey = selected ? kycRowKey(selected) : null;

  // A selection belongs to the list it was picked from. This also catches Back.
  useEffect(() => {
    setSelected(null);
  }, [queuePath]);

  useEffect(() => {
    if (selectedKey) {
      // The pane scrolls on its own and outlives the row. Each row has to open at
      // the top, or its name can be out of view while its Approve button isn't.
      if (detailRef.current) {
        detailRef.current.scrollTop = 0;
      }
      scrollIfStacked(detailRef.current);
    }
  }, [selectedKey]);

  // The buttons can be well below the banner, on a desktop as well as a phone.
  useEffect(() => {
    if (notice) {
      noticeRef.current?.scrollIntoView({ block: "nearest" });
    }
  }, [notice]);

  async function runAction(
    row: KycQueueRow,
    action: KycAction,
    reason?: string,
  ): Promise<KycActionOutcome> {
    if (actionInFlight.current) {
      return "failed";
    }
    actionInFlight.current = true;
    const key = kycRowKey(row);
    const who = row.name || row.phone;
    setRunning({ key, action });
    setNotice(null);
    try {
      await apiFetch(
        `${kycReviewPath(row)}/${action === "approve" ? "verify" : "reject"}`,
        action === "approve"
          ? { method: "POST" }
          : { method: "POST", body: JSON.stringify({ reason }) },
      );
      setNotice({
        kind: "success",
        text: action === "approve" ? `KYC verified: ${who}` : `KYC rejected: ${who}`,
      });
      // Only if it's still the row on screen: the reviewer may have moved on.
      setSelected((current) => (current && kycRowKey(current) === key ? null : current));
      queue.refresh();
      refreshBadge();
      return "done";
    } catch (error) {
      const text =
        error instanceof ApiError && error.status < 500
          ? error.message
          : `Couldn't ${action} this KYC. Please try again.`;
      setNotice({ kind: "error", text: `${who}: ${text}` });
      // The row isn't what this screen thought: someone else decided it, or it's gone.
      if (error instanceof ApiError && (error.status === 403 || error.status === 404)) {
        queue.refresh();
        refreshBadge();
        return "stale";
      }
      return "failed";
    } finally {
      actionInFlight.current = false;
      setRunning(null);
    }
  }

  const rows = queue.status === "ready" ? queue.data : null;

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">KYC review queue</h1>
        <p className="text-sm text-muted-foreground">{copy.subhead}</p>
      </div>

      {notice && (
        <Alert
          ref={noticeRef}
          variant={notice.kind === "error" ? "destructive" : "default"}
          // Alert defaults to role="alert", which is too loud for a confirmation.
          role={notice.kind === "error" ? "alert" : "status"}
          className={`scroll-mt-4 ${notice.kind === "success" ? "border-success/40 bg-success/10" : ""}`}
        >
          <AlertDescription className="[overflow-wrap:anywhere]">{notice.text}</AlertDescription>
        </Alert>
      )}

      <FilterLinks active={tab} onChoose={() => setNotice(null)} />

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        <section aria-label="KYC queue" className="min-w-0 space-y-3">
          {queue.status === "loading" && <LoadingState rows={5} />}
          {queue.status === "error" && (
            <ErrorState message="Couldn't load the KYC queue." onRetry={queue.retry} />
          )}
          {/* Past the first page, empty only means this page: the list may have shrunk
              under us, or the last page was exactly full. Pager offers the way back. */}
          {rows?.length === 0 && page > 1 && (
            <EmptyState message="Nothing on this page." detail="Go back to see earlier rows." />
          )}
          {rows?.length === 0 && page === 1 && (
            <EmptyState message={copy.emptyHead} detail={copy.emptyBody} />
          )}
          {rows && rows.length > 0 && (
            <ul className="divide-y overflow-hidden rounded-lg border">
              {rows.map((row) => {
                const key = kycRowKey(row);
                const isSelected = key === selectedKey;
                return (
                  <li key={key}>
                    <button
                      type="button"
                      aria-current={isSelected ? "true" : undefined}
                      onClick={() => setSelected(row)}
                      className={`flex w-full items-center gap-3 p-3 text-left transition-colors hover:bg-secondary/40 ${
                        isSelected ? "bg-secondary" : ""
                      }`}
                    >
                      <QueueRowContent row={row} tab={tab} />
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
          {rows && <Pager tab={tab} page={page} rowCount={rows.length} />}
        </section>

        <section
          aria-label="KYC detail"
          ref={detailRef}
          // Stays in view while a long queue scrolls past it. Night mode only swaps our
          // tokens, so Chrome would draw this pane's scrollbar white without color-scheme.
          className={`min-w-0 scroll-mt-4 [color-scheme:light_dark] lg:sticky lg:top-4 lg:max-h-[calc(100vh-2rem)] lg:overflow-y-auto ${
            selected ? "" : "hidden lg:block"
          }`}
        >
          {selected ? (
            <KycDetailPane
              key={selectedKey}
              row={selected}
              tab={tab}
              canAct={canAct}
              running={running?.key === selectedKey ? running.action : null}
              busy={running !== null}
              onAction={runAction}
            />
          ) : (
            <div className="rounded-lg border border-dashed">
              <EmptyState message="Select a row to see its documents." />
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

/** There's no total, so a full page means there may be more. */
function Pager({ tab, page, rowCount }: { tab: KycTab; page: number; rowCount: number }) {
  const hasNext = rowCount === KYC_PAGE_SIZE;
  if (page === 1 && !hasNext) {
    return null;
  }
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <p className="text-sm text-muted-foreground">Page {page}</p>
      <div className="flex gap-2">
        {page > 1 ? (
          <Button variant="outline" size="sm" asChild>
            <Link to="/operator/kyc" search={searchFor(tab, page - 1)}>
              Previous
            </Link>
          </Button>
        ) : (
          <Button variant="outline" size="sm" disabled>
            Previous
          </Button>
        )}
        {hasNext ? (
          <Button variant="outline" size="sm" asChild>
            <Link to="/operator/kyc" search={searchFor(tab, page + 1)}>
              Next
            </Link>
          </Button>
        ) : (
          <Button variant="outline" size="sm" disabled>
            Next
          </Button>
        )}
      </div>
    </div>
  );
}
