/**
 * /download — the beta's front door (SVC-161).
 *
 * Device-aware landing page. Detects the visitor's platform and shows one
 * of three flows:
 *
 * - **Android mobile**: direct-APK download button + install instructions
 *   for "unknown sources" flow (Android 12+ specifics called out).
 * - **iOS mobile**: Add-to-Home-Screen walkthrough (PWA). Includes the
 *   "you're using Chrome on iOS" nudge to switch to Safari when needed.
 * - **Desktop / other**: QR code linking back to this page + a
 *   phone-number form that SMSes the link (backend endpoint is
 *   feature-flagged; graceful fallback to QR-only on 501).
 *
 * Public route — reachable without login. See __root.tsx `isPublicRoute`.
 *
 * The APK URL comes from an env var so it can swap between S3 (prod) and
 * a local file (dev). Until SVC-160's S3 bucket is up, `VITE_APK_URL`
 * points at a placeholder and the Android button shows a "coming soon"
 * state instead of a broken link.
 */
import { createFileRoute } from "@tanstack/react-router";
import { QRCodeSVG } from "qrcode.react";
import { useEffect, useState } from "react";
import { AlertCircle, Apple, Download, MessageSquare, Smartphone } from "lucide-react";

import { apiFetch, ApiError } from "@/lib/api";
import { detectPlatform, type Platform } from "@/lib/platform";

export const Route = createFileRoute("/download")({
  head: () => ({
    meta: [
      { title: "Download Eazyserv" },
      {
        name: "description",
        content: "Get the Eazyserv app on Android or iOS.",
      },
    ],
  }),
  component: DownloadPage,
});

const DOWNLOAD_URL = "https://eazyserv.com/download";
const APK_URL = import.meta.env.VITE_APK_URL || ""; // Set once SVC-160's S3 bucket is up
const APK_VERSION = "1.0.0-beta"; // Bump when a new APK is released
const APK_SIZE_MB = 15; // Approx; refresh on each release

function DownloadPage() {
  // Default to "desktop" during SSR — hydrate to actual platform on mount.
  // Prevents the client-vs-server mismatch React warns about.
  const [detected, setDetected] = useState<ReturnType<typeof detectPlatform> | null>(null);
  useEffect(() => {
    setDetected(detectPlatform());
  }, []);

  const platform: Platform = detected?.platform ?? "desktop";

  return (
    <div className="mx-auto max-w-2xl px-4 py-10 md:py-16">
      <header className="mb-8 text-center">
        <h1 className="text-3xl font-bold text-foreground md:text-4xl">Get Eazyserv</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          On-demand home services in Bangalore. Beta preview.
        </p>
      </header>

      {platform === "android" && <AndroidSection />}
      {platform === "ios" && detected && (
        <IosSection isSafari={detected.isSafari} isStandalone={detected.isIosStandalone} />
      )}
      {platform === "desktop" && <DesktopSection />}

      <footer className="mt-12 text-center text-xs text-muted-foreground">
        Trouble installing?{" "}
        <a href="mailto:support@eazyserv.com" className="underline hover:text-foreground">
          support@eazyserv.com
        </a>
      </footer>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Android
// ---------------------------------------------------------------------------

function AndroidSection() {
  const hasApk = Boolean(APK_URL);

  return (
    <section>
      <div className="rounded-2xl border border-border bg-card p-6 text-center shadow-sm">
        <Download className="mx-auto mb-3 h-10 w-10 text-primary" />
        {hasApk ? (
          <a
            href={APK_URL}
            className="inline-flex items-center justify-center rounded-xl bg-primary px-6 py-3 text-base font-semibold text-primary-foreground transition-transform hover:scale-[1.02]"
          >
            Download Eazyserv
          </a>
        ) : (
          <div className="inline-flex items-center justify-center rounded-xl bg-muted px-6 py-3 text-base font-semibold text-muted-foreground">
            Coming very soon
          </div>
        )}
        <p className="mt-3 text-xs text-muted-foreground">
          v{APK_VERSION} · ~{APK_SIZE_MB} MB
        </p>
      </div>

      <div className="mt-8">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          How to install
        </h2>
        <ol className="space-y-3 text-sm text-foreground">
          <li>
            <span className="mr-2 font-semibold text-primary">1.</span>
            Tap Download above — your browser will save the APK to Downloads.
          </li>
          <li>
            <span className="mr-2 font-semibold text-primary">2.</span>
            Open the downloaded file (Notifications tray or Files app).
          </li>
          <li>
            <span className="mr-2 font-semibold text-primary">3.</span>
            Android will ask{" "}
            <span className="font-medium">&ldquo;Install unknown apps?&rdquo;</span> — tap{" "}
            <span className="font-medium">Settings</span> → toggle{" "}
            <span className="font-medium">Allow from this source</span> → back.
          </li>
          <li>
            <span className="mr-2 font-semibold text-primary">4.</span>
            Tap <span className="font-medium">Install</span>.
          </li>
          <li>
            <span className="mr-2 font-semibold text-primary">5.</span>
            Open Eazyserv, sign in with your phone.
          </li>
        </ol>
      </div>

      <details className="mt-6 rounded-lg border border-border bg-muted/40 p-4 text-sm">
        <summary className="cursor-pointer font-medium text-foreground">
          Trouble on Android 12 or later?
        </summary>
        <div className="mt-3 space-y-2 text-muted-foreground">
          <p>
            Android 12+ scopes &ldquo;install unknown apps&rdquo; per browser. If the toggle doesn't
            appear when you open the APK, go to:
          </p>
          <p className="rounded bg-background px-3 py-2 font-mono text-xs">
            Settings → Apps → Special app access → Install unknown apps → your browser → Allow
          </p>
          <p>Then re-open the downloaded APK.</p>
        </div>
      </details>
    </section>
  );
}

// ---------------------------------------------------------------------------
// iOS — PWA Add-to-Home-Screen walkthrough
// ---------------------------------------------------------------------------

function IosSection({ isSafari, isStandalone }: { isSafari: boolean; isStandalone: boolean }) {
  if (isStandalone) {
    return (
      <section className="rounded-2xl border border-border bg-card p-6 text-center shadow-sm">
        <Apple className="mx-auto mb-3 h-10 w-10 text-foreground" />
        <h2 className="text-lg font-semibold text-foreground">You're already installed</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Eazyserv is on your home screen. Open it from there for the full app experience.
        </p>
      </section>
    );
  }

  return (
    <section>
      <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
        <div className="flex items-center gap-3">
          <Apple className="h-10 w-10 text-foreground" />
          <div>
            <h2 className="text-lg font-semibold text-foreground">Install on iPhone</h2>
            <p className="text-xs text-muted-foreground">
              Eazyserv runs on iOS through Safari — no App Store needed.
            </p>
          </div>
        </div>
      </div>

      {!isSafari && (
        <div className="mt-4 flex items-start gap-3 rounded-lg border border-amber-400/40 bg-amber-50 p-4 text-sm text-amber-900 dark:bg-amber-950/40 dark:text-amber-100">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            <p className="font-medium">Open this page in Safari</p>
            <p className="mt-1 text-xs">
              You appear to be on a different iOS browser. Only Safari can add Eazyserv to your home
              screen. Copy this URL and open it in Safari:
              <span className="mt-1 block break-all rounded bg-background px-2 py-1 font-mono text-xs">
                {DOWNLOAD_URL}
              </span>
            </p>
          </div>
        </div>
      )}

      <div className="mt-6">
        <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          Add to Home Screen
        </h3>
        <ol className="space-y-4 text-sm text-foreground">
          <li className="flex gap-3">
            <span className="font-semibold text-primary">1.</span>
            <span>
              Tap the <span className="font-medium">Share</span> button (the square with an upward
              arrow) at the bottom of Safari.
            </span>
          </li>
          <li className="flex gap-3">
            <span className="font-semibold text-primary">2.</span>
            <span>
              Scroll down and tap{" "}
              <span className="font-medium">&ldquo;Add to Home Screen&rdquo;</span>.
            </span>
          </li>
          <li className="flex gap-3">
            <span className="font-semibold text-primary">3.</span>
            <span>
              Tap <span className="font-medium">Add</span> in the top-right corner.
            </span>
          </li>
          <li className="flex gap-3">
            <span className="font-semibold text-primary">4.</span>
            <span>Open Eazyserv from your home screen — it works just like a native app.</span>
          </li>
        </ol>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Desktop — QR code + SMS-a-link form (with graceful fallback)
// ---------------------------------------------------------------------------

function DesktopSection() {
  return (
    <div className="grid gap-6 md:grid-cols-2">
      <section className="rounded-2xl border border-border bg-card p-6 text-center shadow-sm">
        <Smartphone className="mx-auto mb-3 h-10 w-10 text-primary" />
        <h2 className="text-lg font-semibold text-foreground">Scan on your phone</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Point your phone camera at the code below.
        </p>
        <div className="mt-4 flex justify-center">
          <div className="rounded-xl bg-white p-4">
            <QRCodeSVG value={DOWNLOAD_URL} size={180} level="M" />
          </div>
        </div>
        <p className="mt-3 text-xs text-muted-foreground">Opens {DOWNLOAD_URL}</p>
      </section>

      <SmsLinkSection />
    </div>
  );
}

function SmsLinkSection() {
  const [phone, setPhone] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error" | "unavailable">("idle");
  const [errorMsg, setErrorMsg] = useState("");

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setState("sending");
    setErrorMsg("");
    try {
      await apiFetch<void>("/downloads/sms-link", {
        method: "POST",
        body: JSON.stringify({ phone: normalizePhone(phone) }),
      });
      setState("sent");
    } catch (err) {
      if (err instanceof ApiError && err.status === 501) {
        // Feature flag off on backend — scan the QR instead.
        setState("unavailable");
      } else if (err instanceof ApiError && err.status === 429) {
        setState("error");
        setErrorMsg("Too many requests. Please try again in a while.");
      } else if (err instanceof ApiError && err.status === 422) {
        setState("error");
        setErrorMsg("That doesn't look like a valid Indian mobile number.");
      } else {
        setState("error");
        setErrorMsg("Couldn't send the link. Please scan the QR instead.");
      }
    }
  };

  return (
    <section className="rounded-2xl border border-border bg-card p-6 shadow-sm">
      <MessageSquare className="mb-3 h-10 w-10 text-primary" />
      <h2 className="text-lg font-semibold text-foreground">Text me the link</h2>
      <p className="mt-1 text-xs text-muted-foreground">
        We'll SMS this page to your phone. Standard rates apply.
      </p>

      {state === "sent" ? (
        <div className="mt-4 rounded-lg bg-green-50 p-4 text-sm text-green-900 dark:bg-green-950/40 dark:text-green-100">
          Sent — check your messages.
        </div>
      ) : state === "unavailable" ? (
        <div className="mt-4 rounded-lg border border-border bg-muted p-4 text-sm text-muted-foreground">
          SMS isn't set up yet. Scan the QR code instead.
        </div>
      ) : (
        <form onSubmit={submit} className="mt-4 space-y-3">
          <div className="flex overflow-hidden rounded-lg border border-border bg-background">
            <span className="border-r border-border bg-muted px-3 py-2 text-sm font-medium text-muted-foreground">
              +91
            </span>
            <input
              type="tel"
              inputMode="numeric"
              pattern="[6-9][0-9]{9}"
              placeholder="9876543210"
              value={phone}
              onChange={(e) => setPhone(e.target.value.replace(/\D/g, "").slice(0, 10))}
              disabled={state === "sending"}
              className="flex-1 bg-transparent px-3 py-2 text-sm text-foreground focus:outline-none disabled:opacity-50"
              required
              minLength={10}
              maxLength={10}
            />
          </div>
          {errorMsg && <p className="text-xs text-destructive">{errorMsg}</p>}
          <button
            type="submit"
            disabled={state === "sending" || phone.length !== 10}
            className="w-full rounded-lg bg-primary py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
          >
            {state === "sending" ? "Sending…" : "Send download link"}
          </button>
        </form>
      )}
    </section>
  );
}

function normalizePhone(raw: string): string {
  // Strip non-digits, then prepend +91 for the backend's E.164 validator.
  const digits = raw.replace(/\D/g, "");
  return `+91${digits}`;
}
