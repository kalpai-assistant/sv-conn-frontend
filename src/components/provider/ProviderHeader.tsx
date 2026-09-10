/**
 * Provider Home's header: a title, and the avatar that replaced the Profile
 * tab (SVC-273).
 *
 * ## Why Profile moved up here
 *
 * It was the least-visited of four tabs and held a quarter of the most
 * valuable area on the screen. Blinkit and Zepto both put the account entry
 * point in this corner for the same reason, leaving the bar for the
 * destinations people actually move between.
 *
 * ## Why it is a Link and not a button
 *
 * Two things follow from being real navigation rather than a tab: it *pushes*
 * history, so back returns the provider to whatever screen they opened Profile
 * from; and it is a real anchor, so long-press, middle-click and screen
 * readers all behave. The tab it replaced used `replace` deliberately (tabs
 * are lateral, SVC-230) — this is the opposite case, and wants the opposite
 * behaviour.
 *
 * ## The fallback matters more than the photo
 *
 * `profile_photo_url` is null for most providers — it is uploaded during
 * onboarding and plenty skip it. So the initials path is the common one, not
 * the exception, and an empty grey circle would leave the only way into
 * Profile looking like a rendering bug.
 */
import { Link } from "@tanstack/react-router";
import { User } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { initialsFrom } from "@/lib/initials";

export function ProviderHeader({
  title,
  name,
  photoUrl,
}: {
  title: string;
  /** The provider's display name, for the initials fallback. */
  name?: string | null;
  /** `profile_photo_url` from the provider profile. Often null. */
  photoUrl?: string | null;
}) {
  const initials = initialsFrom(name);

  return (
    <div className="flex items-center justify-between gap-4">
      <h1 className="text-lg font-semibold text-foreground">{title}</h1>

      <Link
        to="/provider/profile"
        // Named for what it opens, not what it shows: a screen reader
        // announcing "avatar" tells the user nothing about where the tap goes.
        aria-label="Your profile"
        className="shrink-0 rounded-full ring-offset-background transition-opacity hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
      >
        <Avatar className="h-10 w-10 border border-border">
          {/* Radix only swaps in the fallback once the image errors or is
              absent, so a slow photo shows initials rather than a blank hole. */}
          {photoUrl && <AvatarImage src={photoUrl} alt="" />}
          <AvatarFallback className="bg-secondary text-sm font-semibold text-foreground">
            {initials ?? <User className="h-4 w-4 text-muted-foreground" />}
          </AvatarFallback>
        </Avatar>
      </Link>
    </div>
  );
}
