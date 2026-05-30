import { useState, useEffect } from "react";
import { useAuth } from "@/lib/auth-context";
import { API_BASE_URL } from "@/lib/api";
import { motion, AnimatePresence } from "framer-motion";
import { Phone, ArrowRight, Loader2 } from "lucide-react";

type AuthStep = "splash" | "phone" | "otp";

export function AuthFlow({ onComplete }: { onComplete: () => void }) {
  const [step, setStep] = useState<AuthStep>("splash");
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState(["", "", "", "", "", ""]);
  const [loading, setLoading] = useState(false);
  const [resendTimer, setResendTimer] = useState(0);
  const [errorMsg, setErrorMsg] = useState("");
  // Splash auto-advance
  useEffect(() => {
    if (step === "splash") {
      const t = setTimeout(() => setStep("phone"), 2000);
      return () => clearTimeout(t);
    }
  }, [step]);

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

  const handleOtpChange = async (index: number, value: string) => {
    if (value.length > 1) return;
    const newOtp = [...otp];
    newOtp[index] = value;
    setOtp(newOtp);
    // Auto-focus next
    if (value && index < 5) {
      const next = document.getElementById(`otp-${index + 1}`);
      next?.focus();
    }
    // Auto-verify when complete
    if (newOtp.every((d) => d !== "")) {
      setLoading(true);
      try {
        const res = await fetch(`${API_BASE_URL}/auth/verify-otp`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ phone: `+91${phone}`, otp: newOtp.join(""), role: "consumer" }),
        });
        if (!res.ok) throw new Error("Failed to verify OTP");
        const tokenData = (await res.json()) as {
          access_token: string;
          refresh_token: string;
          is_new_user?: boolean;
        };

        // Fetch user profile using the access token
        const userRes = await fetch(`${API_BASE_URL}/users/me`, {
          headers: { Authorization: `Bearer ${tokenData.access_token}` },
        });
        if (!userRes.ok) throw new Error("Failed to fetch user profile");
        const userData = await userRes.json();

        login(tokenData.access_token, tokenData.refresh_token, userData, tokenData.is_new_user);
        onComplete();
      } catch (e: any) {
        console.error(e);
        setErrorMsg(e instanceof Error ? e.message : "Invalid OTP. Please try again.");
        setOtp(["", "", "", "", "", ""]);
        document.getElementById("otp-0")?.focus();
      } finally {
        setLoading(false);
      }
    }
  };

  const handleOtpKeyDown = (index: number, e: React.KeyboardEvent) => {
    if (e.key === "Backspace" && !otp[index] && index > 0) {
      const prev = document.getElementById(`otp-${index - 1}`);
      prev?.focus();
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-background">
      <AnimatePresence mode="wait">
        {step === "splash" && (
          <motion.div
            key="splash"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="flex h-full flex-col items-center justify-center bg-primary"
          >
            <motion.div
              initial={{ scale: 0.5, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ type: "spring", duration: 0.8 }}
              className="text-center"
            >
              <div className="mb-4 flex h-20 w-20 items-center justify-center rounded-2xl bg-primary-foreground/20 mx-auto">
                <span className="text-4xl font-bold text-primary-foreground">SC</span>
              </div>
              <h1 className="text-3xl font-bold text-primary-foreground">ServiceConnect</h1>
              <p className="mt-2 text-primary-foreground/70 text-sm">
                Home services at your doorstep
              </p>
            </motion.div>
          </motion.div>
        )}

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
            <div className="mt-8 flex justify-center gap-3">
              {otp.map((digit, i) => (
                <input
                  key={i}
                  id={`otp-${i}`}
                  type="tel"
                  maxLength={1}
                  value={digit}
                  onChange={(e) => handleOtpChange(i, e.target.value)}
                  onKeyDown={(e) => handleOtpKeyDown(i, e)}
                  className="h-14 w-12 rounded-xl border-2 border-border bg-card text-center text-xl font-bold text-foreground outline-none transition-colors focus:border-primary"
                  autoFocus={i === 0}
                />
              ))}
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
