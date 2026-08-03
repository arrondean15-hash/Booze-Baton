#!/usr/bin/env python3
"""
Booze Baton — reconciliation web UI.

A small LOCAL Flask app that makes tools/reconcile.py visual: upload a Lloyds
bank CSV (or use the newest in ~/Downloads), see who's paid / owes in the
browser, and generate + download the two shareable Leeds-themed PNGs.

It REUSES the engine in reconcile.py — it does not re-derive any reconciliation
logic. Read-only for v1: it never marks fines paid (that stays a deliberate,
confirmed Firestore write — a future phase).

RUN
  python3 tools/reconcile_app.py        # starts server on http://127.0.0.1:5077
                                        # (needs Flask: pip install flask)

REQUIREMENTS
  - Flask (pip install flask)
  - gcloud authed to project booze-baton (gcloud auth login) — a friendly
    in-page banner is shown if the token can't be fetched.
  - Google Chrome (only for generating the PNGs).
"""
import os
import sys
import time
import shutil
import subprocess
import importlib.util
import tempfile
import webbrowser

# --- make `python3 reconcile_app.py` just work --------------------------------
# The default `python3` on PATH may be a venv without Flask. If Flask is missing,
# re-exec this script under a Python that has it (Homebrew / system python3).
try:
    import flask  # noqa: F401
except ModuleNotFoundError:
    _self = os.path.abspath(__file__)
    _cands = ["/opt/homebrew/bin/python3", "/usr/local/bin/python3",
              "/usr/bin/python3", shutil.which("python3")]
    _cur = os.path.realpath(sys.executable)
    for _py in _cands:
        if not _py or os.path.realpath(_py) == _cur:
            continue
        try:
            subprocess.run([_py, "-c", "import flask"], check=True,
                           stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        except Exception:
            continue
        os.execv(_py, [_py, _self, *sys.argv[1:]])   # hand off; never returns
    sys.exit(
        "\n  Flask isn't installed for this Python and no Flask-equipped\n"
        "  python3 was found. Install it with:\n"
        f"      {sys.executable} -m pip install flask\n"
        f"  ...then re-run:  python3 {_self}\n")

from flask import (Flask, request, render_template_string, send_file,
                   redirect, url_for, abort)

HERE = os.path.dirname(os.path.abspath(__file__))
PORT = 5077

# --- reuse the existing engine (don't duplicate its logic) -------------------
# reconcile.py lives next to this file; load it as a module by path so the
# hyphen-free filename and the project layout don't matter.
_spec = importlib.util.spec_from_file_location(
    "reconcile_engine", os.path.join(HERE, "reconcile.py"))
engine = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(engine)

OUT = engine.OUT                       # ~/Downloads
SHEET_PNG = os.path.join(OUT, "booze-baton-account-summary.png")
REMINDER_PNG = os.path.join(OUT, "booze-baton-fines-reminder.png")

# Holds the most recent reconcile result so the "generate PNG" actions can run
# without forcing a re-upload. Single user, local only — a module dict is fine.
LAST = {}

# Maps a graphic "kind" to (output PNG path, builder thunk). One source of truth
# for both generation (/generate/<kind>) and serving (/png/<kind>).
KINDS = {
    "sheet": (SHEET_PNG,
              lambda: engine.build_sheet(LAST["rows"], LAST["balance"], LAST["total_fined"])),
    "reminder": (REMINDER_PNG,
                 lambda: engine.build_reminder(LAST["rows"])),
}

app = Flask(__name__)


# --- helpers -----------------------------------------------------------------
# Cache the gcloud token briefly so the home-page banner check and the reconcile
# that follows it share a single subprocess instead of spawning one each.
_TOKEN_CACHE = {"tok": None, "err": None, "ts": 0.0}


def safe_token(ttl=45):
    """Like engine.token() but never sys.exit()s (that would kill the worker).

    Returns (token, None) on success or (None, error_message) on failure.
    Result is cached for `ttl` seconds to avoid redundant gcloud calls.
    """
    now = time.time()
    if (now - _TOKEN_CACHE["ts"]) < ttl and (_TOKEN_CACHE["tok"] or _TOKEN_CACHE["err"]):
        return _TOKEN_CACHE["tok"], _TOKEN_CACHE["err"]
    tok, err = _fetch_token()
    _TOKEN_CACHE.update(tok=tok, err=err, ts=now)
    return tok, err


def _fetch_token():
    try:
        tok = subprocess.check_output(
            ["gcloud", "auth", "print-access-token", "--project", engine.PROJECT],
            stderr=subprocess.DEVNULL).decode().strip()
        if not tok:
            return None, "gcloud returned an empty token."
        return tok, None
    except FileNotFoundError:
        return None, "gcloud is not installed or not on PATH."
    except subprocess.CalledProcessError:
        return None, ("Couldn't get a gcloud access token for project "
                      f"'{engine.PROJECT}'. Run:  gcloud auth login")
    except Exception as e:                       # noqa: BLE001 - surface anything
        return None, f"Unexpected error getting gcloud token: {e}"


def run_reconcile(csv_path):
    """Run the engine against csv_path and stash the result in LAST.

    Returns (ok, error_message). On success LAST is fully populated.
    """
    tok, err = safe_token()
    if err:
        return False, err
    try:
        rows, debits, balance, unmapped, total_fined = engine.reconcile(csv_path, tok)
    except Exception as e:                       # noqa: BLE001
        return False, f"Reconciliation failed: {e}"

    # annotate each row with the bank-statement name it was matched on,
    # so the table can show the full bridge: bank CSV name ↔ app gamertag
    bank_by_player = {p: k for k, p in engine.BANK_TO_PLAYER.items()}
    for r in rows:
        r["bank"] = bank_by_player.get(r["player"], "—")

    to_collect = sum(r["owes"] for r in rows if r["owes"] > 0.005)
    total_paid = sum(r["paid"] for r in rows)
    LAST.clear()
    LAST.update(dict(
        rows=rows, debits=debits, balance=balance, unmapped=unmapped,
        total_fined=total_fined, total_paid=total_paid, to_collect=to_collect,
        bal=balance if balance is not None else total_paid,
        csv_name=os.path.basename(csv_path),
    ))
    return True, None


# --- routes ------------------------------------------------------------------
@app.route("/")
def home():
    # surface a friendly banner up-front if gcloud isn't ready
    _, token_err = safe_token()
    return render_template_string(HOME, token_err=token_err)


@app.route("/reconcile", methods=["POST"])
def reconcile_route():
    source = request.form.get("source", "upload")
    csv_path = None
    tmp = None

    if source == "newest":
        try:
            csv_path = engine.find_csv([])       # newest ~/Downloads/10560318_*.csv
        except SystemExit:
            return render_template_string(
                HOME, token_err=None,
                error="No CSV found matching ~/Downloads/10560318_*.csv. "
                      "Export a fresh statement or upload one above.")
    else:
        f = request.files.get("csv")
        if not f or not f.filename:
            return render_template_string(
                HOME, token_err=None, error="Please choose a CSV file to upload.")
        if not f.filename.lower().endswith(".csv"):
            return render_template_string(
                HOME, token_err=None, error="That doesn't look like a .csv file.")
        fd, tmp = tempfile.mkstemp(suffix=".csv")
        os.close(fd)
        f.save(tmp)
        csv_path = tmp

    ok, err = run_reconcile(csv_path)
    if tmp and os.path.exists(tmp):
        os.remove(tmp)
    if not ok:
        return render_template_string(HOME, token_err=None, error=err)

    return render_template_string(RESULTS, d=LAST, show=request.args.get("show"))


@app.route("/generate/<kind>", methods=["POST"])
def generate(kind):
    if kind not in KINDS:
        abort(404)
    if not LAST:
        return redirect(url_for("home"))
    _path, build = KINDS[kind]
    try:
        build()
    except Exception as e:                       # noqa: BLE001
        return render_template_string(RESULTS, d=LAST, show=None,
                                      gen_error=f"Could not generate the {kind}: {e}")
    return render_template_string(RESULTS, d=LAST, show=kind)


@app.route("/png/<kind>")
def png(kind):
    path = KINDS[kind][0] if kind in KINDS else None
    if not path or not os.path.exists(path):
        abort(404)
    as_dl = request.args.get("dl") == "1"
    return send_file(path, mimetype="image/png", as_attachment=as_dl,
                     download_name=os.path.basename(path))


# --- templates (one file; Leeds United theme, mirrors reconcile.py PNGs) -----
BASE_CSS = """
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:-apple-system,"Segoe UI",Helvetica,Arial,sans-serif;
  background:linear-gradient(160deg,#1D3C8D,#16307A 55%,#102566);color:#fff;
  min-height:100vh;padding:30px 16px}
.wrap{max-width:980px;margin:0 auto}
.hd{display:flex;align-items:center;gap:18px;padding:22px 26px;
  background:rgba(255,255,255,.04);border:1px solid #2E5AB0;border-radius:18px;
  margin-bottom:22px;box-shadow:0 10px 30px rgba(0,0,0,.3)}
.hd img{width:60px;height:60px;object-fit:contain}
.hd h1{font-size:26px;font-weight:800}
.hd .sub{color:#FFCD00;font-size:13px;font-weight:600;margin-top:4px}
.hd .meta{margin-left:auto;text-align:right;color:#aebbe0;font-size:12px;line-height:1.6}
.hd .meta b{color:#fff}
.banner{border-radius:14px;padding:14px 18px;margin-bottom:18px;font-size:14px;font-weight:600}
.banner.warn{background:rgba(255,205,0,.12);border:1px dashed rgba(255,205,0,.55);color:#ffe9a8}
.banner.err{background:rgba(255,107,107,.12);border:1px solid rgba(255,107,107,.45);color:#ffc7c7}
.card-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:14px;margin-bottom:22px}
.card{background:rgba(255,255,255,.06);border:1px solid #2E5AB0;border-radius:14px;padding:16px}
.card .lab{font-size:11px;text-transform:uppercase;letter-spacing:1px;color:#9fb0dd;font-weight:700}
.card .val{font-size:24px;font-weight:800;margin-top:8px}
.card.in .val{color:#56e08c}.card.owe .val{color:#ff8a8a}
.card.bal{background:linear-gradient(160deg,#FFCD00,#f0b400);border:none}
.card.bal .lab{color:#5b4500}.card.bal .val{color:#16307A}
.panel{background:rgba(255,255,255,.05);border:1px solid #2E5AB0;border-radius:16px;
  padding:22px 24px;margin-bottom:20px}
.panel h2{font-size:15px;font-weight:800;text-transform:uppercase;letter-spacing:1.1px;
  margin-bottom:16px;display:flex;align-items:center;gap:9px}
.panel h2::before{content:"";width:5px;height:16px;background:#FFCD00;border-radius:3px}
table{width:100%;border-collapse:collapse}
th{text-align:left;color:#9fb0dd;font-size:11px;text-transform:uppercase;letter-spacing:1px;
  padding:8px 10px;border-bottom:1px solid #2E5AB0}
th.num,td.num{text-align:right}
td{padding:11px 10px;border-bottom:1px solid rgba(255,255,255,.07);font-size:14px}
tr.owe{background:rgba(255,107,107,.08)}tr.owe td.diff{color:#ff8a8a;font-weight:800}
tr.paid{background:rgba(86,224,140,.07)}tr.paid td.diff{color:#56e08c;font-weight:800}
tr.cred td.diff{color:#9fe0ff;font-weight:700}
.tag{color:#8ea3d6;font-size:12px;margin-left:6px}
.bank{color:#c3cef0;font-size:12px;font-family:ui-monospace,Menlo,monospace;
  background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.12);
  border-radius:6px;padding:2px 7px}
.debit{display:flex;justify-content:space-between;padding:9px 4px;
  border-bottom:1px dashed rgba(255,255,255,.1);font-size:13px;color:#dfe6f8}
.debit b{color:#fff}
.btn{display:inline-block;background:#FFCD00;color:#16307A;font-weight:800;border:none;
  border-radius:11px;padding:13px 20px;font-size:14px;cursor:pointer;text-decoration:none}
.btn.alt{background:rgba(255,255,255,.1);color:#fff;border:1px solid #2E5AB0}
.btn:hover{filter:brightness(1.05)}
.actions{display:flex;gap:12px;flex-wrap:wrap;align-items:center}
.drop{border:2px dashed #4f74c8;border-radius:16px;padding:38px 22px;text-align:center;
  background:rgba(255,255,255,.04);transition:.15s}
.drop.over{border-color:#FFCD00;background:rgba(255,205,0,.08)}
.drop p{color:#c3cef0;margin:10px 0}
.fname{color:#FFCD00;font-weight:700;margin-top:8px;min-height:18px}
.or{text-align:center;color:#8ea3d6;margin:18px 0;font-size:12px;text-transform:uppercase;letter-spacing:2px}
.pngwrap{text-align:center}
.pngwrap img{max-width:100%;border-radius:14px;box-shadow:0 14px 40px rgba(0,0,0,.5);margin-bottom:14px}
.ft{text-align:center;color:#8ea3d6;font-size:12px;margin-top:26px;line-height:1.7}
.ft a{color:#FFCD00}
"""

HEADER = """
<div class="hd">
  <img src="/png/logo" onerror="this.style.display='none'">
  <div><h1>BOOZE BATON</h1><div class="sub">Benidorm United · Fines Reconciliation</div></div>
  <div class="meta">{{ meta|safe }}</div>
</div>
"""

HOME = """<!doctype html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Booze Baton · Reconcile</title><style>""" + BASE_CSS + """</style></head>
<body><div class="wrap">
""" + HEADER.replace("{{ meta|safe }}", "Pro Clubs Fines Pot<br><b>Read-only ✓</b>") + """
{% if token_err %}<div class="banner warn">⚠ {{ token_err }} — you can still load the
page, but reconciling needs a valid token. Run <b>gcloud auth login</b> in a terminal.</div>{% endif %}
{% if error %}<div class="banner err">✕ {{ error }}</div>{% endif %}
<div class="panel">
  <h2>Upload a bank statement</h2>
  <form id="upform" method="post" action="/reconcile" enctype="multipart/form-data">
    <input type="hidden" name="source" value="upload">
    <label class="drop" id="drop" for="csv">
      <div style="font-size:34px">📄</div>
      <p><b>Drag &amp; drop</b> your Lloyds CSV here, or click to choose</p>
      <input id="csv" name="csv" type="file" accept=".csv" style="display:none">
      <div class="fname" id="fname"></div>
    </label>
    <div style="margin-top:16px" class="actions">
      <button class="btn" type="submit">Reconcile uploaded CSV →</button>
    </div>
  </form>
  <div class="or">— or —</div>
  <form method="post" action="/reconcile">
    <input type="hidden" name="source" value="newest">
    <div class="actions">
      <button class="btn alt" type="submit">⤓ Use newest CSV in ~/Downloads</button>
    </div>
  </form>
</div>
<div class="ft">Read-only · reuses tools/reconcile.py · no fines are marked paid here.</div>
</div>
<script>
const drop=document.getElementById('drop'),inp=document.getElementById('csv'),fn=document.getElementById('fname');
inp.addEventListener('change',()=>fn.textContent=inp.files[0]?inp.files[0].name:'');
['dragenter','dragover'].forEach(e=>drop.addEventListener(e,ev=>{ev.preventDefault();drop.classList.add('over')}));
['dragleave','drop'].forEach(e=>drop.addEventListener(e,ev=>{ev.preventDefault();drop.classList.remove('over')}));
drop.addEventListener('drop',ev=>{if(ev.dataTransfer.files.length){inp.files=ev.dataTransfer.files;fn.textContent=inp.files[0].name;}});
</script>
</body></html>"""

RESULTS = """<!doctype html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Booze Baton · Results</title><style>""" + BASE_CSS + """</style></head>
<body><div class="wrap">
""" + HEADER.replace("{{ meta|safe }}",
                     "{{ d.csv_name }}<br><b>Reconciled vs bank ✓</b>") + """
{% if gen_error %}<div class="banner err">✕ {{ gen_error }}</div>{% endif %}

<div class="card-grid">
  <div class="card in"><div class="lab">Total Paid In</div><div class="val">£{{ '%.2f'|format(d.total_paid) }}</div></div>
  <div class="card bal"><div class="lab">In The Pot Now</div><div class="val">£{{ '%.2f'|format(d.bal) }}</div></div>
  <div class="card owe"><div class="lab">Still To Collect</div><div class="val">£{{ '%.2f'|format(d.to_collect) }}</div></div>
  <div class="card"><div class="lab">Total Fines</div><div class="val">£{{ '%.2f'|format(d.total_fined) }}</div></div>
</div>

{% if d.unmapped %}
<div class="banner warn">⚠ Unmapped payer(s) — add to <b>BANK_TO_PLAYER</b> in reconcile.py:
{{ d.unmapped|join(', ') }}</div>
{% endif %}

<div class="panel">
  <h2>Per-player</h2>
  <table>
    <tr><th>Player</th><th>Bank statement name</th><th class="num">Paid in</th><th class="num">Fined</th><th class="num">Difference</th></tr>
    {% for r in d.rows %}
    {% if r.owes > 0.005 %}{% set cls='owe' %}{% elif r.owes < -0.005 %}{% set cls='cred' %}{% else %}{% set cls='paid' %}{% endif %}
    <tr class="{{ cls }}">
      <td>{{ r.name }}<span class="tag">{{ r.player }}</span></td>
      <td><span class="bank">{{ r.bank }}</span></td>
      <td class="num">£{{ '%.2f'|format(r.paid) }}</td>
      <td class="num">£{{ '%.2f'|format(r.fined) }}</td>
      <td class="num diff">
        {% if r.owes > 0.005 %}owes £{{ '%.2f'|format(r.owes) }}
        {% elif r.owes < -0.005 %}£{{ '%.2f'|format(-r.owes) }} credit
        {% else %}paid up ✓{% endif %}
      </td>
    </tr>
    {% endfor %}
  </table>
</div>

<div class="panel">
  <h2>Money out — review</h2>
  {% if d.debits %}
    {% for dt, desc, amt in d.debits %}
    <div class="debit"><span>{{ dt }} · {{ desc }}</span><b>£{{ '%.2f'|format(amt) }}</b></div>
    {% endfor %}
  {% else %}<p style="color:#9fb0dd">No debits on this statement.</p>{% endif %}
</div>

<div class="panel">
  <h2>Shareable graphics</h2>
  <div class="actions">
    <form method="post" action="/generate/sheet"><button class="btn" type="submit">🖼 Generate account summary</button></form>
    <form method="post" action="/generate/reminder"><button class="btn" type="submit">📣 Generate reminder</button></form>
    <a class="btn alt" href="/">← New statement</a>
  </div>
  {% if show in ('sheet','reminder') %}
  <div class="pngwrap" style="margin-top:20px">
    <img src="/png/{{ show }}?t={{ range(1,99999)|random }}" alt="{{ show }}">
    <div><a class="btn" href="/png/{{ show }}?dl=1">⤓ Download PNG</a></div>
  </div>
  {% endif %}
</div>

<div class="ft">Read-only · reuses tools/reconcile.py · PNGs saved to ~/Downloads.</div>
</div></body></html>"""


@app.route("/png/logo")
def logo():
    p = engine.LOGO
    if not os.path.exists(p):
        abort(404)
    return send_file(p, mimetype="image/png")


def main():
    url = f"http://127.0.0.1:{PORT}"
    print(f"\n  Booze Baton reconciliation UI  →  {url}")
    print("  (read-only · reuses reconcile.py · Ctrl-C to stop)\n")
    try:
        webbrowser.open(url)
    except Exception:
        pass
    app.run(host="127.0.0.1", port=PORT, debug=False)


if __name__ == "__main__":
    main()
