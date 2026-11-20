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
 * Cards below the container's @3xl, a table from it.
 */
import { useState } from "react";
import { VariantDialog } from "@/components/catalog/VariantDialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  catalogErrorMessage,
  durationLabel,
  setVariantActive,
  type ServiceDetail,
  type ServiceVariantRow,
} from "@/lib/catalog";
import { pctLabel } from "@/lib/catalog-variants";
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
            onChanged(detail);
            setNotice({ kind: "success", text: message });
          }}
        />
      )}
    </div>
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
