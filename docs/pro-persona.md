# The Pro persona

Who a "Pro" is in this app, how the root gate decides which app they see, how
someone joins a team, and the mistakes that are easy to make here.

> Scope note: frontend only. The team model itself — `professionals` rows,
> invites, dispatch to a Pro — is the backend's (SVC-318 epic; SVC-320 for the
> Pro endpoints, `app/services/team_service.py`). This doc covers what the app
> does with it as shipped in SVC-322, SVC-326, SVC-331 and SVC-354.

## Pro is a row, not a role

A Pro is **a user with an active `professionals` row**. It is not a
`User.role`. There is no `"pro"` value in `UserRole`, and there must not be one:

- **A Pro is usually also a customer.** Invitees sign up through the ordinary
  sign-in, which creates a consumer account. That person can still book a
  service. One role cannot say "consumer and Pro".
- **A phone keeps its role for life** (SVC-253 Policy A). `verify-otp` refuses
  a phone under any role other than the one it signed up with
  (`ROLE_MISMATCH`). A "pro" role would need a role change on accept, which
  Policy A forbids.
- **Accept-invite is open to consumers on purpose** (SVC-320):
  `POST /providers/me/accept-invite` takes `require_role("consumer", "provider")`,
  because the app signs every invitee up as a consumer.
- **An SP owner has a Pro row too** (SVC-326): their own _Pro-for-self_
  (`is_self: true`), so jobs can be assigned to the owner the same way they
  are to a team member.

So the only way to ask "is this user a Pro?" is `GET /pros/me`, through
`useProMe` ([src/hooks/usePro.ts:75](../src/hooks/usePro.ts#L75)). It answers
404 for non-Pros, which the hook turns into `null`. And because it also answers
200 for an owner's Pro-for-self, the question the app actually asks is
`isTeamPro(me)` ([src/hooks/usePro.ts:62](../src/hooks/usePro.ts#L62)): a Pro
row that is not `is_self`.

## Who sees which app

| Account                    | `user.role` | `/pros/me`                                     | Lands on                                        | Can also reach                                                                                          |
| -------------------------- | ----------- | ---------------------------------------------- | ----------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| Customer                   | `consumer`  | 404 → `null`                                   | `/` (consumer home)                             | `/invite` to join a team. `/pro/*` sends them home.                                                     |
| Customer who is a team Pro | `consumer`  | 200, `is_self: false`                          | `/pro`, once per sign-in, then wherever they go | The whole consumer app. Profile's "Open Pro app" row and Pro Home's "Book a service" link the two apps. |
| SP owner                   | `provider`  | 200, `is_self: true` (never asked by the gate) | `/provider`                                     | Nothing outside `/provider/*`, except `/invite`, which shows the "business account" screen.             |
| Admin                      | `admin`     | not asked                                      | `/admin/kyc`                                    | `/admin/*` only.                                                                                        |

Notes:

- The root gate only calls `useProMe` for non-provider, non-admin users
  ([src/routes/__root.tsx:146-151](../src/routes/__root.tsx#L146-L151)). An
  owner's Pro-for-self never pulls them into the Pro app. Their Pro actions sit
  in the provider app's own job screens.
- There is no role switcher. The two apps simply link to each other (comment
  at [src/lib/pro-gate.ts:17](../src/lib/pro-gate.ts#L17)).

## Routing, as shipped

All in `AppGate` ([src/routes/__root.tsx](../src/routes/__root.tsx)), in this
order:

1. **Role first.** A `provider` outside `/provider/*` is sent to `/provider`.
   The one exception is `/invite`, via `providerSeesInviteRoute`
   ([src/lib/pro-gate.ts:88](../src/lib/pro-gate.ts#L88)). That exception also
   skips onboarding and the provider location gate, since neither has anything
   to do with that screen. An admin goes to `/admin/*` (`adminGate`). Everyone
   else is in the consumer branch.
2. **Consumer branch.** `/provider/*` is sent home, and a missing name is sent
   to `/profile`. Then `proGateVerdict({ pathname, proState, landed })`
   ([src/lib/pro-gate.ts:38](../src/lib/pro-gate.ts#L38)) decides:
   - `/pro/*`: `wait` while `/pros/me` loads, `to-home` for a non-Pro, `pass`
     for a Pro and **also on `error`**.
   - `/` before this sign-in has landed: `wait` while loading, `to-pro` for a
     Pro.
   - Anything else: `pass`. A Pro anywhere in the consumer app stays there.
3. **`landed`.** A ref keyed by user id (`landedFor`,
   [src/routes/__root.tsx:178](../src/routes/__root.tsx#L178)). It is used up
   by `consumesLanding` ([src/lib/pro-gate.ts:108](../src/lib/pro-gate.ts#L108))
   only when the render actually reached the gate (`reachesProGate`). The
   restoring splash and the name-setup redirect both happen on `/` and must not
   consume it. Both of those bugs were found on device. An `error` answer
   doesn't consume it either, so a Pro who launched offline is landed once a
   refetch says who they are.
4. **Location gate.** `skipsLocationGate`
   ([src/lib/pro-gate.ts:70](../src/lib/pro-gate.ts#L70)) keeps "Where are
   you?" off `/pro/*`, off `/invite`, and off `/profile` for a Pro. Invitees
   have no saved address and aren't booking anything.

`proGateVerdict`, `consumesLanding`, `skipsLocationGate` and
`providerSeesInviteRoute` are pure and pinned in
[src/lib/pro-gate.test.ts](../src/lib/pro-gate.test.ts). Change a rule there,
not inline in `__root.tsx`.

## Joining a team

The SP's invite SMS carries a static link (`https://app.eazyserv.com/invite`,
an Android App Link since SVC-343) and a separate 6-digit code. The code is
never in the URL: the SMS template provider rejected that.

- **`/invite`** ([src/routes/invite.tsx](../src/routes/invite.tsx)) is a
  code-entry screen. It branches in this order:
  1. role `provider` → **the business-account screen** (SVC-354). No form: an
     owner's Pro-for-self makes every accept an `ALREADY_PRO_ELSEWHERE`, and a
     phone keeps its role. It says to use a different number to work for
     another SP and links to `/provider`.
  2. `isTeamPro(me)` → "You're already on a team", with a link to `/pro`.
  3. Otherwise the form. Success toasts `joinedTeamMessage(me)`
     ([src/lib/invite.ts:66](../src/lib/invite.ts#L66)): "You're now part of
     {business name}", or "You've joined the team." when there is no name.
     The name comes from the **refetched `/pros/me`** in the query cache, not
     from the accept response, which is the bare Pro row. A 409
     `ALREADY_ON_TEAM` counts as joined. Every other refusal is
     `inviteErrorMessage`, and the screen stays put.
- **Signed out on `/invite`**, the gate renders `<AuthFlow invite />`
  ([src/components/AuthFlow.tsx:67](../src/components/AuthFlow.tsx#L67)). It
  is locked to a consumer signup and hides "Are you a service provider?". A
  provider number gets `ROLE_MISMATCH`. Since SVC-354 it is then offered
  "Sign in to your business account" _on the same number_, with the field
  read-only, so a new provider account can't be created there. Once signed
  in, the owner is on `/invite` and sees the business-account screen.
- **Clipboard.** Android's Messages offers "Copy code". The screen pre-fills a
  6-digit clipboard only where the browser already allows the read, and never
  submits it. The native WebView refuses every read, so it shows no Paste
  button. See [src/lib/invite-clipboard.ts](../src/lib/invite-clipboard.ts).
- **No SMS link to hand** (SVC-331). AuthFlow's "Joining a team? I have an
  invite code" link goes to `/invite`. It shows only in consumer mode.
- **Surviving signup.** A new invitee is sent to `/profile` for their name;
  the backend takes the Pro's display name from `users.name` at accept time.
  A session flag (`syncPendingInvite`,
  [src/lib/invite.ts:133](../src/lib/invite.ts#L133)) brings them back to
  `/invite` after saving. It is set on `/invite`. It is dropped signed-out
  anywhere else (#201: backing out must not leave it), on join, for a team
  Pro, and always for a provider. The provider rule is in `syncPendingInvite`
  itself, not on the owner screen. Signing in on `/invite` runs the root
  gate's sync _after_ that screen's effects (a parent's effects follow its
  children's), so a clear on the screen was undone at once. This was found on
  device; jsdom renders the page without the gate and never sees it.

## Pitfalls

- **`role === "provider"` is not "a Pro".** A team Pro's role is `consumer`.
  An owner is `provider` _and_ has a Pro row. Ask `useProMe` + `isTeamPro`,
  never the role.
- **`/pros/me` answers for owners too.** A 200 is not "show the Pro app". Use
  `isTeamPro`, which excludes the Pro-for-self, and remember the gate never
  asks for providers at all.
- **AuthFlow's role choice is a signup commitment, not a mode switch.** It
  decides the role a phone holds forever. Don't reuse it as "open the worker
  view".
- **Never add `initialRole="provider"` (or any provider path) to `/invite`.**
  A provider account is born with a Pro-for-self and can never join a team.
  One tap would strand the invitee for life. SVC-354's owner sign-in is safe
  only because it follows a `ROLE_MISMATCH` and keeps the number read-only.
- **`/pro` vs `/pros`.** The frontend routes are singular (`/pro`, `/pro/jobs`,
  `/pro/kyc`). The backend endpoints are plural (`/pros/me`,
  `/pros/me/jobs`). That's intentional; don't "fix" either side.
- **An error never redirects.** `/pros/me` failing (5xx, offline) says nothing
  about whether they're a Pro. The gate passes them through and the screens
  show their own errors. Don't map `error` to `not-pro`.
- **`useProMe` is keyed by user id.** Nothing clears the query cache on
  logout, so a second account on the same phone must not read the first one's
  answer. Keep the id in the key.
- **Nothing on `/invite` for `INVITER_PAYOUT_KYC_INCOMPLETE`.** The backend
  raises it when an SP _sends_ an invite, not on accept.

## File map

| What                                                                          | Where                                                                                                                                                                                                        |
| ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Pro data layer: `useProMe`, `isTeamPro`, jobs, online, KYC, `useAcceptInvite` | [src/hooks/usePro.ts](../src/hooks/usePro.ts)                                                                                                                                                                |
| Gate rules (pure)                                                             | [src/lib/pro-gate.ts](../src/lib/pro-gate.ts)                                                                                                                                                                |
| Where the rules are applied                                                   | `AppGate` in [src/routes/__root.tsx](../src/routes/__root.tsx)                                                                                                                                               |
| `isProRoute` / `isProviderRoute`                                              | [src/lib/nav-visibility.ts](../src/lib/nav-visibility.ts)                                                                                                                                                    |
| Pro app screens                                                               | [src/routes/pro/index.tsx](../src/routes/pro/index.tsx), [src/routes/pro/jobs/](../src/routes/pro/jobs/), [src/routes/pro/kyc.tsx](../src/routes/pro/kyc.tsx), [src/components/pro/](../src/components/pro/) |
| Location heartbeat (app-wide, online team Pros)                               | [src/hooks/useProHeartbeat.ts](../src/hooks/useProHeartbeat.ts)                                                                                                                                              |
| Joining: screen, copy, pending flag, clipboard                                | [src/routes/invite.tsx](../src/routes/invite.tsx), [src/lib/invite.ts](../src/lib/invite.ts), [src/lib/invite-clipboard.ts](../src/lib/invite-clipboard.ts)                                                  |
| Invite-mode sign-in                                                           | [src/components/AuthFlow.tsx](../src/components/AuthFlow.tsx) (`invite` prop)                                                                                                                                |
| Consumer side's link to the Pro app                                           | "Open Pro app" row in [src/routes/profile.tsx](../src/routes/profile.tsx)                                                                                                                                    |
| SP side: team, invites, self-pro toggle, assigning                            | [src/hooks/useTeam.ts](../src/hooks/useTeam.ts), [src/routes/provider/team/](../src/routes/provider/team/), [src/components/provider/TeamPicker.tsx](../src/components/provider/TeamPicker.tsx)              |
