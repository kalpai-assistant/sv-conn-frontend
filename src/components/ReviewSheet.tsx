import { useState } from "react";
import { Loader2 } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";

interface ReviewSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (rating: number, comment: string) => void;
  onSkip: () => void;
  isSubmitting?: boolean;
}

const MAX_COMMENT_LENGTH = 500;

export function ReviewSheet({
  open,
  onOpenChange,
  onSubmit,
  onSkip,
  isSubmitting = false,
}: ReviewSheetProps) {
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState("");

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="rounded-t-2xl">
        <SheetHeader>
          <SheetTitle>Rate your service</SheetTitle>
          <SheetDescription>How was your experience with the provider?</SheetDescription>
        </SheetHeader>

        <div className="mt-4 flex flex-col gap-4">
          {/* Star rating */}
          <div className="flex items-center justify-center gap-2">
            {[1, 2, 3, 4, 5].map((star) => (
              <button
                key={star}
                type="button"
                disabled={isSubmitting}
                onClick={() => setRating(star)}
                aria-label={`Rate ${star} star${star > 1 ? "s" : ""}`}
              >
                <svg
                  className={`h-9 w-9 transition-colors ${
                    rating >= star ? "text-yellow-400 fill-yellow-400" : "text-border"
                  }`}
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                </svg>
              </button>
            ))}
          </div>

          {/* Optional comment */}
          <div>
            <textarea
              className="w-full rounded-lg border border-border bg-background p-3 text-sm"
              placeholder="Leave a comment (optional)"
              maxLength={MAX_COMMENT_LENGTH}
              rows={3}
              disabled={isSubmitting}
              value={comment}
              onChange={(e) => setComment(e.target.value)}
            />
            <p className="mt-1 text-right text-xs text-muted-foreground">
              {comment.length}/{MAX_COMMENT_LENGTH}
            </p>
          </div>

          {/* Submit */}
          <button
            type="button"
            onClick={() => onSubmit(rating, comment)}
            disabled={rating === 0 || isSubmitting}
            className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-primary font-semibold text-primary-foreground disabled:opacity-50"
          >
            {isSubmitting ? <Loader2 className="h-5 w-5 animate-spin" /> : null}
            Submit Review
          </button>

          {/* Skip */}
          <button
            type="button"
            onClick={onSkip}
            disabled={isSubmitting}
            className="text-center text-sm font-medium text-muted-foreground disabled:opacity-50"
          >
            Skip
          </button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
