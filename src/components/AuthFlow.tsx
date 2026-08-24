import { useState, useEffect, useRef } from "react";
import { REGEXP_ONLY_DIGITS } from "input-otp";
import { useAuth } from "@/lib/auth-context";
import { API_BASE_URL } from "@/lib/api";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { motion, AnimatePresence } from "framer-motion";
import { Phone, ArrowRight, Loader2 } from "lucide-react";

// The splash step was moved to a root-level `SplashGate` so the
// animation runs on every cold app open regardless of auth state.
// AuthFlow starts directly at phone entry — a user who has been
// through the splash and lands here is already committed to signing
// in.
type AuthStep = "phone" | "otp";

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
      const res = await fetch(`${API_BASE_URL}/auth/send-otp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: `+91${phone}` }),
      });
      if (!res.ok) throw new Error("Failed to send OTP");
      setStep("otp");
      setResendTimer(30);
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : "Failed to send OTP. Please try again.");
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
      const res = await fetch(`${API_BASE_URL}/auth/verify-otp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: `+91${phone}`, otp: code, role: "consumer" }),
      });
      if (!res.ok) throw new Error("Failed to verify OTP");
      const tokenData = (await res.json()) as {
        access_token: string;
        refresh_token: string;
        is_new_user?: boolean;
      };

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
                  Resend OTP in <span className="font-semibold text-primary">{resendTimer}s</span>
                </p>
              ) : (
                <button
                  onClick={() => setResendTimer(30)}
                  className="text-sm font-semibold text-primary"
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
