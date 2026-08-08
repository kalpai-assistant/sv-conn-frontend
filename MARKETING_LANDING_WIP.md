# Marketing landing page — work in progress

**Branch:** `feat/marketing-landing-ui-refresh` (cut from `origin/main` @ `c80264e`, 2026-08-08)
**Scope:** `src/marketing/` + `index.marketing.html` only. Nothing in the app is touched.
**Status:** builds and lints clean, **never viewed in a browser**, not merged.

---

## 1. Context — what this codebase is

`eazyserv.com` is a **third build target**, separate from the app:

| Target | Config | Output | Deploys to |
|---|---|---|---|
| App (PWA) | `vite.config.ts` | `dist/` | `app.eazyserv.com` — CF Pages *Git integration* |
| **Marketing** | `vite.marketing.config.ts` | `dist-marketing/` | `eazyserv.com` — GitHub Actions + wrangler |
| Mobile | `vite.mobile.config.ts` | `dist-mobile/` | Capacitor APK |

It is deliberately **not** TanStack Start (the app's SSR/Workers pipeline can't be hosted cheaply on Pages Direct Upload). `src/marketing/main.tsx` is a hand-rolled router: one `pathname` check for `/download`, everything else renders `MarketingHome`.

**Zero backend dependency.** No `apiFetch`, auth, React Query or WebSocket anywhere in `src/marketing/`. Marketing work can never be blocked by a backend ticket — and adding *any* form (contact, provider signup, SMS-a-link) would forfeit that property along with needing CORS, rate limiting and abuse handling. Treat that as an architectural decision, not a small feature.

### Running it locally

```powershell
npm install                                    # NOT npm ci — the lockfile has no win32 binaries
npx vite --config vite.marketing.config.ts
```

Open **`http://localhost:5173/index.marketing.html`** — not bare `localhost:5173`.

Known local quirks:

- `/` and `/download` **404 in dev.** Vite's SPA fallback rewrites to `index.html`, which doesn't exist in this repo (TanStack Start generates it). Only `vite preview` on a built `dist-marketing/` serves `/download`.
- `npm run build:marketing` **fails on Windows** — the script ends in `&& mv`, npm runs scripts via `cmd.exe`, cmd has no `mv`. (`build:mobile` has the same bug with `cp`.) CI is Ubuntu so it passes there. Workaround:

  ```powershell
  npx vite build --config vite.marketing.config.ts
  Move-Item dist-marketing\index.marketing.html dist-marketing\index.html -Force
  npx vite preview --config vite.marketing.config.ts
  ```

---

## 2. What this branch changes

| File | Change |
|---|---|
| `src/marketing/MarketingHome.tsx` | Rewritten — 5 sections → 8, mobile nav, scroll-spy header |
| `src/marketing/Reveal.tsx` | **New** — IntersectionObserver scroll-reveal |
| `src/marketing/use-nav-state.ts` | **New** — `useScrolled` + `useActiveSection` hooks |
| `src/marketing/SocialIcons.tsx` | **New** — inline SVG brand marks |
| `src/marketing/DownloadPage.tsx` | Brand + city copy only |
| `index.marketing.html` | `scroll-smooth`, favicon, `og:image`, font preconnect |

Page structure: sticky header (anchor nav + scroll-spy + mobile menu) → centred hero → services → **how it works** → why us → **about** → **FAQ** → closing CTA → 4-column footer with a "Find us on" social row.

### Brand and city

Marketing says **EazyServ** and **Pune**. The app still says **Eazyserv** and **Bangalore**.

That divergence is deliberate — scope was held to the landing page. An app-wide rebrand was written and then reverted on purpose. It needs its own ticket, which must also cover:

- Android `app_name` / `title_activity_main`, `capacitor.config.ts` `appName`, the PWA manifest `name`
- App route titles, `AuthFlow` splash `<h1>`, `AppVersionGate`, `NotificationsRow`, the FCM push fallback title
- `src/lib/mock-data.ts` sample addresses (still Indiranagar / Residency Road)
- **The backend service-area question** — providers seeded to Bangalore coordinates won't match Pune bookings, and the frontend can neither read nor set `service_area_center`
- `vite.config.ts` `short_name` is still `"SvcConnect"`, a pre-rename leftover that shows under an installed PWA icon

**Never change `com.eazyserv.app`** (build.gradle namespace + applicationId, `strings.xml` `package_name`/`custom_url_scheme`, iOS `PRODUCT_BUNDLE_IDENTIFIER`, Capacitor `appId`). That's install identity, not branding — it can't change after publishing and it's registered with Firebase. Domains, emails and infra names (`eazyserv-downloads`, `eazyserv-marketing`, `eazyserv-release.jks`) are equally off-limits.

### Constraints held — do not undo these

- **`src/styles.css` was never edited.** It is the *shared app theme*; changing it would restyle the app. Every shade on this page is an opacity ramp on the `primary` token (`bg-primary/10`, `/15`, `/20`). Grep confirms zero hex / `rgb()` / `oklch()` / Tailwind-palette classes — so a brand-colour change still propagates automatically.
- **No `framer-motion`.** It's in `package.json`, but this bundle is deliberately kept free of the app's heavy deps. All motion is CSS + IntersectionObserver.
- **No "Open the app" CTA.** Commit `247acfa` removed it because beta isn't publicly signup-open. A "modern header CTA" would re-introduce it — don't.
- **FAQ is native `<details>`**, not a Radix accordion — no new dependency, works with JS disabled.
- **`lucide-react@1.27.0` ships no brand icons.** `Instagram`, `Facebook`, `Twitter`, `Linkedin`, `Youtube` are all absent (v1 dropped them over trademarks). They live as inline SVG in `SocialIcons.tsx`. Importing them from lucide **will break the build**.
- **The registered entity stays `Eazyserv Technologies India Private Limited`** — lowercase `s` — even though the brand is written `EazyServ`. That name is a legal fact from `src/legal/*.md`; only the registrar changes it.
- **`Reveal` renders a `<div>`**, so it wraps lists rather than replacing them. A `<div>` between `<ul>`/`<ol>` and its `<li>` children is invalid HTML and strips list semantics.
- **The hero is not wrapped in `Reveal`.** Its `<h1>` is the LCP element; fading it in delays the largest paint for nothing.

---

## 3. Two drop-in slots — each is one constant

Both are deliberately empty and render a safe placeholder, so filling them in cannot shift layout.

### `SOCIALS[].href`

```ts
{ name: "Instagram", href: "", home: "https://www.instagram.com", Icon: InstagramIcon },
```

Icons are visible and clickable now, falling back to the platform homepage. Paste the real profile URL into `href` and that icon retargets; `rel="me"` is then added automatically (it's an identity claim, wrong to assert about a platform homepage).

**Never guess a handle.** If someone else owns `instagram.com/eazyserv`, the footer sends customers to a stranger's profile.

### `ABOUT_FACTS`

Left out because they can't be guessed: **year founded, registered office address, CIN, GST, founder names / team size.** A wrong CIN on a public site is a compliance problem. The layout has room.

> The hero screenshot slot that used to live here was **removed** — the placeholder frame was cut on request because no real screenshots exist yet. When they do, the hero needs rebuilding to hold one. See §5.

---

## 4. Copy rules — read before editing any text

`src/legal/{privacy,terms,refund}.md` are the **authority** for anything claimed publicly. An early FAQ draft here said *"there's no separate visit charge"*; `refund.md` §1.2 reserves exactly that charge. It was corrected, and the constraint is commented in the code.

Established facts, safe to use:

- Entity: **Eazyserv Technologies India Private Limited**
- `terms.md` §(a)/(b): professionals are **independent third parties — explicitly not employees, agents, contractors or partners.** Copy like "our plumbers" / "our staff" contradicts the ToS and invites employer liability. Use "independent professionals on the platform".
- `terms.md` §(d): a substitute is offered if the assigned professional cancels.
- `refund.md` §1.2 (visit/inspection charge) and §5 (parts and materials chargeable).

### No invented social proof

No "10,000+ bookings", no "4.8★", no testimonials, no stock-photo customers. There are no audited numbers, and in home services — where you're asking a stranger to send someone into a customer's home — being caught inflating anything is unrecoverable. Qualitative claims only until real data exists.

---

## 5. Where it stands

Self-rated **6.5/10**.

| Dimension | Score | Note |
|---|---|---|
| Structure & flow | 8 | Right skeleton, nothing missing |
| Copy & honesty | 8 | Every claim traceable to code or legal docs |
| Technical quality | 8 | Lint/type clean, lean bundle, keyboard-accessible, works w/o JS |
| Visual distinctiveness | 4 | Reads as a well-made Tailwind template |
| Imagery | 2 | None at all |
| Conversion strength | 5 | Right CTAs, nothing yet that earns a stranger's trust |

**The gap is imagery, not CSS.** A real app screenshot in the hero is the single change that moves this to roughly 8.

**Verified:** `tsc` clean · `eslint` clean · `vite build` succeeds (~248 KB raw / ~78.5 KB gzip).
**Not verified:** the rendered result. The mobile menu, scroll-spy timing, header scroll transition and 800-weight headings have never been looked at. Check desktop *and* narrow mobile first.

---

## 6. Next

1. **Look at it in a browser.** Nothing below matters if the layout is wrong.
2. **Capture app screenshots.** One device session also covers **SVC-107** (store-listing shots, To Do, assigned to Tushar) and **SVC-161 AC4** (iOS walkthrough shots, still unmet). Then rebuild the hero to hold one.
3. **Get the About facts** from the founders — founding year, registered address, CIN/GST.
4. **Walk the copy past Vipul.** No FAQ or About text is approved, and it's customer-facing.
5. **Get a ticket.** Six of the seven marketing commits on main have no SVC key; this branch has none either. Rename with `git branch -m` once there is one.

### Held pending Vipul's confirmation

A batch of no-backend improvements, scoped and ready but not started:

- `robots.txt`, `sitemap.xml`, canonical link — all three confirmed absent
- **JSON-LD `LocalBusiness` structured data** — zero on the page today; the highest-value SEO item for a city-specific service
- Code-split `/download` — `main.tsx` imports both pages eagerly, so every homepage visitor downloads `qrcode.react` (130 KB unpacked) for a QR code only desktop `/download` renders
- Skip-to-content link
- `prefers-reduced-motion` guard on the hero badge's `animate-ping` dot (the scroll-reveal already respects it; that dot doesn't)

Also deferred by choice: texture/gradient-border polish ("Tier 3"), held until there's a real screenshot — decorating around a hole.

### Open questions for Vipul

- Is the beta launch date fixed, and is the marketing site on the critical path?
- SVC-161 is marked **Done** but ACs 4, 6 and 7 are unmet (no `public/download/` screenshots, no SMS-a-link form anywhere, backend endpoint unverified). Reopen, split, or accept as descoped?
- Did the `#50`–`#54` deploy scramble on 2026-08-07 leave anything unresolved that isn't in a commit message?
- Who owns DNS, the Cloudflare Pages projects, and the `eazyserv-downloads` S3 bucket?
- Is marketing copy coming from someone, or is it ours to write?
- Is Pune **replacing** Bangalore or launching alongside it? That decides the scope of the app-wide rebrand ticket.

### Separately — legal content defects found while sourcing copy

Not code, but pre-launch blockers:

1. **`privacy.md` looks adapted from another company's template and the find-and-replace broke.** Line 3 reads *"Eazyserv Technologies India Private Limited (formerly known as Eazyserv Technologies India Private Limited)"* — both halves overwritten. §(vii) collects data on **"Native Smart Lock Users"** (unlock events, alarm triggers, breach alerts) — boilerplate from a smart-lock company, irrelevant here.
2. **Grievance officer section is empty.** `privacy.md:180` says "contact details are provided below" and the file ends. India's IT Rules require a named officer with published details.
3. **Email mismatch.** Site uses `support@eazyserv.com`; every legal doc uses `contact@eazyserv.com`. `refund.md:59` still has placeholder phone `9876543210`.

---

## 7. Working tree notes

- `android/app/src/main/AndroidManifest.xml` shows as modified — that's the local `usesCleartextTraffic` dev edit, unrelated to this work. **Keep it out of any commit.** Its `skip-worktree` flag was cleared on 2026-08-07 to unblock a checkout, so git now reports it where it previously stayed silent.
- `PAYMENT_FLOW.md` and `PAYMENT_FLOW_PROPOSED.md` are untracked and unrelated.
- `og:image` currently points at the square `icons/icon-512.png` with `twitter:card = summary`, which is the correct pairing for a square image. Replacing it with a purpose-made 1200×630 banner means also switching to `summary_large_image`.
