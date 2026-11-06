/**
 * The "there is genuinely nothing here" block. Pairs with ErrorState, and comes
 * after it in the render order: see the note there.
 */
import { Inbox } from "lucide-react";

export function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 px-8 py-12 text-center">
      <Inbox className="h-8 w-8 text-muted-foreground" />
      <p className="text-sm text-muted-foreground">{message}</p>
    </div>
  );
}
