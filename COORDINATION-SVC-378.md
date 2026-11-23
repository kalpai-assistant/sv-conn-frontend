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

### 2026-11-22 ~22:45 IST — Run 03 Phase 1 (onboarding) feature-complete

**Agent:** Run 03 (provider UI/UX).
**Phase 0 status:** ✅ Shipped — PR #307 merged to epic (SHA `11dc387`).
SVC-489 → Done.
**Phase 1 branch:** `feature/svc-378-provider-ux-phase-1-onboarding` off
epic tip (post-Phase-0).
**Phase 1 commits (feature-complete, pre-PR):**
- `39721f3` — step 0 welcome hero + placeholder earnings helper (new
  `src/lib/onboarding-earnings.ts`, 3 i18n locales).
- `9f7c89b` — KYC-step lock-icon trust block above the camera tiles.
- `8937d78` — rejection-aware header banner (reviewer's reason persists
  through the resubmit).
- `5ec807a` — Celebration overlay on step 5 + spring-tap Dashboard CTA.
- `ce04f74` — spring step transitions + Light haptic on forward
  transitions + Success haptic on step-5 arrival.

**Shared-primitive touches this run:**
- `src/i18n/{en,hi,mr}/provider.json` — 8 new `onboarding.*` keys
  (parity-tested; Run 04 remains hands-off this file).
- `src/lib/onboarding-earnings.ts` — new, self-contained helper. No
  conflict surface for Run 04.
- Reused existing: `@/components/Celebration` (SVC-390), `@/lib/haptics`
  (SVC-398). No shared primitive forks.
- `src/styles.css`: **still not touched.** Run 04's planned
  Devanagari-import gating rebases cleanly on Phase 1 tip.

**NOT touching (reaffirmed):**
- `src/marketing/*`, `index.marketing.html`, `vite.marketing.config.ts`
- `wrangler.jsonc`, `dist-marketing/`, any `public/` marketing imagery
- Any Tushar epic (SVC-318, SVC-406, SVC-407, SVC-435). SVC-406 has an
  informational comment only (earnings-range dep tracked at SVC-495).

**Next:** pre-PR cascade → PR into epic branch → babysit CI →
kalpai-review self-review → merge → SVC-490 Done. Then Phase 2
(SVC-491 — provider home hero + online toggle rework) starts from the
post-Phase-1 epic tip.
