/**
 * SVC-398: a one-line call site for haptic feedback.
 *
 * `@capacitor/haptics` is a native plugin — on web it is literally a no-op by
 * design, and even on a native device Android < 12 has uneven support. This
 * module wraps the two patterns the ticket calls for (`Light` impact for
 * confirming taps, `Success` notification for the server-confirmed booking)
 * and swallows every error, so a call site never has to defend against the
 * no-op case or the uneven-support case.
 *
 * **Where the ticket asks for haptics**:
 *   - `hapticImpactLight()` fires on OTP verified, add-to-cart, and the
 *     "payment posted" moment inside the Razorpay success handler.
 *   - `hapticSuccess()` fires once the server confirms the booking — the
 *     celebration overlay trigger (`setCelebratingBookingId` in cart.tsx).
 *
 * Only primary success moments. The ticket spells this out and the physics
 * agrees: a haptic on every tap dulls the effect to the point of noise.
 */
import { Capacitor } from "@capacitor/core";
import { Haptics, ImpactStyle, NotificationType } from "@capacitor/haptics";

/**
 * Fire a soft "that landed" tap.
 *
 * The web PWA has no vibration motor in this plugin's abstraction — the call
 * resolves to a no-op there, so no platform guard is needed on the call site.
 * We still gate on `Capacitor.isNativePlatform()` as a belt-and-braces guard
 * against the (occasional) WebView that evaluates `Capacitor.getPlatform()`
 * before the native bridge is wired, which would otherwise `await` an
 * unresolved promise.
 */
export function hapticImpactLight(): void {
  if (!Capacitor.isNativePlatform()) return;
  // Fire-and-forget. The plugin surfaces errors as rejections (eg device
  // vibration disabled in Settings → Sounds); swallowing them keeps the
  // CTA path clean, because a missing haptic is less bad than an uncaught
  // promise rejection crashing the WebView.
  void Haptics.impact({ style: ImpactStyle.Light }).catch(() => undefined);
}

/**
 * Fire the stronger triple-buzz pattern iOS reserves for "operation
 * succeeded".
 *
 * Only called from the one spot where a booking is server-confirmed; the
 * Light impact that fires moments earlier (Razorpay success handler) is a
 * separate, softer tap, so the user feels a progression: payment posted →
 * booking confirmed.
 */
export function hapticSuccess(): void {
  if (!Capacitor.isNativePlatform()) return;
  void Haptics.notification({ type: NotificationType.Success }).catch(() => undefined);
}
