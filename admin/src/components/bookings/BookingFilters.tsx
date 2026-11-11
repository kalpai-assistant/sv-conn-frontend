/**
 * The list filters and the booking-ID box. The filters live in the URL; the
 * controls here hold what's being typed until it's a filter. Status, disputed and
 * the dates apply as soon as they change. Phone and SP name apply on Enter or
 * Apply, so a half-typed phone doesn't ask the backend for anything.
 */
import { useEffect, useId, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  BOOKING_STATUSES,
  BOOKING_STATUS_LABELS,
  hasFilters,
  isCompleteDate,
  isUuid,
  type BookingStatus,
  type BookingsSearch,
} from "@/lib/bookings";

/** Everything a filter change can touch. The page always goes back to 1. */
export type FilterPatch = Partial<
  Pick<BookingsSearch, "status" | "disputed" | "from" | "to" | "phone" | "sp">
>;

// A Select item can't have an empty value, and no status is called this.
const ALL = "__all__";

export function DateFilter({
  label,
  value,
  onCommit,
}: {
  label: string;
  value: string | undefined;
  onCommit: (value: string | undefined) => void;
}) {
  const id = useId();
  // Typing a year passes through 0002, 0020 and 0202. Those stay here; only a
  // whole date (or a cleared box) reaches the URL, and the URL wins when it moves.
  const [draft, setDraft] = useState(value ?? "");
  useEffect(() => setDraft(value ?? ""), [value]);
  return (
    <div className="min-w-0 space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        type="date"
        // Without a limit Chrome takes a six-digit year.
        max="9999-12-31"
        // Night mode only swaps our tokens, so Chrome would draw its calendar icon
        // for a light page: dark on dark (SVC-423).
        className="[color-scheme:light_dark]"
        value={draft}
        onChange={(event) => {
          const next = event.target.value;
          setDraft(next);
          if (next === "") {
            onCommit(undefined);
          } else if (isCompleteDate(next)) {
            onCommit(next);
          }
        }}
      />
    </div>
  );
}

export function BookingFilters({
  search,
  onChange,
  onClear,
}: {
  search: BookingsSearch;
  onChange: (patch: FilterPatch) => void;
  onClear: () => void;
}) {
  const statusId = useId();
  const phoneId = useId();
  const spId = useId();
  const disputedId = useId();
  const [phone, setPhone] = useState(search.phone ?? "");
  const [sp, setSp] = useState(search.sp ?? "");
  useEffect(() => setPhone(search.phone ?? ""), [search.phone]);
  useEffect(() => setSp(search.sp ?? ""), [search.sp]);

  function applyText(event: FormEvent) {
    event.preventDefault();
    onChange({ phone: phone.trim() || undefined, sp: sp.trim() || undefined });
  }

  return (
    <div className="space-y-3 rounded-lg border bg-card p-3">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <div className="min-w-0 space-y-1.5">
          <Label htmlFor={statusId}>Status</Label>
          <Select
            value={search.status ?? ALL}
            onValueChange={(next) =>
              onChange({ status: next === ALL ? undefined : (next as BookingStatus) })
            }
          >
            <SelectTrigger id={statusId}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All statuses</SelectItem>
              {BOOKING_STATUSES.map((status) => (
                <SelectItem key={status} value={status}>
                  {BOOKING_STATUS_LABELS[status]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <DateFilter
          label="Created from (IST)"
          value={search.from}
          onCommit={(from) => onChange({ from })}
        />
        <DateFilter
          label="Created to (IST)"
          value={search.to}
          onCommit={(to) => onChange({ to })}
        />
        <div className="flex items-end pb-2">
          <label htmlFor={disputedId} className="flex items-center gap-2 text-sm font-medium">
            <input
              id={disputedId}
              type="checkbox"
              className="size-4 accent-primary [color-scheme:light_dark]"
              checked={search.disputed === true}
              onChange={(event) => onChange({ disputed: event.target.checked ? true : undefined })}
            />
            Disputed only
          </label>
        </div>
      </div>

      <form onSubmit={applyText} className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
        <div className="min-w-0 space-y-1.5">
          <Label htmlFor={phoneId}>Customer phone</Label>
          <Input
            id={phoneId}
            type="tel"
            inputMode="tel"
            autoComplete="off"
            placeholder="98765 43210"
            value={phone}
            onChange={(event) => setPhone(event.target.value)}
          />
        </div>
        <div className="min-w-0 space-y-1.5">
          <Label htmlFor={spId}>Service provider name</Label>
          <Input
            id={spId}
            autoComplete="off"
            placeholder="Part of the name"
            value={sp}
            onChange={(event) => setSp(event.target.value)}
          />
        </div>
        <div className="flex gap-2">
          <Button type="submit" variant="secondary">
            Apply
          </Button>
          {hasFilters(search) && (
            <Button type="button" variant="ghost" onClick={onClear}>
              Clear filters
            </Button>
          )}
        </div>
      </form>
    </div>
  );
}

/** Opens one booking by its full id, which is what a support ticket or a log line carries. */
export function BookingIdLookup({ onOpen }: { onOpen: (id: string) => void }) {
  const inputId = useId();
  const errorId = useId();
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);

  function submit(event: FormEvent) {
    event.preventDefault();
    const id = value.trim().toLowerCase();
    if (!isUuid(id)) {
      setError("Paste the full booking ID");
      return;
    }
    setError(null);
    setValue("");
    onOpen(id);
  }

  return (
    <form onSubmit={submit} className="space-y-1.5" noValidate>
      <Label htmlFor={inputId}>Booking ID</Label>
      <div className="flex gap-2">
        <Input
          id={inputId}
          autoComplete="off"
          spellCheck={false}
          placeholder="e.g. 3f2c9a1e-…"
          className="font-mono"
          value={value}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
          onChange={(event) => {
            setValue(event.target.value);
            setError(null);
          }}
        />
        <Button type="submit" variant="secondary">
          Open
        </Button>
      </div>
      {error && (
        <p id={errorId} role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </form>
  );
}
