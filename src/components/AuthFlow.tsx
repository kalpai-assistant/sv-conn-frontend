import { useState, useEffect, useRef } from "react";
import { REGEXP_ONLY_DIGITS } from "input-otp";
import { useAuth } from "@/lib/auth-context";
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
 * How long "Resend OTP" stays disabled after a successful send. Purely a
 * courtesy against double-tapping — the enforced limit is the backend's
 * OTP_MAX_ATTEMPTS_PER_HOUR (5/hour/phone), and a 429 overrides this with
 * the real remaining lockout from `Retry-After`.
 */
const RESEND_COOLDOWN_SECONDS = 30;

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

export function AuthFlow({ onComplete }: { onComplete: () => void }) {
  const [step, setStep] = useState<AuthStep>("phone");
  const [phone, setPhone] = useState("");
  // One string, not six cells: `InputOTP` owns a single hidden input and
  // renders the boxes from its value. That is what makes paste, digit
  // filtering and one-time-code autofill work without hand-rolling them.
  const [otp, setOtp] = useState("");
  const [loading, setLoading] = useState(false);
  const [resendTimer, setResendTimer] = useState(0);
  const [errorMsg, setErrorMsg] = useState("");
  // Guards `onComplete` against re-entry. The user can backspace and retype
  // while a verify is in flight, which completes the value a second time —
  // and the OTP is single-use, so the second call would fail and race an
  // error over the first call's success. Deliberately not solved by
  // disabling the input: that blurs it, and a failed verify then needs a tap
  // before the user can retry.
  const verifying = useRef(false);

  // Resend timer
  useEffect(() => {
    if (resendTimer > 0) {
      const t = setTimeout(() => setResendTimer(resendTimer - 1), 1000);
      return () => clearTimeout(t);
    }
  }, [resendTimer]);

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
      setResendTimer(RESEND_COOLDOWN_SECONDS);
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : "Failed to send OTP. Please try again.");
      // A 429 states exactly how long this phone is locked out for. Hold the
      // resend button for that long instead of the courtesy 30s, which would
      // re-arm the button well before the backend would accept it and hand
      // the user a second identical failure.
      if (e instanceof ApiError && e.status === 429 && e.retryAfter) {
        setResendTimer(e.retryAfter);
      }
    } finally {
      setLoading(false);
    }
  };

  const { login } = useAuth(); // We need basic login from context instead of mockLogin

  const handleOtpChange = (value: string) => {
    setOtp(value);
    // Drop a previous failure the moment the user starts correcting it.
    // Leaving "Invalid OTP" on screen while they retype reads as a live
    // verdict on the code they are currently entering.
    if (errorMsg) setErrorMsg("");
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
        body: JSON.stringify({ phone: `+91${phone}`, otp: code, role: "consumer" }),
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

      login(tokenData.access_token, tokenData.refresh_token, userData, tokenData.is_new_user);
      onComplete();
    } catch (e) {
      console.error(e);
      setErrorMsg(e instanceof Error ? e.message : "Invalid OTP. Please try again.");
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
  const goBackToPhone = () => {
    setStep("phone");
    setOtp("");
    setErrorMsg("");
    // The countdown belongs to the number we just left. Rate limiting is
    // per-phone, so a different number starts with its own budget.
    setResendTimer(0);
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
  }, [step]);

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
            <h1 className="text-2xl font-bold text-foreground">Enter your phone number</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              We'll send you an OTP to verify your identity
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
