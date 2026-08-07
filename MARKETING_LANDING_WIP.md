# Marketing landing page — work in progress

**Branch:** `feat/marketing-landing-ui-refresh` (cut from `origin/main` @ `c80264e`, 2026-08-08)
**Scope:** `src/marketing/` only. Nothing in the app was touched.
**Status:** builds and lints clean, **never viewed in a browser**, nothing merged.

---

## 1. Context — what this codebase is

`eazyserv.com` is a **third build target**, separate from the app:

| Target | Config | Output | Deploys to |
|---|---|---|---|
| App (PWA) | `vite.config.ts` | `dist/` | `app.eazyserv.com` — CF Pages *Git integration* |
| **Marketing** | `vite.marketing.config.ts` | `dist-marketing/` | `eazyserv.com` — GitHub Actions + wrangler |
| Mobile | `vite.mobile.config.ts` | `dist-mobile/` | Capacitor APK |

It is deliberately **not** TanStack Start (the app's SSR/Workers pipeline can't be hosted cheaply on Pages Direct Upload). `src/marketing/main.tsx` is a hand-rolled router: one `pathname` check for `/download`, everything else renders `MarketingHome`.

**Zero backend dependency.** No `apiFetch`, auth, React Query or WebSocket anywhere in `src/marketing/`. Marketing work can never be blocked by a backend ticket.

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

## 2. What was changed

Three files:

| File | Change |
|---|---|
| `src/marketing/MarketingHome.tsx` | Rewritten — 5 sections → 8 |
| `src/marketing/SocialIcons.tsx` | **New** — inline SVG brand marks |
| `index.marketing.html` | `class="scroll-smooth"` on `<html>` for the anchor nav |

Page structure now: sticky blurred header w/ anchor nav → two-column hero w/ phone frame → services → **how it works** → why us → **about** → **FAQ** → closing CTA → 4-column footer w/ social row.

### Constraints held — do not undo these

- **`src/styles.css` was never edited.** It is the *shared app theme*; changing it would restyle the app. Every shade on this page is an opacity ramp on the `primary` token (`bg-primary/10`, `/15`, `/20`). Grep confirms zero hex / `rgb()` / `oklch()` / Tailwind-palette classes in the file — so if the brand colour ever changes, this page follows automatically.
- **No `framer-motion`.** It's in `package.json`, but this bundle is deliberately kept free of the app's heavy deps. All motion is CSS.
- **No "Open the app" CTA.** Commit `247acfa` removed it because beta isn't publicly signup-open. A "modern header CTA" would re-introduce it — don't.
- **FAQ is native `<details>`**, not a Radix accordion — no new dependency, works with JS disabled.
- **`lucide-react@1.27.0` ships no brand icons.** `Instagram`, `Facebook`, `Twitter`, `Linkedin`, `Youtube` are all absent from the package (v1 dropped them over trademarks). They exist as inline SVG in `SocialIcons.tsx`. Importing them from lucide **will break the build**.

---

## 3. Three drop-in slots — each is one constant

All three are deliberately empty. Placeholders occupy the identical box, so filling them in cannot shift layout.

### `HERO_SCREENSHOT` — the highest-value item

```ts
const HERO_SCREENSHOT = "";   // → "/screenshots/hero-booking.png"
```

Save a portrait capture to `public/screenshots/`, set the path. Use a **real booking screen**, not splash or login.

> This is the single change that most improves the page. See §5.

### `SOCIALS[].href`

```ts
{ name: "Instagram", href: "", home: "https://www.instagram.com", Icon: InstagramIcon },
```

Icons are visible and clickable now, falling back to the platform homepage. Paste the real profile URL into `href` and that icon retargets; `rel="me"` is then added automatically (it's an identity claim, wrong to assert about a platform homepage).

**Never guess a handle.** If someone else owns `instagram.com/eazyserv`, the footer sends customers to a stranger's profile.

### `ABOUT_FACTS`

Left out because they can't be guessed: **year founded, registered office address, CIN, GST, founder names / team size.** A wrong CIN on a public site is a compliance problem. The layout has room.

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
| Technical quality | 8 | Lint/type clean, lean bundle, keyboard-focusable, works w/o JS |
| Visual distinctiveness | 4 | Reads as a well-made Tailwind template |
| Imagery | 2 | None at all |
| Conversion strength | 5 | Right CTAs, nothing yet that earns a stranger's trust |

**The gap is imagery, not CSS.** A real screenshot in the hero moves this to roughly 8 on its own.

**Verified:** `tsc` clean · `eslint` clean · `vite build` succeeds (~246 KB raw / ~78 KB gzip).
**Not verified:** the rendered result. The hero gained an `lg` breakpoint that has not been eyeballed at any width — check desktop *and* narrow mobile first thing.

---

## 6. Tomorrow

1. **Look at it in a browser.** Desktop + mobile widths. Nothing below matters if the layout is wrong.
2. **Capture the hero screenshot.** One device session also covers **SVC-107** (store-listing screenshots, To Do, assigned to Tushar) and **SVC-161 AC4** (iOS walkthrough shots, still unmet).
3. **Get the About facts** from the founders — founding year, registered address, CIN/GST.
4. **Walk the copy past Vipul.** None of the FAQ or About text is approved. It's customer-facing.
5. **Get a ticket.** Six of the seven marketing commits on main have no SVC key; this branch has none either. Rename with `git branch -m` once there is one.

### Open questions for Vipul

- Is the beta launch date fixed, and is the marketing site on the critical path?
- SVC-161 is marked **Done** but ACs 4, 6 and 7 are unmet (no `public/download/` screenshots, no SMS-a-link form anywhere, backend endpoint unverified). Reopen, split, or accept as descoped?
- Did the `#50`–`#54` deploy scramble on 2026-08-07 leave anything unresolved that isn't in a commit message?
- Who owns DNS, the Cloudflare Pages projects, and the `eazyserv-downloads` S3 bucket?
- Is marketing copy coming from someone, or is it ours to write?

### Separately — legal content defects found while sourcing copy

Not code, but pre-launch blockers:

1. **`privacy.md` looks adapted from another company's template and the find-and-replace broke.** Line 3 reads *"Eazyserv Technologies India Private Limited (formerly known as Eazyserv Technologies India Private Limited)"* — both halves overwritten. §(vii) collects data on **"Native Smart Lock Users"** (unlock events, alarm triggers, breach alerts) — boilerplate from a smart-lock company, irrelevant here.
2. **Grievance officer section is empty.** `privacy.md:180` says "contact details are provided below" and the file ends. India's IT Rules require a named officer with published details.
3. **Email mismatch.** Site uses `support@eazyserv.com`; every legal doc uses `contact@eazyserv.com`. `refund.md:59` still has placeholder phone `9876543210`.

---

## 7. Working tree notes

- `android/app/src/main/AndroidManifest.xml` shows as modified — that's the local `usesCleartextTraffic` dev edit, unrelated to this work. **Keep it out of any commit.** Its `skip-worktree` flag was cleared on 2026-08-07 to unblock a checkout, so git now reports it where it previously stayed silent.
- `PAYMENT_FLOW.md` and `PAYMENT_FLOW_PROPOSED.md` are untracked and unrelated.
- A marketing dev server may still be running in the background on port 5173.
