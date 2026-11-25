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

### 2026-11-23 — Run 03 Phase 2 (home hero + toggle) feature-complete

**Agent:** Run 03 (provider UI/UX).
**Phase 1 status:** ✅ Shipped — PR #310 merged to epic (SHA `45bf91d`).
SVC-490 → Done.
**Phase 2 branch:** `feature/svc-378-provider-ux-phase-2-home` off
epic tip (post-Phase-1).
**Phase 2 commits:**
- `6471227` — `ProviderHomeHero` (greeting + lifetime earned + jobs
  count + streak sentence). Replaces `ProviderHeader` which was
  deleted. Reach test retargeted; 5 new unit tests.
- `<toggle>` — `OnlineToggleCta` (full-width glow button, offline
  pulse, Medium haptic on tap). `hapticImpactMedium` added to
  `src/lib/haptics.ts`. 5 new unit tests.
- `bb43e4c` — eligible+idle idle-state collapses the readiness
  checklist to one `Account health ✓` row with expand chevron.
  Ineligible path keeps the full checklist unchanged.

**Shared-primitive touches:**
- `src/lib/haptics.ts` — additive (`hapticImpactMedium`). Existing
  consumers untouched.
- `src/i18n/{en,hi,mr}/provider.json` — 9 new keys total
  (`hero.*` × 8, `home.accountHealthOk` × 1). Parity-tested.
- `src/components/AccountAvatar.reach.test.ts` — one-line retarget
  from `ProviderHeader?raw` to `ProviderHomeHero?raw`.
- `src/components/provider/ProviderHeader.tsx` — deleted (unused
  after hero replacement).
- `src/styles.css`: **still not touched.** Run 04's Devanagari-import
  gating remains clean-rebase on Phase 2 tip.

**Deferred (called out in PR body):**
- "Customers near you" chip — needs backend scope-check (Tushar's
  SVC-406/407). Hands-off; frontend placeholder would clutter.
- Weekly-target progress ring — needs a target-setting UX and a
  backend field we don't have. Punted to Phase 5 (SVC-494).
- Today's earnings in hero — no same-day backend field; filtering
  bookings client-side would double-count. Also Phase 5.

**Next:** PR against epic → CI → kalpai-review → merge → SVC-491 Done.

### 2026-11-23 — Run 03 Phase 3 (incoming-request escalation) feature-complete

**Agent:** Run 03 (provider UI/UX).
**Phase 2 status:** ✅ Shipped — PR #313 merged to epic (SHA `0a37be8`).
SVC-491 → Done.
**Phase 3 branch:** `feature/svc-378-provider-ux-phase-3-incoming` off
epic tip (post-Phase-2).
**Phase 3 commit:** `a7d49af` — one commit, three deliverables:
- `hapticWarning` added to `src/lib/haptics.ts`; fires once per
  booking id on `IncomingRequestCard` mount.
- Countdown-pill urgency escalation: calm > 30s → amber ≤ 30s →
  destructive + pulse ≤ 10s. Reduced-motion drops pulse, keeps
  palette.
- Null-safe `matchReason` prop on `IncomingRequestCard`. Shows
  "Nearest match" placeholder until SVC-406 ships a real
  `match_reason` field (hands-off until then).
- +7 test cases on `IncomingRequestCard.test.tsx`.

**Shared-primitive touches:**
- `src/lib/haptics.ts` — additive (`hapticWarning`). Existing
  consumers untouched. Haptic palette is now complete:
  `Light` / `Medium` / `Warning` / `Success`.
- `src/i18n/{en,hi,mr}/provider.json` — one new key
  (`incoming.matchReasonPlaceholder`). Parity-tested.
- `src/styles.css`: **still not touched** by Run 03.

**Deferred in Phase 3 (contract §6 — no paid services):**
- Sound asset on arrival (haptic covers through-pocket).
- Mini-map snippet in the address tile (Google Static Maps paid;
  Leaflet retrofit non-trivial). Punted.

**Next:** PR against epic → CI → kalpai-review → merge → SVC-492 Done.
Then: **open the epic PR to `main`** (post-Phase-3 tip). Phases 4
(SVC-493) and 5 (SVC-494) remain filed for future runs.

### 2026-11-22 — Run 03 Phase 4 (in-progress job screen) begins

**Agent:** Run 03 (provider UI/UX) — Phase 4.
**Branch:** `feature/svc-378-provider-ux-phase-4-job-screen` off
epic tip (post-Phase-3, `48f2a05`). PRs into the epic branch.
**Scope (SVC-493):** embedded map strip + approx ETA chip +
null-safe "customer saw ETA" chip during ACCEPTED/EN_ROUTE/IN_PROGRESS;
completion overlay with Celebration + earnings spring-roll + Success
haptic on COMPLETED; rate-the-customer frontend scaffold only
(no submit, backend endpoint doesn't exist).

**Shared-primitive touches this run:**
- `src/i18n/{en,hi,mr}/provider.json` — new `jobDetail.*` keys for
  the strip/chips, completion overlay, and rate scaffold. Parity
  held; committed early so Phase 5 agent's keys-used / parity tests
  catch drift fast. This is the only file overlap with Phase 5
  (SVC-494) agent.
- `src/components/Celebration.tsx` — extended to accept optional
  `title` / `subtitle` props with existing "Booking confirmed!" /
  "Your pro is on the way" defaults. No existing call site changes.
  Shadcn/primitive discipline: not forking, extending with safe
  defaults; no new primitive. @Vipul call-out not required (same
  component, additive API).
- NEW components (provider-only, no shared surface):
  - `src/components/provider/JobMapStrip.tsx` — thin Leaflet map,
    provider + customer pins, floating "Open in Maps" chip.
  - `src/components/provider/EtaChip.tsx` — straight-line distance
    ÷ 30 kmh (contract §6 — no Distance Matrix), "approx" label.
  - `src/components/provider/CustomerSeenChip.tsx` — null-safe;
    hidden when backend read-receipt timestamp is absent (Tushar
    hands-off, surfaced as recommendation only).
  - `src/components/provider/CompletionOverlay.tsx` — reuses
    Celebration with custom title + earnings spring-roll; fires
    hapticSuccess once per booking.
  - `src/components/provider/RateCustomerScaffold.tsx` — stars
    widget + optional note; no submit wiring (backend endpoint
    recommendation only).
- `src/routes/provider/bookings/$bookingId.tsx` — wires the five
  new components into existing status branches. JobAddress
  keeps its Navigate hand-off (per the audit/ticket — map is
  supplemental).

**NOT touching (reaffirmed):**
- `src/styles.css` — OFF-LIMITS this run.
- `src/marketing/*`, `index.marketing.html`, `vite.marketing.config.ts`
- `wrangler.jsonc`, `dist-marketing/`, any `public/` marketing imagery
- Any Tushar epic (SVC-318, SVC-406, SVC-407, SVC-435). Backend
  read-receipt field and rate-the-customer endpoint are both
  recommendations in the PR body only.
- Phase 5's routes (`/provider/profile.tsx`, `/provider/earnings.tsx`).

**Deferred and called out in PR body:**
- Google Distance Matrix driving ETA (paid, contract §6). Straight-line
  ÷ 30 kmh with "approx" label stays in budget.
- Sound asset on completion (haptic covers it, Phase 3 precedent).
- Backend `customer_notified_at` read-receipt field — recommendation.
- Backend `POST /provider/bookings/:id/customer-rating` endpoint —
  recommendation. Frontend scaffold stores nothing; disables Submit
  with a "Coming soon" note.
