/**
 * The account entry point, top-right (SVC-273).
 *
 * Both roles moved Profile out of the bottom bar and into this corner — the
 * Blinkit / Zepto pattern, where the tab bar carries the destinations people
 * move between and the account sits apart. Shared rather than duplicated
 * because the two differ only in where they point.
 *
 * ## A Link, not a button
 *
 * It pushes history, so back returns the user to whatever screen they opened
 * Profile from. That is the opposite of the tab it replaces, which used
 * `replace` precisely because tabs are lateral movement (SVC-230). Being a
 * real anchor also keeps long-press and screen readers working.
 *
 * ## The fallback is the common path
 *
 * Consumers have no photo field at all — `User` carries name, phone, email and
 * role, nothing else — so for them this is always initials or the glyph.
 * Providers have `profile_photo_url`, but it is null whenever the onboarding
 * upload is skipped, which is often. An empty circle would leave the only way
 * into Profile looking like a rendering bug, so the fallback matters more than
 * the image.
 */
import { Link } from "@tanstack/react-router";
import { User } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { initialsFrom } from "@/lib/initials";

export function AccountAvatar({
  to,
  name,
  photoUrl,
  className,
}: {
  /** Which Profile this opens — the two roles have separate screens. */
  to: "/profile" | "/provider/profile";
  /** Display name, for the initials fallback. */
  name?: string | null;
  /** Provider photo. Consumers have none; omit it. */
  photoUrl?: string | null;
  className?: string;
}) {
  const initials = initialsFrom(name);

  return (
    <Link
      to={to}
      // Named for where it goes, not what it shows: a screen reader announcing
      // "avatar" tells the user nothing about the destination.
      aria-label="Your profile"
      className={`shrink-0 rounded-full ring-offset-background transition-opacity hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${className ?? ""}`}
    >
      <Avatar className="h-9 w-9 border border-border">
        {/* Radix swaps in the fallback only once the image errors or is absent,
            so a slow photo shows initials rather than a blank hole. */}
        {photoUrl && <AvatarImage src={photoUrl} alt="" />}
        <AvatarFallback className="bg-secondary text-sm font-semibold text-foreground">
          {initials ?? <User className="h-4 w-4 text-muted-foreground" />}
        </AvatarFallback>
      </Avatar>
    </Link>
  );
}
