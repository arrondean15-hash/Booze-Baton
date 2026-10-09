// Rename players everywhere their app name is stored. Dry run unless --apply is passed.
// Run tools/season/backup.js FIRST. Undo with tools/season/restore.js.
//
// Touches: fines.playerName, users.playerName, playerNames/{name} (doc id moved, data kept),
// config/players list[].name, config/playerMappings values, proClubsMatches.anyPlayer,
// dailyVotes (any string field/key equal to an old name). Bank-name maps in app.js and
// tools/reconcile.py are code and must be edited separately.
const path = require('path');
const admin = require(path.join(__dirname, '../../functions/node_modules/firebase-admin'));
admin.initializeApp({ projectId: 'booze-baton' });
const db = admin.firestore();

// 9 Oct 2026: app names → EAFC 27 in-game pro names (EA members/stats proName, club 525055)
const RENAMES = {
  'Narreh': 'narreh',
  'Jim Blackpool': 'J. Blackpool',
  'Le Dump': 'Baldacourt',
  'Ash': 'Diggy Dawg',
  'J3': 'Omar',
  'Erik Eriksson': 'D. Benigul',
};
const apply = process.argv.includes('--apply');

// Deep-rename string values and object keys that exactly match an old name
function rename(v) {
  if (typeof v === 'string') return RENAMES[v] || v;
  if (Array.isArray(v)) return v.map(rename);
  if (v && typeof v === 'object' && !(v instanceof admin.firestore.Timestamp)) {
    return Object.fromEntries(Object.entries(v).map(([k, x]) => [RENAMES[k] || k, rename(x)]));
  }
  return v;
}

async function commitInChunks(ops) {
  for (let i = 0; i < ops.length; i += 400) {
    const batch = db.batch();
    ops.slice(i, i + 400).forEach(op => op(batch));
    await batch.commit();
  }
}

(async () => {
  console.log(apply ? '*** APPLYING CHANGES TO PRODUCTION ***' : 'DRY RUN — nothing will be written (pass --apply)');
  const newNames = Object.values(RENAMES);
  const clash = (await db.collection('playerNames').get()).docs.filter(d => newNames.includes(d.id));
  if (clash.length) throw new Error(`New name already claimed: ${clash.map(d => d.id)}`);

  const ops = [];
  const field = async (coll, key) => {
    const docs = (await db.collection(coll).get()).docs.filter(d => RENAMES[d.data()[key]]);
    console.log(`${coll}.${key}: ${docs.length} docs`);
    docs.forEach(d => ops.push(b => b.update(d.ref, { [key]: RENAMES[d.data()[key]] })));
  };
  await field('fines', 'playerName');
  await field('users', 'playerName');
  await field('proClubsMatches', 'anyPlayer');

  const votes = (await db.collection('dailyVotes').get()).docs.filter(d => JSON.stringify(rename(d.data())) !== JSON.stringify(d.data()));
  console.log(`dailyVotes: ${votes.length} docs`);
  votes.forEach(d => ops.push(b => b.set(d.ref, rename(d.data()))));

  const claims = (await db.collection('playerNames').get()).docs.filter(d => RENAMES[d.id]);
  console.log(`playerNames: move ${claims.map(d => `"${d.id}" → "${RENAMES[d.id]}"`).join(', ')}`);
  claims.forEach(d => {
    ops.push(b => b.set(db.collection('playerNames').doc(RENAMES[d.id]), d.data()));
    ops.push(b => b.delete(d.ref));
  });

  const playersRef = db.collection('config').doc('players');
  const list = (await playersRef.get()).data().list;
  const newList = list.map(p => ({ ...p, name: RENAMES[p.name] || p.name }));
  console.log('config/players:', newList.map(p => p.name).join(', '));
  ops.push(b => b.update(playersRef, { list: newList }));

  const mapRef = db.collection('config').doc('playerMappings');
  const mappings = (await mapRef.get()).data().mappings;
  const newMappings = Object.fromEntries(Object.entries(mappings).map(([tag, n]) => [tag, RENAMES[n] || n]));
  console.log('config/playerMappings:', JSON.stringify(newMappings));
  ops.push(b => b.update(mapRef, { mappings: newMappings }));

  if (!apply) return console.log(`\nDry run complete — ${ops.length} writes planned.`);
  await commitInChunks(ops);
  console.log(`Applied ${ops.length} writes.\nDone.`);
})().catch(e => { console.error(e); process.exit(1); });
