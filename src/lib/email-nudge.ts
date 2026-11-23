/**
 * The "Add your email" nudge on the SP's home (SVC-486, Vipul's decision 2 in
 * Jira comment 14963). Commission-change notices go by email to SPs who have
 * one; the rest get push only, so the nudge asks, and never blocks anything.
 *
 * "Not now" hides it for EMAIL_NUDGE_SNOOZE_DAYS on this device, per user. The
 * number and the copy (provider.json `emailNudge.*`) wait on Vipul's OK, so each
 * lives in one place.
 *
 * Storage can throw (private mode, quota, a WebView with storage off). Then the
 * nudge simply shows: a missed snooze costs one extra card, never a crash.
 */

/** Days "Not now" hides the nudge for. Pending Vipul's OK. */
export const EMAIL_NUDGE_SNOOZE_DAYS = 7;

const DAY_MS = 24 * 60 * 60 * 1000;
const keyFor = (userId: string) => `eazyserv:email-nudge-snoozed-until:${userId}`;

/** True while a "Not now" from this user on this device is still running. */
export function isEmailNudgeSnoozed(userId: string, now: number = Date.now()): boolean {
  try {
    const raw = window.localStorage.getItem(keyFor(userId));
    if (!raw) return false;
    const until = Number(raw);
    return Number.isFinite(until) && now < until;
  } catch {
    return false;
  }
}

/** "Not now": hide the nudge for EMAIL_NUDGE_SNOOZE_DAYS. */
export function snoozeEmailNudge(userId: string, now: number = Date.now()): void {
  try {
    window.localStorage.setItem(keyFor(userId), String(now + EMAIL_NUDGE_SNOOZE_DAYS * DAY_MS));
  } catch {
    // Storage is off: the nudge shows again next time, which is harmless.
  }
}
