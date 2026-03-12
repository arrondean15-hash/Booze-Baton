const functions = require('firebase-functions');
const fetch = require('node-fetch');
const admin = require('firebase-admin');

// Initialize Firebase Admin
if (!admin.apps.length) {
  admin.initializeApp();
}
const db = admin.firestore();

// API-Football configuration
// Get API key from environment variable
const API_KEY = functions.config().football?.apikey || process.env.FOOTBALL_API_KEY;
// Direct API-Football endpoint (not RapidAPI)
const API_BASE_URL = 'https://v3.football.api-sports.io/';

// EA Pro Clubs API configuration
const EA_API_BASE_URL = 'https://proclubs.ea.com/api/fc/';
const EA_CLUB_ID = '21853'; // Benidorm United
const EA_PLATFORM = 'common-gen5'; // PS5/Xbox Series X|S

// Headers to mimic browser request (required by EA's WAF)
const EA_API_HEADERS = {
  'Accept': 'application/json',
  'Accept-Language': 'en-GB,en;q=0.9',
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  'Referer': 'https://www.ea.com/games/ea-sports-fc/pro-clubs',
  'Origin': 'https://www.ea.com',
  'sec-ch-ua': '"Google Chrome";v="131", "Chromium";v="131", "Not_A Brand";v="24"',
  'sec-ch-ua-mobile': '?0',
  'sec-ch-ua-platform': '"macOS"',
  'sec-fetch-dest': 'empty',
  'sec-fetch-mode': 'cors',
  'sec-fetch-site': 'same-site'
};

// Super admin configuration
// Set with: firebase functions:config:set superadmin.email="your-email@gmail.com"
const SUPER_ADMIN_EMAIL = functions.config().superadmin?.email || process.env.SUPER_ADMIN_EMAIL;

// Firebase Auth token verification (replaces PIN auth)
async function verifyAuth(req, res) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    sendError(res, 401, 'unauthenticated', 'Not authenticated');
    return null;
  }
  try {
    const idToken = authHeader.split('Bearer ')[1];
    return await admin.auth().verifyIdToken(idToken);
  } catch (error) {
    sendError(res, 401, 'unauthenticated', 'Invalid auth token');
    return null;
  }
}

// Super admin verification
async function verifySuperAdmin(req, res) {
  const user = await verifyAuth(req, res);
  if (!user) return null;
  if (user.email !== SUPER_ADMIN_EMAIL) {
    sendError(res, 403, 'permission-denied', 'Super admin access required');
    return null;
  }
  return user;
}

// CORS helper for HTTP functions (restricted origins)
function handleCors(req, res) {
  const allowedOrigins = [
    'https://booze-baton.web.app',
    'https://booze-baton.firebaseapp.com',
    'http://localhost:5050',
    'http://localhost:5000'
  ];
  const origin = req.headers.origin;
  if (allowedOrigins.includes(origin)) {
    res.set('Access-Control-Allow-Origin', origin);
  }
  res.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.status(204).send('');
    return true;
  }
  return false;
}

// Helper to send JSON response
function sendResponse(res, status, data) {
  res.status(status).json({ data });
}

// Helper to send error response
function sendError(res, status, code, message) {
  res.status(status).json({ error: { code, message } });
}

// Helper function to make API calls
async function callFootballAPI(endpoint, params = {}) {
  if (!API_KEY) {
    throw new Error('Football API key not configured. Run: firebase functions:config:set football.apikey="YOUR_KEY"');
  }

  const queryString = new URLSearchParams(params).toString();
  const url = `${API_BASE_URL}${endpoint}${queryString ? '?' + queryString : ''}`;

  const response = await fetch(url, {
    headers: {
      'x-apisports-key': API_KEY
    }
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`API request failed: ${response.status} - ${errorText}`);
  }

  const data = await response.json();

  // API-Football returns errors in response.errors
  if (data.errors && Object.keys(data.errors).length > 0) {
    throw new Error(`API error: ${JSON.stringify(data.errors)}`);
  }

  return data;
}

/**
 * Cloud Function: searchTeams
 * Searches for football teams by name
 * Requires admin password for access
 *
 * @param {string} query - Team name to search for
 * @param {string} adminPassword - Admin password for authentication
 * @returns {Array} Array of team objects
 */
exports.searchTeams = functions.https.onRequest(async (req, res) => {
  if (handleCors(req, res)) return;

  try {
    const user = await verifyAuth(req, res);
    if (!user) return;

    const { query } = req.body;

    if (!query || typeof query !== 'string' || query.trim().length === 0) {
      return sendError(res, 400, 'invalid-argument', 'Query parameter is required and must be a non-empty string');
    }

    functions.logger.info(`Searching teams with query: ${query}`);

    const result = await callFootballAPI('teams', { search: query.trim() });

    if (!result.response || !Array.isArray(result.response)) {
      return sendResponse(res, 200, []);
    }

    // Transform the response to a compact format
    const teams = result.response.map(item => ({
      teamId: item.team.id,
      teamName: item.team.name,
      country: item.team.country || 'Unknown',
      city: item.venue?.city || null,
      logo: item.team.logo || null
    }));

    functions.logger.info(`Found ${teams.length} teams for query: ${query}`);
    sendResponse(res, 200, teams);

  } catch (error) {
    functions.logger.error('Error in searchTeams:', error);
    sendError(res, 500, 'internal', `Failed to search teams: ${error.message}`);
  }
});

/**
 * Cloud Function: getLatestCompetitiveMatch
 * Fetches the most recent finished competitive match for a team
 * Requires admin password for access
 *
 * @param {number} teamId - The team ID from API-Football
 * @param {string} adminPassword - Admin password for authentication
 * @returns {Object} Match object or null if no match found
 */
exports.getLatestCompetitiveMatch = functions.https.onRequest(async (req, res) => {
  if (handleCors(req, res)) return;

  try {
    const user = await verifyAuth(req, res);
    if (!user) return;

    const { teamId } = req.body;

    if (!teamId || typeof teamId !== 'number') {
      return sendError(res, 400, 'invalid-argument', 'teamId parameter is required and must be a number');
    }

    functions.logger.info(`Fetching latest match for team: ${teamId}`);

    // Fetch recent finished matches for the team (last 100)
    // Status 'FT' means finished/full-time
    const result = await callFootballAPI('fixtures', {
      team: teamId,
      last: 100,
      status: 'FT'
    });

    if (!result.response || !Array.isArray(result.response) || result.response.length === 0) {
      functions.logger.warn(`No finished matches found for team: ${teamId}`);
      return sendResponse(res, 200, null);
    }

    // Filter out friendlies - only keep competitive matches
    const competitiveMatches = result.response.filter(match => {
      const leagueName = match.league.name.toLowerCase();
      if (leagueName.includes('friendly') || leagueName.includes('friendlies')) {
        return false;
      }
      if (match.league.id === 667) {
        return false;
      }
      return true;
    });

    if (competitiveMatches.length === 0) {
      functions.logger.warn(`No competitive matches found for team: ${teamId}`);
      return sendResponse(res, 200, null);
    }

    // Sort by date descending and get the most recent
    competitiveMatches.sort((a, b) => {
      return new Date(b.fixture.date) - new Date(a.fixture.date);
    });

    const latestMatch = competitiveMatches[0];

    // Transform to clean format
    const matchData = {
      matchId: latestMatch.fixture.id,
      matchDate: latestMatch.fixture.date,
      competitionName: latestMatch.league.name,
      competitionCountry: latestMatch.league.country || 'International',
      homeTeamId: latestMatch.teams.home.id,
      homeTeamName: latestMatch.teams.home.name,
      homeTeamLogo: latestMatch.teams.home.logo,
      awayTeamId: latestMatch.teams.away.id,
      awayTeamName: latestMatch.teams.away.name,
      awayTeamLogo: latestMatch.teams.away.logo,
      homeScore: latestMatch.goals.home,
      awayScore: latestMatch.goals.away
    };

    functions.logger.info(`Found latest match: ${matchData.homeTeamName} ${matchData.homeScore}-${matchData.awayScore} ${matchData.awayTeamName}`);
    sendResponse(res, 200, matchData);

  } catch (error) {
    functions.logger.error('Error in getLatestCompetitiveMatch:', error);
    sendError(res, 500, 'internal', `Failed to fetch latest match: ${error.message}`);
  }
});

/**
 * Cloud Function: updateBaton
 * Manually checks if baton should move based on latest match result
 *
 * RULES:
 * - Baton moves ONLY when current holder LOSES
 * - Baton STAYS if holder WINS or DRAWS
 * - Only competitive matches (friendlies ignored)
 * - Prevents duplicate processing of same match
 *
 * @param {string} adminPassword - Admin password for authentication
 * @returns {Object} Result of baton update
 */
exports.updateBaton = functions.https.onRequest(async (req, res) => {
  if (handleCors(req, res)) return;

  try {
    const user = await verifyAuth(req, res);
    if (!user) return;

    functions.logger.info('Starting baton update check...');

    // 1. Read current baton holder
    const batonDoc = await db.collection('baton_current').doc('holder').get();

    if (!batonDoc.exists) {
      return sendError(res, 404, 'not-found', 'No baton holder set. Use Team ID Finder to set initial holder.');
    }

    const currentHolder = batonDoc.data();
    const holderTeamId = currentHolder.holderTeamId;
    const holderTeamName = currentHolder.holderTeamName;
    const lastProcessedMatchId = currentHolder.lastProcessedMatchId || null;

    functions.logger.info(`Current holder: ${holderTeamName} (ID: ${holderTeamId})`);

    // 2. Get latest competitive match for current holder
    const matchResult = await callFootballAPI('fixtures', {
      team: holderTeamId,
      last: 100,
      status: 'FT'
    });

    if (!matchResult.response || !Array.isArray(matchResult.response) || matchResult.response.length === 0) {
      functions.logger.warn('No finished matches found for holder');
      return sendResponse(res, 200, {
        status: 'no_update',
        message: `No finished matches found for ${holderTeamName}`,
        batonStayed: true,
        holder: holderTeamName
      });
    }

    // Filter out friendlies
    const competitiveMatches = matchResult.response.filter(match => {
      const leagueName = match.league.name.toLowerCase();
      if (leagueName.includes('friendly') || leagueName.includes('friendlies')) {
        return false;
      }
      if (match.league.id === 667) { // Club Friendlies league ID
        return false;
      }
      return true;
    });

    if (competitiveMatches.length === 0) {
      functions.logger.warn('No competitive matches found');
      return sendResponse(res, 200, {
        status: 'no_update',
        message: `No competitive matches found for ${holderTeamName}`,
        batonStayed: true,
        holder: holderTeamName
      });
    }

    // Sort by date and get most recent
    competitiveMatches.sort((a, b) => new Date(b.fixture.date) - new Date(a.fixture.date));
    const latestMatch = competitiveMatches[0];

    functions.logger.info(`Latest match ID: ${latestMatch.fixture.id}`);
    functions.logger.info(`Last processed match ID: ${lastProcessedMatchId}`);

    // 3. Anti-duplicate check
    if (lastProcessedMatchId && latestMatch.fixture.id === lastProcessedMatchId) {
      functions.logger.info('Match already processed');
      return sendResponse(res, 200, {
        status: 'no_update',
        message: 'This match has already been processed',
        batonStayed: true,
        holder: holderTeamName
      });
    }

    // 4. Determine outcome from holder's perspective
    const homeTeam = latestMatch.teams.home;
    const awayTeam = latestMatch.teams.away;
    const homeScore = latestMatch.goals.home;
    const awayScore = latestMatch.goals.away;

    const isHolderHome = homeTeam.id === holderTeamId;
    const holderScore = isHolderHome ? homeScore : awayScore;
    const opponentScore = isHolderHome ? awayScore : homeScore;
    const opponentTeam = isHolderHome ? awayTeam : homeTeam;

    let outcomeForHolder;
    let batonMoved = false;
    let reason;

    if (holderScore > opponentScore) {
      outcomeForHolder = 'WIN';
      reason = `${holderTeamName} won ${holderScore}-${opponentScore}. Baton stays.`;
    } else if (holderScore === opponentScore) {
      outcomeForHolder = 'DRAW';
      reason = `${holderTeamName} drew ${holderScore}-${opponentScore}. Baton stays.`;
    } else {
      outcomeForHolder = 'LOSS';
      batonMoved = true;
      reason = `${holderTeamName} lost ${holderScore}-${opponentScore}. Baton moves to ${opponentTeam.name}.`;
    }

    functions.logger.info(`Outcome: ${outcomeForHolder} - ${reason}`);

    // 5. Prepare history record
    const historyRecord = {
      previousHolderTeamId: holderTeamId,
      previousHolderTeamName: holderTeamName,
      newHolderTeamId: batonMoved ? opponentTeam.id : holderTeamId,
      newHolderTeamName: batonMoved ? opponentTeam.name : holderTeamName,
      matchId: latestMatch.fixture.id,
      matchDate: latestMatch.fixture.date,
      competitionName: latestMatch.league.name,
      competitionCountry: latestMatch.league.country || 'International',
      homeTeamId: homeTeam.id,
      homeTeamName: homeTeam.name,
      homeTeamLogo: homeTeam.logo,
      awayTeamId: awayTeam.id,
      awayTeamName: awayTeam.name,
      awayTeamLogo: awayTeam.logo,
      homeScore: homeScore,
      awayScore: awayScore,
      outcomeForHolder: outcomeForHolder,
      batonMoved: batonMoved,
      reason: reason,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedBy: 'manual'
    };

    // 6. Write to Firestore
    const batch = db.batch();

    // Update baton_current
    const newHolderData = {
      holderTeamId: batonMoved ? opponentTeam.id : holderTeamId,
      holderTeamName: batonMoved ? opponentTeam.name : holderTeamName,
      holderCountry: batonMoved ? (latestMatch.league.country || 'International') : currentHolder.holderCountry,
      holderCity: batonMoved ? null : currentHolder.holderCity,
      holderLogo: batonMoved ? opponentTeam.logo : currentHolder.holderLogo,
      lastProcessedMatchId: latestMatch.fixture.id,
      lastUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedBy: 'manual'
    };

    batch.set(db.collection('baton_current').doc('holder'), newHolderData);

    // Add to baton_history
    batch.add(db.collection('baton_history'), historyRecord);

    await batch.commit();

    functions.logger.info('Baton update successful');

    // 7. Return result
    if (batonMoved) {
      sendResponse(res, 200, {
        status: 'moved',
        message: `Baton moved: ${holderTeamName} → ${opponentTeam.name}`,
        batonMoved: true,
        previousHolder: holderTeamName,
        newHolder: opponentTeam.name,
        match: {
          home: homeTeam.name,
          away: awayTeam.name,
          score: `${homeScore}-${awayScore}`,
          competition: latestMatch.league.name,
          date: latestMatch.fixture.date
        },
        reason: reason
      });
    } else {
      sendResponse(res, 200, {
        status: 'stayed',
        message: `Baton stayed with ${holderTeamName} (${outcomeForHolder.toLowerCase()})`,
        batonStayed: true,
        holder: holderTeamName,
        match: {
          home: homeTeam.name,
          away: awayTeam.name,
          score: `${homeScore}-${awayScore}`,
          competition: latestMatch.league.name,
          date: latestMatch.fixture.date
        },
        reason: reason
      });
    }

  } catch (error) {
    functions.logger.error('Error in updateBaton:', error);
    sendError(res, 500, 'internal', `Failed to update baton: ${error.message}`);
  }
});

/**
 * Cloud Function: addFine
 * Adds a new fine to the database
 * Requires admin password
 *
 * @param {Object} fine - Fine object to add
 * @param {string} adminPassword - Admin password for authentication
 * @returns {Object} Result with fine ID
 */
exports.addFine = functions.https.onRequest(async (req, res) => {
  if (handleCors(req, res)) return;

  try {
    const user = await verifyAuth(req, res);
    if (!user) return;

    const { fine } = req.body;

    if (!fine || typeof fine !== 'object') {
      return sendError(res, 400, 'invalid-argument', 'Fine object is required');
    }

    functions.logger.info('Adding fine:', fine);
    const docRef = await db.collection('fines').add(fine);

    sendResponse(res, 200, { success: true, fineId: docRef.id });
  } catch (error) {
    functions.logger.error('Error in addFine:', error);
    sendError(res, 500, 'internal', `Failed to add fine: ${error.message}`);
  }
});

/**
 * Cloud Function: deleteFine
 * Deletes a fine from the database
 * Requires admin password
 *
 * @param {string} fineId - ID of fine to delete
 * @param {string} adminPassword - Admin password for authentication
 * @returns {Object} Success status
 */
exports.deleteFine = functions.https.onRequest(async (req, res) => {
  if (handleCors(req, res)) return;

  try {
    const user = await verifyAuth(req, res);
    if (!user) return;

    const { fineId } = req.body;

    if (!fineId || typeof fineId !== 'string') {
      return sendError(res, 400, 'invalid-argument', 'Fine ID is required');
    }

    functions.logger.info('Deleting fine:', fineId);
    await db.collection('fines').doc(fineId).delete();

    sendResponse(res, 200, { success: true });
  } catch (error) {
    functions.logger.error('Error in deleteFine:', error);
    sendError(res, 500, 'internal', `Failed to delete fine: ${error.message}`);
  }
});

/**
 * Cloud Function: updateFine
 * Updates a fine in the database (e.g., mark as paid)
 * Requires admin password
 *
 * @param {string} fineId - ID of fine to update
 * @param {Object} updates - Fields to update
 * @param {string} adminPassword - Admin password for authentication
 * @returns {Object} Success status
 */
exports.updateFine = functions.https.onRequest(async (req, res) => {
  if (handleCors(req, res)) return;

  try {
    const user = await verifyAuth(req, res);
    if (!user) return;

    const { fineId, updates } = req.body;

    if (!fineId || typeof fineId !== 'string') {
      return sendError(res, 400, 'invalid-argument', 'Fine ID is required');
    }
    if (!updates || typeof updates !== 'object') {
      return sendError(res, 400, 'invalid-argument', 'Updates object is required');
    }

    functions.logger.info('Updating fine:', fineId, updates);
    await db.collection('fines').doc(fineId).update(updates);

    sendResponse(res, 200, { success: true });
  } catch (error) {
    functions.logger.error('Error in updateFine:', error);
    sendError(res, 500, 'internal', `Failed to update fine: ${error.message}`);
  }
});

/**
 * Cloud Function: addBatonEntry
 * Adds a baton transfer entry to history
 * Requires admin password
 *
 * @param {Object} entry - Baton entry object
 * @param {string} adminPassword - Admin password for authentication
 * @returns {Object} Result with entry ID
 */
exports.addBatonEntry = functions.https.onRequest(async (req, res) => {
  if (handleCors(req, res)) return;

  try {
    const user = await verifyAuth(req, res);
    if (!user) return;

    const { entry } = req.body;

    if (!entry || typeof entry !== 'object') {
      return sendError(res, 400, 'invalid-argument', 'Entry object is required');
    }

    functions.logger.info('Adding baton entry:', entry);
    const docRef = await db.collection('baton').add(entry);

    sendResponse(res, 200, { success: true, entryId: docRef.id });
  } catch (error) {
    functions.logger.error('Error in addBatonEntry:', error);
    sendError(res, 500, 'internal', `Failed to add baton entry: ${error.message}`);
  }
});

/**
 * Cloud Function: deleteBatonEntry
 * Deletes a baton entry from history
 * Requires admin password
 *
 * @param {string} entryId - ID of baton entry to delete
 * @param {string} adminPassword - Admin password for authentication
 * @returns {Object} Success status
 */
exports.deleteBatonEntry = functions.https.onRequest(async (req, res) => {
  if (handleCors(req, res)) return;

  try {
    const user = await verifyAuth(req, res);
    if (!user) return;

    const { entryId } = req.body;

    if (!entryId || typeof entryId !== 'string') {
      return sendError(res, 400, 'invalid-argument', 'Entry ID is required');
    }

    functions.logger.info('Deleting baton entry:', entryId);
    await db.collection('baton').doc(entryId).delete();

    sendResponse(res, 200, { success: true });
  } catch (error) {
    functions.logger.error('Error in deleteBatonEntry:', error);
    sendError(res, 500, 'internal', `Failed to delete baton entry: ${error.message}`);
  }
});

/**
 * Cloud Function: saveTeam
 * Saves a team to known_teams collection
 * Requires admin password
 *
 * @param {Object} team - Team object to save
 * @param {string} adminPassword - Admin password for authentication
 * @returns {Object} Success status
 */
exports.saveTeam = functions.https.onRequest(async (req, res) => {
  if (handleCors(req, res)) return;

  try {
    const user = await verifyAuth(req, res);
    if (!user) return;

    const { team } = req.body;

    if (!team || typeof team !== 'object' || !team.teamId) {
      return sendError(res, 400, 'invalid-argument', 'Valid team object with teamId is required');
    }

    functions.logger.info('Saving team:', team);
    await db.collection('known_teams').doc(String(team.teamId)).set(team);

    sendResponse(res, 200, { success: true });
  } catch (error) {
    functions.logger.error('Error in saveTeam:', error);
    sendError(res, 500, 'internal', `Failed to save team: ${error.message}`);
  }
});

/**
 * Cloud Function: setBatonHolder
 * Sets the current baton holder
 * Requires admin password
 *
 * @param {Object} holder - Holder object with team details
 * @param {string} adminPassword - Admin password for authentication
 * @returns {Object} Success status
 */
exports.setBatonHolder = functions.https.onRequest(async (req, res) => {
  if (handleCors(req, res)) return;

  try {
    const user = await verifyAuth(req, res);
    if (!user) return;

    const { holder } = req.body;

    if (!holder || typeof holder !== 'object') {
      return sendError(res, 400, 'invalid-argument', 'Holder object is required');
    }

    functions.logger.info('Setting baton holder:', holder);
    await db.collection('baton_current').doc('holder').set(holder);

    sendResponse(res, 200, { success: true });
  } catch (error) {
    functions.logger.error('Error in setBatonHolder:', error);
    sendError(res, 500, 'internal', `Failed to set baton holder: ${error.message}`);
  }
});

/**
 * Cloud Function: updatePlayers
 * Updates the players list in config
 * Requires admin password
 *
 * @param {Array} players - Array of player names
 * @param {string} adminPassword - Admin password for authentication
 * @returns {Object} Success status
 */
exports.updatePlayers = functions.https.onRequest(async (req, res) => {
  if (handleCors(req, res)) return;

  try {
    const user = await verifyAuth(req, res);
    if (!user) return;

    const { players } = req.body;

    if (!Array.isArray(players)) {
      return sendError(res, 400, 'invalid-argument', 'Players must be an array');
    }

    functions.logger.info('Updating players:', players);
    await db.collection('config').doc('players').set({ list: players });

    sendResponse(res, 200, { success: true });
  } catch (error) {
    functions.logger.error('Error in updatePlayers:', error);
    sendError(res, 500, 'internal', `Failed to update players: ${error.message}`);
  }
});

/**
 * Cloud Function: updateFineReasons
 * Updates the fine reasons list in config
 * Requires admin password
 *
 * @param {Array} fineReasons - Array of fine reason objects
 * @param {string} adminPassword - Admin password for authentication
 * @returns {Object} Success status
 */
exports.updateFineReasons = functions.https.onRequest(async (req, res) => {
  if (handleCors(req, res)) return;

  try {
    const user = await verifyAuth(req, res);
    if (!user) return;

    const { fineReasons } = req.body;

    if (!Array.isArray(fineReasons)) {
      return sendError(res, 400, 'invalid-argument', 'Fine reasons must be an array');
    }

    functions.logger.info('Updating fine reasons:', fineReasons);
    await db.collection('config').doc('fineReasons').set({ list: fineReasons });

    sendResponse(res, 200, { success: true });
  } catch (error) {
    functions.logger.error('Error in updateFineReasons:', error);
    sendError(res, 500, 'internal', `Failed to update fine reasons: ${error.message}`);
  }
});

/**
 * Cloud Function: deleteAllFines
 * Deletes all fines from the database (for data management)
 * Requires admin password
 *
 * @param {string} adminPassword - Admin password for authentication
 * @returns {Object} Success status with count
 */
exports.deleteAllFines = functions.https.onRequest(async (req, res) => {
  if (handleCors(req, res)) return;

  try {
    const user = await verifyAuth(req, res);
    if (!user) return;

    functions.logger.info('Deleting all fines');
    const snapshot = await db.collection('fines').get();
    const batch = db.batch();
    let count = 0;

    snapshot.forEach(doc => {
      batch.delete(doc.ref);
      count++;
    });

    await batch.commit();
    functions.logger.info(`Deleted ${count} fines`);

    sendResponse(res, 200, { success: true, count });
  } catch (error) {
    functions.logger.error('Error in deleteAllFines:', error);
    sendError(res, 500, 'internal', `Failed to delete all fines: ${error.message}`);
  }
});

// ==============================================
// EA PRO CLUBS API FUNCTIONS
// ==============================================

/**
 * Helper function to call EA Pro Clubs API
 */
async function callEaProClubsAPI(endpoint, params = {}) {
  const queryString = new URLSearchParams(params).toString();
  const url = `${EA_API_BASE_URL}${endpoint}${queryString ? '?' + queryString : ''}`;

  functions.logger.info('Calling EA API:', url);

  const response = await fetch(url, {
    method: 'GET',
    headers: EA_API_HEADERS,
    timeout: 10000
  });

  if (!response.ok) {
    const errorText = await response.text();
    functions.logger.error('EA API error:', response.status, errorText);
    throw new Error(`EA API request failed: ${response.status}`);
  }

  const data = await response.json();
  return data;
}

/**
 * Get Pro Clubs Match History - HTTP trigger (public)
 * Returns recent matches with scores and player stats
 */
exports.getProClubsMatches = functions.https.onRequest(async (req, res) => {
  if (handleCors(req, res)) return;

  try {
    const user = await verifyAuth(req, res);
    if (!user) return;

    const matchType = req.query.matchType || req.body?.matchType || 'leagueMatch';
    const clubId = req.query.clubId || req.body?.clubId || EA_CLUB_ID;

    functions.logger.info(`Fetching Pro Clubs matches for club ${clubId}, type: ${matchType}`);

    const data = await callEaProClubsAPI('clubs/matches', {
      platform: EA_PLATFORM,
      clubIds: clubId,
      matchType: matchType,
      maxResultCount: 10
    });

    // Transform the response to a cleaner format
    const matches = [];

    if (data && Array.isArray(data)) {
      for (const match of data) {
        // Find our club and opponent in the match data
        const clubs = match.clubs || {};
        const clubIds = Object.keys(clubs);

        let ourClub = null;
        let opponentClub = null;

        for (const id of clubIds) {
          if (id === clubId) {
            ourClub = { id, ...clubs[id] };
          } else {
            opponentClub = { id, ...clubs[id] };
          }
        }

        // Get player stats for our club
        const players = match.players || {};
        const ourPlayers = players[clubId] || {};

        const playerStats = Object.entries(ourPlayers).map(([playerId, stats]) => ({
          playerId,
          name: stats.playername || 'Unknown',
          position: stats.pos || 'ANY',
          rating: parseFloat(stats.rating) || 0,
          goals: parseInt(stats.goals) || 0,
          assists: parseInt(stats.assists) || 0,
          mom: stats.mom === '1' // Man of the match
        }));

        matches.push({
          matchId: match.matchId,
          timestamp: match.timestamp ? new Date(parseInt(match.timestamp) * 1000).toISOString() : null,
          matchType: matchType,
          result: ourClub ? (
            parseInt(ourClub.goals) > parseInt(opponentClub?.goals || 0) ? 'WIN' :
            parseInt(ourClub.goals) < parseInt(opponentClub?.goals || 0) ? 'LOSS' : 'DRAW'
          ) : 'UNKNOWN',
          ourScore: ourClub ? parseInt(ourClub.goals) || 0 : 0,
          opponentScore: opponentClub ? parseInt(opponentClub.goals) || 0 : 0,
          ourClubName: ourClub?.details?.name || 'Benidorm United',
          opponentClubName: opponentClub?.details?.name || 'Unknown',
          players: playerStats.sort((a, b) => b.rating - a.rating)
        });
      }
    }

    sendResponse(res, 200, {
      clubId,
      matchType,
      matchCount: matches.length,
      matches
    });

  } catch (error) {
    functions.logger.error('getProClubsMatches error:', error.message);
    sendError(res, 500, 'internal', `Failed to fetch Pro Clubs matches: ${error.message}`);
  }
});

/**
 * Get Pro Clubs Squad - HTTP trigger (public)
 * Returns squad members with stats and ratings
 */
exports.getProClubsSquad = functions.https.onRequest(async (req, res) => {
  if (handleCors(req, res)) return;

  try {
    const user = await verifyAuth(req, res);
    if (!user) return;

    const clubId = req.query.clubId || req.body?.clubId || EA_CLUB_ID;

    functions.logger.info(`Fetching Pro Clubs squad for club ${clubId}`);

    const data = await callEaProClubsAPI('members/stats', {
      platform: EA_PLATFORM,
      clubId: clubId
    });

    // Transform the response
    const members = [];

    if (data && data.members && Array.isArray(data.members)) {
      for (const member of data.members) {
        members.push({
          name: member.name || 'Unknown',
          gamesPlayed: parseInt(member.gamesPlayed) || 0,
          goals: parseInt(member.goals) || 0,
          assists: parseInt(member.assists) || 0,
          cleanSheets: parseInt(member.cleanSheetsDef) || parseInt(member.cleanSheetsGK) || 0,
          winRate: member.gamesPlayed > 0
            ? Math.round((parseInt(member.wins) || 0) / parseInt(member.gamesPlayed) * 100)
            : 0,
          favoritePosition: member.favoritePosition || 'ANY',
          proOverall: parseInt(member.proOverall) || 0,
          proHeight: member.proHeight || null,
          manOfTheMatch: parseInt(member.manOfTheMatch) || 0
        });
      }
    }

    sendResponse(res, 200, {
      clubId,
      memberCount: members.length,
      members: members.sort((a, b) => b.gamesPlayed - a.gamesPlayed)
    });

  } catch (error) {
    functions.logger.error('getProClubsSquad error:', error.message);
    sendError(res, 500, 'internal', `Failed to fetch Pro Clubs squad: ${error.message}`);
  }
});

/**
 * Get Pro Clubs Club Info - HTTP trigger (public)
 * Returns club details and overall stats
 */
exports.getProClubsInfo = functions.https.onRequest(async (req, res) => {
  if (handleCors(req, res)) return;

  try {
    const user = await verifyAuth(req, res);
    if (!user) return;

    const clubId = req.query.clubId || req.body?.clubId || EA_CLUB_ID;

    functions.logger.info(`Fetching Pro Clubs info for club ${clubId}`);

    const data = await callEaProClubsAPI('clubs/info', {
      platform: EA_PLATFORM,
      clubIds: clubId
    });

    // The response is keyed by club ID
    const clubData = data && data[clubId] ? data[clubId] : null;

    if (!clubData) {
      return sendError(res, 404, 'not-found', 'Club not found');
    }

    sendResponse(res, 200, {
      clubId,
      name: clubData.name || 'Unknown',
      wins: parseInt(clubData.wins) || 0,
      losses: parseInt(clubData.losses) || 0,
      ties: parseInt(clubData.ties) || 0,
      gamesPlayed: parseInt(clubData.gamesPlayed) || 0,
      goals: parseInt(clubData.goals) || 0,
      goalsAgainst: parseInt(clubData.goalsAgainst) || 0,
      skillRating: parseInt(clubData.skillRating) || 0,
      divisionRank: parseInt(clubData.divisionRank) || 0,
      currentDivision: parseInt(clubData.currentDivision) || 0
    });

  } catch (error) {
    functions.logger.error('getProClubsInfo error:', error.message);
    sendError(res, 500, 'internal', `Failed to fetch Pro Clubs info: ${error.message}`);
  }
});

// ==============================================
// PRO CLUBS MATCH LOGGING FUNCTIONS
// ==============================================

/**
 * Helper function to fetch matches from EA and log new ones to Firestore
 * Returns count of new matches logged
 */
async function fetchAndLogNewMatches() {
  const clubId = EA_CLUB_ID;
  const matchTypes = ['leagueMatch', 'playoffMatch', 'friendlyMatch'];

  // Fetch latest matches from EA across all match types
  let allMatches = [];
  for (const matchType of matchTypes) {
    try {
      const data = await callEaProClubsAPI('clubs/matches', {
        platform: EA_PLATFORM,
        clubIds: clubId,
        matchType: matchType,
        maxResultCount: 50
      });

      if (data && Array.isArray(data) && data.length > 0) {
        // Tag each match with its type
        for (const match of data) {
          match._matchType = matchType;
        }
        allMatches = allMatches.concat(data);
        functions.logger.info(`Fetched ${data.length} ${matchType} matches from EA API`);
      } else {
        functions.logger.info(`No ${matchType} matches returned from EA API`);
      }
    } catch (error) {
      functions.logger.warn(`Failed to fetch ${matchType} matches: ${error.message}`);
    }
  }

  if (allMatches.length === 0) {
    functions.logger.info('No matches returned from EA API across all match types');
    return { logged: 0, skipped: 0 };
  }

  let logged = 0;
  let skipped = 0;

  for (const match of allMatches) {
    const matchId = match.matchId;

    // Check if match already exists in Firestore
    const existingDoc = await db.collection('proClubsMatches').doc(matchId).get();

    if (existingDoc.exists) {
      skipped++;
      continue; // Skip duplicate
    }

    // Parse match data
    const clubs = match.clubs || {};
    const clubIds = Object.keys(clubs);

    let ourClub = null;
    let opponentClub = null;

    for (const id of clubIds) {
      if (id === clubId) {
        ourClub = { id, ...clubs[id] };
      } else {
        opponentClub = { id, ...clubs[id] };
      }
    }

    // Get player stats for our club
    const players = match.players || {};
    const ourPlayers = players[clubId] || {};

    // Log first player's raw stats for debugging (only once)
    if (logged === 0 && Object.keys(ourPlayers).length > 0) {
      const firstPlayer = Object.values(ourPlayers)[0];
      functions.logger.info('Sample player raw stats:', JSON.stringify(firstPlayer));
    }

    const playerStats = Object.entries(ourPlayers).map(([playerId, stats]) => ({
      playerId,
      name: stats.playername || 'Unknown',
      position: stats.pos || 'ANY',
      rating: parseFloat(stats.rating) || 0,
      mom: stats.mom === '1'
    }));

    // Determine result
    const ourScore = ourClub ? parseInt(ourClub.goals) || 0 : 0;
    const opponentScore = opponentClub ? parseInt(opponentClub.goals) || 0 : 0;
    const result = ourScore > opponentScore ? 'WIN' :
                   ourScore < opponentScore ? 'LOSS' : 'DRAW';

    // Save to Firestore
    await db.collection('proClubsMatches').doc(matchId).set({
      matchId,
      matchType: match._matchType || 'leagueMatch',
      timestamp: match.timestamp ? new Date(parseInt(match.timestamp) * 1000) : null,
      result,
      ourScore,
      opponentScore,
      opponentName: opponentClub?.details?.name || 'Unknown',
      players: playerStats,
      loggedAt: admin.firestore.FieldValue.serverTimestamp()
    });

    logged++;
    functions.logger.info(`Logged match ${matchId}: ${result} ${ourScore}-${opponentScore} vs ${opponentClub?.details?.name}`);
  }

  return { logged, skipped };
}

/**
 * Scheduled function - runs at 1am UK time daily
 * Fetches latest matches and logs new ones
 */
exports.scheduledMatchLog = functions.pubsub
  .schedule('0 1 * * *')
  .timeZone('Europe/London')
  .onRun(async (context) => {
    functions.logger.info('Running scheduled match log at 1am UK time');

    try {
      const result = await fetchAndLogNewMatches();
      functions.logger.info(`Scheduled log complete: ${result.logged} new, ${result.skipped} duplicates skipped`);
      return null;
    } catch (error) {
      functions.logger.error('Scheduled match log failed:', error.message);
      throw error;
    }
  });

/**
 * Manual match log - HTTP trigger
 * Fetches latest matches and logs new ones (same logic, manual trigger)
 */
exports.logProClubsMatches = functions.https.onRequest(async (req, res) => {
  if (handleCors(req, res)) return;

  try {
    const user = await verifyAuth(req, res);
    if (!user) return;

    functions.logger.info('Manual match log triggered');

    const result = await fetchAndLogNewMatches();

    sendResponse(res, 200, {
      success: true,
      logged: result.logged,
      skipped: result.skipped,
      message: `Logged ${result.logged} new matches, skipped ${result.skipped} duplicates`
    });

  } catch (error) {
    functions.logger.error('Manual match log failed:', error.message);
    sendError(res, 500, 'internal', `Failed to log matches: ${error.message}`);
  }
});

/**
 * Clear and re-log all matches (to update with new fields like position)
 */
exports.relogAllMatches = functions.https.onRequest(async (req, res) => {
  if (handleCors(req, res)) return;

  try {
    const user = await verifySuperAdmin(req, res);
    if (!user) return;

    functions.logger.info('Clearing and re-logging all matches...');

    // Delete all existing logged matches
    const snapshot = await db.collection('proClubsMatches').get();
    const batch = db.batch();
    snapshot.forEach(doc => {
      batch.delete(doc.ref);
    });
    await batch.commit();
    functions.logger.info(`Deleted ${snapshot.size} existing matches`);

    // Re-log matches
    const result = await fetchAndLogNewMatches();

    sendResponse(res, 200, {
      success: true,
      deleted: snapshot.size,
      logged: result.logged,
      message: `Deleted ${snapshot.size} old matches, logged ${result.logged} matches with updated fields`
    });

  } catch (error) {
    functions.logger.error('relogAllMatches error:', error.message);
    sendError(res, 500, 'internal', `Failed to re-log matches: ${error.message}`);
  }
});

/**
 * Get logged match history from Firestore
 * Returns all stored matches, sorted by timestamp descending
 */
exports.getLoggedMatches = functions.https.onRequest(async (req, res) => {
  if (handleCors(req, res)) return;

  try {
    const user = await verifyAuth(req, res);
    if (!user) return;

    const snapshot = await db.collection('proClubsMatches')
      .orderBy('timestamp', 'desc')
      .get();

    const matches = [];
    snapshot.forEach(doc => {
      const data = doc.data();
      matches.push({
        matchId: data.matchId,
        matchType: data.matchType || 'leagueMatch',
        timestamp: data.timestamp ? data.timestamp.toDate().toISOString() : null,
        result: data.result,
        ourScore: data.ourScore,
        opponentScore: data.opponentScore,
        opponentName: data.opponentName,
        players: data.players || [],
        anyPlayer: data.anyPlayer || null
      });
    });

    sendResponse(res, 200, {
      matchCount: matches.length,
      matches
    });

  } catch (error) {
    functions.logger.error('getLoggedMatches error:', error.message);
    sendError(res, 500, 'internal', `Failed to get logged matches: ${error.message}`);
  }
});

/**
 * Update the ANY player for a specific match
 * Sets who was controlling the AI players during that match
 */
exports.updateMatchAnyPlayer = functions.https.onRequest(async (req, res) => {
  if (handleCors(req, res)) return;

  try {
    const user = await verifyAuth(req, res);
    if (!user) return;

    // Failsafe: support both raw body and data-wrapped body (e.g. Firebase callable style)
    const body = req.body.data || req.body;
    const { matchId, anyPlayer } = body;

    if (!matchId) {
      return sendError(res, 400, 'invalid-argument', 'matchId is required');
    }

    const matchRef = db.collection('proClubsMatches').doc(matchId);
    const matchDoc = await matchRef.get();

    if (!matchDoc.exists) {
      return sendError(res, 404, 'not-found', `Match ${matchId} not found`);
    }

    await matchRef.update({
      anyPlayer: anyPlayer || null
    });

    functions.logger.info(`Updated match ${matchId} ANY player to: ${anyPlayer || 'none'}`);

    sendResponse(res, 200, {
      success: true,
      matchId,
      anyPlayer: anyPlayer || null
    });

  } catch (error) {
    functions.logger.error('updateMatchAnyPlayer error:', error.message);
    sendError(res, 500, 'internal', `Failed to update match: ${error.message}`);
  }
});

// ==============================================
// USER AUTHENTICATION & PLAYER NAME FUNCTIONS
// ==============================================

/**
 * Cloud Function: claimPlayerName
 * Claims a player name for the authenticated user (with Firestore transaction)
 */
exports.claimPlayerName = functions.https.onRequest(async (req, res) => {
  if (handleCors(req, res)) return;

  try {
    const user = await verifyAuth(req, res);
    if (!user) return;

    const { playerName } = req.body;

    if (!playerName || typeof playerName !== 'string' || playerName.trim().length === 0) {
      return sendError(res, 400, 'invalid-argument', 'Player name is required');
    }

    await db.runTransaction(async (transaction) => {
      // Check if name is already claimed
      const claimRef = db.collection('playerNames').doc(playerName);
      const claimDoc = await transaction.get(claimRef);

      if (claimDoc.exists && claimDoc.data().uid !== user.uid) {
        throw new Error('Name already claimed by another user');
      }

      // Check if user already has a different claim — release it
      const userRef = db.collection('users').doc(user.uid);
      const userDoc = await transaction.get(userRef);
      if (userDoc.exists && userDoc.data().playerName && userDoc.data().playerName !== playerName) {
        const oldClaimRef = db.collection('playerNames').doc(userDoc.data().playerName);
        transaction.delete(oldClaimRef);
      }

      // Claim the name
      transaction.set(claimRef, { uid: user.uid, claimedAt: new Date().toISOString() });
      transaction.set(userRef, {
        email: user.email || '',
        displayName: user.name || user.email || '',
        playerName: playerName,
        photoURL: user.picture || '',
        createdAt: (userDoc.exists && userDoc.data().createdAt) ? userDoc.data().createdAt : new Date().toISOString()
      });
    });

    sendResponse(res, 200, { success: true });
  } catch (error) {
    functions.logger.error('Error in claimPlayerName:', error);
    sendError(res, 400, 'already-claimed', error.message);
  }
});

/**
 * Cloud Function: updatePlayerMappings
 * Updates the player name mappings in config (replaces direct client setDoc)
 */
exports.updatePlayerMappings = functions.https.onRequest(async (req, res) => {
  if (handleCors(req, res)) return;

  try {
    const user = await verifyAuth(req, res);
    if (!user) return;

    const { mappings } = req.body;
    await db.collection('config').doc('playerMappings').set({ mappings });
    sendResponse(res, 200, { success: true });
  } catch (error) {
    functions.logger.error('Error in updatePlayerMappings:', error);
    sendError(res, 500, 'internal', `Failed to update mappings: ${error.message}`);
  }
});

/**
 * Cloud Function: checkSuperAdmin
 * Returns whether the authenticated user is a super admin
 */
exports.checkSuperAdmin = functions.https.onRequest(async (req, res) => {
  if (handleCors(req, res)) return;

  try {
    const user = await verifyAuth(req, res);
    if (!user) return;

    sendResponse(res, 200, { isSuperAdmin: user.email === SUPER_ADMIN_EMAIL });
  } catch (error) {
    functions.logger.error('Error in checkSuperAdmin:', error);
    sendError(res, 500, 'internal', error.message);
  }
});

/**
 * Cloud Function: reassignPlayerName
 * Super admin: reassign a player name to a different user
 */
exports.reassignPlayerName = functions.https.onRequest(async (req, res) => {
  if (handleCors(req, res)) return;

  try {
    const user = await verifySuperAdmin(req, res);
    if (!user) return;

    const { targetUid, newPlayerName } = req.body;

    if (!targetUid || !newPlayerName) {
      return sendError(res, 400, 'invalid-argument', 'targetUid and newPlayerName are required');
    }

    await db.runTransaction(async (transaction) => {
      const userRef = db.collection('users').doc(targetUid);
      const userDoc = await transaction.get(userRef);

      if (!userDoc.exists) {
        throw new Error('User not found');
      }

      // Release old claim if exists
      const oldName = userDoc.data().playerName;
      if (oldName) {
        transaction.delete(db.collection('playerNames').doc(oldName));
      }

      // Check new name availability
      const newClaimRef = db.collection('playerNames').doc(newPlayerName);
      const newClaimDoc = await transaction.get(newClaimRef);
      if (newClaimDoc.exists && newClaimDoc.data().uid !== targetUid) {
        throw new Error('Name already claimed by another user');
      }

      // Set new claim
      transaction.set(newClaimRef, { uid: targetUid, claimedAt: new Date().toISOString() });
      transaction.update(userRef, { playerName: newPlayerName });
    });

    sendResponse(res, 200, { success: true });
  } catch (error) {
    functions.logger.error('Error in reassignPlayerName:', error);
    sendError(res, 400, 'failed', error.message);
  }
});

/**
 * Cloud Function: removeUserClaim
 * Super admin: remove a user's player name claim
 */
exports.removeUserClaim = functions.https.onRequest(async (req, res) => {
  if (handleCors(req, res)) return;

  try {
    const user = await verifySuperAdmin(req, res);
    if (!user) return;

    const { targetUid } = req.body;

    if (!targetUid) {
      return sendError(res, 400, 'invalid-argument', 'targetUid is required');
    }

    await db.runTransaction(async (transaction) => {
      const userRef = db.collection('users').doc(targetUid);
      const userDoc = await transaction.get(userRef);

      if (!userDoc.exists) {
        throw new Error('User not found');
      }

      const playerName = userDoc.data().playerName;
      if (playerName) {
        transaction.delete(db.collection('playerNames').doc(playerName));
      }
      transaction.update(userRef, { playerName: null });
    });

    sendResponse(res, 200, { success: true });
  } catch (error) {
    functions.logger.error('Error in removeUserClaim:', error);
    sendError(res, 500, 'internal', error.message);
  }
});

/**
 * Cloud Function: listAllUsers
 * Super admin: list all registered users
 */
exports.listAllUsers = functions.https.onRequest(async (req, res) => {
  if (handleCors(req, res)) return;

  try {
    const user = await verifySuperAdmin(req, res);
    if (!user) return;

    const snapshot = await db.collection('users').get();
    const users = [];
    snapshot.forEach(doc => {
      users.push({ uid: doc.id, ...doc.data() });
    });

    sendResponse(res, 200, { users });
  } catch (error) {
    functions.logger.error('Error in listAllUsers:', error);
    sendError(res, 500, 'internal', error.message);
  }
});

/**
 * Cloud Function: resetAllClaims
 * Super admin: clear all player name claims (everyone re-picks)
 */
exports.resetAllClaims = functions.https.onRequest(async (req, res) => {
  if (handleCors(req, res)) return;

  try {
    const user = await verifySuperAdmin(req, res);
    if (!user) return;

    const batch = db.batch();

    // Delete all playerNames docs
    const claimsSnapshot = await db.collection('playerNames').get();
    claimsSnapshot.forEach(doc => batch.delete(doc.ref));

    // Clear playerName from all users
    const usersSnapshot = await db.collection('users').get();
    usersSnapshot.forEach(doc => batch.update(doc.ref, { playerName: null }));

    await batch.commit();

    sendResponse(res, 200, { success: true, clearedClaims: claimsSnapshot.size, clearedUsers: usersSnapshot.size });
  } catch (error) {
    functions.logger.error('Error in resetAllClaims:', error);
    sendError(res, 500, 'internal', error.message);
  }
});
