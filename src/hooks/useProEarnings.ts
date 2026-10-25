/**
 * Per-Pro earnings for a team SP (SVC-323). Backend: SVC-323 / sv-conn-backend
 * #198, `app/schemas/provider.py` (`EarningsByProResponse`,
 * `EarningsBookingItem.professional`).
 *
 * The types are hand-written here rather than generated, like `useTeam.ts`:
 * `svc_connect.json` predates these fields. Swap them for
 * `components["schemas"][...]` once the spec is regenerated.
 *
 * Kept off `GET /providers/me/team` on purpose: the pick-a-Pro step calls that
 * on every accept, and earnings would slow every claim for a figure the picker
 * never shows.
 *
 * Both keys sit under `["earnings", ...]`, so whatever already invalidates the
 * SP's earnings refreshes these with it.
 */
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { englishT, type Translate } from "@/i18n";
import type { API_EarningsBookingItem, API_EarningsResponse, EarningsRange } from "@/hooks/useApi";

/** The earnings windows plus `all`, which `/me/earnings/by-pro` alone accepts. */
export type ByProRange = EarningsRange | "all";

/** Who did an earnings row's job. */
export interface EarningsProfessional {
  id: string;
  display_name: string;
  is_self: boolean;
}

/** An earnings row with the Pro on it. `null` when it completed with no Pro. */
export type EarningsBookingItemWithPro = API_EarningsBookingItem & {
  professional?: EarningsProfessional | null;
};

export type EarningsWithProResponse = Omit<API_EarningsResponse, "bookings"> & {
  bookings: EarningsBookingItemWithPro[];
};

/**
 * One Pro's share of a range. `professional_id` null is the "Not assigned"
 * row: jobs that completed with no Pro, so the rows always add up to the
 * total. That row is never self or active and has no photo.
 */
export interface ProEarningsItem {
  professional_id: string | null;
  display_name: string;
  profile_photo_url: string | null;
  is_self: boolean;
  is_active: boolean;
  payout: number;
  completed_count: number;
}

/**
 * `total_payout` / `completed_count` equal `/me/earnings` for a window and
 * `/me/earnings/summary` for `all`. `pros` lists every Pro of the SP, removed
 * and zero-job ones included: self, active, removed, then "Not assigned".
 */
export interface EarningsByProResponse {
  range: ByProRange;
  total_payout: number;
  completed_count: number;
  pros: ProEarningsItem[];
}

/** One request for the whole team, whatever its size. */
export function useEarningsByPro(range: ByProRange) {
  return useQuery({
    queryKey: ["earnings", "by-pro", range],
    queryFn: () => apiFetch<EarningsByProResponse>(`/providers/me/earnings/by-pro?range=${range}`),
    placeholderData: (previous) => previous,
  });
}

/**
 * One Pro's window: the same `EarningsResponse`, narrowed by the server. A Pro
 * of another SP, or an unknown id, is a 404 `PRO_NOT_FOUND`.
 */
export function useProEarnings(range: EarningsRange, professionalId: string) {
  return useQuery({
    queryKey: ["earnings", range, "pro", professionalId],
    queryFn: () =>
      apiFetch<EarningsWithProResponse>(
        `/providers/me/earnings?range=${range}&professional_id=${encodeURIComponent(professionalId)}`,
      ),
    // Previous window of the same Pro only: one Pro's jobs must never stand in
    // for another's while the route param changes under a mounted page.
    placeholderData: (previous, previousQuery) =>
      previousQuery?.queryKey[3] === professionalId ? previous : undefined,
  });
}

/**
 * Whether the SP has anyone but themselves, now or before. The one rule every
 * team-only earnings surface uses, so a solo SP (nearly all of them) sees
 * none of it. Undefined data reads as solo: nothing appears until we know.
 */
export function hasTeam(data: EarningsByProResponse | undefined): boolean {
  return !!data?.pros.some((p) => p.professional_id !== null && !p.is_self);
}

/** What a row's "by" line says: "you" for the SP, matching "(You)" elsewhere. */
export function proLabel(
  pro: EarningsProfessional | null | undefined,
  t: Translate = englishT("provider"),
): string {
  if (!pro) return t("earnings.notAssigned");
  return pro.is_self ? t("earnings.byYou") : t("earnings.byPro", { name: pro.display_name });
}

/** A by-Pro row's name: "You" for the SP's own Pro, matching "(You)" elsewhere. */
export function proName(item: ProEarningsItem, t: Translate = englishT("provider")): string {
  if (item.professional_id === null) return t("earnings.notAssigned");
  return item.is_self ? t("earnings.you") : item.display_name;
}
