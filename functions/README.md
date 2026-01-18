# Booze Baton Cloud Functions

Backend API integration for football match data.

## Functions

### `searchTeams`
Search for football teams by name via API-Football.

**Parameters:**
- `query` (string): Team name to search for

**Returns:** Array of team objects

### `getLatestCompetitiveMatch`
Fetch the most recent finished competitive match for a team.

**Parameters:**
- `teamId` (number): Team ID from API-Football

**Returns:** Match object or null if no match found

## Setup

See [FUNCTIONS-SETUP.md](../FUNCTIONS-SETUP.md) for complete setup instructions.

Quick start:
```bash
# Install dependencies
npm install

# Configure API key
firebase functions:config:set football.apikey="YOUR_KEY"

# Deploy
firebase deploy --only functions
```

## API Provider

Uses [API-Football](https://www.api-football.com/) via RapidAPI.

## Security

- API key stored in Firebase Functions config (server-side only)
- Never exposed to client
- HTTPS-only endpoints
- Automatic CORS handling
