#!/usr/bin/env python3
"""
Booze Baton — bank CSV vs app-fines reconciliation.

Reconciles a Lloyds bank-statement CSV (money paid in by players) against the
live Firestore `fines` data (what each player was fined), and reports paid /
fined / difference per person plus a pot reconciliation. Optionally regenerates
the shareable summary sheet and group-chat reminder PNGs.

USAGE
  python3 reconcile.py                     # uses newest ~/Downloads/10560318_*.csv
  python3 reconcile.py path/to/export.csv  # use a specific statement
  python3 reconcile.py --sheet             # also build the account summary PNG
  python3 reconcile.py --reminder          # also build the group-chat reminder PNG
  python3 reconcile.py --sheet --reminder  # build both

REQUIREMENTS
  - gcloud authed to project `booze-baton` (the script uses
    `gcloud auth print-access-token`). If it errors, run: gcloud auth login
  - Google Chrome (only needed for --sheet / --reminder).

NOTES
  - Read-only against Firestore. It never marks fines paid — that stays a
    deliberate, confirmed step (ask Claude: "mark X's fines paid").
  - "Paid in" = bank credits in the CSV. Cash/top-ups paid AFTER the export
    won't show until they appear in a fresh statement.
  - If a new member starts paying, add them to BANK_TO_PLAYER + PLAYER_NAMES.
"""
import sys, os, csv, json, glob, subprocess, urllib.request, collections

PROJECT = "booze-baton"
HERE = os.path.dirname(os.path.abspath(__file__))
LOGO = os.path.join(HERE, "..", "logo.png")
OUT = os.path.expanduser("~/Downloads")

# --- CONFIG: bank statement name (UPPER substring) -> app playerName (gamertag) ---
BANK_TO_PLAYER = {
    "A DEAN":           "Le Dump",
    "DANNY ROWE":       "Erik Eriksson",
    "CHARLIE SKELDING": "Fredu",
    "HOMER":            "J3",
    "GLENN HALL":       "Narreh",
    "BIRDSALL":         "Edu",
    "ADAM BILYJ":       "Jim Blackpool",
    "ASHLEY JACKSON":   "Ash",
}
# app playerName -> nice display name (for the table + graphics)
PLAYER_NAMES = {
    "Le Dump": "Arron Dean", "Erik Eriksson": "Danny Rowe", "Fredu": "Charlie Skelding",
    "J3": "Jack Homer", "Narreh": "Glenn Hall", "Edu": "Matty Birdsall",
    "Jim Blackpool": "Adam Bilyj", "Ash": "Ashley Jackson",
}
PAY_TO = "Sort 11-00-01 · Acc 10560318"   # shown on the reminder graphic


def token():
    try:
        return subprocess.check_output(
            ["gcloud", "auth", "print-access-token", "--project", PROJECT],
            stderr=subprocess.DEVNULL).decode().strip()
    except Exception:
        sys.exit("ERROR: could not get a gcloud token. Run:  gcloud auth login")


def firestore(collection, tok):
    docs, page = [], None
    base = (f"https://firestore.googleapis.com/v1/projects/{PROJECT}"
            f"/databases/(default)/documents/{collection}?pageSize=300")
    while True:
        url = base + (f"&pageToken={page}" if page else "")
        req = urllib.request.Request(url, headers={"Authorization": f"Bearer {tok}"})
        d = json.load(urllib.request.urlopen(req))
        docs += d.get("documents", [])
        page = d.get("nextPageToken")
        if not page:
            return docs


def fval(fields, key, default=None):
    v = fields.get(key)
    if not v:
        return default
    if "integerValue" in v: return int(v["integerValue"])
    if "doubleValue" in v:  return float(v["doubleValue"])
    if "booleanValue" in v: return v["booleanValue"]
    if "stringValue" in v:  return v["stringValue"]
    return default


def find_csv(args):
    paths = [a for a in args if a.endswith(".csv")]
    if paths:
        return paths[0]
    hits = sorted(glob.glob(os.path.join(OUT, "10560318_*.csv")), key=os.path.getmtime)
    if not hits:
        sys.exit("ERROR: no CSV given and none matching ~/Downloads/10560318_*.csv")
    return hits[-1]


def reconcile(csv_path, tok):
    # --- bank side ---
    paid = collections.defaultdict(float)
    debits, balance, unmapped = [], None, set()
    with open(csv_path, encoding="latin-1") as f:
        for r in csv.DictReader(f):
            desc = r["Transaction Description"].strip()
            credit = r["Credit Amount"].strip()
            debit = r["Debit Amount"].strip()
            if r["Balance"].strip() and balance is None:
                balance = float(r["Balance"])     # first row = most recent
            if credit:
                up = desc.upper()
                hit = next((p for k, p in BANK_TO_PLAYER.items() if k in up), None)
                if hit:
                    paid[hit] += float(credit)
                else:
                    unmapped.add(desc)
            if debit:
                debits.append((r["Transaction Date"], desc, float(debit)))

    # --- app side ---
    fined = collections.defaultdict(float)
    for doc in firestore("fines", tok):
        fl = doc["fields"]
        fined[fval(fl, "playerName", "?")] += (fval(fl, "amount", 0) or 0)

    players = sorted(set(list(paid) + list(PLAYER_NAMES)),
                     key=lambda p: -(fined.get(p, 0) - paid.get(p, 0)))
    rows = []
    for p in players:
        if p not in PLAYER_NAMES:
            continue
        rows.append(dict(player=p, name=PLAYER_NAMES[p],
                         paid=paid.get(p, 0.0), fined=fined.get(p, 0.0),
                         owes=fined.get(p, 0.0) - paid.get(p, 0.0)))
    return rows, debits, balance, list(unmapped), sum(fined.values())


def print_report(rows, debits, balance, unmapped, total_fined, csv_path):
    print(f"\n  BOOZE BATON RECONCILIATION   ({os.path.basename(csv_path)})")
    print("  " + "=" * 56)
    print(f"  {'Player':<18}{'paid in':>9}{'fined':>9}{'difference':>13}")
    print("  " + "-" * 56)
    to_collect = 0.0
    for r in rows:
        if r["owes"] > 0.005:
            diff = f"owes £{r['owes']:.2f}"; to_collect += r["owes"]
        elif r["owes"] < -0.005:
            diff = f"£{-r['owes']:.2f} credit"
        else:
            diff = "paid up ✓"
        print(f"  {r['name']:<18}{r['paid']:>9.2f}{r['fined']:>9.2f}{diff:>13}")
    print("  " + "-" * 56)
    tp, tf = sum(r["paid"] for r in rows), sum(r["fined"] for r in rows)
    print(f"  {'TOTALS':<18}{tp:>9.2f}{tf:>9.2f}{'owed £%.2f' % to_collect:>13}")
    print(f"\n  Total fines issued ........ £{total_fined:,.2f}")
    if balance is not None:
        print(f"  In the pot now (balance) .. £{balance:,.2f}")
    print(f"  Still to collect .......... £{to_collect:,.2f}")
    if debits:
        print("\n  MONEY OUT (review — refunds / expenses / errors):")
        for dt, desc, amt in debits:
            print(f"    {dt}  £{amt:>7.2f}  {desc}")
    if unmapped:
        print("\n  ⚠ UNMAPPED payers (add to BANK_TO_PLAYER):")
        for u in unmapped:
            print(f"    - {u}")
    print()
    return to_collect


# ---------------- graphics (optional) ----------------
def _logo_b64():
    import base64
    with open(LOGO, "rb") as f:
        return base64.b64encode(f.read()).decode()


def _render(html, png, w, h):
    open("/tmp/_bb.html", "w").write(html)
    chrome = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
    if not os.path.exists(chrome):
        print("  (Chrome not found — skipping PNG render)"); return
    subprocess.run([chrome, "--headless", "--disable-gpu", "--hide-scrollbars",
                    "--force-device-scale-factor=2", f"--window-size={w},{h}",
                    "--default-background-color=00000000",
                    f"--screenshot={png}", "file:///tmp/_bb.html"],
                   stderr=subprocess.DEVNULL)
    print(f"  ✓ {png}")


def build_sheet(rows, balance, total_fined):
    logo = _logo_b64()
    total_in = sum(r["paid"] for r in rows)
    to_collect = sum(r["owes"] for r in rows if r["owes"] > 0.005)
    bal = balance if balance is not None else total_in
    mx = max((r["paid"] for r in rows), default=1) or 1
    bars = "".join(
        f'<div class="row"><div class="who"><span class="real">{r["name"]}</span>'
        f'<span class="tag">{r["player"]}</span></div><div class="track">'
        f'<div class="fill" style="width:{r["paid"]/mx*100:.1f}%"></div></div>'
        f'<div class="amt">£{r["paid"]:,.2f}</div></div>'
        for r in sorted(rows, key=lambda x: -x["paid"]))
    chips = "".join(
        f'<div class="chip"><span class="cn">{r["name"]}</span>'
        f'<span class="ca">£{r["owes"]:.2f}</span></div>'
        for r in rows if r["owes"] > 0.005)
    html = _SHEET_TMPL.format(logo=logo, total_in=f"{total_in:,.2f}", bal=f"{bal:,.2f}",
                              collect=f"{to_collect:,.2f}", fines=f"{total_fined:,.2f}",
                              bars=bars, chips=chips)
    _render(html, os.path.join(OUT, "booze-baton-account-summary.png"),
            972, 600 + len(rows) * 55)


def build_reminder(rows):
    logo = _logo_b64()
    owers = [r for r in rows if r["owes"] > 0.005]
    square = [r for r in rows if abs(r["owes"]) <= 0.005]
    total = sum(r["owes"] for r in owers)
    ow = "".join(
        f'<div class="orow"><div class="oinfo"><div class="onm">{r["name"]} '
        f'<span class="otag">{r["player"]}</span></div><div class="osub">Paid '
        f'<b>£{r["paid"]:,.2f}</b> &nbsp;·&nbsp; Fines <b>£{r["fined"]:,.2f}</b>'
        f'</div></div><div class="odue"><span class="oamt">£{r["owes"]:,.2f}</span>'
        f'<span class="olab">DUE</span></div></div>' for r in owers)
    sq = "".join(
        f'<div class="srow"><span class="snm">{r["name"]}</span><span class="smid">'
        f'£{r["paid"]:,.2f} paid / £{r["fined"]:,.2f} fines</span>'
        f'<span class="schk">✓ PAID UP</span></div>' for r in square)
    html = _REMINDER_TMPL.format(logo=logo, total=f"{total:,.2f}", n_owe=len(owers),
                                 n_sq=len(square), owers=ow, square=sq, payto=PAY_TO)
    _render(html, os.path.join(OUT, "booze-baton-fines-reminder.png"),
            760, 620 + len(owers) * 72 + len(square) * 32)


_SHEET_TMPL = """<!doctype html><html><head><meta charset="utf-8"><style>
*{{margin:0;padding:0;box-sizing:border-box}}
body{{font-family:-apple-system,"Segoe UI",Helvetica,Arial,sans-serif;background:#0c1f57;padding:36px;width:900px}}
.sheet{{background:linear-gradient(160deg,#1D3C8D,#16307A 55%,#102566);border-radius:22px;overflow:hidden;box-shadow:0 24px 60px rgba(0,0,0,.45);border:1px solid #2E5AB0}}
.hd{{display:flex;align-items:center;gap:18px;padding:26px 32px;border-bottom:2px solid rgba(255,205,0,.35);background:rgba(255,255,255,.03)}}
.hd img{{width:66px;height:66px;object-fit:contain}} .hd .ttl{{flex:1}}
.hd h1{{font-size:30px;font-weight:800;color:#fff}} .hd .sub{{color:#FFCD00;font-size:14px;font-weight:600;margin-top:5px}}
.hd .meta{{text-align:right;color:#aebbe0;font-size:12px;line-height:1.7}} .hd .meta b{{color:#fff}}
.cards{{display:grid;grid-template-columns:repeat(4,1fr);gap:14px;padding:26px 32px 8px}}
.card{{background:rgba(255,255,255,.06);border:1px solid #2E5AB0;border-radius:14px;padding:16px}}
.card .lab{{font-size:11px;text-transform:uppercase;letter-spacing:1px;color:#9fb0dd;font-weight:700}}
.card .val{{font-size:25px;font-weight:800;color:#fff;margin-top:8px}}
.card.in .val{{color:#56e08c}} .card.owe .val{{color:#ff8a8a}}
.card.bal{{background:linear-gradient(160deg,#FFCD00,#f0b400);border:none}}
.card.bal .lab{{color:#5b4500}} .card.bal .val{{color:#16307A}}
.sec{{padding:20px 32px 8px}}
.sec h2{{color:#fff;font-size:15px;font-weight:800;text-transform:uppercase;letter-spacing:1.2px;margin-bottom:14px;display:flex;align-items:center;gap:9px}}
.sec h2::before{{content:"";width:5px;height:16px;background:#FFCD00;border-radius:3px}}
.row{{display:flex;align-items:center;gap:16px;padding:7px 0}}
.who{{width:200px;display:flex;flex-direction:column}} .who .real{{color:#fff;font-weight:700;font-size:14px}}
.who .tag{{color:#8ea3d6;font-size:11px}}
.track{{flex:1;height:13px;background:rgba(255,255,255,.07);border-radius:8px;overflow:hidden}}
.fill{{height:100%;background:linear-gradient(90deg,#3f6fd1,#FFCD00);border-radius:8px}}
.amt{{width:92px;text-align:right;color:#fff;font-weight:800;font-size:15px}}
.btm{{display:grid;grid-template-columns:1fr 1.1fr;gap:18px;padding:14px 32px 28px}}
.box{{background:rgba(255,255,255,.05);border:1px solid #2E5AB0;border-radius:14px;padding:18px 20px}}
.box h3{{color:#FFCD00;font-size:12px;text-transform:uppercase;letter-spacing:1px;font-weight:800;margin-bottom:14px}}
.oline{{display:flex;justify-content:space-between;color:#dfe6f8;font-size:14px;padding:7px 0;border-bottom:1px dashed rgba(255,255,255,.1)}}
.oline b{{color:#fff}} .oline.tot{{border:none;border-top:2px solid rgba(255,205,0,.4);margin-top:4px;padding-top:9px}}
.oline.tot span,.oline.tot b{{color:#FFCD00;font-weight:800;font-size:15px}}
.tick{{margin-top:11px;color:#56e08c;font-size:12px;font-weight:700}}
.chips{{display:flex;flex-wrap:wrap;gap:10px}}
.chip{{background:rgba(255,138,138,.12);border:1px solid rgba(255,138,138,.4);border-radius:10px;padding:9px 13px;display:flex;flex-direction:column;min-width:104px}}
.chip .cn{{color:#ffd5d5;font-size:12px;font-weight:600}} .chip .ca{{color:#fff;font-size:18px;font-weight:800;margin-top:2px}}
.ft{{padding:14px 32px;background:rgba(0,0,0,.18);color:#8ea3d6;font-size:11px;display:flex;justify-content:space-between;border-top:1px solid #2E5AB0}}
</style></head><body><div class="sheet">
<div class="hd"><img src="data:image/png;base64,{logo}"><div class="ttl"><h1>BOOZE BATON</h1>
<div class="sub">Benidorm United · Club Account Summary</div></div>
<div class="meta">Pro Clubs Fines Pot<br><b>Reconciled vs bank ✓</b></div></div>
<div class="cards">
<div class="card in"><div class="lab">Total Paid In</div><div class="val">£{total_in}</div></div>
<div class="card bal"><div class="lab">In The Pot Now</div><div class="val">£{bal}</div></div>
<div class="card owe"><div class="lab">Still To Collect</div><div class="val">£{collect}</div></div>
<div class="card"><div class="lab">Total Fines Issued</div><div class="val">£{fines}</div></div></div>
<div class="sec"><h2>Contributions by Player</h2>{bars}</div>
<div class="btm">
<div class="box"><h3>Reconciliation</h3>
<div class="oline"><span>Total fines issued</span><b>£{fines}</b></div>
<div class="oline"><span>In the pot now</span><b>£{bal}</b></div>
<div class="oline tot"><span>Still to collect</span><b>£{collect}</b></div>
<div class="tick">✓ Paid in − owed reconciled against the bank statement</div></div>
<div class="box"><h3>Still To Pay</h3><div class="chips">{chips}</div></div></div>
<div class="ft"><span>Benidorm United FC · Pro Clubs Fines Pot</span><span>Auto-generated reconciliation</span></div>
</div></body></html>"""


_REMINDER_TMPL = """<!doctype html><html><head><meta charset="utf-8"><style>
*{{margin:0;padding:0;box-sizing:border-box}}
body{{font-family:-apple-system,"Segoe UI",Helvetica,Arial,sans-serif;background:#0c1f57;padding:30px;width:700px}}
.card{{background:linear-gradient(165deg,#1D3C8D,#16307A 60%,#102566);border-radius:22px;overflow:hidden;box-shadow:0 22px 55px rgba(0,0,0,.5);border:1px solid #2E5AB0}}
.hd{{display:flex;align-items:center;gap:16px;padding:24px 28px;background:rgba(255,255,255,.03);border-bottom:2px solid rgba(255,205,0,.35)}}
.hd img{{width:60px;height:60px;object-fit:contain}}
.hd h1{{font-size:26px;font-weight:800;color:#fff;line-height:1.05}} .hd .sub{{color:#FFCD00;font-size:13px;font-weight:600;margin-top:5px}}
.banner{{margin:24px 28px 6px;background:linear-gradient(135deg,#e23b3b,#b91d1d);border-radius:16px;padding:20px 24px;display:flex;align-items:center;justify-content:space-between}}
.banner .bl{{color:#ffd9d9;font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:1.5px}}
.banner .bv{{color:#fff;font-size:40px;font-weight:900;line-height:1;margin-top:4px}}
.banner .br{{text-align:right;color:#ffe3e3;font-size:13px;font-weight:700;line-height:1.5}} .banner .br b{{color:#fff;font-size:22px}}
.sec{{padding:18px 28px 4px}}
.sec h2{{color:#fff;font-size:14px;font-weight:800;text-transform:uppercase;letter-spacing:1.2px;margin-bottom:12px;display:flex;align-items:center;gap:8px}}
.dot{{width:9px;height:9px;border-radius:50%}} .dot.r{{background:#ff6b6b}} .dot.g{{background:#56e08c}}
.orow{{display:flex;align-items:center;justify-content:space-between;background:rgba(255,107,107,.1);border:1px solid rgba(255,107,107,.35);border-left:5px solid #ff5a5a;border-radius:13px;padding:14px 18px;margin-bottom:11px}}
.onm{{color:#fff;font-size:18px;font-weight:800}} .otag{{color:#9fb0dd;font-size:12px;font-weight:500;margin-left:4px}}
.osub{{color:#c3cef0;font-size:13px;margin-top:4px}} .osub b{{color:#fff}}
.odue{{text-align:right;display:flex;flex-direction:column;align-items:flex-end}}
.oamt{{color:#ff8a8a;font-size:28px;font-weight:900;line-height:1}} .olab{{color:#ffb0b0;font-size:10px;font-weight:800;letter-spacing:2px;margin-top:2px}}
.srow{{display:flex;align-items:center;justify-content:space-between;padding:9px 6px;border-bottom:1px dashed rgba(255,255,255,.1)}}
.snm{{color:#fff;font-weight:700;font-size:14px;width:150px}} .smid{{color:#8ea3d6;font-size:12px;flex:1;text-align:center}}
.schk{{color:#56e08c;font-weight:800;font-size:12px}}
.pay{{margin:16px 28px 4px;background:rgba(255,205,0,.1);border:1px dashed rgba(255,205,0,.5);border-radius:13px;padding:14px 20px;text-align:center}}
.pay .pt{{color:#FFCD00;font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:1.5px}}
.pay .pv{{color:#fff;font-size:19px;font-weight:800;margin-top:5px;letter-spacing:1px}}
.ft{{padding:14px 28px;background:rgba(0,0,0,.2);color:#8ea3d6;font-size:11px;display:flex;justify-content:space-between;border-top:1px solid #2E5AB0;margin-top:16px}}
</style></head><body><div class="card">
<div class="hd"><img src="data:image/png;base64,{logo}"><div><h1>FINES — TIME TO SETTLE UP</h1>
<div class="sub">Benidorm United · Pro Clubs Fines Pot</div></div></div>
<div class="banner"><div><div class="bl">Still Outstanding</div><div class="bv">£{total}</div></div>
<div class="br"><b>{n_owe}</b> still to pay<br>{n_sq} all square ✓</div></div>
<div class="sec"><h2><span class="dot r"></span>Still To Pay</h2>{owers}</div>
<div class="sec"><h2><span class="dot g"></span>Paid Up — Nice One</h2>{square}</div>
<div class="pay"><div class="pt">Send it to the pot</div><div class="pv">{payto}</div></div>
<div class="ft"><span>Auto-generated reminder</span><span>Reconciled against bank ✓</span></div>
</div></body></html>"""


def main():
    args = sys.argv[1:]
    csv_path = find_csv(args)
    tok = token()
    rows, debits, balance, unmapped, total_fined = reconcile(csv_path, tok)
    print_report(rows, debits, balance, unmapped, total_fined, csv_path)
    if "--sheet" in args:
        build_sheet(rows, balance, total_fined)
    if "--reminder" in args:
        build_reminder(rows)


if __name__ == "__main__":
    main()
