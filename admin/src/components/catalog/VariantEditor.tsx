/**
 * The variant editor on the service page (SVC-481), for admin and ops. Support
 * keeps the read-only list. Every row shows its price, commission % with the
 * amounts, duration, sort order, the customer's GST (read-only) and an on/off
 * switch; Add variant and Edit open VariantDialog.
 *
 * Every write returns the service, which goes straight on screen (onChanged): the
 * base price follows the cheapest active variant in the same answer.
 *
 * Switching is immediate. The last active variant can't be switched off (409
 * LAST_ACTIVE_VARIANT): the admin switches off the service instead.
 *
 * A scheduled commission change (SVC-486) shows under the row's commission, e.g.
 * "→ 25% from 6 Dec 2026", with Cancel. Cancel confirms first. On success, or
 * when the change has already applied or been cancelled (409
 * COMMISSION_CHANGE_NOT_SCHEDULED), the service is fetched again.
 *
 * Cards below the container's @3xl, a table from it.
 */
import { useRef, useState } from "react";
import { FormError } from "@/components/catalog/Field";
import { VariantDialog } from "@/components/catalog/VariantDialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
  cancelCommissionChange,
  catalogErrorMessage,
  durationLabel,
  getServiceDetail,
  setVariantActive,
  type PendingCommissionChange,
  type ServiceDetail,
  type ServiceVariantRow,
} from "@/lib/catalog";
import { pctLabel, pendingLabel } from "@/lib/catalog-variants";
import { formatRupees } from "@/lib/money";

const WRAP = "[overflow-wrap:anywhere]";

type Notice = { kind: "success" | "error"; text: string };
type Editing = { variant: ServiceVariantRow | null } | null;

export function VariantEditor({
  service,
  onChanged,
}: {
  service: ServiceDetail;
  onChanged: (detail: ServiceDetail) => void;
}) {
  const [editing, setEditing] = useState<Editing>(null);
  const [switching, setSwitching] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [cancelling, setCancelling] = useState<ServiceVariantRow | null>(null);
  const sorted = [...service.variants].sort((a, b) => a.sort_order - b.sort_order);
  // A new variant copies the first one's (by sort order) GST, as the backend does.
  const newGst = sorted[0]?.gst_percent ?? null;

  async function toggle(variant: ServiceVariantRow) {
    if (switching) return;
    setSwitching(variant.id);
    setNotice(null);
    const on = !variant.is_active;
    try {
      onChanged(await setVariantActive(service.id, variant.id, on));
      setNotice({
        kind: "success",
        text: on
          ? `${variant.label} is on. Customers can book it.`
          : `${variant.label} is off. Customers can't book it; pros' prices on it are kept.`,
      });
    } catch (err) {
      setNotice({ kind: "error", text: catalogErrorMessage(err) });
    } finally {
      setSwitching(null);
    }
  }

  const duration = (variant: ServiceVariantRow) =>
    variant.duration_minutes ? durationLabel(variant.duration_minutes) : null;

  const pendingFor = (variant: ServiceVariantRow) => {
    const change = variant.pending_commission_change;
    if (!change) return null;
    return (
      <span className="mt-1 flex flex-wrap items-center gap-2 text-xs @3xl:justify-end">
        <span className="font-medium text-primary tabular-nums">{pendingLabel(change)}</span>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-7 px-2 text-xs"
          aria-label={`Cancel the commission change on ${variant.label}`}
          onClick={() => {
            setNotice(null);
            setCancelling(variant);
          }}
        >
          Cancel
        </Button>
      </span>
    );
  };

  const switchFor = (variant: ServiceVariantRow) => (
    <ActiveSwitch
      label={variant.label}
      checked={variant.is_active}
      busy={switching === variant.id}
      disabled={switching !== null}
      onToggle={() => toggle(variant)}
    />
  );
  const editFor = (variant: ServiceVariantRow) => (
    <Button
      type="button"
      variant="outline"
      size="sm"
      aria-label={`Edit ${variant.label}`}
      onClick={() => {
        setNotice(null);
        setEditing({ variant });
      }}
    >
      Edit
    </Button>
  );

  return (
    <div className="@container space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">
          Commission is the platform's share of the price; the payout is the rest. Customer GST is
          read-only.
        </p>
        <Button
          type="button"
          className="w-full @md:w-auto"
          onClick={() => {
            setNotice(null);
            setEditing({ variant: null });
          }}
        >
          Add variant
        </Button>
      </div>

      {notice && (
        <Alert
          variant={notice.kind === "error" ? "destructive" : "default"}
          role={notice.kind === "error" ? "alert" : "status"}
          className={notice.kind === "success" ? "border-success/40 bg-success/10" : ""}
        >
          <AlertDescription className={WRAP}>{notice.text}</AlertDescription>
        </Alert>
      )}

      {sorted.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No variants. It books at its base price until one is added.
        </p>
      ) : (
        <>
          <ul aria-label="Variants" className="divide-y rounded-md border @3xl:hidden">
            {sorted.map((variant) => (
              <li key={variant.id} className="space-y-2 px-3 py-3 text-sm">
                <div className={`space-y-0.5 ${variant.is_active ? "" : "opacity-60"}`}>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className={`font-medium ${WRAP}`}>{variant.label}</span>
                    <span className="tabular-nums">{formatRupees(variant.base_price)}</span>
                  </div>
                  <p className="text-xs text-muted-foreground tabular-nums">
                    {pctLabel(variant.commission_pct)} commission ·{" "}
                    {formatRupees(variant.platform_commission)} /{" "}
                    {formatRupees(variant.provider_payout)} payout
                  </p>
                  {pendingFor(variant)}
                  <p className="text-xs text-muted-foreground tabular-nums">
                    {[
                      duration(variant) ?? "Service's duration",
                      `sort ${variant.sort_order}`,
                      `GST ${pctLabel(variant.gst_percent)} (read-only)`,
                    ].join(" · ")}
                  </p>
                </div>
                <div className="flex items-center justify-between gap-2">
                  {switchFor(variant)}
                  {editFor(variant)}
                </div>
              </li>
            ))}
          </ul>

          <div className="hidden overflow-x-auto rounded-md border [color-scheme:light_dark] @3xl:block">
            <Table aria-label="Variants">
              <TableHeader>
                <TableRow>
                  <TableHead>Label</TableHead>
                  <TableHead className="text-right">Price</TableHead>
                  <TableHead className="text-right">Commission</TableHead>
                  <TableHead>Duration</TableHead>
                  <TableHead className="text-right">Sort</TableHead>
                  <TableHead className="text-right">Customer GST (read-only)</TableHead>
                  <TableHead>Active</TableHead>
                  <TableHead>
                    <span className="sr-only">Edit</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sorted.map((variant) => {
                  const dim = variant.is_active ? "" : "opacity-60";
                  return (
                    <TableRow key={variant.id}>
                      <TableCell className={`whitespace-normal ${WRAP} ${dim}`}>
                        {variant.label}
                      </TableCell>
                      <TableCell className={`text-right tabular-nums ${dim}`}>
                        {formatRupees(variant.base_price)}
                      </TableCell>
                      <TableCell className={`text-right tabular-nums ${dim}`}>
                        {pctLabel(variant.commission_pct)}
                        <span className="block text-xs text-muted-foreground">
                          {formatRupees(variant.platform_commission)} · payout{" "}
                          {formatRupees(variant.provider_payout)}
                        </span>
                        {pendingFor(variant)}
                      </TableCell>
                      <TableCell className={dim}>{duration(variant) ?? "—"}</TableCell>
                      <TableCell className={`text-right tabular-nums ${dim}`}>
                        {variant.sort_order}
                      </TableCell>
                      <TableCell className={`text-right tabular-nums ${dim}`}>
                        {pctLabel(variant.gst_percent)}
                      </TableCell>
                      <TableCell>{switchFor(variant)}</TableCell>
                      <TableCell className="text-right">{editFor(variant)}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </>
      )}

      {editing && (
        <VariantDialog
          serviceId={service.id}
          variant={editing.variant}
          gstPercent={editing.variant ? editing.variant.gst_percent : newGst}
          onClose={() => setEditing(null)}
          onSaved={(detail, message) => {
            setEditing(null);
            if (detail) onChanged(detail);
            setNotice({ kind: "success", text: message });
          }}
          onRefreshed={(detail) => {
            onChanged(detail);
            const row = detail.variants.find((v) => v.id === editing.variant?.id);
            if (row) setEditing({ variant: row });
          }}
        />
      )}

      {cancelling?.pending_commission_change && (
        <CancelChangeDialog
          serviceId={service.id}
          variant={cancelling}
          change={cancelling.pending_commission_change}
          onClose={() => setCancelling(null)}
          onDone={(detail, next) => {
            setCancelling(null);
            if (detail) onChanged(detail);
            setNotice(next);
          }}
        />
      )}
    </div>
  );
}

/**
 * "Cancel the commission change?" (SVC-486). Built on Dialog like the catalog's
 * other confirms, with role="alertdialog". The backend tells the pros who were
 * notified that it's cancelled.
 */
function CancelChangeDialog({
  serviceId,
  variant,
  change,
  onClose,
  onDone,
}: {
  serviceId: string;
  variant: ServiceVariantRow;
  change: PendingCommissionChange;
  onClose: () => void;
  /** Null detail: the service couldn't be fetched again. */
  onDone: (detail: ServiceDetail | null, notice: Notice) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);

  async function refetched(): Promise<ServiceDetail | null> {
    try {
      return await getServiceDetail(serviceId);
    } catch {
      return null;
    }
  }

  async function cancel() {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError(null);
    try {
      await cancelCommissionChange(serviceId, variant.id, change.id);
      const detail = await refetched();
      const reload = detail ? "" : " Reload the page to see it.";
      onDone(detail, {
        kind: "success",
        text: `The commission change on ${variant.label} is cancelled. It stays at ${pctLabel(variant.commission_pct)}.${reload}`,
      });
    } catch (err) {
      if (err instanceof ApiError && err.code === "COMMISSION_CHANGE_NOT_SCHEDULED") {
        // It applied or was cancelled meanwhile: show the row as it is now.
        const detail = await refetched();
        onDone(detail, { kind: "error", text: catalogErrorMessage(err) });
      } else {
        setError(catalogErrorMessage(err));
      }
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && !inFlight.current && onClose()}>
      <DialogContent role="alertdialog" className="grid-cols-[minmax(0,1fr)]">
        <DialogHeader>
          <DialogTitle className="[overflow-wrap:anywhere]">
            Cancel the commission change on {variant.label}?
          </DialogTitle>
          <DialogDescription className="tabular-nums">
            {pctLabel(variant.commission_pct)} {pendingLabel(change)} won't happen. Pros who were
            told get a notice that it's cancelled.
          </DialogDescription>
        </DialogHeader>
        {error && <FormError message={error} />}
        <DialogFooter className="gap-2">
          <Button type="button" variant="outline" disabled={busy} onClick={onClose}>
            Keep it
          </Button>
          <Button type="button" variant="destructive" disabled={busy} onClick={cancel}>
            {busy ? "Cancelling…" : "Cancel the change"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** An on/off switch: a button with role="switch", token colours only. */
function ActiveSwitch({
  label,
  checked,
  busy,
  disabled,
  onToggle,
}: {
  label: string;
  checked: boolean;
  busy: boolean;
  disabled: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={`Active: ${label}`}
      aria-busy={busy || undefined}
      disabled={disabled}
      onClick={onToggle}
      className="inline-flex items-center gap-2 rounded-md text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60"
    >
      <span
        aria-hidden
        className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full border transition-colors ${
          checked ? "border-primary bg-primary" : "border-input bg-muted"
        }`}
      >
        <span
          className={`inline-block size-4 rounded-full bg-background shadow-sm transition-transform ${
            checked ? "translate-x-4" : "translate-x-0.5"
          }`}
        />
      </span>
      <span className="text-xs text-muted-foreground">
        {busy ? "Saving…" : checked ? "On" : "Off"}
      </span>
    </button>
  );
}
