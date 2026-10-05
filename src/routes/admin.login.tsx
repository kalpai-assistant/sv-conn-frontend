/**
 * Admin login (SVC-345).
 *
 * Dedicated OTP flow for the admin surface, independent of the consumer /
 * provider AuthFlow. Posts to /auth/admin/send-otp + /auth/admin/verify-otp
 * — endpoints that only succeed for an existing user with role=admin and
 * flat 404 for every other phone, so this page cannot be used to enumerate
 * which numbers are admin accounts.
 *
 * The screen deliberately isn't an AuthFlow abstraction: the role picker, the
 * "sign in as X instead" affordance, and the SignupRole hygiene around
 * consumer-vs-provider don't apply here. Admins never sign up through the
 * app; they're created by scripts/create_admin.py.
 *
 * Guards live in __root.tsx: unauthenticated access to /admin/* redirects
 * here, and an already-signed-in admin arriving here hops to /admin (the
 * dashboard, SVC-346).
 */
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { ArrowLeft, ArrowRight, Loader2, Phone, ShieldCheck } from "lucide-react";
import { REGEXP_ONLY_DIGITS } from "input-otp";
import { apiFetch, ApiError, API_BASE_URL } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";

export const Route = createFileRoute("/admin/login")({
  component: AdminLoginPage,
});

type Step = "phone" | "otp";

type AdminTokenResponse = {
  access_token: string;
  refresh_token: string;
  is_new_user?: boolean;
};

function AdminLoginPage() {
  const navigate = useNavigate();
  const { login } = useAuth();

  const [step, setStep] = useState<Step>("phone");
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  const handleSendOtp = async () => {
    if (phone.length < 10) return;
    setLoading(true);
    setErrorMsg("");
    try {
      await apiFetch("/auth/admin/send-otp", {
        method: "POST",
        body: JSON.stringify({ phone: `+91${phone}` }),
      });
      setStep("otp");
    } catch (e) {
      // The backend's 404 means "no admin account for this phone", flat
      // across consumer / provider / unknown rows — the role-enumeration
      // leak the endpoint exists to close. Surface it as a specific line so
      // a mistyped number is self-evident; no "sign in as consumer instead"
      // because consumers don't live under /admin.
      if (e instanceof ApiError && e.status === 404) {
        setErrorMsg("This phone is not registered as an admin.");
      } else if (e instanceof ApiError && e.status === 429) {
        setErrorMsg("Too many attempts. Try again later.");
      } else {
        setErrorMsg(e instanceof Error ? e.message : "Failed to send OTP. Please try again.");
      }
    } finally {
      setLoading(false);
    }
  };

  const handleVerify = async (code: string) => {
    setLoading(true);
    setErrorMsg("");
    try {
      const tokenData = await apiFetch<AdminTokenResponse>("/auth/admin/verify-otp", {
        method: "POST",
        body: JSON.stringify({ phone: `+91${phone}`, otp: code }),
      });

      // Raw fetch, same reason as AuthFlow: the tokens aren't in the api
      // module yet — `login` below is what persists them — so apiFetch
      // would send a stale header or none at all.
      const userRes = await fetch(`${API_BASE_URL}/users/me`, {
        headers: { Authorization: `Bearer ${tokenData.access_token}` },
      });
      if (!userRes.ok) throw new Error("Failed to fetch admin profile");
      const userData = await userRes.json();
      // The backend only mints an admin JWT for an admin row, so the role
      // on the fetched profile is always "admin" here — but default
      // defensively in case /users/me is still on an older build that
      // omits the field.
      userData.role = userData.role ?? "admin";

      login(tokenData.access_token, tokenData.refresh_token, userData, tokenData.is_new_user);
      // SVC-346: land on the dashboard rather than deep-linking to KYC. The
      // shell + top nav are the natural entry point now that one exists.
      navigate({ to: "/admin", replace: true });
    } catch (e) {
      // 400 InvalidOTP (same wire shape as the consumer path) and 404
      // (admin was deactivated between send + verify) both read as
      // "something about the code or the account" — one line, same copy.
      if (e instanceof ApiError && e.status === 404) {
        setErrorMsg("This phone is not registered as an admin.");
      } else {
        setErrorMsg(e instanceof Error ? e.message : "OTP is incorrect or has expired.");
      }
      setOtp("");
    } finally {
      setLoading(false);
    }
  };

  const handleOtpChange = (value: string) => {
    setOtp(value);
    if (errorMsg) setErrorMsg("");
  };

  const goBackToPhone = () => {
    setStep("phone");
    setOtp("");
    setErrorMsg("");
  };

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col px-6 pt-20">
      <div className="mb-8 flex items-center gap-3">
        <ShieldCheck className="h-6 w-6 text-primary" />
        <h1 className="text-2xl font-bold text-foreground">Admin sign in</h1>
      </div>

      {step === "phone" && (
        <>
          <p className="text-sm text-muted-foreground">
            Enter the mobile number registered for your admin account.
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
        </>
      )}

      {step === "otp" && (
        <>
          <p className="text-sm text-muted-foreground">
            Enter the 6-digit code sent to +91 {phone}
          </p>
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
              pattern={REGEXP_ONLY_DIGITS}
              pasteTransformer={(pasted) => pasted.replace(/\D/g, "")}
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
            <button
              onClick={handleSendOtp}
              disabled={loading}
              className="text-sm font-semibold text-primary disabled:opacity-50"
            >
              Resend OTP
            </button>
          </div>
        </>
      )}
    </div>
  );
}
