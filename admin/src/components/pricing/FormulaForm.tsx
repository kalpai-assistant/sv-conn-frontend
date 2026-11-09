/**
 * The formula tab's body (SVC-428): the five ranking weights, the boost window
 * and the sheet TTL. Text inputs, not sliders: weight tuning is exact-value work
 * (ticket). One key per PATCH, so each save is one audit row.
 *
 * Inputs keep what was typed when a save fails, so a refusal costs no retyping;
 * the stored value and "Last changed" move only on success.
 */
import { useId, useState, type FormEvent, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  WEIGHT_KEYS,
  WEIGHT_LABELS,
  formatIstDate,
  parseWeight,
  parseWholeNumber,
  patchConfig,
  pricingErrorMessage,
  readWeights,
  weightSum,
  weightsSumOk,
  type IntConfigKey,
  type PricingConfigRow,
  type RankingWeights,
  type WeightKey,
} from "@/lib/pricing";

type SaveStatus =
  { kind: "idle" } | { kind: "saving" } | { kind: "saved" } | { kind: "error"; message: string };

const IDLE: SaveStatus = { kind: "idle" };

interface FormulaFormProps {
  rows: PricingConfigRow[];
  canEdit: boolean;
}

export function FormulaForm({ rows, canEdit }: FormulaFormProps) {
  const [configRows, setConfigRows] = useState(rows);
  const byKey = new Map(configRows.map((row) => [row.key, row]));
  const onSaved = (saved: PricingConfigRow) =>
    setConfigRows((current) => current.map((row) => (row.key === saved.key ? saved : row)));
  const shared = { canEdit, onSaved };

  return (
    <div className="space-y-8">
      <WeightsSection row={byKey.get("ranking_weights")} {...shared} />
      <ConfigSection title="Boost window">
        <IntConfigField
          configKey="boost_window_days"
          label="Days from KYC pass"
          row={byKey.get("boost_window_days")}
          {...shared}
        />
        <IntConfigField
          configKey="boost_window_jobs"
          label="Max completed jobs"
          row={byKey.get("boost_window_jobs")}
          {...shared}
        />
      </ConfigSection>
      <ConfigSection title="Sheet quote TTL">
        <IntConfigField
          configKey="sheet_ttl_seconds"
          label="Seconds"
          row={byKey.get("sheet_ttl_seconds")}
          {...shared}
        />
      </ConfigSection>
    </div>
  );
}

function ConfigSection({ title, children }: { title: string; children: ReactNode }) {
  const id = useId();
  return (
    <section aria-labelledby={id} className="space-y-4 rounded-lg border bg-card p-4">
      <h2 id={id} className="font-semibold">
        {title}
      </h2>
      {children}
    </section>
  );
}

function LastChanged({ row }: { row: PricingConfigRow }) {
  return (
    <p className="text-xs text-muted-foreground">Last changed {formatIstDate(row.updated_at)}</p>
  );
}

function StatusLine({ status }: { status: SaveStatus }) {
  if (status.kind === "error") {
    return (
      <p role="alert" className="text-sm text-destructive">
        {status.message}
      </p>
    );
  }
  return (
    <p role="status" className="text-sm text-muted-foreground">
      {status.kind === "saving" ? "Saving…" : status.kind === "saved" ? "Saved." : ""}
    </p>
  );
}

function Missing({ what }: { what: string }) {
  return (
    <p role="alert" className="text-sm text-destructive">
      {what} isn't set up on the backend. Nothing here can be saved until it is.
    </p>
  );
}

function asDrafts(weights: RankingWeights): Record<WeightKey, string> {
  return Object.fromEntries(WEIGHT_KEYS.map((key) => [key, String(weights[key])])) as Record<
    WeightKey,
    string
  >;
}

interface SectionProps {
  row: PricingConfigRow | undefined;
  canEdit: boolean;
  onSaved: (row: PricingConfigRow) => void;
}

function WeightsSection({ row, canEdit, onSaved }: SectionProps) {
  const stored = readWeights(row?.value);
  return (
    <ConfigSection title="Ranking formula weights">
      {row && stored ? (
        <WeightsForm row={row} stored={stored} canEdit={canEdit} onSaved={onSaved} />
      ) : (
        <Missing what="The ranking weights row" />
      )}
    </ConfigSection>
  );
}

function WeightsForm({
  row,
  stored,
  canEdit,
  onSaved,
}: SectionProps & { row: PricingConfigRow; stored: RankingWeights }) {
  const [drafts, setDrafts] = useState(() => asDrafts(stored));
  const [status, setStatus] = useState<SaveStatus>(IDLE);
  const idBase = useId();

  const parsed = Object.fromEntries(
    WEIGHT_KEYS.map((key) => [key, parseWeight(drafts[key])]),
  ) as Record<WeightKey, number | null>;
  const allValid = WEIGHT_KEYS.every((key) => parsed[key] !== null);
  const sum = weightSum(parsed);
  const sumOk = allValid && weightsSumOk(sum);
  const changed = WEIGHT_KEYS.some((key) => parsed[key] !== stored[key]);

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!sumOk || !changed || status.kind === "saving") return;
    setStatus({ kind: "saving" });
    try {
      const saved = await patchConfig("ranking_weights", parsed as RankingWeights);
      onSaved(saved);
      const next = readWeights(saved.value);
      if (next) setDrafts(asDrafts(next));
      setStatus({ kind: "saved" });
    } catch (err) {
      setStatus({ kind: "error", message: pricingErrorMessage(err) });
    }
  }

  return (
    <form onSubmit={save} className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Each from 0 to 1. Together they must sum to 1.00.
      </p>
      <div className="space-y-3">
        {WEIGHT_KEYS.map((key) => {
          const id = `${idBase}-${key}`;
          const value = parsed[key];
          const bad = value === null;
          return (
            <div
              key={key}
              className="grid grid-cols-[minmax(0,9rem)_6rem_minmax(0,1fr)] items-center gap-3"
            >
              <Label htmlFor={canEdit ? id : undefined}>{WEIGHT_LABELS[key]}</Label>
              {canEdit ? (
                <Input
                  id={id}
                  value={drafts[key]}
                  inputMode="decimal"
                  autoComplete="off"
                  aria-invalid={bad || undefined}
                  aria-describedby={bad ? `${id}-error` : undefined}
                  className="h-8 tabular-nums"
                  onChange={(event) => {
                    setDrafts((current) => ({ ...current, [key]: event.target.value }));
                    setStatus(IDLE);
                  }}
                />
              ) : (
                <span className="tabular-nums">{stored[key]}</span>
              )}
              <div aria-hidden="true" className="h-2 max-w-64 rounded-full bg-muted">
                <div
                  className="h-2 rounded-full bg-primary"
                  style={{ width: `${Math.min(1, value ?? 0) * 100}%` }}
                />
              </div>
              {bad && (
                <p
                  id={`${id}-error`}
                  role="alert"
                  className="col-start-2 col-end-4 text-xs text-destructive"
                >
                  A number from 0 to 1.
                </p>
              )}
            </div>
          );
        })}
      </div>
      <p
        aria-live="polite"
        className={`text-sm font-medium tabular-nums ${sumOk ? "text-success" : "text-destructive"}`}
      >
        Current sum: {allValid ? sum.toFixed(2) : "—"} {sumOk ? "✓" : "✗"}
        <span className="sr-only">{sumOk ? " (valid)" : " (must be 1.00)"}</span>
      </p>
      {canEdit && (
        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" disabled={!sumOk || !changed || status.kind === "saving"}>
            Save weights
          </Button>
          <StatusLine status={status} />
        </div>
      )}
      <LastChanged row={row} />
    </form>
  );
}

function IntConfigField({
  configKey,
  label,
  row,
  canEdit,
  onSaved,
}: SectionProps & { configKey: IntConfigKey; label: string }) {
  const stored = typeof row?.value === "number" ? row.value : null;
  const [draft, setDraft] = useState(stored === null ? "" : String(stored));
  const [status, setStatus] = useState<SaveStatus>(IDLE);
  const id = useId();

  if (!row || stored === null) {
    return <Missing what={`${label} (${configKey})`} />;
  }

  const parsed = parseWholeNumber(draft);
  const bad = parsed === null;
  const changed = !bad && parsed !== stored;

  async function save(event: FormEvent) {
    event.preventDefault();
    if (parsed === null || !changed || status.kind === "saving") return;
    setStatus({ kind: "saving" });
    try {
      const saved = await patchConfig(configKey, parsed);
      onSaved(saved);
      if (typeof saved.value === "number") setDraft(String(saved.value));
      setStatus({ kind: "saved" });
    } catch (err) {
      setStatus({ kind: "error", message: pricingErrorMessage(err) });
    }
  }

  return (
    <form onSubmit={save} className="space-y-1.5">
      <Label htmlFor={canEdit ? id : undefined}>{label}</Label>
      {canEdit ? (
        <div className="flex flex-wrap items-center gap-3">
          <Input
            id={id}
            value={draft}
            inputMode="numeric"
            autoComplete="off"
            aria-invalid={bad || undefined}
            aria-describedby={bad ? `${id}-error` : undefined}
            className="h-9 w-32 tabular-nums"
            onChange={(event) => {
              setDraft(event.target.value);
              setStatus(IDLE);
            }}
          />
          <Button
            type="submit"
            aria-label={`Save ${label}`}
            disabled={!changed || status.kind === "saving"}
          >
            Save
          </Button>
          <StatusLine status={status} />
        </div>
      ) : (
        <p className="tabular-nums">{stored}</p>
      )}
      {canEdit && bad && (
        <p id={`${id}-error`} role="alert" className="text-xs text-destructive">
          A whole number greater than 0.
        </p>
      )}
      <LastChanged row={row} />
    </form>
  );
}
