const functions = require('firebase-functions');
const fetch = require('node-fetch');

// API-Football configuration
// Get API key from environment variable
const API_KEY = functions.config().football?.apikey || process.env.FOOTBALL_API_KEY;
const API_HOST = 'api-football-v3.p.rapidapi.com';
const API_BASE_URL = `https://${API_HOST}/`;

// Admin PIN configuration
// Set with: firebase functions:config:set admin.pin="YOUR_PIN"
const ADMIN_PIN = functions.config().admin?.pin || process.env.ADMIN_PIN || '1234';

// Helper function to validate admin access
function validateAdmin(pin) {
  if (!pin || pin !== ADMIN_PIN) {
    throw new functions.https.HttpsError(
      'permission-denied',
      'Invalid admin PIN'
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
      'X-RapidAPI-Key': API_KEY,
      'X-RapidAPI-Host': API_HOST
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
 *
 * @param {string} query - Team name to search for
 * @returns {Array} Array of team objects
 */
exports.searchTeams = functions.https.onCall(async (data, context) => {
  try {
    const { query } = data;

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
 *
 * @param {number} teamId - The team ID from API-Football
 * @returns {Object} Match object or null if no match found
 */
exports.getLatestCompetitiveMatch = functions.https.onCall(async (data, context) => {
  try {
    const { teamId } = data;

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
