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
├── index.html          # Main HTML file
├── app.js              # All frontend JavaScript (~227KB)
├── styles.css          # All styling
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

- `searchTeams` - Search football teams via API-Football
- `getLatestCompetitiveMatch` - Get recent match for a team
- EA Pro Clubs functions for match history and player stats

## Firebase Config

- **Project ID**: booze-baton
- **Hosting**: booze-baton.web.app
- **Functions region**: us-central1

### Environment Variables (set via Firebase config)
```bash
firebase functions:config:set football.apikey="YOUR_KEY"
firebase functions:config:set admin.pin="YOUR_PIN"
```

## Deployment

```bash
# Deploy hosting only
firebase deploy --only hosting

# Deploy functions only
firebase deploy --only functions

# Deploy everything
firebase deploy
```

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

## Version

Current: v2.9.0 (update `APP_VERSION` and `LAST_UPDATED` in app.js before deploys)
