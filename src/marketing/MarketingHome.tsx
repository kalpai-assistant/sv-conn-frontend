/**
 * Marketing homepage — served at eazyserv.com (apex + www).
 *
 * This is a public, unauthenticated page. No API calls, no auth, no service
 * worker, no push notifications — everything that lives on app.eazyserv.com
 * stays there. Its only jobs are:
 *
 *   1. Explain what Eazyserv is in one screen.
 *   2. Send the visitor to the app (Open on app.eazyserv.com) or the APK
 *      download page (/download) depending on device.
 *   3. Link out to legal (/privacy, /terms, /refund) — those pages are
 *      shared with the app build and reachable on both domains.
 *
 * Kept intentionally minimal for beta: hero, four service tiles, trust
 * bar, footer. Iterate copy + hero art once content lands.
 */
import { ArrowRight, ShieldCheck, Sparkles, Wallet } from "lucide-react";
import { Link } from "@tanstack/react-router";

const APP_URL = "https://app.eazyserv.com";

const SERVICES = [
  { name: "Home Cleaning", desc: "Deep-clean, kitchen, bathroom" },
  { name: "Plumbing", desc: "Leaks, fittings, installations" },
  { name: "Electrical", desc: "Wiring, fans, switches" },
  { name: "Salon at Home", desc: "Haircut, facial, waxing" },
];

export function MarketingHome() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <Header />
      <Hero />
      <ServicesGrid />
      <TrustBar />
      <Footer />
    </div>
  );
}

function Header() {
  return (
    <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
      <div className="text-lg font-bold tracking-tight text-primary">Eazyserv</div>
      <a
        href={APP_URL}
        className="hidden sm:inline-flex items-center gap-1 rounded-lg border border-border bg-card px-4 py-2 text-sm font-medium text-foreground hover:bg-muted"
      >
        Open the app <ArrowRight className="h-4 w-4" />
      </a>
    </header>
  );
}

function Hero() {
  return (
    <section className="mx-auto max-w-6xl px-6 pt-10 pb-16 md:pt-16 md:pb-24">
      <div className="mx-auto max-w-3xl text-center">
        <h1 className="text-4xl font-bold leading-tight tracking-tight text-foreground md:text-6xl">
          Home services at your doorstep in <span className="text-primary">Bangalore</span>
        </h1>
        <p className="mt-6 text-base text-muted-foreground md:text-lg">
          Book verified professionals for cleaning, plumbing, electrical, and salon services.
          Transparent pricing, doorstep OTP verification, no surprises.
        </p>
        <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <a
            href={APP_URL}
            className="inline-flex w-full items-center justify-center rounded-xl bg-primary px-6 py-3 text-base font-semibold text-primary-foreground shadow-sm transition-transform hover:scale-[1.02] sm:w-auto"
          >
            Open the app
          </a>
          <Link
            to="/download"
            className="inline-flex w-full items-center justify-center rounded-xl border border-border bg-card px-6 py-3 text-base font-semibold text-foreground hover:bg-muted sm:w-auto"
          >
            Download for Android
          </Link>
        </div>
        <p className="mt-4 text-xs text-muted-foreground">
          Currently in beta. Serving select localities in Bangalore.
        </p>
      </div>
    </section>
  );
}

function ServicesGrid() {
  return (
    <section className="mx-auto max-w-6xl px-6 pb-16 md:pb-24">
      <h2 className="mb-8 text-center text-2xl font-semibold text-foreground md:text-3xl">
        What we do
      </h2>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {SERVICES.map((s) => (
          <div
            key={s.name}
            className="rounded-2xl border border-border bg-card p-6 shadow-sm transition-shadow hover:shadow-md"
          >
            <h3 className="text-base font-semibold text-foreground">{s.name}</h3>
            <p className="mt-1 text-sm text-muted-foreground">{s.desc}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

function TrustBar() {
  const items = [
    { Icon: ShieldCheck, title: "Verified providers", desc: "KYC-checked professionals only" },
    { Icon: Wallet, title: "Transparent pricing", desc: "See the price before you book" },
    { Icon: Sparkles, title: "Doorstep OTP", desc: "Service starts only after your OTP" },
  ];
  return (
    <section className="border-y border-border bg-muted/40 py-14">
      <div className="mx-auto grid max-w-6xl grid-cols-1 gap-8 px-6 md:grid-cols-3">
        {items.map(({ Icon, title, desc }) => (
          <div key={title} className="flex items-start gap-4">
            <div className="rounded-xl bg-primary/10 p-3 text-primary">
              <Icon className="h-5 w-5" />
            </div>
            <div>
              <p className="text-sm font-semibold text-foreground">{title}</p>
              <p className="mt-1 text-sm text-muted-foreground">{desc}</p>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="mx-auto max-w-6xl px-6 py-10 text-sm text-muted-foreground">
      <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
        <div>© {new Date().getFullYear()} Eazyserv. All rights reserved.</div>
        <div className="flex flex-wrap gap-x-6 gap-y-2">
          <Link to="/privacy" className="hover:text-foreground">
            Privacy
          </Link>
          <Link to="/terms" className="hover:text-foreground">
            Terms
          </Link>
          <Link to="/refund" className="hover:text-foreground">
            Refund
          </Link>
          <a href="mailto:support@eazyserv.com" className="hover:text-foreground">
            support@eazyserv.com
          </a>
        </div>
      </div>
    </footer>
  );
}
