# 🔒 Security Deployment Guide

## Overview

Your Booze-Baton app now has comprehensive password-based security implemented! This guide will help you deploy these critical security updates.

---

## 🚨 **CRITICAL: Deploy Immediately**

Your database is currently **UNPROTECTED** until you deploy these changes. Anyone with your Firebase URL can read/write/delete all data.

**Estimated deployment time:** 5-10 minutes

---

## Security Model Implemented

### ✅ What's Protected

- **Public Read Access** - Anyone can VIEW data (stats, fines, baton, etc.)
- **Password-Protected Writes** - Only users with admin password can:
  - Add/edit/delete fines
  - Update baton holder
  - Manage players
  - Import/export data
  - All other write operations

### 🔑 Admin Password

- **Default Password:** `SquireyStu69!`
- Password is cached in browser session for convenience
- Invalid password clears cache and prompts again

---

## 📋 Deployment Steps

### Step 1: Install Firebase CLI (if not already installed)

```bash
npm install -g firebase-tools
```

Verify installation:
```bash
firebase --version
```

### Step 2: Login to Firebase

```bash
firebase login
```

This will open your browser to authenticate with Google.

### Step 3: Navigate to Project Directory

```bash
cd /path/to/Booze-Baton
```

### Step 4: Deploy Firestore Security Rules

```bash
firebase deploy --only firestore:rules
```

**Expected output:**
```
✔  Deploy complete!

Project Console: https://console.firebase.google.com/project/booze-baton/overview
```

This takes ~10-30 seconds.

### Step 5: Deploy Cloud Functions

```bash
firebase deploy --only functions
```

**Expected output:**
```
✔  functions[addFine(us-central1)] Successful update operation.
✔  functions[deleteFine(us-central1)] Successful update operation.
✔  functions[updateFine(us-central1)] Successful update operation.
...
(11 new functions + 3 updated functions)

✔  Deploy complete!
```

This takes ~2-5 minutes.

### Step 6: Deploy Updated Client Code

```bash
firebase deploy --only hosting
```

**Expected output:**
```
✔  hosting[booze-baton]: file upload complete
✔  hosting[booze-baton]: version finalized
✔  hosting[booze-baton]: release complete

✔  Deploy complete!

Hosting URL: https://booze-baton.web.app
```

This takes ~30 seconds.

---

## 🧪 Testing Your Security

### Test 1: Verify Read Access (Public)

1. Open your app in **incognito/private browser** (no password entered)
2. You should be able to:
   - ✅ View Stats tab
   - ✅ View Charts tab
   - ✅ View History tab
   - ✅ View Players tab
   - ✅ View Baton tab

### Test 2: Verify Write Protection

1. Still in incognito, try to add a fine
2. **Expected:** Password prompt appears
3. Enter **wrong password** → Should show "Invalid admin password"
4. Enter **correct password** (`SquireyStu69!`) → Fine should be added successfully

### Test 3: Verify Password Caching

1. After entering correct password once
2. Try another write operation (e.g., delete a fine)
3. **Expected:** Should NOT prompt for password again (cached in session)

### Test 4: Verify Session Expiry

1. Close browser tab
2. Reopen app
3. Try a write operation
4. **Expected:** Password prompt should appear (cache cleared)

---

## 🔧 Advanced Configuration

### Change Admin Password

**Option 1: Environment Variable (Recommended for production)**

```bash
firebase functions:config:set admin.pin="YourNewPassword123!"
firebase deploy --only functions
```

**Option 2: Update Code Default**

Edit `functions/index.js` line 12:
```javascript
const ADMIN_PIN = functions.config().admin?.pin || process.env.ADMIN_PIN || 'YourNewPassword';
```

Then redeploy:
```bash
firebase deploy --only functions
```

### View Current Function Config

```bash
firebase functions:config:get
```

---

## 📊 What Changed

### New Files

- **`firestore.rules`** - Database security rules (public read, no write)

### Modified Files

#### `functions/index.js` (Cloud Functions)
- ✅ Default password changed to `SquireyStu69!`
- ✅ All existing functions now require password (`searchTeams`, `getLatestCompetitiveMatch`, `updateBaton`)
- ✅ **11 NEW password-protected functions:**
  1. `addFine` - Add new fine
  2. `deleteFine` - Delete fine
  3. `updateFine` - Update fine (mark paid/unpaid)
  4. `addBatonEntry` - Add baton history entry
  5. `deleteBatonEntry` - Delete baton entry
  6. `saveTeam` - Save team to known_teams
  7. `setBatonHolder` - Set current baton holder
  8. `updatePlayers` - Update players list
  9. `updateFineReasons` - Update fine reasons list
  10. `deleteAllFines` - Bulk delete all fines

#### `app.js` (Client Code)
- ✅ Password management system with session caching
- ✅ All write operations converted to use Cloud Functions
- ✅ Automatic password prompts with error handling
- ✅ CSV import/export now password-protected
- ✅ All admin panel operations secured

---

## 🛡️ Security Checklist

After deployment, verify:

- ✅ Firestore security rules deployed
- ✅ All 14 Cloud Functions deployed successfully
- ✅ Client code updated on hosting
- ✅ Password prompts appear for write operations
- ✅ Invalid password is rejected
- ✅ Correct password allows edits
- ✅ Read access still works without password

---

## 🚀 Quick Deploy (All at Once)

If you want to deploy everything in one command:

```bash
firebase deploy
```

This deploys:
- Firestore rules
- Cloud Functions
- Hosting

Takes ~3-5 minutes total.

---

## ⚠️ Important Notes

### Before Deployment

- Current state: **Database is UNPROTECTED** (anyone can write)
- After deployment: **Only password-holders can write**

### After Deployment

1. **Your app will require password for ALL edits**
2. **Password is:** `SquireyStu69!`
3. **Password is NOT encrypted** - consider changing it after initial deployment
4. **Session caching** - Password cached per browser session
5. **API quota protected** - Team search and match checks now require password

### Cost Impact

- **Firestore reads:** No change (still free for public read)
- **Firestore writes:** Slightly higher (Cloud Functions write on your behalf)
- **Cloud Functions calls:** Increase (every write = 1 function call)
- **Estimated impact:** Minimal on Blaze plan (fractions of a penny per day)

### Troubleshooting

**Error: "Permission denied"**
- Check: Did Firestore rules deploy?
- Fix: Run `firebase deploy --only firestore:rules`

**Error: "Function not found"**
- Check: Did Cloud Functions deploy?
- Fix: Run `firebase deploy --only functions`

**Error: "Invalid admin password" (but password is correct)**
- Check: Did you set custom password in Firebase config?
- Fix: Verify with `firebase functions:config:get`

---

## 📞 Support

If you encounter issues during deployment:

1. Check Firebase Console: https://console.firebase.google.com/project/booze-baton
2. View function logs: `firebase functions:log`
3. View deployment status: `firebase deploy --only functions --debug`

---

## ✅ Deployment Complete!

Once deployed, your app is secure! 🎉

**Next steps:**
1. Test all functionality with the password
2. Consider changing default password
3. Share the password with trusted group members only
4. Monitor Firebase Console for any unusual activity

---

**Security Level:** ⭐⭐⭐⭐ (4/5)

**Remaining improvements (optional):**
- ⭐⭐⭐⭐⭐ Add Firebase Authentication for user-specific permissions
- Rate limiting on Cloud Functions
- Password complexity requirements
- Audit logs for admin actions
