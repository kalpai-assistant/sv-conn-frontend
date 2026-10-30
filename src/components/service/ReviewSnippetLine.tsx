/**
 * One real review quote under a service card (SVC-388):
 * "Finally the clean I like." — Priya, 2 days ago
 *
 * Real reviews-table data, picked server-side, so it satisfies the
 * social-proof rule in docs/WIREFRAMES.md the cards otherwise guard. No
 * snippet renders nothing — never placeholder text in its place.
 *
 * Shared by `ServiceCard` and `home/ServiceCardCompact`. The quote is
 * clamped to two lines and the attribution sits on its own truncated line:
 * on the w-40 rail card a full 80-char quote fills both clamped lines, and
 * a single clamped paragraph cut the name and date off entirely (seen on
 * device). A card grows by at most three lines.
 */
import type { ReviewSnippet } from "@/lib/mock-data";
import { formatDaysAgo } from "@/lib/date";

export function ReviewSnippetLine({ snippet }: { snippet: ReviewSnippet | null | undefined }) {
  if (!snippet) return null;

  // A deleted reviewer keeps their review but loses their name (SVC-367).
  const name = snippet.reviewerFirstName || "Customer";

  return (
    <div className="text-[11px] italic leading-snug text-muted-foreground">
      <p className="line-clamp-2">“{snippet.text}”</p>
      <p className="truncate">
        — {name}, {formatDaysAgo(snippet.createdAt)}
      </p>
    </div>
  );
}
