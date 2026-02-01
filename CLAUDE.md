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
