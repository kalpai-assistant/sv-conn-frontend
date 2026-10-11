import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "@tanstack/react-router";
import { REGEXP_ONLY_DIGITS } from "input-otp";
import { useAuth, type UserRole } from "@/lib/auth-context";
import { API_BASE_URL, ApiError, apiFetch } from "@/lib/api";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { pushBackInterceptor } from "@/lib/back-interceptor";
import { motion, AnimatePresence } from "framer-motion";
import { Phone, ArrowRight, ArrowLeft, Loader2 } from "lucide-react";

// The splash step was moved to a root-level `SplashGate` so the
// animation runs on every cold app open regardless of auth state.
// AuthFlow starts directly at phone entry — a user who has been
// through the splash and lands here is already committed to signing
// in.
type AuthStep = "phone" | "otp";

/**
 * The roles a signup can create. Derived from `UserRole` rather than spelled
 * out so the two cannot drift, but narrowed: admins sign in through the
 * dedicated /admin/login flow (SVC-345), not here. `/auth/verify-otp` rejects
 * `role=admin` with a 422, and the backend's role gate on the consumer path
 * refuses an admin phone with ROLE_MISMATCH — both deliberate, so this flow
 * stays scoped to the consumer / provider role picker.
 */
type SignupRole = Exclude<UserRole, "admin">;

/**
 * How long "Resend OTP" stays disabled after a successful send. Purely a
 * courtesy against double-tapping — the enforced limit is the backend's
 * OTP_MAX_ATTEMPTS_PER_HOUR (5/hour/phone), and a 429 overrides this with
 * the real remaining lockout from `Retry-After`.
 */
const RESEND_COOLDOWN_SECONDS = 30;

/** Stable identifier for SVC-253's Policy A rejection, set by the backend's
 *  `RoleMismatch` exception. */
const ROLE_MISMATCH = "ROLE_MISMATCH";

/**
 * Did this failure mean "that phone belongs to the other role"?
 *
 * The `code` alone. This used to fall back to matching `/already registered
 * as/i` on the message, which made the backend's wording load-bearing: reword
 * that sentence and the one affordance that unsticks the user disappears, with
 * no type and no test to notice. The fallback existed only for the window
 * before backend #146 deployed; that shipped and is live on beta, verified
 * returning `code: "ROLE_MISMATCH"`, so it is gone.
 */
function isRoleMismatch(error: unknown): boolean {
  return error instanceof ApiError && error.status === 400 && error.code === ROLE_MISMATCH;
}

/**
 * Renders a countdown. Bare seconds below a minute, minutes above it — a
 * rate-limit lockout can run to the better part of an hour, and "Resend OTP
 * in 2431s" is not a number anyone can act on.
 */
function formatCountdown(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  return `${minutes}m ${String(seconds % 60).padStart(2, "0")}s`;
}

export function AuthFlow({
  onComplete,
  invite = false,
}: {
  onComplete: () => void;
  /**
   * Signing in on /invite to join a team (SVC-322). Locks the signup to a
   * customer account and hides "Are you a service provider?".
   *
   * Not cosmetic. A team Pro must be a consumer-role account: a provider
   * account gets its own Pro-for-self at birth, and accept-invite then refuses
   * it (ALREADY_PRO_ELSEWHERE) — for life, since a phone keeps its role
   * (SVC-253). One tap on the provider link here would strand the invitee.
   * It is also the UX half of SVC-327: a consumer signup never meets the
   * payout (bank/UPI) step, which only provider onboarding has.
   */
  invite?: boolean;
}) {
  const [step, setStep] = useState<AuthStep>("phone");
  const [phone, setPhone] = useState("");
  // Which identity this signup creates. SVC-252: this was hardcoded
  // "consumer" at the verify call, so every account made through the app was
  // a consumer and every provider on beta had to be flipped by hand with
  // `UPDATE users SET role='PROVIDER'`. Nothing is written server-side until
  // verify-otp fires, so the choice stays free right up to that point.
  const [role, setRole] = useState<SignupRole>("consumer");
  // One string, not six cells: `InputOTP` owns a single hidden input and
  // renders the boxes from its value. That is what makes paste, digit
  // filtering and one-time-code autofill work without hand-rolling them.
  const [otp, setOtp] = useState("");
  const [loading, setLoading] = useState(false);
  // Wall-clock instant the resend button re-arms, and the seconds derived
  // from it for display. See the effect below for why it isn't a counter.
  const [resendAt, setResendAt] = useState<number | null>(null);
  const [resendTimer, setResendTimer] = useState(0);
  const [errorMsg, setErrorMsg] = useState("");
  // Set when SVC-253 Policy A refuses the verify because this phone is bound
  // to the other role. Drives an explicit "sign in as X instead" action on the
  // OTP step: the backend's message tells the user to switch roles, but the
  // switcher lives on the phone step, so without this they have to work out
  // the two-step route on their own.
  const [roleConflict, setRoleConflict] = useState(false);
  // Guards `onComplete` against re-entry. The user can backspace and retype
  // while a verify is in flight, which completes the value a second time —
  // and the OTP is single-use, so the second call would fail and race an
  // error over the first call's success. Deliberately not solved by
  // disabling the input: that blurs it, and a failed verify then needs a tap
  // before the user can retry.
  const verifying = useRef(false);

  // The cooldown is stored as a deadline and the displayed seconds are
  // derived from it, rather than decremented.
  //
  // Android's WebView freezes timers while the app is backgrounded — which
  // is exactly what a user does on this screen, leaving to read the SMS. A
  // decrementing counter therefore stalls for however long they were away
  // and then resumes as if no time had passed, so "30s" can span well over a
  // minute of wall clock. Recomputing from Date.now() re-syncs within one
  // tick of resume and needs no App resume listener.
  useEffect(() => {
    if (resendAt === null) return;

    const tick = () => {
      const remaining = Math.max(0, Math.ceil((resendAt - Date.now()) / 1000));
      setResendTimer(remaining);
      // Stop the interval once it's spent rather than ticking forever.
      if (remaining === 0) setResendAt(null);
    };

    tick();
    // Twice a second, so the number is never more than ~500ms stale after a
    // resume. A 1s interval would leave a visible wrong value on return.
    const id = setInterval(tick, 500);
    return () => clearInterval(id);
  }, [resendAt]);

  const startResendCooldown = (seconds: number) => setResendAt(Date.now() + seconds * 1000);

  // Switching identity invalidates whatever the last attempt said — most
  // pointedly SVC-253's "already registered as consumer" 400, which is a
  // verdict on the role being left behind, not the one being chosen.
  const switchRole = (next: SignupRole) => {
    setRole(next);
    setErrorMsg("");
    setRoleConflict(false);
  };

  const handleSendOtp = async () => {
    if (phone.length < 10) return;
    setLoading(true);
    setErrorMsg("");
    try {
      await apiFetch("/auth/send-otp", {
        method: "POST",
        body: JSON.stringify({ phone: `+91${phone}` }),
      });
      setStep("otp");
      startResendCooldown(RESEND_COOLDOWN_SECONDS);
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : "Failed to send OTP. Please try again.");
      // A 429 states exactly how long this phone is locked out for. Hold the
      // resend button for that long instead of the courtesy 30s, which would
      // re-arm the button well before the backend would accept it and hand
      // the user a second identical failure.
      if (e instanceof ApiError && e.status === 429 && e.retryAfter) {
        startResendCooldown(e.retryAfter);
      }
    } finally {
      setLoading(false);
    }
  };

  const { login } = useAuth(); // We need basic login from context instead of mockLogin
  const navigate = useNavigate();

  const handleOtpChange = (value: string) => {
    setOtp(value);
    // Drop a previous failure the moment the user starts correcting it.
    // Leaving "Invalid OTP" on screen while they retype reads as a live
    // verdict on the code they are currently entering.
    if (errorMsg) {
      setErrorMsg("");
      setRoleConflict(false);
    }
  };

  const handleVerify = async (code: string) => {
    if (verifying.current) return;
    verifying.current = true;
    setLoading(true);
    try {
      // apiFetch, not raw fetch: it surfaces the backend's own message, and
      // its 401-refresh retry cannot fire here — InvalidOTP is a 400, so a
      // wrong code will never cause the single-use OTP to be re-posted.
      const tokenData = await apiFetch<{
        access_token: string;
        refresh_token: string;
        is_new_user?: boolean;
      }>("/auth/verify-otp", {
        method: "POST",
        body: JSON.stringify({ phone: `+91${phone}`, otp: code, role }),
      });

      // Fetch user profile using the access token. Deliberately a raw fetch
      // rather than `apiFetch`: the tokens are not in the api module yet —
      // `login` below is what stores them — so apiFetch would send a stale
      // header or none at all.
      const userRes = await fetch(`${API_BASE_URL}/users/me`, {
        headers: { Authorization: `Bearer ${tokenData.access_token}` },
      });
      if (!userRes.ok) throw new Error("Failed to fetch user profile");
      const userData = await userRes.json();
      // Default to the role we just signed up as if the profile somehow omits
      // one (older accounts predating SVC-41). Safe to trust the local value
      // here: SVC-253 Policy A means verify-otp only succeeds when the stored
      // role matches the one we asked for — a mismatch is a 400 we never get
      // past. Backend stays authoritative once the /users/me probe on
      // cold-start re-fetches with the field populated.
      userData.role = userData.role ?? role;

      login(tokenData.access_token, tokenData.refresh_token, userData, tokenData.is_new_user);
      onComplete();
    } catch (e) {
      console.error(e);
      setErrorMsg(e instanceof Error ? e.message : "Invalid OTP. Please try again.");
      setRoleConflict(isRoleMismatch(e));
      // Clearing the value resets the boxes to the first slot. The hidden
      // input keeps focus throughout, so the user can retype immediately.
      setOtp("");
    } finally {
      verifying.current = false;
      setLoading(false);
    }
  };

  // Returning to phone entry has to be possible from the OTP step. Without
  // it a single mistyped digit is unrecoverable: the code goes to a number
  // the user doesn't own, and there is nowhere to go but out of the app.
  // Stable so the back-interceptor effect below re-registers only when the
  // step changes, not on every render.
  const goBackToPhone = useCallback(() => {
    setStep("phone");
    setOtp("");
    setErrorMsg("");
    // The countdown belongs to the number we just left. Rate limiting is
    // per-phone, so a different number starts with its own budget.
    setResendAt(null);
    setResendTimer(0);
    setRoleConflict(false);
  }, []);

  // One tap for the whole remedy the Policy A message describes. The rejected
  // verify already consumed the code — `verify_otp` deletes the stored value
  // the moment it matches and Policy A raises after that — so retrying these
  // same digits under the other role would only earn "OTP is incorrect or has
  // expired". Flip the role and return for a fresh code.
  const retryAsOtherRole = () => {
    switchRole(role === "provider" ? "consumer" : "provider");
    goBackToPhone();
  };

  // Claim the Android hardware back button while the OTP step is up. The
  // router's handler in main.mobile.tsx cannot see this component — it is an
  // auth gate rendered outside the route tree — so without this, back falls
  // through to "press back again to exit".
  useEffect(() => {
    if (step !== "otp") return;
    return pushBackInterceptor(() => {
      goBackToPhone();
      return true;
    });
  }, [step, goBackToPhone]);

  return (
    <div className="fixed inset-0 z-50 bg-background">
      <AnimatePresence mode="wait">
        {step === "phone" && (
          <motion.div
            key="phone"
            initial={{ x: 300, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: -300, opacity: 0 }}
            className="flex h-full flex-col px-6 pt-20"
          >
            {/* The heading carries the role choice rather than a switch beside
                the input. A phone is bound to one role for life (SVC-253
                Policy A), so the commitment is restated in front of the user
                while they type the number it will bind. */}
            <h1 className="text-2xl font-bold text-foreground">
              {invite
                ? "Sign in to join your team"
                : role === "provider"
                  ? "Join as a service provider"
                  : "Enter your phone number"}
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">
              {invite
                ? "Use the number your invite was sent to. We'll send you an OTP to verify it."
                : role === "provider"
                  ? "Earn on your schedule. We'll verify your number first."
                  : "We'll send you an OTP to verify your identity"}
            </p>
            {errorMsg && (
              <div className="mt-4 rounded-xl bg-destructive/10 p-3 text-sm text-destructive">
                {errorMsg}
              </div>
            )}
            <div className="mt-8 flex items-center gap-3 rounded-xl border border-border bg-card p-4">
              <Phone className="h-5 w-5 text-muted-foreground" />
              <span className="text-sm font-medium text-muted-foreground">+91</span>
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value.replace(/\D/g, "").slice(0, 10))}
                placeholder="98765 43210"
                className="flex-1 bg-transparent text-lg font-medium text-foreground outline-none placeholder:text-muted-foreground/50"
                autoFocus
              />
            </div>
            <button
              onClick={handleSendOtp}
              disabled={phone.length < 10 || loading}
              className="mt-6 flex h-14 w-full items-center justify-center gap-2 rounded-xl bg-primary font-semibold text-primary-foreground transition-all disabled:opacity-50"
            >
              {loading ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                <>
                  Send OTP <ArrowRight className="h-5 w-5" />
                </>
              )}
            </button>
            {/* SVC-252: the only route into provider signup. Deliberately a
                link and not a toggle next to the phone field — the role is
                permanent, so a mistapped switch would strand a consumer on a
                number that can never book, and the remedy the backend offers
                is "use a different phone". A link needs a deliberate press.
                Quiet by design: providers are recruited and arrive knowing to
                look for this, while consumers are the overwhelming majority
                and should read straight past it. */}
            {invite ? null : role === "consumer" ? (
              <>
                <button
                  type="button"
                  onClick={() => switchRole("provider")}
                  className="mt-6 self-center text-sm font-medium text-muted-foreground underline underline-offset-4"
                >
                  Are you a service provider?
                </button>
                {/* SVC-331: the only way in for a Pro who opens the app without
                    the invite SMS's link. /invite renders this flow again in
                    invite mode, then the code entry. Consumer mode only: a
                    team Pro must be a customer account (see `invite` above),
                    so offering it beside a provider signup would invite the
                    one combination that can never join. */}
                <button
                  type="button"
                  onClick={() => navigate({ to: "/invite" })}
                  className="mt-4 self-center text-sm font-medium text-muted-foreground underline underline-offset-4"
                >
                  Joining a team? I have an invite code
                </button>
              </>
            ) : (
              <div className="mt-6 flex flex-col items-center gap-1">
                <span className="text-sm text-muted-foreground">Signing up as a provider</span>
                <button
                  type="button"
                  onClick={() => switchRole("consumer")}
                  className="text-sm font-semibold text-primary"
                >
                  Switch to booking a service
                </button>
              </div>
            )}
          </motion.div>
        )}

        {step === "otp" && (
          <motion.div
            key="otp"
            initial={{ x: 300, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: -300, opacity: 0 }}
            className="flex h-full flex-col px-6 pt-20"
          >
            <h1 className="text-2xl font-bold text-foreground">Verify OTP</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Enter the 6-digit code sent to +91 {phone}
            </p>
            {/* Sits directly under the number it edits, so the fix is where
                the user notices the mistake. */}
            <button
              onClick={goBackToPhone}
              className="mt-2 flex items-center gap-1 self-start text-sm font-semibold text-primary"
            >
              <ArrowLeft className="h-4 w-4" /> Change number
            </button>
            {errorMsg && (
              <div className="mt-4 rounded-xl bg-destructive/10 p-3 text-sm text-destructive">
                {errorMsg}
                {/* Inside the error box, in the error's own colour, rather than
                    floating below it in the brand tint. The backend names the
                    remedy — "sign in with the same role" — but cannot know our
                    navigation, so this offers the move as one tap; sitting it
                    within the message it acts on is what reads as cause and
                    remedy instead of two unrelated things stacked. */}
                {/* On an invite there is no other role to offer: a provider
                    number cannot join a team, and saying so is the remedy. */}
                {roleConflict && invite && (
                  <span className="mt-2 block">
                    This number is registered as a service provider, so it can’t join a team.
                  </span>
                )}
                {roleConflict && !invite && (
                  <button
                    onClick={retryAsOtherRole}
                    className="mt-2 block font-semibold underline underline-offset-4"
                  >
                    {role === "provider"
                      ? "Sign in as a customer instead"
                      : "Sign in as a service provider instead"}
                  </button>
                )}
              </div>
            )}
            <div className="mt-8 flex justify-center">
              <InputOTP
                maxLength={6}
                value={otp}
                onChange={handleOtpChange}
                onComplete={handleVerify}
                // Rejects anything non-numeric at the source, matching the
                // phone field above, which filters \D on every keystroke.
                pattern={REGEXP_ONLY_DIGITS}
                // Codes get copied out of an SMS with the surrounding text,
                // so "123 456" and "123-456" should paste as cleanly as
                // "123456".
                pasteTransformer={(pasted) => pasted.replace(/\D/g, "")}
                // The OS one-time-code suggestion chip. Unrelated to WebOTP
                // (SVC-239) — that needs a specific SMS body we can't emit
                // until the DLT template lands; this only needs the
                // attribute, and works today on iOS and most Android
                // keyboards.
                autoComplete="one-time-code"
                inputMode="numeric"
                autoFocus
              >
                <InputOTPGroup className="gap-3">
                  {[0, 1, 2, 3, 4, 5].map((i) => (
                    <InputOTPSlot key={i} index={i} />
                  ))}
                </InputOTPGroup>
              </InputOTP>
            </div>
            {loading && (
              <div className="mt-6 flex justify-center">
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
              </div>
            )}
            <div className="mt-6 text-center">
              {resendTimer > 0 ? (
                <p className="text-sm text-muted-foreground">
                  Resend OTP in{" "}
                  <span className="font-semibold text-primary">{formatCountdown(resendTimer)}</span>
                </p>
              ) : (
                <button
                  onClick={handleSendOtp}
                  disabled={loading}
                  className="text-sm font-semibold text-primary disabled:opacity-50"
                >
                  Resend OTP
                </button>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
