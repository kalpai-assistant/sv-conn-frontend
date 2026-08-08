/**
 * Marketing homepage — served at eazyserv.com (apex + www).
 *
 * This is a public, unauthenticated page. No API calls, no auth, no service
 * worker, no push notifications — everything that lives on app.eazyserv.com
 * stays there. Its only jobs are:
 *
 *   1. Explain what EazyServ is in one screen.
 *   2. Send the visitor to the APK download page (/download).
 *   3. Link out to legal (/privacy, /terms, /refund) — those pages are
 *      shared with the app build and reachable on both domains.
 *
 * Design constraints, deliberately held:
 *
 * - Colours come only from the shared theme tokens in src/styles.css
 *   (primary / background / card / muted / border). That file is also the
 *   app's theme — never restyle it from here. Depth comes from opacity
 *   ramps on `primary`, not from new hues.
 * - No framer-motion. The app uses it, but this bundle is kept clear of
 *   the app's heavy deps; every transition here is plain CSS.
 * - No client router and no JS-driven scroll. Section anchors are real
 *   hrefs; smoothing is a CSS property set on <html> in
 *   index.marketing.html.
 * - The FAQ is <details>/<summary> rather than a Radix accordion, for the
 *   same bundle reason (and it works with JS disabled).
 */
import { useEffect, useState } from "react";
import {
  ArrowRight,
  BadgeCheck,
  Building2,
  CalendarCheck,
  ChevronDown,
  KeyRound,
  MapPin,
  Menu,
  RefreshCw,
  Scissors,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Users,
  Wallet,
  Wrench,
  X,
  Zap,
} from "lucide-react";

import { Reveal } from "./Reveal";
import { FacebookIcon, InstagramIcon, LinkedInIcon, XIcon, YouTubeIcon } from "./SocialIcons";
import { useActiveSection, useScrolled } from "./use-nav-state";

// Every link on this page is a full navigation (no client router — this
// is a plain SPA entry, not TanStack Router). /download is mirrored on
// this marketing build so the CTA stays on the same domain; legal pages
// stay on the app subdomain because reviewers hit those URLs directly
// and mirroring them here would just be another thing to drift.
const APP_URL = "https://app.eazyserv.com";
const DOWNLOAD_URL = "/download";
const PRIVACY_URL = `${APP_URL}/privacy`;
const TERMS_URL = `${APP_URL}/terms`;
const REFUND_URL = `${APP_URL}/refund`;
const SUPPORT_EMAIL = "support@eazyserv.com";

// ---------------------------------------------------------------------------
// Social accounts — FILL IN `href` AS EACH ACCOUNT IS CREATED.
//
// `href` is the company's own profile URL and is the only field to edit.
// `home` is the platform's own homepage and exists purely as a placeholder
// target while `href` is empty, so the icons are clickable before the
// accounts exist. SocialRow prefers `href` and falls back to `home`, so
// pasting a profile URL into `href` swaps the destination with no other
// change.
//
// Do NOT guess a handle (e.g. instagram.com/eazyserv) as a stand-in. If
// someone else owns it, the footer sends customers to a stranger's profile.
// The platform homepage is the safe placeholder — it is never wrong, just
// not yet specific.
// ---------------------------------------------------------------------------
const SOCIALS = [
  // Instagram: the handle URL only. The share link this came from carried
  // `igsh` and `utm_source=qr` params, which identify a single QR scan
  // session — baking those into a site-wide link pollutes their analytics
  // and tells every visitor they arrived by scanning the same code.
  {
    name: "Instagram",
    href: "https://www.instagram.com/eazyserv",
    home: "https://www.instagram.com",
    Icon: InstagramIcon,
  },
  // Numeric profile.php URL because the page has no vanity username yet.
  // Valid, just unfriendly — swap this for facebook.com/<username> once a
  // username is claimed on the page.
  {
    name: "Facebook",
    href: "https://www.facebook.com/profile.php?id=61593274072168",
    home: "https://www.facebook.com",
    Icon: FacebookIcon,
  },
  { name: "X", href: "https://x.com/EazyServ", home: "https://x.com", Icon: XIcon },
  { name: "LinkedIn", href: "", home: "https://www.linkedin.com", Icon: LinkedInIcon },
  {
    name: "YouTube",
    href: "https://www.youtube.com/@EazyServ",
    home: "https://www.youtube.com",
    Icon: YouTubeIcon,
  },
];

const SERVICES = [
  { name: "Home Cleaning", desc: "Deep-clean, kitchen, bathroom", Icon: Sparkles },
  { name: "Plumbing", desc: "Leaks, fittings, installations", Icon: Wrench },
  { name: "Electrical", desc: "Wiring, fans, switches", Icon: Zap },
  { name: "Salon at Home", desc: "Haircut, facial, waxing", Icon: Scissors },
];

const STEPS = [
  {
    Icon: Smartphone,
    title: "Pick your service",
    desc: "Choose what you need and see the price up front — before anything is booked.",
  },
  {
    Icon: CalendarCheck,
    title: "Get matched",
    desc: "A KYC-verified professional near you accepts the job and heads over.",
  },
  {
    Icon: KeyRound,
    title: "Share your OTP",
    desc: "Work starts only once you hand over the doorstep code. You stay in control.",
  },
];

const TRUST = [
  {
    Icon: ShieldCheck,
    title: "Verified providers",
    desc: "Every professional clears KYC before taking a single job.",
  },
  {
    Icon: Wallet,
    title: "Transparent pricing",
    desc: "See the full price before you book. No call-out fees, no surprises.",
  },
  {
    Icon: BadgeCheck,
    title: "Doorstep OTP",
    desc: "Service begins only after you share your code — proof the right person arrived.",
  },
];

// ---------------------------------------------------------------------------
// About / "who we are".
//
// Every claim below is traceable to src/legal/*.md — the registered entity
// name, the marketplace model, and the substitution promise all come from
// terms.md and privacy.md. Nothing here is invented.
//
// STILL TO FILL IN (do not guess these — they are facts about the company
// that only the founders can confirm):
//   - Year founded / "since 20XX"
//   - Registered office address, CIN and GST number
//   - Founder names or team size, if we want a human face on the page
// Add them here once confirmed; the layout already has room.
// ---------------------------------------------------------------------------
const ABOUT_FACTS = [
  {
    Icon: Building2,
    // The registered entity name is a legal fact taken verbatim from
    // src/legal/*.md — it stays "Eazyserv" even though the brand is now
    // written "EazyServ". Do not "fix" the spelling here to match the
    // wordmark; only a change to the incorporation record changes this.
    title: "Eazyserv Technologies India Private Limited",
    desc: "The registered company behind the platform and the app.",
  },
  {
    Icon: MapPin,
    title: "Based in Pune",
    desc: "Live in select localities today, opening up more as we grow.",
  },
  {
    Icon: Users,
    title: "A marketplace, not an agency",
    desc: "We connect you with independent professionals — we don't employ them, and we verify every one.",
  },
  {
    Icon: RefreshCw,
    title: "You're never left waiting",
    desc: "If your assigned professional can't make it, we offer a replacement from our verified pool.",
  },
];

const FAQS = [
  {
    q: "Which areas do you serve?",
    a: "We're in beta across select localities in Pune and adding more as we grow. Open the app to check whether your PIN code is covered.",
  },
  {
    q: "Is there an iPhone app?",
    a: "Not yet. Android is available as a direct download today, and EazyServ runs on iPhone through Safari — the download page walks you through adding it to your home screen.",
  },
  {
    // Careful: this answer has to stay consistent with src/legal/refund.md,
    // which reserves the right to charge for spare parts/materials (§5) and
    // a visit/inspection charge once the professional is en route (§1.2).
    // Do not simplify this into "no extra charges, ever" — the policy does
    // not say that, and the landing page must not promise more than it.
    q: "How is the price decided?",
    a: "You see the price for the service before you confirm the booking — no bidding, no haggling. Parts or materials, if your job needs them, are charged separately. Our refund and cancellation policy sets out the full detail.",
  },
  {
    q: "What is the doorstep OTP?",
    a: "A short code shown in your app. The professional can't start the job until you share it, so you always know the right person turned up at the right time.",
  },
];

export function MarketingHome() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <Header />
      <main>
        <Hero />
        <ServicesGrid />
        <HowItWorks />
        <TrustBar />
        <About />
        <Faq />
        <CallToAction />
      </main>
      <Footer />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Header
// ---------------------------------------------------------------------------

const NAV_LINKS = [
  ["Services", "#services"],
  ["How it works", "#how-it-works"],
  ["Why us", "#why-us"],
  ["About", "#about"],
  ["FAQ", "#faq"],
] as const;

// Module-level so the reference is stable — useActiveSection re-subscribes
// its observer whenever this array changes identity.
const SECTION_IDS = NAV_LINKS.map(([, href]) => href.slice(1));

function Header() {
  // No "Open the app" CTA here on purpose. Beta is not publicly
  // signup-open, and sending visitors into an app they can't register for
  // reads worse than showing them nothing. Re-add it when signup opens.
  const [menuOpen, setMenuOpen] = useState(false);
  const scrolled = useScrolled();
  const activeSection = useActiveSection(SECTION_IDS);

  // Close on Escape. A menu you can only dismiss by tapping exactly the
  // right spot is a trap on mobile and unusable by keyboard.
  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenuOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [menuOpen]);

  // At the top the header dissolves into the hero; once scrolling starts it
  // earns its border, blur and a tighter height. The menu forces the solid
  // treatment — an open panel hanging off a transparent bar reads as broken.
  const solid = scrolled || menuOpen;

  return (
    <header
      className={`sticky top-0 z-50 transition-all duration-300 ${
        solid
          ? "border-b border-border/60 bg-background/85 backdrop-blur-md"
          : "border-b border-transparent bg-transparent"
      }`}
    >
      <div
        className={`mx-auto flex max-w-6xl items-center justify-between px-6 transition-all duration-300 ${
          solid ? "py-3" : "py-5"
        }`}
      >
        <a href="/" className="flex items-center gap-2">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-primary text-sm font-extrabold text-primary-foreground">
            ES
          </span>
          <span className="text-lg font-extrabold tracking-tight text-foreground">EazyServ</span>
        </a>

        <nav className="hidden items-center gap-6 md:flex lg:gap-8">
          {NAV_LINKS.map(([label, href]) => {
            const isActive = activeSection === href.slice(1);
            return (
              <a
                key={href}
                href={href}
                aria-current={isActive ? "true" : undefined}
                className={`relative text-sm font-medium transition-colors ${
                  isActive ? "text-foreground" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {label}
                {/* Underline is a sibling span rather than a border so it can
                    scale from nothing without shifting the text baseline. */}
                <span
                  aria-hidden
                  className={`absolute -bottom-1.5 left-0 h-0.5 w-full origin-left rounded-full bg-primary transition-transform duration-300 ${
                    isActive ? "scale-x-100" : "scale-x-0"
                  }`}
                />
              </a>
            );
          })}
        </nav>

        <div className="flex items-center gap-2">
          <a
            href={DOWNLOAD_URL}
            className="inline-flex items-center justify-center rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-sm transition-all hover:shadow-md hover:brightness-110 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            Download
          </a>

          {/* Below md the nav above is hidden, which previously left every
              section anchor unreachable on a phone — the majority of this
              site's traffic. This button is the only way in. */}
          <button
            type="button"
            onClick={() => setMenuOpen((open) => !open)}
            aria-expanded={menuOpen}
            aria-controls="mobile-nav"
            aria-label={menuOpen ? "Close menu" : "Open menu"}
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-card text-foreground transition-colors hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring md:hidden"
          >
            {menuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </div>

      {/* Kept mounted but collapsed so the open/close transition can run.
          `invisible` at zero height stops collapsed links being tabbable. */}
      <div
        id="mobile-nav"
        className={`overflow-hidden border-t border-border/60 bg-background/95 transition-all duration-300 ease-out md:hidden ${
          menuOpen ? "max-h-80 visible opacity-100" : "invisible max-h-0 opacity-0"
        }`}
      >
        <nav className="mx-auto flex max-w-6xl flex-col px-6 py-2">
          {NAV_LINKS.map(([label, href]) => (
            <a
              key={href}
              href={href}
              onClick={() => setMenuOpen(false)}
              className="border-b border-border/40 py-3 text-sm font-medium text-muted-foreground transition-colors last:border-0 hover:text-foreground"
            >
              {label}
            </a>
          ))}
        </nav>
      </div>
    </header>
  );
}

// ---------------------------------------------------------------------------
// Hero
// ---------------------------------------------------------------------------

function Hero() {
  return (
    <section className="relative overflow-hidden">
      {/* Decorative glow. Tinted from `primary` at low opacity so it tracks
          the brand colour automatically — no hardcoded purple anywhere. */}
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute -top-32 left-1/2 h-[32rem] w-[32rem] -translate-x-1/2 rounded-full bg-primary/15 blur-3xl" />
        <div className="absolute -right-24 top-24 h-72 w-72 rounded-full bg-primary/10 blur-3xl" />
      </div>

      <div className="mx-auto max-w-6xl px-6 pt-16 pb-20 md:pt-24 md:pb-28">
        <div className="mx-auto max-w-3xl text-center">
          <span className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-60" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-primary" />
            </span>
            Now in beta · Pune
          </span>

          {/* 800 (extrabold) is already in the Inter request in
              index.marketing.html but was previously unused — everything
              topped out at 700, so headings and semibold body text sat too
              close together. Display type takes 800 with tighter tracking;
              optical sizing means large text needs less letter-spacing. */}
          <h1 className="mt-6 text-4xl font-extrabold leading-[1.05] tracking-[-0.02em] text-foreground sm:text-5xl md:text-6xl">
            Home services at your doorstep in <span className="text-primary">Pune</span>
          </h1>

          <p className="mx-auto mt-6 max-w-2xl text-base leading-relaxed text-muted-foreground md:text-lg">
            Book verified professionals for cleaning, plumbing, electrical, and salon services.
            Transparent pricing, doorstep OTP verification, no surprises.
          </p>

          <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <a
              href={DOWNLOAD_URL}
              className="group inline-flex w-full items-center justify-center rounded-xl bg-primary px-7 py-3.5 text-base font-semibold text-primary-foreground shadow-lg shadow-primary/20 transition-all hover:shadow-xl hover:shadow-primary/30 hover:brightness-110 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring sm:w-auto"
            >
              Download for Android
              <ArrowRight className="ml-2 h-4 w-4 transition-transform group-hover:translate-x-0.5" />
            </a>
            <a
              href="#how-it-works"
              className="inline-flex w-full items-center justify-center rounded-xl border border-border bg-card px-7 py-3.5 text-base font-semibold text-foreground shadow-sm transition-colors hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring sm:w-auto"
            >
              How it works
            </a>
          </div>

          <p className="mt-4 text-xs text-muted-foreground">
            Currently in beta. Serving select localities in Pune.
          </p>
        </div>

        {/* Quick reassurance strip. Deliberately qualitative — we don't have
            audited numbers yet, and inventing "10,000+ bookings" on a beta
            landing page is the kind of claim that ages badly. */}
        <ul className="mx-auto mt-14 grid max-w-3xl grid-cols-1 gap-3 sm:grid-cols-3">
          {[
            "KYC-verified professionals",
            "Upfront, fixed pricing",
            "OTP-secured doorstep entry",
          ].map((item) => (
            <li
              key={item}
              className="flex items-center justify-center gap-2 rounded-xl border border-border/70 bg-card/60 px-4 py-3 text-center text-sm text-muted-foreground"
            >
              <BadgeCheck className="h-4 w-4 shrink-0 text-primary" />
              {item}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Services
// ---------------------------------------------------------------------------

function ServicesGrid() {
  return (
    <section id="services" className="scroll-mt-20 border-t border-border/60 py-20 md:py-24">
      <div className="mx-auto max-w-6xl px-6">
        <Reveal>
          <SectionHeading
            eyebrow="What we do"
            title="Four services, done properly"
            subtitle="Every job is handled by a professional who has cleared verification — not an anonymous marketplace listing."
          />
        </Reveal>

        <Reveal delay={100} className="mt-12 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {SERVICES.map(({ name, desc, Icon }) => (
            <div
              key={name}
              className="group rounded-2xl border border-border bg-card p-6 shadow-sm transition-all duration-200 hover:-translate-y-1 hover:border-primary/30 hover:shadow-lg"
            >
              <div className="mb-4 inline-flex rounded-xl bg-primary/10 p-3 text-primary transition-colors group-hover:bg-primary group-hover:text-primary-foreground">
                <Icon className="h-5 w-5" />
              </div>
              <h3 className="text-base font-semibold text-foreground">{name}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{desc}</p>
            </div>
          ))}
        </Reveal>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// How it works
// ---------------------------------------------------------------------------

function HowItWorks() {
  return (
    <section
      id="how-it-works"
      className="scroll-mt-20 border-t border-border/60 bg-muted/30 py-20 md:py-24"
    >
      <div className="mx-auto max-w-6xl px-6">
        <Reveal>
          <SectionHeading
            eyebrow="How it works"
            title="Booked in three steps"
            subtitle="From opening the app to the professional starting work — no phone calls, no haggling."
          />
        </Reveal>

        <Reveal delay={100}>
          <ol className="mt-12 grid grid-cols-1 gap-6 md:grid-cols-3">
            {STEPS.map(({ Icon, title, desc }, i) => (
              <li
                key={title}
                className="relative rounded-2xl border border-border bg-card p-7 shadow-sm transition-shadow hover:shadow-md"
              >
                <span className="absolute right-6 top-6 text-4xl font-bold text-primary/10 tabular-nums">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <div className="mb-4 inline-flex rounded-xl bg-primary/10 p-3 text-primary">
                  <Icon className="h-5 w-5" />
                </div>
                <h3 className="text-base font-semibold text-foreground">{title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{desc}</p>
              </li>
            ))}
          </ol>
        </Reveal>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Trust
// ---------------------------------------------------------------------------

function TrustBar() {
  return (
    <section id="why-us" className="scroll-mt-20 border-t border-border/60 py-20 md:py-24">
      <div className="mx-auto max-w-6xl px-6">
        <Reveal>
          <SectionHeading
            eyebrow="Why EazyServ"
            title="Built so you never have to wonder"
            subtitle="The three things that go wrong with home services — and what we do about each."
          />
        </Reveal>

        <Reveal delay={100} className="mt-12 grid grid-cols-1 gap-8 md:grid-cols-3">
          {TRUST.map(({ Icon, title, desc }) => (
            <div key={title} className="flex items-start gap-4">
              <div className="shrink-0 rounded-xl bg-primary/10 p-3 text-primary">
                <Icon className="h-5 w-5" />
              </div>
              <div>
                <p className="text-base font-semibold text-foreground">{title}</p>
                <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{desc}</p>
              </div>
            </div>
          ))}
        </Reveal>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// About
// ---------------------------------------------------------------------------

function About() {
  return (
    <section id="about" className="scroll-mt-20 border-t border-border/60 py-20 md:py-24">
      <div className="mx-auto max-w-6xl px-6">
        <div className="grid grid-cols-1 items-start gap-12 lg:grid-cols-2 lg:gap-16">
          <Reveal>
            <p className="text-xs font-semibold uppercase tracking-wider text-primary">
              Who we are
            </p>
            <h2 className="mt-3 text-2xl font-extrabold tracking-[-0.02em] text-foreground md:text-4xl">
              Built in Pune, for Pune
            </h2>

            {/* Wording here is deliberately precise about the model. terms.md
                states that Service Professionals are independent third parties
                and are NOT employees, agents or contractors of EazyServ. Copy
                like "our plumbers" or "our staff" would contradict our own
                terms, so keep it as "professionals on the platform". */}
            <p className="mt-6 text-sm leading-relaxed text-muted-foreground md:text-base">
              EazyServ is a home-services platform. We connect you with independent professionals —
              cleaners, plumbers, electricians and beauticians — who work for themselves and have
              cleared our verification before taking a single booking.
            </p>
            <p className="mt-4 text-sm leading-relaxed text-muted-foreground md:text-base">
              Booking someone to come into your home usually means phone calls, unclear prices and
              hoping the right person shows up. We built EazyServ so you see the price before you
              commit, know the professional has been checked, and stay in control right up to the
              moment work begins.
            </p>

            <a
              href="#how-it-works"
              className="mt-7 inline-flex items-center text-sm font-semibold text-primary transition-colors hover:brightness-110"
            >
              See how a booking works
              <ArrowRight className="ml-1.5 h-4 w-4" />
            </a>
          </Reveal>

          {/* The Reveal wraps the <ul> rather than replacing it — a <div>
              between <ul> and its <li> children is invalid HTML and drops the
              list semantics screen readers rely on. */}
          <Reveal delay={120}>
            <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {ABOUT_FACTS.map(({ Icon, title, desc }) => (
                <li
                  key={title}
                  className="rounded-2xl border border-border bg-card p-5 shadow-sm transition-shadow hover:shadow-md"
                >
                  <div className="mb-3 inline-flex rounded-lg bg-primary/10 p-2.5 text-primary">
                    <Icon className="h-4 w-4" />
                  </div>
                  <p className="text-sm font-semibold leading-snug text-foreground">{title}</p>
                  <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{desc}</p>
                </li>
              ))}
            </ul>
          </Reveal>
        </div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// FAQ — native <details> so it works without JS and adds no dependency.
// ---------------------------------------------------------------------------

function Faq() {
  return (
    <section id="faq" className="scroll-mt-20 border-t border-border/60 bg-muted/30 py-20 md:py-24">
      <div className="mx-auto max-w-3xl px-6">
        <Reveal>
          <SectionHeading eyebrow="FAQ" title="Questions people ask first" />
        </Reveal>

        <Reveal delay={100} className="mt-10 space-y-3">
          {FAQS.map(({ q, a }) => (
            <details
              key={q}
              className="group rounded-xl border border-border bg-card px-5 py-4 shadow-sm transition-colors [&[open]]:border-primary/30"
            >
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-sm font-semibold text-foreground marker:hidden">
                {q}
                <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200 group-open:rotate-180" />
              </summary>
              <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{a}</p>
            </details>
          ))}
        </Reveal>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Closing CTA
// ---------------------------------------------------------------------------

function CallToAction() {
  return (
    <section className="border-t border-border/60 py-20 md:py-24">
      <div className="mx-auto max-w-6xl px-6">
        <Reveal className="relative overflow-hidden rounded-3xl border border-primary/20 bg-primary/5 px-6 py-14 text-center md:px-16">
          <div
            aria-hidden
            className="pointer-events-none absolute -top-24 left-1/2 h-72 w-72 -translate-x-1/2 rounded-full bg-primary/15 blur-3xl"
          />
          <h2 className="text-2xl font-extrabold tracking-[-0.02em] text-foreground md:text-3xl">
            Ready when you are
          </h2>
          <p className="mx-auto mt-3 max-w-xl text-sm leading-relaxed text-muted-foreground md:text-base">
            Download the app and book your first service in a couple of minutes.
          </p>
          <a
            href={DOWNLOAD_URL}
            className="group mt-8 inline-flex items-center justify-center rounded-xl bg-primary px-7 py-3.5 text-base font-semibold text-primary-foreground shadow-lg shadow-primary/20 transition-all hover:shadow-xl hover:shadow-primary/30 hover:brightness-110 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            Download for Android
            <ArrowRight className="ml-2 h-4 w-4 transition-transform group-hover:translate-x-0.5" />
          </a>
        </Reveal>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Footer
// ---------------------------------------------------------------------------

function Footer() {
  return (
    <footer className="border-t border-border/60 bg-card/40">
      <div className="mx-auto max-w-6xl px-6 py-14">
        <div className="grid grid-cols-2 gap-8 md:grid-cols-4">
          <div className="col-span-2 md:col-span-1">
            <div className="flex items-center gap-2">
              <span className="grid h-8 w-8 place-items-center rounded-lg bg-primary text-sm font-extrabold text-primary-foreground">
                ES
              </span>
              <span className="text-lg font-extrabold tracking-tight text-foreground">
                EazyServ
              </span>
            </div>
            <p className="mt-3 max-w-xs text-sm leading-relaxed text-muted-foreground">
              On-demand home services in Pune, from professionals who have cleared verification.
            </p>
            <SocialRow />
          </div>

          <FooterColumn
            title="Services"
            links={SERVICES.map((s) => [s.name, "#services"] as const)}
          />
          <FooterColumn
            title="Company"
            links={[
              ["About us", "#about"],
              ["How it works", "#how-it-works"],
              ["Why EazyServ", "#why-us"],
              ["FAQ", "#faq"],
              ["Download", DOWNLOAD_URL],
            ]}
          />
          <FooterColumn
            title="Legal"
            links={[
              ["Privacy", PRIVACY_URL],
              ["Terms", TERMS_URL],
              ["Refund", REFUND_URL],
              [SUPPORT_EMAIL, `mailto:${SUPPORT_EMAIL}`],
            ]}
          />
        </div>

        <div className="mt-12 border-t border-border/60 pt-6 text-sm text-muted-foreground">
          © {new Date().getFullYear()} EazyServ. All rights reserved.
        </div>
      </div>
    </footer>
  );
}

/**
 * Footer social row. Always renders every entry in SOCIALS.
 *
 * Destination is `href` (our profile) when we have one, otherwise `home`
 * (the platform's own site) so the icon is clickable in the meantime. The
 * tooltip and aria-label say which of the two the visitor is getting, so a
 * screen-reader user isn't told "EazyServ on Instagram" and then landed on
 * Instagram's homepage.
 *
 * `rel="me"` is only set on real profile links — it is a claim that the
 * target represents us, which is false for a platform homepage.
 */
function SocialRow() {
  return (
    <div className="mt-6">
      {/* The heading is tied to the list with aria-labelledby so the icons
          are announced as a named group rather than five loose links. */}
      <p id="social-heading" className="text-sm font-semibold text-foreground">
        Find us on
      </p>
      <ul aria-labelledby="social-heading" className="mt-3 flex items-center gap-2">
        {SOCIALS.map(({ name, href, home, Icon }) => {
          const isOurProfile = Boolean(href);
          const label = isOurProfile ? `EazyServ on ${name}` : `${name} — profile coming soon`;

          return (
            <li key={name}>
              <a
                href={href || home}
                target="_blank"
                rel={isOurProfile ? "noopener noreferrer me" : "noopener noreferrer"}
                aria-label={label}
                title={label}
                className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-card text-muted-foreground transition-colors hover:border-primary/30 hover:bg-primary/10 hover:text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
              >
                <Icon className="h-4 w-4" />
              </a>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function FooterColumn({
  title,
  links,
}: {
  title: string;
  links: ReadonlyArray<readonly [string, string]>;
}) {
  return (
    <div>
      <p className="text-sm font-semibold text-foreground">{title}</p>
      <ul className="mt-3 space-y-2">
        {links.map(([label, href]) => (
          <li key={label}>
            <a
              href={href}
              className="text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              {label}
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Shared
// ---------------------------------------------------------------------------

function SectionHeading({
  eyebrow,
  title,
  subtitle,
}: {
  eyebrow: string;
  title: string;
  subtitle?: string;
}) {
  return (
    <div className="mx-auto max-w-2xl text-center">
      <p className="text-xs font-semibold uppercase tracking-wider text-primary">{eyebrow}</p>
      <h2 className="mt-3 text-2xl font-extrabold tracking-[-0.02em] text-foreground md:text-4xl">
        {title}
      </h2>
      {subtitle && (
        <p className="mt-4 text-sm leading-relaxed text-muted-foreground md:text-base">
          {subtitle}
        </p>
      )}
    </div>
  );
}
