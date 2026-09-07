/**
 * Android notification channels (SVC-278 issue 6).
 *
 * A new job request needs the provider's immediate attention and had no way to
 * announce itself: every push landed on the Capacitor plugin's default channel,
 * so a job worth ₹2,000 sounded exactly like an app-update nudge. A provider
 * checking their phone could not tell, without unlocking it, whether anything
 * needed them.
 *
 * ## The channel id carries a version, deliberately
 *
 * **Android channels are immutable once created.** After the first
 * `createChannel`, the OS ignores every later change to sound, importance or
 * vibration for that id — permanently, for that install. Only the user can
 * change them, in system settings, and only a fresh id gets new defaults.
 *
 * That makes the obvious failure mode silent and durable: change the sound
 * here, watch it work on a clean install, ship it, and every existing provider
 * keeps the old one with nothing to indicate why. So the id embeds a version.
 * **To change any channel setting, bump the suffix** — `_v2`, `_v3` — which
 * creates a genuinely new channel; the previous one is deleted on the way past
 * so it does not linger in the provider's settings screen as a dead duplicate.
 *
 * ## Why not just raise the priority
 *
 * FCM priority governs delivery, not presentation. Android decides the sound
 * and the heads-up behaviour from the channel, so without one there is nothing
 * to make distinct. The backend names this id in
 * `AndroidConfig(notification=AndroidNotification(channel_id=…))`; both halves
 * are required, and neither does anything alone.
 */
import { Capacitor } from "@capacitor/core";

/**
 * The job-request channel.
 *
 * Bump the `_vN` suffix whenever sound, importance or vibration below changes —
 * see the module docs. `JOB_REQUEST_CHANNEL_ID` is the contract with the
 * backend: it must match what the server puts in `channel_id`, or the push
 * quietly lands on the default channel again.
 */
export const JOB_REQUEST_CHANNEL_ID = "job_requests_v1";

/** Ids this module has used before, deleted so they don't clutter settings. */
const SUPERSEDED_CHANNEL_IDS: string[] = [];

/**
 * Create the job-request channel. Safe to call repeatedly — creating an
 * existing channel is a no-op in Android, which is why this can simply run on
 * every registration rather than tracking whether it has run before.
 *
 * Android-only by nature: iOS has no channel concept (its sounds are chosen
 * per-notification by the sender), and the web has none either.
 */
export async function ensureJobRequestChannel(): Promise<void> {
  if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== "android") return;

  try {
    const { PushNotifications } = await import("@capacitor/push-notifications");

    for (const id of SUPERSEDED_CHANNEL_IDS) {
      // Best-effort: deleting a channel that was never created throws on some
      // OEM builds, and that is not worth failing registration over.
      try {
        await PushNotifications.deleteChannel({ id });
      } catch {
        /* nothing to clean up */
      }
    }

    await PushNotifications.createChannel({
      id: JOB_REQUEST_CHANNEL_ID,
      name: "Job requests",
      // Shown in Android's per-channel settings, where a provider decides
      // whether to keep it loud. Written for them, not for us.
      description: "New booking requests you can accept. Time-sensitive.",
      // MAX, not HIGH: this is the one notification a provider loses money by
      // missing, and it is the only channel we set this high. Everything else
      // stays on the default channel precisely so this one stands out.
      importance: 5,
      // Resolves to android/app/src/main/res/raw/job_request.<ext>. The plugin
      // strips the extension itself, so the bare name is what belongs here.
      sound: "job_request",
      vibration: true,
      visibility: 1,
    });
  } catch (err) {
    // A provider with no channel still receives job pushes — they just arrive
    // on the default channel with the default sound. Degrading to the old
    // behaviour is much better than failing registration and leaving them with
    // no notifications at all.
    console.warn("[fcm] job-request channel unavailable", err);
  }
}
