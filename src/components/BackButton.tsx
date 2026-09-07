/**
 * The header back arrow (SVC-278 issue 1).
 *
 * Every screen's arrow was a `<Link to="/">`, which is right only where home
 * really is the parent. The service page has two parents — you reach it from
 * Home's rails and search, or from a category listing — so a fixed target sent
 * anyone who came via Cleaning back to Categories, and adding a second service
 * from the same category meant navigating in from the top again.
 *
 * Worse, it disagreed with the Android hardware back button, which
 * `main.mobile.tsx` already routes through `router.history`. Two back affordances
 * on the same screen went to different places.
 *
 * So this follows history when there is history to follow, exactly as the
 * hardware button does, and uses `fallbackTo` only when there is none — a cold
 * deep link, a shared URL, a notification tap. `replace` on that path so the
 * dead-end entry doesn't become somewhere back returns to.
 */
import { ArrowLeft } from "lucide-react";
import { useRouter } from "@tanstack/react-router";

export function BackButton({
  fallbackTo,
  className,
}: {
  /** Where to land when nothing precedes this screen in history. */
  fallbackTo: string;
  className?: string;
}) {
  const router = useRouter();

  return (
    <button
      type="button"
      onClick={() => {
        if (router.history.canGoBack()) {
          router.history.back();
          return;
        }
        void router.navigate({ to: fallbackTo, replace: true });
      }}
      className={className ?? "flex h-9 w-9 items-center justify-center rounded-full bg-secondary"}
      aria-label="Back"
    >
      <ArrowLeft className="h-4 w-4 text-foreground" />
    </button>
  );
}
