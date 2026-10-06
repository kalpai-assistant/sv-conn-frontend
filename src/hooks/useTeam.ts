/**
 * Data layer for the SP's team (SVC-321): the My Team screen, invites, and the
 * pick-a-Pro step on accept. Backend: SVC-320, `app/schemas/team.py`.
 *
 * The types are hand-written here rather than generated: `svc_connect.json`
 * predates the team endpoints, and regenerating it drags in every other stale
 * change with it. Swap these for `components["schemas"][...]` once the spec is
 * regenerated.
 *
 * Error codes are the contract, as everywhere else in this app — branch on
 * `ApiError.code`, never on the message.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError, apiFetch } from "@/lib/api";
import type { KycStatus } from "@/hooks/useApi";

/** A member of the SP's team. `is_self` is the SP's own Pro-for-self. */
export interface TeamMember {
  id: string;
  service_provider_id: string;
  user_id: string;
  display_name: string;
  profile_photo_url: string | null;
  kyc_status: KycStatus;
  /** Set by the Pro's own toggle. The Pro-for-self follows the SP's instead. */
  is_online: boolean;
  is_active: boolean;
  is_self: boolean;
  created_at: string;
}

export type InviteStatus = "PENDING" | "ACCEPTED" | "REVOKED" | "EXPIRED";

export interface TeamInvite {
  id: string;
  invitee_phone: string;
  status: InviteStatus;
  expires_at: string;
  created_at: string;
  /** The 6-digit code. Only works from the invited phone. */
  token: string;
  invite_url: string;
}

/** One row of the pick-a-Pro list (`TeamPickPro`). */
export interface TeamPickPro {
  id: string;
  display_name: string;
  profile_photo_url: string | null;
  is_self: boolean;
  /** Already on another unfinished job; /assign would answer 409 PRO_BUSY. */
  busy: boolean;
}

/** The 202 body from `PATCH /bookings/{id}/accept` with `X-Team-Pick: 1`. */
export interface TeamPickResponse {
  booking_id: string;
  pros: TeamPickPro[];
}

export const TEAM_QUERY_KEY = ["provider-team"] as const;
export const TEAM_INVITES_QUERY_KEY = ["provider-team-invites"] as const;

/** Active Pros, the SP's own row first. */
export function useTeam(enabled = true) {
  return useQuery({
    queryKey: TEAM_QUERY_KEY,
    queryFn: () => apiFetch<TeamMember[]>("/providers/me/team"),
    enabled,
  });
}

/** Every invite the SP has sent, newest first, any status. */
export function useTeamInvites() {
  return useQuery({
    queryKey: TEAM_INVITES_QUERY_KEY,
    queryFn: () => apiFetch<TeamInvite[]>("/providers/me/team/invites"),
  });
}

export function useCreateInvite() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (inviteePhone: string) =>
      apiFetch<TeamInvite>("/providers/me/team/invites", {
        method: "POST",
        body: JSON.stringify({ invitee_phone: inviteePhone }),
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: TEAM_INVITES_QUERY_KEY }),
  });
}

export function useRevokeInvite() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (inviteId: string) =>
      apiFetch<TeamInvite>(`/providers/me/team/invites/${inviteId}/revoke`, { method: "POST" }),
    // A 409 means it was already accepted, revoked or expired, so the list is
    // stale either way.
    onSettled: () => queryClient.invalidateQueries({ queryKey: TEAM_INVITES_QUERY_KEY }),
  });
}

/** Soft removal: the Pro loses access, the row stays for past jobs and reviews. */
export function useRemoveMember() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (proId: string) =>
      apiFetch<void>(`/providers/me/team/${proId}`, { method: "DELETE" }),
    onSettled: () => queryClient.invalidateQueries({ queryKey: TEAM_QUERY_KEY }),
  });
}

/**
 * Give the booking to one of the SP's Pros: the claim itself when it is still
 * open, a re-pick when the SP already holds it. Errors are left to the caller,
 * which must tell a 409 (pick someone else) from a 410 (the job is gone).
 */
export function useAssignPro() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ bookingId, professionalId }: { bookingId: string; professionalId: string }) =>
      apiFetch<unknown>(`/bookings/${bookingId}/assign`, {
        method: "POST",
        body: JSON.stringify({ professional_id: professionalId }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["bookings"] });
      queryClient.invalidateQueries({ queryKey: ["provider-bookings"] });
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["provider-offers"] });
      // A 409 means someone's availability changed under the open picker.
      queryClient.invalidateQueries({ queryKey: TEAM_QUERY_KEY });
    },
  });
}

/** Pro-level refusals: the booking is still live, only this pick failed. */
const REPICK_CODES = new Set(["PRO_BUSY", "PRO_OFFLINE", "PRO_NOT_FOUND"]);

/**
 * What a failed `/assign` means for the open picker. Branches on the CODE
 * first, because the status alone mixes booking-level and Pro-level answers:
 *
 * - `repick` — PRO_BUSY / PRO_OFFLINE (409) or PRO_NOT_FOUND (404, the Pro
 *   was removed while the picker was open). Toast, refresh, keep picking.
 * - `taken` — 410: claimed by another SP, cancelled or expired. Quiet dismiss.
 * - `unavailable` — 403, a code-less 404 (no such booking) or a code-less 409
 *   (`InvalidStateTransition`, the booking moved on). Dismiss.
 * - `null` — 5xx or a network drop. A real error the SP can retry.
 */
export function assignOutcomeForError(error: unknown): "repick" | "taken" | "unavailable" | null {
  if (!(error instanceof ApiError)) return null;
  if (error.code && REPICK_CODES.has(error.code)) return "repick";
  if (error.status === 410) return "taken";
  if (error.status === 403 || error.status === 404 || error.status === 409) return "unavailable";
  return null;
}

/**
 * Friendly copy for a team-endpoint failure, keyed on the backend's stable
 * codes. Falls back to the server message, which is user-safe for 4xx.
 */
export function teamErrorMessage(error: unknown): string {
  if (!(error instanceof ApiError))
    return "Something went wrong. Check your connection and try again.";
  switch (error.code) {
    case "PRO_BUSY":
      return "They're on another job right now. Pick someone else.";
    case "PRO_OFFLINE":
      return "They've gone offline. Pick someone else.";
    case "PRO_NOT_FOUND":
      return "That person is no longer on your team.";
    case "INVITER_PAYOUT_KYC_INCOMPLETE":
      return "Finish your KYC before inviting team members. Your team's earnings are paid to you.";
    case "CANNOT_INVITE_SELF":
      return "That's your own number.";
    case "ALREADY_ON_TEAM":
      return "This person is already on your team.";
    case "INVITE_ALREADY_PENDING":
      return "You've already invited this number. Revoke that invite to send a new one.";
    case "INVITE_NOT_PENDING":
      return "This invite is no longer pending.";
    case "CANNOT_REMOVE_SELF":
      return "You can't remove yourself from your own team.";
  }
  if (error.status === 429) return "Too many invites in the last hour. Try again later.";
  return error.message;
}

/** Digits only, with a pasted "+91" or trunk "0" prefix dropped, capped at 10. */
export function nationalDigits(raw: string): string {
  let d = raw.replace(/\D/g, "");
  if (d.length === 12 && d.startsWith("91")) d = d.slice(2);
  else if (d.length === 11 && d.startsWith("0")) d = d.slice(1);
  return d.slice(0, 10);
}

/** What Copy/Share hands over: the code, and where to enter it. */
export function inviteMessage(invite: Pick<TeamInvite, "token" | "invite_url">): string {
  return (
    `You're invited to join my team on Eazyserv. ` +
    `Your invite code is ${invite.token} (valid for 7 days). ${invite.invite_url}`
  );
}
