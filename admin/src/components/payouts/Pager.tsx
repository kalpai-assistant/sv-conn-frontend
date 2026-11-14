import { Button } from "@/components/ui/button";
import { lastPage } from "@/lib/payouts";

/** Previous / Next over a paged list. Nothing at all when there's one empty page. */
export function Pager({
  label,
  page,
  total,
  perPage,
  noun,
  onPage,
}: {
  /** Names the controls, since a screen can hold several pagers. */
  label: string;
  page: number;
  total: number;
  perPage: number;
  noun: [singular: string, plural: string];
  onPage: (page: number) => void;
}) {
  const last = lastPage(total, perPage);
  if (total === 0 && page === 1) {
    return null;
  }
  return (
    <nav aria-label={label} className="flex flex-wrap items-center justify-between gap-3">
      <p className="text-sm text-muted-foreground">
        Page {page} of {last} · {total} {total === 1 ? noun[0] : noun[1]}
      </p>
      <div className="flex gap-2">
        <Button
          variant="outline"
          size="sm"
          disabled={page <= 1}
          onClick={() => onPage(Math.min(page - 1, last))}
        >
          Previous
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={page >= last}
          onClick={() => onPage(page + 1)}
        >
          Next
        </Button>
      </div>
    </nav>
  );
}
