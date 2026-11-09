/**
 * The team actions on an SP or a Pro (GET /admin/actions), newest first, a page at
 * a time. The log stores ids only, so `describe` puts the sentence together.
 */
import { Link } from "@tanstack/react-router";
import { NextPager } from "@/components/teams/DirectoryControls";
import { ErrorState } from "@/components/ErrorState";
import { LoadingState } from "@/components/LoadingState";
import { formatIst } from "@/lib/bookings";
import {
  HISTORY_PAGE_SIZE,
  actionActor,
  mayHaveMore,
  type ActionSentence,
  type AdminAction,
} from "@/lib/teams";
import type { ApiGetState } from "@/lib/use-api-get";

const WRAP = "[overflow-wrap:anywhere]";
const LINK = "text-xs font-medium text-primary underline-offset-2 hover:underline";

export function ActionHistory({
  state,
  page,
  onPage,
  describe,
  empty,
}: {
  state: ApiGetState<AdminAction[]> & { retry: () => void };
  page: number;
  onPage: (page: number) => void;
  describe: (row: AdminAction) => ActionSentence;
  empty: string;
}) {
  const rows = state.status === "ready" ? state.data : null;
  return (
    <div className="space-y-3">
      {state.status === "loading" && <LoadingState rows={2} />}
      {state.status === "error" && (
        <ErrorState message="Couldn't load the admin history." onRetry={state.retry} />
      )}
      {rows && rows.length === 0 && (
        <p className="text-sm text-muted-foreground">
          {page > 1 ? "Nothing on this page." : empty}
        </p>
      )}
      {rows && rows.length > 0 && (
        <ol aria-label="Admin actions" className="divide-y rounded-lg border">
          {rows.map((row) => {
            const { summary, notes, links } = describe(row);
            return (
              <li key={row.id} data-action={row.action} className="space-y-1 px-3 py-2 text-sm">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className={`font-medium ${WRAP}`}>{summary}</span>
                  <span className="text-xs text-muted-foreground">{formatIst(row.created_at)}</span>
                </div>
                <p className={`text-xs text-muted-foreground ${WRAP}`}>
                  By {actionActor(row)}
                  {row.reason && <> · Reason: “{row.reason}”</>}
                </p>
                {notes.map((note) => (
                  <p key={note} className="text-xs text-muted-foreground">
                    {note}
                  </p>
                ))}
                {links.length > 0 && (
                  <p className="flex flex-wrap gap-x-3 gap-y-1">
                    {links.map((link) =>
                      link.kind === "sp" ? (
                        <Link
                          key={link.label}
                          to="/operator/sps/$spId"
                          params={{ spId: link.id }}
                          className={LINK}
                        >
                          {link.label}
                        </Link>
                      ) : (
                        <Link
                          key={link.label}
                          to="/operator/pros/$proId"
                          params={{ proId: link.id }}
                          className={LINK}
                        >
                          {link.label}
                        </Link>
                      ),
                    )}
                  </p>
                )}
              </li>
            );
          })}
        </ol>
      )}
      {rows && (
        <NextPager
          label="History pages"
          page={page}
          shown={rows.length}
          hasMore={mayHaveMore(rows, HISTORY_PAGE_SIZE)}
          onPage={onPage}
        />
      )}
    </div>
  );
}
