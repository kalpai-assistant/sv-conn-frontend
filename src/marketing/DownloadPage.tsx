/**
 * Marketing /download — port of src/routes/download.tsx.
 *
 * Deliberate duplication rather than a shared component: the app version
 * uses TanStack Router + apiFetch (for the SMS-a-link form), pulling in
 * the auth context and API layer. Importing any of that from a marketing
 * SPA that has no auth doubles the bundle for no gain. Keeping the two
 * versions side-by-side means the marketing bundle stays tight and each
 * page can drift independently.
 *
 * Differences vs the app version:
 * - No TanStack Router (this is a plain SPA)
 * - Desktop path shows QR only — no SMS-a-link form (that would pull in
 *   apiFetch and every layer under it)
 * - APK button gated on VITE_APK_URL (build-time env, same rule as app)
 */
import { QRCodeSVG } from "qrcode.react";
import { useEffect, useState } from "react";
import { AlertCircle, Apple, Download, Smartphone } from "lucide-react";

import { detectPlatform, type Platform } from "@/lib/platform";

const DOWNLOAD_URL = "https://eazyserv.com/download";
const APK_URL = import.meta.env.VITE_APK_URL || "";
const APK_VERSION = "1.0.0-beta";
const APK_SIZE_MB = 15;

export function DownloadPage() {
  // Default during SSR-ish first paint. Mount effect flips to the real
  // platform — same pattern as the app version, prevents a hydration
  // mismatch warning if we ever add SSR to this build.
  const [detected, setDetected] = useState<ReturnType<typeof detectPlatform> | null>(null);
  useEffect(() => {
    setDetected(detectPlatform());
  }, []);

  const platform: Platform = detected?.platform ?? "desktop";

  return (
    <div className="min-h-screen bg-background text-foreground">
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
    </div>
  );
}

// ---------------------------------------------------------------------------
// Android — direct APK
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
            Android 12+ scopes &ldquo;install unknown apps&rdquo; per browser. If the toggle
            doesn't appear when you open the APK, go to:
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
// iOS — PWA Add-to-Home-Screen
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
              You appear to be on a different iOS browser. Only Safari can add Eazyserv to your
              home screen. Copy this URL and open it in Safari:
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
              Tap the <span className="font-medium">Share</span> button (the square with an
              upward arrow) at the bottom of Safari.
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
// Desktop — QR only. The app version has an SMS-a-link form here that
// hits the backend; skipping it in marketing keeps the bundle free of
// the API/auth layer.
// ---------------------------------------------------------------------------

function DesktopSection() {
  return (
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
  );
}
