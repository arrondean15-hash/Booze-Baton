---
task: Scaffold standalone baton-tracker app project
slug: 20260608-131429_baton-tracker-new-app-scaffold
effort: advanced
phase: complete
progress: 33/33
mode: interactive
started: 2026-06-08T13:14:29+0100
updated: 2026-06-08T13:14:29+0100
---

## Context

Spin the **baton mechanic out of Booze Baton into its own standalone web app** at
`~/Documents/Claude/Projects/booze-baton-only`. Booze Baton is a fines/voting/EA-Pro-Clubs
tracker for a gaming group; the baton is one feature inside it. The user wants ONLY the baton:
a real football team "holds" the baton, and after each competitive match it either stays
(win/draw) or passes to the team that beat them (loss). Everything else — fines, dailyVotes,
EA Pro Clubs, super-admin, Leeds theme — is left behind.

**Decided (via AskUserQuestion):**
- Scope: full standalone, deployable web app (UI: current holder, history, check-result, set-holder)
- Stack: vanilla JS + Firebase (Functions/Firestore/Hosting) + API-Football — same proven stack as Booze Baton
- Location/name: `~/Documents/Claude/Projects/booze-baton-only`
- Use `/claude-code-setup` (claude-automation-recommender) to recommend Claude Code config

**Requested:** clean baton-only extraction, faithful rules, working scaffold, Claude setup.
**Not requested:** any fines/voting/proclubs/superadmin code; modifying the original project.

### Source of truth (faithful extraction targets)
- `updateBaton` (functions/index.js:283-479) — loss-only transfer, friendly filter, anti-dup
- `setBatonHolder` (686-707), `searchTeams` (145-182), `getLatestCompetitiveMatch` (193-268)
- helpers: `verifyAuth`, `verifySuperAdmin`(drop), `handleCors`, `sendResponse/sendError`, `callFootballAPI`

### Risks
- API-Football needs a paid key — app must run/scaffold without it, failing gracefully
- CORS origins are hardcoded to booze-baton domains — must be re-pointed to new project
- Firebase project id is a placeholder until user creates the real project — don't fake a deploy

### Plan
1. Create folder + git + gitignore + README/CLAUDE docs
2. Backend: stripped functions/index.js (baton-only) + package.json
3. Frontend: index.html + styles.css + app.js (auth gate, holder card, history, check, set-holder)
4. Firebase config: firebase.json, firestore.rules, .firebaserc (placeholder project id)
5. Invoke claude-code-setup skill → write .claude/ config
6. /simplify pass, then VERIFY each ISC

## Criteria

Project & docs:
- [x] ISC-1: Project folder exists at ~/Documents/Claude/Projects/booze-baton-only
- [x] ISC-2: Git repository initialized in the new folder
- [x] ISC-3: .gitignore excludes node_modules and firebase caches
- [x] ISC-4: README.md documents the baton transfer rules
- [x] ISC-5: CLAUDE.md documents stack, structure, deploy flow

Frontend HTML:
- [x] ISC-6: index.html has current-holder card element
- [x] ISC-7: index.html has history timeline container
- [x] ISC-8: index.html has check-latest-result button
- [x] ISC-9: index.html has set-holder team search form
- [x] ISC-10: index.html loads Firebase SDK and app.js
- [x] ISC-11: styles.css present and linked from index.html

Frontend JS:
- [x] ISC-12: app.js initializes Firebase with config placeholder
- [x] ISC-13: app.js implements Google sign-in auth gate
- [x] ISC-14: app.js renders current holder from baton_current
- [x] ISC-15: app.js renders baton_history timeline newest-first
- [x] ISC-16: app.js triggers updateBaton via callFunction helper
- [x] ISC-17: app.js wires searchTeams plus setBatonHolder flow

Backend:
- [x] ISC-18: functions/index.js exports updateBaton with loss-only transfer
- [x] ISC-19: updateBaton filters friendlies by name and league 667
- [x] ISC-20: updateBaton has lastProcessedMatchId anti-duplicate check
- [x] ISC-21: functions/index.js exports setBatonHolder
- [x] ISC-22: functions/index.js exports searchTeams
- [x] ISC-23: functions/index.js exports getBaton reading current and history
- [x] ISC-24: functions/index.js contains no fines/voting/proclubs/superadmin code
- [x] ISC-25: functions/package.json declares firebase deps and node 20
- [x] ISC-26: functions verifyAuth handleCors and helpers present

Firebase config:
- [x] ISC-27: firebase.json configures hosting and functions
- [x] ISC-28: firestore.rules auth-gated reads function-only writes
- [x] ISC-29: .firebaserc present with project id placeholder
- [x] ISC-30: CORS origins re-pointed off booze-baton domains

Claude setup:
- [x] ISC-31: claude-code-setup skill invoked via Skill tool
- [x] ISC-32: .claude config created from skill recommendations
- [x] ISC-33: /simplify invoked on produced code

Anti-criteria:
- [x] ISC-A1: Existing booze-baton-app project files unchanged
- [x] ISC-A2: No fines/dailyVotes/proClubs collections referenced

## Decisions

- Host from `public/` (Firebase default) rather than Booze Baton's root-hosting — cleaner fresh project.
- Kept Google Sign-In + `onRequest`+Bearer pattern for parity with the user's proven stack.
- Backend kept to 5 functions; dropped verifySuperAdmin and all fines/voting/proclubs code.
- `.firebaserc` + `firebaseConfig` + `FUNCTIONS_BASE` left as `REPLACE_ME` placeholders — user must
  create their own Firebase project + API-Football key before deploy (documented in README).
- /simplify: applied dedup of latest-match fetch, parallel getBaton reads, dropped escapeAttr.
  Skipped `withAuth` wrapper and `buildHolderDoc` (explicit form is clearer for a teachable scaffold;
  move-vs-manual holder logic genuinely differs).

## Verification

All 33 ISC + 2 anti-criteria verified:
- Folder/git/files: repo at booze-baton-only, 2 commits, full tree present (ISC-1..5)
- Frontend: index.html has holder card, history list, check button, set-holder form, Firebase SDK +
  app.js + styles.css linked; app.js does auth gate, renders holder/history, calls updateBaton +
  searchTeams + setBatonHolder (ISC-6..17) — verified by grep + node -c syntax OK
- Backend: 5 exports confirmed (getBaton, updateBaton, setBatonHolder, searchTeams,
  getLatestCompetitiveMatch); loss-only transfer (batonMoved=true only in else), friendly filter
  (name + league 667), anti-dup lastProcessedMatchId; package.json node 20; helpers present (ISC-18..26)
- Config: firebase.json hosting+functions, firestore.rules auth-read/function-write, .firebaserc
  placeholder, CORS re-pointed to booze-baton-only domains (ISC-27..30)
- Claude setup: claude-code-setup skill invoked; .claude/{settings.json, agents/security-reviewer.md,
  skills/deploy/SKILL.md} created; /simplify invoked with 4 agents (ISC-31..33)
- Anti: original booze-baton-app untouched; grep confirms zero fines/dailyVotes/proClubs refs (ISC-A1,A2)
