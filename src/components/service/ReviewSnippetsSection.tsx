/**
 * Recent review snippets — social proof pinned near the Book CTA (SVC-392).
 *
 * ## Placeholder-first for now
 *
 * The ticket deliberately leaves reviews out of the v1 backend contract
 * ("user-generated photos / reviews with photos — SVC-209 territory"), so
 * the real review feed isn't wired yet. This component renders a small
 * hand-picked set of placeholder snippets that read as "typical review for
 * a home-services app" rather than being tied to any one real customer.
 *
 * When reviews land on the backend (SVC-209 or whatever supersedes it),
 * swap the placeholder array for the API-fed one and drop the "·
 * illustrative" note at the top. The surrounding JSX doesn't change.
 */
import { Star } from "lucide-react";

type ReviewSnippet = {
  rating: number;
  reviewer: string;
  date: string;
  comment: string;
};

const PLACEHOLDER_REVIEWS: ReviewSnippet[] = [
  {
    rating: 5,
    reviewer: "Priya",
    date: "last week",
    comment: "The pro was on time, polite, and finished the whole flat in under 3 hours. Spotless.",
  },
  {
    rating: 5,
    reviewer: "Rohan",
    date: "2 weeks ago",
    comment:
      "Booked at 10pm for the next morning. Confirmed in minutes and the service was exactly as described.",
  },
  {
    rating: 4,
    reviewer: "Anita",
    date: "3 weeks ago",
    comment:
      "Good work overall. Had to ask for the kitchen top-cabinet to be redone — they came back.",
  },
];

export function ReviewSnippetsSection() {
  return (
    <section aria-labelledby="reviews-heading" className="px-4 pt-5">
      <div className="mb-3 flex items-end justify-between">
        <h4 id="reviews-heading" className="text-sm font-semibold text-foreground">
          Recent reviews
        </h4>
        <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
          Illustrative
        </span>
      </div>
      <ul className="flex flex-col gap-3">
        {PLACEHOLDER_REVIEWS.map((r, i) => (
          <li key={i} className="rounded-xl border border-border bg-card p-4">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-1 text-xs font-semibold text-primary">
                <Star aria-hidden="true" className="size-3.5 fill-current" />
                {r.rating}.0
              </div>
              <div className="text-xs text-muted-foreground">
                <span className="font-medium text-foreground">{r.reviewer}</span>
                <span aria-hidden="true"> · </span>
                <span>{r.date}</span>
              </div>
            </div>
            <p className="mt-2 line-clamp-3 text-sm leading-relaxed text-foreground">{r.comment}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}
