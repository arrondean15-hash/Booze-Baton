# Team ID Finder - Admin Guide

This guide explains how to use the Team ID Finder admin utility to search for football teams and set the baton holder.

## Overview

The Team ID Finder allows you to:
1. Search for football clubs using API-Football
2. Save teams to the `known_teams` collection
3. Set the current baton holder with their Team ID

## Accessing the Admin Panel

### Location
Settings Tab → **🔐 Admin: Team ID Finder** (at the bottom)

### Unlock with PIN

1. Navigate to Settings tab
2. Scroll to "Admin: Team ID Finder" section
3. Enter the 4-digit admin PIN (default: `1234`)
4. Click "🔓 Unlock"

**Security Note:** Change the default PIN in two places:
1. Client-side: `app.js` line ~102: `const ADMIN_PIN = '1234';`
2. Server-side (optional): `firebase functions:config:set admin.pin="YOUR_PIN"`

## How to Use

### 1. Search for a Team

**Steps:**
1. Unlock the admin panel with PIN
2. Enter a team name in "Search Football Club" input
   - Examples: "Leeds United", "Arsenal", "Real Madrid", "Barcelona"
3. Click "🔍 Search Teams"

**What happens:**
- Calls the `searchTeams` Cloud Function securely
- Returns teams matching your query
- Shows team logo, name, country, city, and **Team ID**

**Example Results:**
```
🏴 Leeds United
England • Leeds
Team ID: 1845

[💾 Save Team] [🎯 Set as Holder]
```

### 2. Save to Known Teams

**Purpose:** Build a database of teams for future reference

**Steps:**
1. Search for a team (see above)
2. Click "💾 Save Team" on the desired result

**What happens:**
- Saves to Firestore: `known_teams/<teamId>`
- Document structure:
  ```json
  {
    "teamId": 1845,
    "teamName": "Leeds United",
    "country": "England",
    "city": "Leeds",
    "logo": "https://...",
    "createdAt": "2024-01-18T12:30:00.000Z"
  }
  ```

**Note:** Uses `teamId` as document ID to prevent duplicates

### 3. Set as Current Baton Holder

**Purpose:** Designate which team currently holds the baton

**Steps:**
1. Search for a team (see above)
2. Click "🎯 Set as Holder" on the desired result
3. Confirm in the popup dialog

**What happens:**
- Updates Firestore: `baton_current/holder`
- Document structure:
  ```json
  {
    "holderTeamId": 1845,
    "holderTeamName": "Leeds United",
    "holderCountry": "England",
    "holderCity": "Leeds",
    "holderLogo": "https://...",
    "lastUpdatedAt": "2024-01-18T12:30:00.000Z",
    "updatedBy": "admin"
  }
  ```
- **Also automatically saves the team to `known_teams`**

## Common Use Cases

### Initial Setup: Set Your Club as Baton Holder

1. Unlock admin panel
2. Search for your club: e.g., "Leeds United"
3. Click "🎯 Set as Holder" on the correct result
4. Confirm

✅ Your club is now the baton holder!

### Adding Multiple Teams

If you want to pre-populate known teams:

1. Search for "Arsenal" → Click "💾 Save Team"
2. Search for "Liverpool" → Click "💾 Save Team"
3. Search for "Chelsea" → Click "💾 Save Team"
4. etc.

This builds your `known_teams` collection for future use.

### Changing Baton Holder Manually

If you want to manually move the baton (e.g., for testing):

1. Search for the new holder team
2. Click "🎯 Set as Holder"
3. Confirm

The baton is now held by the new team.

## Firestore Structure Reference

### Collection: `known_teams`

**Document ID:** `{teamId}` (e.g., `"1845"`)

**Fields:**
```json
{
  "teamId": 1845,
  "teamName": "Leeds United",
  "country": "England",
  "city": "Leeds",
  "logo": "https://media.api-sports.io/football/teams/1845.png",
  "createdAt": "2024-01-18T12:30:00.000Z"
}
```

**Purpose:** Database of all saved football teams

### Document: `baton_current/holder`

**Fields:**
```json
{
  "holderTeamId": 1845,
  "holderTeamName": "Leeds United",
  "holderCountry": "England",
  "holderCity": "Leeds",
  "holderLogo": "https://...",
  "lastUpdatedAt": "2024-01-18T12:30:00.000Z",
  "updatedBy": "admin"
}
```

**Purpose:** Stores the current baton holder

## Security

### Client-Side PIN Protection

**Location:** `app.js` line ~102
```javascript
const ADMIN_PIN = '1234'; // CHANGE THIS
```

**To change:**
1. Edit `app.js`
2. Update the PIN value
3. Redeploy: `firebase deploy --only hosting`

### Server-Side PIN (Optional)

For additional security, set PIN in Cloud Functions:

```bash
firebase functions:config:set admin.pin="YOUR_SECURE_PIN"
firebase deploy --only functions
```

This ensures even if someone bypasses client-side, server validates PIN.

### Firestore Security Rules (Recommended)

Add rules to restrict who can write to `baton_current` and `known_teams`:

```javascript
match /known_teams/{teamId} {
  allow read: if true;
  allow write: if request.auth != null && request.auth.uid == 'YOUR_ADMIN_UID';
}

match /baton_current/holder {
  allow read: if true;
  allow write: if request.auth != null && request.auth.uid == 'YOUR_ADMIN_UID';
}
```

Replace `YOUR_ADMIN_UID` with your Firebase Auth user ID.

## Troubleshooting

### "Error searching teams" Message

**Cause:** Cloud Functions not deployed or API key not set

**Fix:**
1. Deploy functions: `firebase deploy --only functions`
2. Set API key: `firebase functions:config:set football.apikey="YOUR_KEY"`
3. Redeploy: `firebase deploy --only functions`

### No Teams Found

**Causes:**
- Team name spelling incorrect
- Team not in API-Football database
- API rate limit exceeded (100/day on free tier)

**Try:**
- Different spellings: "Man United" vs "Manchester United"
- Official club names: "Arsenal FC" vs "Arsenal"
- Check API-Football database at https://www.api-football.com/

### Cannot Unlock Admin Panel

**Cause:** Wrong PIN

**Fix:**
- Check PIN in `app.js` line ~102
- Default PIN is `1234`
- If you changed it, use your custom PIN

## Next Steps

After setting the baton holder:
1. Implement automatic match result checking
2. Trigger baton handover based on win/loss
3. Add baton history tracking
4. Send notifications when baton moves

## Example Workflow

**Scenario:** Set up Leeds United as initial baton holder

1. Go to Settings tab
2. Scroll to "Admin: Team ID Finder"
3. Enter PIN: `1234`
4. Click "🔓 Unlock"
5. Type "Leeds United" in search box
6. Click "🔍 Search Teams"
7. Find correct result:
   ```
   Leeds United
   England • Leeds
   Team ID: 1845
   ```
8. Click "🎯 Set as Holder"
9. Confirm popup
10. ✅ Success! Leeds United is now the baton holder

**Verify in Firestore Console:**
- Collection: `baton_current`
- Document: `holder`
- Field: `holderTeamName` = "Leeds United"

## API Credits

- Uses API-Football via RapidAPI
- Free tier: 100 requests/day
- Each search = 1 request
- Plan accordingly for heavy usage
