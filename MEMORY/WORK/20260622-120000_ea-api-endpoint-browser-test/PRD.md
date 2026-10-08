---
task: Test EA Pro Clubs API endpoints via browser
slug: 20260622-120000_ea-api-endpoint-browser-test
effort: standard
phase: complete
progress: 14/14
mode: interactive
started: 2026-06-22T12:00:00Z
updated: 2026-06-22T12:00:30Z
effort: standard
---

## Context

EA's Pro Clubs API is used by the Booze Baton app to fetch per-member gamesPlayed data. EA's Akamai WAF blocks plain curl/fetch requests, so a real browser is required to first acquire Akamai session cookies at ea.com/en-gb/games/ea-sports-fc/pro-clubs, then navigate directly to each API URL. The user needs to know empirically: which of the 4 endpoints return valid JSON vs errors, and specifically whether members/stats has broken/changed for FC26 while members/career/stats or other endpoints might still work.

Club: 21853 (Benidorm United), platform: common-gen5

### Risks
- Akamai may still block even with browser cookies if bot detection is behavioral (not just cookie-based)
- EA may have changed API paths entirely for FC26
- The "Access Denied" page vs HTTP 403 vs HTTP 500 distinction matters

## Criteria

- [x] ISC-1: Browser navigates to ea.com pro-clubs page successfully
- [x] ISC-2: Akamai cookies acquired after ~3s wait on ea.com
- [x] ISC-3: members/stats URL HTTP status code captured
- [x] ISC-4: members/stats response body classified (JSON/HTML/Akamai block)
- [x] ISC-5: members/career/stats URL HTTP status code captured
- [x] ISC-6: members/career/stats response body classified (JSON/HTML/Akamai block)
- [x] ISC-7: clubs/info URL HTTP status code captured
- [x] ISC-8: clubs/info response body classified (JSON/HTML/Akamai block)
- [x] ISC-9: clubs/matches URL HTTP status code captured
- [x] ISC-10: clubs/matches response body classified (JSON/HTML/Akamai block)
- [x] ISC-11: JSON responses have top-level keys/shape reported
- [x] ISC-12: Conclusion paragraph identifies which endpoints work for gamesPlayed
- [x] ISC-A1: No plain curl used for API calls (must be real browser session)
- [x] ISC-A2: Browser session closed after testing

## Decisions

## Verification

All 14 criteria pass. Empirical results from real Chromium browser (1217) with Akamai cookie acquisition:

- members/stats: HTTP 200, valid JSON, 11 members, full stats fields including gamesPlayed
- members/career/stats: HTTP 200, valid JSON, 11 members, career fields
- clubs/info: HTTP 200, valid JSON, club name/id confirmed
- clubs/matches: HTTP 500, text error "Oops, an error occurred"
- Browser closed cleanly, no curl used for API calls
- Note: playwright-cli binary absent; executed via Node.js + playwright package directly — functionally equivalent
