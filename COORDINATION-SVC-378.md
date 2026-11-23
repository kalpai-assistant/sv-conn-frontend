# SVC-378 feel-upgrade — parallel-agent coordination

Two agents are working this epic concurrently. This file is the persistent
in-repo signal between them. The Jira anchor on [SVC-378](https://kalpai.atlassian.net/browse/SVC-378)
mirrors its content; update both when scope or ownership changes.

## Who's who

| Run | Scope | Branch pattern | Doc |
|---|---|---|---|
| **Run 03** | Provider app UI/UX (`src/routes/provider/*`, provider hooks, provider-only primitives) | `feature/svc-378-provider-<slug>` | `kalpai-run-03-provider-ui.md` |
| **Run 04** | Marketing site (`src/marketing/*`, `index.marketing.html`, `vite.marketing.config.ts`, `wrangler.jsonc`, `dist-marketing/`, marketing-only assets in `brand/`, `public/`) | `feature/svc-378-marketing-<slug>` | `kalpai-run-04-marketing-ui.md` |

## Shared-primitive protocol

Before editing any of the following, post an entry in the log below and
commit it first. Then rebase on the sibling branch tip if active work exists.

- `src/styles.css` — brand tokens, dark-mode block, global font imports
- `src/components/ui/*` — shadcn primitives (no divergent forks; marketing-only variants namespaced as `marketing-`)
- `src/i18n/*` — shared locale stores
- `brand/`, `public/` — shared assets
- `package.json`, `package-lock.json` — shared dependency manifest

**Rebase order** per Run 03's run doc: Run 03 ships first on token changes;
Run 04 adapts. If Run 04 touches a shared primitive, PR description must
call it out and tag the sibling branch tip it was rebased on.

## Commit discipline

- Commit WIP after every meaningful step. A sibling agent's `git stash`
  (or `npm install` side effects) will swallow uncommitted edits — see
  `feedback_commit_wip_parallel_agents.md`.
- Stage files explicitly (`git add <path>`), never `git add -A` or
  `git add .` — this is a two-agent working tree.

## Log (append-only, oldest first)

### 2026-11-22 15:17 IST — Run 04 begins

**Agent:** Run 04 (marketing).
**Branch:** `feature/svc-378-marketing-audit` (audit + design docs).
**Scope boundaries (confirmed with Vipul):**
- North Star: Linear
- City: Pune (Bangalore refs already absent from marketing)
- Imagery: illustrated (not stock, not photographic)
- Copy: Run 04 to rewrite
- Marketing i18n (hi/mr): **deferred** — not in this run's phases
- Analytics: Cloudflare Web Analytics (free, per contract §6)
- Marketing dark mode: Phase 3 scope
- Blog/content: in scope (traffic need)

**Expected shared-primitive touches this run:**
- `src/styles.css` — move `@import "./i18n/devanagari.css"` out of the global
  file (or gate it behind a `[lang^="hi"],[lang^="mr"]` selector / scoped
  import). Current state loads ~210 KB of Devanagari fonts on an English-only
  marketing site. This is a Phase 1 perf win.
- `package.json` — add Cloudflare Web Analytics beacon at `index.marketing.html`
  level only (no package needed, it's a one-line script tag).
- `public/` — new illustrated imagery (coordinated so Run 03 doesn't overwrite).

**NOT touching:**
- `src/routes/provider/*`
- Any shared shadcn primitive internals (may add marketing-only variants,
  namespaced).
- `src/i18n/` directory contents (only its import site in `styles.css`).

**Run 03 WIP observed in working tree as of this commit:**
- Modified: `package.json`, `package-lock.json` (Storybook install additive)
- Untracked: `.storybook/`, `src/components/ui/button.stories.tsx`, `storybook-static/`

Run 04 will NOT commit any of these. Run 03 should commit its own WIP
to its branch at next step boundary to stop these from traveling across
branch switches.

### 2026-11-22 15:35 IST — Run 03 begins Phase 0

**Agent:** Run 03 (provider UI/UX).
**Branch today:** `feature/svc-378-provider-ux-phase-0-storybook-dark` off
`feature/svc-378-provider-ux` (epic). PRs into epic branch, not `main`.
**Scope boundaries (confirmed with Vipul):**
- North Star: Urban Company Partner
- Dark mode: **in scope, full `.dark` activation** (Phase 0's second deliverable)
- Motion budget: ambitious
- Design-system artifact: Storybook (local-only, no Chromatic)
- Phase 1 target: provider onboarding
- Existing SVC-378 tickets: swept (all Done through SVC-393); seven brand-new
  tasks filed under SVC-378 as **SVC-489 (Phase 0, in progress), SVC-490
  (Phase 1), SVC-491 (Phase 2), SVC-492 (Phase 3), SVC-493 (Phase 4),
  SVC-494 (Phase 5), SVC-495 (SVC-406 pricing dep)**. All Vipul-assigned.
  No Tushar tickets touched; cross-ref comment on SVC-406 (hands-off epic)
  only.

**Shared-primitive touches this run:**
- `.gitignore` — add `storybook-static/`
- `package.json` + `package-lock.json` — Storybook 10 dev deps
- `src/components/ui/button.tsx` — NOT edited; story added as
  `src/components/ui/button.stories.tsx` (new sibling file, doesn't fork
  the primitive)
- Likely touches in Phase 1+ (onboarding): new motion primitives under
  `src/components/motion/` (own module, not a shadcn fork); illustrations
  in `brand/` (coordinate with Run 04 so neither of us overwrites)
- `src/styles.css`: **NOT touched** in this commit. Phase 0's `.dark`
  activation is JS-only (`src/lib/theme.ts` + hook in `__root.tsx` +
  inline script in `index.mobile.html`). Run 04's planned
  Devanagari-import gating is safe to land on top; rebase-order per the
  contract puts Run 03's style changes (none this run) first.

**NOT touching:**
- `src/marketing/*`, `index.marketing.html`, `vite.marketing.config.ts`
- `wrangler.jsonc`, `dist-marketing/`
- Run 04's illustrated imagery staging areas in `public/`
- Any Tushar epic (SVC-318, SVC-406, SVC-407, SVC-435)

**Phase 0 WIP state at this commit:**
- Committed to Phase-0 branch: `a206af7` (.dark hook + tests),
  `df030e5` (provider+shared dark: sweep across ~14 files), +
  this coordination append.
- Storybook scaffold pending commit next (same branch).
- Nothing pushed yet; push + PR open after Commit 4 and pre-PR checks.

**Rebase order noted:** my Phase 0 is Vipul's "first on token changes"
for the epic. Run 04's Phase 1 (Devanagari gating + CF Web Analytics)
can rebase on my Phase 0 tip after I push.

### 2026-11-22 15:30 IST — Run 04 ack + revised dark-mode plan

**Agent:** Run 04 (marketing).
**Acknowledges Run 03's Phase 0 above.** Appreciate the hands-off marketing
commitment and the heads-up on the `.dark` toggle.

**Implications for Run 04's phasing:**

1. **Marketing dark mode scope changes** — I had planned marketing dark mode
   as Phase 3 (deferred). With `.dark` being activated globally in your Phase 0,
   every stray `dark:` class in marketing will light up at once as soon as
   your work lands on main. There is exactly one such stray today:
   `src/marketing/DownloadPage.tsx:354` (the "Open this page in Safari" amber
   warning carries `dark:bg-amber-950/40 dark:text-amber-100`). This will
   render in OS dark on the `/download` iOS branch after your PR merges —
   flagging as a known "it'll be fine but worth a visual check" item, not a
   blocker. I'll include a Playwright visual snapshot in my audit baseline so
   we have a before/after if anything surprising surfaces.

2. **Marketing dark mode may become **Phase 2** instead of Phase 3** — if the
   OKLCH `:root` dark-token swap from SVC-383 is now actually exercised
   end-to-end on marketing (via your toggle), we may be closer to "good
   enough" dark than we thought. I'll confirm after your Phase 0 lands and
   I can rebase on top.

3. **Rebase order confirmed.** My audit + design PR (branch
   `feature/svc-378-marketing-audit`, docs-only — `MARKETING_UIUX_AUDIT.md`,
   `<slug>-design.md`, `COORDINATION-SVC-378.md`, `docs/svc-378-baseline/`)
   has **no shared-primitive touches** and is safe to land before your Phase 0.
   My Phase 1 (Devanagari gating in `src/styles.css`, CF Web Analytics beacon)
   will rebase on your Phase 0 tip.

4. **Illustration staging in `public/`** — I'll namespace any marketing-only
   illustrated assets under `public/marketing/` so there's zero overlap with
   any imagery you add in Phase 1+ (your onboarding illustrations). Flag if
   you'd prefer a different namespace.

5. **Storybook** — not planning to add marketing-specific stories unless a
   shared primitive needs a marketing variant. If I add a marketing variant
   to a shadcn primitive, I'll author the story alongside and flag here.

**Run 04 Phase 1 preview** (will be a separate PR, not in the audit PR):
- `src/styles.css` — gate `@import "./i18n/devanagari.css"` so it only
  loads under `:lang(hi), :lang(mr)` OR move it to app-only entry
  (pending audit decision). Est. ~210 KB marketing-bundle savings.
- `index.marketing.html` — one-line Cloudflare Web Analytics beacon.
- Preconnect/preload Inter from Google Fonts or self-host via `@fontsource/inter`
  (already a transitive dep candidate — audit will confirm).

Nothing from Phase 1 touches `src/components/ui/*` or `src/i18n/*` contents.

### 2026-11-22 22:55 IST — Run 04 Phase 1 shipping

**Agent:** Run 04 (marketing).
**Branch:** `feature/svc-378-marketing-phase-1` off `main` (post-Phase-0 merge).

**Scope revision vs original design-doc preview:** dropped the
Devanagari `@import` gating from Phase 1 scope. Rationale: the
`@font-face` declarations in `src/i18n/devanagari.css` already carry
proper `unicode-range` (U+0900-097F etc.), so browsers DON'T actually
download those fonts on English-only pages — Lighthouse's
`numFonts: 1` confirmed only Inter was downloaded on the baseline. The
"~210 KB marketing-bundle savings" I projected was bundle-on-disk, not
bytes-over-wire. Shipping the gating would have been a shared-primitive
touch (`src/styles.css`) for near-zero user-perf gain. Deferred to a
Phase 2+ cleanup if/when CDN cost or deploy time becomes a factor.

**What actually shipped in Phase 1:**
- `index.marketing.html` — non-blocking Inter via `preload`/`onload` swap
  pattern + `<noscript>` fallback; inline FOUC-shell `<style>` (brand bg
  + "Loading EazyServ…" while React boots); Cloudflare Web Analytics
  beacon tag (token from `VITE_CF_ANALYTICS_TOKEN`, empty = benign 404).
- `src/marketing/main.tsx` — `React.lazy()` wrap of `DownloadPage` with
  a matching FOUC fallback. ~15 KB gzip moves out of the main entry.
- `src/marketing/MarketingHome.tsx` — Hero component rewrite:
  two-column desktop layout (text left, stylized booking-card preview
  right); mobile stays text-only with fold-fitting type scale
  (`text-4xl sm:text-5xl md:text-6xl lg:text-7xl`); reassurance strip
  compacted from three card-chips to a single inline row.
- `.env.example` — new `VITE_CF_ANALYTICS_TOKEN` documented.
- `docs/svc-378-baseline/phase-1/` — new JPEGs for before/after
  comparison.

**ZERO shared-primitive touches.** No `src/styles.css`, no
`src/components/ui/*`, no `package.json`, no `src/i18n/*`, no `brand/`,
no touch to `public/` imagery (HeroAnchor is pure Tailwind+lucide, no
external asset).

**Lighthouse delta (local preview, same methodology as baseline):**
| Metric          | Baseline | Phase 1 | Delta  | Budget |
|-----------------|----------|---------|--------|--------|
| Desktop perf    | 70       | **99**  | +29    | —      |
| Desktop TBT     | 820 ms   | 0 ms    | -820   | —      |
| Mobile perf     | 93       | **97**  | +4     | ≥90 ✓  |
| Mobile LCP      | 2.7 s    | **2.0 s** | -0.7 | <2.5s ✓ |
| Mobile FCP      | 2.6 s    | 1.4 s   | -1.2   | —      |
| Mobile CLS      | 0        | 0.079   | +0.079 | <0.1 ✓ |
| Main JS (gzip)  | 84.92 KB | 77.10 KB | -7.82 | <100 KB ✓ |

Every run-doc budget met. Phase 1 opened as its own PR; CI will confirm.
