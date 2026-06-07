---
name: deploy-booze
description: Deploy the Booze Baton app to production the correct, safe way — local test, version bump, full deploy, commit, and live verify. Use ONLY when explicitly asked to deploy Booze Baton.
disable-model-invocation: true
---

# Deploy Booze Baton

The safe, in-order deploy ritual for the Booze Baton app. Follow every step — the order matters.

**Firebase project:** `booze-baton` · **Live URL:** https://booze-baton.web.app

---

## Step 1 — Confirm what changed

Run `git status` and `git diff --stat`. Tell the user plainly what's about to ship.

- If **only** front-end files changed (`index.html`, `app.js`, `styles.css`) → a hosting deploy is fine.
- If **auth code or `firestore.rules`** changed → you MUST deploy everything together (Step 4 full deploy). Auth code and rules going live separately can break login for users.

## Step 2 — Test locally (mandatory, never skip)

```bash
firebase serve --only hosting --port 5050 --project booze-baton
```

> Port 5000 is taken by macOS ControlCenter — always use **5050**.

Open http://localhost:5050 and verify the changed feature actually works before going further. For Cloud Functions changes, test with:

```bash
firebase emulators:start --only functions --project booze-baton
```

## Step 3 — Bump the version (for any user-facing change)

Edit `app.js` → update `APP_VERSION` (around line 20) using semantic versioning (major.minor.patch). Skip this only for pure backend/no-visible-change deploys.

## Step 4 — Deploy

Default — deploy everything together (safest, required if auth/rules changed):

```bash
firebase deploy --project booze-baton
```

Front-end-only changes may use a partial deploy, but the deploy-guard hook will block this if `firestore.rules` has uncommitted changes:

```bash
firebase deploy --only hosting --project booze-baton
```

## Step 5 — Commit & push

```bash
git add -A
git commit -m "Deploy: <short summary>  (vX.X.X)"
git push origin main
```

GitHub is the source of truth — always push after a successful deploy.

## Step 6 — Verify live

Open https://booze-baton.web.app, hard-refresh, and confirm:
- The version label shows the new `APP_VERSION`.
- The changed feature works in production.

If something is broken: the previous good version is the last commit on GitHub — `git revert HEAD` and redeploy.

---

**Rollback note:** never leave production broken. If a deploy goes wrong, revert and redeploy before doing anything else.
