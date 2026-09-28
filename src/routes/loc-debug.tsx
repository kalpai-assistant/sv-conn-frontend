/**
 * Location diagnostics (SVC-320, temporary).
 *
 * ## Why this page exists
 *
 * The iOS half of the location gate has now been guessed at twice, and both
 * guesses shipped. The unknown underneath both is one question that only a
 * real iPhone can answer:
 *
 *   does Safari implement `navigator.permissions.query({name:"geolocation"})`,
 *   and what does it report when Location Services is off?
 *
 * Everything else follows from that. If the query works, iOS can answer the
 * gate's question without a position request and without a user gesture, and
 * cases 1-3 reach Android parity. If it does not, the gate has to open neutral
 * and let the Enable tap produce the answer.
 *
 * Android cannot stand in for this: Chrome supports the query, Safari is the
 * unknown. Simulating Safari by deleting `navigator.permissions` only tests
 * the assumption being questioned.
 *
 * ## Read it, then delete it
 *
 * This route is a measuring instrument, not a feature. It is unlinked — reach
 * it by typing /loc-debug — and it should be removed in the same PR that acts
 * on what it measures. It deliberately runs no automatic position request:
 * that is the very call whose ungestured behaviour is in question, so firing
 * it on mount would destroy the reading.
 */
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";

export const Route = createFileRoute("/loc-debug")({
  component: LocationDebugPage,
});

interface Reading {
  label: string;
  value: string;
}

/** A position attempt, timed. The elapsed ms is the interesting part. */
interface Attempt {
  outcome: string;
  ms: number;
  /**
   * An instant refusal means the browser decided without asking anyone — the
   * system toggle is off, or the origin is blocked. A human answering a prompt
   * takes seconds. This is the only signal that separates those two on the
   * web, and it is a heuristic, not proof.
   */
  prompted: string;
}

function LocationDebugPage() {
  const [readings, setReadings] = useState<Reading[]>([]);
  const [attempt, setAttempt] = useState<Attempt | null>(null);
  const [running, setRunning] = useState(false);

  useEffect(() => {
    const out: Reading[] = [];

    out.push({ label: "userAgent", value: navigator.userAgent });
    out.push({
      label: "standalone (home-screen PWA)",
      value: String(
        window.matchMedia?.("(display-mode: standalone)").matches ||
          (navigator as unknown as { standalone?: boolean }).standalone === true,
      ),
    });
    out.push({
      label: "navigator.permissions",
      value: navigator.permissions ? "present" : "ABSENT",
    });
    out.push({
      label: "navigator.geolocation",
      value: "geolocation" in navigator ? "present" : "ABSENT",
    });

    setReadings(out);

    // The headline reading. Wrapped because Safari has historically thrown
    // on an unsupported permission name rather than returning a state.
    void (async () => {
      let value: string;
      try {
        const status = await navigator.permissions.query({
          name: "geolocation" as PermissionName,
        });
        value = `state = "${status.state}"`;
      } catch (err) {
        value = `THREW: ${(err as Error)?.message ?? String(err)}`;
      }
      setReadings((prev) => [...prev, { label: "permissions.query(geolocation)", value }]);
    })();
  }, []);

  /**
   * Fired from a tap, never on mount. The gesture is the variable under test:
   * iOS Safari is reported to refuse an ungestured request outright, so a
   * reading taken without one would measure the wrong thing.
   */
  const attemptPosition = () => {
    setRunning(true);
    setAttempt(null);
    const started = Date.now();

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const ms = Date.now() - started;
        setRunning(false);
        setAttempt({
          outcome: `OK  ${pos.coords.latitude.toFixed(4)}, ${pos.coords.longitude.toFixed(4)}`,
          ms,
          prompted: ms > 1000 ? "likely (took over 1s)" : "no — answered from a cached grant",
        });
      },
      (err) => {
        const ms = Date.now() - started;
        const names = ["", "PERMISSION_DENIED", "POSITION_UNAVAILABLE", "TIMEOUT"];
        setRunning(false);
        setAttempt({
          outcome: `FAILED  code ${err.code} (${names[err.code] ?? "?"}) — ${err.message}`,
          ms,
          prompted:
            ms < 300
              ? "NO — refused instantly, nothing was shown to you"
              : "yes — something waited on you",
        });
      },
      { enableHighAccuracy: false, timeout: 15_000, maximumAge: 0 },
    );
  };

  return (
    <div className="min-h-screen bg-background px-5 py-8">
      <h1 className="text-xl font-semibold text-foreground">Location diagnostics</h1>
      <p className="mt-1 text-xs text-muted-foreground">
        SVC-320 · temporary page · screenshot this and send it back
      </p>

      <section className="mt-6 space-y-3">
        {readings.map((r) => (
          <div key={r.label} className="rounded-lg border border-border bg-card p-3">
            <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              {r.label}
            </p>
            <p className="mt-1 break-words font-mono text-xs text-foreground">{r.value}</p>
          </div>
        ))}
      </section>

      <button
        type="button"
        onClick={attemptPosition}
        disabled={running}
        className="mt-6 w-full rounded-lg bg-primary px-4 py-3 text-sm font-medium text-primary-foreground disabled:opacity-60"
      >
        {running ? "Asking…" : "Ask for my location"}
      </button>

      {attempt && (
        <div className="mt-4 rounded-lg border border-border bg-card p-3">
          <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            result
          </p>
          <p className="mt-1 break-words font-mono text-xs text-foreground">{attempt.outcome}</p>
          <p className="mt-2 font-mono text-xs text-muted-foreground">took {attempt.ms} ms</p>
          <p className="mt-1 font-mono text-xs text-muted-foreground">
            prompt shown? {attempt.prompted}
          </p>
        </div>
      )}

      <p className="mt-6 text-xs leading-relaxed text-muted-foreground">
        Run this twice: once with iOS Location Services <strong>on</strong>, once with it{" "}
        <strong>off</strong> (Settings → Privacy &amp; Security → Location Services). The pair is
        what tells us whether the two states are distinguishable on iOS at all.
      </p>
    </div>
  );
}
