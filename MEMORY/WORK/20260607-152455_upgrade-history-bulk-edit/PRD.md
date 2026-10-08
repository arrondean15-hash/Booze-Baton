---
task: Upgrade History tab for easier bulk fine edits
slug: 20260607-152455_upgrade-history-bulk-edit
effort: advanced
phase: complete
progress: 32/32
mode: interactive
started: 2026-06-07T15:24:55Z
updated: 2026-06-07T15:24:55Z
---

## Context

Upgrade the History tab so bulk-amending fines (mark paid/unpaid AND delete many
at once) is fast on mobile. A bulk system exists (v2.11.0) but is cumbersome:
must click Refresh first, no bulk delete (per-row Del + confirm each), tiny
checkboxes, non-sticky action bar, sequential writes.

User decisions: (1) ENHANCE the current table (keep filters/search/summary),
add tap-to-select rows, sticky action bar with count+£ total, bulk Delete, and
All/Unpaid/None quick-select chips, auto-load on tab open. (2) Bulk delete guarded
by a single "Are you sure?" confirm.

Frontend-only. Bulk delete loops the existing `deleteFine` cloud function
(`callFunction('deleteFine',{fineId})`) — no Cloud Functions change.

Key anchors: updateHistory render app.js:2443; bulk fns 2880-3073; switchTab 1821
(hook auto-load); refreshHistory 2391 / fetchFullHistory; History markup
index.html:355-431; bulk bar index.html:409; tab-bar fixed bottom h=84px z=100.

### Plan
- index.html: add Delete btn + £ total + select chips to #bulkActionBar; keep Mark All.
- app.js: tap-to-select (toggleRowSelection), bulkDelete(), selectAllVisible/
  selectUnpaidVisible, £-total in updateBulkActionBar, auto-load in switchTab,
  data-paid + row-action class in updateHistory render.
- styles.css: #bulkActionBar fixed above tab-bar; .row-selected highlight.

## Criteria

**Auto-load**
- [x] ISC-1: Opening History auto-loads full fines when cache empty
- [x] ISC-2: Auto-load skipped if cache already populated
- [x] ISC-3: Manual Refresh History button still works
- [x] ISC-4: Auto-load shows no disruptive toast each visit

**Tap-to-select**
- [x] ISC-5: Tapping a fine row toggles its selection
- [x] ISC-6: Selected row shows a visual highlight
- [x] ISC-7: Tapping Paid/Unpaid button does not toggle selection
- [x] ISC-8: Tapping Delete button does not toggle selection
- [x] ISC-9: Row checkbox reflects selection state
- [x] ISC-10: No double-toggle between checkbox and row click

**Sticky bar + totals**
- [x] ISC-11: Bulk action bar fixed/sticky on screen
- [x] ISC-12: Bar shows count of selected fines
- [x] ISC-13: Bar shows GBP total of selected fines
- [x] ISC-14: Bar hidden when zero selected
- [x] ISC-15: Bar sits above the bottom tab bar, no overlap

**Quick-select chips**
- [x] ISC-16: All chip selects all visible rows
- [x] ISC-17: Unpaid chip selects only visible unpaid rows
- [x] ISC-18: None chip clears selection

**Bulk delete**
- [x] ISC-19: Bulk bar has a Delete button
- [x] ISC-20: Bulk delete shows Are-you-sure confirm first
- [x] ISC-21: Cancelling the confirm deletes nothing
- [x] ISC-22: Confirming deletes each selected via deleteFine
- [x] ISC-23: After delete selection clears and history refreshes
- [x] ISC-24: Delete count reported in success toast

**Existing ops preserved**
- [x] ISC-25: Bulk Mark Paid still works (date modal)
- [x] ISC-26: Bulk Mark Unpaid still works

**Mobile / quality**
- [x] ISC-27: Row tap target usable on mobile
- [x] ISC-28: No JS console errors on History load
- [x] ISC-29: Version minor-bumped + LAST_UPDATED set

**Anti-criteria**
- [x] ISC-A1: Filters / search / summary still function
- [x] ISC-A2: No Cloud Functions changed (frontend-only)
- [x] ISC-A3: deleteAllFines super-admin gating untouched

## Decisions

- Bulk delete reuses `callFunction('deleteFine',{fineId})` in a loop — no new
  Cloud Function, keeps it frontend-only (no functions deploy).
- Checkbox set `pointer-events:none` so the row owns all selection state — kills
  the double-toggle class of bug. Action buttons tagged `.row-action`; the row
  handler bails via `event.target.closest('.row-action')`.
- Sticky bar `position:fixed; bottom:96px` (above 84px tab bar); z-index raised
  95→105 (above tab bar's 100, below modals 1000+) per booze-reviewer.

## Verification

Live `:5050` (Playwright, auth-gated so rows injected matching real render markup):
- 0 console errors on load (ISC-28).
- Row tap → count 1, bar flex, row highlighted, £ total renders (ISC-5,6,12,13,14).
- Action-button tap → no selection change, bar hidden (ISC-7,8).
- Unpaid chip → selects only the 2 unpaid rows (ISC-17). All→3, None→0, bar hidden (ISC-16,18).
- Sticky bar computed `position:fixed; bottom:96px` above tab bar (ISC-11,15).
booze-reviewer verdict SHIP: confirmed no regression in bulk Paid/Unpaid (ISC-25,26),
autoLoadHistory double-guarded so no repeat Firestore reads / loop (ISC-1,2,3),
bulkDelete correct CF+param+try/catch (ISC-19-24), all handlers window-exposed (ISC-10),
deleteAllFines gating untouched (ISC-A3). Two non-blocking fixes applied (z-index, refresh label).
Filters/search/summary markup untouched (ISC-A1). Version v3.1.0 (ISC-29).
Note: full interactive delete + £-sum-from-real-data need a logged-in manual pass (auth gate blocks automation).
