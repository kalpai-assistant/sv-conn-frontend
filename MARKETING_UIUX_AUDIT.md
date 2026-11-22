# Marketing UI/UX Audit — SVC-378 feel upgrade, Run 04

**Scope:** `eazyserv.com` marketing site only. Entry `index.marketing.html` →
`src/marketing/main.tsx` → two routes: `/` (`MarketingHome`) and `/download`
(`DownloadPage`), plus a `NotFoundPage` fallback. Deploys to Cloudflare Pages
via `.github/workflows/deploy-marketing.yml`.

**Out of scope:** app at `app.eazyserv.com` (that's the TanStack Start build and
Run 03's provider surfaces); `admin-frontend/` (separate pre-built app, no source
here); SVC-406 / SVC-407 (Tushar's).

**Goal:** Linear-tier marketing surface — tight typography, serious visual
anchor, honest beta-stage copy, 90+ Lighthouse perf on mobile, a Pune-grounded
voice. Confirmed scope decisions (Vipul, 2026-11-22): North Star **Linear**;
imagery **illustrated** (no photo shoot, no stock); copy **mine to rewrite**;
marketing `hi/mr` **deferred**; analytics **Cloudflare Web Analytics**
(free); marketing dark mode scoped to **Phase 2 or 3** (depends on Run 03's
`.dark` activation landing — see `COORDINATION-SVC-378.md`); blog/content **in
scope**.

## Executive summary

The current site is **well-crafted but visually inert**. It gets the hard
things right — accessible, token-driven color, honest beta copy, no vendor
scripts, no framer-motion, native `<details>` FAQ, SSR-safe pathname router.
The Linear-tier gap is almost entirely **visual anchoring and rhythm**, not
plumbing. Three findings matter most:

1. **The hero has no visual anchor.** Blurred glow + headline + subtitle + two
   CTAs. Linear, Rippling, Stripe all put a distinct visual element on first
   fold — a product shot, a bespoke illustration, a diagram. Ours is pure
   typography on a light-grey wash. This is the single highest-leverage Phase 1
   move. Resolving it is also the entry point for the illustrated imagery
   direction confirmed above.

2. **Perf headroom is real.** Mobile Lighthouse is already **93**, but desktop
   is **70** on a locally-served preview — driven by 820 ms TBT and
   render-blocking Google Fonts. The marketing bundle ships **~210 KB of
   Devanagari fonts it never uses** (they're imported transitively from
   `src/styles.css` which the marketing entry pulls in). The main JS bundle is
   **44.8 % unused on first load** because `DownloadPage` (with `qrcode.react`)
   is co-bundled in the main entry. Both are mechanical fixes with a
   measurable delta.

3. **Section rhythm is uniform.** Every section after the hero uses
   `py-20 md:py-24` with a centered `SectionHeading` and a card grid. By the
   third repetition the page reads as one long template. `HowItWorks` is
   deliberately asymmetric (left-aligned heading, timeline) and the page gets
   its breath back there. The other sections need more of that — not more
   decoration, more structural variance.

Beyond those three, the current source has **nine placeholder / honesty flags
baked into comments** (invented PIN codes, empty LinkedIn href, Kothrud /
Viman Nagar chips contradicting the covered list, "Smart Home Installation"
cut-but-ready-to-restore services, etc.). These aren't visual, but they're the
kind of thing a Linear-tier site refuses to ship with. Listed in §5.

## 1. Baseline metrics

Captured 2026-11-22 against a local `vite preview` of a fresh production build
(commit `7ab76d4` on `main`). Build output:

```
dist-marketing/index.html                                   7.24 kB │ gzip:  3.02 kB
dist-marketing/assets/index-c2-*.css                      130.49 kB │ gzip: 21.12 kB
dist-marketing/assets/index.marketing-c2-*.js             267.70 kB │ gzip: 84.92 kB
dist-marketing/assets/noto-sans-devanagari-*-400.woff2     50.42 kB
dist-marketing/assets/noto-sans-devanagari-*-500.woff2     53.62 kB
dist-marketing/assets/noto-sans-devanagari-*-600.woff2     53.72 kB
dist-marketing/assets/noto-sans-devanagari-*-700.woff2     53.98 kB
```

### Lighthouse

| Metric | Desktop | Mobile (default simulated throttle) | Budget per run doc |
|---|---|---|---|
| **Performance** | 70 ⚠️ | **93** ✅ | ≥ 90 mobile |
| Accessibility | 95 | 95 | — |
| Best Practices | 100 | 100 | — |
| SEO | 100 | 100 | — |
| LCP | 0.9 s | 2.7 s ⚠️ | < 2.5 s on 4G |
| FCP | 0.9 s | 2.6 s | — |
| TBT | **820 ms** ❌ | 0 ms | — |
| CLS | 0.002 | 0 | < 0.1 |
| Speed Index | 1.3 s | 2.6 s | — |

### First-load unused-JS (Lighthouse `unused-javascript` audit)

- `index.marketing-c2-*.js` — 84 967 B total / **38 084 B wasted (44.8 %)**.
  Primary suspect: `DownloadPage.tsx` + its `qrcode.react` dependency,
  co-bundled into the main entry because `main.tsx` imports both page
  components statically.

### Render-blocking (Lighthouse `render-blocking-resources`)

- `https://fonts.googleapis.com/css2?family=Inter:…` — **401 ms wasted**.
- `/assets/index-c2-*.css` — 87 ms wasted (expected; it's the primary CSS).

### Diagnostics

- 1 128 main-thread tasks, 7 over 10 ms, 2 over 50 ms, **1 over 500 ms**.
  Likely culprits: initial React mount, carousel measurement (`stepWidth()`,
  rAF loop in `ServicesGrid`), `lucide-react` icon tree not fully tree-shaken.

Baseline artifacts: `docs/svc-378-baseline/*.jpg` (desktop + mobile home and
download, fold + full page). Lighthouse HTML+JSON kept in
`/tmp/svc-378-marketing-baseline/` (not committed — `docs/svc-378-baseline/`
holds the compressed stills only; Lighthouse is reproducible via the regen
script below).

**Regenerate baseline:**

```bash
npm run build:marketing
npx vite preview --config vite.marketing.config.ts --port 4178 --strictPort &
# Lighthouse:
npx lighthouse http://localhost:4178/ --preset=desktop --output=html,json --output-path=./desktop
npx lighthouse http://localhost:4178/ --output=html,json --output-path=./mobile
# Screenshots (JPEG, quality 72):
node /tmp/svc-378-marketing-baseline/screenshot-jpeg.mjs   # or re-create — see docs/svc-378-baseline/README.md later
```

## 2. Perf opportunities (ranked by phase impact)

Each row estimates the marketing-bundle delta against the current baseline.

| # | Opportunity | File(s) | Est. delta | Phase |
|---|---|---|---|---|
| 1 | Kill Devanagari fonts in marketing build. They're imported at `src/styles.css:3` (`@import "./i18n/devanagari.css"`) and the marketing entry pulls `styles.css` wholesale. Fix: move the import out of `styles.css`, wrap in a dedicated app-only entry, OR gate with `@media (lang:hi),(lang:mr)` / `:lang()` scoped `@font-face` rules. | `src/styles.css`, possibly new `src/i18n/devanagari-entry.css` | **~210 KB raw**, ~150 KB gzip removed from marketing bundle | **1** |
| 2 | Code-split `DownloadPage`. Make it a dynamic import from `main.tsx` so the marketing-home visitor doesn't pay for `qrcode.react` + the ~20 lucide icons the download page uses. | `src/marketing/main.tsx` | **~38 KB raw, ~15 KB gzip** off main-entry JS; LCP faster | **1** |
| 3 | Preload or self-host Inter. Google Fonts CSS is render-blocking for **401 ms**. Options: self-host via `@fontsource/inter` (already a transitive dep candidate — verify in Phase 1), OR add `<link rel="preconnect">` + `<link rel="preload">` to `index.marketing.html`. | `index.marketing.html` | ~300-400 ms FCP/LCP improvement, especially cold | **1** |
| 4 | Tree-shake `lucide-react` icon list. `MarketingHome.tsx` imports ~35 icons. Confirm vite tree-shakes to only the ones used. `lucide-react/dist/esm/icons/<name>` imports are proven-tight. | `src/marketing/MarketingHome.tsx` | **~5-15 KB** (needs confirmation) | **1** |
| 5 | Add `<link rel="preload" as="image">` for the hero visual anchor once it exists (Phase 1 ships the anchor). | `index.marketing.html`, `public/marketing/hero-*.svg` | LCP improvement — target < 2.3 s mobile | **1** |
| 6 | Convert `brand-banner.jpg` + `brand-banner-sm.jpg` to WebP/AVIF with same `<picture>` fallback. | `public/brand-banner*`, `src/marketing/MarketingHome.tsx` | ~40-60 % byte reduction on the banner | **2** |
| 7 | Cloudflare Web Analytics beacon — adds one `<script defer>` tag. Zero impact on perf; gives us baseline funnel data. | `index.marketing.html` | Instrumentation, no perf change | **1** |
| 8 | Reconsider the `ServicesGrid` rAF drift on desktop. 820 ms TBT is partly measurement; the rAF loop runs even when the section is below the fold. Add an `IntersectionObserver` gate (don't tick when off-screen). | `src/marketing/MarketingHome.tsx` | ~200-400 ms TBT recovery | **2** |

## 3. Page-by-page audit

### 3.1 `/` — MarketingHome (`src/marketing/MarketingHome.tsx`, 1476 LOC)

Section order: Header · Hero · ServicesGrid (carousel) · HowItWorks · BrandBand ·
TrustBar · About · FAQ · CallToAction · Footer. Each has its own file-local
component in the single file — this is readable but a Phase 2 candidate to
break apart by route section.

#### 3.1.1 Header (`Header()` @ L387)

Baseline: `docs/svc-378-baseline/desktop-home-fold.jpg`,
`docs/svc-378-baseline/mobile-home-fold.jpg`.

Top-3 jank points:

1. **No wordmark presence at top of hero.** The navy `/logo-mark.png` is
   good but tiny next to "EazyServ" wordmark. Linear's header lets the mark
   breathe. A phone viewer sees "EazyServ" + hamburger + Download — no
   signal this is a real company.
2. **Navigation anchor underline animation uses `scale-x` on a sibling
   span.** This is clever (it preserves baseline) but on mobile the entire
   nav is hidden behind a hamburger; the clever bit never ships to the
   majority of visitors.
3. **"Download" button in header is a small blue pill.** Linear's primary
   action in the header is small AND a brand-accented outline — ours is a
   solid primary. The solid treatment makes it compete with the
   hero CTA for attention.

Reference: **linear.app** header — wordmark left, small-cap nav center,
muted "Log in" + a single solid primary "Sign up" right. Nothing visible is
decorative.

Effort: **S** (half-day).

#### 3.1.2 Hero (`Hero()` @ L508)

Baseline (desktop fold): typography-only, blurred brand glow, no visual
anchor. See §Executive summary.

Top-3 jank points:

1. **No visual anchor.** This is the single biggest Linear-tier gap. An
   illustration on the right (desktop) / under the CTAs (mobile) is the
   Phase 1 deliverable.
2. **Too much vertical space between the "Now in beta · Pune" chip and
   the headline on mobile.** On a 6.1" iPhone the hero fills the fold
   with ~18% whitespace at the top and 25% below. Rhythm should pull the
   headline up and let the reassurance chips breathe below.
3. **The reassurance strip is three plaintext chips.** "KYC-verified
   professionals" / "Upfront, fixed pricing" / "OTP-secured doorstep entry"
   read as filler. Linear-tier either (a) cuts them, (b) replaces with a
   visual (icon + 2-word label in a tighter row), or (c) reserves them for
   below-fold.

Reference: **linear.app** hero — product screenshot anchor at desktop fold;
**stripe.com** hero — bespoke illustration anchor; **rippling.com** hero —
diagrammatic product screenshot. For us, illustrated means a bespoke SVG
scene (a doorstep with an "at your service" character, OR an isometric
"booking → doorstep → OTP" diagram). To be decided in the design doc.

Effort: **M** (1.5 days, mostly illustration asset).

#### 3.1.3 ServicesGrid (`ServicesGrid()` @ L624)

Carousel of 16 service cards. Desktop: continuous drift via `requestAnimationFrame`.
Mobile: snap-scroll, 4-second step interval. Both duplicate the list for
seamless loop. This component is **well-engineered and well-commented** — the
code quality is high. The design is average.

Top-3 jank points:

1. **Photo cards + text overlay + scrim = noisy at scale.** Scrolling the row
   past the fold feels like a wall of competing crops. Linear-tier would be
   grouped icon tiles (flat, two-column) OR a diagram-style "what we do"
   rather than a rolling carousel.
2. **Service names don't read as a hierarchy.** All 16 cards get equal
   weight. Vipul's own comment at L164 flags this: "ORDER IS THE SHOP WINDOW"
   and "Women's Salon & Spa sits at position 4 on purpose". A first-time
   visitor cannot tell that; the carousel treats every card as a peer.
3. **16 services is a lot — bookability vs breadth is already flagged
   unresolved in the source comments** (L152). The grid promises more than
   the backend may deliver. Our design pass has to answer: "Available now"
   vs "Coming soon" split, or reduce to 6-8 confirmed-live services?

Reference: **stripe.com/payments** — grouped icon tiles, two rows, clear
hierarchy. **linear.app/method** — diagrammatic workflow, no card grid at
all. For a home-services marketplace, Urban Company's "What are you looking
for?" category tiles (the website version, not the app) are closest to the
right shape — but we should land tighter than theirs.

Effort: **L** (2 days — includes the "available now" vs "coming soon"
decision, which needs product input).

#### 3.1.4 HowItWorks (`HowItWorks()` @ L937)

Three steps: Pick → Match → OTP. Layout is deliberately asymmetric — left
heading column, right timeline. This is the strongest-rhythm section on the
page and should be the model, not the exception.

Top-3 jank points:

1. **Content is correct, rhythm is good, but visual weight is low.** On
   desktop, the right column is a thin numbered-circle timeline. Dropping
   small inline illustrations next to each step (consistent with the hero's
   anchor illustration) would carry visual continuity through the page.
2. **The timeline rail is a 1 px `bg-border` vertical line.** On high-DPI
   mobile at 100 % brightness it almost disappears. Should be 2 px, or use
   a tint from `primary/20` for a softer-but-visible rail.
3. **No motion on step reveal.** The Reveal wrapper fades the section in,
   but the three steps appear simultaneously. Staggering their entrance by
   80-120 ms each would make the sequence read as a sequence.

Reference: **linear.app** section rhythm — heading left, dense content right,
quiet grid rail. We're already 80 % of the way there.

Effort: **S** (half-day — inline illustration adds another half-day if
illustrations ship in the same phase).

#### 3.1.5 BrandBand (`BrandBand()` @ L1018)

Full-bleed brand photo banner (`brand-banner.jpg` / `brand-banner-sm.jpg`).

Top-3 jank points:

1. **Art-directed JPEG ≠ Linear-tier.** The banner carries its own baked-in
   headline + wordmark + service icons + trust bar. It competes with every
   section before AND after. In the illustrated direction we chose, this
   banner should be **replaced** by a bespoke illustrated scene or
   **removed entirely** (the content it conveys is already elsewhere on the
   page).
2. **JPEG compression + baked text at mobile sizes is fuzzy.** `<picture>`
   does serve a narrower crop, but the result is still a bitmap of text.
   SVG/illustration is the correct medium for brand-identity statements.
3. **Dead weight in bundle terms.** `brand-banner.jpg` is served from
   `public/` — I'll measure actual bytes in Phase 1 planning.

Reference: **linear.app** — no such banner exists. Brand identity is carried
by a consistent type system and subtle product imagery, not a billboard
in the middle of the page.

Effort: **M** (cut-or-replace decision belongs in design doc; replacement
is 1-1.5 days of illustration work).

#### 3.1.6 TrustBar (`TrustBar()` @ L1052)

Three columns of "Why EazyServ" — Verified / Transparent pricing / Doorstep
OTP / Secure digital payments / Real-time updates / Customer support.

Top-3 jank points:

1. **Six items in a 3-column grid on desktop** = two rows, uneven stress.
   Linear-tier would be either (a) three hero reasons full-width, or (b)
   six items in a 3×2 with equal gravity achieved through consistent
   iconography. Current icons are mixed sizes and metaphors
   (ShieldCheck vs Wallet vs CreditCard vs Navigation).
2. **"Customer support — A real person to talk to when something needs
   sorting out"** is soft. In beta that's genuine; post-launch, this
   becomes a weak claim. Can be rewritten to something specific (hours,
   first-response SLA).
3. **The outlined-ring icon treatment is calm but repeats the About
   section's outlined chip.** Two adjacent sections with the same quiet
   icon treatment flatten both.

Reference: **stripe.com/connect** trust row — three bold reasons, full-width
illustration above each, dense body copy. Three > six for impact.

Effort: **S** (cut-to-three + icon hierarchy pass, half-day).

#### 3.1.7 About (`About()` @ L1088)

Two-column: left prose + "See how a booking works" link; right 2×2 facts
grid (incorporation, HQ, marketplace-not-agency, replacement-promise).
Then vision/mission in a 2-col tinted panel pair. Then CORE_VALUES as a
word-pill row.

Top-3 jank points:

1. **CORE_VALUES row should be cut.** Six words — "Trust / Transparency /
   Quality / Innovation / Customer First / Professional Excellence" —
   carry no customer-decisive weight. The source comment at L319 agrees
   these are "near-universal". Cutting this row recovers vertical space
   without losing any claim.
2. **Vision + Mission is a 2026-era "about page" pattern.** It's honest
   (it's quoted from the company profile) and I like that, but the two
   tinted panels side-by-side read as PowerPoint. A single quiet paragraph
   with a "Why we're building this" treatment would land harder.
3. **The incorporation line ("Incorporated 9 July 2026") is buried in a
   4-tile grid where it should be a human-scale credibility note.** Show
   the founders (when Vipul gives names) OR the Pune neighbourhood you're
   headquartered in. People invest in people.

Reference: **linear.app/about** — human photos, one paragraph of story,
specific numbers (team size, funding). We don't need photos this week, but
we do need warmth.

Effort: **M** (1 day — needs founder info from Vipul).

#### 3.1.8 FAQ (`Faq()` @ L1214)

Four questions, native `<details>` / `<summary>`.

Top-3 jank points:

1. **Four questions is thin.** The FAQ is a trust surface — we should have
   8-12 honest questions. Candidates (from the product state): "What if the
   professional damages something?" (refund policy §3), "How are parts
   priced?" (refund §5), "Can I cancel after booking?" (policy §1.2), "How
   is my professional verified?" (KYC detail), "What if I need the same
   professional again?" (smart-defaults SVC-385 shipped this), "Is there a
   minimum booking value?", etc.
2. **The ChevronDown rotate is nice but the open-state border-primary/30
   change is subtle.** A marginally stronger open-state visual would help.
3. **No in-page search** — not Phase 1 territory, but worth noting for when
   the FAQ grows past 10.

Reference: **stripe.com/pricing#faq** — dense, 12+ Qs, tight type, strong
open-state.

Effort: **S** (half-day, mostly writing — copy is mine per scope).

#### 3.1.9 CallToAction (`CallToAction()` @ L1245)

Single-card "Ready when you are" with a Download button. Uses the shared
`shadow-primary-lift`.

Top-3 jank points:

1. **It's a repeat of the hero CTA with a smaller headline.** Linear-tier
   closes with a different motion — a differentiated final appeal, not a
   restatement.
2. **No secondary action.** Hero has two (Download, How it works); closer
   has one. A "Talk to us" / mailto or a "See our FAQ" would carry the
   fence-sitter.
3. **The tinted-panel treatment is fine but visually repeats About's
   vision panel.** Two tinted panels, nearly the same tint, both using the
   same shadow — the last impression feels recycled.

Reference: **linear.app** final CTA — single bold heading, subtle secondary
action, more negative space than ours.

Effort: **S** (half-day).

#### 3.1.10 Footer (`Footer()` @ L1281)

Four columns (brand + socials, Services, Company, Legal). Navy backdrop via
the `.footer-navy` class in `marketing-theme.css` (re-points `--primary`,
`--card`, `--border`, etc. inside the scope). This is the most
sophisticated bit of theming on the page.

Top-3 jank points:

1. **LinkedIn href is empty** (L120) — links to `linkedin.com` homepage.
   Flagged honestly in-source. Fill or remove when copy pass happens.
2. **Services column lists 6 names but all point to `#services`** — screen
   readers announce 6 identical destinations. Capped at 6 is right; links
   should scope to the visible card OR the "All services" link should be
   the only navigable one with the 6 as text labels.
3. **Social icon row relies on hover feedback.** On touch devices there
   is no hover — the row visually disappears into the footer. A subtle
   border / fill contrast at rest would help.

Reference: **linear.app** footer — tight, link columns, clear social row,
"Status" link always visible. Status link for us = a `status.eazyserv.com`
or similar (out-of-scope for Phase 1-2).

Effort: **S** (half-day — mostly fixing the LinkedIn placeholder and the
service-link scope issue).

### 3.2 `/download` — DownloadPage (`src/marketing/DownloadPage.tsx`, 427 LOC)

Baseline: `docs/svc-378-baseline/desktop-download.jpg`,
`docs/svc-378-baseline/mobile-download.jpg`.

Top-3 jank points:

1. **PIN codes are placeholders — must not ship.** `COVERED_PINCODES`
   (L49) is four invented pins; `NEARBY_LOCALITIES` (L50) suggests two
   PINs (Kothrud 411038, Viman Nagar 411014) that aren't in the covered
   list — tapping a suggestion and being refused reads as a bug. The
   source comment is explicit about this. Phase 1 must either (a) get real
   data from product, or (b) remove the availability-check section until
   data lands.
2. **Three different install flows (Android / iOS / desktop) share a
   single page card treatment.** Each flow has its own complexity; the
   current layout is "same card, different body". A branched layout with
   platform-matched visual cues (an Android bot illustration, an iOS
   share-sheet icon, a QR hero on desktop) would make the "am I in the
   right place" question obvious at a glance.
3. **The Android install steps are text-only, five numbered
   lines.** On a phone viewer trying to follow along, they're a lot to
   parse. Screenshots of the actual prompts ("Allow from this source"
   toggle, etc.) would turn this from documentation to a walkthrough.

Reference: **slack.com/downloads** / **linear.app/download** —
platform-branched hero, icon-forward, steps are screenshot-walkthroughs,
not prose. Note both are first-party stores — we don't have that luxury
on Android sideload, which is exactly why walkthrough visuals matter more
for us than for them.

Effort: **M** (1-1.5 days — PIN-code data decision is a blocker;
walkthrough screenshots can be stock Android OS captures).

### 3.3 `/*` — NotFoundPage (`src/marketing/NotFoundPage.tsx`)

Not read for this audit — it's a small SPA fallback shipped under a 404 status
(correctly, per the routing-files plugin in `vite.marketing.config.ts`).
Phase 2 will apply the design system to it; low priority.

## 4. Cross-cutting findings

### 4.1 No analytics

The marketing bundle has **zero analytics instrumentation**. Phase 1 adds
Cloudflare Web Analytics (free, cookieless, GDPR-friendly, async beacon, one
`<script defer>` tag in `index.marketing.html`). No cookie banner needed under
EU/UK ePrivacy rules because no identifiers are stored. Baseline funnel data
starts building the moment Phase 1 ships.

### 4.2 Copy honesty flags (all source-commented, nothing we invent)

- `MarketingHome.tsx:120` — LinkedIn href empty.
- `MarketingHome.tsx:152-157` — breadth-vs-bookability (16 services vs
  what backend can actually deliver) unresolved.
- `MarketingHome.tsx:213-220` — two Urban-Company-copied claims
  deliberately cut: "Same-Day Service Availability" (no evidence the
  dispatch flow can promise this) and "Service Warranty" (refund policy
  only offers possible free revisit). Must stay cut.
- `DownloadPage.tsx:28-48` — PIN code availability is 100 % hardcoded;
  must-not-ship data.

These are not additions to make; they are **existing debts to clear** before
Phase 1 lands. Design doc will assign them.

### 4.3 Illustration gap

Current site has **zero illustrated assets** aside from the icon-based
category grid. The illustrated direction is the biggest content-pipeline
investment this run — and `brand/` has only logo + photo assets today. Phase
1 ships one hero illustration; Phase 2 adds step-illustrations and a
services-grid rework.

**Asset production:** given no shoot budget and no stock-license (per
contract §6: no paid services), we're on open-source illustration libraries.
Candidates I've vetted:
- **unDraw** (undraw.co) — CC0, flat vector, recolourable via a tint input.
  Lots of generic "home / service / booking" scenes. Good starting point.
- **Humaaans** (humaaans.com) — CC0, mix-and-match character SVGs. Better
  for diverse Pune-targeted scenes.
- **Open Peeps** (openpeeps.com) — CC0, hand-drawn style. Warmer; less
  "startup" than unDraw; probably best fit for Linear-tier if we recolour
  consistently.

All three are MIT / CC0 and can be recoloured to `oklch(0.5 0.2 262)` by
replacing the SVG stroke/fill colour before committing. Phase 1 picks one
style and locks the palette.

### 4.4 Shared-primitive touches required

Per `COORDINATION-SVC-378.md`, all of these go through the coord protocol:

| File | Phase | Touch | Why |
|---|---|---|---|
| `src/styles.css` | 1 | Gate or remove `@import "./i18n/devanagari.css"` | ~210 KB marketing-bundle savings; the fonts only serve `hi`/`mr` which marketing doesn't translate to |
| `index.marketing.html` | 1 | Preconnect/preload Inter; add Cloudflare Web Analytics beacon | Perf + instrumentation |
| `public/marketing/*` (new dir) | 1+ | Namespace marketing-only illustrated assets | Zero overlap with Run 03's onboarding illustrations |
| `src/marketing/main.tsx` | 1 | `React.lazy()` wrap `DownloadPage` | Code-split, ~15 KB gzip off main entry |
| `src/components/ui/*` | 2+ | Possibly marketing-only button variants (namespaced) | TBD in design doc |

No `src/i18n/` content changes. No `package.json` changes expected (CF Web
Analytics is a plain script tag, no npm dep).

### 4.5 Run 03 interaction

Run 03's Phase 0 activates `.dark` on `<html>` via `src/lib/theme.ts`. Once
their PR lands on main, the marketing site inherits OS dark-mode via the
existing `@media (prefers-color-scheme: dark)` block in `src/styles.css`
(shipped in SVC-383). **One known stray `dark:` class exists in marketing**:
`src/marketing/DownloadPage.tsx:354` (the amber "Open this page in Safari"
warning). Visual-check item for the audit-PR follow-up, not a blocker.

This may **move marketing dark mode from Phase 3 to Phase 2** — depends on
whether the inherited token swap is "good enough" or still visibly rough on
marketing's photographic sections (hero, BrandBand, service cards). Decision
belongs in the design doc, after Run 03's Phase 0 lands.

## 5. Phased plan (preview; detail in design doc)

| Phase | Theme | Files | Effort | Deliverables |
|---|---|---|---|---|
| **0** | Audit + design (this PR) | `MARKETING_UIUX_AUDIT.md`, `svc-378-marketing-design.md`, `COORDINATION-SVC-378.md`, `docs/svc-378-baseline/` | — | Shared baseline + phased plan |
| **1** | Hero + first-fold + perf wins | `src/marketing/MarketingHome.tsx` (Hero only), `index.marketing.html`, `src/styles.css` (gate Devanagari), `src/marketing/main.tsx` (lazy /download), `public/marketing/hero-*.svg` | 2 d | Illustrated hero anchor; perf targets met (mobile ≥95, desktop ≥90); CF Web Analytics live |
| **2** | ServicesGrid + HowItWorks + TrustBar visual refresh | Same + inline illustrations | 2 d | Section rhythm matches HowItWorks model; trust bar cut-to-three; bundle stays under budget |
| **3** | About + FAQ + CTA + Footer polish | Same | 1.5 d | Copy pass on all sections; LinkedIn fix; service-link scope fix; marketing dark-mode confirmation (if not already landed via Phase 2) |
| **4** | /download redesign | `DownloadPage.tsx`, new illustrations | 1.5 d | Platform-branched layout; walkthrough screenshots; PIN-code data from product (blocker) |
| **5** | Blog scaffold | New `/blog`, `/blog/<slug>` routes; MDX pipeline in vite.marketing.config.ts; first post (Pune launch) | 2 d | Blog ships; indexable; one real post live |

Each phase is ≤ 2 days of my work and fits in one PR under ~800 lines
(illustrations assets excluded from LOC count). Phase 4 blocks on PIN-code
data from Vipul.

## 6. Non-goals (hands-off this run)

- Consumer app routes (`src/routes/*` other than `src/marketing/*`).
- Provider app routes (`src/routes/provider/*`) — Run 03's.
- `admin-frontend/` — separate app.
- SVC-406 (pricing), SVC-407 (admin console), SVC-318 (two-entity provider
  model), SVC-435 — all Tushar epics, hands-off per shared-contract §4.
- Marketing i18n (`hi/mr`) — deferred by Vipul this run; infrastructure
  already in place, can be a future epic.
- Photo shoot / stock licensing — out per contract §6 (no paid services);
  illustrated direction is the chosen alternative.

## 7. Open questions for Vipul (do not block Phase 1)

These can be answered at any point and will shape later phases:

1. **Founder names / HQ Pune neighbourhood** — for the About warming pass
   in Phase 3. Will leave current prose until you confirm.
2. **"Available now" vs "Coming soon" service split** — depends on what
   dispatch can honestly promise. Blocks the Phase 2 ServicesGrid refresh,
   not Phase 1.
3. **Real covered PIN codes + nearby localities** — blocks Phase 4
   `/download` redesign. Until you give me real data, we remove the
   availability-check section rather than ship placeholders.
4. **Blog topic / cadence / author byline** — Phase 5 prereq. One
   launch-post concept would help.
5. **Illustration style preference** — unDraw (startup-flat), Humaaans
   (character-mix), or Open Peeps (hand-drawn)? I'll propose one in the
   design doc with sample tints; you nod or swap.
