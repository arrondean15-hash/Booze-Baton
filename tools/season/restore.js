// Restore Firestore from a backup.js snapshot. Dry run unless --apply is passed.
// Usage: node tools/season/restore.js <backupDir> [--apply] [--only=fines,config,...]
// Writes every doc back with set() (overwrites same-id docs, leaves newer docs alone).
const path = require('path');
const fs = require('fs');
const admin = require(path.join(__dirname, '../../functions/node_modules/firebase-admin'));
admin.initializeApp({ projectId: 'booze-baton' });
const db = admin.firestore();

const dir = process.argv[2];
const apply = process.argv.includes('--apply');
const onlyArg = process.argv.find(a => a.startsWith('--only='));
const only = onlyArg ? onlyArg.slice(7).split(',') : null;
if (!dir) { console.error('Usage: node tools/season/restore.js <backupDir> [--apply] [--only=a,b]'); process.exit(1); }

function decode(v) {
  if (v && typeof v === 'object' && !Array.isArray(v) && Object.keys(v).length === 1 && v.__ts) {
    return admin.firestore.Timestamp.fromDate(new Date(v.__ts));
  }
  if (Array.isArray(v)) return v.map(decode);
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, decode(x)]));
  return v;
}

async function restoreCollection(ref, docs, tally) {
  let batch = db.batch(), n = 0;
  for (const [id, entry] of Object.entries(docs)) {
    if (apply) { batch.set(ref.doc(id), decode(entry.data)); if (++n === 400) { await batch.commit(); batch = db.batch(); n = 0; } }
    tally[ref.path] = (tally[ref.path] || 0) + 1;
    for (const [sub, subDocs] of Object.entries(entry.subcollections || {})) await restoreCollection(ref.doc(id).collection(sub), subDocs, tally);
  }
  if (apply && n) await batch.commit();
}

(async () => {
  const snap = JSON.parse(fs.readFileSync(path.join(dir, 'firestore-full.json'), 'utf8'));
  const tally = {};
  for (const [name, docs] of Object.entries(snap.collections)) {
    if (only && !only.includes(name)) continue;
    await restoreCollection(db.collection(name), docs, tally);
  }
  console.log(apply ? 'RESTORED' : 'DRY RUN (pass --apply to write)', 'from snapshot taken', snap.takenAt);
  console.log(tally);
})().catch(e => { console.error(e); process.exit(1); });
