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

Located in `functions/index.js`. All admin functions require password validation.

**Admin Functions** (onRequest with CORS):
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

**Public Functions** (onRequest):
- `getProClubsMatches` - Get EA Pro Clubs match history
- `getProClubsSquad` - Get EA Pro Clubs squad stats
- `getProClubsInfo` - Get EA Pro Clubs club info
- `getLoggedMatches` - Get logged matches from Firestore
- `updateMatchAnyPlayer` - Update ANY player for a match
- `logProClubsMatches` - Manual match logging trigger
- `relogAllMatches` - Clear and re-log all matches

**Callable Functions** (onCall - used internally):
- `getLatestCompetitiveMatch` - Get recent match for a team
- `updateBaton` - Check and update baton based on match results

**Scheduled**:
- `scheduledMatchLog` - Runs daily at 1am UK time

## Firebase Config

- **Project ID**: booze-baton
- **Hosting**: booze-baton.web.app
- **Functions region**: us-central1

### Environment Variables (set via Firebase config)
```bash
firebase functions:config:set football.apikey="YOUR_KEY"
firebase functions:config:set admin.pin="YOUR_PIN"
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

## Firestore Security

- Public read access on all collections
- Client writes blocked except for `dailyVotes` and `config` collections
- Admin operations require password via Cloud Functions

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

## Known Deprecations

- **Node.js 20**: Deprecated April 2026, decommissioned October 2026 - upgrade to Node.js 22
- **functions.config()**: Deprecated March 2026 - migrate to params package

---

## UI Redesign (Branch: `ui-redesign`)

### Overview
Full visual overhaul to a Leeds United-branded mobile-first design. Backend (Cloud Functions, Firestore) stays completely untouched. Only frontend files change: `styles.css`, `index.html`, and DOM references in `app.js`.

### Design Reference
Pencil mockups created in VS Code Pencil extension. Reference images saved in:
`/Users/arrondean/Desktop/App Colours Idea/`

### Design System

**Colours (Official Leeds United palette):**
- Primary background: `#1D3C8D` (Royal blue)
- Card surfaces: `#16307A` (Darker blue)
- Tab bar: `#152C6B` (Darkest blue)
- Accent/CTA: `#FFCD00` (Leeds gold)
- Borders/strokes: `#2E5AB0`
- Primary text: `#FFFFFF`
- Secondary text: `#A8BDE0`
- Muted text: `#7B9AD4`

**Typography:**
- Headlines: Sora (bold)
- Body/UI: Inter
- Fallback: system fonts

**Background:**
- Elland Road stadium image merged behind content with semi-transparent blue overlay (`#1D3C8DA6` ~65% opacity)

### Screens Designed (5 iPhone screens, 393×852px)
1. **Home** - Greeting, Elland Road banner, stat cards (Total Pot, Unpaid, Players), Baton Holder card, Recent Fines
2. **Leaderboard** - "Hall of Shame", segmented tabs (Worst/Improved/Clean), podium top 3, full rankings
3. **Voting** - Daily Vote with LIVE badge, Best/Worst player radio selections, Submit button
4. **History** - Search bar, filter chips (All/Unpaid/Paid/This Week), date-grouped fine entries with status badges
5. **Log Fine** - Modal-style form (Player, Reason, Amount, Date, Notes), Quick Fine shortcuts

### Tab Bar Pattern
- 5 tabs: Home, Board, + (raised gold circle), Vote, History
- The "+" opens Log Fine as a modal overlay
- Active tab highlighted in gold

### Mapping: New Screens → Existing Tabs
| New Screen | Old Tab(s) | Notes |
|-----------|-----------|-------|
| Home | Stats + Baton | Combined into dashboard |
| Leaderboard | Stats/Charts | Redesigned as "Hall of Shame" |
| Voting | Voting | Same functionality, new look |
| History | History | Same functionality, new look |
| Log Fine | Add | Redesigned as modal |
| TBD | Players, Manage, Settings, Spakka, Matches | Need to design these screens |

### Progress Tracker
- [x] Create `ui-redesign` branch
- [x] Update CLAUDE.md with redesign context
- [x] Phase 1: CSS restyle (colours, typography, card styles)
- [x] Phase 2: HTML restructure (mobile-first layout, tab bar)
- [x] Phase 3: app.js DOM reference updates
- [x] Phase 4: All screens implemented (Players, Manage, Settings, Matches, Spakka, Baton, Charts, Stats)
- [x] Phase 5: Local testing with `firebase serve`
- [x] Phase 6: Deployed to Firebase Hosting
- [x] Feature parity audit (3 parallel agents - all 36+ missing IDs restored)
- [x] History filter bug fix (off-by-one from checkbox column)
- [x] UX fixes (homepage default, auto-unlock, table overflow, removed unused chart)
- [x] Troubleshooting audit (JS errors, CSS issues, dead code cleanup)
- [x] Merge to main (PR #14 merged)

### App Lock / Auto-Unlock System
- `isAppUnlocked` boolean + `adminPassword` stored in `sessionStorage`
- `getAdminPassword()` auto-prompts if locked (no need for Settings navigation)
- Once unlocked, stays unlocked for the browser session
- All admin actions go through `getAdminPassword()` which handles the prompt flow

### Important Notes
- **DO NOT** modify `functions/index.js` - backend stays as-is
- **DO NOT** change Firestore collection names or document structures
- All existing functionality must keep working (fines, voting, baton, matches etc.)
- Test with `firebase serve --only hosting --port 5050` before any deploy (port 5000 taken by macOS ControlCenter)
- 5 main tabs + 7 secondary screens accessible via quick-nav and navigation buttons
- ES module (`type="module"`) - inline onclick handlers need `window.functionName` exposure
