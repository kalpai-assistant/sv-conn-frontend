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
  AirVent,
  ArrowRight,
  BadgeCheck,
  Bike,
  Bug,
  Building,
  Building2,
  CalendarCheck,
  Car,
  Cctv,
  ChevronDown,
  CreditCard,
  Droplets,
  Flower2,
  Hammer,
  Headphones,
  KeyRound,
  type LucideIcon,
  MapPin,
  Menu,
  Navigation,
  Paintbrush,
  RefreshCw,
  Scissors,
  ShieldCheck,
  Smartphone,
  Sofa,
  SprayCan,
  Umbrella,
  Users,
  Wallet,
  WashingMachine,
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

// The list now follows the service banners the client commissioned, which
// is stronger evidence of what the business sells than the earlier list
// assembled from the company-profile PDF.
//
// Two consequences of that:
//   - EV repair and car wash are IN. They were previously cut on the
//     argument that vehicle work isn't a home service; the client has since
//     commissioned artwork for both, so the through-line is "at your
//     doorstep", not "inside the house".
//   - Smart Home Installation, Interior Maintenance, Home Sanitization,
//     Office Cleaning and Facility Management are OUT. No artwork, and
//     nothing anywhere evidences that they can be delivered. One line each
//     to restore if that changes.
//
// `photo` is a card crop from the client's photography (see
// brand/README.md). Fourteen of the sixteen have one. EV Bike & Car Repair
// and Car Wash still use crops from the older banner artwork, because the
// clean-photo batch has no shot for either — ask the client.
//
// ServicesGrid keeps the icon fallback for any entry without a `photo`, so
// a new service can be added before its artwork arrives without the grid
// looking broken.
//
// ⚠️ BREADTH vs BOOKABILITY still unresolved: src/lib/mock-data.ts exposes
// eight categories, and this grid advertises sixteen. If the real backend
// catalogue is smaller, split into "Available now" and "Coming soon"
// rather than letting customers hunt for something that isn't there. The
// line under the grid hedges on availability, which covers a grid but
// would not cover a page dedicated to one service.
type Service = { name: string; Icon: LucideIcon; photo?: string };

const SERVICES: Service[] = [
  // ORDER IS THE SHOP WINDOW. ServicesGrid shows the first 6 below `lg`
  // and the first 8 from `lg` up; the rest sit behind "View all". So the
  // top of this list is what most visitors will ever see — reorder
  // deliberately, not alphabetically.
  //
  // Women's Salon & Spa sits at position 4 on purpose: without it the
  // opening six are all cleaning-and-repairs, and a visitor on a phone
  // would never see that EazyServ does beauty at all.
  { name: "Home Deep Cleaning", Icon: SprayCan, photo: "/services/home-deep-cleaning.jpg" },
  { name: "AC Service & Repair", Icon: AirVent, photo: "/services/ac-service.jpg" },
  { name: "Appliance Repair", Icon: WashingMachine, photo: "/services/appliance-repair.jpg" },
  { name: "Women's Salon & Spa", Icon: Flower2, photo: "/services/women-salon-spa.jpg" },
  { name: "Plumbing", Icon: Wrench, photo: "/services/plumbing.jpg" },
  { name: "Electrical Services", Icon: Zap, photo: "/services/electrical.jpg" },
  { name: "Carpentry", Icon: Hammer, photo: "/services/carpentry.jpg" },
  { name: "Painting", Icon: Paintbrush, photo: "/services/painting.jpg" },
  // ---- below the fold until "View all" is pressed ----
  { name: "Men's Grooming", Icon: Scissors, photo: "/services/mens-grooming.jpg" },
  { name: "Waterproofing", Icon: Umbrella, photo: "/services/waterproofing.jpg" },
  { name: "Pest Control", Icon: Bug, photo: "/services/pest-control.jpg" },
  {
    name: "Furniture & Sofa Cleaning",
    Icon: Sofa,
    photo: "/services/furniture-sofa-cleaning.jpg",
  },
  { name: "RO & Water Purifier", Icon: Droplets, photo: "/services/ro-water-purifier.jpg" },
  { name: "CCTV & Festival Lights", Icon: Cctv, photo: "/services/cctv-festival-lights.jpg" },
  { name: "EV Bike & Car Repair", Icon: Bike, photo: "/services/ev-repair.jpg" },
  { name: "Car Wash & Interior Cleaning", Icon: Car, photo: "/services/car-wash.jpg" },
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

// Drawn from "Why Choose EazyServ" in the company profile, minus two
// claims that nothing in the product or src/legal/*.md backs up:
//
//   - "Same-Day Service Availability" — no evidence the dispatch flow can
//     promise this, and a beta with a thin provider pool will miss it.
//   - "Service Warranty (where applicable)" — refund.md §4 offers only a
//     possible free revisit, decided case by case. "Warranty" is a
//     stronger word than the policy supports.
//
// Put either back only once someone can point at the thing that makes it
// true. Everything below maps to shipped behaviour.
const TRUST = [
  {
    Icon: ShieldCheck,
    title: "Verified professionals",
    desc: "Every professional clears KYC before taking a single job.",
  },
  {
    Icon: Wallet,
    // Careful: refund.md §1.2 reserves a visit/inspection charge and §5
    // charges for parts. An earlier draft here said "no call-out fees",
    // which the policy contradicts. Keep this to what you see up front.
    title: "Transparent pricing",
    desc: "You see the price before you confirm. No bidding, no haggling.",
  },
  {
    Icon: BadgeCheck,
    title: "Doorstep OTP",
    desc: "Service begins only after you share your code — proof the right person arrived.",
  },
  {
    Icon: CreditCard,
    title: "Secure digital payments",
    desc: "Card, UPI or netbanking through Razorpay. Cash on completion if you prefer.",
  },
  {
    Icon: Navigation,
    title: "Real-time updates",
    desc: "Track your professional on the way and follow the job as it progresses.",
  },
  {
    Icon: Headphones,
    title: "Customer support",
    desc: "A real person to talk to when something needs sorting out.",
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
    // Casing follows the company profile deck, which writes "EazyServ
    // Technologies India Private Limited" and gives the registered form as
    // EAZYSERV TECHNOLOGIES INDIA PRIVATE LIMITED. Indian registrations are
    // recorded in caps, so prose casing is presentation, not a legal fact —
    // src/legal/*.md happens to render it "Eazyserv", which is the same
    // name. Matching the company's own document.
    title: "EazyServ Technologies India Private Limited",
    desc: "Incorporated 9 July 2026 under the Companies Act, 2013.",
  },
  {
    Icon: MapPin,
    title: "Headquartered in Pune",
    desc: "Live in select localities today, opening up more across Maharashtra as we grow.",
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

// Vision and mission, quoted from the company profile. These are stated
// goals, not claims about what already exists, which is why they are safe
// to publish while the product is still in beta — a visitor reads "aiming
// to" rather than "we have".
const VISION =
  "To become India's most trusted on-demand home services platform, by delivering exceptional customer experiences through technology and operational excellence.";

const MISSION = [
  { Icon: Wallet, text: "Deliver reliable home services at transparent prices." },
  { Icon: Users, text: "Empower local professionals with technology and business opportunities." },
  { Icon: ShieldCheck, text: "Ensure quality, safety and customer satisfaction." },
  { Icon: Building, text: "Build a platform that scales to cities across India." },
];

// Deliberately rendered as a plain inline row rather than six cards. Value
// words are near-universal ("Trust", "Quality") and carry little weight on
// a consumer page — giving them card-sized real estate would crowd out the
// things a customer actually decides on.
const CORE_VALUES = [
  "Trust",
  "Transparency",
  "Quality",
  "Innovation",
  "Customer First",
  "Professional Excellence",
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
        <BrandBand />
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
          <BrandMark />
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
  // Every card is rendered on first paint; `showAll` only relaxes a CSS cap.
  // That matters more than it looks: these sixteen names are the richest
  // text content on the page, and mounting only the visible ones would hide
  // eight service names from Google to save nothing.
  const [showAll, setShowAll] = useState(false);

  return (
    <section id="services" className="scroll-mt-20 border-t border-border/60 py-20 md:py-24">
      <div className="mx-auto max-w-6xl px-6">
        <Reveal>
          <SectionHeading
            eyebrow="What we do"
            title="Everything your home needs, in one app"
            subtitle="Every job is handled by a professional who has cleared verification — not an anonymous marketplace listing."
          />
        </Reveal>

        {/* The name sits ON the photo rather than in a strip beneath it.
            Sixteen cards with a separate label row read as database rows and
            added ~40px of height each; over four mobile rows that alone was
            160px. It is still real HTML text over the image — only the
            source banners had text baked into pixels, and none of that is
            used here.

            3:2 rather than 4:3: the source photographs are mostly 16:9, so a
            wider crop throws less away, and shorter cards keep the collapsed
            grid to three rows on a phone. */}
        <Reveal delay={100} className="mt-12 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {SERVICES.map(({ name, Icon, photo }, i) => (
            <article
              key={name}
              // The cap follows the COLUMN COUNT so every breakpoint ends on
              // a full row: 2 cols x 3 = 6, 3 cols x 2 = 6, 4 cols x 2 = 8.
              // Tying it to `sm` instead left 3+3+2 on a tablet-width phone,
              // and phones with a >=640px viewport got 8 rather than 6.
              //
              // Past the cap is display:none, so those cards leave the grid
              // flow rather than being clipped — no half row under the button.
              className={`group overflow-hidden rounded-2xl border border-border bg-card shadow-sm transition-all duration-200 hover:-translate-y-1 hover:border-primary/30 hover:shadow-lg ${
                showAll || i < 6 ? "" : i < 8 ? "hidden lg:block" : "hidden"
              }`}
            >
              <div className="relative aspect-[3/2] overflow-hidden bg-muted">
                {photo ? (
                  <img
                    src={photo}
                    // Decorative: the service name is real text laid over the
                    // same card, so describing the photo as well would make a
                    // screen reader announce each service twice.
                    alt=""
                    width={800}
                    height={600}
                    loading="lazy"
                    decoding="async"
                    className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                  />
                ) : (
                  // Kept for any service added before its artwork arrives.
                  // All sixteen have a photo today.
                  <div className="flex h-full w-full items-center justify-center bg-primary/5">
                    <Icon className="h-7 w-7 text-primary" />
                  </div>
                )}

                {/* Scrim, not a flat overlay: these photographs vary from a
                    bright kitchen to a dusk exterior, and only a gradient
                    keeps white text legible across all of them. */}
                <div
                  aria-hidden
                  className="absolute inset-x-0 bottom-0 h-2/3 bg-gradient-to-t from-black/80 via-black/40 to-transparent"
                />

                <h3 className="absolute inset-x-0 bottom-0 p-3 text-sm font-semibold leading-snug text-white drop-shadow-sm">
                  {name}
                </h3>
              </div>
            </article>
          ))}
        </Reveal>

        <Reveal delay={150} className="mt-8 flex justify-center">
          <button
            type="button"
            onClick={() => setShowAll((open) => !open)}
            aria-expanded={showAll}
            className="inline-flex items-center gap-2 rounded-xl border border-border bg-card px-6 py-3 text-sm font-semibold text-foreground shadow-sm transition-colors hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            {/* The count is deliberate — "View all" alone gives no sense of
                how much is hidden. It reads from the array so it cannot
                drift out of step with the list. */}
            {showAll ? "Show fewer" : `View all ${SERVICES.length} services`}
            <ChevronDown
              className={`h-4 w-4 transition-transform duration-200 ${showAll ? "rotate-180" : ""}`}
            />
          </button>
        </Reveal>

        <Reveal delay={200}>
          <p className="mt-6 text-center text-xs text-muted-foreground">
            Availability varies by locality while we're in beta — open the app to see what can be
            booked at your address today.
          </p>
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
// Brand band
// ---------------------------------------------------------------------------

/**
 * Full-bleed brand banner, sitting between two contained sections as a
 * visual break.
 *
 * Art-directed rather than responsive-scaled. The source banner is 2.4:1;
 * squeezed onto a phone at that ratio its baked-in text becomes unreadable,
 * so <picture> serves a narrower crop below 768px that drops the photo
 * collage and keeps the wordmark, tagline, service icons and trust bar. Two
 * files, not one image scaled — a single asset cannot do both jobs.
 *
 * Deliberately not a background-image with live text on top: the artwork
 * already carries its own headline, and stacking ours over it would put two
 * competing messages in one viewport.
 *
 * Not wrapped in a link either. It is a decorative reinforcement, and a
 * large image link whose label is baked-in pixels is poor for screen
 * readers and for anyone navigating by link text.
 */
function BrandBand() {
  return (
    <section aria-label="EazyServ brand banner" className="border-t border-border/60">
      <picture>
        {/* width/height belong on the <source> as well as the <img>. The two
            crops have different aspect ratios (2.40:1 vs 1.46:1), so without
            them the browser reserves the <img>'s ratio at every width and the
            sections below jump when the desktop file loads. */}
        <source media="(min-width: 768px)" srcSet="/brand-banner.jpg" width={1600} height={666} />
        <img
          src="/brand-banner-sm.jpg"
          // The alt stays short on purpose. Everything written into the
          // artwork — the service names, the trust claims — already exists as
          // real text elsewhere on this page, so transcribing it here would
          // just make a screen reader repeat the whole page.
          alt="EazyServ — quick, reliable, hassle-free home services."
          // Must match brand-banner-sm.jpg, not the desktop file.
          width={900}
          height={580}
          // Below the fold, so lazy. Explicit dimensions reserve the space
          // and stop the sections beneath it jumping when it arrives.
          loading="lazy"
          decoding="async"
          className="h-auto w-full"
        />
      </picture>
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

            {/* Merged from the company profile's "About Us" and the wording
                that was already here. Two edits to the profile text were
                deliberate:

                - It says professionals are "verified, trained and reliable".
                  KYC verification is shipped; training and certification
                  appear only as a future step in the profile's partner
                  journey. Claiming "trained" today would outrun the product.
                - terms.md §(b) states Service Professionals are independent
                  third parties and NOT employees, agents or contractors.
                  "Our plumbers" or "our staff" would contradict our own
                  terms, so this stays "independent professionals". */}
            <p className="mt-6 text-sm leading-relaxed text-muted-foreground md:text-base">
              EazyServ is a technology-driven home services marketplace headquartered in Pune,
              Maharashtra. We connect you with independent professionals — cleaners, plumbers,
              electricians, carpenters and beauticians — who work for themselves and have cleared
              our verification before taking a single booking.
            </p>
            <p className="mt-4 text-sm leading-relaxed text-muted-foreground md:text-base">
              Our goal is to simplify everyday living with fast, affordable, high-quality services —
              while creating sustainable earning opportunities for skilled professionals in the
              city.
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

        <Reveal delay={80} className="mt-14 grid grid-cols-1 gap-6 md:mt-16 md:grid-cols-2">
          {/* Vision sits in a tinted panel and mission in a plain one, so the
              two read as a pair without either needing a new colour. */}
          <div className="rounded-2xl border border-primary/20 bg-primary/5 p-7">
            <p className="text-xs font-semibold uppercase tracking-wider text-primary">
              Our vision
            </p>
            <p className="mt-3 text-base leading-relaxed text-foreground md:text-lg">{VISION}</p>
          </div>

          <div className="rounded-2xl border border-border bg-card p-7 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-wider text-primary">
              Our mission
            </p>
            <ul className="mt-4 space-y-3">
              {MISSION.map(({ Icon, text }) => (
                <li key={text} className="flex items-start gap-3">
                  <span className="mt-0.5 shrink-0 rounded-lg bg-primary/10 p-1.5 text-primary">
                    <Icon className="h-3.5 w-3.5" />
                  </span>
                  <span className="text-sm leading-relaxed text-muted-foreground">{text}</span>
                </li>
              ))}
            </ul>
          </div>
        </Reveal>

        <Reveal delay={120} className="mt-10">
          <p className="text-center text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            What we hold ourselves to
          </p>
          <ul className="mt-4 flex flex-wrap items-center justify-center gap-2">
            {CORE_VALUES.map((value) => (
              <li
                key={value}
                className="rounded-full border border-border bg-card px-4 py-1.5 text-sm text-muted-foreground"
              >
                {value}
              </li>
            ))}
          </ul>
        </Reveal>
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
    // `footer-navy` is defined in marketing-theme.css and carries the whole
    // dark treatment: the navy background plus re-pointed --foreground,
    // --muted-foreground, --primary, --ring, --card and --border for
    // everything inside. No colour is named here on purpose — the utilities
    // below are unchanged and simply resolve against the new tokens.
    <footer className="footer-navy">
      <div className="mx-auto max-w-6xl px-6 py-14">
        <div className="grid grid-cols-2 gap-8 md:grid-cols-4">
          <div className="col-span-2 md:col-span-1">
            <div className="flex items-center gap-2">
              <BrandMark />
              <span className="text-lg font-extrabold tracking-tight text-foreground">
                EazyServ
              </span>
            </div>
            <p className="mt-3 max-w-xs text-sm leading-relaxed text-muted-foreground">
              On-demand home services in Pune, from professionals who have cleared verification.
            </p>
            <SocialRow />
          </div>

          {/* Capped at six, not the full eighteen. There are no per-service
              pages, so every entry resolves to the same #services anchor —
              listing all of them made this column three times the height of
              its neighbours while giving a screen reader eighteen links to
              one destination. Six names signal the range; "All services"
              carries anyone who wants the rest.

              Sliced rather than hand-listed so reordering SERVICES reorders
              the footer with it, and nothing can drift out of sync. */}
          <FooterColumn
            title="Services"
            links={[
              ...SERVICES.slice(0, 6).map((s) => [s.name, "#services"] as const),
              ["All services", "#services"] as const,
            ]}
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
        {links.map(([label, href]) => {
          // A capped list ends in a "see the rest" link. Giving it the
          // primary colour separates it from its siblings so it reads as an
          // action rather than just another service name. Columns that
          // aren't capped never pass this label, so they are unaffected.
          const isSeeAll = label === "All services";
          return (
            <li key={label}>
              <a
                href={href}
                className={
                  isSeeAll
                    ? "text-sm font-semibold text-primary transition-colors hover:brightness-110"
                    : "text-sm text-muted-foreground transition-colors hover:text-foreground"
                }
              >
                {label}
              </a>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Shared
// ---------------------------------------------------------------------------

/**
 * The gear mark, cropped from the supplied logo lockup and used in the
 * header and footer next to the wordmark.
 *
 * It renders as a rounded tile rather than a free-floating glyph because
 * the source (brand/logo.jpeg) is a JPEG with no alpha channel — the navy
 * backdrop is baked into the pixels. A tile makes that deliberate instead
 * of accidental. If the designer supplies an SVG or a PNG with
 * transparency, swap the file and drop the rounded/tile classes.
 * brand/README.md has the crop command that produced logo-mark.png.
 *
 * alt="" is intentional. Everywhere this appears it sits directly beside
 * the word "EazyServ" as live text, so labelling the image too would make a
 * screen reader announce the brand twice.
 */
function BrandMark() {
  return <img src="/logo-mark.png" alt="" width={32} height={32} className="h-8 w-8 rounded-lg" />;
}

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
