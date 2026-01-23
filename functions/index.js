const functions = require('firebase-functions');
const fetch = require('node-fetch');

// API-Football configuration
// Get API key from environment variable
const API_KEY = functions.config().football?.apikey || process.env.FOOTBALL_API_KEY;
// Direct API-Football endpoint (not RapidAPI)
const API_BASE_URL = 'https://v3.football.api-sports.io/';

// Admin PIN configuration
// Set with: firebase functions:config:set admin.pin="YOUR_PIN"
const ADMIN_PIN = functions.config().admin?.pin || process.env.ADMIN_PIN || 'SquireyStu69!';

// Helper function to validate admin access
function validateAdmin(password) {
  if (!password || password !== ADMIN_PIN) {
    throw new functions.https.HttpsError(
      'permission-denied',
      'Invalid admin password'
    );
  }
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
exports.searchTeams = functions.https.onCall(async (data, context) => {
  try {
    const { query, adminPassword } = data;

    // Validate admin access
    validateAdmin(adminPassword);

    if (!query || typeof query !== 'string' || query.trim().length === 0) {
      throw new functions.https.HttpsError(
        'invalid-argument',
        'Query parameter is required and must be a non-empty string'
      );
    }

    functions.logger.info(`Searching teams with query: ${query}`);

    const result = await callFootballAPI('teams', { search: query.trim() });

    if (!result.response || !Array.isArray(result.response)) {
      return [];
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
    return teams;

  } catch (error) {
    functions.logger.error('Error in searchTeams:', error);

    if (error instanceof functions.https.HttpsError) {
      throw error;
    }

    throw new functions.https.HttpsError(
      'internal',
      `Failed to search teams: ${error.message}`
    );
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
exports.getLatestCompetitiveMatch = functions.https.onCall(async (data, context) => {
  try {
    const { teamId, adminPassword } = data;

    // Validate admin access
    validateAdmin(adminPassword);

    if (!teamId || typeof teamId !== 'number') {
      throw new functions.https.HttpsError(
        'invalid-argument',
        'teamId parameter is required and must be a number'
      );
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
      return null;
    }

    // Filter out friendlies - only keep competitive matches
    // Friendlies typically have league.type = "Cup" with league.name containing "Friendly"
    // or league.id in known friendly league IDs
    const competitiveMatches = result.response.filter(match => {
      const leagueName = match.league.name.toLowerCase();
      const leagueType = match.league.type;

      // Exclude matches with "friendly" in the name
      if (leagueName.includes('friendly') || leagueName.includes('friendlies')) {
        return false;
      }

      // Exclude club friendlies (league type = "Cup" with specific IDs)
      // Most competitive matches are either "League" or recognized cup competitions
      // Known friendly league IDs: 667 (Club Friendlies), etc.
      if (match.league.id === 667) {
        return false;
      }

      return true;
    });

    if (competitiveMatches.length === 0) {
      functions.logger.warn(`No competitive matches found for team: ${teamId}`);
      return null;
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
    return matchData;

  } catch (error) {
    functions.logger.error('Error in getLatestCompetitiveMatch:', error);

    if (error instanceof functions.https.HttpsError) {
      throw error;
    }

    throw new functions.https.HttpsError(
      'internal',
      `Failed to fetch latest match: ${error.message}`
    );
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
exports.updateBaton = functions.https.onCall(async (data, context) => {
  const admin = require('firebase-admin');

  // Initialize admin if not already done
  if (!admin.apps.length) {
    admin.initializeApp();
  }

  const db = admin.firestore();

  try {
    const { adminPassword } = data;

    // Validate admin access
    validateAdmin(adminPassword);

    functions.logger.info('Starting baton update check...');

    // 1. Read current baton holder
    const batonDoc = await db.collection('baton_current').doc('holder').get();

    if (!batonDoc.exists) {
      throw new functions.https.HttpsError(
        'not-found',
        'No baton holder set. Use Team ID Finder to set initial holder.'
      );
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
      return {
        status: 'no_update',
        message: `No finished matches found for ${holderTeamName}`,
        batonStayed: true,
        holder: holderTeamName
      };
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
      return {
        status: 'no_update',
        message: `No competitive matches found for ${holderTeamName}`,
        batonStayed: true,
        holder: holderTeamName
      };
    }

    // Sort by date and get most recent
    competitiveMatches.sort((a, b) => new Date(b.fixture.date) - new Date(a.fixture.date));
    const latestMatch = competitiveMatches[0];

    functions.logger.info(`Latest match ID: ${latestMatch.fixture.id}`);
    functions.logger.info(`Last processed match ID: ${lastProcessedMatchId}`);

    // 3. Anti-duplicate check
    if (lastProcessedMatchId && latestMatch.fixture.id === lastProcessedMatchId) {
      functions.logger.info('Match already processed');
      return {
        status: 'no_update',
        message: 'This match has already been processed',
        batonStayed: true,
        holder: holderTeamName
      };
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
      return {
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
      };
    } else {
      return {
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
      };
    }

  } catch (error) {
    functions.logger.error('Error in updateBaton:', error);

    if (error instanceof functions.https.HttpsError) {
      throw error;
    }

    throw new functions.https.HttpsError(
      'internal',
      `Failed to update baton: ${error.message}`
    );
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
exports.addFine = functions.https.onCall(async (data, context) => {
  const admin = require('firebase-admin');
  if (!admin.apps.length) {
    admin.initializeApp();
  }
  const db = admin.firestore();

  try {
    const { fine, adminPassword } = data;
    validateAdmin(adminPassword);

    if (!fine || typeof fine !== 'object') {
      throw new functions.https.HttpsError('invalid-argument', 'Fine object is required');
    }

    functions.logger.info('Adding fine:', fine);
    const docRef = await db.collection('fines').add(fine);

    return { success: true, fineId: docRef.id };
  } catch (error) {
    functions.logger.error('Error in addFine:', error);
    if (error instanceof functions.https.HttpsError) throw error;
    throw new functions.https.HttpsError('internal', `Failed to add fine: ${error.message}`);
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
exports.deleteFine = functions.https.onCall(async (data, context) => {
  const admin = require('firebase-admin');
  if (!admin.apps.length) {
    admin.initializeApp();
  }
  const db = admin.firestore();

  try {
    const { fineId, adminPassword } = data;
    validateAdmin(adminPassword);

    if (!fineId || typeof fineId !== 'string') {
      throw new functions.https.HttpsError('invalid-argument', 'Fine ID is required');
    }

    functions.logger.info('Deleting fine:', fineId);
    await db.collection('fines').doc(fineId).delete();

    return { success: true };
  } catch (error) {
    functions.logger.error('Error in deleteFine:', error);
    if (error instanceof functions.https.HttpsError) throw error;
    throw new functions.https.HttpsError('internal', `Failed to delete fine: ${error.message}`);
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
exports.updateFine = functions.https.onCall(async (data, context) => {
  const admin = require('firebase-admin');
  if (!admin.apps.length) {
    admin.initializeApp();
  }
  const db = admin.firestore();

  try {
    const { fineId, updates, adminPassword } = data;
    validateAdmin(adminPassword);

    if (!fineId || typeof fineId !== 'string') {
      throw new functions.https.HttpsError('invalid-argument', 'Fine ID is required');
    }
    if (!updates || typeof updates !== 'object') {
      throw new functions.https.HttpsError('invalid-argument', 'Updates object is required');
    }

    functions.logger.info('Updating fine:', fineId, updates);
    await db.collection('fines').doc(fineId).update(updates);

    return { success: true };
  } catch (error) {
    functions.logger.error('Error in updateFine:', error);
    if (error instanceof functions.https.HttpsError) throw error;
    throw new functions.https.HttpsError('internal', `Failed to update fine: ${error.message}`);
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
exports.addBatonEntry = functions.https.onCall(async (data, context) => {
  const admin = require('firebase-admin');
  if (!admin.apps.length) {
    admin.initializeApp();
  }
  const db = admin.firestore();

  try {
    const { entry, adminPassword } = data;
    validateAdmin(adminPassword);

    if (!entry || typeof entry !== 'object') {
      throw new functions.https.HttpsError('invalid-argument', 'Entry object is required');
    }

    functions.logger.info('Adding baton entry:', entry);
    const docRef = await db.collection('baton').add(entry);

    return { success: true, entryId: docRef.id };
  } catch (error) {
    functions.logger.error('Error in addBatonEntry:', error);
    if (error instanceof functions.https.HttpsError) throw error;
    throw new functions.https.HttpsError('internal', `Failed to add baton entry: ${error.message}`);
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
exports.deleteBatonEntry = functions.https.onCall(async (data, context) => {
  const admin = require('firebase-admin');
  if (!admin.apps.length) {
    admin.initializeApp();
  }
  const db = admin.firestore();

  try {
    const { entryId, adminPassword } = data;
    validateAdmin(adminPassword);

    if (!entryId || typeof entryId !== 'string') {
      throw new functions.https.HttpsError('invalid-argument', 'Entry ID is required');
    }

    functions.logger.info('Deleting baton entry:', entryId);
    await db.collection('baton').doc(entryId).delete();

    return { success: true };
  } catch (error) {
    functions.logger.error('Error in deleteBatonEntry:', error);
    if (error instanceof functions.https.HttpsError) throw error;
    throw new functions.https.HttpsError('internal', `Failed to delete baton entry: ${error.message}`);
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
exports.saveTeam = functions.https.onCall(async (data, context) => {
  const admin = require('firebase-admin');
  if (!admin.apps.length) {
    admin.initializeApp();
  }
  const db = admin.firestore();

  try {
    const { team, adminPassword } = data;
    validateAdmin(adminPassword);

    if (!team || typeof team !== 'object' || !team.teamId) {
      throw new functions.https.HttpsError('invalid-argument', 'Valid team object with teamId is required');
    }

    functions.logger.info('Saving team:', team);
    await db.collection('known_teams').doc(String(team.teamId)).set(team);

    return { success: true };
  } catch (error) {
    functions.logger.error('Error in saveTeam:', error);
    if (error instanceof functions.https.HttpsError) throw error;
    throw new functions.https.HttpsError('internal', `Failed to save team: ${error.message}`);
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
exports.setBatonHolder = functions.https.onCall(async (data, context) => {
  const admin = require('firebase-admin');
  if (!admin.apps.length) {
    admin.initializeApp();
  }
  const db = admin.firestore();

  try {
    const { holder, adminPassword } = data;
    validateAdmin(adminPassword);

    if (!holder || typeof holder !== 'object') {
      throw new functions.https.HttpsError('invalid-argument', 'Holder object is required');
    }

    functions.logger.info('Setting baton holder:', holder);
    await db.collection('baton_current').doc('holder').set(holder);

    return { success: true };
  } catch (error) {
    functions.logger.error('Error in setBatonHolder:', error);
    if (error instanceof functions.https.HttpsError) throw error;
    throw new functions.https.HttpsError('internal', `Failed to set baton holder: ${error.message}`);
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
exports.updatePlayers = functions.https.onCall(async (data, context) => {
  const admin = require('firebase-admin');
  if (!admin.apps.length) {
    admin.initializeApp();
  }
  const db = admin.firestore();

  try {
    const { players, adminPassword } = data;
    validateAdmin(adminPassword);

    if (!Array.isArray(players)) {
      throw new functions.https.HttpsError('invalid-argument', 'Players must be an array');
    }

    functions.logger.info('Updating players:', players);
    await db.collection('config').doc('players').set({ list: players });

    return { success: true };
  } catch (error) {
    functions.logger.error('Error in updatePlayers:', error);
    if (error instanceof functions.https.HttpsError) throw error;
    throw new functions.https.HttpsError('internal', `Failed to update players: ${error.message}`);
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
exports.updateFineReasons = functions.https.onCall(async (data, context) => {
  const admin = require('firebase-admin');
  if (!admin.apps.length) {
    admin.initializeApp();
  }
  const db = admin.firestore();

  try {
    const { fineReasons, adminPassword } = data;
    validateAdmin(adminPassword);

    if (!Array.isArray(fineReasons)) {
      throw new functions.https.HttpsError('invalid-argument', 'Fine reasons must be an array');
    }

    functions.logger.info('Updating fine reasons:', fineReasons);
    await db.collection('config').doc('fineReasons').set({ list: fineReasons });

    return { success: true };
  } catch (error) {
    functions.logger.error('Error in updateFineReasons:', error);
    if (error instanceof functions.https.HttpsError) throw error;
    throw new functions.https.HttpsError('internal', `Failed to update fine reasons: ${error.message}`);
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
exports.deleteAllFines = functions.https.onCall(async (data, context) => {
  const admin = require('firebase-admin');
  if (!admin.apps.length) {
    admin.initializeApp();
  }
  const db = admin.firestore();

  try {
    const { adminPassword } = data;
    validateAdmin(adminPassword);

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

    return { success: true, count };
  } catch (error) {
    functions.logger.error('Error in deleteAllFines:', error);
    if (error instanceof functions.https.HttpsError) throw error;
    throw new functions.https.HttpsError('internal', `Failed to delete all fines: ${error.message}`);
  }
});
