# Play Console — Listing prep (SVC-121)

Everything Vipul needs to complete the Google Play Store listing for the
EazyServ Android app (`com.eazyserv.app`). Agent-produced, review-ready;
final paste / upload into Play Console is a human step.

## Files

| File | Pastes into Play Console section |
|---|---|
| [data-safety.md](./data-safety.md) | App content → Data safety |
| [content-rating.md](./content-rating.md) | App content → Content rating (IARC questionnaire) |
| [store-listing.md](./store-listing.md) | Main store listing → App details + Target audience and content |
| [screenshot-briefs.md](./screenshot-briefs.md) | Main store listing → Phone screenshots + Feature graphic |
| [privacy-policy-url.md](./privacy-policy-url.md) | Blocker — read first |

## Order of operations (recommended)

1. **Fix the privacy policy URL** (`privacy-policy-url.md`) — this is a hard
   blocker for the Data Safety form submission.
2. **Capture the 6 screenshots** (`screenshot-briefs.md`) — these need app
   state seeded (saved address, in-progress booking). Easy to batch in a
   single device session.
3. **Create the app shell in Play Console** — name, package, category.
4. **Fill Data Safety** (`data-safety.md`) — longest form.
5. **Fill Content Rating** (`content-rating.md`) — fastest form.
6. **Paste store listing copy** (`store-listing.md`).
7. **Upload screenshots + feature graphic**.
8. **Submit for review** (internal testing track first, per SVC-123).

## Agent scope ended at

- All answers drafted with codebase citations (data-safety.md has `path:line`
  evidence for every data type).
- Flags for Vipul live at the end of each file under "Open items flagged
  for Vipul."
- No policy edits to `src/legal/privacy.md` (flagged as a follow-up).
- No Play Console session was opened by the agent.
