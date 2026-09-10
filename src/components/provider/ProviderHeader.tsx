/**
 * Provider Home's header: the title, and the account avatar beside it.
 *
 * Thin on purpose — the avatar carries its own reasoning (see AccountAvatar).
 * This exists so Home's loading and loaded branches lay the two out
 * identically, rather than each arranging them by hand and drifting apart.
 */
import { AccountAvatar } from "@/components/AccountAvatar";

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
  return (
    <div className="flex items-center justify-between gap-4">
      <h1 className="text-lg font-semibold text-foreground">{title}</h1>

      <AccountAvatar to="/provider/profile" name={name} photoUrl={photoUrl} />
    </div>
  );
}
