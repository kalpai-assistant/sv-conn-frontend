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
import i18n, { englishT, type Translate } from "@/i18n";
import type { AppLanguage } from "@/i18n/languages";
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
  /**
   * SVC-326. Only ever false on the SP's own row: the SP has switched off taking
   * jobs themselves. Set with `PATCH /providers/me/self-pro`.
   */
  accepts_direct_jobs: boolean;
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
  /**
   * SVC-326: false only for the Pro-for-self of an SP who has switched off
   * taking jobs themselves; /assign would answer 409 SELF_NOT_TAKING_JOBS.
   */
  accepts_direct_jobs: boolean;
}

/** The 202 body from `PATCH /bookings/{id}/accept` with `X-Team-Pick: 1`. */
export interface TeamPickResponse {
  booking_id: string;
  pros: TeamPickPro[];
}

/** `GET` / `PATCH /providers/me/self-pro` (SVC-326). */
export interface SelfPro {
  professional_id: string;
  accepts_direct_jobs: boolean;
  /**
   * Whether anyone on the team (not the SP) could be assigned a job right now:
   * active, KYC-verified, online and not on another job. The broadcast's own
   * rule, so false means a switched-off SP gets no new jobs.
   */
  team_has_assignable_pro: boolean;
}

/** `DELETE /providers/me/team/{id}` (SVC-326; a bodiless 204 before it). */
export interface RemoveProResponse {
  /** The last other Pro is gone, so the SP takes jobs themselves again. */
  self_reenabled: boolean;
}

export const TEAM_QUERY_KEY = ["provider-team"] as const;
// Under the team key, so every team invalidation (a removal, a 409 from
// /assign) refreshes it too.
export const SELF_PRO_QUERY_KEY = [...TEAM_QUERY_KEY, "self-pro"] as const;
/** Team Pros go online and finish jobs on their own, and nothing pushes that here. */
const SELF_PRO_POLL_MS = 30_000;
export const TEAM_INVITES_QUERY_KEY = ["provider-team-invites"] as const;

/**
 * Active Pros, the SP's own row first. `pollWhileSelfOff` (My Team): while the
 * SP has switched off taking jobs, poll with `useSelfPro`, so a Pro's dot turns
 * green when the "nobody available" banner clears, not on the next visit.
 *
 * `bookingId` (SVC-361): leave out the Pros who declined that booking, for a
 * re-pick list. Cached under the team key, so every team invalidation refreshes
 * it too. An older backend ignores the param and sends the whole team.
 */
export function useTeam(
  enabled = true,
  { pollWhileSelfOff = false, bookingId }: { pollWhileSelfOff?: boolean; bookingId?: string } = {},
) {
  return useQuery({
    queryKey: bookingId ? [...TEAM_QUERY_KEY, "booking", bookingId] : TEAM_QUERY_KEY,
    queryFn: () =>
      apiFetch<TeamMember[]>(
        bookingId
          ? `/providers/me/team?booking_id=${encodeURIComponent(bookingId)}`
          : "/providers/me/team",
      ),
    enabled,
    refetchInterval: (query) =>
      pollWhileSelfOff && query.state.data?.find((m) => m.is_self)?.accepts_direct_jobs === false
        ? SELF_PRO_POLL_MS
        : false,
    refetchIntervalInBackground: false,
  });
}

/**
 * Whether the SP takes jobs themselves, and whether their team could take one
 * now. Only worth asking while switched off: that's when the answer means "you
 * won't get new jobs", so that's also the only time it polls.
 */
export function useSelfPro(enabled: boolean) {
  return useQuery({
    queryKey: SELF_PRO_QUERY_KEY,
    queryFn: () => apiFetch<SelfPro>("/providers/me/self-pro"),
    enabled,
    refetchInterval: enabled ? SELF_PRO_POLL_MS : false,
    refetchIntervalInBackground: false,
  });
}

/** Switch taking jobs yourself on or off. New dispatch only; held jobs stay. */
export function useSetSelfPro() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (acceptsDirectJobs: boolean) =>
      apiFetch<SelfPro>("/providers/me/self-pro", {
        method: "PATCH",
        body: JSON.stringify({ accepts_direct_jobs: acceptsDirectJobs }),
      }),
    onSuccess: (data) => queryClient.setQueryData(SELF_PRO_QUERY_KEY, data),
    // The self row on /me/team carries the same flag.
    onSettled: () => queryClient.invalidateQueries({ queryKey: TEAM_QUERY_KEY }),
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

/**
 * Soft removal: the Pro loses access, the row stays for past jobs and reviews.
 * Removing the last other Pro switches a switched-off SP back on (SVC-326).
 */
export function useRemoveMember() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (proId: string) =>
      apiFetch<RemoveProResponse>(`/providers/me/team/${proId}`, { method: "DELETE" }),
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
    onSuccess: (_data, { bookingId }) => {
      queryClient.invalidateQueries({ queryKey: ["bookings"] });
      queryClient.invalidateQueries({ queryKey: ["provider-bookings"] });
      // The job screen, so a re-pick shows the new Pro without waiting a poll.
      queryClient.invalidateQueries({ queryKey: ["booking", bookingId] });
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["provider-offers"] });
      // A 409 means someone's availability changed under the open picker.
      queryClient.invalidateQueries({ queryKey: TEAM_QUERY_KEY });
    },
  });
}

/** Pro-level refusals: the booking is still live, only this pick failed. */
const REPICK_CODES = new Set([
  "PRO_BUSY",
  "PRO_OFFLINE",
  "PRO_KYC_INCOMPLETE",
  "PRO_NOT_FOUND",
  "SELF_NOT_TAKING_JOBS",
  "PRO_DECLINED_THIS_BOOKING",
]);

/**
 * What a failed `/assign` means for the open picker. Branches on the CODE
 * first, because the status alone mixes booking-level and Pro-level answers:
 *
 * - `repick` — PRO_BUSY / PRO_OFFLINE / PRO_KYC_INCOMPLETE /
 *   SELF_NOT_TAKING_JOBS / PRO_DECLINED_THIS_BOOKING (409, SVC-361) or
 *   PRO_NOT_FOUND (404, the Pro was removed while the picker was open).
 *   Toast, refresh, keep picking.
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

/** Codes with their own copy in provider.json `teamErrors.*`. */
const TEAM_ERROR_CODES = new Set([
  "PRO_BUSY",
  "PRO_OFFLINE",
  "PRO_KYC_INCOMPLETE",
  "PRO_NOT_FOUND",
  "PRO_DECLINED_THIS_BOOKING",
  "INVITER_PAYOUT_KYC_INCOMPLETE",
  "CANNOT_INVITE_SELF",
  "ALREADY_ON_TEAM",
  "INVITE_ALREADY_PENDING",
  "INVITE_NOT_PENDING",
  "CANNOT_REMOVE_SELF",
  "SELF_NOT_TAKING_JOBS",
  "NO_TEAM_TO_DISPATCH",
]);

/**
 * Friendly copy for a team-endpoint failure, keyed on the backend's stable
 * codes. Falls back to the server message, which is user-safe for 4xx.
 *
 * `t` is the screen's provider `t` (SVC-376); the English default keeps every
 * other caller on exactly the strings it had.
 */
export function teamErrorMessage(error: unknown, t: Translate = englishT("provider")): string {
  if (!(error instanceof ApiError)) return t("teamErrors.network");
  if (error.code && TEAM_ERROR_CODES.has(error.code)) return t(`teamErrors.${error.code}`);
  if (error.status === 429) return t("teamErrors.tooMany");
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
export function inviteMessage(
  invite: Pick<TeamInvite, "token" | "invite_url">,
  lang: AppLanguage = "en",
): string {
  const english =
    `You're invited to join my team on Eazyserv. ` +
    `Your invite code is ${invite.token} (valid for 7 days). ${invite.invite_url}`;
  // SVC-376: in the sender's language, with today's English underneath — the
  // recipient's language is unknown. English (and i18n off, which is always
  // English) sends exactly the string above. The link appears once, in the
  // English half, so WhatsApp previews a single URL.
  if (lang === "en") return english;
  const own = i18n.getFixedT(lang, "provider")("inviteShare.message", { code: invite.token });
  return `${own}\n\n${english}`;
}
