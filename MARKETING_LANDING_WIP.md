# Marketing landing page — working notes

**Last updated:** 2026-08-09
**Live branch:** `feat/marketing-content-updates` — 4 commits, pushed, PR not yet opened
**Merged:** PR **#56** (`c242dfc`) — the landing page refresh is on `main`
**Status:** builds and lints clean · **still never reviewed in a browser by a human**

---

## 1. What this codebase is

`eazyserv.com` is a **third build target**, separate from the app:

| Target | Config | Output | Deploys to |
|---|---|---|---|
| App (PWA) | `vite.config.ts` | `dist/` | `app.eazyserv.com` — CF Pages *Git integration* |
| **Marketing** | `vite.marketing.config.ts` | `dist-marketing/` | `eazyserv.com` — GitHub Actions + wrangler |
| Mobile | `vite.mobile.config.ts` | `dist-mobile/` | Capacitor APK |

Deliberately **not** TanStack Start — the app's SSR/Workers pipeline can't be cheaply hosted on Pages Direct Upload. `src/marketing/main.tsx` is a hand-rolled router: one `pathname` check for `/download`, everything else renders `MarketingHome`.

**Zero backend dependency.** No `apiFetch`, auth, React Query or WebSocket anywhere in `src/marketing/`. Marketing work can never be blocked by a backend ticket — and adding *any* form (contact, provider signup, SMS-a-link) forfeits that, along with needing CORS, rate limiting and abuse handling. Treat that as an architectural decision, not a small feature.

### Running it

```powershell
npm install                                    # NOT npm ci — the lockfile has no win32 binaries
npx vite --config vite.marketing.config.ts
```

Open **`http://localhost:5173/index.marketing.html`** — not bare `localhost:5173`.

- `/` and `/download` **404 in dev.** Vite's SPA fallback rewrites to `index.html`, which this repo doesn't have (TanStack Start generates it). Only `vite preview` on a built `dist-marketing/` serves `/download`.
- `npm run build:marketing` **fails on Windows** — the script ends in `&& mv`, npm runs scripts through `cmd.exe`, cmd has no `mv`. (`build:mobile` has the same bug with `cp`.) CI is Ubuntu so it passes there:

  ```powershell
  npx vite build --config vite.marketing.config.ts
  Move-Item dist-marketing\index.marketing.html dist-marketing\index.html -Force
  npx vite preview --config vite.marketing.config.ts
  ```

---

## 2. Where the work lives

**On `main` via PR #56** — the structural refresh: 8 sections, sticky header with anchor nav + scroll-spy + mobile hamburger, scroll-reveal, favicon, font preconnect, `EazyServ`/`Pune` copy.

**On `feat/marketing-content-updates`** — 4 commits, pushed, **PR still needs opening**:

```
e24158a  company-profile content, brand band, footer trim
290ccb3  brand artwork — og:image, banner crops, logo mark
70b8bbf  blue brand palette, scoped to this build only
e459b6c  wire up the real social profile URLs
```

PR URL: `https://github.com/kalpai-assistant/sv-conn-frontend/pull/new/feat/marketing-content-updates`
(`gh` is **not installed** on this machine — PRs must be opened from the browser.)

### Files

| File | Role |
|---|---|
| `src/marketing/MarketingHome.tsx` | The page — all sections, `BrandBand`, `BrandMark`, `SocialRow` |
| `src/marketing/marketing-theme.css` | **Blue palette override**, marketing build only |
| `src/marketing/Reveal.tsx` | IntersectionObserver scroll-reveal |
| `src/marketing/use-nav-state.ts` | `useScrolled` + `useActiveSection` (scroll-spy) |
| `src/marketing/SocialIcons.tsx` | Inline SVG brand marks |
| `src/marketing/DownloadPage.tsx` | `/download`, a deliberate near-duplicate of the app route |
| `index.marketing.html` | Head: title, OG, favicon, theme-color, font preconnect |
| `brand/` | Source artwork + `README.md` with regeneration commands |
| `public/` | `og-banner.jpg`, `brand-banner.jpg`, `brand-banner-sm.jpg`, `logo-mark.png` |

---

## 3. Brand identity — current truth

| | Marketing site | App |
|---|---|---|
| Name | **EazyServ** | Eazyserv |
| City | **Pune** | Bangalore |
| Colour | **Blue** `oklch(0.5 0.2 262)` = `#1957D2` | Purple `#7C3AED` |

**The divergence is deliberate** — scope was held to the landing page twice, on request. It must not reach users. The app rebrand needs its own ticket covering:

- Android `app_name` / `title_activity_main`, `capacitor.config.ts` `appName`, PWA manifest `name`
- `vite.config.ts` `short_name` — still `"SvcConnect"`, a pre-rename leftover shown under an installed PWA icon
- App route titles, `AuthFlow` splash `<h1>`, `AppVersionGate`, `NotificationsRow`, FCM push fallback title
- `src/lib/mock-data.ts` sample addresses (still Indiranagar / Residency Road)
- The purple in `styles.css`, `offline.html`, `cap:assets`, `main.mobile.tsx`, `__root.tsx`
- **The backend service-area question** — providers seeded to Bangalore coordinates won't match Pune bookings, and the frontend can neither read nor set `service_area_center`

**Never change `com.eazyserv.app`** (build.gradle namespace + applicationId, `strings.xml` `package_name`/`custom_url_scheme`, iOS `PRODUCT_BUNDLE_IDENTIFIER`, Capacitor `appId`) — install identity, not branding; it can't change after publishing and is registered with Firebase. Domains, emails and infra names (`eazyserv-downloads`, `eazyserv-marketing`, `eazyserv-release.jks`) are equally off-limits.

**Registered entity is `EazyServ Technologies India Private Limited`**, incorporated **9 July 2026**. `src/legal/*.md` renders it `Eazyserv`; the company profile and the registered form (`EAZYSERV …`, all caps) say otherwise. Indian registrations are recorded in caps, so prose casing is presentation, not a legal fact.

### How the blue is scoped

`src/styles.css` is shared by app + mobile + marketing. `marketing-theme.css` is imported **after** it from `main.tsx` and redefines the brand tokens for this bundle only.

**Import order is load-bearing.** Reverse the two and `styles.css` wins and the page silently stays purple. Verified in the built CSS that the purple declaration comes first and blue second.

Hue-only shift, 290 → 262, holding lightness and chroma. The page was built against `primary` at L=0.5 — white text on primary buttons, primary text on white, `primary/10` tints — so every contrast ratio is mathematically unchanged. **Don't "improve" this by sampling the brighter blue from the banner** (L≈0.62); it weakens primary-on-white text.

---

## 4. Constraints — do not undo

- **`src/styles.css` is never edited from here.** Shared app theme.
- **No `framer-motion`.** It's in `package.json`, but this bundle stays free of the app's heavy deps. All motion is CSS + IntersectionObserver.
- **No "Open the app" CTA.** `247acfa` removed it because beta isn't publicly signup-open.
- **FAQ is native `<details>`**, not a Radix accordion — no dependency, works with JS off.
- **`lucide-react@1.27.0` ships no brand icons.** Instagram/Facebook/X/LinkedIn/YouTube are inline SVG in `SocialIcons.tsx`. Importing them from lucide **breaks the build**.
- **`Reveal` renders a `<div>`**, so it wraps `<ul>`/`<ol>` rather than replacing them — a div between a list and its `<li>` children is invalid HTML and strips list semantics.
- **The hero is not wrapped in `Reveal`.** Its `<h1>` is the LCP element.
- **`BrandBand` is art-directed, not scaled.** Two crops via `<picture>`; a single 2.4:1 image is unreadable on a phone.

---

## 5. Copy rules — read before editing any text

`src/legal/{privacy,terms,refund}.md` are the **authority** for public claims. Two errors have already been caught and fixed here:

- An FAQ draft said *"no separate visit charge"* — `refund.md` §1.2 reserves exactly that.
- "Why us" said *"No call-out fees"* — same contradiction, caught later.

Established, safe to use:

- `terms.md` §(a)/(b): professionals are **independent third parties — explicitly not employees, agents, contractors or partners.** "Our plumbers" / "our staff" contradicts the ToS and invites employer liability. Use "independent professionals".
- `terms.md` §(d): a substitute is offered if the assigned professional cancels.
- `refund.md` §1.2 (visit/inspection charge), §5 (parts and materials chargeable).

**Claims deliberately excluded** from the company profile, because nothing backs them:

- *"Same-Day Service Availability"* — no evidence the dispatch flow can promise it.
- *"Service Warranty (where applicable)"* — `refund.md` §4 offers only a *possible* free revisit, case by case.
- *"trained and certified"* professionals — KYC is shipped; training/certification appear only as a **future** step in the profile's own partner journey.

**No invented social proof.** No booking counts, no star ratings, no testimonials, no stock-photo customers. In home services — where you ask a stranger to send someone into a customer's home — being caught inflating anything is unrecoverable.

---

## 6. Open slots and unresolved questions

### Waiting on data

- **`SOCIALS[].href` → LinkedIn** is still a placeholder. The URL available is a **personal profile** (`/in/…`), not a company page. Wiring it would render "EazyServ on LinkedIn" and assert `rel="me"` — a machine-readable claim that the page *represents the company* — about a named individual.
- **`ABOUT_FACTS`** — registered office address, CIN, GST still absent. Do not guess; a wrong CIN on a public site is a compliance problem.
- **Service catalogue.** The page advertises **18** services; `mock-data.ts` exposes **8** categories. If the real catalogue is smaller, split into "Available now" / "Coming soon" rather than letting customers hunt for something absent.
- **App screenshots.** One device session also covers **SVC-107** (store-listing shots, To Do, assigned to Tushar) and **SVC-161 AC4** (iOS walkthrough, still unmet). The hero screenshot slot was removed on request — re-adding it means rebuilding the hero.
- **An SVG logo.** `brand/logo.jpeg` has no alpha, which is the only reason `BrandMark` is a tile. The same asset would fix `icons/icon-192.png`, `icon-512.png` and `apple-touch-icon.png` — all still pre-rebrand artwork.

### Held pending Vipul

Scoped, ready, not started:

- `robots.txt`, `sitemap.xml`, canonical link — all three confirmed absent
- **JSON-LD `LocalBusiness`** — zero structured data today; highest-value SEO item for a city-specific service
- Code-split `/download` — `main.tsx` imports both pages eagerly, so every homepage visitor downloads `qrcode.react` (130 KB unpacked) for a QR code only desktop `/download` renders
- Skip-to-content link
- `prefers-reduced-motion` guard on the hero badge's `animate-ping` dot (scroll-reveal already respects it; that dot doesn't)

Deferred by choice: texture / gradient-border polish, held until there's a real screenshot — decorating around a hole.

### Questions

- Is the beta launch date fixed, and is marketing on the critical path?
- **SVC-161 is marked Done** but ACs 4, 6, 7 are unmet (no `public/download/` screenshots, no SMS-a-link form, backend endpoint unverified). Reopen, split, or accept as descoped?
- Did the `#50`–`#54` deploy scramble on 2026-08-07 leave anything not in a commit message?
- Who owns DNS, the Cloudflare Pages projects, and the `eazyserv-downloads` S3 bucket?
- Is marketing copy coming from someone, or is it ours?
- Is Pune **replacing** Bangalore or launching alongside it?
- **None of the FAQ / About / Vision copy is approved.** It is customer-facing.

---

## 7. Legal content defects

Not code, but pre-launch blockers:

1. **`privacy.md` is adapted from another company's template and the find-and-replace broke.** Line 3 reads *"Eazyserv Technologies India Private Limited (formerly known as Eazyserv Technologies India Private Limited)"* — both halves overwritten. §(vii) collects data on **"Native Smart Lock Users"** (unlock events, alarm triggers, breach alerts) — boilerplate from a smart-lock company.
2. **Grievance officer section is empty.** `privacy.md:180` says "contact details are provided below" and the file ends. India's IT Rules require a named officer with published details.
3. **Email mismatch.** Site uses `support@eazyserv.com`; every legal doc uses `contact@eazyserv.com`. `refund.md:59` still has placeholder phone `9876543210`.

---

## 8. Next session

1. **Open the PR** for `feat/marketing-content-updates` (link in §2).
2. **Look at the page in a browser.** Desktop *and* narrow mobile. Nothing else matters if the layout is wrong — the mobile menu, scroll-spy timing, header transition, 800-weight headings, brand band breakpoint and blue palette have all only been verified by compiler and build.
3. Confirm the **service catalogue** and split the grid if needed.
4. Get the **About facts** and an **SVG logo**.
5. Walk the **copy** past Vipul.
6. **Get a ticket.** No SVC key exists for any of this; neither branch has one.

## 9. Working tree notes

- `android/app/src/main/AndroidManifest.xml` shows as modified — the local `usesCleartextTraffic` dev edit, unrelated. **Keep it out of every commit.** Its `skip-worktree` flag was cleared on 2026-08-07 to unblock a checkout, so git now reports it where it previously stayed silent.
- `PAYMENT_FLOW.md`, `PAYMENT_FLOW_PROPOSED.md`, `.claude/`, `.mcp.json` and a stray `.tmp` are untracked and unrelated.
- PR #56 was **squash-merged**. Stacking a branch on an unmerged one and then rebasing needs `git rebase --onto origin/main <old-base>`, replaying only your own commits — a plain rebase tries to reapply work already collapsed into the squash and conflicts.
