/**
 * Copy and rules for admin team management (SVC-329), kept apart from the
 * screens so each refusal's wording is pinned by a test.
 *
 * The backend (`app/services/admin_team_service.py`, #202) is the authority;
 * the client checks here only save a round trip and never replace it.
 */
import { ApiError } from "@/lib/api";
import type {
  API_AdminActionRow,
  API_AdminProviderRow,
  API_AdminTeamPro,
  KycStatus,
} from "@/hooks/useApi";

/** Mirrors the backend's `reason` Field (min_length=3, max_length=500). */
export const REASON_MIN = 3;
export const REASON_MAX = 500;

export function reasonError(reason: string): string | null {
  return reason.trim().length >= REASON_MIN
    ? null
    : `A reason is required (at least ${REASON_MIN} characters).`;
}

export const KYC_LABEL: Record<KycStatus, string> = {
  pending: "KYC pending",
  submitted: "KYC submitted",
  verified: "KYC verified",
  rejected: "KYC rejected",
};

export const ACTIVE_JOB_COPY = "Has an active job. Resolve it first (cancel or re-pick).";

const FORCE_REMOVE_ERRORS: Record<string, string> = {
  PRO_HAS_ACTIVE_JOB: ACTIVE_JOB_COPY,
  PRO_NOT_FOUND: "This member is already removed or no longer exists. Refresh the team.",
  CANNOT_REMOVE_SELF: "This is the owner's own profile. It can't be removed from their team.",
};

const REASSIGN_ERRORS: Record<string, string> = {
  PRO_HAS_ACTIVE_JOB: ACTIVE_JOB_COPY,
  PRO_NOT_FOUND: "This member was already removed or moved. Refresh the team.",
  CANNOT_REASSIGN_SELF: "This is the owner's own profile. It can't be moved to another team.",
  SAME_SERVICE_PROVIDER: "They're already on that owner's team. Pick a different owner.",
  TARGET_SP_NOT_FOUND: "That owner no longer exists. Pick a different owner.",
  TARGET_SP_INACTIVE: "That owner's account is deactivated. Pick a different owner.",
  TARGET_SP_KYC_INCOMPLETE:
    "That owner hasn't completed KYC, so they can't take on team members yet.",
  USER_INACTIVE: "This person's account is deactivated, so they can't be moved.",
  ALREADY_ON_TEAM: "This person is already an active member of that owner's team.",
};

function mapError(err: unknown, table: Record<string, string>, fallback: string): string {
  if (err instanceof ApiError) {
    if (err.code && table[err.code]) return table[err.code];
    // FastAPI's own 422 when the reason slips past the client check.
    if (err.status === 422) {
      return `The reason must be ${REASON_MIN}–${REASON_MAX} characters.`;
    }
  }
  return err instanceof Error && err.message ? err.message : fallback;
}

export const forceRemoveErrorCopy = (err: unknown) =>
  mapError(err, FORCE_REMOVE_ERRORS, "Couldn't remove this member.");

export const reassignErrorCopy = (err: unknown) =>
  mapError(err, REASSIGN_ERRORS, "Couldn't move this member.");

/**
 * For a PRO_HAS_ACTIVE_JOB refusal, the job to link to: `{ bookingId }` with
 * the first of `details.booking_ids` (#203), or `bookingId: null` when the
 * backend sent none, so the dialog falls back to the bookings list. Null for
 * any other error.
 */
export function activeJobLink(err: unknown): { bookingId: string | null } | null {
  if (!(err instanceof ApiError) || err.code !== "PRO_HAS_ACTIVE_JOB") return null;
  const ids = err.details?.booking_ids;
  const first = Array.isArray(ids) ? ids.find((id) => typeof id === "string") : undefined;
  return { bookingId: (first as string | undefined) ?? null };
}

/**
 * Why an owner can't be picked as the reassign target, or null if they can.
 * The same order the backend checks in, so the label matches the 4xx it'd send.
 */
export function reassignTargetBlock(
  row: API_AdminProviderRow,
  fromSpUserId: string,
): string | null {
  if (row.user_id === fromSpUserId) return "Current team";
  if (!row.user_is_active) return "Deactivated";
  if (row.kyc_status !== "verified") return "KYC not verified";
  return null;
}

/** "Name · Business" for an owner, whichever parts exist. */
export function ownerLabel(o: {
  name: string | null;
  business_name: string | null;
  phone: string;
}) {
  const parts = [o.name, o.business_name].filter(Boolean);
  return parts.length > 0 ? parts.join(" · ") : o.phone;
}

const str = (v: unknown): string | null => (typeof v === "string" ? v : null);

/**
 * One audit row as a sentence, from the viewpoint of the owner whose page
 * it's on. `team` is that owner's rows (removed included), used to put a name
 * on a Pro id; the log itself stores ids only.
 */
export function describeAction(
  row: API_AdminActionRow,
  spUserId: string,
  team: API_AdminTeamPro[],
): { summary: string; notes: string[]; otherOwnerId: string | null } {
  const nameOf = (...ids: (string | null)[]) =>
    team.find((p) => ids.includes(p.id) || ids.includes(p.user_id))?.display_name ?? null;
  const notes: string[] = [];
  if (row.details.self_reenabled === true) {
    notes.push("The owner was switched back to taking jobs themselves.");
  }

  if (row.action === "pro_force_removed") {
    const who = nameOf(row.target_id) ?? "A team member";
    return { summary: `${who} was force-removed from the team`, notes, otherOwnerId: null };
  }

  if (row.action === "pro_reassigned") {
    const who = nameOf(row.target_id, str(row.details.to_professional_id)) ?? "A team member";
    const kyc = str(row.details.kyc_status) as KycStatus | null;
    if (row.details.reactivated === true) {
      notes.push(
        `Rejoined an earlier row on the new team, keeping its own KYC${kyc ? ` (${KYC_LABEL[kyc] ?? kyc})` : ""}.`,
      );
    } else {
      notes.push("Started KYC pending on the new team.");
    }
    const movedAway = row.sp_user_id === spUserId;
    return {
      summary: movedAway
        ? `${who} was moved to another team`
        : `${who} was moved here from another team`,
      notes,
      otherOwnerId: movedAway ? row.to_sp_user_id : row.sp_user_id,
    };
  }

  if (row.action === "user_deactivated") {
    const who =
      row.target_id === spUserId ? "The owner's account" : (nameOf(row.target_id) ?? "A user");
    const removed = Array.isArray(row.details.removed_professional_ids)
      ? row.details.removed_professional_ids.length
      : 0;
    if (removed > 0) notes.push(`Removed from ${removed} team${removed === 1 ? "" : "s"}.`);
    const reenabled = row.details.self_reenabled_sp_ids;
    if (Array.isArray(reenabled) && reenabled.includes(spUserId)) {
      notes.push("The owner was switched back to taking jobs themselves.");
    }
    return { summary: `${who} was deactivated`, notes, otherOwnerId: null };
  }

  return { summary: String(row.action), notes, otherOwnerId: null };
}
