# Play Console — Privacy Policy URL

**App:** EazyServ (`com.eazyserv.app`)
**Prepared for:** Vipul.
**Prepared:** 2026-11-04

## TL;DR

**Play Console requires a public, crawlable Privacy Policy URL.** Today we
don't have one. We have:

1. An in-app `/privacy` route (`frontend/src/routes/privacy.tsx`) that
   renders `src/legal/privacy.md`. Reachable at
   https://app.eazyserv.com/privacy for a human in a browser.
2. **No** page at https://eazyserv.com/privacy (404 as of 2026-11-04).

Before Vipul submits the listing, pick an option below and get a working
URL. Recommended: **Option A**.

---

## 1. Audit — what's there today

| URL | Status (2026-11-04) | Notes |
|---|---|---|
| `https://eazyserv.com/privacy` | **404** | Marketing site has no privacy page. |
| `https://eazyserv.com/privacy.html` | 404 | — |
| `https://app.eazyserv.com/privacy` | Renders in browser, but client-side SPA; raw HTML fetch returns only the app shell (`<div id="root"></div>`). | Google's Play Store crawler expects a static / SSR'd page. A JS-only route is a frequent cause of Play review rejections ("couldn't fetch your privacy policy"). |
| `src/legal/privacy.md` | 180-line markdown, clearly scoped privacy policy | Source of truth for the policy text, already rendered in-app. |

**The policy text exists and is production-quality.** The only gap is a
crawlable public URL.

---

## 2. Recommended fix — Option A: static route on marketing site

**What:** Publish `src/legal/privacy.md` as a static HTML page at
`https://eazyserv.com/privacy` on the marketing site.

**Why:**
- Marketing site is the natural home for public legal docs.
- Static HTML → always crawlable, zero JS dependency.
- Future updates stay in `src/legal/privacy.md` in this repo — add a tiny
  build step (or copy-paste) that publishes it to the marketing site on
  release.

**Effort:** 30 min if the marketing site is a Next.js / static site; longer
if the marketing domain is a different repo / stack. (Flag for Vipul: which
repo owns `eazyserv.com`? If it's not in this workspace, this needs a
handoff.)

**Submission URL:** `https://eazyserv.com/privacy`

---

## 3. Alternative — Option B: SSR the app route

**What:** The frontend already produces SSR output (`dist/server/` exists —
built via Vinxi / Vite SSR). If `/privacy` renders server-side, Play's
crawler will get a full HTML response.

**Why this is second-best:**
- We'd be serving a legal policy from behind the app shell; hiring or press
  linking "/privacy" inside the consumer app domain is slightly awkward.
- SSR regressions (a missed `loader`, a client-only hook) will silently
  break Play compliance — harder to detect than a static page.

**Verify before shipping:** `curl -s https://app.eazyserv.com/privacy | grep -i "privacy policy"`
should return the first heading of the policy. If it only returns
`<div id="root"></div>`, SSR isn't happening for this route.

**Submission URL:** `https://app.eazyserv.com/privacy` — *only if curl test
above passes*.

---

## 4. Not acceptable — what Play will reject

- **GitHub source URL** (e.g., a link to `privacy.md` in the repo). Play
  specifically forbids source-code hosts as policy URLs.
- **Google Doc / Notion / Dropbox share link.** Subject to permission
  changes, not considered stable.
- **A link to a PDF.** Technically allowed but discouraged; Play reviewers
  sometimes flag "not an HTML page."
- **A URL that requires login.** Policy URL must be public.

---

## 5. Policy content sanity check

Reviewed `src/legal/privacy.md` on 2026-11-04 against the Play Data Safety
form we're filling out. Content coverage is strong (collection, purposes,
third parties, retention, user rights, deletion). Three gaps to fix before
submission so the policy matches our Data Safety declarations:

1. **FCM device token / Firebase.** Current text doesn't name Firebase Cloud
   Messaging as a processor. Add one line under the Third-Party section.
2. **Sentry.** Same — not named as a processor. Add one line disclosing
   error-reporting data flow.
3. **RazorpayX (payouts, Pros only).** Current text names Razorpay for
   payments but not RazorpayX for payouts. Add one line.

These are small edits to `src/legal/privacy.md`. Can be a follow-up PR —
flag for Vipul to decide whether to bundle into the submission PR or ship
after.

---

## 6. Handoff checklist (for Vipul)

- [ ] Pick Option A or Option B (A recommended).
- [ ] Publish the URL and confirm with a plain `curl` that the content is
      returned in the first response body.
- [ ] Paste the URL into Play Console → Main store listing → Privacy policy.
- [ ] Paste the same URL into Play Console → App content → Data safety →
      Privacy policy.
- [ ] (Optional, recommended) Open a follow-up ticket for the 3 policy-text
      additions listed in §5.
