# Booze Baton

Fine-tracking web app for an EA FC Pro Clubs gaming group ("Benidorm United").

## Tech Stack

- **Frontend**: Single-page vanilla JS app (no framework)
- **Backend**: Firebase (Firestore, Hosting, Cloud Functions)
- **External APIs**:
  - API-Football (v3.football.api-sports.io) for real football match data
  - EA Pro Clubs API (proclubs.ea.com) for club match history and player stats

## Project Structure

```
Booze-Baton/
├── index.html          # Main HTML file (~42KB)
├── app.js              # All frontend JavaScript (~227KB)
├── styles.css          # All styling (~24KB)
├── logo.png            # Header badge image (extracted from base64)
├── firebase.json       # Firebase project config
├── firestore.rules     # Firestore security rules
├── functions/          # Cloud Functions backend
│   └── index.js        # All cloud functions
└── scripts/            # Local Python utilities (not deployed)
    └── baton_tracker_espn.py  # ESPN data scraper
```

## Key Concepts

### Fines
Predefined fine reasons with amounts (e.g., "Rage Quit" = £4, "10 minutes late" = £2). Stored in Firestore `fines` collection.

### Baton
A tracking concept where the "baton" passes between players. History stored in `batonHistory` collection.

### Voting System
Daily best/worst player voting. Stored in `dailyVotes/{date}` collection.

### EA Pro Clubs Integration
Fetches match data from EA's Pro Clubs API for club ID `21853` (Benidorm United) on platform `common-gen5` (PS5/Xbox Series X|S).

## Cloud Functions

Located in `functions/index.js`. All functions use `functions.https.onRequest` (Express-style `req, res`) — **NOT** `onCall`/`httpsCallable`. The frontend calls them via a raw `fetch` helper `callFunction()` (app.js ~line 27) which sends JSON directly as `req.body` with a Bearer token in the Authorization header.

**Authenticated Functions** (onRequest with CORS + token auth):
- `addFine` - Add a new fine
- `deleteFine` - Delete a fine
- `updateFine` - Update fine (e.g., mark as paid)
- `deleteAllFines` - Delete all fines
- `addBatonEntry` - Add baton transfer entry
- `deleteBatonEntry` - Delete baton entry
- `saveTeam` - Save team to known_teams
- `setBatonHolder` - Set current baton holder
- `updatePlayers` - Update players list
- `updateFineReasons` - Update fine reasons list
- `searchTeams` - Search football teams via API-Football
- `getProClubsMatches` - Get EA Pro Clubs match history
- `getProClubsSquad` - Get EA Pro Clubs squad stats
- `getProClubsInfo` - Get EA Pro Clubs club info
- `getLoggedMatches` - Get logged matches from Firestore
- `updateMatchAnyPlayer` - Update ANY player for a match
- `logProClubsMatches` - Manual match logging trigger
- `getLatestCompetitiveMatch` - Get recent match for a team
- `updateBaton` - Check and update baton based on match results
- `claimPlayerName` - Claim a player name (with transaction for uniqueness)
- `updatePlayerMappings` - Save EA-to-app player mappings
- `checkSuperAdmin` - Check if current user is super admin

**Super Admin Functions** (requires super admin email):
- `relogAllMatches` - Clear and re-log all matches
- `reassignPlayerName` - Reassign a player name to a different user
- `removeUserClaim` - Remove a user's player name claim
- `listAllUsers` - List all registered users
- `resetAllClaims` - Reset all player name claims

**Scheduled**:
- `scheduledMatchLog` - Runs daily at 1am UK time

## Firebase Config

- **Project ID**: booze-baton
- **Hosting**: booze-baton.web.app
- **Functions region**: us-central1

### Environment Variables (set via Firebase config)
```bash
firebase functions:config:set football.apikey="YOUR_KEY"
firebase functions:config:set superadmin.email="YOUR_EMAIL@gmail.com"
```

## Deployment Workflow

### IMPORTANT: Always follow these steps

1. **Test locally first**:
   ```bash
   firebase serve --only hosting
   ```
   Then open http://localhost:5000 to verify changes work.

2. **Update version** (if making user-facing changes):
   - Edit `app.js` lines 16-17:
     ```javascript
     const APP_VERSION = 'vX.X.X';      // Increment appropriately
     const LAST_UPDATED = 'DD Mon YYYY'; // Update to today's date
     ```
   - Use semantic versioning: major.minor.patch

3. **Deploy**:
   ```bash
   # Deploy hosting only
   firebase deploy --only hosting

   # Deploy functions only
   firebase deploy --only functions

   # Deploy everything
   firebase deploy
   ```

4. **Commit and push** after successful deploy.

## Versioning Guidelines

- **Patch** (v2.9.0 → v2.9.1): Bug fixes, minor tweaks
- **Minor** (v2.9.0 → v2.10.0): New features, significant changes
- **Major** (v2.9.0 → v3.0.0): Breaking changes, major overhauls

## Authentication

- **Google Sign-In** via Firebase Auth (popup with redirect fallback for iOS PWA)
- All users must authenticate before accessing the app
- First-time users pick a player name from the available list (enforced via `claimPlayerName` Cloud Function with Firestore transaction)
- Voter identity is locked to authenticated user's `currentPlayerName` — no dropdown
- Super admin (email-based) has override panel for managing user claims
- Auth state managed via `onAuthStateChanged` listener; `init()` called after auth

### Firestore Collections
- `users/{uid}` — user profile (email, displayName, playerName, photoURL)
- `playerNames/{name}` — uniqueness enforcement (uid, claimedAt)

## Firestore Security

- Authenticated read access on all collections (`request.auth != null`)
- Client writes blocked except for `dailyVotes` (auth read/write) and `users/{userId}` (own-doc write)
- `config`, `playerNames`, and all other collections: writes only via Cloud Functions (Admin SDK)
- Admin operations require Firebase Auth token via Cloud Functions

## Performance Optimizations

The app limits Firestore realtime listeners to prevent excessive reads:
- Fines listener limited to 200 most recent
- Baton listener limited to 50 most recent
- Full history loaded on-demand with caching
- Dev mode (`?dev=1` URL param) disables listeners for testing

## Key Features

### Match History Table
- ANY Player dropdown moved to left of table for easier access
- "Void" option in dropdown to exclude matches from stats calculations
- Columns: Date, ANY Player, Result, Score, Opponent, Players & Ratings

### EA Pro Clubs Stats (Manage Tab)
- Fetches live games played from EA servers
- Shows: Player, EA Games, Void count, Adjusted total
- Auto-Update EAFC 26 button syncs EA games to player records (excludes void matches)
- Only shows players with mappings configured in Settings

### Player Selection (Add Fine)
- Chip-style selection UI (tap to toggle)
- Multi-select enabled for bulk fines

## Recent Changes

- **08 Jun 2026**:
  - v3.1.0: History tab bulk-edit upgrade (faster multi-amend on mobile)
    - **Tap-to-select rows** — tapping anywhere on a fine row toggles selection (`toggleRowSelection`, app.js); selected rows highlight (`.row-selected`). Checkbox set `pointer-events:none` so the row owns selection state (no double-toggle). Per-row Paid/Del buttons tagged `.row-action` and excluded from row-tap via `event.target.closest('.row-action')`.
    - **Sticky bulk action bar** — `#bulkActionBar` is now `position:fixed` (`bottom:96px`, above the 84px tab bar, `z-index:105`), shows "N selected · £total" and **Paid / Unpaid / Delete / Clear**.
    - **Bulk Delete added** — `bulkDelete()` loops `callFunction('deleteFine',{fineId})` with a single "Are you sure?" confirm (previously delete was per-row only).
    - **Quick-select chips** — All / Unpaid / None (`selectAllVisible`, `selectUnpaidVisible`, `clearSelection`) in `#historyToolbar`.
    - **Auto-load** — opening History auto-loads full fines (`autoLoadHistory` in `switchTab`, only when `cachedFullFines` empty); old "Refresh History" card replaced with a slim refresh button.
    - Reviewed by booze-reviewer (SHIP); tested on `:5050` (0 console errors, selection wiring verified). Hosting-only deploy (no Cloud Functions change).
- **07 Jun 2026**:
  - v3.0.2: Security hardening from a full app review (audit findings below)
    - **P1 fix**: `deleteAllFines` Cloud Function now requires `verifySuperAdmin` (was `verifyAuth`) — previously ANY authenticated player could call it and wipe the entire fines ledger (client writes are blocked by rules, so this function was the only delete path and it was unguarded). `functions/index.js:783`
    - **P1 fix**: `verifySuperAdmin` now fails closed — returns 503 if `SUPER_ADMIN_EMAIL` is unset, and rejects tokens with no `email` claim. Closes the `undefined !== undefined === false` bypass where an unconfigured admin email could grant super-admin to an email-less token. `functions/index.js:58`
    - **Frontend**: "Clear All Fines" (`#clearAllFinesBtn`) and "Import CSV (Replace All Data)" (`#adminReplaceImportGroup`) are now hidden unless `isSuperAdmin`, toggled in `updateProfileUI()` alongside the super-admin panel. Non-destructive "Import CSV (Add to Existing)" and "Mark All as Paid" remain visible to all users.
    - Both changes reviewed by `security-reviewer` + `booze-reviewer` (verdict SHIP), tested on `:5050` (0 console errors), functions + hosting deployed to production, committed to `main` (`53681ed`).
    - **Outstanding audit items (P2, not yet fixed)**: (1) `firestore.rules` lets any authed user overwrite the whole `dailyVotes/{date}` map — a user can tamper with others' votes; (2) `submitVote`/`saveVoteEdit`/`deleteVote` read the ENTIRE `dailyVotes` collection then `.find()` today's doc instead of `getDoc(doc(db,'dailyVotes',date))` — full-scan that grows forever; (3) EA Pro Clubs `fetch` uses `timeout: 10000` which undici ignores — should be `AbortSignal.timeout()`; (4) catch blocks echo raw `error.message` to clients, leaking internals; (5) vote functions have no double-submit guard.
  - **Note**: v3.0.1 (dated 19 Apr 2026 in `app.js`) shipped but was never recorded in this changelog — its contents are not documented here.
- **23 Feb 2026**:
  - Bugfix: `updateMatchAnyPlayer` Cloud Function was reading `req.body.data` instead of `req.body`, causing every ANY player assignment to fail with "matchId is required"
  - Added failsafe (`req.body.data || req.body`) so the function works with both raw and data-wrapped request bodies
  - Deployed updated Cloud Functions to production
- **21 Feb 2026**:
  - v3.0.0: Google Sign-In & User Authentication
    - Added Firebase Auth with Google Sign-In (popup + redirect fallback)
    - Login gate with CSS-first approach (no DOM flash)
    - Player name claiming system with Firestore transaction for uniqueness
    - Replaced admin PIN system with Firebase Auth token verification
    - All Cloud Functions now use `verifyAuth()` with Bearer tokens
    - Voting locked to authenticated user's player name (no voter dropdown)
    - Votes now include `uid` field for identity verification
    - Super admin panel (email-based) for user management
    - CORS restricted to production domains + localhost
    - Firestore rules updated: auth-required reads, restricted writes
    - Security headers added (X-Content-Type-Options, X-Frame-Options, Referrer-Policy)
    - Player mappings now saved via Cloud Function instead of direct Firestore write
    - All GET fetch calls now include auth headers
    - New Cloud Functions: claimPlayerName, updatePlayerMappings, checkSuperAdmin, reassignPlayerName, removeUserClaim, listAllUsers, resetAllClaims
- **16 Feb 2026**:
  - v2.12.0: Full UI redesign - Leeds United dark theme + mobile-first SPA
    - Complete CSS restyle with Leeds United colour palette (#1D3C8D, #FFCD00, etc.)
    - Elland Road stadium background with semi-transparent overlay
    - 5-tab bottom navigation: Home, Board, + (Add Fine), Vote, History
    - 12 screens: Home, Board, Add, Voting, History, Stats, Charts, Players, Manage, Baton, Settings, Spakka, Matches
    - Quick-nav grid on Home screen for secondary screens
    - Match Result Entry Form with Win/Draw/Loss buttons and opponent search
    - Baton Risk Prediction (safe/at-risk players)
    - Player vs Player comparison on Stats tab
    - Filter summary on History tab
    - Auto-prompt password unlock (no need to navigate to Settings)
    - Busiest Days table with fixed mobile layout
    - Removed Top 10 Fine Types chart (redundant)
    - Fixed: History search/filter off-by-one from checkbox column
    - Fixed: Network status banner positioning
    - Fixed: `showNotification()` -> `showToast()` bug in match ANY player update
    - Fixed: CSS media query ordering (768px before 480px)
    - Fixed: Dead `batonForm` handler blocking `setupEnterKeyHandlers()`
    - Fixed: `deletePlayer`/`deletePlayerFromSettings` missing try/catch on password prompt
    - Removed dead code: old batonForm submit handler, unlockPassword keypress handler
- **2 Feb 2026**:
  - v2.11.0: Multi-select bulk actions for History tab
    - Checkboxes on each fine row for individual selection
    - "Select All" checkbox in header (selects visible/filtered fines)
    - Bulk action bar appears when fines selected
    - "Mark Paid" button with date picker for bulk payment
    - "Mark Unpaid" button for bulk unpaid
    - "Clear Selection" to deselect all
- **1 Feb 2026**:
  - v2.10.1: Fixed Cloud Functions - converted admin functions from `onCall` to `onRequest` to work with direct HTTP fetch calls from frontend
  - v2.10.0: UI improvements and EA stats integration
  - Moved ANY Player column to left of Match History table
  - Added "Void" option to ANY dropdown
  - Added EA Pro Clubs Stats card with void tracking
  - Auto-Update EAFC 26 feature (excludes void matches)
  - Redesigned player selection as tappable chips
  - Removed Recent Matches section (redundant with Match History)
  - Upgraded Cloud Functions to Node.js 20 (Node 18 deprecated)
  - Updated EA API headers (Chrome 131 User-Agent)
  - Fixed cloud functions CORS and db initialization
- **Feb 2026**: Extracted base64 logo to separate `logo.png` file (reduced index.html from 273KB to 42KB)
- **Jan 2026**: v2.9.0 - EA Pro Clubs integration, match logging, ANY player tracking

## Common Gotchas & Past Bugs

These patterns have caused real bugs — check for them when debugging:

| Pattern | What went wrong | Fix |
|---------|----------------|-----|
| `req.body.data` in Cloud Functions | `updateMatchAnyPlayer` read `req.body.data` instead of `req.body`, silently failing every call (23 Feb 2026) | All functions use `onRequest` + raw `fetch` — body is always `req.body`, never `req.body.data` |
| `onCall` vs `onRequest` mismatch | Admin functions were `onCall` but frontend used raw `fetch` (v2.10.1) | Converted all to `onRequest` — do NOT use `onCall` in this project |
| Destructive function gated by `verifyAuth` only | `deleteAllFines` used `verifyAuth`, so any authenticated player could wipe all fines (v3.0.2) | Destructive/admin-wide ops must use `verifySuperAdmin`, AND hide their UI controls behind `isSuperAdmin` |
| `verifySuperAdmin` open when email unset | If `SUPER_ADMIN_EMAIL` is undefined, `undefined !== undefined` is `false` → check passes (v3.0.2) | `verifySuperAdmin` now fails closed (503) when unset and rejects tokens with no `email` |
| `showNotification()` doesn't exist | Old function name referenced in match ANY player update | Use `showToast()` instead |
| `Alert.alert` on web | React Native pattern doesn't work in browser | Use `window.alert` on web |
| Port 5000 taken on macOS | ControlCenter occupies port 5000 | Use `firebase serve --port 5050` |
| ES module + inline handlers | `onclick` in HTML can't see module-scoped functions | Must expose via `window.functionName` |

## Known Deprecations

- **Node.js 20**: Deprecated April 2026, decommissioned October 2026 — upgrade to Node.js 22
- **functions.config()**: Deprecated March 2026 — migrate to params package

## Design System

Leeds United-branded dark theme (completed Feb 2026 UI redesign):

- **Colours**: Primary `#1D3C8D`, cards `#16307A`, tab bar `#152C6B`, accent `#FFCD00`, borders `#2E5AB0`
- **Typography**: Headlines Sora (bold), body Inter, fallback system fonts
- **Background**: Elland Road stadium with `#1D3C8DA6` overlay (~65% opacity)
- **Layout**: 5-tab bottom nav (Home, Board, +, Vote, History) + 7 secondary screens via quick-nav
- **Design mockups**: `/Users/arrondean/Desktop/App Colours Idea/`

## Agent Playbooks

When debugging or building features, spin up specialist sub-agents with the context below. Use the Task tool with `subagent_type: "general-purpose"` and include the relevant playbook in the prompt.

### Backend Debugger
> You are debugging a Firebase Cloud Functions backend in `/tmp/Booze-Baton/functions/index.js`. Key context:
> - All 28 functions use `functions.https.onRequest` (Express-style `req, res`) — NOT `onCall`/`httpsCallable`
> - Frontend calls them via raw `fetch` with `body: JSON.stringify(data)` — request data is always in `req.body`, NEVER `req.body.data`
> - Auth: every function calls `verifyAuth(req, res)` which checks `Authorization: Bearer <idToken>` header
> - CORS: custom `handleCors(req, res)` function (lines 69-88) — sets headers, handles OPTIONS preflight, does NOT modify `req.body`
> - Responses: `sendResponse(res, status, data)` and `sendError(res, status, code, message)` helpers
> - Firestore: `admin.firestore()` via `db` variable, collections include: fines, batonHistory, dailyVotes, users, playerNames, config, proClubsMatches, known_teams
> - Check the "Common Gotchas & Past Bugs" table in CLAUDE.md for known patterns

### Frontend Debugger
> You are debugging a vanilla JS single-page app in `/tmp/Booze-Baton/app.js` (~227KB) with `/tmp/Booze-Baton/styles.css` and `/tmp/Booze-Baton/index.html`. Key context:
> - No framework — plain JS with ES modules (`type="module"` in script tag)
> - All Cloud Function calls go through `callFunction(functionName, data)` helper (~line 27) which uses raw `fetch` with JSON body + Bearer token
> - Inline `onclick`/`onchange` handlers in HTML require functions to be exposed via `window.functionName = functionName`
> - Toast notifications use `showToast(message, type)` — NOT `showNotification()` (old name, doesn't exist)
> - 5 main tabs (Home, Board, +, Vote, History) + 7 secondary screens navigated via `showScreen(screenName)`
> - Leeds United dark theme — colours defined in CSS variables
> - Version info at lines 16-17: `APP_VERSION` and `LAST_UPDATED`

### Deploy & Test Agent
> You are responsible for testing and deploying the Booze Baton app from `/tmp/Booze-Baton`. Key context:
> - MUST test locally before any deploy: `firebase serve --only hosting --port 5050 --project booze-baton`
> - For functions: `firebase emulators:start --only functions --project booze-baton`
> - Firebase project ID: `booze-baton` — always use `--project booze-baton` flag when deploying from `/tmp/`
> - Deploy hosting: `firebase deploy --only hosting --project booze-baton`
> - Deploy functions: `cd functions && npm install && cd .. && firebase deploy --only functions --project booze-baton`
> - Deploy everything: `firebase deploy --project booze-baton`
> - After deploy, verify the live app at https://booze-baton.web.app
> - If something breaks, the previous version is the last commit on GitHub — `git revert HEAD` and redeploy

### Firestore Auditor
> You are auditing Firestore data and security for the Booze Baton app. Key context:
> - Project: `booze-baton`, rules in `/tmp/Booze-Baton/firestore.rules`
> - Collections: `fines`, `batonHistory`, `dailyVotes/{date}`, `users/{uid}`, `playerNames/{name}`, `config`, `proClubsMatches`, `known_teams`
> - Security model: all reads require auth (`request.auth != null`), client writes blocked except `dailyVotes` (auth read/write) and `users/{userId}` (own-doc write)
> - All other writes go through Cloud Functions using Admin SDK (bypasses rules)
> - `playerNames` enforces uniqueness via Firestore transaction in `claimPlayerName` function
> - Super admin operations (reassign, remove claims, list users) check email against `functions.config().superadmin.email`

## Important Notes

- **ALWAYS clone from GitHub** (`gh repo clone arrondean15-hash/Booze-Baton`) into `/tmp/` at the start of each session. Never read or edit files from `~/Desktop/` — those are stale local clones and not the source of truth. GitHub is always the latest.
- **ALWAYS test before committing/deploying.** After making changes, run `firebase serve --only hosting --port 5050 --project booze-baton` from the `/tmp/Booze-Baton` directory and verify the affected feature works at `http://localhost:5050` before pushing to GitHub or deploying to production. For Cloud Functions changes, use `firebase emulators:start --only functions --project booze-baton` to test locally first. Never push untested code — if something breaks in production, rolling back is painful.
- **Live app**: https://booze-baton.web.app
- **Firebase project**: `booze-baton` (use `--project booze-baton` when deploying from `/tmp/`)
- All users authenticate via Google Sign-In before accessing any app functionality
- All Cloud Functions require Firebase Auth token (no more PIN)
- Super admin email set via `firebase functions:config:set superadmin.email="..."`
- Deploy all services together (`firebase deploy`) — auth code and Firestore rules must deploy simultaneously
- ES module (`type="module"`) — inline onclick handlers need `window.functionName` exposure
