/**
 * One real review quote under a service card (SVC-388):
 * "Finally the clean I like." — Priya, 2 days ago
 *
 * Real reviews-table data, picked server-side, so it satisfies the
 * social-proof rule in docs/WIREFRAMES.md the cards otherwise guard. No
 * snippet renders nothing — never placeholder text in its place.
 *
 * Shared by `ServiceCard` and `home/ServiceCardCompact`. Clamped to two
 * lines, so a card grows by at most that much.
 */
import type { ReviewSnippet } from "@/lib/mock-data";
import { formatDaysAgo } from "@/lib/date";

export function ReviewSnippetLine({ snippet }: { snippet: ReviewSnippet | null | undefined }) {
  if (!snippet) return null;

  // A deleted reviewer keeps their review but loses their name (SVC-367).
  const name = snippet.reviewerFirstName || "Customer";

  return (
    <p className="line-clamp-2 text-[11px] italic leading-snug text-muted-foreground">
      “{snippet.text}” — {name}, {formatDaysAgo(snippet.createdAt)}
    </p>
  );
}
