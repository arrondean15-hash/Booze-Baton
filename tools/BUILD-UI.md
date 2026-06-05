# Build brief — Booze Baton reconciliation web UI

Goal: a small **local web UI** that makes the existing reconciliation tool visual and
usable — upload the bank statement, see who's paid / owes, download the shareable graphics.
No terminal needed for day-to-day use.

## What already exists (REUSE IT — do not re-derive the logic)

`tools/reconcile.py` is the working engine. Import and call its functions; don't duplicate.
Key functions:
- `token()` → gcloud access token for project `booze-baton`
- `reconcile(csv_path, tok)` → `(rows, debits, balance, unmapped, total_fined)`
  where each `row` = `{player, name, paid, fined, owes}`
- `build_sheet(rows, balance, total_fined)` → writes `~/Downloads/booze-baton-account-summary.png`
- `build_reminder(rows)` → writes `~/Downloads/booze-baton-fines-reminder.png`
- Config dicts `BANK_TO_PLAYER`, `PLAYER_NAMES`, `PAY_TO` at the top.

The HTML/CSS templates for the two PNGs (`_SHEET_TMPL`, `_REMINDER_TMPL`) are also in
reconcile.py — reuse their look (Leeds United theme) for the web UI so it's consistent.

Data model recap (so you don't need the old chat):
- Bank CSV (Lloyds export, `~/Downloads/10560318_*.csv`): columns Transaction Date, Type,
  Sort Code, Account Number, Description (= payer name), Debit, Credit, Balance.
  Credits = money paid in by players; Debits = money out.
- Firestore `fines` (project `booze-baton`): `{playerName, amount, paid, paidDate, date, reason}`.
- Name bridge: bank uses real names, app uses gamertags — mapping is in `BANK_TO_PLAYER`.

## Build

Create `tools/reconcile_app.py` — a **Flask** app (Flask is already used in the Excel
Sifter project; `pip install flask` if missing).

Pages / behaviour:
1. **Home**: Leeds-themed page (reuse colours: bg `#1D3C8D`/`#16307A`, accent `#FFCD00`,
   logo at `../logo.png`). A drag-and-drop / file-picker to upload a bank CSV, plus a
   "use newest in Downloads" button.
2. **Results** (after upload): render IN THE BROWSER
   - The 4 summary cards (Total Paid In, In The Pot Now, Still To Collect, Total Fines).
   - The per-player table: name · paid · fined · difference (owers highlighted red,
     paid-up green). Sorted by owes desc.
   - The "money out" (debits) list for manual review.
   - A warning box if any payer name is unmapped.
3. **Actions**: buttons to "Generate account summary" and "Generate reminder" → call
   `build_sheet` / `build_reminder`, then show the PNG inline and offer a download link.

Run model: `python3 reconcile_app.py` starts the server and prints/opens the local URL
(pick a free port, e.g. 5077 — note macOS ControlCenter occupies 5000). Single user, local
only — no auth needed.

## Constraints
- **Read-only** for v1: do NOT add "mark fines paid" yet (that's a deliberate, confirmed
  Firestore write — keep it as a future phase).
- Don't break the CLI — `reconcile.py` must still work standalone.
- Keep it one file + (optionally) a `templates/` dir; minimal dependencies.
- gcloud must be authed (`gcloud auth login`) — show a friendly error if `token()` fails.

## Done when
Running `python3 tools/reconcile_app.py`, opening the URL, uploading a CSV shows the table +
cards, and both PNGs generate and download. Test it before declaring done.

## Phase 2 ideas (mention, don't build yet)
- "Mark paid" buttons per player (confirmed writes to Firestore, oldest fines first).
- Record ad-hoc adjustments (refunds, cash top-ups not yet on the statement).
- Pay-by date on the reminder.
