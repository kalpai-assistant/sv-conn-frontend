/**
 * The list's status filter, and the CSV export for accounting. The filter lives in
 * the URL. The export's dates don't: they pick a file, not a view.
 */
import { useId, useState, type FormEvent } from "react";
import { Download } from "lucide-react";
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
import { ApiError } from "@/lib/api";
import { isCompleteDate } from "@/lib/bookings";
import { apiDownload } from "@/lib/download";
import {
  SETTLEMENT_STATUSES,
  SETTLEMENT_STATUS_LABELS,
  exportCsvFilename,
  exportCsvPath,
  type SettlementStatus,
} from "@/lib/payouts";

// A Select item can't have an empty value, and no status is called this.
const ALL = "__all__";

export function SettlementSelect({
  label,
  value,
  allLabel,
  onChange,
}: {
  label: string;
  value: SettlementStatus | undefined;
  allLabel: string;
  onChange: (value: SettlementStatus | undefined) => void;
}) {
  const id = useId();
  return (
    <div className="min-w-0 space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Select
        value={value ?? ALL}
        onValueChange={(next) => onChange(next === ALL ? undefined : (next as SettlementStatus))}
      >
        <SelectTrigger id={id} className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>{allLabel}</SelectItem>
          {SETTLEMENT_STATUSES.map((status) => (
            <SelectItem key={status} value={status}>
              {SETTLEMENT_STATUS_LABELS[status]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function DateInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const id = useId();
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
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  );
}

/**
 * Both dates are required, IST days inclusive. The backend owns the rules (from
 * after to, longer than 366 days) and says what's wrong in a 422, shown here.
 */
export function CsvExport() {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const ready = isCompleteDate(from) && isCompleteDate(to);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!ready || busy) {
      if (!ready) setProblem("Pick both dates.");
      return;
    }
    setBusy(true);
    setProblem(null);
    setSaved(null);
    try {
      const filename = await apiDownload(exportCsvPath(from, to), exportCsvFilename(from, to));
      setSaved(filename);
    } catch (error) {
      if (error instanceof ApiError && error.status === 422) {
        setProblem(error.message);
      } else if (error instanceof ApiError && error.status < 500 && error.status !== 401) {
        setProblem(error.message);
      } else {
        setProblem("Couldn't download the CSV. Please try again.");
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      aria-label="Export CSV"
      onSubmit={submit}
      noValidate
      className="space-y-2 rounded-lg border bg-card p-3"
    >
      <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
        <DateInput
          label="Completed from (IST)"
          value={from}
          onChange={(value) => {
            setFrom(value);
            setProblem(null);
          }}
        />
        <DateInput
          label="Completed to (IST)"
          value={to}
          onChange={(value) => {
            setTo(value);
            setProblem(null);
          }}
        />
        <Button type="submit" variant="secondary" disabled={busy}>
          <Download aria-hidden="true" />
          {busy ? "Downloading…" : "Download CSV"}
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        One row per booking completed in the range, cash jobs left out. Amounts in rupees.
      </p>
      {problem && (
        <p role="alert" className="text-sm text-destructive [overflow-wrap:anywhere]">
          {problem}
        </p>
      )}
      {saved && (
        <p role="status" className="text-sm text-muted-foreground [overflow-wrap:anywhere]">
          Saved {saved}.
        </p>
      )}
    </form>
  );
}
