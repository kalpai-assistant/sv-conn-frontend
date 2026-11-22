# svc-378-marketing design

**Status:** draft
**Author:** Run 04 (marketing agent) · **Date:** 2026-11-22
**Trigger ticket / thread:** [SVC-378 (feel upgrade epic)](https://kalpai.atlassian.net/browse/SVC-378) · run doc `kalpai-run-04-marketing-ui.md` · audit `MARKETING_UIUX_AUDIT.md`

A visual redesign is not usually an architecture decision — but this one
touches shared primitives (`src/styles.css`, `index.marketing.html`, the
`public/` asset store, deps via Cloudflare Web Analytics), runs concurrent
with Run 03 on the same repo, and imports a content pipeline (illustrated
assets, a blog). Applying the discipline matters.

## 1. Context diagram

```
                                           ┌───────────────────────────┐
                                           │  Cloudflare Web Analytics │
                                           │  (free, cookieless beacon)│
                                           └───────────▲───────────────┘
                                                       │ HTTPS POST /beacon
                                                       │ (fire-and-forget)
          ┌────────────────────────────────────────────┴────────────────────────────┐
          │                           Cloudflare Pages                              │
          │  eazyserv.com (apex + www) — static, no Worker runtime                  │
          │                                                                         │
          │  Built from:  dist-marketing/                                           │
          │    index.html  (shell + inline SEO + inline CF Analytics tag)           │
          │    assets/*.js   (React SPA, lazy /download chunk)                      │
          │    assets/*.css  (Tailwind + marketing-theme — NO Devanagari)           │
          │    assets/inter-*.woff2 (self-hosted Inter — NO Google Fonts)           │
          │    marketing/hero.svg + supporting illustrations (inlined where small)  │
          │    _redirects (empty — hard-404 unmatched)                              │
          │    sitemap.xml + robots.txt (generated)                                 │
          │    404.html                                                             │
          └─────────────────────────────────┬───────────────────────────────────────┘
                                            │ CDN serves static files
                                            │ (no auth, no API)
                                            │
                                            ▼
                             ┌───────────────────────────┐
                             │  Visitor's browser        │
                             │  (anonymous, no cookies)  │
                             └─────────────┬─────────────┘
                                           │
                                           │ CTA tap: Download
                                           ▼
                             ┌───────────────────────────┐
                             │  https://eazyserv.com/    │  ← same origin, SPA route
                             │  download  (DownloadPage) │    (code-split chunk)
                             └─────────────┬─────────────┘
                                           │
                                           │ Android: APK direct link
                                           │ iOS:     Safari A2HS flow (no fetch)
                                           │ Desktop: QR → phone
                                           ▼
                             ┌───────────────────────────┐
                             │  s3://eazyserv-downloads/ │
                             │  apk/latest.apk           │  (via APK_URL env)
                             └───────────────────────────┘

Out-of-scope but adjacent (do not touch in this run):
  app.eazyserv.com   — TanStack Start SSR build (Run 03's territory)
  api.eazyserv.com   — App Runner backend
  admin.eazyserv.com — separate pre-built admin app
```

Protocols in use: HTTPS GET for all static asset fetches, HTTPS POST for
the CF Analytics beacon (fire-and-forget, non-blocking, no response
required). No WebSockets, no polling, no auth on this surface.

## 2. Data flow

Happy-path visit to `/`:

1. Visitor types `eazyserv.com` or follows a link. DNS → Cloudflare edge.
2. Edge serves `index.html` (7 KB gzipped) with:
   - Inline `<style>` for FOUC-prevention and above-the-fold brand identity.
   - Inline SEO meta + canonical + Open Graph.
   - Inline Cloudflare Web Analytics beacon (`<script defer src="..."></script>`,
     ~5 KB additional).
   - `<link rel="preload" as="font">` for Inter 500/700 WOFF2 (self-hosted).
   - `<link rel="preload" as="image">` for the hero illustration SVG.
   - `<script type="module" src="/assets/index.marketing-*.js">` — main entry.
3. Browser parses HTML. Fonts + hero SVG preload in parallel with the main
   JS chunk. No render-blocking Google Fonts request.
4. React mounts. `main.tsx` inspects `window.location.pathname`:
   - `/` or `/index.html` → `MarketingHome` (synchronous import, included in main chunk).
   - `/download` or `/download/` → `React.lazy(() => import("./DownloadPage"))`
     (code-split chunk, ~15 KB gzip, fetched only on this route).
   - Anything else → `NotFoundPage` (shell only, `noindex` meta).
5. `MarketingHome` renders hero + illustrated anchor. Services carousel
   initialises with an `IntersectionObserver` gate — the rAF drift loop
   does NOT run while the section is below the fold.
6. CF Analytics beacon fires on page-view (debounced, after `DOMContentLoaded`).
   Payload: anonymous (`{ referrer, ua, pathname, viewport }`). No cookie set.
7. Visitor taps "Download for Android" CTA → full navigation to `/download`.
   SPA router mounts `DownloadPage` from its own chunk. Platform detection
   flips `<AndroidSection>` / `<IosSection>` / `<DesktopSection>`.
8. Android visitor taps download → `href={APK_URL}` triggers browser-level
   download. No backend call from marketing.
9. Everything else is a mailto or an outbound link to `app.eazyserv.com/privacy`.

Payloads are static HTML/JS/CSS/SVG/WOFF2. No JSON APIs from this surface.
No retry/timeout policy needed — the browser handles static-asset re-fetch.

## 3. Failure modes

| What breaks | Detection | Recovery | User-visible symptom |
|---|---|---|---|
| **Hero illustration SVG fails to load** (Cloudflare cache miss during deploy; corrupt file) | Browser `<img onerror>` handler on the hero `<img>`; CF Analytics "asset-404" custom event. | Fallback: hero renders text-only with an `aria-label` describing the missing illustration. Site stays usable; CTAs still click through. | A rectangle of background color where the illustration should be. Headline + CTAs still visible. Not catastrophic. |
| **Inter WOFF2 fails to load** (same deploy-moment cache race; Cloudflare outage) | CSS `font-display: swap` is already honored by every browser; after 3 s the system font is used. | Fallback stack `Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif` renders immediately via swap. | Headlines appear in the system sans-serif for a few seconds, then swap to Inter once loaded. No layout shift because CSS `size-adjust` descriptor in the `@font-face` block matches Inter's metrics to the fallback. |
| **Main JS chunk fails to parse** (minifier bug; stuck CF cache on a bad hash — the 2026-08-17 incident) | No automatic signal from the browser; the `_redirects` catch-all was removed in the 2026-08-18 fix (`routingFiles` in `vite.marketing.config.ts`). Unknown path → hard 404 via `404.html`. Bad hash → the chunk itself 404s, and our `<noscript>` fallback paints the SEO shell. | Cache-bust: bump the `-c2-` token in `output.entryFileNames`/`chunkFileNames`/`assetFileNames` (see `vite.marketing.config.ts` comment at L255). Redeploy. | White screen with SEO-populated `<noscript>` block visible to crawlers; most users see the same background-color shell that FOUC-prevents, then blank. **This is the worst failure mode and the one we have burned-in muscle memory for.** Mitigation: landing page shell has an inline-CSS "Loading EazyServ..." text so a stuck chunk is at least not a white page — see §7 first-commit scope. |
| **Cloudflare Web Analytics beacon blocked** (ad blockers, EU "Do Not Track" setups) | No beacon received on our end; expected for ~25-30% of visitors. | None needed — beacon is fire-and-forget; its absence does not affect the page. We lose analytics signal for that visitor only. | None. The visitor experiences the full site; we just don't count their visit. |
| **Services carousel autoplay runs on low-end Android, janks** | We can't detect this at runtime from telemetry alone; smoke-test matters. | `IntersectionObserver` gate added in Phase 2 (don't tick when off-screen). `prefers-reduced-motion` already respected. Phase 2 adds a `navigator.deviceMemory < 4` guard that disables drift and falls back to snap-scroll. | On a ~2 GB RAM Android with Chrome, the carousel drift stutters. Phase 2 mitigates. |
| **Screen reader announces 32 service names** (16 real + 16 aria-hidden duplicates) | Manual VoiceOver / TalkBack smoke test. Current code has aria-hidden on the clone copies — reads correctly today. | If regression: `aria-hidden={i >= REAL_COUNT \|\| undefined}` is the invariant; a test (`marketing/services-carousel.test.ts`) asserts exactly 16 announcements in DOM order. | Screen-reader user hears every service twice. Regression surface, not present today. |
| **OS dark mode flips while Run 03's `.dark` toggle is also active** (after Run 03's Phase 0 lands) | Visual check. One known stray in marketing: `DownloadPage.tsx:354` carries `dark:bg-amber-950/40 dark:text-amber-100`. Will activate on OS-dark visits once `.dark` is being set. | Design intentional for the OKLCH token swap; the `:root` dark block from SVC-383 covers `--background`, `--foreground`, `--card`, `--border`, `--primary`. One-line spot-fix if the amber warning jars. | OS-dark visitor sees the amber Safari warning in dark-mode treatment; everything else inherits the token swap. Acceptable until Phase 2/3 does a designed dark pass. |
| **200% browser zoom overflows hero at narrow viewports** | Manual check at `cmd +` × 3 on Safari + Chrome. | Hero already uses `max-w-3xl` + flex-wrap on the CTA pair. Phase 1 shipping check: measure hero at 200% zoom on 375 × 667 (iPhone SE class); if the illustration pushes CTAs below the fold, use `aspect-ratio` on the illustration slot so it scales proportionally. | At 200% zoom on small viewports, illustration dominates and CTAs push below first-fold. Mitigated by aspect-ratio constraint. |
| **Low-bandwidth 3G mobile LCP > 2.5 s** (Pune visitors on Jio patchy areas) | Lighthouse mobile preset catches this (budget: < 2.5 s). Post-deploy, CF Analytics gives P75 LCP from real users. | Hero illustration must be an SVG ≤ 15 KB raw. If photography ever enters (it won't per constraints §6), it gets a Cloudflare Images transform. Inter self-hosted + preloaded saves ~400 ms of handshake vs Google Fonts. | 3G visitor sees FOUC-protection shell for ≤ 1 s longer than baseline, which is still visibly branded. No functional break. |
| **Shared-primitive drift** (Run 03 edits `src/styles.css` between my audit and Phase 1) | `COORDINATION-SVC-378.md` log + branch base at Phase 1 PR open time. | Rebase on their branch tip; if a token I depend on moved, update design doc and re-open PR. | None (caught before PR merge). |

## 4. Blast radius

Marketing-site visitors — anonymous web traffic to `eazyserv.com`, no
authenticated users, no data under management. Blast radius is
**reputational and conversion-funnel**: a visibly broken marketing site
loses investor trust and provider/customer signups during Pune beta.

Technically contained to the Cloudflare Pages deployment. A bad marketing
deploy does not touch `app.eazyserv.com` (separate wrangler project), the
API (App Runner), the mobile apps (APK on S3 separately released), or any
provider / consumer workflow. Rollback is one `wrangler` rollback or a
revert commit + redeploy.

Cross-team impact: **Run 03** shares shared primitives with me
(`src/styles.css`, `src/components/ui/`, `package.json`). A design
decision here that forces a divergent fork would hurt their design-system
work. The design keeps shared-primitive edits additive — Phase 1 touches
`src/styles.css` only to **remove** a global Devanagari import, which is
strictly less than what's there today, not a token redesign.

## 5. Migration / rollback path

Each step is a separate PR that ships, deploys, and can be reverted
independently. "Shippable this week" means Step 1 lands before EOW.

1. **Step 1 — Phase 0 PR (audit + design + coord file).** Branch
   `feature/svc-378-marketing-audit`. Zero code change. Lands on `main`.
   Rollback: `git revert <merge-sha>` — undoes markdown only.
2. **Step 2 — Phase 1 PR (hero + perf wins).** Branch
   `feature/svc-378-marketing-phase-1`. Touches
   `src/marketing/MarketingHome.tsx` (Hero component only),
   `index.marketing.html` (preloads + CF Analytics tag),
   `src/styles.css` (gate Devanagari import),
   `src/marketing/main.tsx` (lazy /download), and
   `public/marketing/hero-illustration.svg` (new asset). Rollback: revert
   the PR. Site reverts to the current typography-only hero and the
   Devanagari fonts come back. No one-way doors.
3. **Step 3 — Phase 2 PR (ServicesGrid + HowItWorks + TrustBar).** Rollback:
   same shape as Step 2.
4. **Step 4 — Phase 3 PR (About + FAQ + CTA + Footer + marketing dark
   confirmation).** Rollback: same shape. If Run 03's `.dark` toggle has
   not landed by this point, marketing-dark scope slides to Phase 5.
5. **Step 5 — Phase 4 PR (/download redesign).** Blocked on real PIN-code
   data from Vipul. Rollback: same shape.
6. **Step 6 — Phase 5 PR (blog scaffold + first post).** Adds `/blog` and
   `/blog/<slug>` routes to `vite.marketing.config.ts` ROUTES array
   (triggers sitemap update) and an MDX pipeline. Rollback: revert; blog
   URLs 404 until re-shipped.
7. **[ONE-WAY] Setting Cloudflare Web Analytics up for eazyserv.com in
   the CF dashboard.** The site-tag UUID is permanent per domain. Guard:
   put the tag UUID in a build-time env var (`VITE_CF_ANALYTICS_TOKEN`)
   so rotating it is a config change, not a code change. Rolling back the
   PR *removes the beacon* but leaves the dashboard entry — benign.
8. **[ONE-WAY] Cache-bust token in `vite.marketing.config.ts`.** The
   `-c2-` string in asset filenames is a lever that only goes forward
   (rolling it back would re-expose any browser that cached the broken
   `-c1-` bundle during the 2026-08-18 incident). Guard: only bump when
   there's an actual stuck-bundle incident. Phase 1 does NOT bump it.

Run 03 rebase order: If Run 03 lands shared-primitive changes to
`src/styles.css` or `src/components/ui/*` before my Phase 1 PR opens, I
rebase on their tip and re-run perf baseline. If they land after my Phase
1 opens but before merge, same thing. The rebase cost is small (Phase 1
touches <10 lines in shared files).

## 6. What I chose NOT to do and why

- **Rejected: brutalist / maximalist / editorial-magazine visual direction.**
  Why not: EazyServ is a trust surface in a low-trust category (home
  services). Brutalist reads as "amateur" to a customer evaluating whether
  to let a stranger into their home. Investors reading a brutalist
  marketing page as "we're design-forward" is a very minority read.
  Flip trigger: Vipul explicitly chooses a counter-cultural brand voice
  (e.g. "we're the anti-Urban-Company"), or user research from the beta
  cohort shows the current calm treatment reads as "corporate / soulless"
  to Pune Gen-Z.

- **Rejected: dark-first default theme.** Why not: dark-first marketing
  works for developer-tool companies (Linear, Vercel) where the audience
  is familiar with dark IDEs. Pune home-services customers are
  overwhelmingly light-mode default; dark-first would feel wrong on the
  WhatsApp-shared screenshot that drives half the funnel. Run 03's
  `.dark` activation gives us OS-dark support for free; that is the right
  depth of investment. Flip trigger: 20%+ of our analytics shows
  `prefers-color-scheme: dark` AND engagement drops on light-default
  hits — both would reverse the call.

- **Rejected: adopting framer-motion for marketing.** Why not: the app
  bundle already pays for it; marketing deliberately doesn't (see
  `MarketingHome.tsx:19-22` source comment). Linear-tier motion is
  achievable with plain CSS transitions + the existing `Reveal` + rAF for
  the one carousel. Adding framer-motion would add ~40 KB gzip to a
  bundle already fighting for its < 100 KB budget. Flip trigger: Phase
  2+ designs need layout-animations (shared-element transitions) or
  gesture-driven motion we can't accomplish in plain CSS. Then
  framer-motion lands as a code-split chunk, not in the main bundle.

- **Rejected: adopting a headless CMS for the blog (Sanity, Contentful,
  Notion-as-CMS).** Why not: all three charge monthly or have tight free
  tiers that exclude commercial use — contract §6 blocks paid vendors
  without explicit approval. MDX-in-repo is free, source-of-truth-visible,
  Git-reviewable, and reversible (every post is a .mdx file we own).
  Flip trigger: Vipul wants non-engineers (marketing hires, designers)
  to publish posts without a PR workflow. Then Sanity Studio Starter
  (free tier up to 3 users, 10K documents) is the first candidate.

- **Rejected: hero video or Lottie animation as the visual anchor.** Why
  not: video is bandwidth-expensive on Jio patchy coverage (3G failure
  mode §3) and plays with sound-off looking like a broken player; Lottie
  needs a 50-100 KB runtime that our < 100 KB bundle budget can't
  absorb. An SVG illustration is static, scales infinitely, and gzip
  compresses to 3-5 KB. Flip trigger: a signed partnership announcement
  or a crisis-response "we're still here" message that genuinely needs
  motion to communicate. Then video goes on a dedicated announcement
  page, not the home hero.

- **Rejected: stock photography (Unsplash, Pexels Pro, Shutterstock).**
  Why not: constraint confirmed with Vipul — illustrated, not
  photographic. Stock photos also rarely show Pune-specific scenes
  (Pune auto-rickshaws, local building architecture, Marathi signage),
  so any stock image reads as generic urban-India. Flip trigger: a
  commissioned Pune-specific photo shoot gets budget (would need Vipul
  explicit approval under contract §6 and a $$ ballpark).

- **Rejected: SSR / TanStack Start for marketing.** Why not: already
  documented in `vite.marketing.config.ts:1-14` — CF Pages Direct Upload
  can't cheaply host a Worker runtime, and marketing has no data to SSR
  (no auth, no personalization, no dynamic data). Static SPA is the
  right shape. Flip trigger: SEO needs server-rendered content that
  can't live in the HTML shell — e.g. a blog with hundreds of posts
  where we can't inline every post's HTML. Even then, Cloudflare Pages
  Functions solve that without TanStack Start.

- **Considered-and-deferred: translating marketing to `hi` and `mr`.**
  Why defer: confirmed with Vipul this run. The i18n infrastructure
  (`i18next` + three locales) exists for the app; adding marketing
  namespaces (e.g. `marketing.json` per locale) is ~30 strings × 3
  locales × copy-review loop per phase. Pune's primary urban market
  reads English on marketing/web. Re-open when: beta cohort analytics
  show significant bounce from `accept-language: hi` or `mr` visitors.

- **Considered-and-deferred: Storybook for marketing components.** Why
  defer: Run 03 is setting up Storybook for the app's design system.
  Marketing has a small handful of components (Hero, ServicesGrid,
  etc.) and extending a story file into marketing adds surface area for
  divergent forking of shared primitives. Re-open when: marketing has 5+
  genuinely marketing-only variants of shared primitives that benefit
  from isolated visual regression testing.

- **Considered-and-deferred: a status page (`status.eazyserv.com`) link
  in the footer.** Why defer: we don't have a status page today, and a
  dead link in the footer is worse than no link. Re-open when: an
  incident response doc exists and someone owns the uptime signal.

## 7. First commit (shippable this week)

**Branch:** `feature/svc-378-marketing-audit` (already up with Phase 0
baseline; design doc commit on top of it).

**Files touched in THIS commit:**
- `svc-378-marketing-design.md` — new file, this document, ~700 lines.

**What ships:** the design artifact itself — a reviewable plan the Phase
1 PR will be judged against. Zero visible change on `eazyserv.com`.

**What explicitly does NOT ship in this commit:** code. The design is
the contract; Phase 1's PR is the first commit that changes production.

### Phase 1 first-commit sketch (the next PR, this week)

**Branch:** `feature/svc-378-marketing-phase-1` off `main` (rebased on
Run 03's latest once their Phase 0 lands).

**Files touched:**

- `index.marketing.html` — ~30 LOC added:
  - Remove `<link href="https://fonts.googleapis.com/css2?family=Inter...">`.
  - Add `<link rel="preload" as="font" type="font/woff2" href="/assets/inter-500.woff2" crossorigin>` and same for 700.
  - Add `<link rel="preload" as="image" href="/marketing/hero-illustration.svg">`.
  - Add `<script defer data-cf-beacon='{"token":"<UUID>"}' src="https://static.cloudflareinsights.com/beacon.min.js"></script>`.
  - Add inline `<style>` block (~1 KB) for the FOUC-prevention shell: brand background + "Loading EazyServ..." text. React mount wipes it on first commit.
- `src/styles.css` — 2 LOC change:
  - Remove the global `@import "./i18n/devanagari.css";` at line 3.
  - Add a new `src/i18n/latin-only.css` (no-op; placeholder for the app build to pull Devanagari conditionally via its own entry).
  - App's entry imports a new `src/styles-app.css` which re-adds the Devanagari import. Marketing's `styles.css` import chain no longer includes it. (Must coordinate with Run 03 since `src/styles.css` is shared — PR tagged, rebased on their tip.)
- `src/marketing/main.tsx` — ~5 LOC change:
  - Wrap `DownloadPage` in `React.lazy()` + `Suspense` with the FOUC-shell fallback.
  - `MarketingHome` stays synchronous (it's the landing route; lazy-loading it defeats the purpose).
- `src/marketing/MarketingHome.tsx` — ~60 LOC change in the `Hero()` component:
  - Add `<img src="/marketing/hero-illustration.svg" alt="" width="640" height="420" fetchpriority="high" className="mx-auto max-w-sm md:max-w-lg">` under the headline on mobile and to the right of the text column on desktop (grid layout).
  - Reduce the three reassurance chips below the hero to a single compact row (`<ul>` with 3 × `<li>` carrying a tighter icon-only treatment).
  - Headline type-scale bumped: `text-5xl sm:text-6xl md:text-7xl` to feel Linear-tier.
- `public/marketing/hero-illustration.svg` — new asset, ~4-8 KB. Sourced from unDraw's "Order confirmed" or "Services" or "Doorstep" set, recoloured to `oklch(0.5 0.2 262)`. Final choice in Phase 1 PR description.
- `public/marketing/README.md` — new, 10 lines. Documents source + recolour command + swap procedure.
- `COORDINATION-SVC-378.md` — append Phase 1 open entry with the rebase SHA I'm targeting.
- `vite.marketing.config.ts` — zero changes (the `-c2-` cache-bust token stays).

**Estimated LOC:** ~100 code + 1 asset. Well under the 400-LOC
visual-only cap in the run doc.

**Estimated bundle delta:**
- JS: -15 KB gzip (DownloadPage split out) + -2 KB gzip (reduced hero JSX).
- CSS: -2 KB gzip (removed Devanagari font-face rules from marketing).
- Fonts: **-210 KB raw / -150 KB over the wire** (Devanagari gone from marketing bundle).
- New asset: +4-8 KB SVG hero.
- Net: ~-170 KB over the wire on first visit. LCP target < 2.3 s on 4G.

**What ships at the end of Phase 1:** Illustrated hero on `eazyserv.com`,
CF Web Analytics live (first baseline numbers populate immediately),
mobile Lighthouse perf ≥ 95 (was 93), desktop ≥ 90 (was 70),
LCP < 2.3 s on 4G mobile (was 2.7 s).

**What explicitly does NOT ship in Phase 1:**
- ServicesGrid refresh (Phase 2).
- Any About / FAQ / CTA copy changes (Phase 3).
- `/download` redesign (Phase 4).
- Blog (Phase 5).
- Marketing dark-mode polish (Phase 2 or 3, depending on Run 03 landing).

## 8. Open questions

- **Which illustration source + recolour approach for the hero?** — unDraw
  (startup-flat, lots of options, easy recolour via a single accent-color
  prop), Humaaans (character-mix, warmer, harder to recolour), or Open
  Peeps (hand-drawn, most "Linear-adjacent", needs more manual tinting).
  I'll propose unDraw's "Done" or "Services booking" illustration tinted
  to `oklch(0.5 0.2 262)` in the Phase 1 PR and ship a different one if
  Vipul swaps it. **Resolved by:** Phase 1 PR review.

- **Cloudflare Web Analytics site token** — needs the `eazyserv.com` tag
  set up in CF dashboard (Vipul account). **Resolved by:** Vipul
  provisioning the tag and dropping the UUID into AWS SSM (or GitHub
  secrets) as `VITE_CF_ANALYTICS_TOKEN`. Until then, Phase 1 ships the
  `<script>` tag with a placeholder token; the beacon fails silently.

- **Real serviced PIN codes for `/download` availability check.** Blocks
  Phase 4. **Resolved by:** Vipul / dispatch owner giving me the actual
  covered-locality list.

- **Founder names, Pune neighbourhood, team size for the About section
  warming pass.** Blocks Phase 3. **Resolved by:** Vipul providing.

- **"Available now" vs "Coming soon" service split.** Blocks Phase 2
  ServicesGrid refresh. **Resolved by:** Vipul confirming which of the
  16 services in SERVICES are actually bookable in beta and which should
  move to a "Coming soon" tray.

- **Blog launch post topic + author byline.** Blocks Phase 5.
  **Resolved by:** Vipul picking a topic (Pune launch narrative, "Why
  we started EazyServ", "How we vet our professionals" — all candidates).

None of these block Phase 1.
