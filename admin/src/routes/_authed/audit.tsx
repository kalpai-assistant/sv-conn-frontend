/**
 * The audit log (SVC-423): every admin write, newest first, for the admin role.
 * Read-only, because entries are immutable. Reason and User-Agent come from
 * outside, so every value here is rendered as text.
 */
import { Fragment, useId, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { ChevronDown, ChevronRight } from "lucide-react";
import { EmptyState } from "@/components/EmptyState";
import { ErrorState } from "@/components/ErrorState";
import { LoadingState } from "@/components/LoadingState";
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ApiError } from "@/lib/api";
import {
  NO_AUDIT_FILTERS,
  adminFullLabel,
  adminLabel,
  auditPath,
  formatAuditJson,
  formatAuditTime,
  type AuditEntry,
  type AuditFilterOptions,
  type AuditFilters,
  type AuditPage,
} from "@/lib/audit";
import { useApiGet } from "@/lib/use-api-get";

export const Route = createFileRoute("/_authed/audit")({
  component: AuditLogPage,
});

// A Select item can't have an empty value, and no action is called this.
const ALL = "__all__";

// Long ids and User-Agents have no spaces. "anywhere" also lets the table shrink
// around them, so they wrap at phone width instead of pushing the page sideways.
const WRAP_ANYWHERE = "[overflow-wrap:anywhere]";

function FilterSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
}) {
  const id = useId();
  return (
    <div className="min-w-0 space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Select value={value || ALL} onValueChange={(next) => onChange(next === ALL ? "" : next)}>
        <SelectTrigger id={id}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>All</SelectItem>
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function FilterDate({
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
        // Without a limit Chrome takes a six-digit year, which Date can't read.
        max="9999-12-31"
        // Night mode only swaps our tokens, so Chrome would still draw its calendar
        // icon for a light page: dark on dark, and nearly invisible.
        className="[color-scheme:light_dark]"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  );
}

function Field({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
      <dd className={`text-sm ${WRAP_ANYWHERE}`}>{value || "None"}</dd>
    </div>
  );
}

function JsonBlock({ label, value }: { label: string; value: Record<string, unknown> | null }) {
  return (
    <div className="min-w-0">
      <h3 className="pb-1 text-xs font-medium text-muted-foreground">{label}</h3>
      <pre
        className={`rounded-md border bg-card p-3 font-mono text-xs whitespace-pre-wrap ${WRAP_ANYWHERE}`}
      >
        {formatAuditJson(value) ?? "None"}
      </pre>
    </div>
  );
}

function EntryDetails({ entry }: { entry: AuditEntry }) {
  return (
    <div className="space-y-4 whitespace-normal">
      <dl className="grid gap-3 md:grid-cols-2">
        <Field
          label="Admin"
          value={adminFullLabel(entry.admin_name, entry.admin_email, entry.admin_user_id)}
        />
        <Field label="Target" value={`${entry.target_type} ${entry.target_id}`} />
        <Field label="Reason" value={entry.reason} />
        <Field label="IP address" value={entry.ip_address} />
        <Field label="User-Agent" value={entry.user_agent} />
        {entry.sp_user_id && <Field label="Service provider" value={entry.sp_user_id} />}
        {entry.to_sp_user_id && <Field label="To service provider" value={entry.to_sp_user_id} />}
      </dl>
      <div className="grid gap-4 md:grid-cols-2">
        <JsonBlock label="Before" value={entry.before_json} />
        <JsonBlock label="After" value={entry.after_json} />
      </div>
      <JsonBlock label="Details" value={entry.details} />
    </div>
  );
}

function EntryRow({
  entry,
  expanded,
  onToggle,
}: {
  entry: AuditEntry;
  expanded: boolean;
  onToggle: () => void;
}) {
  const detailsId = useId();
  const Chevron = expanded ? ChevronDown : ChevronRight;
  return (
    <Fragment>
      <TableRow>
        <TableCell className="w-10">
          <Button
            variant="ghost"
            size="icon"
            aria-label={expanded ? "Hide details" : "Show details"}
            aria-expanded={expanded}
            aria-controls={expanded ? detailsId : undefined}
            onClick={onToggle}
          >
            <Chevron />
          </Button>
        </TableCell>
        <TableCell>{formatAuditTime(entry.created_at)}</TableCell>
        <TableCell className={`hidden md:table-cell ${WRAP_ANYWHERE}`}>
          {adminLabel(entry.admin_name, entry.admin_email, entry.admin_user_id)}
        </TableCell>
        <TableCell className={WRAP_ANYWHERE}>{entry.action}</TableCell>
        {/* At phone width the expanded row carries the admin and the target. */}
        <TableCell className={`hidden md:table-cell ${WRAP_ANYWHERE}`}>
          <div>{entry.target_type}</div>
          <div className="font-mono text-xs text-muted-foreground">{entry.target_id}</div>
        </TableCell>
      </TableRow>
      {expanded && (
        <TableRow id={detailsId} className="hover:bg-transparent">
          <TableCell colSpan={5} className="bg-muted/30 p-4">
            <EntryDetails entry={entry} />
          </TableCell>
        </TableRow>
      )}
    </Fragment>
  );
}

function AuditLogPage() {
  const [filters, setFilters] = useState<AuditFilters>(NO_AUDIT_FILTERS);
  const [page, setPage] = useState(1);
  const [expandedIds, setExpandedIds] = useState<ReadonlySet<string>>(new Set());

  const options = useApiGet<AuditFilterOptions>("/admin/audit/filters");
  const entries = useApiGet<AuditPage>(auditPath(filters, page));

  function setFilter(name: keyof AuditFilters, value: string) {
    setFilters((current) => ({ ...current, [name]: value }));
    setPage(1);
  }

  function toggle(id: string) {
    setExpandedIds((current) => {
      const next = new Set(current);
      if (!next.delete(id)) {
        next.add(id);
      }
      return next;
    });
  }

  const known = options.status === "ready" ? options.data : null;

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Audit log</h1>
        <p className="text-sm text-muted-foreground">
          Every admin write action, newest first. Times are in your local time zone.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <FilterSelect
          label="Admin"
          value={filters.adminUserId}
          options={(known?.admins ?? []).map((admin) => ({
            value: admin.id,
            label: adminFullLabel(admin.name, admin.email, admin.id),
          }))}
          onChange={(value) => setFilter("adminUserId", value)}
        />
        <FilterSelect
          label="Action"
          value={filters.action}
          options={(known?.actions ?? []).map((action) => ({ value: action, label: action }))}
          onChange={(value) => setFilter("action", value)}
        />
        <FilterSelect
          label="Target type"
          value={filters.targetType}
          options={(known?.target_types ?? []).map((type) => ({ value: type, label: type }))}
          onChange={(value) => setFilter("targetType", value)}
        />
        <FilterDate label="From" value={filters.from} onChange={(v) => setFilter("from", v)} />
        <FilterDate label="To" value={filters.to} onChange={(v) => setFilter("to", v)} />
      </div>

      {/* The table still works without these: only the dropdowns have nothing to offer. */}
      {options.status === "error" && !isForbidden(options.error) && (
        <ErrorState message="Couldn't load the filter options." onRetry={options.retry} />
      )}

      {entries.status === "loading" && <LoadingState rows={5} />}
      {entries.status === "error" &&
        (isForbidden(entries.error) ? (
          // The role can change while the sidebar still shows the old one (see README).
          <ErrorState message="You don't have access to the audit log." />
        ) : (
          <ErrorState message="Couldn't load the audit log." onRetry={entries.retry} />
        ))}
      {entries.status === "ready" && entries.data.items.length === 0 && (
        <EmptyState message="No audit entries match these filters" />
      )}
      {entries.status === "ready" && entries.data.items.length > 0 && (
        <>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>
                  <span className="sr-only">Details</span>
                </TableHead>
                <TableHead>When</TableHead>
                <TableHead className="hidden md:table-cell">Admin</TableHead>
                <TableHead>Action</TableHead>
                <TableHead className="hidden md:table-cell">Target</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {entries.data.items.map((entry) => (
                <EntryRow
                  key={entry.id}
                  entry={entry}
                  expanded={expandedIds.has(entry.id)}
                  onToggle={() => toggle(entry.id)}
                />
              ))}
            </TableBody>
          </Table>
          <Pager
            page={entries.data.page}
            perPage={entries.data.per_page}
            total={entries.data.total}
            onPage={setPage}
          />
        </>
      )}
    </div>
  );
}

function Pager({
  page,
  perPage,
  total,
  onPage,
}: {
  page: number;
  perPage: number;
  total: number;
  onPage: (page: number) => void;
}) {
  const lastPage = Math.max(1, Math.ceil(total / perPage));
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <p className="text-sm text-muted-foreground">
        Page {page} of {lastPage} · {total} {total === 1 ? "entry" : "entries"}
      </p>
      <div className="flex gap-2">
        <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => onPage(page - 1)}>
          Previous
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={page >= lastPage}
          onClick={() => onPage(page + 1)}
        >
          Next
        </Button>
      </div>
    </div>
  );
}

function isForbidden(error: unknown): boolean {
  return error instanceof ApiError && error.status === 403;
}
