# SVC-477 (G9) — Capacitor device-coverage harness

**Parent:** SVC-467 (Stability wave 1 — frontend).
**Why plan-mode:** tool shape is unknown; "no new paid services" constraint rules out the obvious vendors; direction depends on an evaluation none of the existing CI steps have made.

## Failure modes this harness would catch

Named in `frontend/CLAUDE.md` as recurring on-device bugs that escape all 158 unit tests:

1. **Bottom-nav overlap** — a button painted underneath `BottomNav`. Depends on Android system-bar inset which jsdom has no notion of.
2. **Native dialog freeze** — `alert()` or any `window.confirm()` freezes the WebView entirely. Non-reproducible in Chrome.
3. **Geolocation hang** — `getCurrentPosition` on Android hangs indefinitely where the jsdom mock fails instantly. Testing against the mock encodes the opposite assumption.
4. **framer-motion jank** — layout thrash and animation stutter on low-end devices (sub-₹10k Android handsets, the beta tester cohort).
5. **z-order regression** — a React portal rendered above the WebView's native status bar, or below the system nav bar, on specific Android OEM skins.

The trap `CLAUDE.md` names: "A unit test asserts the mock, and the mock encodes an assumption." Playwright web-only cannot reach any of this. Today these bugs ship to beta testers and come back as runbook flakes.

## Options evaluated (open-source only — shared contract §6)

| Option | Setup | CI feasibility | Device fidelity | Maintenance | Verdict |
|---|---|---|---|---|---|
| **Appium (Android)** | Install Appium server + Android emulator image. Headless Linux emulator is slow but works on free GH Actions runners (requires KVM — only Linux runners). | Can run on `macos-latest` (iOS Sim) or `ubuntu-latest` (Android emulator via `reactivecircus/android-emulator-runner`). Each run ~8-12 min — too slow for pre-push, OK for nightly. | High — real Android system, real WebView, real native APIs. | Medium — fragile selectors, frequent driver updates. | **Candidate for nightly.** Would catch #3 (geolocation), #5 (z-order). Not pre-push. |
| **Maestro** | Single-binary CLI from mobile.dev. YAML-based flows, much simpler than Appium. | Supported in CI via official action. Similar run time to Appium. | Same as Appium — hits real device/emulator. | Low — YAML is readable, selectors are stable. | **Preferred candidate.** Easier onboarding than Appium. |
| **Capacitor WebView via adb + CDP** | `adb forward tcp:9222 localabstract:webview_devtools_remote_<pid>` + Playwright/Puppeteer attach. Repo CLAUDE.md already documents this for manual debugging. | Fiddly in CI — needs emulator boot + app install + socket discovery. Doable but brittle. | Covers WebView-layer bugs (#1, #4) but misses native dialogs and geolocation hangs. | Low tooling, high flake. | **Reject for wave 1** — too much plumbing for partial coverage. |
| **WebdriverIO + @wdio/capacitor** | Node-first, same test authoring style as Playwright. | Requires emulator/device. Similar timing to Appium. | Same. | Medium — Node-flavoured Appium stack. | **Fall-back** if Maestro's test matrix ends up thinner than expected. |

## Rejected paid options (for a future paid-budget wave only)

- **BrowserStack App Automate** — ~$150/mo entry. Hosted real devices. Would eliminate the emulator-boot slowness. Recommend for a wave-2 conversation once beta tester count grows past 100.
- **LambdaTest Real Device** — similar price point, similar fit.
- **Sauce Labs** — more expensive; no cost advantage.

## Recommendation

**Pick Maestro for a nightly-only Android run.** Rationale:
- YAML onboarding is cheaper than any Appium/WDIO curve.
- One single flow (the money path from G1's Playwright spec, retargeted at real Android) catches #1 (bottom-nav), #4 (framer-motion), possibly #2 (if we use an `alert()` in the flow deliberately).
- Nightly cadence fits the run spec's answer #2 ("No nightly staging workflow") — Vipul explicitly ruled out nightly for Playwright/staging but device-fidelity is a different conversation. Needs confirmation.

**Fall-back if Maestro is rejected:** a PR-level manual device-pass checklist gated by CODEOWNERS on these paths:
- `src/components/BottomNav.tsx`
- `src/lib/geolocation.ts`
- Any `import { motion } from "framer-motion"` on a new file
- `android/**`
- `ios/**`

Checklist lives in a PR template section; reviewer refuses to approve until the author confirms a debug-APK install + manual pass.

## Open question for Vipul

1. Nightly Maestro on free GH Actions — OK, or is the "no nightly workflow" answer from run self-check #2 scoped to Playwright/staging specifically (as read) or blanket? Clarify before spawning a Slice A agent.
2. If Maestro is in: do we have an Android emulator config pinned anywhere, or does Slice A pick one?
3. If the fall-back (manual checklist) is preferred for now: who merges it — the author, or Tushar/Vipul on an SP-touching PR?

## Slices (contingent on Vipul's answer)

### Slice A — Maestro install + money-path flow (1d)

Add `e2e-maestro/` with one flow, `money-path.yaml`. CI job on `macos-latest` (M1 free tier) or `ubuntu-latest` with emulator action. Gated to run only on changes to `src/**`, `android/**`, `ios/**`, or the maestro flow itself.

### Slice B — expand coverage to the 3 named device-only bugs (1d)

Separate flows: `bottom-nav-no-overlap.yaml`, `geolocation-not-hung.yaml`, `framer-motion-no-jank.yaml` (last one needs a frame-timing assertion — Maestro has `extendedWaitUntil` + perf hooks).

## Blast radius if shipped

- Nightly run on free GH Actions minutes. No prod impact.
- If Maestro flakes, nightly fails loudly — fix forward or disable the flow.

## PR base

`feature/svc-stability-wave1` (for the plan doc commit, then for Slice A/B if greenlit).
