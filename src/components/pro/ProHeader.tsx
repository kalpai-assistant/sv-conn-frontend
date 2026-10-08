/**
 * The Pro app's header (SVC-322): the title, whose team this is, and the
 * account avatar.
 *
 * The team line is what makes the Pro app legible as a different place from
 * the consumer app the same person can also use: "you're working for Sharma
 * Electricals" is the context every screen here sits in.
 *
 * The avatar goes to `/profile`, the consumer Profile. A Pro's account *is* a
 * consumer account; that screen is where they sign out, and where the "Open Pro
 * app" row brings them back.
 */
import { AccountAvatar } from "@/components/AccountAvatar";
import { BusinessLogo } from "@/components/provider/BusinessLogo";
import type { ProServiceProvider } from "@/hooks/usePro";

export function ProHeader({
  title,
  name,
  photoUrl,
  team,
}: {
  title: string;
  name?: string | null;
  photoUrl?: string | null;
  /** Absent while `/pros/me` loads; the line simply appears once it lands. */
  team?: ProServiceProvider;
}) {
  const teamName = team?.business_name?.trim() || "your service provider";
  return (
    <div className="flex items-center justify-between gap-4">
      <div className="min-w-0">
        <h1 className="text-lg font-semibold text-foreground">{title}</h1>
        {team && (
          <p className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
            <BusinessLogo src={team.business_image_url} alt="" className="h-5 w-5 rounded-md" />
            <span className="truncate">On {teamName}’s team</span>
          </p>
        )}
      </div>

      <AccountAvatar to="/profile" name={name} photoUrl={photoUrl} />
    </div>
  );
}
