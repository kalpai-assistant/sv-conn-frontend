/**
 * Placeholder rows while something loads, announced to screen readers.
 * Adapted from the consumer app's LoadingRegion + Skeleton (SVC-421); the
 * admin app is English-only, so the label is literal rather than translated.
 */
import { Skeleton } from "@/components/ui/skeleton";

export function LoadingState({ rows = 3 }: { rows?: number }) {
  return (
    <div role="status" aria-busy="true" className="space-y-3 py-4">
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} className="h-10 w-full" />
      ))}
      <span className="sr-only">Loading…</span>
    </div>
  );
}
