// Full Firestore backup: every top-level collection (and subcollections) to JSON, plus readable CSVs.
// Usage: node tools/season/backup.js [outDir]
const path = require('path');
const fs = require('fs');
const admin = require(path.join(__dirname, '../../functions/node_modules/firebase-admin'));
admin.initializeApp({ projectId: 'booze-baton' });
const db = admin.firestore();

const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const outDir = process.argv[2] || path.join(__dirname, '../../backups', `backup-${stamp}`);

// Tag Timestamps so restore.js can rebuild them exactly
function encode(v) {
  if (v instanceof admin.firestore.Timestamp) return { __ts: v.toDate().toISOString() };
  if (Array.isArray(v)) return v.map(encode);
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, encode(x)]));
  return v;
}

async function dumpCollection(ref) {
  const snap = await ref.get();
  const docs = {};
  for (const d of snap.docs) {
    const subs = await d.ref.listCollections();
    const entry = { data: encode(d.data()) };
    if (subs.length) {
      entry.subcollections = {};
      for (const s of subs) entry.subcollections[s.id] = await dumpCollection(s);
    }
    docs[d.id] = entry;
  }
  return docs;
}

function csvField(v) {
  if (v === undefined || v === null) return '';
  const s = typeof v === 'object' ? JSON.stringify(v) : String(v);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
function writeCsv(file, header, rows) {
  const lines = [header, ...rows].map(r => r.map(csvField).join(','));
  fs.writeFileSync(path.join(outDir, file), '﻿' + lines.join('\r\n') + '\r\n');
}
const tsIso = v => (v && v.__ts) || v;

(async () => {
  fs.mkdirSync(outDir, { recursive: true });
  const full = {};
  const counts = {};
  for (const c of await db.listCollections()) {
    full[c.id] = await dumpCollection(c);
    counts[c.id] = Object.keys(full[c.id]).length;
  }
  fs.writeFileSync(path.join(outDir, 'firestore-full.json'), JSON.stringify({ project: 'booze-baton', takenAt: new Date().toISOString(), counts, collections: full }, null, 1));

  const docs = name => Object.entries(full[name] || {}).map(([id, e]) => ({ id, ...e.data }));

  const fines = docs('fines').sort((a, b) => String(a.timestamp).localeCompare(String(b.timestamp)));
  writeCsv('fines.csv', ['id', 'date', 'player', 'reason', 'amount', 'paid', 'paidDate', 'timestamp'],
    fines.map(f => [f.id, f.date, f.playerName, f.reason, f.amount, f.paid ? 'Yes' : 'No', f.paidDate, tsIso(f.timestamp)]));

  const players = (full.config?.players?.data?.list) || [];
  writeCsv('players-games.csv', ['player', 'eafc25', 'season2425', 'eafc26', 'adjustment', 'total'],
    players.map(p => [p.name, p.eafc25 || 0, p.season2425 || 0, p.eafc26 || 0, p.adjustment || 0,
      (p.eafc25 || 0) - (p.season2425 || 0) + (p.eafc26 || 0) + (p.adjustment || 0)]));

  const matches = docs('proClubsMatches').sort((a, b) => String(tsIso(a.timestamp)).localeCompare(String(tsIso(b.timestamp))));
  writeCsv('matches.csv', ['id', 'timestamp', 'result', 'goalsFor', 'goalsAgainst', 'opponent', 'anyPlayer', 'raw'],
    matches.map(m => [m.id, tsIso(m.timestamp), m.result, m.ourScore, m.opponentScore,
      m.opponentName, m.anyPlayer, m]));

  writeCsv('daily-votes.csv', ['date', 'data'], docs('dailyVotes').map(v => [v.id, (({ id, ...r }) => r)(v)]));
  writeCsv('baton-history.csv', ['id', 'data'], docs('baton').map(b => [b.id, (({ id, ...r }) => r)(b)]));

  fs.writeFileSync(path.join(outDir, 'counts.json'), JSON.stringify(counts, null, 2));
  console.log('Backup written to', outDir);
  console.log(counts);
})().catch(e => { console.error(e); process.exit(1); });
