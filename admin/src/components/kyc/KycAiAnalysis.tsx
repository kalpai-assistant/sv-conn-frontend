/**
 * The AI section of the KYC detail, ported from the consumer app's admin.kyc.tsx.
 * A null verdict means the AI never scored this submission. The raw model response
 * is never shown.
 */
import { useState } from "react";
import { Sparkles } from "lucide-react";
import {
  confidencePct,
  humanFlag,
  looksMismatched,
  verdictBadge,
  type KycVerdict,
} from "@/lib/kyc";

const FIELD_CELL = "px-2 py-2 font-medium text-foreground sm:px-3";
const VALUE_CELL = "px-2 py-2 sm:px-3";

export function KycAiAnalysis({
  verdict,
  statedName,
}: {
  verdict: KycVerdict | null;
  statedName: string | null;
}) {
  const badge = verdictBadge(verdict);
  return (
    <section className="rounded-lg border bg-card p-4">
      <div className="mb-3 flex items-center gap-2">
        <Sparkles className="h-4 w-4 text-primary" aria-hidden="true" />
        <h3 className="text-sm font-medium text-foreground">AI Analysis</h3>
      </div>

      <span
        className={`inline-flex items-center rounded-xl px-3 py-1 text-xs font-semibold ${badge.className}`}
      >
        {badge.label}
      </span>

      {!verdict && (
        <p className="mt-3 text-xs text-muted-foreground">
          Submitted before AI verification was live — the reviewer decides on the docs alone.
        </p>
      )}

      {verdict && (
        <>
          <ConfidenceBar value={verdict.confidence} />
          <FlagsList flags={verdict.flags} />
          <ComparisonTable verdict={verdict} statedName={statedName} />
        </>
      )}
    </section>
  );
}

function ConfidenceBar({ value }: { value: number }) {
  const pct = confidencePct(value);
  return (
    <div className="mt-4">
      <div className="mb-1 flex items-center justify-between text-xs text-muted-foreground">
        <span>Confidence</span>
        <span className="tabular-nums">{pct}%</span>
      </div>
      <div
        className="h-2 w-full overflow-hidden rounded-full bg-secondary"
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label="AI confidence"
      >
        <div className="h-full bg-primary transition-all" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function FlagsList({ flags }: { flags: string[] }) {
  if (flags.length === 0) return null;
  return (
    <div className="mt-4">
      <p className="mb-1 text-xs font-medium text-foreground">Flags</p>
      <ul className="list-disc space-y-1 pl-5 text-xs text-muted-foreground">
        {flags.map((flag) => (
          <li key={flag}>{humanFlag(flag)}</li>
        ))}
      </ul>
    </div>
  );
}

function ComparisonTable({
  verdict,
  statedName,
}: {
  verdict: KycVerdict;
  statedName: string | null;
}) {
  const { extracted } = verdict;
  return (
    // Fixed layout holds the width at phone size, and break-words wraps one long
    // unbroken name inside its cell instead of clipping the last column.
    <div className="mt-4 overflow-hidden rounded-lg border">
      <table className="w-full table-fixed text-xs [&_td]:break-words [&_th]:break-words">
        <thead className="bg-secondary/40 text-left uppercase tracking-wide text-muted-foreground">
          <tr>
            <th className="w-20 px-2 py-2 font-medium sm:w-24 sm:px-3">Field</th>
            <th className="px-2 py-2 font-medium sm:px-3">Provider stated</th>
            <th className="px-2 py-2 font-medium sm:px-3">AI extracted</th>
          </tr>
        </thead>
        <tbody>
          <ComparisonRow
            field="Name"
            stated={statedName}
            extracted={extracted.name_en}
            mismatch={looksMismatched(statedName, extracted.name_en)}
          />
          {/* The backend has no stated DOB to send, so this side is always a dash. */}
          <ComparisonRow field="DOB" stated={null} extracted={extracted.dob} mismatch={false} />
          <ComparisonRow
            field="Aadhaar #"
            stated={null}
            extracted={extracted.aadhaar_last4 ? `XXXX-XXXX-${extracted.aadhaar_last4}` : null}
            mismatch={false}
          />
          <AddressRow address={extracted.address} />
        </tbody>
      </table>
    </div>
  );
}

function ComparisonRow({
  field,
  stated,
  extracted,
  mismatch,
}: {
  field: string;
  stated: string | null;
  extracted: string | null;
  mismatch: boolean;
}) {
  // Sets its own text colour: night mode swaps the token to a light one, which
  // can't be read on a fixed light background.
  const highlight = mismatch ? "bg-amber-100 text-amber-950" : "";
  return (
    <tr className="border-t">
      <td className={FIELD_CELL}>{field}</td>
      <td className={`${VALUE_CELL} ${highlight}`}>{stated ?? "—"}</td>
      <td className={`${VALUE_CELL} ${highlight}`}>{extracted ?? "—"}</td>
    </tr>
  );
}

const ADDRESS_PREVIEW_LENGTH = 60;

function AddressRow({ address }: { address: string | null }) {
  const [expanded, setExpanded] = useState(false);
  const long = !!address && address.length > ADDRESS_PREVIEW_LENGTH;
  return (
    <tr className="border-t">
      <td className={FIELD_CELL}>Address</td>
      <td className={VALUE_CELL}>—</td>
      <td className={VALUE_CELL}>
        {long ? (
          <button
            type="button"
            onClick={() => setExpanded((current) => !current)}
            className="text-left"
            aria-expanded={expanded}
          >
            {expanded ? address : `${address.slice(0, ADDRESS_PREVIEW_LENGTH)}…`}
            <span className="ml-1 text-primary">{expanded ? "less" : "more"}</span>
          </button>
        ) : (
          (address ?? "—")
        )}
      </td>
    </tr>
  );
}
