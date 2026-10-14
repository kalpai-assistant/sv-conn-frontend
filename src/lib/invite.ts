/**
 * Joining a team with an invite code (SVC-322 part 3, SVC-331 merged in).
 *
 * The SP's invite SMS carries a static link (`https://app.eazyserv.com/invite`)
 * and a 6-digit code as a separate variable — the code is never in the URL
 * (STPL rejected that; Vipul's 2026-10-02 comment on SVC-322). So `/invite` is
 * a code-entry screen, and the code reaches it by hand, by paste, or from the
 * clipboard after Android's "Copy code" chip.
 *
 * Backend: `POST /providers/me/accept-invite { token }`, `team_service.py`.
 */
import { ApiError } from "@/lib/api";
import type { ProMe } from "@/hooks/usePro";

export const INVITE_CODE_LENGTH = 6;
export const INVITE_CODE_RE = /^\d{6}$/;

/** A code worth pre-filling from the clipboard, or null. Trims, nothing more. */
export function inviteCodeFromClipboard(text: unknown): string | null {
  // Typed loosely on purpose: this reads whatever a WebView's clipboard API
  // hands back, and only a string can be a code.
  if (typeof text !== "string") return null;
  const trimmed = text.trim();
  return INVITE_CODE_RE.test(trimmed) ? trimmed : null;
}

/**
 * What a failed accept means, in words an invitee can act on.
 *
 * Keyed on the backend's codes, never its wording, except 410: expired,
 * revoked and already-used all share `INVITE_NO_LONGER_VALID`, and only the
 * message says which ("This invite is expired. Ask for a new one…"). That
 * message is written for this screen, so it is shown as is.
 */
export function inviteErrorMessage(err: unknown): string {
  if (!(err instanceof ApiError)) {
    return "Couldn’t reach EazyServ. Check your connection and try again.";
  }
  switch (err.code) {
    case "INVITE_NOT_FOUND":
      return "That code isn’t right. Check the 6-digit code in your SMS — it only works on the number it was sent to.";
    case "INVITE_NO_LONGER_VALID":
      return err.message || "This invite can’t be used any more. Ask for a new one.";
    case "ALREADY_PRO_ELSEWHERE":
      return "You’re already on another team, and you can only be on one at a time. Ask that team to remove you first.";
  }
  if (err.status === 429) {
    const minutes = err.retryAfter ? Math.max(1, Math.ceil(err.retryAfter / 60)) : null;
    return minutes
      ? `Too many tries. Try again in ${minutes} minute${minutes === 1 ? "" : "s"}.`
      : "Too many tries. Try again in a while.";
  }
  if (err.status === 422) return "Enter the 6-digit code from your SMS.";
  if (err.status === 403) return "This account can’t join a team.";
  return err.message || "Something went wrong. Please try again.";
}

/**
 * The welcome after a successful accept, naming the SP they joined (SVC-354).
 *
 * Takes `/pros/me`, not the accept response: that is the bare Pro row and
 * carries no business name. `useAcceptInvite` refetches `/pros/me` before its
 * caller's onSuccess runs, so it is already in the cache. Without a name — an
 * SP who never set one, or a refetch that failed — the plain welcome.
 */
export function joinedTeamMessage(me: ProMe | null | undefined): string {
  const name = me?.service_provider.business_name?.trim();
  return name ? `You’re now part of ${name}.` : "You’ve joined the team.";
}

/**
 * A 409 ALREADY_ON_TEAM is not a failure from the invitee's side: they wanted
 * to be on this team, and they are. Treated as a success.
 */
export function isAlreadyOnThisTeam(err: unknown): boolean {
  return err instanceof ApiError && err.code === "ALREADY_ON_TEAM";
}

// --- Surviving signup ---------------------------------------------------------
//
// A brand-new invitee signs in on /invite, then the root gate sends them to
// /profile for their name — which matters here, because the backend takes the
// Pro's display name from `users.name` at the moment they accept. Saving the
// name used to land on "/", losing the invite. This remembers that they came
// for one, for the rest of the session.

const PENDING_INVITE_KEY = "eazyserv:pending-invite";

export function rememberPendingInvite(): void {
  try {
    sessionStorage.setItem(PENDING_INVITE_KEY, "1");
  } catch {
    // Private mode: they'll land on "/" and can use Profile's "Join a team".
  }
}

export function hasPendingInvite(): boolean {
  try {
    return sessionStorage.getItem(PENDING_INVITE_KEY) === "1";
  } catch {
    return false;
  }
}

export function clearPendingInvite(): void {
  try {
    sessionStorage.removeItem(PENDING_INVITE_KEY);
  } catch {
    // Nothing to clear.
  }
}

/**
 * Keeps the pending invite in step with where the user is. Run on every
 * route and auth change.
 *
 * On /invite it is remembered. Signed out anywhere else, it is dropped: that is
 * the ordinary sign-in screen — someone who backed out of /invite, or who just
 * logged out — and whoever signs up there next did not come for an invite.
 * Without this, a new customer who once tapped "I have an invite code" (SVC-331)
 * and backed out was sent to "Join your team" after naming themselves, instead
 * of home.
 *
 * Signed in, it is left alone. Leaving /invite is not enough to drop it: a new
 * invitee is *sent* from /invite to Profile for their name, and needs it to come
 * back.
 *
 * Never kept for an SP owner (`provider`, SVC-354), who can't join a team. The
 * rule lives here, not only on /invite's owner screen: signing in on /invite
 * runs this after that screen's own effect (a parent's effects follow its
 * children's), so clearing it there was undone at once — found on device.
 */
export function syncPendingInvite({
  onInviteRoute,
  signedOut,
  provider = false,
}: {
  onInviteRoute: boolean;
  signedOut: boolean;
  provider?: boolean;
}): void {
  if (provider) clearPendingInvite();
  else if (onInviteRoute) rememberPendingInvite();
  else if (signedOut) clearPendingInvite();
}
