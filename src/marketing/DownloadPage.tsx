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
 *
 * SVC-378 Phase 4 rewrite:
 * - AvailabilityCheck + hardcoded PIN list removed. The previous list
 *   was explicitly marked MUST-NOT-SHIP in the source; it also contradicted
 *   itself (Kothrud + Viman Nagar were offered as chips but then refused
 *   as uncovered). The honest replacement: no coverage check on this page
 *   until real dispatch data lands. The app itself tells the visitor at
 *   PIN-entry whether their address is covered — that's the right place
 *   for the authoritative answer.
 * - Platform-branched visual anchors: each of Android / iOS / Desktop now
 *   carries its own icon tile + card treatment rather than three identical
 *   cards with different bodies. Gives "am I in the right place?" a
 *   one-glance answer.
 * - Install steps use numbered pill tiles (matching HowItWorks on the
 *   home page) so the rhythm reads as part of one brand, not a different
 *   page with different furniture.
 */
import { QRCodeSVG } from "qrcode.react";
import { useEffect, useState } from "react";
import {
  AlertCircle,
  Apple,
  ArrowRight,
  BadgeCheck,
  Download,
  MapPin,
  Smartphone,
} from "lucide-react";

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
      {/* Decorative glow — matches the home hero's treatment so the two
          pages feel like the same identity. */}
      <div aria-hidden className="pointer-events-none fixed inset-x-0 top-0 -z-10 h-[32rem]">
        <div className="absolute left-1/2 -top-32 h-[32rem] w-[32rem] -translate-x-1/2 rounded-full bg-primary/15 blur-3xl" />
      </div>

      <div className="mx-auto max-w-2xl px-5 py-10 md:py-16">
        <header className="mb-10 text-center">
          <a
            href="/"
            className="inline-flex items-center gap-2 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            ← eazyserv.com
          </a>
          <h1 className="mt-6 text-4xl font-extrabold tracking-[-0.02em] text-foreground md:text-5xl">
            Get <span className="text-primary">EazyServ</span>
          </h1>
          <p className="mx-auto mt-4 max-w-lg text-sm leading-relaxed text-muted-foreground md:text-base">
            Home services at your doorstep in Pune. Install in a couple of minutes.
          </p>
          <p className="mt-3 text-xs text-muted-foreground">
            In beta. Open the app to check whether your locality is covered today — we add new
            neighbourhoods each week.
          </p>
        </header>

        {platform === "android" && <AndroidSection />}
        {platform === "ios" && detected && (
          <IosSection isSafari={detected.isSafari} isStandalone={detected.isIosStandalone} />
        )}
        {platform === "desktop" && <DesktopSection />}

        <footer className="mt-12 text-center text-xs text-muted-foreground">
          Trouble installing?{" "}
          <a
            href="mailto:support@eazyserv.com"
            className="font-medium text-foreground underline underline-offset-2 hover:text-primary"
          >
            support@eazyserv.com
          </a>
        </footer>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------------------
 * Shared building blocks
 * ------------------------------------------------------------------------- */

/**
 * Platform-identity card header. Three icon tiles (Android / Apple /
 * Smartphone-for-desktop) with consistent treatment so a visitor can tell
 * the page detected them correctly before reading a single step.
 */
function PlatformHero({
  Icon,
  title,
  subtitle,
}: {
  Icon: typeof Download;
  title: string;
  subtitle: string;
}) {
  return (
    <div className="mb-6 flex items-center gap-4">
      <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">
        <Icon className="h-7 w-7" />
      </span>
      <div className="min-w-0">
        <h2 className="text-lg font-semibold text-foreground md:text-xl">{title}</h2>
        <p className="mt-0.5 text-xs text-muted-foreground md:text-sm">{subtitle}</p>
      </div>
    </div>
  );
}

/**
 * Numbered step pill, mirrors the HowItWorks timeline on the home page so
 * the two surfaces feel like one brand. aria-hidden on the number because
 * the OL already carries the sequence semantic.
 */
function Step({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <li className="flex gap-4">
      <span
        aria-hidden
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 border-primary bg-background text-sm font-bold text-primary"
      >
        {n}
      </span>
      <div className="pt-1 text-sm leading-relaxed text-foreground">{children}</div>
    </li>
  );
}

/* ---------------------------------------------------------------------------
 * Android — direct APK
 * ------------------------------------------------------------------------- */

function AndroidSection() {
  const hasApk = Boolean(APK_URL);
  return (
    <section>
      {/* Hero card — the whole page's one shadow-lift block, same treatment
          as the home page's closing CTA. */}
      <div className="shadow-primary-lift relative overflow-hidden rounded-2xl border border-primary/20 bg-card p-7">
        <PlatformHero
          Icon={Download}
          title="Download for Android"
          subtitle="Direct APK — no Play Store needed"
        />

        {hasApk ? (
          <a
            href={APK_URL}
            className="focus-inset group inline-flex w-full items-center justify-center rounded-xl bg-primary px-6 py-3.5 text-base font-semibold text-primary-foreground shadow-lg shadow-primary/20 transition-all hover:shadow-xl hover:shadow-primary/30 hover:brightness-110"
          >
            Download the APK
            <ArrowRight className="ml-2 h-4 w-4 transition-transform group-hover:translate-x-0.5" />
          </a>
        ) : (
          <div className="inline-flex w-full items-center justify-center rounded-xl bg-muted px-6 py-3.5 text-base font-semibold text-muted-foreground">
            Coming very soon
          </div>
        )}

        <div className="mt-4 flex items-center justify-between text-xs text-muted-foreground">
          <span>
            Version {APK_VERSION} · ~{APK_SIZE_MB} MB
          </span>
          <span className="inline-flex items-center gap-1">
            <BadgeCheck className="h-3.5 w-3.5 text-primary" />
            Signed by EazyServ
          </span>
        </div>
      </div>

      {/* Install walkthrough */}
      <div className="mt-10 rounded-2xl border border-border bg-card p-7 shadow-sm">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          How to install
        </h3>
        <ol className="mt-5 space-y-4">
          <Step n={1}>Tap Download above — your browser saves the APK to Downloads.</Step>
          <Step n={2}>Open the downloaded file (Notifications tray or Files app).</Step>
          <Step n={3}>
            Android asks <span className="font-medium">&ldquo;Install unknown apps?&rdquo;</span> —
            tap <span className="font-medium">Settings</span> → toggle{" "}
            <span className="font-medium">Allow from this source</span> → back.
          </Step>
          <Step n={4}>
            Tap <span className="font-medium">Install</span>.
          </Step>
          <Step n={5}>Open EazyServ and sign in with your phone number.</Step>
        </ol>
      </div>

      <details className="mt-6 rounded-xl border border-border bg-muted/40 p-4 text-sm">
        <summary className="cursor-pointer font-medium text-foreground">
          Android 12 or later? The "unknown apps" toggle isn't showing up?
        </summary>
        <div className="mt-3 space-y-2 text-sm leading-relaxed text-muted-foreground">
          <p>
            Android 12+ scopes "install unknown apps" per browser. If the toggle doesn't appear when
            you open the APK, go to:
          </p>
          <p className="rounded-lg bg-background px-3 py-2 font-mono text-xs text-foreground">
            Settings → Apps → Special app access → Install unknown apps → your browser → Allow
          </p>
          <p>Then re-open the downloaded APK.</p>
        </div>
      </details>
    </section>
  );
}

/* ---------------------------------------------------------------------------
 * iOS — PWA Add-to-Home-Screen
 * ------------------------------------------------------------------------- */

function IosSection({ isSafari, isStandalone }: { isSafari: boolean; isStandalone: boolean }) {
  if (isStandalone) {
    return (
      <section className="rounded-2xl border border-border bg-card p-7 text-center shadow-sm">
        <Apple className="mx-auto mb-4 h-10 w-10 text-foreground" />
        <h2 className="text-lg font-semibold text-foreground">You're already installed</h2>
        <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-muted-foreground">
          EazyServ is on your home screen. Open it from there for the full app experience.
        </p>
      </section>
    );
  }

  return (
    <section>
      <div className="shadow-primary-lift relative overflow-hidden rounded-2xl border border-primary/20 bg-card p-7">
        <PlatformHero
          Icon={Apple}
          title="Install on iPhone"
          subtitle="Runs through Safari — no App Store needed"
        />
        <p className="text-sm leading-relaxed text-muted-foreground">
          EazyServ runs on iPhone via Safari's Add-to-Home-Screen flow. It installs as a native app
          on your home screen in under a minute.
        </p>
      </div>

      {!isSafari && (
        <div
          role="status"
          className="mt-6 flex items-start gap-3 rounded-xl border border-amber-400/40 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-500/30 dark:bg-amber-950/40 dark:text-amber-100"
        >
          <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" />
          <div>
            <p className="font-semibold">Open this page in Safari</p>
            <p className="mt-1 text-xs leading-relaxed">
              Only Safari can add EazyServ to your home screen. Copy this URL and paste it into
              Safari:
            </p>
            <p className="mt-2 rounded-lg bg-background/60 px-2 py-1.5 font-mono text-xs text-foreground/90">
              {DOWNLOAD_URL}
            </p>
          </div>
        </div>
      )}

      <div className="mt-10 rounded-2xl border border-border bg-card p-7 shadow-sm">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Add to Home Screen
        </h3>
        <ol className="mt-5 space-y-4">
          <Step n={1}>
            Tap the <span className="font-medium">Share</span> button (the square with an upward
            arrow) at the bottom of Safari.
          </Step>
          <Step n={2}>
            Scroll down and tap{" "}
            <span className="font-medium">&ldquo;Add to Home Screen&rdquo;</span>.
          </Step>
          <Step n={3}>
            Tap <span className="font-medium">Add</span> in the top-right corner.
          </Step>
          <Step n={4}>
            Open EazyServ from your home screen — it behaves just like a native app.
          </Step>
        </ol>
      </div>
    </section>
  );
}

/* ---------------------------------------------------------------------------
 * Desktop — QR only. The app version has an SMS-a-link form here that
 * hits the backend; skipping it in marketing keeps the bundle free of
 * the API/auth layer.
 * ------------------------------------------------------------------------- */

function DesktopSection() {
  return (
    <section>
      <div className="shadow-primary-lift relative overflow-hidden rounded-2xl border border-primary/20 bg-card p-7">
        <PlatformHero
          Icon={Smartphone}
          title="Open on your phone"
          subtitle="EazyServ is mobile-first — point a phone camera at the code below"
        />

        <div className="mt-6 flex flex-col items-center gap-5 sm:flex-row sm:items-start">
          <div className="shrink-0 rounded-xl bg-white p-4 shadow-sm ring-1 ring-border/60">
            <QRCodeSVG value={DOWNLOAD_URL} size={176} level="M" />
          </div>
          <ol className="flex-1 space-y-4">
            <Step n={1}>Open your phone's camera app.</Step>
            <Step n={2}>Point it at the QR code until a link appears.</Step>
            <Step n={3}>
              Tap the link — it opens this page on your phone, which then shows the Android or
              iPhone install flow directly.
            </Step>
          </ol>
        </div>

        <p className="mt-6 flex items-center gap-2 text-xs text-muted-foreground">
          <MapPin className="h-3.5 w-3.5 shrink-0 text-primary" />
          Opens {DOWNLOAD_URL}
        </p>
      </div>
    </section>
  );
}
