/**
 * The one timeout the picker + gate agree on (SVC-357).
 *
 * Three callers used to bound their location requests independently: the
 * picker's locate-me (15s), the gate's locate-me (20s), and the gate's launch
 * probe (10s). Three timeouts, three callers, no shared justification for the
 * spread — which is why a future refactor could "unify" them to the wrong
 * value with no visible test failure.
 *
 * 15 seconds is picked because:
 *
 * - Measured on a cold-start Android that already has location on, consecutive
 *   `getCurrentPosition` calls answered in 1ms, 43ms, 836ms and 8256ms (see
 *   `useLocationAvailability.ts` and `docs/map-picker-errors.md` § 4). 15s
 *   accommodates the slow tail without punishing the fast case.
 * - A user staring at a "Locating…" spinner for twenty seconds reads it as
 *   broken. Fifteen is still long, but it is on the right side of that
 *   perception line.
 * - The gate's launch probe at ten seconds was the shortest of the three. Its
 *   nothing-is-blocked-on-it comment is still true, but a timeout retry costs
 *   nothing (the gate retries twice) — so standing the probe up to fifteen
 *   trades one guaranteed call for the same outcome in slightly fewer retries,
 *   not a longer first paint.
 *
 * Not exported as part of a per-caller constants bag because the whole point of
 * this ticket is that one value is correct for every caller. If a future caller
 * genuinely needs a different bound (a background heartbeat, say), introduce a
 * second named constant rather than parameterising this one.
 */
export const MAP_PICKER_LOCATE_TIMEOUT_MS = 15_000;
