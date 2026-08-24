/**
 * The spinner that follows the finger during a pull-to-refresh.
 *
 * Rendered by the screens that opt into `usePullToRefresh`. Sits below the
 * sticky header (z-20 against the header's z-30) so it appears to emerge from
 * behind it rather than covering it.
 */
import { Loader2 } from "lucide-react";

interface PullToRefreshIndicatorProps {
  /** Current pull distance in px, from `usePullToRefresh`. */
  pull: number;
  refreshing: boolean;
}

export function PullToRefreshIndicator({ pull, refreshing }: PullToRefreshIndicatorProps) {
  if (pull <= 0 && !refreshing) return null;

  return (
    <div
      className="pointer-events-none fixed left-0 right-0 z-20 mx-auto flex max-w-md justify-center"
      style={{ top: `${Math.max(0, pull) - 8}px` }}
      aria-hidden
    >
      <div className="flex h-9 w-9 items-center justify-center rounded-full bg-card shadow-md">
        <Loader2
          className={`h-4 w-4 text-primary ${refreshing ? "animate-spin" : ""}`}
          // Before release the icon rotates with the pull, so the gesture
          // feels connected to the finger rather than binary.
          style={refreshing ? undefined : { transform: `rotate(${pull * 3}deg)` }}
        />
      </div>
    </div>
  );
}
