/**
 * The spinner that follows the finger during a pull-to-refresh.
 *
 * Rendered by the screens that opt into `usePullToRefresh`. Sits below the
 * sticky header (z-20 against the header's z-30) so it appears to emerge from
 * behind it rather than covering it.
 *
 * Three visual states, because two were not enough: pulling (grey, following
 * the finger), armed (filled with the brand colour — releasing now WILL
 * refresh), and refreshing (spinning). The armed state is the important one;
 * without it there is no way to tell a pull that will fire from one that will
 * snap back, and the gesture feels like a guess.
 */
import { Loader2 } from "lucide-react";

interface PullToRefreshIndicatorProps {
  /** Current pull distance in px, from `usePullToRefresh`. */
  pull: number;
  refreshing: boolean;
  /** Pull has passed the commit threshold — releasing will refresh. */
  armed?: boolean;
}

export function PullToRefreshIndicator({
  pull,
  refreshing,
  armed = false,
}: PullToRefreshIndicatorProps) {
  if (pull <= 0 && !refreshing) return null;

  const active = armed || refreshing;

  return (
    <div
      className="pointer-events-none fixed left-0 right-0 z-20 mx-auto flex max-w-md justify-center"
      style={{ top: `${Math.max(0, pull) - 4}px` }}
      aria-hidden
    >
      <div
        className={`flex h-10 w-10 items-center justify-center rounded-full shadow-md transition-colors ${
          active ? "bg-primary" : "bg-card"
        }`}
        style={{
          // Grows into place rather than appearing at full size, so the first
          // few px of the drag already show something happening.
          transform: `scale(${Math.min(1, 0.6 + pull / 80)})`,
        }}
      >
        <Loader2
          className={`h-5 w-5 ${active ? "text-primary-foreground" : "text-muted-foreground"} ${
            refreshing ? "animate-spin" : ""
          }`}
          // Before release the icon rotates with the pull, so the gesture
          // feels connected to the finger rather than binary.
          style={refreshing ? undefined : { transform: `rotate(${pull * 4}deg)` }}
        />
      </div>
    </div>
  );
}
