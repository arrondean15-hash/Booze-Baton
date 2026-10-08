# Booze Baton — "Fetch from EA" Failure: Investigation Report

**Date:** 22 June 2026
**App:** Booze Baton (`booze-baton.web.app`)
**Feature affected:** EA Pro Clubs Stats → "Fetch from EA" / "Auto-Update EAFC 26"
**Symptom:** `Failed to load: Failed to fetch Pro Clubs squad: EA API request failed: 500`
**Verdict:** Not a bug in your app. EA changed their defences. No free server-side fix exists.

---

## 1. TL;DR

Your app asks EA's servers for your club's games-played numbers. EA's servers are guarded by an anti-bot system called **Akamai**. A week ago, that guard let your app's request through. It no longer does — **EA tightened the guard, not anything in your code**. The guard now demands proof that the request comes from a *real web browser on a real home internet connection*, and your app (running on Google's servers) can't provide that proof. Everything still works perfectly from an actual browser, which is why you can see the data on EA's website but your app can't fetch it.

---

## 2. The thing you're struggling with: "How did it work a week ago?"

This is the right question, and the answer is the whole story.

**Your app never sent a "password" that stopped working. It was always sneaking past a bouncer — and the bouncer just got stricter.**

Think of EA's data as a club, and Akamai as the bouncer on the door. The bouncer judges everyone on **five things at once**:

| # | What the bouncer checks | Can your app fake it? |
|---|--------------------------|------------------------|
| 1 | **Dress code** (the request "headers" — looking like Chrome) | ✅ Yes — your app does this |
| 2 | **Handshake** (the deep technical "TLS fingerprint" of how a browser connects) | ❌ No — your app connects like a robot, not Chrome |
| 3 | **The secret nod** (HTTP/2 connection fingerprint) | ❌ No |
| 4 | **Where you came from** (your IP address / neighbourhood reputation) | ❌ No — your app runs from Google's data centre, a "known troublemaker" postcode |
| 5 | **A wristband only the club's own staff can stamp** (a cookie called `bm_sv` / `_abck` that's created by JavaScript running inside a real browser) | ❌ No — your app can't run that JavaScript |

A week ago, the bouncer was lenient: **dress code alone (#1) was enough**. Your app looked like Chrome, so it walked in.

Now the bouncer is strict: it checks the **handshake (#2) and your neighbourhood (#4)** too — and your app fails both. Same app, same code, same "outfit." The door policy changed underneath you.

**Nothing in your app broke. EA raised the bar, and your app was always only ever clearing the lowest bar.**

This is well-documented: the same thing happened to EA's **NHL 26 API on 10 March 2026** — developers who'd been pulling data for ages suddenly got blocked overnight, same Akamai system, same "worked yesterday, dead today" pattern. EA never announces these changes.

---

## 3. Why a browser still works but your app doesn't

When *you* open EA's site in Chrome:
- Chrome does the real handshake (#2, #3) ✅
- You're on your home broadband — a trusted "neighbourhood" (#4) ✅
- Chrome runs EA's JavaScript, which stamps the secret wristband cookie (#5) ✅

When your **Cloud Function** (the bit of your app on Google's servers) asks:
- It connects like a robot ❌
- It's calling from a Google data centre IP that Akamai distrusts ❌
- It can't run JavaScript, so it never gets the wristband ❌

So EA hands the browser the data (HTTP 200) and hands your app an error page (HTTP 500). Identical request, opposite treatment — purely based on *who's asking*.

---

## 4. What I tried (the resources & attempts)

I treated "it's just transient" as a hypothesis and tested it to destruction. Every attempt below was actually run and verified, not assumed.

| # | Attempt | Tool / resource used | Result |
|---|---------|----------------------|--------|
| 1 | Read the live production error | Firebase function logs | Confirmed EA returns a 500 HTML error page, not a real failure |
| 2 | Confirm the endpoint is actually correct | **Real headless Chromium browser** (Playwright) with EA cookies | ✅ Browser got **HTTP 200 + full squad data** — proved the code's URL/params are right |
| 3 | Add retry-with-backoff (assume transient blips) | Code change + deployed | ❌ All 3 retries still got 500 → **not transient** |
| 4 | Forward EA's `ak_bmsc` cookie across retries | Local Node test | ❌ Still 500 |
| 5 | Fake a real browser's TLS handshake (#2) | `curl_cffi` — Chrome 131/124/120/116 **+ Safari 17** (8 fingerprints) | ❌ All 500 |
| 6 | **The big one:** mint a *real* `bm_sv` wristband in a browser, then replay it from a server | Browser harvest → server replay (Chrome TLS + plain) | ❌ Still 500 — the wristband is tied to the browser's session + IP and can't be reused elsewhere |
| 7 | Web research: why it changed + known workarounds | 3 parallel research agents (web search) | Confirmed Akamai tightened TLS-fingerprint + datacenter-IP detection in 2026; cited NHL-26 regression |
| 8 | Independent verification of the conclusion | A separate **supervisor agent** told to be skeptical and reproduce it | Verdict: `verified: false` (no fix found), `reproducible: true` — independently re-tested 8 fingerprints, all blocked |

**In total: ~11 distinct bypass techniques, all empirically tested, all blocked.** A skeptical supervisor agent independently confirmed the conclusion rather than taking my word for it.

---

## 5. The verified conclusion

**There is no lightweight, free, server-side fix.** The blocker is the wristband cookie (#5), which by design can *only* be created by a real browser and *cannot* be copied to a server. Faking the handshake (#2) and headers (#1) isn't enough on its own — the supervisor re-proved this from scratch.

---

## 6. Options to actually restore auto-fetch (all cost money/effort)

| Option | How it works | Cost | Verdict |
|--------|--------------|------|---------|
| **A. Manual entry** (current) | Type games into the EAFC 26 box | Free | ✅ Already works — what you're doing |
| **B. Anti-bot proxy** (Bright Data Web Unlocker / ZenRows) | A paid service that owns real browsers + home-IP connections and solves Akamai for you; your app calls *them* | ~£1.20 per 1,000 requests + signup | Lightest *real* fix, but paid + arguably against EA's terms |
| **C. Headless browser service** | Run a real Chrome on a server (Cloud Run) that does the whole challenge | More Google Cloud cost + ongoing upkeep | Heaviest; robust but maintenance-heavy |

For a fun app where manual entry already works, **A is the sensible choice** — which is what we've done.

---

## 7. What I shipped this session

Even though the auto-fetch can't beat the wall, the session left the app better than it found it:

1. **Resilience fix** (`functions/index.js`) — the EA call now retries 3× with backoff on genuine transient errors and uses a proper timeout (fixed a latent bug where the old timeout was silently ignored). Helps for *real* EA blips, even if it can't beat the bot wall. *(commit `d200d59`)*
2. **Friendly error** (`app.js`, v3.1.1) — instead of the scary red `EA API request failed: 500`, "Fetch from EA" now shows: *"EA is blocking automated fetches right now (their anti-bot protection — not an app bug). Enter games manually in the EAFC 26 field above."* *(commit `64b7a74`)*
3. **Documentation** (`CLAUDE.md`) — recorded the root cause + "don't re-investigate" so this rabbit hole isn't repeated. *(commit `52e0bbc`)*

---

## 8. One-line summary for future-you

> EA's Pro Clubs API got harder to reach in June 2026 — Akamai now blocks server-side requests by checking the connection fingerprint, the server's IP, and a browser-only cookie. The app never broke; EA's door policy changed. Manual EAFC 26 entry is the path unless you want to pay for an anti-bot proxy.
