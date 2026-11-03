/**
 * The "we could not load this" block, with a retry. Duplicated from the
 * consumer app's src/components/ErrorState.tsx (SVC-421).
 *
 * Render order matters: isLoading → isError → empty → data. Checking empty
 * before isError turns a failed request into "nothing here", which on an
 * admin screen reads as "no KYC pending" when the queue simply didn't load.
 */
import { AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ErrorStateProps {
  /** What failed, in the operator's terms: "Couldn't load the KYC queue." */
  message: string;
  /** Usually a query's `refetch`. */
  onRetry?: () => unknown;
}

export function ErrorState({ message, onRetry }: ErrorStateProps) {
  return (
    <div
      role="alert"
      className="flex flex-col items-center justify-center gap-3 px-8 py-12 text-center"
    >
      <AlertCircle className="h-8 w-8 text-destructive" />
      <p className="text-sm text-muted-foreground">{message}</p>
      {onRetry && (
        <Button size="sm" onClick={() => onRetry()}>
          Try again
        </Button>
      )}
    </div>
  );
}
