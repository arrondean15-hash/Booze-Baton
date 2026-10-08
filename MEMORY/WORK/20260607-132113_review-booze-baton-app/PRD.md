---
task: Review Booze Baton for bugs and improvements
slug: 20260607-132113_review-booze-baton-app
effort: advanced
phase: complete
progress: 30/30
mode: interactive
started: 2026-06-07T13:21:13Z
updated: 2026-06-07T13:21:13Z
---

## Context

Read-only audit of the Booze Baton app (EA FC Pro Clubs fine-tracker) to find
what is **broken** and what **could be improved**. Requested by the user as a
general health review; no specific feature was named. No source edits and no
deploy this session — output is a prioritised findings report (P0→P3).

Scope: `app.js` (5568 lines), `functions/index.js` (1541), `firestore.rules`
(34), `index.html` (1101), `styles.css` (2000).

Grounded in this app's documented past bugs (CLAUDE.md "Common Gotchas" table):
`req.body.data` vs `req.body`, `onCall` vs `onRequest`, `showNotification()` vs
`showToast()`, `Alert.alert` on web, inline handlers needing `window.fn`.

### Risks
- app.js is 227KB — Explore/grep must be used surgically, not full reads.
- Live runtime testing blocked by Google Sign-In gate (no automated auth) — rely
  on static review + production function logs instead of Playwright smoke test.
- Reviewer agents are change-oriented (diff review); here they review whole files,
  so prompts must say "audit the file" not "review the diff".

## Criteria

**Cloud Functions**
- [x] ISC-1: Every onRequest function calls verifyAuth before acting
- [x] ISC-2: No function reads req.body.data instead of req.body
- [x] ISC-3: CORS allowlist restricted to prod domains + localhost only
- [x] ISC-4: Each function wraps logic in try/catch then sendError
- [x] ISC-5: claimPlayerName uniqueness uses a Firestore transaction
- [x] ISC-6: Super-admin functions verify super-admin email
- [x] ISC-7: No API keys / secrets hardcoded in source
- [x] ISC-8: External API calls handle non-200 / network failure
- [x] ISC-9: scheduledMatchLog cron set to 1am UK time

**Frontend**
- [x] ISC-10: All inline onclick/onchange handlers exposed via window.fn
- [x] ISC-11: No surviving showNotification() calls
- [x] ISC-12: callFunction attaches Bearer token on every call
- [x] ISC-13: Fines realtime listener limited to 200
- [x] ISC-14: Baton realtime listener limited to 50
- [x] ISC-15: APP_VERSION / LAST_UPDATED present and current
- [x] ISC-16: No Alert.alert (React-Native pattern) in browser code
- [x] ISC-17: Async fetches give user feedback on failure
- [x] ISC-18: Voting guarded against double-submit / self-overwrite
- [x] ISC-19: No sensitive data logged to console in prod

**Security rules**
- [x] ISC-20: All collection reads require request.auth != null
- [x] ISC-21: Client writes blocked except dailyVotes + users/{uid}
- [x] ISC-22: users/{userId} write restricted to own uid
- [x] ISC-23: No collection has an open allow write if true

**Auth**
- [x] ISC-24: Login gate blocks app access pre-auth (no DOM flash)
- [x] ISC-25: First-time name claim enforced server-side

**Production / runtime**
- [x] ISC-26: Live Cloud Function logs checked for recurring errors
- [x] ISC-27: functions.config() deprecation status assessed

**Synthesis**
- [x] ISC-28: Improvement opportunities captured as prioritised list

**Anti-criteria**
- [x] ISC-A1: Review modifies NO source files (read-only)
- [x] ISC-A2: No deploy triggered during review

## Decisions

- Pointed the two project reviewer agents at whole files (not a diff) + a third
  Explore agent for improvements + firebase logs for prod errors — four parallel
  lanes, distinct mandates, no overlap.
- Verified every P1+ finding by re-reading the actual code before asserting it.
- `deleteAllFines` reclassified to the top P1: it is the single highest-impact
  real defect (data-loss exposure to all users), above the doc/quality nits the
  agents rated P0/P2.

## Verification

All 30 checks performed. Outcome per criterion:

PASS (at ideal state): ISC-1 (all 28 fns verifyAuth), ISC-2 (no broken
req.body.data; line 1274 is a defensive `|| req.body` fallback, harmless),
ISC-3 (CORS allowlist, not wildcard), ISC-4 (try/catch+sendError),
ISC-5 (claimPlayerName runTransaction @1327), ISC-7 (no server secrets; web
apiKey @app.js:6 is public-by-design), ISC-9 (cron 0 1 * * * Europe/London),
ISC-10 (~60 handlers all window-exposed), ISC-11 (no showNotification),
ISC-12 (Bearer on callFunction + GET), ISC-13 (fines limit 200),
ISC-14 (baton limit 50), ISC-15 (APP_VERSION/LAST_UPDATED present @16-17),
ISC-16 (no Alert.alert), ISC-19 (console noise only, nothing sensitive),
ISC-20 (all reads auth-gated), ISC-21 (default deny + 2 overrides),
ISC-22 (users own-uid write), ISC-23 (no allow write:if true),
ISC-24 (CSS-first login gate, no flash), ISC-25 (name claim server-side),
ISC-26 (prod logs checked — 0 ERROR entries), ISC-27 (functions.config still
in use — migration pending, EOL Mar 2026), ISC-28 (improvement list delivered),
ISC-A1 (no edits), ISC-A2 (no deploy).

FINDINGS (ideal state NOT met — confirmed in situ):
- ISC-6 → functions/index.js:779 deleteAllFines uses verifyAuth not
  verifySuperAdmin (P1, data-loss). Plus :39/:61 super-admin null-email bypass (P1).
- ISC-8 → functions/index.js:818 `timeout:10000` ignored by undici fetch; no
  AbortSignal — EA calls can hang to function timeout (P2).
- ISC-17 → app.js confirmPaid/confirmUnpaid/confirmBulkPaid use alert() not
  showToast() on failure (P3).
- ISC-18 → app.js:4878 submitVote full-collection scan instead of getDoc(todayDocRef);
  no double-submit guard; whole-map setDoc overwrite combines with firestore.rules:13
  (any authed user can overwrite another player's vote) (P2).
