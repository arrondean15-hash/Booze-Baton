# Firebase Functions Setup Guide

This guide covers the setup and deployment of Firebase Cloud Functions for football API integration.

## Overview

Two Cloud Functions are provided to securely interact with the API-Football service:
1. **searchTeams** - Search for football teams by name
2. **getLatestCompetitiveMatch** - Fetch the most recent competitive match for a team

## Prerequisites

1. Firebase CLI installed (`npm install -g firebase-tools`)
2. API-Football API key from RapidAPI
   - Sign up at: https://rapidapi.com/api-sports/api/api-football
   - Subscribe to a plan (free tier available)
   - Copy your API key from the dashboard

## Initial Setup

### 1. Install Dependencies

```bash
cd functions
npm install
```

### 2. Configure API Key

The API key must be stored securely in Firebase Functions configuration:

```bash
firebase functions:config:set football.apikey="YOUR_RAPIDAPI_KEY_HERE"
```

**Example:**
```bash
firebase functions:config:set football.apikey="abc123def456ghi789jkl012mno345pqr678"
```

### 3. Configure Admin PIN (Optional but Recommended)

For server-side PIN validation in the Team ID Finder:

```bash
firebase functions:config:set admin.pin="YOUR_4_DIGIT_PIN"
```

**Example:**
```bash
firebase functions:config:set admin.pin="5678"
```

**Note:** If not set, defaults to `1234`. Also update client-side PIN in `app.js`.

### 3. Verify Configuration (Optional)

```bash
firebase functions:config:get
```

You should see:
```json
{
  "football": {
    "apikey": "YOUR_RAPIDAPI_KEY_HERE"
  }
}
```

## Deployment

### Deploy All Functions

```bash
firebase deploy --only functions
```

### Deploy Specific Function

```bash
firebase deploy --only functions:searchTeams
firebase deploy --only functions:getLatestCompetitiveMatch
```

### First-Time Deployment

On first deployment, you may be prompted to:
- Enable Cloud Functions API
- Enable Cloud Build API
- Upgrade to Blaze (pay-as-you-go) plan if on Spark plan

Follow the prompts to complete setup.

## Function Endpoints

After deployment, Firebase will provide URLs for your functions:
```
✔  functions[searchTeams(us-central1)]: Successful create operation.
Function URL: https://us-central1-YOUR-PROJECT-ID.cloudfunctions.net/searchTeams

✔  functions[getLatestCompetitiveMatch(us-central1)]: Successful create operation.
Function URL: https://us-central1-YOUR-PROJECT-ID.cloudfunctions.net/getLatestCompetitiveMatch
```

## Usage from Client-Side

### Import Firebase Functions

```javascript
import { getFunctions, httpsCallable } from 'firebase/functions';

const functions = getFunctions();
```

### Call searchTeams

```javascript
const searchTeams = httpsCallable(functions, 'searchTeams');

try {
  const result = await searchTeams({ query: 'Leeds United' });
  console.log(result.data);
  /*
  [
    {
      teamId: 1234,
      teamName: "Leeds United",
      country: "England",
      city: "Leeds",
      logo: "https://..."
    }
  ]
  */
} catch (error) {
  console.error('Error searching teams:', error);
}
```

### Call getLatestCompetitiveMatch

```javascript
const getLatestMatch = httpsCallable(functions, 'getLatestCompetitiveMatch');

try {
  const result = await getLatestMatch({ teamId: 1234 });
  console.log(result.data);
  /*
  {
    matchId: 987654,
    matchDate: "2024-01-15T15:00:00+00:00",
    competitionName: "Premier League",
    competitionCountry: "England",
    homeTeamId: 1234,
    homeTeamName: "Leeds United",
    homeTeamLogo: "https://...",
    awayTeamId: 5678,
    awayTeamName: "Manchester United",
    awayTeamLogo: "https://...",
    homeScore: 2,
    awayScore: 1
  }
  */
} catch (error) {
  console.error('Error fetching match:', error);
}
```

## API Response Examples

### searchTeams

**Input:**
```json
{ "query": "Arsenal" }
```

**Output:**
```json
[
  {
    "teamId": 42,
    "teamName": "Arsenal",
    "country": "England",
    "city": "London",
    "logo": "https://media.api-sports.io/football/teams/42.png"
  },
  {
    "teamId": 1359,
    "teamName": "Arsenal Tula",
    "country": "Russia",
    "city": "Tula",
    "logo": "https://media.api-sports.io/football/teams/1359.png"
  }
]
```

### getLatestCompetitiveMatch

**Input:**
```json
{ "teamId": 42 }
```

**Output:**
```json
{
  "matchId": 1035086,
  "matchDate": "2024-01-07T14:00:00+00:00",
  "competitionName": "FA Cup",
  "competitionCountry": "England",
  "homeTeamId": 42,
  "homeTeamName": "Arsenal",
  "homeTeamLogo": "https://media.api-sports.io/football/teams/42.png",
  "awayTeamId": 40,
  "awayTeamName": "Liverpool",
  "awayTeamLogo": "https://media.api-sports.io/football/teams/40.png",
  "homeScore": 0,
  "awayScore": 2
}
```

**No Match Found:**
```json
null
```

## Error Handling

Both functions use structured error responses:

```javascript
try {
  const result = await searchTeams({ query: '' });
} catch (error) {
  console.error(error.code);    // 'invalid-argument'
  console.error(error.message); // 'Query parameter is required...'
}
```

**Common Error Codes:**
- `invalid-argument` - Invalid input parameters
- `internal` - API error or server error
- `unauthenticated` - API key not configured

## Local Testing (Optional)

### Run Functions Emulator

```bash
cd functions
npm run serve
```

This starts the emulator at http://localhost:5001

### Set Environment Variable for Local Testing

Create `functions/.env.local`:
```
FOOTBALL_API_KEY=your_rapidapi_key_here
```

Then call functions using the emulator URL.

## Troubleshooting

### "API key not configured" Error

Run:
```bash
firebase functions:config:set football.apikey="YOUR_KEY"
firebase deploy --only functions
```

### Rate Limit Errors

API-Football free tier limits:
- 100 requests/day
- 10 requests/minute

Consider caching results on client-side or upgrading plan.

### Function Timeout

Default timeout is 60s. If needed, increase in functions/index.js:
```javascript
exports.functionName = functions
  .runWith({ timeoutSeconds: 120 })
  .https.onCall(async (data, context) => { ... });
```

## Security Notes

✅ **API key is stored server-side only** - Never exposed to client
✅ **Functions use HTTPS only** - Encrypted in transit
✅ **CORS automatically handled** - Firebase manages cross-origin requests
✅ **Rate limiting recommended** - Consider implementing request throttling on client

## Cost Estimates

Firebase Functions pricing (Blaze plan):
- First 2M invocations/month: **FREE**
- After that: $0.40 per million invocations
- Compute time: $0.0000025/GB-second

API-Football pricing:
- Free tier: 100 requests/day
- Basic: $0/month (100 requests/day)
- Pro: $30/month (100,000 requests/day)

**Expected costs for typical usage: ~$0-5/month**

## Next Steps

After deploying these functions, you can integrate them into your client-side app to:
1. Let admins search and select their football team
2. Automatically fetch match results
3. Trigger baton handover logic based on match outcomes
