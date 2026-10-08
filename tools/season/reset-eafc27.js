// EAFC 26 → EAFC 27 season reset (8 Oct 2026). Dry run unless --apply is passed.
// Run tools/season/backup.js FIRST — this script deletes data. Undo with tools/season/restore.js.
//
//   1. Fines dated before CUTOFF: PAID ones deleted. Unpaid ones are kept as-is (still owed —
//      carried into EAFC 27 at the user's request). Fines on/after CUTOFF are left untouched.
//   2. proClubsMatches, dailyVotes, baton (history): all deleted. baton_current is kept.
//   3. config/players: every player reset to { name, eafc27, adjustment: 0 }, eafc27 seeded from
//      EA members/stats for club 525055 (read in a browser 8 Oct 2026 — Akamai blocks curl).
//   4. config/playerMappings: renamed EA gamertags applied (EAFC 27 club 525055).
const path = require('path');
const admin = require(path.join(__dirname, '../../functions/node_modules/firebase-admin'));
admin.initializeApp({ projectId: 'booze-baton' });
const db = admin.firestore();

const CUTOFF = '2026-09-27';
const GAMERTAG_RENAMES = { 'AzZa DeAn0': 'AzZa_DeAn0' };
// EA members/stats gamesPlayed on club 525055, 8 Oct 2026. No voids yet (match list starts empty).
const EAFC27_GAMES_BY_GAMERTAG = {
  'Narreh_Neck': 13, 'Mattyb10': 21, 'MI CHARVVYYY': 6, 'ashblackson': 14,
  'AzZa_DeAn0': 19, 'jackhomer135': 17, 'Billy LUFC6260': 24, 'LUFC dAnNyR': 0,
};
const WIPE_COLLECTIONS = ['proClubsMatches', 'dailyVotes', 'baton'];
const apply = process.argv.includes('--apply');

async function commitInChunks(ops) {
  for (let i = 0; i < ops.length; i += 400) {
    const batch = db.batch();
    ops.slice(i, i + 400).forEach(op => op(batch));
    await batch.commit();
  }
}

(async () => {
  console.log(apply ? '*** APPLYING CHANGES TO PRODUCTION ***' : 'DRY RUN — nothing will be written (pass --apply)');

  const fines = (await db.collection('fines').get()).docs;
  const keep = fines.filter(d => (d.data().date || '') >= CUTOFF);
  const old = fines.filter(d => (d.data().date || '') < CUTOFF);
  const carry = old.filter(d => !d.data().paid);
  const remove = old.filter(d => d.data().paid);
  const sum = docs => docs.reduce((a, d) => a + (Number(d.data().amount) || 0), 0).toFixed(2);
  const byPlayer = docs => docs.reduce((a, d) => (a[d.data().playerName] = +((a[d.data().playerName] || 0) + d.data().amount).toFixed(2), a), {});
  console.log(`\nFines: ${fines.length} total`);
  console.log(`  KEEP EAFC 27 (date >= ${CUTOFF}): ${keep.length} fines, £${sum(keep)}`);
  console.log(`  KEEP unpaid older fines (still owed): ${carry.length} fines, £${sum(carry)}`, byPlayer(carry));
  console.log(`  REMOVE paid older fines (date < ${CUTOFF}): ${remove.length} fines, £${sum(remove)}`);
  console.log(`  → fines left after reset: ${keep.length + carry.length}, unpaid £${sum([...keep, ...carry].filter(d => !d.data().paid))}`);

  const wipeDocs = {};
  for (const c of WIPE_COLLECTIONS) {
    wipeDocs[c] = (await db.collection(c).get()).docs;
    console.log(`${c}: delete all ${wipeDocs[c].length}`);
  }
  const holder = (await db.collection('baton_current').doc('holder').get()).data();
  console.log(`baton_current: KEEP holder = ${holder && holder.holderTeamName}`);

  const mapRef = db.collection('config').doc('playerMappings');
  const mappings = (await mapRef.get()).data().mappings;
  const newMappings = {};
  for (const [tag, name] of Object.entries(mappings)) newMappings[GAMERTAG_RENAMES[tag] || tag] = name;
  for (const [from, to] of Object.entries(GAMERTAG_RENAMES)) {
    console.log(`config/playerMappings: "${from}" → "${to}" (${mappings[from] || 'NOT FOUND'})`);
  }

  const playersRef = db.collection('config').doc('players');
  const players = (await playersRef.get()).data().list;
  const gamertagOf = Object.fromEntries(Object.entries(newMappings).map(([tag, name]) => [name, tag]));
  const newPlayers = players.map(p => {
    const games = EAFC27_GAMES_BY_GAMERTAG[gamertagOf[p.name]];
    if (games === undefined) throw new Error(`No EAFC 27 games for ${p.name} (gamertag ${gamertagOf[p.name]})`);
    return { name: p.name, eafc27: games, adjustment: 0 };
  });
  console.log('config/players: EAFC 27 games:', newPlayers.map(p => `${p.name}=${p.eafc27}`).join(', '));

  if (!apply) return console.log('\nDry run complete.');

  await commitInChunks(remove.map(d => b => b.delete(d.ref)));
  console.log(`Deleted ${remove.length} paid EAFC 26 fines`);
  for (const c of WIPE_COLLECTIONS) {
    await commitInChunks(wipeDocs[c].map(d => b => b.delete(d.ref)));
    console.log(`Deleted ${wipeDocs[c].length} ${c}`);
  }
  await playersRef.set({ list: newPlayers });
  await mapRef.set({ mappings: newMappings });
  console.log('Reset config/players and config/playerMappings\nDone.');
})().catch(e => { console.error(e); process.exit(1); });
