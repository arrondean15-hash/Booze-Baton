        import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js';
        import { getFirestore, collection, addDoc, getDocs, getDoc, deleteDoc, doc, updateDoc, onSnapshot, query, orderBy, limit, setDoc } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';
        import { getAuth, GoogleAuthProvider, signInWithPopup, signInWithRedirect, getRedirectResult, signOut, onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js';

        const firebaseConfig = {
            apiKey: "AIzaSyBixQ-BIuklK7p9Im-jnRzokXgoIJ7petI",
            authDomain: "booze-baton.firebaseapp.com",
            projectId: "booze-baton",
            storageBucket: "booze-baton.firebasestorage.app",
            messagingSenderId: "988291694611",
            appId: "1:988291694611:web:84f4e54eca2fccba733fe6"
        };

        const app = initializeApp(firebaseConfig);
        const db = getFirestore(app);
        const auth = getAuth(app);
        const googleProvider = new GoogleAuthProvider();

        // App version - UPDATE THESE BEFORE EACH DEPLOY
        const APP_VERSION = 'v3.1.0';
        const LAST_UPDATED = '08 Jun 2026';

        // Cloud Functions base URL
        const FUNCTIONS_URL = 'https://us-central1-booze-baton.cloudfunctions.net';

        // Helper to call HTTP Cloud Functions (with Firebase Auth token)
        async function callFunction(functionName, data = {}) {
            if (!currentUser) throw new Error('Not authenticated');

            const idToken = await currentUser.getIdToken();

            const response = await fetch(`${FUNCTIONS_URL}/${functionName}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${idToken}`
                },
                body: JSON.stringify(data)
            });

            const result = await response.json();

            if (result.error) {
                const error = new Error(result.error.message);
                error.code = result.error.code;
                throw error;
            }

            return result;
        }

        // Helper to make authenticated GET requests
        async function callFunctionGet(functionName, queryParams = null) {
            if (!currentUser) throw new Error('Not authenticated');

            const idToken = await currentUser.getIdToken();

            let queryString = '';
            if (queryParams && typeof queryParams === 'object') {
                queryString = new URLSearchParams(queryParams).toString();
            } else if (queryParams) {
                queryString = queryParams;
            }

            const url = queryString
                ? `${FUNCTIONS_URL}/${functionName}?${queryString}`
                : `${FUNCTIONS_URL}/${functionName}`;

            const response = await fetch(url, {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${idToken}`
                }
            });

            const result = await response.json();

            if (result.error) {
                const error = new Error(result.error.message);
                error.code = result.error.code;
                throw error;
            }

            return result;
        }

        let fineReasons = [
            { reason: "10 minutes late", amount: 2.00 },
            { reason: "Not declaring availability by 6.30pm (via poll)", amount: 2.50 },
            { reason: "No show after declaring available", amount: 5.00 },
            { reason: "Rage Quit", amount: 4.00 },
            { reason: "Being a worst", amount: 1.00 },
            { reason: "Not passing on a 2-1 and not scoring", amount: 2.00 },
            { reason: "Avoidable mistake leading to a goal", amount: 2.00 },
            { reason: "Red card", amount: 1.00 },
            { reason: "Unnecessary red card", amount: 2.00 },
            { reason: "Not attending booze baton", amount: 100.00 },
            { reason: "Fucking a lead (worst fine for each player responsible)", amount: 1.00 },
            { reason: "Losing 3 in a row (£2 per player)", amount: 2.00 },
            { reason: "Losing after 3 in a row", amount: 1.00 },
            { reason: "Obscene Spacker (Cost Benidorm Utd Win or Draw)", amount: 2.00 },
            { reason: "Average Rating Following Defeat (Attacker 6.9 and below, Midfield 6.4 and below, Defender inc CDM 5.9 and below)", amount: 2.00 },
            { reason: "First Half Red Card", amount: 3.00 },
            { reason: "Spirit of Booze baton", amount: 4.00 },
            { reason: "Repeatedly bringing up old fines", amount: 2.00 },
            { reason: "Unavailable (Sunday to Thursday)", amount: 5.00 },
            { reason: "3 Goal Loss", amount: 1.00 },
            { reason: "Each Goal after 3 goals (£1 per goal)", amount: 1.00 },
            { reason: "Away from Controller", amount: 3.00 },
            { reason: "Rating Fine (6.0 - 6.4)", amount: 1.00 },
            { reason: "Rating Fine (5.9 and below)", amount: 2.00 },
            { reason: "Team Agreed quit Game", amount: 1.00 },
            { reason: "25% Late Fine Increase", amount: 2.00 }
        ];

        let allFines = []; // Recent fines (limited to 200) - for realtime updates
        let allPlayers = [];
        let batonHistory = [];
        let currentPaidFineId = null;
        let currentDateRangeFilter = 'all';
        let selectedFineIds = new Set(); // For multi-select in History tab

        // Initialize date range filter variables
        window.dateRangeStart = null;
        window.dateRangeEnd = null;

        // FIRESTORE PERFORMANCE OPTIMIZATION
        // To prevent excessive reads (~89K/day on free tier), we:
        // 1. Limit realtime listeners to recent data only (200 fines, 50 baton)
        // 2. Store unsubscribe functions to prevent listener stacking
        // 3. Use cached full history with manual refresh for History tab
        // 4. Support ?dev=1 URL param to disable listeners during testing
        let finesUnsubscribe = null;
        let batonUnsubscribe = null;
        let cachedFullFines = []; // Full history for History tab - loaded manually
        let lastHistoryFetch = null;
        let didInit = false; // Prevent multiple init() calls
        let activeListenerCount = 0; // Track active snapshot listeners
        const isDevMode = new URLSearchParams(window.location.search).get('dev') === '1';

        // VOTING SYSTEM
        // Stores daily votes and leaderboard data
        let todayVotes = {}; // { odterId: { best: playerId, worst: playerId } }
        let allTimeVoteTotals = {}; // { playerId: { best: number, worst: number } }
        let lastNightResults = null; // { best: { name, votes }, worst: { name, votes } }
        let votingUnsubscribe = null; // Realtime listener for today's votes

        // Voting hours: 6am - 11:59pm
        const VOTING_OPEN_HOUR = 6;
        const VOTING_CLOSE_HOUR = 23;
        const VOTING_CLOSE_MINUTE = 59;

        // USER AUTHENTICATION STATE
        let currentUser = null;
        let currentPlayerName = null;
        let isSuperAdmin = false;

        // Handle redirect result on page load (for signInWithRedirect flow)
        getRedirectResult(auth).catch(() => {});

        // Auth state listener
        onAuthStateChanged(auth, async (user) => {
            if (user) {
                currentUser = user;
                try {
                    const userDoc = await getDoc(doc(db, 'users', user.uid));
                    if (userDoc.exists() && userDoc.data().playerName) {
                        currentPlayerName = userDoc.data().playerName;
                        // Check super admin status
                        try {
                            const adminCheck = await callFunction('checkSuperAdmin', {});
                            isSuperAdmin = (adminCheck.data && adminCheck.data.isSuperAdmin) || false;
                        } catch (e) {
                            isSuperAdmin = false;
                        }
                        showApp();
                        didInit = false; // Reset so init() can re-run after sign-out/sign-in
                        init();
                    } else {
                        showPlayerPicker();
                    }
                } catch (error) {
                    console.error('Error loading user profile:', error);
                    showPlayerPicker();
                }
            } else {
                currentUser = null;
                currentPlayerName = null;
                isSuperAdmin = false;
                cleanupListeners();
                showLoginScreen();
            }
        });

        // Sign in with Google (popup with redirect fallback)
        async function signInWithGoogle() {
            const spinner = document.getElementById('loginSpinner');
            if (spinner) spinner.classList.add('active');
            try {
                await signInWithPopup(auth, googleProvider);
            } catch (error) {
                if (error.code === 'auth/popup-blocked' ||
                    error.code === 'auth/popup-closed-by-user' ||
                    error.code === 'auth/cancelled-popup-request') {
                    await signInWithRedirect(auth, googleProvider);
                } else {
                    console.error('Sign-in error:', error);
                    if (spinner) spinner.classList.remove('active');
                    showToast('Sign-in failed: ' + error.message, 'error');
                }
            }
        }
        window.signInWithGoogle = signInWithGoogle;

        // Sign out
        async function handleSignOut() {
            try {
                await signOut(auth);
                // onAuthStateChanged handles cleanup
            } catch (error) {
                console.error('Sign-out error:', error);
                showToast('Sign-out failed', 'error');
            }
        }
        window.handleSignOut = handleSignOut;

        // Cleanup all Firestore listeners on sign-out
        function cleanupListeners() {
            if (finesUnsubscribe) { finesUnsubscribe(); finesUnsubscribe = null; }
            if (batonUnsubscribe) { batonUnsubscribe(); batonUnsubscribe = null; }
            if (votingUnsubscribe) { votingUnsubscribe(); votingUnsubscribe = null; }
        }

        // Show/hide screens based on auth state
        function showLoginScreen() {
            const loginScreen = document.getElementById('loginScreen');
            const appShell = document.querySelector('.app-shell');
            const tabBar = document.querySelector('.tab-bar');
            const picker = document.getElementById('playerPickerModal');
            if (loginScreen) loginScreen.classList.remove('hidden');
            if (appShell) appShell.classList.remove('authenticated');
            if (tabBar) tabBar.style.display = 'none';
            if (picker) picker.classList.remove('active');
        }

        function showApp() {
            const loginScreen = document.getElementById('loginScreen');
            const appShell = document.querySelector('.app-shell');
            const tabBar = document.querySelector('.tab-bar');
            const picker = document.getElementById('playerPickerModal');
            if (loginScreen) loginScreen.classList.add('hidden');
            if (appShell) appShell.classList.add('authenticated');
            if (tabBar) tabBar.style.display = '';
            if (picker) picker.classList.remove('active');
            updateProfileUI();
        }

        function showPlayerPicker() {
            const loginScreen = document.getElementById('loginScreen');
            const appShell = document.querySelector('.app-shell');
            const tabBar = document.querySelector('.tab-bar');
            const picker = document.getElementById('playerPickerModal');
            if (loginScreen) loginScreen.classList.add('hidden');
            if (appShell) appShell.classList.remove('authenticated');
            if (tabBar) tabBar.style.display = 'none';
            if (picker) picker.classList.add('active');
            loadPlayerPickerOptions();
        }

        // Load available player names for the picker
        async function loadPlayerPickerOptions() {
            const select = document.getElementById('playerPickerSelect');
            if (!select) return;

            select.innerHTML = '<option value="">Loading...</option>';

            try {
                // Load player list from config
                const playersDoc = await getDoc(doc(db, 'config', 'players'));
                const playerList = playersDoc.exists() ? (playersDoc.data().list || []) : [];

                // Load claimed names
                const claimsSnapshot = await getDocs(collection(db, 'playerNames'));
                const claimedNames = new Set();
                claimsSnapshot.forEach(d => claimedNames.add(d.id));

                // Player list may be objects ({name: "Arron", ...}) or strings
                const playerNames = playerList.map(p => typeof p === 'object' ? p.name : p);

                // Show only unclaimed names (plus current user's name if changing)
                const availableNames = playerNames.filter(name =>
                    !claimedNames.has(name) || (currentPlayerName && name === currentPlayerName)
                );

                select.innerHTML = '<option value="">Select your name...</option>';
                availableNames.forEach(name => {
                    const option = document.createElement('option');
                    option.value = name;
                    option.textContent = name;
                    select.appendChild(option);
                });

                if (availableNames.length === 0) {
                    select.innerHTML = '<option value="">No names available</option>';
                }
            } catch (error) {
                console.error('Error loading player names:', error);
                select.innerHTML = '<option value="">Error loading names</option>';
            }
        }

        // Confirm player name pick
        async function confirmPlayerPick() {
            const select = document.getElementById('playerPickerSelect');
            const errorEl = document.getElementById('pickerError');
            const playerName = select ? select.value : '';

            if (!playerName) {
                if (errorEl) { errorEl.textContent = 'Please select a name'; errorEl.style.display = 'block'; }
                return;
            }

            if (errorEl) errorEl.style.display = 'none';

            try {
                await callFunction('claimPlayerName', { playerName });
                currentPlayerName = playerName;

                // Check super admin
                try {
                    const adminCheck = await callFunction('checkSuperAdmin', {});
                    isSuperAdmin = (adminCheck.data && adminCheck.data.isSuperAdmin) || false;
                } catch (e) {
                    isSuperAdmin = false;
                }

                showApp();
                didInit = false;
                init();
                showToast(`Welcome, ${playerName}!`, 'success');
            } catch (error) {
                console.error('Error claiming name:', error);
                if (errorEl) { errorEl.textContent = error.message || 'Failed to claim name'; errorEl.style.display = 'block'; }
            }
        }
        window.confirmPlayerPick = confirmPlayerPick;

        function showNotListedMessage() {
            const errorEl = document.getElementById('pickerError');
            if (errorEl) {
                errorEl.textContent = 'Contact the group admin to be added as a player.';
                errorEl.style.display = 'block';
            }
        }
        window.showNotListedMessage = showNotListedMessage;

        // Open player picker from settings (to change name)
        function openPlayerPicker() {
            showPlayerPicker();
        }
        window.openPlayerPicker = openPlayerPicker;

        // Update profile UI elements
        function updateProfileUI() {
            if (!currentUser) return;

            const displayName = currentUser.displayName || currentUser.email || '';
            const email = currentUser.email || '';
            const photoURL = currentUser.photoURL || '';
            const initial = (currentPlayerName || displayName || '?')[0].toUpperCase();

            // Header avatar
            const headerAvatar = document.getElementById('headerUserAvatar');
            if (headerAvatar) {
                if (photoURL) {
                    headerAvatar.outerHTML = `<img id="headerUserAvatar" class="user-avatar" src="${photoURL}" alt="${initial}" onerror="this.outerHTML='<div id=headerUserAvatar class=user-avatar-fallback>${initial}</div>'">`;
                } else {
                    headerAvatar.textContent = initial;
                }
            }

            // Settings profile card
            const profileName = document.getElementById('profileDisplayName');
            const profileEmail = document.getElementById('profileEmail');
            const profilePlayer = document.getElementById('profilePlayerName');
            const profileAvatar = document.getElementById('profileAvatarLarge');

            if (profileName) profileName.textContent = displayName;
            if (profileEmail) profileEmail.textContent = email;
            if (profilePlayer) profilePlayer.textContent = currentPlayerName || 'Not set';

            if (profileAvatar) {
                if (photoURL) {
                    profileAvatar.outerHTML = `<img id="profileAvatarLarge" class="profile-avatar-large" src="${photoURL}" alt="${initial}" onerror="this.outerHTML='<div id=profileAvatarLarge class=profile-avatar-large-fallback>${initial}</div>'">`;
                } else {
                    profileAvatar.textContent = initial;
                }
            }

            // Voting player name display
            const votingName = document.getElementById('votingPlayerName');
            if (votingName) votingName.textContent = currentPlayerName || '-';

            // Super admin panel
            const superAdminPanel = document.getElementById('superAdminPanel');
            if (superAdminPanel) {
                if (isSuperAdmin) {
                    superAdminPanel.classList.add('visible');
                } else {
                    superAdminPanel.classList.remove('visible');
                }
            }

            // Destructive data controls (replace-all import, clear all fines) — super admin only.
            // Backend also enforces this (deleteAllFines uses verifySuperAdmin); this just hides dead buttons.
            const adminReplaceImport = document.getElementById('adminReplaceImportGroup');
            if (adminReplaceImport) adminReplaceImport.style.display = isSuperAdmin ? '' : 'none';
            const clearAllFinesBtn = document.getElementById('clearAllFinesBtn');
            if (clearAllFinesBtn) clearAllFinesBtn.style.display = isSuperAdmin ? '' : 'none';

            // Vote admin section - always visible for logged-in users
            const voteAdminSection = document.getElementById('voteAdminSection');
            if (voteAdminSection) voteAdminSection.style.display = 'block';
        }

        // Super admin functions
        let superAdminUsersList = [];

        async function loadSuperAdminUsers() {
            try {
                showLoading('Loading users...');
                const result = await callFunction('listAllUsers', {});
                hideLoading();
                superAdminUsersList = (result.data && result.data.users) || [];

                // Render users table
                const container = document.getElementById('superAdminUsersContainer');
                if (container) {
                    if (superAdminUsersList.length === 0) {
                        container.innerHTML = '<div style="text-align: center; color: #A8BDE0; padding: 10px;">No registered users</div>';
                    } else {
                        container.innerHTML = '<table style="width: 100%; border-collapse: collapse; margin-top: 8px; font-size: 0.85em;">' +
                            '<thead><tr><th style="text-align: left; padding: 6px; background: #152C6B; border-radius: 4px 0 0 0;">Player</th><th style="text-align: left; padding: 6px; background: #152C6B;">Email</th></tr></thead>' +
                            '<tbody>' + superAdminUsersList.map(u =>
                                `<tr style="border-bottom: 1px solid #2E5AB0;"><td style="padding: 6px; color: #FFCD00;">${u.playerName || '(unclaimed)'}</td><td style="padding: 6px; color: #A8BDE0;">${u.email}</td></tr>`
                            ).join('') + '</tbody></table>';
                    }
                }

                // Populate dropdowns
                populateSuperAdminDropdowns();
            } catch (error) {
                hideLoading();
                showToast('Failed to load users: ' + error.message, 'error');
            }
        }
        window.loadSuperAdminUsers = loadSuperAdminUsers;

        function populateSuperAdminDropdowns() {
            const reassignUserSelect = document.getElementById('reassignUserSelect');
            const removeClaimUserSelect = document.getElementById('removeClaimUserSelect');
            const reassignNameSelect = document.getElementById('reassignNameSelect');

            const userOptions = '<option value="">Select user...</option>' +
                superAdminUsersList.map(u =>
                    `<option value="${u.uid}">${u.playerName || '(unclaimed)'} — ${u.email}</option>`
                ).join('');

            if (reassignUserSelect) reassignUserSelect.innerHTML = userOptions;
            if (removeClaimUserSelect) {
                // Only show users who have a claim
                const claimedUsers = superAdminUsersList.filter(u => u.playerName);
                removeClaimUserSelect.innerHTML = '<option value="">Select user...</option>' +
                    claimedUsers.map(u =>
                        `<option value="${u.uid}">${u.playerName} — ${u.email}</option>`
                    ).join('');
            }

            // Populate name dropdown with all player names
            if (reassignNameSelect) {
                reassignNameSelect.innerHTML = '<option value="">Select new name...</option>' +
                    allPlayers.map(p =>
                        `<option value="${p.name}">${p.name}</option>`
                    ).join('');
            }
        }

        async function superAdminReassign() {
            const userSelect = document.getElementById('reassignUserSelect');
            const nameSelect = document.getElementById('reassignNameSelect');
            const uid = userSelect ? userSelect.value : '';
            const newName = nameSelect ? nameSelect.value : '';

            if (!uid) { showToast('Please select a user', 'error'); return; }
            if (!newName) { showToast('Please select a name', 'error'); return; }

            try {
                showLoading('Reassigning...');
                await callFunction('reassignPlayerName', { targetUid: uid, newPlayerName: newName });
                hideLoading();
                showToast('Player name reassigned', 'success');
                await loadSuperAdminUsers();
            } catch (error) {
                hideLoading();
                showToast('Failed: ' + error.message, 'error');
            }
        }
        window.superAdminReassign = superAdminReassign;

        async function superAdminRemoveClaim() {
            const userSelect = document.getElementById('removeClaimUserSelect');
            const uid = userSelect ? userSelect.value : '';

            if (!uid) { showToast('Please select a user', 'error'); return; }

            const user = superAdminUsersList.find(u => u.uid === uid);
            if (!confirm(`Remove ${user ? user.playerName : 'this user'}'s player name claim?`)) return;

            try {
                showLoading('Removing...');
                await callFunction('removeUserClaim', { targetUid: uid });
                hideLoading();
                showToast('Claim removed', 'success');
                await loadSuperAdminUsers();
            } catch (error) {
                hideLoading();
                showToast('Failed: ' + error.message, 'error');
            }
        }
        window.superAdminRemoveClaim = superAdminRemoveClaim;

        async function superAdminResetAll() {
            if (!confirm('This will remove ALL player name claims. Everyone will need to re-pick their name. Are you sure?')) return;
            try {
                showLoading('Resetting...');
                await callFunction('resetAllClaims', {});
                hideLoading();
                showToast('All claims reset', 'success');
                await loadSuperAdminUsers();
            } catch (error) {
                hideLoading();
                showToast('Failed: ' + error.message, 'error');
            }
        }
        window.superAdminResetAll = superAdminResetAll;

        // CANONICAL DATASET SELECTOR FOR ANALYTICS
        // Single source of truth: returns full history if loaded, else recent 200
        // This ensures all stats/charts/leaderboards use the most complete data available
        function getFinesForAnalytics() {
            return (Array.isArray(cachedFullFines) && cachedFullFines.length > 0)
                ? cachedFullFines
                : allFines; // fallback to bounded realtime (recent 200)
        }

        // Get scope indicator text for UI
        function getAnalyticsScopeText() {
            if (cachedFullFines.length > 0) {
                const time = lastHistoryFetch ? lastHistoryFetch.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : '';
                return `Stats scope: Full history (${cachedFullFines.length} fines, refreshed ${time})`;
            }
            return `Stats scope: Recent ${allFines.length} fines (refresh history for full stats)`;
        }

        // Update scope indicators in UI
        function updateScopeIndicators() {
            const scopeText = getAnalyticsScopeText();
            const statsIndicator = document.getElementById('statsScopeIndicator');
            const chartsIndicator = document.getElementById('chartsScopeIndicator');

            if (statsIndicator) {
                const isFullHistory = cachedFullFines.length > 0;
                statsIndicator.textContent = scopeText;
                statsIndicator.style.color = isFullHistory ? '#6ECEB2' : '#FFA500';
                statsIndicator.style.fontWeight = isFullHistory ? '600' : 'normal';
            }
            if (chartsIndicator) {
                const isFullHistory = cachedFullFines.length > 0;
                chartsIndicator.textContent = scopeText;
                chartsIndicator.style.color = isFullHistory ? '#6ECEB2' : '#FFA500';
                chartsIndicator.style.fontWeight = isFullHistory ? '600' : 'normal';
            }
        }

        // ADMIN TEAM ID FINDER
        // All authenticated users have access
        function updateAdminPanelVisibility() {
            // No lock screen needed - all authenticated users have full access
        }

        // Team search results cache
        let teamSearchResults = [];

        async function searchTeamsAdmin() {
            const query = document.getElementById('teamSearchInput').value.trim();

            if (!query) {
                showToast('Please enter a team name', 'error');
                return;
            }

            const resultsDiv = document.getElementById('teamSearchResults');
            resultsDiv.innerHTML = '<div style="text-align: center; padding: 20px; color: #A8BDE0;">Searching...</div>';

            try {
                const result = await callFunction('searchTeams', { query });

                teamSearchResults = result.data || [];

                if (teamSearchResults.length === 0) {
                    resultsDiv.innerHTML = '<div style="text-align: center; padding: 20px; color: #A8BDE0;">No teams found</div>';
                    return;
                }

                // Display results
                resultsDiv.innerHTML = teamSearchResults.map((team, index) => `
                    <div class="team-result-card">
                        <div style="display: flex; align-items: center; gap: 15px;">
                            ${team.logo ? `<img src="${team.logo}" alt="${team.teamName}" style="width: 40px; height: 40px; border-radius: 4px;">` : '<div style="width: 40px; height: 40px; background: #2E5AB0; border-radius: 4px; display: flex; align-items: center; justify-content: center; font-size: 20px;">⚽</div>'}
                            <div style="flex: 1;">
                                <div style="font-weight: 600; font-size: 1.1em; color: #FFCD00;">${team.teamName}</div>
                                <div style="font-size: 0.9em; color: #A8BDE0;">
                                    ${team.country}${team.city ? ` • ${team.city}` : ''}
                                </div>
                                <div style="font-size: 0.85em; color: #7B9AD4; margin-top: 2px;">
                                    Team ID: ${team.teamId}
                                </div>
                            </div>
                        </div>
                        <div style="margin-top: 10px; display: grid; grid-template-columns: 1fr 1fr; gap: 8px;">
                            <button class="btn btn-secondary" onclick="saveToKnownTeams(${index})" style="font-size: 0.9em; padding: 8px 12px;">
                                💾 Save Team
                            </button>
                            <button class="btn" onclick="setAsBatonHolder(${index})" style="font-size: 0.9em; padding: 8px 12px; background: #6ECEB2;">
                                🎯 Set as Holder
                            </button>
                        </div>
                    </div>
                `).join('');

                showToast(`Found ${teamSearchResults.length} teams`, 'success');

            } catch (error) {
                console.error('Error searching teams:', error);
                resultsDiv.innerHTML = '<div style="text-align: center; padding: 20px; color: #ff6b6b;">Error searching teams: ' + error.message + '</div>';
                showToast('Search failed: ' + error.message, 'error');
            }
        }

        async function saveToKnownTeams(index) {
            const team = teamSearchResults[index];
            if (!team) return;

            try {
                showLoading('Saving team...');

                const teamData = {
                    teamId: team.teamId,
                    teamName: team.teamName,
                    country: team.country,
                    city: team.city || null,
                    logo: team.logo || null,
                    createdAt: new Date().toISOString()
                };

                await callFunction('saveTeam', { team: teamData });

                hideLoading();
                showToast(`${team.teamName} saved to known teams`, 'success');

            } catch (error) {
                console.error('Error saving team:', error);
                hideLoading();
                showToast('Failed to save team', 'error');
            }
        }

        async function setAsBatonHolder(index) {
            const team = teamSearchResults[index];
            if (!team) return;

            if (!confirm(`Set ${team.teamName} (${team.country}) as the current baton holder?`)) {
                return;
            }

            try {
                showLoading('Updating baton holder...');

                const holderData = {
                    holderTeamId: team.teamId,
                    holderTeamName: team.teamName,
                    holderCountry: team.country,
                    holderCity: team.city || null,
                    holderLogo: team.logo || null,
                    lastUpdatedAt: new Date().toISOString(),
                    updatedBy: 'admin'
                };

                await callFunction('setBatonHolder', { holder: holderData });

                // Also save to known teams
                await saveToKnownTeams(index);

                hideLoading();
                showToast(`Baton holder set to ${team.teamName}`, 'success');

            } catch (error) {
                console.error('Error setting baton holder:', error);
                hideLoading();
                showToast('Failed to set baton holder', 'error');
            }
        }

        // MANUAL BATON UPDATE
        // Manual match result entry
        let selectedMatchResult = null;

        async function selectMatchResult(result) {
            selectedMatchResult = result;

            // Update button styles
            document.getElementById('btnWin').style.opacity = result === 'win' ? '1' : '0.5';
            document.getElementById('btnDraw').style.opacity = result === 'draw' ? '1' : '0.5';
            document.getElementById('btnLoss').style.opacity = result === 'loss' ? '1' : '0.5';

            // Show details section
            document.getElementById('matchDetailsSection').style.display = 'block';

            // Show/hide opponent section based on result
            document.getElementById('opponentSection').style.display = result === 'loss' ? 'block' : 'none';

            // Update holder name in score label
            if (currentBatonHolder) {
                document.getElementById('holderScoreLabel').textContent = currentBatonHolder.holderTeamName || 'Holder';
            }
        }

        async function submitMatchResult() {
            if (!selectedMatchResult) {
                showToast('Please select Win, Draw, or Loss first', 'error');
                return;
            }

            if (!currentBatonHolder) {
                showToast('No baton holder set. Use Team ID Finder first.', 'error');
                return;
            }

            const holderScore = parseInt(document.getElementById('holderScore').value) || 0;
            const opponentScore = parseInt(document.getElementById('opponentScore').value) || 0;
            const opponentName = document.getElementById('opponentName').value.trim();
            const opponentTeamId = document.getElementById('opponentTeamId').value.trim() || null;
            const opponentLogo = document.getElementById('opponentLogo').value.trim() || null;
            const competitionName = document.getElementById('competitionName').value.trim() || 'Unknown Competition';

            // Validate opponent name if lost
            if (selectedMatchResult === 'loss' && !opponentName) {
                showToast('Please enter the opponent team name', 'error');
                return;
            }

            // Validate score matches result
            if (selectedMatchResult === 'win' && holderScore <= opponentScore) {
                showToast('Score doesn\'t match a win - holder should have more goals', 'error');
                return;
            }
            if (selectedMatchResult === 'loss' && holderScore >= opponentScore) {
                showToast('Score doesn\'t match a loss - holder should have fewer goals', 'error');
                return;
            }
            if (selectedMatchResult === 'draw' && holderScore !== opponentScore) {
                showToast('Score doesn\'t match a draw - scores should be equal', 'error');
                return;
            }

            try {
                showLoading('Recording match result...');

                const holderTeamName = currentBatonHolder.holderTeamName;
                const holderTeamId = currentBatonHolder.holderTeamId;
                const batonMoved = selectedMatchResult === 'loss';

                // Create history record
                const historyEntry = {
                    previousHolderTeamId: holderTeamId,
                    previousHolderTeamName: holderTeamName,
                    newHolderTeamId: batonMoved ? opponentTeamId : holderTeamId,
                    newHolderTeamName: batonMoved ? opponentName : holderTeamName,
                    matchDate: new Date().toISOString(),
                    competitionName: competitionName,
                    homeTeamName: holderTeamName,
                    awayTeamName: opponentName || 'Opponent',
                    homeScore: holderScore,
                    awayScore: opponentScore,
                    outcomeForHolder: selectedMatchResult.toUpperCase(),
                    batonMoved: batonMoved,
                    reason: batonMoved
                        ? `${holderTeamName} lost ${holderScore}-${opponentScore}. Baton moves to ${opponentName}.`
                        : `${holderTeamName} ${selectedMatchResult === 'win' ? 'won' : 'drew'} ${holderScore}-${opponentScore}. Baton stays.`,
                    timestamp: new Date().toISOString(),
                    entryType: 'manual'
                };

                // Add to baton history
                await callFunction('addBatonEntry', { entry: historyEntry });

                // If baton moved, update current holder
                if (batonMoved) {
                    const newHolder = {
                        holderTeamId: opponentTeamId,
                        holderTeamName: opponentName,
                        holderCountry: 'Unknown',
                        holderCity: null,
                        holderLogo: opponentLogo,
                        lastUpdatedAt: new Date().toISOString(),
                        updatedBy: 'manual'
                    };
                    await callFunction('setBatonHolder', { holder: newHolder });
                }

                hideLoading();

                // Show result message
                if (batonMoved) {
                    showToast(`🍺 Baton moved to ${opponentName}!`, 'success');
                    alert(`🍺 BATON MOVED!\n\n${holderTeamName} ${holderScore}-${opponentScore} ${opponentName}\n\nBaton now with: ${opponentName}`);
                } else {
                    showToast(`Baton stays with ${holderTeamName}`, 'info');
                    alert(`🍺 BATON STAYED\n\n${holderTeamName} ${holderScore}-${opponentScore} ${opponentName || 'Opponent'}\n\nBaton stays with: ${holderTeamName}`);
                }

                // Reset form
                selectedMatchResult = null;
                document.getElementById('matchDetailsSection').style.display = 'none';
                document.getElementById('holderScore').value = '0';
                document.getElementById('opponentScore').value = '0';
                document.getElementById('opponentName').value = '';
                document.getElementById('opponentTeamId').value = '';
                document.getElementById('opponentLogo').value = '';
                document.getElementById('competitionName').value = '';
                document.getElementById('btnWin').style.opacity = '1';
                document.getElementById('btnDraw').style.opacity = '1';
                document.getElementById('btnLoss').style.opacity = '1';
                // Reset opponent search
                document.getElementById('opponentSection').style.display = 'none';
                document.getElementById('opponentSearchInput').value = '';
                document.getElementById('opponentSearchResults').innerHTML = '';
                document.getElementById('selectedOpponent').style.display = 'none';

                // Refresh displays
                await loadBatonHolder();
                updateBatonTracker();

            } catch (error) {
                console.error('Error recording match:', error);
                hideLoading();
                showToast('Failed to record match: ' + error.message, 'error');
            }
        }

        // Update holder name in form when baton tab loads
        function updateMatchFormHolder() {
            const holderSpan = document.getElementById('holderNameInForm');
            if (holderSpan && currentBatonHolder) {
                holderSpan.textContent = currentBatonHolder.holderTeamName || 'the holder';
            }
        }

        // Add historical baton entry (for backfilling)
        async function addHistoricalEntry() {
            const matchDate = document.getElementById('historyDate').value;
            const fromTeam = document.getElementById('historyFromTeam').value.trim();
            const toTeam = document.getElementById('historyToTeam').value.trim();
            const fromScore = parseInt(document.getElementById('historyFromScore').value) || 0;
            const toScore = parseInt(document.getElementById('historyToScore').value) || 0;
            const competition = document.getElementById('historyCompetition').value.trim();

            if (!matchDate) {
                showToast('Please select a date', 'error');
                return;
            }
            if (!fromTeam) {
                showToast('Please enter the previous holder', 'error');
                return;
            }
            if (!toTeam) {
                showToast('Please enter the new holder', 'error');
                return;
            }
            if (toScore <= fromScore) {
                showToast('Winner score must be higher than loser score', 'error');
                return;
            }

            try {
                showLoading('Adding historical entry...');

                const historyEntry = {
                    previousHolderTeamId: null,
                    previousHolderTeamName: fromTeam,
                    newHolderTeamId: null,
                    newHolderTeamName: toTeam,
                    matchDate: matchDate,
                    competitionName: competition || 'Unknown Competition',
                    homeTeamName: fromTeam,
                    awayTeamName: toTeam,
                    homeScore: fromScore,
                    awayScore: toScore,
                    outcomeForHolder: 'LOSS',
                    batonMoved: true,
                    reason: `${fromTeam} lost ${fromScore}-${toScore} to ${toTeam}. Baton transferred.`,
                    timestamp: new Date(matchDate).toISOString(),
                    entryType: 'historical'
                };

                await callFunction('addBatonEntry', { entry: historyEntry });

                hideLoading();
                showToast('Historical entry added!', 'success');

                // Reset form
                document.getElementById('historyDate').value = '';
                document.getElementById('historyFromTeam').value = '';
                document.getElementById('historyToTeam').value = '';
                document.getElementById('historyFromScore').value = '0';
                document.getElementById('historyToScore').value = '0';
                document.getElementById('historyCompetition').value = '';

                // Refresh baton tracker
                updateBatonTracker();

            } catch (error) {
                console.error('Error adding historical entry:', error);
                hideLoading();
                showToast('Failed to add entry: ' + error.message, 'error');
            }
        }

        // Automated Baton Update - calls cloud function to check latest match
        async function manualUpdateBaton() {
            if (!currentBatonHolder || !currentBatonHolder.holderTeamId) {
                showToast('No baton holder set with a team ID. Use Team ID Finder first.', 'error');
                return;
            }

            try {
                showLoading('Checking latest match result...');

                // Call the updateBaton cloud function (now onRequest)
                const result = await callFunction('updateBaton', {});

                hideLoading();

                const data = result.data || result;
                if (data && data.batonMoved) {
                    showToast(`Baton moved to ${data.newHolderTeamName || 'new holder'}!`, 'success');
                    alert(`BATON MOVED!\n\n${data.reason || 'Baton has been transferred.'}`);
                } else if (data && data.message) {
                    showToast(data.message, 'info');
                } else {
                    showToast('Baton check complete - no change', 'info');
                }

                // Refresh displays
                await loadBatonHolder();
                updateBatonTracker();

            } catch (error) {
                console.error('Error updating baton:', error);
                hideLoading();
                showToast('Failed to update baton: ' + error.message, 'error');
            }
        }

        // Opponent team search functions
        async function searchOpponentTeam() {
            const searchInput = document.getElementById('opponentSearchInput');
            const resultsDiv = document.getElementById('opponentSearchResults');
            const searchQuery = searchInput.value.trim();

            if (searchQuery.length < 2) {
                resultsDiv.innerHTML = '<p style="color: #A8BDE0; padding: 10px;">Enter at least 2 characters to search</p>';
                return;
            }

            resultsDiv.innerHTML = '<p style="color: #A8BDE0; padding: 10px;">Searching...</p>';

            try {
                const result = await callFunction('searchTeams', { query: searchQuery });
                const teams = result.data || [];

                if (teams.length === 0) {
                    resultsDiv.innerHTML = '<p style="color: #A8BDE0; padding: 10px;">No teams found</p>';
                    return;
                }

                resultsDiv.innerHTML = teams.map(team => `
                    <div onclick="selectOpponentTeam(${JSON.stringify(team).replace(/"/g, '&quot;')})"
                         style="display: flex; align-items: center; gap: 10px; padding: 10px; cursor: pointer; border-bottom: 1px solid #2E5AB0; transition: background 0.2s;"
                         onmouseover="this.style.background='rgba(46,90,176,0.3)'"
                         onmouseout="this.style.background='transparent'">
                        ${team.logo ? `<img src="${team.logo}" style="width: 30px; height: 30px; border-radius: 4px;">` : ''}
                        <div>
                            <div style="font-weight: 600; color: #FFF;">${team.teamName}</div>
                            <div style="font-size: 0.8em; color: #A8BDE0;">${team.country}${team.city ? ` • ${team.city}` : ''}</div>
                        </div>
                    </div>
                `).join('');

            } catch (error) {
                console.error('Error searching opponent teams:', error);
                resultsDiv.innerHTML = `<p style="color: #ff6b6b; padding: 10px;">Error: ${error.message}</p>`;
            }
        }

        function selectOpponentTeam(team) {
            // Store in hidden fields
            document.getElementById('opponentName').value = team.teamName;
            document.getElementById('opponentTeamId').value = team.teamId;
            document.getElementById('opponentLogo').value = team.logo || '';

            // Show selected team
            const selectedDiv = document.getElementById('selectedOpponent');
            const logoImg = document.getElementById('selectedOpponentLogo');
            const nameSpan = document.getElementById('selectedOpponentName');

            nameSpan.textContent = team.teamName;
            if (team.logo) {
                logoImg.src = team.logo;
                logoImg.style.display = 'block';
            } else {
                logoImg.style.display = 'none';
            }
            selectedDiv.style.display = 'block';

            // Clear search results
            document.getElementById('opponentSearchResults').innerHTML = '';
            document.getElementById('opponentSearchInput').value = '';
        }

        function clearSelectedOpponent() {
            document.getElementById('opponentName').value = '';
            document.getElementById('opponentTeamId').value = '';
            document.getElementById('opponentLogo').value = '';
            document.getElementById('selectedOpponent').style.display = 'none';
            document.getElementById('selectedOpponentName').textContent = '';
            document.getElementById('selectedOpponentLogo').src = '';
        }

        // Load and display current baton holder from Firestore
        let currentBatonHolder = null;

        async function loadBatonHolder() {
            try {
                const holderDoc = await getDocs(query(collection(db, 'baton_current')));

                if (holderDoc.empty) {
                    currentBatonHolder = null;
                    return;
                }

                holderDoc.forEach((doc) => {
                    currentBatonHolder = doc.data();
                });

                updateBatonHolderDisplay();
                updateMatchFormHolder();
                updateSpakkaTab();

            } catch (error) {
                console.error('Error loading baton holder:', error);
            }
        }

        function updateBatonHolderDisplay() {
            const displayEl = document.getElementById('currentBatonHolderDisplay');
            const homeEl = document.getElementById('homeBatonDisplay');

            if (!currentBatonHolder) {
                if (displayEl) displayEl.innerHTML = `
                    <div style="text-align: center; padding: 20px; color: #7B9AD4;">
                        <div style="font-size: 2em; margin-bottom: 10px;">🍺</div>
                        <p>No baton holder set</p>
                        <p style="font-size: 0.9em; color: #7B9AD4;">Use Team ID Finder in Settings to set initial holder</p>
                    </div>
                `;
                if (homeEl) homeEl.innerHTML = `<span style="color: #7B9AD4;">No holder set</span>`;
                return;
            }

            const lastUpdated = currentBatonHolder.lastUpdatedAt
                ? new Date(currentBatonHolder.lastUpdatedAt.toDate ? currentBatonHolder.lastUpdatedAt.toDate() : currentBatonHolder.lastUpdatedAt).toLocaleString('en-GB')
                : 'Unknown';

            if (displayEl) displayEl.innerHTML = `
                <div style="text-align: center; padding: 20px;">
                    ${currentBatonHolder.holderLogo ? `<img src="${currentBatonHolder.holderLogo}" alt="${currentBatonHolder.holderTeamName}" style="width: 80px; height: 80px; border-radius: 8px; margin-bottom: 15px;">` : ''}
                    <div style="font-size: 2em; font-weight: bold; color: #FFCD00; margin-bottom: 5px;">
                        ${currentBatonHolder.holderTeamName}
                    </div>
                    <div style="font-size: 1.1em; color: #A8BDE0; margin-bottom: 10px;">
                        ${currentBatonHolder.holderCountry}${currentBatonHolder.holderCity ? ` • ${currentBatonHolder.holderCity}` : ''}
                    </div>
                    <div style="font-size: 0.85em; color: #7B9AD4; margin-top: 10px;">
                        Last updated: ${lastUpdated}
                    </div>
                    ${currentBatonHolder.lastProcessedMatchId ? `
                        <div style="font-size: 0.8em; color: #7B9AD4; margin-top: 5px;">
                            Last match ID: ${currentBatonHolder.lastProcessedMatchId}
                        </div>
                    ` : ''}
                </div>
            `;

            // Update home screen baton preview
            if (homeEl) {
                homeEl.innerHTML = `
                    <div style="display: flex; align-items: center; gap: 12px;">
                        ${currentBatonHolder.holderLogo ? `<img src="${currentBatonHolder.holderLogo}" alt="" style="width: 40px; height: 40px; border-radius: 8px;">` : '<div style="font-size: 1.5em;">🍺</div>'}
                        <div style="flex: 1;">
                            <div style="font-weight: 700; color: #FFCD00; font-size: 1.05em;">${currentBatonHolder.holderTeamName}</div>
                            <div style="font-size: 0.8em; color: #A8BDE0;">${currentBatonHolder.holderCountry || ''}</div>
                        </div>
                        <div style="color: #7B9AD4; font-size: 0.75em;">Tap for details &rsaquo;</div>
                    </div>
                `;
            }
        }

        window.switchTab = switchTab;
        window.updateAmount = updateAmount;
        window.deleteFine = deleteFine;
        window.togglePaid = togglePaid;
        window.clearAllFines = clearAllFines;
        window.handleFileSelect = handleFileSelect;
        window.addNewPlayer = addNewPlayer;
        window.deletePlayer = deletePlayer;
        window.exportData = exportData;
        window.exportPDF = exportPDF;
        window.exportWhatsApp = exportWhatsApp;
        window.selectMatchResult = selectMatchResult;
        window.submitMatchResult = submitMatchResult;
        window.loadBatonHolder = loadBatonHolder;
        window.updateAdminPanelVisibility = updateAdminPanelVisibility;
        window.searchTeamsAdmin = searchTeamsAdmin;
        window.saveToKnownTeams = saveToKnownTeams;
        window.setAsBatonHolder = setAsBatonHolder;
        window.copyUnpaidList = copyUnpaidList;
        window.copyPaymentReminder = copyPaymentReminder;
        window.closePaidModal = closePaidModal;
        window.confirmPaid = confirmPaid;
        window.updatePlayerStats = updatePlayerStats;
        window.applyFilters = applyFilters;
        window.setDateFilter = setDateFilter;
        window.refreshHistory = refreshHistory;
        window.analyzeFineType = analyzeFineType;
        window.addNewFineReason = addNewFineReason;
        window.editFineReason = editFineReason;
        window.deleteFineReason = deleteFineReason;
        window.deleteBatonEntry = deleteBatonEntry;
        window.addHistoricalEntry = addHistoricalEntry;
        window.manualUpdateBaton = manualUpdateBaton;
        window.markAllPaid = markAllPaid;
        window.markAllPaidSettings = markAllPaidSettings;
        window.closeMarkAllModal = closeMarkAllModal;
        window.confirmMarkAllPaid = confirmMarkAllPaid;
        window.deletePlayerFromSettings = deletePlayerFromSettings;
        window.updateGamesField = updateGamesField;
        window.searchOpponentTeam = searchOpponentTeam;
        window.selectOpponentTeam = selectOpponentTeam;
        window.clearSelectedOpponent = clearSelectedOpponent;
        window.updatePlayerComparison = updatePlayerComparison;

        function formatDateDDMMYYYY(dateStr) {
            if (!dateStr) return '';
            // Handle ISO date strings (YYYY-MM-DD) to avoid timezone issues
            if (typeof dateStr === 'string' && dateStr.match(/^\d{4}-\d{2}-\d{2}$/)) {
                const [year, month, day] = dateStr.split('-');
                return `${day}/${month}/${year}`;
            }
            // Fallback for other date formats
            const date = new Date(dateStr);
            const day = String(date.getDate()).padStart(2, '0');
            const month = String(date.getMonth() + 1).padStart(2, '0');
            const year = date.getFullYear();
            return `${day}/${month}/${year}`;
        }

        function init() {
            // Prevent multiple initialization
            if (didInit) {
                console.warn('⚠️ init() already called, skipping duplicate initialization');
                return;
            }
            didInit = true;

            console.log('🚀 Initializing Booze Baton Tracker...');
            if (isDevMode) {
                console.warn('🔧 DEV MODE: Realtime listeners disabled. Use ?dev=1 to avoid Firestore read spikes during testing.');
            }
            checkNetworkStatus();
            console.log('📋 Fine reasons count:', fineReasons.length);
            populateFineReasons();
            console.log('✅ Fine reasons populated');
            setDefaultDate();
            console.log('✅ Default dates set');
            setupFormHandlers();
            console.log('✅ Form handlers setup');
            setupRealtimeListeners();
            console.log('✅ Realtime listeners setup');
            loadPlayers();
            console.log('✅ Loading players...');
            loadFineReasons();
            console.log('✅ Loading fine reasons...');
            loadBatonHolder();
            console.log('✅ Loading baton holder...');
            initializeVoting();
            console.log('✅ Voting system initialized...');

            // Load Pro Clubs match history and player mappings
            loadLoggedMatches().then(() => {
                loadPlayerMappings();
                console.log('✅ Match history and player mappings loaded...');
            });

            // Always start on home page
            switchTab('home');
            console.log('✅ Starting on home page');

            // Update version display
            const versionEl = document.getElementById('appVersion');
            const updatedEl = document.getElementById('lastUpdated');
            if (versionEl) versionEl.textContent = APP_VERSION;
            if (updatedEl) updatedEl.textContent = `Last updated: ${LAST_UPDATED}`;

            // Update admin panel visibility based on unlock state
            updateAdminPanelVisibility();

            setTimeout(hideLoading, 500);
        }

        function populateFineReasons() {
            console.log('📋 Populating fine reasons dropdown...');
            const select = document.getElementById('fineReason');
            const filterSelect = document.getElementById('filterFine');

            if (!select) {
                console.error('❌ Fine reason select element not found!');
                return;
            }

            select.innerHTML = '<option value="">Select fine...</option>';
            if (filterSelect) filterSelect.innerHTML = '<option value="">All Fines</option>';
            
            console.log('📋 Adding', fineReasons.length, 'fine reasons');
            fineReasons.forEach((fine, index) => {
                const option = document.createElement('option');
                option.value = fine.reason;
                option.textContent = `${fine.reason} - £${fine.amount.toFixed(2)}`;
                option.dataset.amount = fine.amount;
                select.appendChild(option);
                
                if (filterSelect) {
                    const filterOption = document.createElement('option');
                    filterOption.value = fine.reason;
                    filterOption.textContent = fine.reason;
                    filterSelect.appendChild(filterOption);
                }
                
                if (index < 3) {
                    console.log(`  ${index + 1}. ${fine.reason} - £${fine.amount}`);
                }
            });
            console.log('✅ Fine reasons populated successfully');
        }

        function setDefaultDate() {
            const today = new Date().toISOString().split('T')[0];
            const setIfExists = (id) => {
                const el = document.getElementById(id);
                if (el) el.value = today;
            };
            setIfExists('fineDate');
            setIfExists('batonDate');
            setIfExists('paidDateInput');
            setIfExists('markAllDateInput');
        }

        function updateAmount() {
            const select = document.getElementById('fineReason');
            const amountInput = document.getElementById('fineAmount');
            const selectedOption = select.options[select.selectedIndex];
            if (selectedOption.dataset.amount) {
                amountInput.value = selectedOption.dataset.amount;
            }
        }

        function setupFormHandlers() {
            const fineForm = document.getElementById('fineForm');
            if (!fineForm) {
                console.warn('⚠️ fineForm not found, skipping form handler setup');
                return;
            }
            fineForm.addEventListener('submit', async (e) => {
                e.preventDefault();
                console.log('📝 Form submitted');

                // Get selected players from chips
                const selectedChips = document.querySelectorAll('.player-chip.selected');
                const selectedPlayers = Array.from(selectedChips).map(chip => chip.dataset.player);

                if (selectedPlayers.length === 0) {
                    showToast('Please select at least one player', 'error');
                    return;
                }

                const reason = document.getElementById('fineReason').value;
                const amount = parseFloat(document.getElementById('fineAmount').value);
                const date = document.getElementById('fineDate').value;

                if (!reason || !amount || !date) {
                    showToast('Please fill in all fields', 'error');
                    return;
                }

                try {
                    console.log('💾 Saving fines for', selectedPlayers.length, 'player(s)...');
                    showLoading(`Adding fine${selectedPlayers.length > 1 ? 's' : ''}...`);

                    // Add a fine for each selected player
                    for (const playerName of selectedPlayers) {
                        const fine = {
                            playerName: playerName,
                            reason: reason,
                            amount: amount,
                            date: date,
                            paid: false,
                            paidDate: null,
                            timestamp: new Date().toISOString()
                        };
                        try {
                            await callFunction('addFine', { fine });
                            console.log('✅ Saved fine for', playerName);
                        } catch (error) {
                            console.error('Error adding fine:', error);
                        }
                    }

                    hideLoading();
                    e.target.reset();
                    // Clear selected chips
                    document.querySelectorAll('.player-chip.selected').forEach(chip => chip.classList.remove('selected'));
                    setDefaultDate();

                    if (selectedPlayers.length === 1) {
                        showToast(`Fine added for ${selectedPlayers[0]}!`, 'success');
                    } else {
                        showToast(`Fines added for ${selectedPlayers.length} players!`, 'success');
                    }
                } catch (error) {
                    console.error('❌ Firebase error:', error);
                    hideLoading();
                    showToast(`Failed to add fine: ${error.message}`, 'error');
                }
            });

            // Enter key support for various inputs
            setupEnterKeyHandlers();
        }

        function setupEnterKeyHandlers() {
            // Team search - press Enter to search
            const teamSearchInput = document.getElementById('teamSearchInput');
            if (teamSearchInput) {
                teamSearchInput.addEventListener('keypress', (e) => {
                    if (e.key === 'Enter') {
                        e.preventDefault();
                        searchTeamsAdmin();
                    }
                });
            }

            // Opponent search - press Enter to search
            const opponentSearchInput = document.getElementById('opponentSearchInput');
            if (opponentSearchInput) {
                opponentSearchInput.addEventListener('keypress', (e) => {
                    if (e.key === 'Enter') {
                        e.preventDefault();
                        searchOpponentTeam();
                    }
                });
            }

            // New player input - press Enter to add
            const newPlayerInput = document.getElementById('newPlayerName');
            if (newPlayerInput) {
                newPlayerInput.addEventListener('keypress', (e) => {
                    if (e.key === 'Enter') {
                        e.preventDefault();
                        addNewPlayer();
                    }
                });
            }

            // Competition name - press Enter to submit match
            const competitionInput = document.getElementById('competitionName');
            if (competitionInput) {
                competitionInput.addEventListener('keypress', (e) => {
                    if (e.key === 'Enter') {
                        e.preventDefault();
                        submitMatchResult();
                    }
                });
            }

            console.log('✅ Enter key handlers setup');
        }

        function setupRealtimeListeners() {
            // DEV MODE SAFETY: If ?dev=1 is in URL, use one-time fetch instead of realtime listeners
            // This prevents Firestore read spikes during development/testing on live URL
            if (isDevMode) {
                console.log('🔧 DEV MODE: Using one-time getDocs() instead of realtime listeners');
                fetchRecentDataOnce();
                return;
            }

            // UNSUBSCRIBE OLD LISTENERS FIRST to prevent stacking
            // This is critical when page is refreshed or init() called multiple times
            if (finesUnsubscribe) {
                console.log('📡 Unsubscribing old fines listener');
                finesUnsubscribe();
                activeListenerCount--;
            }
            if (batonUnsubscribe) {
                console.log('📡 Unsubscribing old baton listener');
                batonUnsubscribe();
                activeListenerCount--;
            }

            // FINES LISTENER - BOUNDED to most recent 200
            // This powers: Stats, Recent Activity, Leaderboards, Charts
            // History tab uses separate cached data with manual refresh
            const finesQuery = query(
                collection(db, 'fines'),
                orderBy('timestamp', 'desc'),
                limit(200) // CRITICAL: Prevents reading all ~800 fines on every change
            );

            console.log('📡 Attaching BOUNDED fines listener (limit 200)');
            finesUnsubscribe = onSnapshot(finesQuery, (snapshot) => {
                allFines = [];
                snapshot.forEach((d) => {
                    allFines.push({ id: d.id, ...d.data() });
                });
                console.log(`📊 Fines snapshot: ${allFines.length} recent fines loaded`);

                // MERGE: If cachedFullFines loaded, update it with new/changed docs
                if (cachedFullFines.length > 0) {
                    snapshot.forEach((d) => {
                        const newDoc = { id: d.id, ...d.data() };
                        const existingIndex = cachedFullFines.findIndex(f => f.id === newDoc.id);
                        if (existingIndex >= 0) {
                            cachedFullFines[existingIndex] = newDoc; // Update existing
                        } else {
                            cachedFullFines.unshift(newDoc); // Add new at start
                        }
                    });
                    // Re-sort by timestamp desc
                    cachedFullFines.sort((a, b) => {
                        const timeA = a.timestamp?.toMillis ? a.timestamp.toMillis() : new Date(a.timestamp).getTime();
                        const timeB = b.timestamp?.toMillis ? b.timestamp.toMillis() : new Date(b.timestamp).getTime();
                        return timeB - timeA;
                    });
                    console.log(`🔄 Merged realtime updates into cachedFullFines (${cachedFullFines.length} total)`);
                }

                updateAll(); // NOTE: updateAll() does NOT update History anymore
            });
            activeListenerCount++;

            // BATON LISTENER - BOUNDED to most recent 50
            const batonQuery = query(
                collection(db, 'baton'),
                orderBy('timestamp', 'desc'),
                limit(50) // CRITICAL: Prevents reading entire baton history
            );

            console.log('📡 Attaching BOUNDED baton listener (limit 50)');
            batonUnsubscribe = onSnapshot(batonQuery, (snapshot) => {
                batonHistory = [];
                snapshot.forEach((d) => {
                    batonHistory.push({ id: d.id, ...d.data() });
                });
                console.log(`🍺 Baton snapshot: ${batonHistory.length} baton entries loaded`);
                updateBatonTracker();
                updateSpakkaTab();
            });
            activeListenerCount++;

            console.log(`✅ Active snapshot listeners: ${activeListenerCount}`);
        }

        // DEV MODE HELPER: One-time fetch instead of realtime listeners
        async function fetchRecentDataOnce() {
            try {
                // Fetch recent 200 fines
                const finesQuery = query(
                    collection(db, 'fines'),
                    orderBy('timestamp', 'desc'),
                    limit(200)
                );
                const finesSnapshot = await getDocs(finesQuery);
                allFines = [];
                finesSnapshot.forEach((d) => {
                    allFines.push({ id: d.id, ...d.data() });
                });
                console.log(`📊 DEV MODE: Loaded ${allFines.length} recent fines (one-time)`);

                // Fetch recent 50 baton entries
                const batonQuery = query(
                    collection(db, 'baton'),
                    orderBy('timestamp', 'desc'),
                    limit(50)
                );
                const batonSnapshot = await getDocs(batonQuery);
                batonHistory = [];
                batonSnapshot.forEach((d) => {
                    batonHistory.push({ id: d.id, ...d.data() });
                });
                console.log(`🍺 DEV MODE: Loaded ${batonHistory.length} baton entries (one-time)`);

                // Update UI once
                updateAll();
                updateBatonTracker();
                updateSpakkaTab();
            } catch (error) {
                console.error('❌ DEV MODE: Error fetching data:', error);
            }
        }

        async function loadPlayers() {
            try {
                const playersDoc = await getDocs(collection(db, 'config'));
                const playerData = playersDoc.docs.find(d => d.id === 'players');
                if (playerData) {
                    allPlayers = playerData.data().list || [];
                } else {
                    allPlayers = [];
                }
                updatePlayerDropdowns();
                updateManagePlayersTable();
                updateSettingsPlayersTable();
                updateSpakkaTab();
                updateBatonTracker();
                updatePlayers();
                updateCharts();
                updateVotingDropdowns();
            } catch (error) {
                console.error('Error:', error);
            }
        }

        async function loadFineReasons() {
            try {
                // Try to load from Firebase first
                const reasonsDoc = await getDocs(collection(db, 'config'));
                const reasonsData = reasonsDoc.docs.find(d => d.id === 'fineReasons');

                if (reasonsData && reasonsData.data().list) {
                    // Use saved fine reasons from Firebase
                    fineReasons = reasonsData.data().list;
                }
                // If nothing in Firebase, keep the hardcoded default list
            } catch (error) {
                console.error('Error loading fine reasons:', error);
                // On error, keep the hardcoded default list
            }

            populateFineReasons();
            updateFineReasonsTable();
        }

        function updatePlayerDropdowns() {
            // Update player checkboxes for multi-select in Add Fine form
            const playerCheckboxes = document.getElementById('playerCheckboxes');
            if (playerCheckboxes) {
                if (allPlayers.length === 0) {
                    playerCheckboxes.innerHTML = '<div style="color: #7B9AD4; padding: 10px; font-size: 0.9em;">No players yet. Add players in the Manage tab.</div>';
                } else {
                    playerCheckboxes.innerHTML = allPlayers.map(player => `
                        <div class="player-chip" onclick="togglePlayerChip(this)" data-player="${player.name}">
                            <span>${player.name}</span>
                        </div>
                    `).join('');
                    // Add hidden inputs container
                    if (!document.getElementById('selectedPlayersInputs')) {
                        const inputsDiv = document.createElement('div');
                        inputsDiv.id = 'selectedPlayersInputs';
                        inputsDiv.style.display = 'none';
                        playerCheckboxes.parentNode.appendChild(inputsDiv);
                    }
                }
            }

            // Toggle player chip selection
            window.togglePlayerChip = function(chip) {
                chip.classList.toggle('selected');
            };

            // Keep backwards compatibility for old select element if it exists
            const addFineSelect = document.getElementById('playerName');
            const statsSelect = document.getElementById('playerSelector');
            const filterSelect = document.getElementById('filterPlayer');
            const deleteSelect = document.getElementById('deletePlayerSelect');
            const comparePlayerA = document.getElementById('comparePlayerA');
            const comparePlayerB = document.getElementById('comparePlayerB');

            if (addFineSelect) addFineSelect.innerHTML = '<option value="">Select player...</option>';
            if (statsSelect) statsSelect.innerHTML = '<option value="all">All Players</option>';
            if (filterSelect) filterSelect.innerHTML = '<option value="">All Players</option>';
            if (deleteSelect) deleteSelect.innerHTML = '<option value="">Select player to delete...</option>';
            if (comparePlayerA) comparePlayerA.innerHTML = '<option value="">Select player...</option>';
            if (comparePlayerB) comparePlayerB.innerHTML = '<option value="">Select player...</option>';

            allPlayers.forEach(player => {
                [addFineSelect, statsSelect, filterSelect, deleteSelect, comparePlayerA, comparePlayerB].forEach(select => {
                    if (select) {
                        const option = document.createElement('option');
                        option.value = player.name;
                        option.textContent = player.name;
                        select.appendChild(option);
                    }
                });
            });
        }

        function calculateTotalGames(player) {
            const eafc25 = player.eafc25 || 0;
            const season2425 = player.season2425 || 0;
            const eafc26 = player.eafc26 || 0;
            const adjustment = player.adjustment || 0;
            return eafc25 - season2425 + eafc26 + adjustment;
        }

        function updateManagePlayersTable() {
            const table = document.getElementById('managePlayersTable');
            if (!table) return;

            if (allPlayers.length === 0) {
                table.innerHTML = '<div class="empty-state"><p>No players yet</p></div>';
                return;
            }

            table.innerHTML = allPlayers.map(player => {
                const total = calculateTotalGames(player);
                return `
                    <div class="player-card">
                        <div class="player-name">${player.name}</div>
                        <div class="games-tracking">
                            <div class="games-row">
                                <div style="flex: 1;">
                                    <label style="font-size: 0.85em;">EAFC 26</label>
                                    <input type="number" class="games-input" value="${player.eafc26 || 0}"
                                           onchange="updateGamesField('${player.name}', 'eafc26', this.value)">
                                </div>
                            </div>
                            <div class="games-total">
                                Total Games: ${total}
                            </div>
                        </div>
                    </div>
                `;
            }).join('');
        }

        function updateSettingsPlayersTable() {
            const table = document.getElementById('settingsPlayersTable');
            if (!table) return;

            if (allPlayers.length === 0) {
                table.innerHTML = '<div class="empty-state"><p>No players yet</p></div>';
                return;
            }

            table.innerHTML = allPlayers.map(player => {
                const total = calculateTotalGames(player);
                return `
                    <div class="player-card">
                        <div class="player-name">${player.name}</div>
                        <div class="games-tracking">
                            <div class="games-row">
                                <div>
                                    <label style="font-size: 0.85em;">EAFC 25</label>
                                    <input type="number" class="games-input" value="${player.eafc25 || 0}"
                                           onchange="updateGamesField('${player.name}', 'eafc25', this.value)">
                                </div>
                                <div>
                                    <label style="font-size: 0.85em;">Season 24/25</label>
                                    <input type="number" class="games-input" value="${player.season2425 || 0}"
                                           onchange="updateGamesField('${player.name}', 'season2425', this.value)">
                                </div>
                            </div>
                            <div class="games-row">
                                <div>
                                    <label style="font-size: 0.85em;">Adjustment (+/-)</label>
                                    <input type="number" class="games-input" value="${player.adjustment || 0}"
                                           onchange="updateGamesField('${player.name}', 'adjustment', this.value)">
                                </div>
                                <div></div>
                            </div>
                            <div class="games-total">
                                Total Games: ${total}
                            </div>
                        </div>
                    </div>
                `;
            }).join('');
        }

        async function updateGamesField(playerName, field, value) {
            const player = allPlayers.find(p => p.name === playerName);
            if (player) {
                player[field] = parseInt(value) || 0;
                await savePlayers();
                updateManagePlayersTable();
                updateSettingsPlayersTable();
            }
        }

        async function addNewPlayer() {
            const name = document.getElementById('newPlayerName').value.trim();
            if (!name) {
                alert('Please enter a name');
                return;
            }

            if (allPlayers.some(p => p.name === name)) {
                alert('Player already exists');
                return;
            }

            allPlayers.push({
                name,
                eafc25: 0,
                season2425: 0,
                eafc26: 0,
                adjustment: 0
            });
            await savePlayers();
            document.getElementById('newPlayerName').value = '';
            showToast(`${name} added successfully!`, 'success');
        }

        async function deletePlayer(name) {
            if (!confirm(`⚠️ Delete ${name}? This will remove ALL their fines!`)) {
                return;
            }

            showLoading('Deleting player...');

            allPlayers = allPlayers.filter(p => p.name !== name);
            await savePlayers();

            const playerFines = allFines.filter(f => f.playerName === name);
            
            for (const fine of playerFines) {
                try {
                    await callFunction('deleteFine', { fineId: fine.id });
                } catch (error) {
                    console.error('Error deleting fine:', error);
                }
            }

            hideLoading();
            showToast(`${name} deleted successfully`, 'success');
        }

        async function deletePlayerFromSettings() {
            const name = document.getElementById('deletePlayerSelect').value;
            if (!name) {
                alert('Please select a player');
                return;
            }

            if (!confirm(`⚠️ WARNING!\n\nThis will permanently delete ${name} and ALL their fines from the system.\n\nThis action CANNOT be undone!\n\nAre you absolutely sure?`)) {
                return;
            }

            showLoading('Deleting player and fines...');

            allPlayers = allPlayers.filter(p => p.name !== name);
            await savePlayers();

            const playerFines = allFines.filter(f => f.playerName === name);
            
            for (const fine of playerFines) {
                try {
                    await callFunction('deleteFine', { fineId: fine.id });
                } catch (error) {
                    console.error('Error deleting fine:', error);
                }
            }

            document.getElementById('deletePlayerSelect').value = '';
            hideLoading();
            showToast(`${name} and all fines deleted`, 'success');
        }

        async function savePlayers() {
            try {
                await callFunction('updatePlayers', { players: allPlayers });
                updatePlayerDropdowns();
                updateManagePlayersTable();
                updateSettingsPlayersTable();
            } catch (error) {
                console.error('Error saving players:', error);
            }
        }

        function switchTab(tabName) {
            document.querySelectorAll('.tab').forEach(tab => tab.classList.remove('active'));
            document.querySelector(`.tab[onclick*="${tabName}"]`)?.classList.add('active');
            document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));
            document.getElementById(tabName).classList.add('active');
            window.scrollTo(0, 0);

            // Remember last tab
            localStorage.setItem('lastTab', tabName);

            // Update baton form holder name when switching to baton tab
            if (tabName === 'baton') {
                updateMatchFormHolder();
            }

            // Auto-load full fine history the first time the History tab is opened
            if (tabName === 'history' && cachedFullFines.length === 0) {
                autoLoadHistory();
            }
        }

        async function autoLoadHistory() {
            if (cachedFullFines.length > 0) return; // already loaded — don't re-hit Firestore
            await fetchFullHistory(); // populates cache + renders silently (toasts only on error)
        }

        function updateAll() {
            updatePlayerDropdowns();
            updateStats();
            // NOTE: updateHistory() REMOVED from here to prevent excessive re-renders
            // History now uses cached data with manual refresh only
            updatePlayers();
            updatePlayerStats();
            updateBatonTracker();
            updateManagePlayersTable();
            updateSettingsPlayersTable();
            updateFineReasonsTable();
            updateCharts();
            updateSpakkaTab();
            updateVotingUI();
            updateRecentFinesHome();
            updateGreeting();
            const fines = getFinesForAnalytics();
            document.getElementById('totalRecords').textContent = fines.length;
        }

        function updateGreeting() {
            const el = document.querySelector('.screen-subtitle');
            if (!el) return;
            const h = new Date().getHours();
            el.textContent = h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
        }

        function updateRecentFinesHome() {
            const container = document.getElementById('recentFinesHome');
            if (!container) return;
            const fines = allFines.slice(0, 5);
            if (fines.length === 0) {
                container.innerHTML = '<div style="color: #7B9AD4; padding: 12px; font-size: 0.9em;">No fines yet</div>';
                return;
            }
            container.innerHTML = fines.map(f => `
                <div style="display: flex; justify-content: space-between; align-items: center; padding: 10px 0; border-bottom: 1px solid #2E5AB0;">
                    <div>
                        <div style="font-weight: 600; color: #FFF; font-size: 0.95em;">${f.playerName}</div>
                        <div style="font-size: 0.8em; color: #A8BDE0;">${f.reason ? f.reason.substring(0, 35) + (f.reason.length > 35 ? '...' : '') : ''}</div>
                    </div>
                    <div style="text-align: right;">
                        <div style="font-weight: 700; color: #FFCD00;">£${(f.amount || 0).toFixed(2)}</div>
                        <div style="font-size: 0.75em; color: #7B9AD4;">${f.date ? formatDateDDMMYYYY(f.date) : ''}</div>
                    </div>
                </div>
            `).join('');
        }

        function updateStats() {
            const fines = getFinesForAnalytics(); // Use canonical dataset
            const totalPot = fines.reduce((sum, fine) => sum + fine.amount, 0);
            const totalUnpaid = fines.filter(f => !f.paid).reduce((sum, fine) => sum + fine.amount, 0);

            document.getElementById('totalPot').textContent = `£${totalPot.toFixed(0)}`;
            document.getElementById('totalUnpaid').textContent = `£${totalUnpaid.toFixed(0)}`;
            document.getElementById('totalFines').textContent = fines.length;
            document.getElementById('batonTotalPot').textContent = `£${totalPot.toFixed(0)}`;

            const playerTotals = {};
            fines.forEach(fine => {
                playerTotals[fine.playerName] = (playerTotals[fine.playerName] || 0) + fine.amount;
            });

            const worstOffender = Object.entries(playerTotals).sort((a, b) => b[1] - a[1])[0];
            document.getElementById('worstOffender').textContent = worstOffender ? worstOffender[0] : '-';

            updateLeaderboards();
            updateScopeIndicators(); // Update scope labels
        }

        function updatePlayerStats() {
            const playerSelector = document.getElementById('playerSelector');
            const detailDiv = document.getElementById('playerStatsDetail');

            if (!playerSelector || !detailDiv) return;

            const selectedPlayer = playerSelector.value;

            if (selectedPlayer === 'all' || !selectedPlayer) {
                detailDiv.innerHTML = '';
                return;
            }

            const fines = getFinesForAnalytics(); // Use canonical dataset
            const playerFines = fines ? fines.filter(f => f.playerName === selectedPlayer) : [];
            const player = allPlayers ? allPlayers.find(p => p.name === selectedPlayer) : null;

            if (playerFines.length === 0) {
                detailDiv.innerHTML = '<div class="empty-state"><p>No fines yet</p></div>';
                return;
            }

            const totalFines = playerFines.reduce((sum, f) => sum + (f.amount || 0), 0);
            const unpaidFines = playerFines.filter(f => !f.paid).reduce((sum, f) => sum + (f.amount || 0), 0);
            const totalGames = player ? calculateTotalGames(player) : 0;
            const finesPerGame = totalGames > 0 ? totalFines / totalGames : 0;
            const avgFine = playerFines.length > 0 ? totalFines / playerFines.length : 0;
            const worstFine = playerFines.length > 0 ? Math.max(...playerFines.map(f => f.amount || 0)) : 0;
            const paymentRate = playerFines.length > 0
                ? ((playerFines.filter(f => f.paid).length / playerFines.length) * 100).toFixed(0)
                : 0;

            const finesByReason = {};
            playerFines.forEach(f => {
                if (f.reason) {
                    finesByReason[f.reason] = (finesByReason[f.reason] || 0) + 1;
                }
            });
            const mostCommon = Object.keys(finesByReason).length > 0
                ? Object.entries(finesByReason).sort((a, b) => b[1] - a[1])[0]
                : null;

            const finesByDate = {};
            playerFines.forEach(f => {
                if (f.date) {
                    finesByDate[f.date] = (finesByDate[f.date] || 0) + 1;
                }
            });
            const mostInDay = Object.keys(finesByDate).length > 0
                ? Math.max(...Object.values(finesByDate))
                : 0;

            detailDiv.innerHTML = `
                <div class="card">
                    <h3 style="margin-bottom: 15px; color: #FFCD00;">${selectedPlayer}</h3>
                    <div class="stats-grid">
                        <div class="stat-card">
                            <div class="stat-label">🎮 Games Played</div>
                            <div class="stat-value">${totalGames}</div>
                        </div>
                        <div class="stat-card">
                            <div class="stat-label">💰 Total Fines</div>
                            <div class="stat-value">£${totalFines.toFixed(0)}</div>
                        </div>
                        <div class="stat-card">
                            <div class="stat-label">📊 Fines Per Game</div>
                            <div class="stat-value">£${(finesPerGame || 0).toFixed(2)}</div>
                        </div>
                        <div class="stat-card">
                            <div class="stat-label">📝 Fine Count</div>
                            <div class="stat-value">${playerFines.length}</div>
                        </div>
                        <div class="stat-card">
                            <div class="stat-label">💵 Average Fine</div>
                            <div class="stat-value">£${(avgFine || 0).toFixed(2)}</div>
                        </div>
                        <div class="stat-card">
                            <div class="stat-label">💥 Worst Single Fine</div>
                            <div class="stat-value">£${(worstFine || 0).toFixed(0)}</div>
                        </div>
                        <div class="stat-card">
                            <div class="stat-label">🔥 Most Fines in One Day</div>
                            <div class="stat-value">${mostInDay}</div>
                        </div>
                        <div class="stat-card">
                            <div class="stat-label">⚠️ Unpaid Balance</div>
                            <div class="stat-value">£${(unpaidFines || 0).toFixed(0)}</div>
                        </div>
                        <div class="stat-card">
                            <div class="stat-label">✓ Payment Rate</div>
                            <div class="stat-value">${paymentRate}%</div>
                        </div>
                        <div class="stat-card">
                            <div class="stat-label">🎯 Most Common Fine</div>
                            <div class="stat-value" style="font-size: 0.8em;">${mostCommon ? mostCommon[0].substring(0, 15) : '-'}</div>
                        </div>
                    </div>
                </div>
            `;
        }

        // Player vs Player comparison
        function updatePlayerComparison() {
            const playerA = document.getElementById('comparePlayerA').value;
            const playerB = document.getElementById('comparePlayerB').value;
            const resultDiv = document.getElementById('comparisonResult');

            if (!playerA || !playerB || playerA === playerB) {
                resultDiv.style.display = 'none';
                return;
            }

            resultDiv.style.display = 'block';
            const fines = getFinesForAnalytics();

            // Get stats for each player
            const statsA = getPlayerComparisonStats(playerA, fines);
            const statsB = getPlayerComparisonStats(playerB, fines);

            // Comparison bar
            const total = statsA.total + statsB.total;
            const percentA = total > 0 ? (statsA.total / total * 100).toFixed(0) : 50;
            const percentB = total > 0 ? (statsB.total / total * 100).toFixed(0) : 50;

            document.getElementById('comparisonBar').innerHTML = `
                <div style="display: flex; align-items: center; gap: 10px;">
                    <span style="font-weight: 600; color: #C8102E; min-width: 60px; text-align: right;">${playerA}</span>
                    <div style="flex: 1; display: flex; height: 30px; border-radius: 15px; overflow: hidden; background: #0a1e4d;">
                        <div style="width: ${percentA}%; background: linear-gradient(90deg, #C8102E, #ff6b6b); display: flex; align-items: center; justify-content: center; color: white; font-weight: bold; font-size: 0.85em;">
                            ${percentA}%
                        </div>
                        <div style="width: ${percentB}%; background: linear-gradient(90deg, #4a90d9, #1D428A); display: flex; align-items: center; justify-content: center; color: white; font-weight: bold; font-size: 0.85em;">
                            ${percentB}%
                        </div>
                    </div>
                    <span style="font-weight: 600; color: #A8BDE0; min-width: 60px;">${playerB}</span>
                </div>
            `;

            // Player A stats
            document.getElementById('playerAStats').innerHTML = `
                <div style="font-weight: bold; color: #C8102E; margin-bottom: 10px; font-size: 1.1em;">${playerA}</div>
                <div style="font-size: 1.8em; font-weight: bold; color: #FFF;">£${statsA.total}</div>
                <div style="color: #A8BDE0; font-size: 0.85em; margin-top: 5px;">${statsA.count} fines</div>
                <div style="color: #7B9AD4; font-size: 0.8em; margin-top: 3px;">Avg: £${statsA.avg}</div>
            `;

            // Player B stats
            document.getElementById('playerBStats').innerHTML = `
                <div style="font-weight: bold; color: #A8BDE0; margin-bottom: 10px; font-size: 1.1em;">${playerB}</div>
                <div style="font-size: 1.8em; font-weight: bold; color: #FFF;">£${statsB.total}</div>
                <div style="color: #A8BDE0; font-size: 0.85em; margin-top: 5px;">${statsB.count} fines</div>
                <div style="color: #7B9AD4; font-size: 0.8em; margin-top: 3px;">Avg: £${statsB.avg}</div>
            `;

            // Fine types breakdown for Player A
            document.getElementById('playerAFineTypes').innerHTML = `
                <div style="font-weight: 600; color: #C8102E; margin-bottom: 8px; font-size: 0.9em;">${playerA}</div>
                ${statsA.topFineTypes.map((ft, i) => `
                    <div style="display: flex; justify-content: space-between; padding: 4px 0; font-size: 0.8em; border-bottom: 1px solid #2E5AB0;">
                        <span style="color: #A8BDE0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 100px;" title="${ft.reason}">${ft.reason}</span>
                        <span style="font-weight: 600; color: #FFF;">${ft.count}x</span>
                    </div>
                `).join('') || '<div style="color: #7B9AD4; font-size: 0.8em;">No fines</div>'}
            `;

            // Fine types breakdown for Player B
            document.getElementById('playerBFineTypes').innerHTML = `
                <div style="font-weight: 600; color: #A8BDE0; margin-bottom: 8px; font-size: 0.9em;">${playerB}</div>
                ${statsB.topFineTypes.map((ft, i) => `
                    <div style="display: flex; justify-content: space-between; padding: 4px 0; font-size: 0.8em; border-bottom: 1px solid #2E5AB0;">
                        <span style="color: #A8BDE0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 100px;" title="${ft.reason}">${ft.reason}</span>
                        <span style="font-weight: 600; color: #FFF;">${ft.count}x</span>
                    </div>
                `).join('') || '<div style="color: #7B9AD4; font-size: 0.8em;">No fines</div>'}
            `;
        }

        function getPlayerComparisonStats(playerName, fines) {
            const playerFines = fines ? fines.filter(f => f.playerName === playerName) : [];
            const total = playerFines.reduce((sum, f) => sum + (f.amount || 0), 0);
            const count = playerFines.length;
            const avg = count > 0 ? (total / count).toFixed(2) : '0.00';

            // Get fine type counts
            const fineTypeCounts = {};
            playerFines.forEach(f => {
                if (f.reason) {
                    fineTypeCounts[f.reason] = (fineTypeCounts[f.reason] || 0) + 1;
                }
            });

            // Sort and get top 5
            const topFineTypes = Object.entries(fineTypeCounts)
                .sort((a, b) => b[1] - a[1])
                .slice(0, 5)
                .map(([reason, count]) => ({ reason, count }));

            return { total, count, avg, topFineTypes };
        }

        function setDateFilter(range) {
            currentDateRangeFilter = range;

            // Clear specific date input to avoid conflicts
            const dateInput = document.getElementById('filterDate');
            if (dateInput) {
                dateInput.value = '';
            }

            // Calculate date range
            const now = new Date();
            let startDate, endDate, displayText;

            switch (range) {
                case 'thisMonth':
                    startDate = new Date(now.getFullYear(), now.getMonth(), 1);
                    endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0);
                    displayText = `Showing: This Month (${startDate.toLocaleDateString('en-GB', { month: 'short', year: 'numeric' })})`;
                    break;
                case 'lastMonth':
                    startDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
                    endDate = new Date(now.getFullYear(), now.getMonth(), 0);
                    displayText = `Showing: Last Month (${startDate.toLocaleDateString('en-GB', { month: 'short', year: 'numeric' })})`;
                    break;
                case 'thisSeason':
                    // Football season runs August to May
                    const currentMonth = now.getMonth();
                    const seasonStartYear = currentMonth >= 7 ? now.getFullYear() : now.getFullYear() - 1;
                    startDate = new Date(seasonStartYear, 7, 1); // August 1st
                    endDate = new Date(seasonStartYear + 1, 4, 31); // May 31st
                    displayText = `Showing: This Season (${seasonStartYear}/${(seasonStartYear + 1).toString().slice(2)})`;
                    break;
                case 'all':
                default:
                    startDate = null;
                    endDate = null;
                    displayText = 'Showing: All Time';
                    break;
            }

            // Store the date range for filtering
            window.dateRangeStart = startDate;
            window.dateRangeEnd = endDate;

            // Update indicator
            const indicator = document.getElementById('dateRangeIndicator');
            if (indicator) {
                indicator.textContent = displayText;
            }

            // Apply filters
            applyFilters();
        }

        function applyFilters() {
            const searchTerm = document.getElementById('searchBox').value.toLowerCase();
            const playerFilter = document.getElementById('filterPlayer').value;
            const fineFilter = document.getElementById('filterFine').value;
            const paidFilter = document.getElementById('filterPaid').value;
            const dateFilter = document.getElementById('filterDate').value;

            // If specific date is selected, clear the date range filter to avoid conflicts
            if (dateFilter) {
                window.dateRangeStart = null;
                window.dateRangeEnd = null;
                const indicator = document.getElementById('dateRangeIndicator');
                if (indicator) {
                    indicator.textContent = 'Showing: Specific date (' + formatDateDDMMYYYY(dateFilter) + ')';
                }
            }

            const rows = document.querySelectorAll('#historyContent table tbody tr');

            // Stats tracking for summary
            let totalCount = 0;
            let totalCost = 0;
            let totalPaid = 0;
            let totalUnpaid = 0;
            const playerStats = {};
            const dailyStats = {};

            rows.forEach(row => {
                const cells = row.cells;
                // Column 0 is checkbox (multi-select), data starts at column 1
                const dateDDMMYYYY = cells[1].textContent.trim();
                const player = cells[2].textContent.trim();
                const fullReason = row.getAttribute('data-full-reason') || cells[3].textContent;
                const amountText = cells[4].textContent.replace('£', '');
                const amount = parseFloat(amountText) || 0;
                const isPaid = cells[5].textContent.includes('✓');
                const status = isPaid ? 'paid' : 'unpaid';

                let show = true;

                // Search filter
                if (searchTerm && !row.textContent.toLowerCase().includes(searchTerm)) {
                    show = false;
                }

                // Player filter
                if (playerFilter && player !== playerFilter) {
                    show = false;
                }

                // Fine filter - use full reason from data attribute
                if (fineFilter && !fullReason.includes(fineFilter)) {
                    show = false;
                }

                // Paid filter
                if (paidFilter && status !== paidFilter) {
                    show = false;
                }

                // Date filter (specific date)
                if (dateFilter) {
                    const formattedFilter = formatDateDDMMYYYY(dateFilter);
                    if (dateDDMMYYYY !== formattedFilter) {
                        show = false;
                    }
                }

                // Date range filter
                if (window.dateRangeStart || window.dateRangeEnd) {
                    // Parse DD/MM/YYYY to Date object
                    const parts = dateDDMMYYYY.split('/');
                    if (parts.length === 3) {
                        const day = parseInt(parts[0], 10);
                        const month = parseInt(parts[1], 10) - 1;
                        const year = parseInt(parts[2], 10);
                        const fineDate = new Date(year, month, day);
                        fineDate.setHours(0, 0, 0, 0); // Normalize to midnight

                        if (window.dateRangeStart) {
                            const start = new Date(window.dateRangeStart);
                            start.setHours(0, 0, 0, 0);
                            if (fineDate < start) {
                                show = false;
                            }
                        }
                        if (window.dateRangeEnd) {
                            const end = new Date(window.dateRangeEnd);
                            end.setHours(23, 59, 59, 999); // End of day
                            if (fineDate > end) {
                                show = false;
                            }
                        }
                    }
                }

                row.style.display = show ? '' : 'none';

                // Collect stats for visible rows
                if (show) {
                    totalCount++;
                    totalCost += amount;
                    if (isPaid) {
                        totalPaid += amount;
                    } else {
                        totalUnpaid += amount;
                    }

                    // Player breakdown
                    if (!playerStats[player]) {
                        playerStats[player] = { count: 0, total: 0 };
                    }
                    playerStats[player].count++;
                    playerStats[player].total += amount;

                    // Daily breakdown
                    if (!dailyStats[dateDDMMYYYY]) {
                        dailyStats[dateDDMMYYYY] = { count: 0, total: 0 };
                    }
                    dailyStats[dateDDMMYYYY].count++;
                    dailyStats[dateDDMMYYYY].total += amount;
                }
            });

            // Update summary UI
            updateFilterSummary(totalCount, totalCost, totalPaid, totalUnpaid, playerStats, dailyStats);
        }

        function updateFilterSummary(totalCount, totalCost, totalPaid, totalUnpaid, playerStats, dailyStats) {
            const summaryDiv = document.getElementById('filterSummary');
            if (!summaryDiv) return;

            // Show/hide summary based on whether there's data
            if (totalCount === 0) {
                summaryDiv.style.display = 'none';
                return;
            }
            summaryDiv.style.display = 'block';

            // Update main stats
            document.getElementById('summaryTotalCount').textContent = totalCount;
            document.getElementById('summaryTotalCost').textContent = '£' + totalCost.toFixed(2);
            document.getElementById('summaryPaid').textContent = '£' + totalPaid.toFixed(2);
            document.getElementById('summaryUnpaid').textContent = '£' + totalUnpaid.toFixed(2);

            // Top players (sorted by total)
            const topPlayers = Object.entries(playerStats)
                .sort((a, b) => b[1].total - a[1].total)
                .slice(0, 5);

            const topPlayersDiv = document.getElementById('summaryTopPlayers');
            topPlayersDiv.innerHTML = topPlayers.map(([name, stats], index) => {
                const colors = ['#ff6b6b', '#FFCD00', '#6ECEB2', '#A8BDE0', '#7B9AD4'];
                return `<span style="background: ${colors[index]}; color: white; padding: 4px 10px; border-radius: 15px; font-size: 0.85em;">
                    ${name}: £${stats.total.toFixed(2)} (${stats.count})
                </span>`;
            }).join('');

            // Daily breakdown
            const dailyEntries = Object.entries(dailyStats).sort((a, b) => {
                // Sort by date descending
                const partsA = a[0].split('/');
                const partsB = b[0].split('/');
                const dateA = new Date(parseInt(partsA[2], 10), parseInt(partsA[1], 10) - 1, parseInt(partsA[0], 10));
                const dateB = new Date(parseInt(partsB[2], 10), parseInt(partsB[1], 10) - 1, parseInt(partsB[0], 10));
                return dateB - dateA;
            });

            const uniqueDays = dailyEntries.length;
            const avgPerDay = uniqueDays > 0 ? (totalCost / uniqueDays).toFixed(2) : '0.00';
            const avgFinesPerDay = uniqueDays > 0 ? (totalCount / uniqueDays).toFixed(1) : '0';

            const dailyStatsDiv = document.getElementById('summaryDailyStats');
            dailyStatsDiv.innerHTML = `
                <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 10px; margin-bottom: 10px;">
                    <div><strong>Days with fines:</strong> ${uniqueDays}</div>
                    <div><strong>Avg cost/day:</strong> £${avgPerDay}</div>
                    <div><strong>Avg fines/day:</strong> ${avgFinesPerDay}</div>
                    <div><strong>Total:</strong> £${totalCost.toFixed(2)}</div>
                </div>
                ${dailyEntries.length <= 10 ? `
                    <div style="margin-top: 10px; font-size: 0.85em;">
                        ${dailyEntries.map(([date, stats]) =>
                            `<div style="display: flex; justify-content: space-between; padding: 3px 0; border-bottom: 1px solid #2E5AB0;">
                                <span>${date}</span>
                                <span>${stats.count} fines = <strong>£${stats.total.toFixed(2)}</strong></span>
                            </div>`
                        ).join('')}
                    </div>
                ` : ''}
            `;
        }

        // FULL HISTORY LOADER - Manual refresh only
        // Loads ALL fines from Firestore (expensive operation)
        // This is separate from realtime listener to control costs
        async function fetchFullHistory() {
            try {
                console.log('📜 Fetching FULL history from Firestore...');
                const historyQuery = query(
                    collection(db, 'fines'),
                    orderBy('timestamp', 'desc')
                    // NO LIMIT - loads all ~800 fines
                );

                const snapshot = await getDocs(historyQuery);
                cachedFullFines = [];
                snapshot.forEach((d) => {
                    cachedFullFines.push({ id: d.id, ...d.data() });
                });

                lastHistoryFetch = new Date();
                console.log(`✅ Full history loaded: ${cachedFullFines.length} fines (${lastHistoryFetch.toLocaleTimeString()})`);

                // Update the UI
                updateHistory();
                applyFilters(); // Re-apply any active filters
                updateAll(); // CRITICAL: Recompute all stats/charts with full dataset

                return true;
            } catch (error) {
                console.error('❌ Error fetching full history:', error);
                showToast('Failed to load history', 'error');
                return false;
            }
        }

        // REFRESH HISTORY BUTTON HANDLER
        async function refreshHistory() {
            const refreshBtn = document.getElementById('refreshHistoryBtn');
            if (refreshBtn) {
                refreshBtn.disabled = true;
                refreshBtn.textContent = '⏳ Refreshing...';
            }

            // Clear selection before refresh
            selectedFineIds.clear();
            updateBulkActionBar();

            const success = await fetchFullHistory();

            if (refreshBtn) {
                refreshBtn.disabled = false;
                refreshBtn.textContent = '🔄 Refresh';
            }

            if (success) {
                showToast(`History refreshed: ${cachedFullFines.length} fines loaded`, 'success');
            }
        }

        // HEADER REFRESH — refreshes both fines history and logged matches
        async function refreshAllData() {
            const headerBtn = document.getElementById('headerRefreshBtn');
            if (headerBtn) {
                headerBtn.disabled = true;
                headerBtn.classList.add('spinning');
            }

            // Clear selection before refresh
            selectedFineIds.clear();
            updateBulkActionBar();

            const [finesOk] = await Promise.all([
                fetchFullHistory(),
                loadLoggedMatches()
            ]);

            if (headerBtn) {
                headerBtn.disabled = false;
                headerBtn.classList.remove('spinning');
            }

            if (finesOk) {
                const matchCount = loggedMatchesCache?.matches?.length || 0;
                showToast(`Refreshed: ${cachedFullFines.length} fines, ${matchCount} matches`, 'success');
            }
        }
        window.refreshAllData = refreshAllData;

        function updateHistory() {
            const historyContent = document.getElementById('historyContent');

            // Use cachedFullFines (from manual refresh) instead of allFines (realtime limited data)
            const finesData = cachedFullFines.length > 0 ? cachedFullFines : [];

            const historyToolbar = document.getElementById('historyToolbar');
            if (finesData.length === 0) {
                if (historyToolbar) historyToolbar.style.display = 'none';
                historyContent.innerHTML = `
                    <div class="empty-state">
                        <div class="empty-state-icon">📝</div>
                        <p>Loading history…</p>
                        <p style="font-size: 0.9em; color: #A8BDE0; margin-top: 10px;">If it doesn't appear automatically, tap below.</p>
                        <button class="btn btn-small btn-secondary" style="margin-top: 12px;" onclick="refreshHistory()">🔄 Refresh History</button>
                    </div>`;
                return;
            }
            if (historyToolbar) historyToolbar.style.display = 'flex';

            // Sort by date descending (most recent first)
            const sortedFines = [...finesData].sort((a, b) => new Date(b.date) - new Date(a.date));

            historyContent.innerHTML = `
                <div class="table-container">
                    <table>
                        <thead>
                            <tr>
                                <th style="width: 40px;"><input type="checkbox" id="selectAllFines" onchange="toggleSelectAll(this.checked)" title="Select all visible"></th>
                                <th>Date</th>
                                <th>Player</th>
                                <th>Reason</th>
                                <th>£</th>
                                <th>Status</th>
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${sortedFines.map(fine => `
                                <tr class="fine-row${selectedFineIds.has(fine.id) ? ' row-selected' : ''}" data-fine-id="${fine.id}" data-full-reason="${fine.reason}" data-paid="${fine.paid}" onclick="toggleRowSelection(event, '${fine.id}')">
                                    <td><input type="checkbox" class="fine-checkbox" data-id="${fine.id}" style="pointer-events: none;" ${selectedFineIds.has(fine.id) ? 'checked' : ''}></td>
                                    <td>${formatDateDDMMYYYY(fine.date)}</td>
                                    <td>${fine.playerName}</td>
                                    <td style="font-size: 0.85em;">${fine.reason.substring(0, 30)}${fine.reason.length > 30 ? '...' : ''}</td>
                                    <td>£${fine.amount.toFixed(2)}</td>
                                    <td>
                                        <span class="paid-status ${fine.paid ? 'paid' : 'unpaid'}">
                                            ${fine.paid ? '✓' : '✗'}
                                        </span>
                                    </td>
                                    <td>
                                        <button class="btn-small row-action ${fine.paid ? 'btn-secondary' : 'btn-success'}" onclick="togglePaid('${fine.id}', ${!fine.paid})">
                                            ${fine.paid ? 'Unpaid' : 'Paid'}
                                        </button>
                                        <button class="btn-small row-action btn-danger" onclick="deleteFine('${fine.id}')">Del</button>
                                    </td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
            `;

            // Update bulk action bar visibility
            updateBulkActionBar();
        }

        function updatePlayers() {
            const playersContent = document.getElementById('playersContent');

            const fines = getFinesForAnalytics(); // Use canonical dataset
            if (fines.length === 0) {
                playersContent.innerHTML = '<div class="empty-state"><div class="empty-state-icon">👥</div><p>No players yet</p></div>';
                return;
            }

            const playerStats = {};
            fines.forEach(fine => {
                if (!playerStats[fine.playerName]) {
                    playerStats[fine.playerName] = {
                        total: 0,
                        unpaid: 0,
                        count: 0,
                        reasons: {}
                    };
                }
                playerStats[fine.playerName].total += fine.amount;
                if (!fine.paid) {
                    playerStats[fine.playerName].unpaid += fine.amount;
                }
                playerStats[fine.playerName].count += 1;
                playerStats[fine.playerName].reasons[fine.reason] =
                    (playerStats[fine.playerName].reasons[fine.reason] || 0) + 1;
            });

            const sortedPlayers = Object.entries(playerStats).sort((a, b) => b[1].total - a[1].total);

            playersContent.innerHTML = sortedPlayers.map(([name, stats]) => {
                const topReasons = Object.entries(stats.reasons).sort((a, b) => b[1] - a[1]).slice(0, 3);
                const player = allPlayers.find(p => p.name === name);
                const totalGames = player ? calculateTotalGames(player) : 0;
                const finesPerGame = totalGames > 0 ? (stats.total / totalGames).toFixed(2) : '0.00';

                return `
                    <div class="player-card">
                        <div class="player-name">${name}</div>
                        <div class="player-stats-grid">
                            <div class="player-stat">
                                <span class="player-stat-label">Total</span>
                                <span class="player-stat-value">£${stats.total.toFixed(2)}</span>
                            </div>
                            <div class="player-stat">
                                <span class="player-stat-label">Unpaid</span>
                                <span class="player-stat-value">£${stats.unpaid.toFixed(2)}</span>
                            </div>
                            <div class="player-stat">
                                <span class="player-stat-label">Count</span>
                                <span class="player-stat-value">${stats.count}</span>
                            </div>
                            <div class="player-stat">
                                <span class="player-stat-label">Per Game</span>
                                <span class="player-stat-value">£${finesPerGame}</span>
                            </div>
                        </div>
                        <div style="margin-top: 10px; padding-top: 10px; border-top: 1px solid #2E5AB0;">
                            <div style="font-size: 0.85em; color: #777; margin-bottom: 5px;">Top Fines:</div>
                            ${topReasons.map(([reason, count]) => `
                                <div style="font-size: 0.85em; margin-bottom: 3px;">
                                    ${reason.substring(0, 35)}${reason.length > 35 ? '...' : ''} <span style="color: #FFCD00; font-weight: 600;">${count}x</span>
                                </div>
                            `).join('')}
                        </div>
                    </div>
                `;
            }).join('');
        }

        function updateBatonTracker() {
            const batonCurrentTeam = document.getElementById('batonCurrentTeam');
            const batonCurrentDate = document.getElementById('batonCurrentDate');

            if (batonHistory && batonHistory.length > 0) {
                const latest = batonHistory[0];
                // Handle both old format (to/date) and new format (newHolderTeamName/matchDate)
                const holderName = latest.newHolderTeamName || latest.to || '-';
                const dateVal = latest.matchDate || latest.date || null;
                if (batonCurrentTeam) batonCurrentTeam.textContent = holderName;
                if (batonCurrentDate) batonCurrentDate.textContent = dateVal ? `Updated: ${formatDateDDMMYYYY(dateVal)}` : 'No date';
            } else {
                if (batonCurrentTeam) batonCurrentTeam.textContent = '-';
                if (batonCurrentDate) batonCurrentDate.textContent = 'No baton history';
            }

            const forfeitTable = document.getElementById('forfeitTable');
            if (!forfeitTable) return;

            const fines = getFinesForAnalytics(); // Use canonical dataset
            const playerStats = {};
            // First, initialize all players
            if (allPlayers && allPlayers.length > 0) {
                allPlayers.forEach(player => {
                    playerStats[player.name] = {
                        total: 0,
                        games: calculateTotalGames(player)
                    };
                });
            }

            // Then add fine totals
            if (fines && fines.length > 0) {
                fines.forEach(fine => {
                    if (playerStats[fine.playerName]) {
                        playerStats[fine.playerName].total += fine.amount;
                    }
                });
            }

            const statsArray = Object.entries(playerStats);

            const leastGames = statsArray.length > 0
                ? statsArray
                    .map(([name, stats]) => ({ name, games: stats.games }))
                    .sort((a, b) => a.games - b.games)[0]
                : null;

            const highestTotal = statsArray.length > 0
                ? statsArray
                    .map(([name, stats]) => ({ name, total: stats.total }))
                    .sort((a, b) => b.total - a.total)[0]
                : null;

            const highestPerGame = statsArray.length > 0
                ? statsArray
                    .map(([name, stats]) => ({
                        name,
                        perGame: stats.games > 0 ? stats.total / stats.games : 0
                    }))
                    .sort((a, b) => b.perGame - a.perGame)[0]
                : null;

            forfeitTable.innerHTML = `
                <div class="player-card">
                    <div style="display: flex; justify-content: space-between; margin-bottom: 5px;">
                        <span>🎮 Least Games</span>
                        <strong>${leastGames ? leastGames.name : '-'} (${leastGames ? leastGames.games : 0})</strong>
                    </div>
                    <div style="display: flex; justify-content: space-between; margin-bottom: 5px;">
                        <span>💰 Highest Total</span>
                        <strong>${highestTotal ? highestTotal.name : '-'} (£${highestTotal ? highestTotal.total.toFixed(0) : 0})</strong>
                    </div>
                    <div style="display: flex; justify-content: space-between;">
                        <span>📊 Highest Per Game</span>
                        <strong>${highestPerGame ? highestPerGame.name : '-'} (£${highestPerGame ? highestPerGame.perGame.toFixed(2) : 0})</strong>
                    </div>
                </div>
            `;

            const historyTable = document.getElementById('batonHistoryTable');
            if (historyTable) {
                historyTable.innerHTML = (batonHistory && batonHistory.length > 0)
                    ? batonHistory.map(entry => {
                        // Handle both old format (from/to/score/date) and new format (previousHolderTeamName/newHolderTeamName/homeScore/awayScore/matchDate)
                        const dateVal = entry.matchDate || entry.date || '-';
                        const fromVal = entry.previousHolderTeamName || entry.from || '-';
                        const toVal = entry.newHolderTeamName || entry.to || '-';
                        const scoreVal = entry.score || ((entry.homeScore !== undefined && entry.awayScore !== undefined) ? `${entry.homeScore}-${entry.awayScore}` : '-');
                        return `
                        <tr>
                            <td>${formatDateDDMMYYYY(dateVal)}</td>
                            <td>${fromVal}</td>
                            <td>${scoreVal}</td>
                            <td>${toVal}</td>
                            <td>
                                <button class="btn-small btn-danger" onclick="deleteBatonEntry('${entry.id}')">Del</button>
                            </td>
                        </tr>
                    `}).join('')
                    : '<tr><td colspan="5" style="text-align: center;">No history</td></tr>';
            }

            updateBatonRiskPrediction();
        }

        async function deleteBatonEntry(id) {
            if (confirm('Delete this entry?')) {
                try {
                    showLoading('Deleting...');
                    await callFunction('deleteBatonEntry', { entryId: id });
                    hideLoading();
                    showToast('Entry deleted', 'success');
                } catch (error) {
                    hideLoading();
                    showToast('Failed to delete entry', 'error');
                }
            }
        }

        function updateSpakkaTab() {
            // Check if elements exist (tab might not be loaded yet)
            const potElement = document.getElementById('spakkaTotalPot');
            if (!potElement) return;

            const fines = getFinesForAnalytics(); // Use canonical dataset

            // Update total pot
            const totalPot = fines.reduce((sum, fine) => sum + fine.amount, 0);
            potElement.textContent = `£${totalPot.toFixed(0)}`;

            // Update unpaid list - show who owes money
            const unpaidByPlayer = {};
            fines.filter(f => !f.paid).forEach(fine => {
                unpaidByPlayer[fine.playerName] = (unpaidByPlayer[fine.playerName] || 0) + fine.amount;
            });

            const unpaidList = document.getElementById('spakkaUnpaidList');
            if (unpaidList) {
                const sortedUnpaid = Object.entries(unpaidByPlayer).sort((a, b) => b[1] - a[1]);

                if (sortedUnpaid.length === 0) {
                    unpaidList.innerHTML = '<div style="text-align: center; padding: 20px; font-size: 1.2em; color: #6ECEB2;">🎉 Everyone has paid!</div>';
                } else {
                    unpaidList.innerHTML = sortedUnpaid.map(([name, amount]) => `
                        <div style="background: rgba(255,107,107,0.1); padding: 15px; border-radius: 8px; margin-bottom: 10px; border-left: 4px solid #ff6b6b;">
                            <div style="display: flex; justify-content: space-between; align-items: center;">
                                <span style="font-size: 1.2em; font-weight: 600; color: #FFF;">${name}</span>
                                <span style="font-size: 1.5em; font-weight: bold; color: #ff6b6b;">£${amount.toFixed(0)}</span>
                            </div>
                        </div>
                    `).join('');
                }
            }

            // Update top offenders - who has most fines
            const totalsByPlayer = {};
            fines.forEach(fine => {
                totalsByPlayer[fine.playerName] = (totalsByPlayer[fine.playerName] || 0) + fine.amount;
            });

            const topOffenders = document.getElementById('spakkaTopOffenders');
            if (topOffenders) {
                const sortedOffenders = Object.entries(totalsByPlayer).sort((a, b) => b[1] - a[1]).slice(0, 3);

                if (sortedOffenders.length === 0) {
                    topOffenders.innerHTML = '<div style="text-align: center; padding: 20px; color: #7B9AD4;">No fines yet</div>';
                } else {
                    const medals = ['🥇', '🥈', '🥉'];
                    topOffenders.innerHTML = sortedOffenders.map(([name, amount], index) => `
                        <div style="background: ${index === 0 ? 'rgba(255,205,0,0.1)' : 'rgba(22,48,122,0.5)'}; padding: 15px; border-radius: 8px; margin-bottom: 10px; border-left: 4px solid ${index === 0 ? '#FFCD00' : '#2E5AB0'};">
                            <div style="display: flex; justify-content: space-between; align-items: center;">
                                <span style="font-size: 1.2em; color: #FFF;">
                                    <span style="font-size: 1.5em; margin-right: 8px;">${medals[index]}</span>
                                    <strong>${name}</strong>
                                </span>
                                <span style="font-size: 1.5em; font-weight: bold; color: #FFCD00;">£${amount.toFixed(0)}</span>
                            </div>
                        </div>
                    `).join('');
                }
            }

            // Update baton holder
            const batonHolderElement = document.getElementById('spakkaBatonHolder');
            if (batonHolderElement) {
                if (currentBatonHolder && currentBatonHolder.holderTeamName) {
                    batonHolderElement.textContent = currentBatonHolder.holderTeamName;
                } else if (batonHistory && batonHistory.length > 0) {
                    // Fallback to history if currentBatonHolder not set
                    const latest = batonHistory[0];
                    batonHolderElement.textContent = latest.newHolderTeamName || latest.to || '-';
                } else {
                    batonHolderElement.textContent = '-';
                }
            }

            // Update forfeits (Current Forfeits Holders)
            const playerStats = {};
            if (allPlayers && allPlayers.length > 0) {
                allPlayers.forEach(player => {
                    playerStats[player.name] = {
                        total: 0,
                        games: calculateTotalGames(player)
                    };
                });
                fines.forEach(fine => {
                    if (playerStats[fine.playerName]) {
                        playerStats[fine.playerName].total += fine.amount;
                    }
                });
            }

            const leastGames = Object.keys(playerStats).length > 0
                ? Object.entries(playerStats)
                    .map(([name, stats]) => ({ name, games: stats.games }))
                    .sort((a, b) => a.games - b.games)[0]
                : null;

            const highestTotal = Object.keys(playerStats).length > 0
                ? Object.entries(playerStats)
                    .map(([name, stats]) => ({ name, total: stats.total }))
                    .sort((a, b) => b.total - a.total)[0]
                : null;

            const highestPerGame = Object.keys(playerStats).length > 0
                ? Object.entries(playerStats)
                    .map(([name, stats]) => ({
                        name,
                        perGame: stats.games > 0 ? stats.total / stats.games : 0
                    }))
                    .sort((a, b) => b.perGame - a.perGame)[0]
                : null;

            const forfeitsDiv = document.getElementById('spakkaForfeits');
            if (forfeitsDiv) {
                if (Object.keys(playerStats).length === 0) {
                    forfeitsDiv.innerHTML = '<div style="text-align: center; padding: 20px; color: #7B9AD4;">No player data yet</div>';
                } else {
                    forfeitsDiv.innerHTML = `
                        <div style="background: rgba(110,206,178,0.1); padding: 15px; border-radius: 8px; margin-bottom: 10px; border-left: 4px solid #6ECEB2;">
                            <div style="font-size: 1.1em; margin-bottom: 5px; color: #A8BDE0;">Least Games</div>
                            <div style="font-size: 1.3em; font-weight: bold; color: #FFF;">${leastGames?.name || '-'} (${leastGames?.games || 0} games)</div>
                        </div>
                        <div style="background: rgba(255,205,0,0.1); padding: 15px; border-radius: 8px; margin-bottom: 10px; border-left: 4px solid #FFCD00;">
                            <div style="font-size: 1.1em; margin-bottom: 5px; color: #A8BDE0;">Most Fines Total</div>
                            <div style="font-size: 1.3em; font-weight: bold; color: #FFF;">${highestTotal?.name || '-'} (£${(highestTotal?.total || 0).toFixed(0)})</div>
                        </div>
                        <div style="background: rgba(255,107,107,0.1); padding: 15px; border-radius: 8px; margin-bottom: 10px; border-left: 4px solid #ff6b6b;">
                            <div style="font-size: 1.1em; margin-bottom: 5px; color: #A8BDE0;">Worst Per Game</div>
                            <div style="font-size: 1.3em; font-weight: bold; color: #FFF;">${highestPerGame?.name || '-'} (£${(highestPerGame?.perGame || 0).toFixed(2)})</div>
                        </div>
                    `;
                }
            }
        }

        function togglePaid(id, paid) {
            if (paid) {
                currentPaidFineId = id;
                document.getElementById('paidModal').style.display = 'block';
            } else {
                confirmUnpaid(id);
            }
        }

        function closePaidModal() {
            document.getElementById('paidModal').style.display = 'none';
            currentPaidFineId = null;
        }

        async function confirmPaid() {
            const paidDate = document.getElementById('paidDateInput').value;
            if (!paidDate) {
                alert('Please select a date');
                return;
            }

            try {
                await callFunction('updateFine', {
                    fineId: currentPaidFineId,
                    updates: { paid: true, paidDate: paidDate },
                });
                closePaidModal();
            } catch (error) {
                alert('❌ Failed to update');
            }
        }

        async function confirmUnpaid(id) {
            try {
                await callFunction('updateFine', {
                    fineId: id,
                    updates: { paid: false, paidDate: null },
                });
            } catch (error) {
                alert('❌ Failed to update');
            }
        }

        // ==========================================
        // MULTI-SELECT BULK ACTIONS
        // ==========================================

        function toggleFineSelection(fineId) {
            if (selectedFineIds.has(fineId)) {
                selectedFineIds.delete(fineId);
            } else {
                selectedFineIds.add(fineId);
            }
            updateBulkActionBar();
            updateSelectAllCheckbox();
        }
        window.toggleFineSelection = toggleFineSelection;

        function toggleSelectAll(checked) {
            const visibleCheckboxes = document.querySelectorAll('#historyContent tbody tr:not([style*="display: none"]) .fine-checkbox');
            visibleCheckboxes.forEach(cb => {
                const fineId = cb.dataset.id;
                if (checked) {
                    selectedFineIds.add(fineId);
                    cb.checked = true;
                } else {
                    selectedFineIds.delete(fineId);
                    cb.checked = false;
                }
                cb.closest('tr')?.classList.toggle('row-selected', checked);
            });
            updateBulkActionBar();
        }
        window.toggleSelectAll = toggleSelectAll;

        function updateSelectAllCheckbox() {
            const selectAllCb = document.getElementById('selectAllFines');
            if (!selectAllCb) return;

            const visibleCheckboxes = document.querySelectorAll('#historyContent tbody tr:not([style*="display: none"]) .fine-checkbox');
            const checkedCount = Array.from(visibleCheckboxes).filter(cb => cb.checked).length;

            selectAllCb.checked = visibleCheckboxes.length > 0 && checkedCount === visibleCheckboxes.length;
            selectAllCb.indeterminate = checkedCount > 0 && checkedCount < visibleCheckboxes.length;
        }

        function updateBulkActionBar() {
            const bar = document.getElementById('bulkActionBar');
            const countSpan = document.getElementById('selectedCount');
            if (!bar || !countSpan) return;

            const count = selectedFineIds.size;
            countSpan.textContent = count;

            // Selected GBP total (from the full history dataset)
            const totalSpan = document.getElementById('selectedTotal');
            if (totalSpan) {
                let sum = 0;
                cachedFullFines.forEach(f => { if (selectedFineIds.has(f.id)) sum += (f.amount || 0); });
                totalSpan.textContent = `£${sum.toFixed(2)}`;
            }

            bar.style.display = count > 0 ? 'flex' : 'none';
        }

        // Re-sync row highlights + checkboxes from selectedFineIds (after bulk selects)
        function syncRowHighlights() {
            document.querySelectorAll('#historyContent tbody tr').forEach(row => {
                const cb = row.querySelector('.fine-checkbox');
                const id = cb && cb.dataset.id;
                const sel = !!(id && selectedFineIds.has(id));
                row.classList.toggle('row-selected', sel);
                if (cb) cb.checked = sel;
            });
        }

        // Tap anywhere on a row (except action buttons) to toggle its selection
        function toggleRowSelection(event, fineId) {
            if (event.target.closest('.row-action')) return; // let Paid/Del buttons act
            const sel = !selectedFineIds.has(fineId);
            if (sel) selectedFineIds.add(fineId); else selectedFineIds.delete(fineId);
            const row = event.currentTarget;
            row.classList.toggle('row-selected', sel);
            const cb = row.querySelector('.fine-checkbox');
            if (cb) cb.checked = sel;
            updateBulkActionBar();
            updateSelectAllCheckbox();
        }
        window.toggleRowSelection = toggleRowSelection;

        // Quick-select chips
        function selectAllVisible() {
            toggleSelectAll(true);
            const selectAllCb = document.getElementById('selectAllFines');
            if (selectAllCb) selectAllCb.checked = true;
            syncRowHighlights();
        }
        window.selectAllVisible = selectAllVisible;

        function selectUnpaidVisible() {
            selectedFineIds.clear();
            document.querySelectorAll('#historyContent tbody tr:not([style*="display: none"])').forEach(row => {
                if (row.dataset.paid === 'false') {
                    const id = row.querySelector('.fine-checkbox')?.dataset.id;
                    if (id) selectedFineIds.add(id);
                }
            });
            syncRowHighlights();
            updateBulkActionBar();
            updateSelectAllCheckbox();
        }
        window.selectUnpaidVisible = selectUnpaidVisible;

        // Bulk delete selected fines (single "are you sure?" confirm)
        async function bulkDelete() {
            if (selectedFineIds.size === 0) {
                showToast('No fines selected', 'error');
                return;
            }
            const ids = Array.from(selectedFineIds);
            if (!confirm(`Delete ${ids.length} fine${ids.length === 1 ? '' : 's'}? Are you sure? This cannot be undone.`)) {
                return;
            }
            try {
                showLoading(`Deleting ${ids.length} fines...`);
                for (const id of ids) {
                    await callFunction('deleteFine', { fineId: id });
                }
                clearSelection();
                hideLoading();
                showToast(`${ids.length} fine${ids.length === 1 ? '' : 's'} deleted`, 'success');
                await refreshHistory();
            } catch (error) {
                hideLoading();
                showToast('Failed to delete some fines', 'error');
            }
        }
        window.bulkDelete = bulkDelete;

        function clearSelection() {
            selectedFineIds.clear();
            document.querySelectorAll('.fine-checkbox').forEach(cb => cb.checked = false);
            document.querySelectorAll('#historyContent tbody tr.row-selected').forEach(r => r.classList.remove('row-selected'));
            const selectAllCb = document.getElementById('selectAllFines');
            if (selectAllCb) {
                selectAllCb.checked = false;
                selectAllCb.indeterminate = false;
            }
            updateBulkActionBar();
        }
        window.clearSelection = clearSelection;

        function bulkMarkPaid() {
            if (selectedFineIds.size === 0) {
                showToast('No fines selected', 'error');
                return;
            }
            document.getElementById('bulkPaidCount').textContent = selectedFineIds.size;
            document.getElementById('bulkPaidDateInput').value = new Date().toISOString().split('T')[0];
            document.getElementById('bulkPaidModal').style.display = 'block';
        }
        window.bulkMarkPaid = bulkMarkPaid;

        function closeBulkPaidModal() {
            document.getElementById('bulkPaidModal').style.display = 'none';
        }
        window.closeBulkPaidModal = closeBulkPaidModal;

        async function confirmBulkPaid() {
            const paidDate = document.getElementById('bulkPaidDateInput').value;
            if (!paidDate) {
                alert('Please select a payment date');
                return;
            }

            const fineIds = Array.from(selectedFineIds);
            if (fineIds.length === 0) {
                alert('No fines selected');
                closeBulkPaidModal();
                return;
            }

            try {
                showLoading(`Marking ${fineIds.length} fines as paid...`);

                for (const fineId of fineIds) {
                    await callFunction('updateFine', {
                        fineId: fineId,
                        updates: { paid: true, paidDate: paidDate },
                    });
                }

                closeBulkPaidModal();
                clearSelection();
                hideLoading();
                showToast(`${fineIds.length} fines marked as paid`, 'success');

                // Refresh history to show updated status
                await refreshHistory();
            } catch (error) {
                hideLoading();
                alert('❌ Failed to update some fines');
            }
        }
        window.confirmBulkPaid = confirmBulkPaid;

        async function bulkMarkUnpaid() {
            if (selectedFineIds.size === 0) {
                showToast('No fines selected', 'error');
                return;
            }

            if (!confirm(`Mark ${selectedFineIds.size} fines as unpaid?`)) {
                return;
            }

            const fineIds = Array.from(selectedFineIds);

            try {
                showLoading(`Marking ${fineIds.length} fines as unpaid...`);

                for (const fineId of fineIds) {
                    await callFunction('updateFine', {
                        fineId: fineId,
                        updates: { paid: false, paidDate: null },
                    });
                }

                clearSelection();
                hideLoading();
                showToast(`${fineIds.length} fines marked as unpaid`, 'success');

                // Refresh history to show updated status
                await refreshHistory();
            } catch (error) {
                hideLoading();
                alert('❌ Failed to update some fines');
            }
        }
        window.bulkMarkUnpaid = bulkMarkUnpaid;

        function markAllPaid() {
            document.getElementById('markAllModal').style.display = 'block';
        }

        function markAllPaidSettings() {
            document.getElementById('markAllModal').style.display = 'block';
        }

        function closeMarkAllModal() {
            document.getElementById('markAllModal').style.display = 'none';
        }

        async function confirmMarkAllPaid() {
            const paidDate = document.getElementById('markAllDateInput').value;
            if (!paidDate) {
                alert('Please select a payment date');
                return;
            }

            const unpaidFines = allFines.filter(f => !f.paid);
            
            if (unpaidFines.length === 0) {
                alert('No unpaid fines to mark!');
                closeMarkAllModal();
                return;
            }

            if (!confirm(`Mark ${unpaidFines.length} fines as paid on ${formatDateDDMMYYYY(paidDate)}?`)) {
                return;
            }

            try {
                showLoading(`Marking ${unpaidFines.length} fines as paid...`);

                for (const fine of unpaidFines) {
                    await callFunction('updateFine', {
                        fineId: fine.id,
                        updates: { paid: true, paidDate: paidDate },
                    });
                }
                hideLoading();
                showToast(`Marked ${unpaidFines.length} fines as paid!`, 'success');
                closeMarkAllModal();
            } catch (error) {
                hideLoading();
                showToast('Failed to mark all as paid', 'error');
            }
        }

        async function deleteFine(id) {
            if (confirm('Delete this fine?')) {
                try {
                    showLoading('Deleting...');

                    await callFunction('deleteFine', { fineId: id });
                    hideLoading();
                    showToast('Fine deleted', 'success');
                } catch (error) {
                    hideLoading();
                    showToast('Failed to delete fine', 'error');
                }
            }
        }

        async function clearAllFines() {
            if (!confirm('⚠️ Clear ALL fines? Cannot be undone!')) return;
            if (!confirm('Are you SURE?')) return;

            try {
                showLoading('Clearing all fines...');

                const result = await callFunction('deleteAllFines', {});
                hideLoading();
                showToast(`Cleared ${result.data.count} fines successfully`, 'success');
            } catch (error) {
                hideLoading();
                showToast('Failed to clear fines', 'error');
            }
        }

        function copyUnpaidList() {
            const fines = getFinesForAnalytics(); // Use canonical dataset
            const unpaidByPlayer = {};
            fines.filter(f => !f.paid).forEach(fine => {
                unpaidByPlayer[fine.playerName] = (unpaidByPlayer[fine.playerName] || 0) + fine.amount;
            });

            if (Object.keys(unpaidByPlayer).length === 0) {
                showToast('No unpaid fines!', 'info');
                return;
            }

            const sortedUnpaid = Object.entries(unpaidByPlayer).sort((a, b) => b[1] - a[1]);
            const totalUnpaid = sortedUnpaid.reduce((sum, [, amount]) => sum + amount, 0);

            let message = `🍺 BOOZE BATON - Unpaid Fines 🍺\n\n`;
            sortedUnpaid.forEach(([name, amount]) => {
                message += `${name}: £${amount.toFixed(2)}\n`;
            });
            message += `\n💰 Total Unpaid: £${totalUnpaid.toFixed(2)}`;

            navigator.clipboard.writeText(message).then(() => {
                showToast('Unpaid list copied to clipboard!', 'success');
            }).catch(() => {
                showToast('Failed to copy to clipboard', 'error');
            });
        }

        function copyPaymentReminder() {
            const fines = getFinesForAnalytics(); // Use canonical dataset
            const unpaidByPlayer = {};
            fines.filter(f => !f.paid).forEach(fine => {
                unpaidByPlayer[fine.playerName] = (unpaidByPlayer[fine.playerName] || 0) + fine.amount;
            });

            if (Object.keys(unpaidByPlayer).length === 0) {
                showToast('No unpaid fines!', 'info');
                return;
            }

            const sortedUnpaid = Object.entries(unpaidByPlayer).sort((a, b) => b[1] - a[1]);
            const totalUnpaid = sortedUnpaid.reduce((sum, [, amount]) => sum + amount, 0);

            let message = `🚨 PAYMENT REMINDER 🚨\n\n`;
            message += `The following players have unpaid fines:\n\n`;
            sortedUnpaid.forEach(([name, amount]) => {
                message += `📌 ${name}: £${amount.toFixed(2)}\n`;
            });
            message += `\n💷 Total Outstanding: £${totalUnpaid.toFixed(2)}\n\n`;
            message += `Please settle your fines ASAP! 💸`;

            navigator.clipboard.writeText(message).then(() => {
                showToast('Payment reminder copied!', 'success');
            }).catch(() => {
                showToast('Failed to copy to clipboard', 'error');
            });
        }

        function updateLeaderboards() {
            const fines = getFinesForAnalytics(); // Use canonical dataset

            // Hall of Shame - Top 5 by total fines
            const playerTotals = {};
            if (fines && fines.length > 0) {
                fines.forEach(fine => {
                    if (fine && fine.playerName && fine.amount) {
                        playerTotals[fine.playerName] = (playerTotals[fine.playerName] || 0) + fine.amount;
                    }
                });
            }

            const hallOfShame = Object.entries(playerTotals)
                .sort((a, b) => b[1] - a[1])
                .slice(0, 5);

            const hallOfShameEl = document.getElementById('hallOfShameList');
            if (hallOfShameEl) {
                if (hallOfShame.length === 0) {
                    hallOfShameEl.innerHTML = '<div style="color: #7B9AD4; padding: 10px;">No fines recorded yet</div>';
                } else {
                    const medals = ['🥇', '🥈', '🥉', '4️⃣', '5️⃣'];
                    hallOfShameEl.innerHTML = hallOfShame.map(([name, total], index) =>
                        `<div style="padding: 10px 0; border-bottom: 1px solid #2E5AB0; display: flex; justify-content: space-between; flex-wrap: wrap;">
                            <span style="flex: 1; min-width: 100px; color: #FFF;">${medals[index]} ${name}</span>
                            <span style="font-weight: bold; color: #FFCD00;">£${total.toFixed(2)}</span>
                        </div>`
                    ).join('');
                }
            }

            // Most Improved - Most fines paid in last 30 days
            const thirtyDaysAgo = new Date();
            thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

            const recentPayments = {};
            fines.filter(f => f.paid && f.paidDate).forEach(fine => {
                const paidDate = new Date(fine.paidDate);
                if (paidDate >= thirtyDaysAgo) {
                    recentPayments[fine.playerName] = (recentPayments[fine.playerName] || 0) + fine.amount;
                }
            });

            const mostImproved = Object.entries(recentPayments)
                .sort((a, b) => b[1] - a[1])
                .slice(0, 5);

            const mostImprovedEl = document.getElementById('mostImprovedList');
            if (mostImprovedEl) {
                if (mostImproved.length === 0) {
                    mostImprovedEl.innerHTML = '<div style="color: #7B9AD4; padding: 10px;">No payments in last 30 days</div>';
                } else {
                    const medals = ['🥇', '🥈', '🥉', '4️⃣', '5️⃣'];
                    mostImprovedEl.innerHTML = mostImproved.map(([name, total], index) =>
                        `<div style="padding: 10px 0; border-bottom: 1px solid #2E5AB0; display: flex; justify-content: space-between; flex-wrap: wrap;">
                            <span style="flex: 1; min-width: 100px; color: #FFF;">${medals[index]} ${name}</span>
                            <span style="font-weight: bold; color: #6ECEB2;">£${total.toFixed(2)} paid</span>
                        </div>`
                    ).join('');
                }
            }

            // Clean Record - Zero unpaid, sorted by total paid
            const unpaidByPlayer = {};
            fines.filter(f => !f.paid).forEach(fine => {
                unpaidByPlayer[fine.playerName] = (unpaidByPlayer[fine.playerName] || 0) + fine.amount;
            });

            const paidByPlayer = {};
            fines.filter(f => f.paid).forEach(fine => {
                paidByPlayer[fine.playerName] = (paidByPlayer[fine.playerName] || 0) + fine.amount;
            });

            const cleanRecord = Object.entries(paidByPlayer)
                .filter(([name]) => !unpaidByPlayer[name] || unpaidByPlayer[name] === 0)
                .sort((a, b) => b[1] - a[1])
                .slice(0, 5);

            const cleanRecordEl = document.getElementById('cleanRecordList');
            if (cleanRecordEl) {
                if (cleanRecord.length === 0) {
                    cleanRecordEl.innerHTML = '<div style="color: #7B9AD4; padding: 10px;">No players with clean record yet</div>';
                } else {
                    const medals = ['🥇', '🥈', '🥉', '4️⃣', '5️⃣'];
                    cleanRecordEl.innerHTML = cleanRecord.map(([name, total], index) =>
                        `<div style="padding: 10px 0; border-bottom: 1px solid #2E5AB0; display: flex; justify-content: space-between; flex-wrap: wrap;">
                            <span style="flex: 1; min-width: 100px; color: #FFF;">${medals[index]} ${name}</span>
                            <span style="font-weight: bold; color: #A8BDE0;">£${total.toFixed(2)} paid</span>
                        </div>`
                    ).join('');
                }
            }
        }

        function updateBatonRiskPrediction() {
            if (allPlayers.length === 0) {
                const safeEl = document.getElementById('safePlayers');
                const riskEl = document.getElementById('atRiskPlayers');
                if (safeEl) safeEl.innerHTML = '<div style="color: #7B9AD4; padding: 10px;">No player data yet</div>';
                if (riskEl) riskEl.innerHTML = '<div style="color: #7B9AD4; padding: 10px;">No player data yet</div>';
                return;
            }

            const fines = getFinesForAnalytics(); // Use canonical dataset
            // Calculate per-game fine rate for each player
            const playerStats = allPlayers.map(player => {
                const playerFines = fines.filter(f => f.playerName === player.name);
                const totalFines = playerFines.reduce((sum, f) => sum + f.amount, 0);
                const totalGames = calculateTotalGames(player);
                const finesPerGame = totalGames > 0 ? totalFines / totalGames : 0;

                return {
                    name: player.name,
                    totalFines,
                    totalGames,
                    finesPerGame,
                    fineCount: playerFines.length
                };
            }).filter(p => p.totalGames > 0); // Only include players with games played

            // Sort by fines per game (ascending for safe, descending for at risk)
            const sortedByRisk = [...playerStats].sort((a, b) => a.finesPerGame - b.finesPerGame);

            // Top 5 safest players
            const safePlayers = sortedByRisk.slice(0, 5);
            const safePlayersEl = document.getElementById('safePlayers');
            if (safePlayersEl) {
                if (safePlayers.length === 0) {
                    safePlayersEl.innerHTML = '<div style="color: #7B9AD4; padding: 10px;">No players with games played yet</div>';
                } else {
                    safePlayersEl.innerHTML = safePlayers.map((player, index) => {
                        const icons = ['🥇', '🥈', '🥉', '4️⃣', '5️⃣'];
                        return `<div style="padding: 8px; border-bottom: 1px solid #2E5AB0; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px;">
                            <div style="flex: 1; min-width: 150px;">
                                <span style="color: #FFF;">${icons[index]} ${player.name}</span>
                                <div style="font-size: 0.85em; color: #A8BDE0; margin-top: 2px;">
                                    ${player.totalGames} games • ${player.fineCount} fines
                                </div>
                            </div>
                            <div style="text-align: right;">
                                <div style="font-weight: bold; color: #6ECEB2;">£${player.finesPerGame.toFixed(2)}/game</div>
                                <div style="font-size: 0.85em; color: #A8BDE0;">£${player.totalFines.toFixed(2)} total</div>
                            </div>
                        </div>`;
                    }).join('');
                }
            }

            // Top 5 at-risk players (highest per-game rate)
            const atRiskPlayers = sortedByRisk.slice(-5).reverse();
            const atRiskPlayersEl = document.getElementById('atRiskPlayers');
            if (atRiskPlayersEl) {
                if (atRiskPlayers.length === 0) {
                    atRiskPlayersEl.innerHTML = '<div style="color: #7B9AD4; padding: 10px;">No players with games played yet</div>';
                } else {
                    atRiskPlayersEl.innerHTML = atRiskPlayers.map((player, index) => {
                        const icons = ['⚠️', '🔴', '🚨', '💀', '☠️'];
                        return `<div style="padding: 8px; border-bottom: 1px solid #2E5AB0; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px;">
                            <div style="flex: 1; min-width: 150px;">
                                <span style="color: #FFF;">${icons[index]} ${player.name}</span>
                                <div style="font-size: 0.85em; color: #A8BDE0; margin-top: 2px;">
                                    ${player.totalGames} games • ${player.fineCount} fines
                                </div>
                            </div>
                            <div style="text-align: right;">
                                <div style="font-weight: bold; color: #ff6b6b;">£${player.finesPerGame.toFixed(2)}/game</div>
                                <div style="font-size: 0.85em; color: #A8BDE0;">£${player.totalFines.toFixed(2)} total</div>
                            </div>
                        </div>`;
                    }).join('');
                }
            }
        }

        function exportData() {
            const fines = getFinesForAnalytics(); // Use canonical dataset
            if (fines.length === 0) {
                alert('No data to export');
                return;
            }

            const csv = [
                ['Name', 'Date', 'Fine', 'Amount', 'Paid'],
                ...fines.map(f => [
                    f.playerName,
                    f.date,
                    f.reason,
                    f.amount,
                    f.paidDate || ''
                ])
            ].map(row => row.join(',')).join('\n');

            const blob = new Blob([csv], { type: 'text/csv' });
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `booze-baton-${new Date().toISOString().split('T')[0]}.csv`;
            a.click();
        }

        function exportPDF() {
            const fines = getFinesForAnalytics(); // Use canonical dataset
            if (fines.length === 0) {
                showToast('No data to export', 'error');
                return;
            }

            // Access jsPDF from window
            const { jsPDF } = window.jspdf;
            const doc = new jsPDF();

            // Title
            doc.setFontSize(20);
            doc.setTextColor(29, 66, 138); // Blue
            doc.text('BOOZE BATON - Season Summary', 105, 20, { align: 'center' });

            doc.setFontSize(10);
            doc.setTextColor(100);
            doc.text(`Generated: ${new Date().toLocaleDateString('en-GB')}`, 105, 28, { align: 'center' });

            // Overall Stats
            const totalPot = fines.reduce((sum, f) => sum + f.amount, 0);
            const totalUnpaid = fines.filter(f => !f.paid).reduce((sum, f) => sum + f.amount, 0);
            const totalPaid = totalPot - totalUnpaid;

            doc.setFontSize(14);
            doc.setTextColor(0);
            doc.text('Season Statistics', 20, 40);

            doc.setFontSize(11);
            doc.text(`Total Fines: ${fines.length}`, 20, 48);
            doc.text(`Total Pot: £${totalPot.toFixed(2)}`, 20, 54);
            doc.text(`Paid: £${totalPaid.toFixed(2)}`, 20, 60);
            doc.text(`Unpaid: £${totalUnpaid.toFixed(2)}`, 20, 66);

            // Player Breakdown
            const playerTotals = {};
            const playerUnpaid = {};
            fines.forEach(fine => {
                playerTotals[fine.playerName] = (playerTotals[fine.playerName] || 0) + fine.amount;
                if (!fine.paid) {
                    playerUnpaid[fine.playerName] = (playerUnpaid[fine.playerName] || 0) + fine.amount;
                }
            });

            const topPlayers = Object.entries(playerTotals)
                .sort((a, b) => b[1] - a[1])
                .slice(0, 10);

            doc.setFontSize(14);
            doc.text('Top 10 Players', 20, 78);

            doc.setFontSize(10);
            let yPos = 86;
            topPlayers.forEach(([name, total], index) => {
                const unpaid = playerUnpaid[name] || 0;
                doc.text(`${index + 1}. ${name}`, 20, yPos);
                doc.text(`£${total.toFixed(2)}`, 100, yPos);
                doc.text(unpaid > 0 ? `(Unpaid: £${unpaid.toFixed(2)})` : '(All paid)', 130, yPos);
                yPos += 6;
            });

            // Baton Winner
            if (batonHistory.length > 0) {
                const currentBaton = batonHistory[0];
                doc.setFontSize(14);
                doc.text('Baton Winner', 20, yPos + 8);
                doc.setFontSize(11);
                doc.setTextColor(200, 16, 46); // Red
                doc.text(`${currentBaton.playerName}`, 20, yPos + 16);
                doc.setTextColor(0);
                doc.text(`Date: ${formatDateDDMMYYYY(currentBaton.timestamp)}`, 20, yPos + 22);
            }

            // Save the PDF
            doc.save(`booze-baton-summary-${new Date().toISOString().split('T')[0]}.pdf`);
            showToast('PDF exported successfully!', 'success');
        }

        function exportWhatsApp() {
            const fines = getFinesForAnalytics(); // Use canonical dataset
            if (fines.length === 0) {
                showToast('No data to export', 'error');
                return;
            }

            const totalPot = fines.reduce((sum, f) => sum + f.amount, 0);
            const totalUnpaid = fines.filter(f => !f.paid).reduce((sum, f) => sum + f.amount, 0);
            const totalPaid = totalPot - totalUnpaid;

            // Calculate player stats
            const playerTotals = {};
            const playerUnpaid = {};
            const playerFineCount = {};

            fines.forEach(fine => {
                playerTotals[fine.playerName] = (playerTotals[fine.playerName] || 0) + fine.amount;
                playerFineCount[fine.playerName] = (playerFineCount[fine.playerName] || 0) + 1;
                if (!fine.paid) {
                    playerUnpaid[fine.playerName] = (playerUnpaid[fine.playerName] || 0) + fine.amount;
                }
            });

            const topPlayers = Object.entries(playerTotals)
                .sort((a, b) => b[1] - a[1])
                .slice(0, 10);

            // Build WhatsApp message
            let message = `🍺 *BOOZE BATON - SEASON SUMMARY* 🍺\n`;
            message += `📅 ${new Date().toLocaleDateString('en-GB')}\n\n`;

            message += `📊 *SEASON STATS*\n`;
            message += `Total Fines: ${fines.length}\n`;
            message += `💰 Total Pot: £${totalPot.toFixed(2)}\n`;
            message += `✅ Paid: £${totalPaid.toFixed(2)}\n`;
            message += `⚠️ Unpaid: £${totalUnpaid.toFixed(2)}\n\n`;

            message += `🏆 *TOP 10 OFFENDERS*\n`;
            topPlayers.forEach(([name, total], index) => {
                const medals = ['🥇', '🥈', '🥉', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣', '🔟'];
                const unpaid = playerUnpaid[name] || 0;
                const fineCount = playerFineCount[name] || 0;
                message += `${medals[index]} ${name}: £${total.toFixed(2)} (${fineCount} fines)`;
                if (unpaid > 0) {
                    message += ` ⚠️ £${unpaid.toFixed(2)} unpaid`;
                }
                message += `\n`;
            });

            // Add baton winner if exists
            if (batonHistory.length > 0) {
                const currentBaton = batonHistory[0];
                message += `\n🎯 *BATON WINNER*\n`;
                message += `👑 ${currentBaton.playerName}\n`;
                message += `📅 ${formatDateDDMMYYYY(currentBaton.timestamp)}\n`;
            }

            message += `\n_Generated by Booze Baton Tracker_`;

            // Copy to clipboard
            navigator.clipboard.writeText(message).then(() => {
                showToast('WhatsApp message copied to clipboard!', 'success');
            }).catch(() => {
                showToast('Failed to copy to clipboard', 'error');
            });
        }

        function handleFileSelect(event, replaceAll = false) {
            console.log('File select triggered, replaceAll:', replaceAll);
            const file = event.target.files[0];
            if (!file) {
                console.log('No file selected');
                return;
            }

            // If replacing all data, show confirmation
            if (replaceAll) {
                if (!confirm('⚠️ WARNING!\n\nThis will DELETE ALL current fines and replace them with data from the CSV file.\n\nThis action CANNOT be undone!\n\nAre you sure you want to continue?')) {
                    // Reset the file input
                    event.target.value = '';
                    return;
                }
            }

            console.log('File selected:', file.name);
            showImportAlert('Reading file...', 'success');

            const reader = new FileReader();
            reader.onload = async function(e) {
                console.log('File loaded, starting import');
                await parseAndImportCSV(e.target.result, replaceAll);
            };
            reader.onerror = function(e) {
                console.error('File read error:', e);
                showImportAlert('❌ Failed to read file', 'error');
            };
            reader.readAsText(file);

            // Reset file input so same file can be selected again
            event.target.value = '';
        }

        async function parseAndImportCSV(csvText, replaceAll = false) {
            const lines = csvText.split('\n').filter(line => line.trim());
            if (lines.length < 2) {
                showImportAlert('CSV is empty', 'error');
                return;
            }

            // Use proper CSV parsing
            const rows = lines.map(line => {
                const result = [];
                let current = '';
                let inQuotes = false;

                for (let i = 0; i < line.length; i++) {
                    const char = line[i];
                    if (char === '"') {
                        inQuotes = !inQuotes;
                    } else if (char === ',' && !inQuotes) {
                        result.push(current.trim());
                        current = '';
                    } else {
                        current += char;
                    }
                }
                result.push(current.trim());
                return result;
            });

            const headers = rows[0].map(h => h.toLowerCase());
            const nameIdx = headers.findIndex(h => h.includes('name'));
            const dateIdx = headers.findIndex(h => h.includes('date') && !h.includes('paid'));
            const fineIdx = headers.findIndex(h => h.includes('fine') && !h.includes('amount'));
            const amountIdx = headers.findIndex(h => h.includes('amount'));
            const paidIdx = headers.findIndex(h => h.includes('paid'));

            if (nameIdx === -1 || dateIdx === -1 || fineIdx === -1 || amountIdx === -1) {
                showImportAlert('CSV needs: Name, Date, Fine, Amount', 'error');
                return;
            }

            const fines = [];
            for (let i = 1; i < rows.length; i++) {
                const values = rows[i];

                const paidDate = paidIdx !== -1 ? values[paidIdx] : '';

                const fine = {
                    playerName: values[nameIdx],
                    date: formatDateToISO(values[dateIdx]),
                    reason: values[fineIdx],
                    amount: parseFloat(values[amountIdx].replace(/[£$,]/g, '')),
                    paid: paidDate ? true : false,
                    paidDate: paidDate ? formatDateToISO(paidDate) : null,
                    timestamp: new Date().toISOString()
                };

                if (fine.playerName && fine.date && fine.reason && !isNaN(fine.amount)) {
                    fines.push(fine);
                }
            }

            if (fines.length === 0) {
                showImportAlert('No valid fines found', 'error');
                return;
            }

            try {
                // If replaceAll, delete all existing fines first
                if (replaceAll) {
                    showLoading('Deleting all existing fines...');
                    showImportAlert('Deleting all existing fines...', 'info');
                    
                    const result = await callFunction('deleteAllFines', {});
                    showImportAlert(`Deleted ${result.data.count} existing fines`, 'success');
                }

                // Show progress message
                const action = replaceAll ? 'Replacing with' : 'Importing';
                showImportAlert(`${action} ${fines.length} fines... Please wait (this may take 30-60 seconds)`, 'success');
                showLoading(`${action} ${fines.length} fines...`);

                let imported = 0;
                
                for (const fine of fines) {
                    await callFunction('addFine', { fine });
                    imported++;

                    // Update progress every 50 fines
                    if (imported % 50 === 0) {
                        showImportAlert(`${action}... ${imported}/${fines.length} fines`, 'success');
                    }
                }

                hideLoading();
                const successMsg = replaceAll
                    ? `✅ Successfully replaced all data with ${fines.length} fines!`
                    : `✅ Imported ${fines.length} fines successfully!`;
                showImportAlert(successMsg, 'success');
                showToast(successMsg, 'success');
            } catch (error) {
                console.error('Import error:', error);
                hideLoading();
                const errorMsg = `❌ Import failed. Error: ${error.message}`;
                showImportAlert(errorMsg, 'error');
                showToast(errorMsg, 'error');
            }
        }

        function formatDateToISO(dateStr) {
            if (!dateStr) return null;

            // First try to parse DD/MM/YYYY format (UK format)
            const parts = dateStr.split('/');
            if (parts.length === 3) {
                const [day, month, year] = parts;
                // Validate it's actually a date
                const d = parseInt(day);
                const m = parseInt(month);
                const y = parseInt(year);
                if (d >= 1 && d <= 31 && m >= 1 && m <= 12 && y >= 1900) {
                    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
                }
            }

            // Fallback: try ISO format (YYYY-MM-DD)
            if (dateStr.match(/^\d{4}-\d{2}-\d{2}$/)) {
                return dateStr;
            }

            // Last resort: return today's date
            return new Date().toISOString().split('T')[0];
        }

        function showImportAlert(message, type) {
            const alertDiv = document.getElementById('importAlert');
            alertDiv.innerHTML = `<div class="alert alert-${type}">${message}</div>`;
            setTimeout(() => alertDiv.innerHTML = '', 3000);
        }

        function updateFineReasonsTable() {
            const table = document.getElementById('fineReasonsTable');
            table.innerHTML = fineReasons.map((fine, i) => `
                <div class="fine-reason-item">
                    <span class="fine-reason-text">${fine.reason}</span>
                    <span class="fine-reason-amount">£${fine.amount.toFixed(2)}</span>
                    <div>
                        <button class="btn-small btn-secondary" onclick="editFineReason(${i})">Edit</button>
                        <button class="btn-small btn-danger" onclick="deleteFineReason(${i})">Del</button>
                    </div>
                </div>
            `).join('');
        }

        async function addNewFineReason() {
            const reason = prompt('New fine reason:');
            if (!reason) return;

            const amount = parseFloat(prompt('Amount (£):'));
            if (isNaN(amount)) {
                alert('Invalid amount');
                return;
            }

            fineReasons.push({ reason, amount });
            await saveFineReasons();
            alert('✅ Added!');
        }

        async function editFineReason(index) {
            const fine = fineReasons[index];
            const newAmount = parseFloat(prompt(`Edit amount for "${fine.reason}":`, fine.amount));
            
            if (!isNaN(newAmount)) {
                fineReasons[index].amount = newAmount;
                await saveFineReasons();
            }
        }

        async function deleteFineReason(index) {
            if (confirm('Delete this fine reason?')) {
                fineReasons.splice(index, 1);
                await saveFineReasons();
            }
        }

        async function saveFineReasons() {
            try {
                await callFunction('updateFineReasons', { fineReasons });
                populateFineReasons();
                updateFineReasonsTable();
            } catch (error) {
                console.error('Error saving fine reasons:', error);
            }
        }

        // Toast Notification System
        function showToast(message, type = 'success') {
            const container = document.getElementById('toastContainer');
            const toast = document.createElement('div');
            toast.className = `toast toast-${type}`;

            const icons = {
                success: '✓',
                error: '✗',
                info: 'ℹ'
            };

            toast.innerHTML = `
                <div class="toast-icon">${icons[type] || icons.info}</div>
                <div class="toast-message">${message}</div>
                <div class="toast-close" onclick="this.parentElement.remove()">×</div>
            `;

            container.appendChild(toast);

            setTimeout(() => toast.classList.add('show'), 10);

            setTimeout(() => {
                toast.classList.remove('show');
                setTimeout(() => toast.remove(), 300);
            }, 4000);
        }

        // Loading Overlay
        function showLoading(text = 'Loading...') {
            const overlay = document.getElementById('loadingOverlay');
            const loadingText = overlay.querySelector('.loading-text');
            loadingText.textContent = text;
            overlay.classList.add('active');
        }

        function hideLoading() {
            const overlay = document.getElementById('loadingOverlay');
            overlay.classList.remove('active');
        }

        // Network Status Detection
        function checkNetworkStatus() {
            const status = document.getElementById('networkStatus');
            if (!navigator.onLine) {
                status.classList.add('offline');
            } else {
                status.classList.remove('offline');
            }
        }

        window.addEventListener('online', () => {
            const status = document.getElementById('networkStatus');
            status.classList.remove('offline');
            showToast('Back online!', 'success');
        });

        window.addEventListener('offline', () => {
            const status = document.getElementById('networkStatus');
            status.classList.add('offline');
            showToast('Connection lost', 'error');
        });

        // Chart instances
        let charts = {
            playerFines: null,
            perGame: null,
            payment: null,
            trends: null
        };

        function updateCharts() {
            const fines = getFinesForAnalytics(); // Use canonical dataset
            if (fines.length === 0) return;

            updatePlayerFinesChart();
            updatePerGameChart();
            updateFineTypesChart();
            updatePaymentChart();
            updateTrendsChart();
            populateFineTypeAnalysisSelector();
        }

        function updatePlayerFinesChart() {
            const ctx = document.getElementById('playerFinesChart');
            if (!ctx) return;

            const fines = getFinesForAnalytics(); // Use canonical dataset
            const playerTotals = {};
            fines.forEach(fine => {
                playerTotals[fine.playerName] = (playerTotals[fine.playerName] || 0) + fine.amount;
            });

            const sortedPlayers = Object.entries(playerTotals)
                .sort((a, b) => b[1] - a[1])
                .slice(0, 10);

            if (charts.playerFines) charts.playerFines.destroy();
            charts.playerFines = new Chart(ctx, {
                type: 'bar',
                data: {
                    labels: sortedPlayers.map(([name]) => name),
                    datasets: [{
                        label: 'Total Fines (£)',
                        data: sortedPlayers.map(([, total]) => total),
                        backgroundColor: '#FFCD00',
                        borderColor: '#FFCD00',
                        borderWidth: 1
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: { display: false },
                        title: {
                            display: true,
                            text: 'Top 10 Players by Total Fines',
                            color: '#FFCD00',
                            font: { size: 14, weight: 'bold' }
                        }
                    },
                    scales: {
                        y: {
                            beginAtZero: true,
                            ticks: {
                                callback: function(value) {
                                    return '£' + value;
                                },
                                font: { size: 11 },
                                color: '#A8BDE0'
                            },
                            grid: { color: 'rgba(46,90,176,0.3)' }
                        },
                        x: {
                            ticks: {
                                font: { size: 11 },
                                color: '#A8BDE0'
                            },
                            grid: { color: 'rgba(46,90,176,0.3)' }
                        }
                    }
                }
            });
        }

        function updatePerGameChart() {
            const ctx = document.getElementById('perGameChart');
            if (!ctx) return;

            if (!allPlayers || allPlayers.length === 0) {
                console.log('No players data for per game chart');
                return;
            }

            const fines = getFinesForAnalytics(); // Use canonical dataset
            const playerStats = {};
            try {
                allPlayers.forEach(player => {
                    if (player && player.name) {
                        playerStats[player.name] = {
                            total: 0,
                            games: calculateTotalGames(player)
                        };
                    }
                });

                if (fines && fines.length > 0) {
                    fines.forEach(fine => {
                        if (fine && playerStats[fine.playerName]) {
                            playerStats[fine.playerName].total += (fine.amount || 0);
                        }
                    });
                }

                const perGameData = Object.entries(playerStats)
                    .filter(([, stats]) => stats && stats.games > 0)
                    .map(([name, stats]) => ({
                        name,
                        games: stats.games,
                        perGame: stats.total / stats.games
                    }))
                    .sort((a, b) => b.games - a.games)
                    .slice(0, 10);

                if (perGameData.length === 0) {
                    console.log('No per game data to display');
                    return;
                }

                if (charts.perGame) charts.perGame.destroy();
                charts.perGame = new Chart(ctx, {
                    type: 'bar',
                    data: {
                        labels: perGameData.map(p => p.name || ''),
                        datasets: [
                            {
                                label: 'Games Played',
                                data: perGameData.map(p => p.games || 0),
                                backgroundColor: '#2E5AB0',
                                borderColor: '#FFCD00',
                                borderWidth: 1,
                                yAxisID: 'y',
                                order: 2
                            },
                            {
                                label: 'Cost Per Game (£)',
                                data: perGameData.map(p => p.perGame || 0),
                                type: 'line',
                                borderColor: '#ff6b6b',
                                backgroundColor: '#ff6b6b',
                                borderWidth: 3,
                                pointBackgroundColor: '#ff6b6b',
                                pointBorderColor: '#16307A',
                                pointBorderWidth: 2,
                                pointRadius: 5,
                                tension: 0.3,
                                yAxisID: 'y1',
                                order: 1
                            }
                        ]
                    },
                    options: {
                        responsive: true,
                        maintainAspectRatio: false,
                        plugins: {
                            legend: {
                                display: true,
                                position: 'top',
                                labels: {
                                    usePointStyle: true,
                                    font: { size: 11 }
                                }
                            },
                            title: {
                                display: true,
                                text: 'Games Played vs Cost Per Game',
                                color: '#FFCD00',
                                font: { size: 14, weight: 'bold' }
                            }
                        },
                        scales: {
                            y: {
                                type: 'linear',
                                position: 'left',
                                beginAtZero: true,
                                title: {
                                    display: true,
                                    text: 'Games Played',
                                    color: '#A8BDE0',
                                    font: { size: 11, weight: 'bold' }
                                },
                                ticks: {
                                    stepSize: 1,
                                    font: { size: 11 },
                                    color: '#A8BDE0'
                                },
                                grid: {
                                    drawOnChartArea: true,
                                    color: 'rgba(46,90,176,0.3)'
                                }
                            },
                            y1: {
                                type: 'linear',
                                position: 'right',
                                beginAtZero: true,
                                title: {
                                    display: true,
                                    text: 'Cost Per Game (£)',
                                    color: '#ff6b6b',
                                    font: { size: 11, weight: 'bold' }
                                },
                                ticks: {
                                    callback: function(value) {
                                        return '£' + (value || 0).toFixed(2);
                                    },
                                    font: { size: 11 },
                                    color: '#ff6b6b'
                                },
                                grid: {
                                    drawOnChartArea: false
                                }
                            },
                            x: {
                                ticks: {
                                    font: { size: 11 },
                                    color: '#A8BDE0'
                                },
                                grid: { color: 'rgba(46,90,176,0.3)' }
                            }
                        }
                    }
                });
            } catch (error) {
                console.error('Error updating per game chart:', error);
            }
        }

        function updateFineTypesChart() {
            const container = document.getElementById('busiestByCount');
            if (!container) return;

            const fines = getFinesForAnalytics();

            // Group fines by date with player breakdown
            const dailyStats = {};
            fines.forEach(fine => {
                const dateKey = formatDateDDMMYYYY(fine.date);
                if (!dailyStats[dateKey]) {
                    dailyStats[dateKey] = { count: 0, total: 0, players: {} };
                }
                dailyStats[dateKey].count++;
                dailyStats[dateKey].total += fine.amount || 0;

                const playerName = fine.playerName || 'Unknown';
                if (!dailyStats[dateKey].players[playerName]) {
                    dailyStats[dateKey].players[playerName] = 0;
                }
                dailyStats[dateKey].players[playerName]++;
            });

            // Find top offender for each day
            Object.values(dailyStats).forEach(day => {
                const topPlayer = Object.entries(day.players)
                    .sort((a, b) => b[1] - a[1])[0];
                day.topOffender = topPlayer ? topPlayer[0] : '-';
                day.topOffenderCount = topPlayer ? topPlayer[1] : 0;
            });

            // Top 10 by fine count
            const topDays = Object.entries(dailyStats)
                .sort((a, b) => b[1].count - a[1].count)
                .slice(0, 10);

            if (topDays.length === 0) {
                container.innerHTML = '<p style="color: #7B9AD4; text-align: center;">No data</p>';
                return;
            }

            container.innerHTML = `
                <table style="width: 100%; table-layout: fixed; font-size: 0.85em;">
                    <thead>
                        <tr>
                            <th style="text-align: left; width: 30%;">Date</th>
                            <th style="text-align: center; width: 15%;">Fines</th>
                            <th style="text-align: right; width: 20%;">Cost</th>
                            <th style="text-align: left; width: 35%;">Top Offender</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${topDays.map(([date, stats], i) => `
                            <tr${i === 0 ? ' style="background: rgba(255,205,0,0.1);"' : ''}>
                                <td style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${i === 0 ? '🏆 ' : ''}${date}</td>
                                <td style="text-align: center; font-weight: 600; color: #FFCD00;">${stats.count}</td>
                                <td style="text-align: right; color: #ff6b6b;">£${stats.total.toFixed(2)}</td>
                                <td style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${stats.topOffender} <span style="color: #7B9AD4;">(${stats.topOffenderCount})</span></td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>`;
        }

        function updatePaymentChart() {
            const ctx = document.getElementById('paymentChart');
            if (!ctx) return;

            const fines = getFinesForAnalytics(); // Use canonical dataset
            const paid = fines.filter(f => f.paid).reduce((sum, f) => sum + f.amount, 0);
            const unpaid = fines.filter(f => !f.paid).reduce((sum, f) => sum + f.amount, 0);

            if (charts.payment) charts.payment.destroy();
            charts.payment = new Chart(ctx, {
                type: 'pie',
                data: {
                    labels: ['Paid', 'Unpaid'],
                    datasets: [{
                        data: [paid, unpaid],
                        backgroundColor: ['#6ECEB2', '#ff6b6b'],
                        borderWidth: 3,
                        borderColor: '#16307A'
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: {
                            position: 'bottom',
                            labels: {
                                font: { size: 14, weight: 'bold' }
                            }
                        },
                        title: {
                            display: true,
                            text: `Total: £${(paid + unpaid).toFixed(0)} | Paid: £${paid.toFixed(0)} | Unpaid: £${unpaid.toFixed(0)}`,
                            color: '#FFCD00',
                            font: { size: 14, weight: 'bold' }
                        }
                    }
                }
            });
        }

        function updateTrendsChart() {
            const ctx = document.getElementById('trendsChart');
            if (!ctx) return;

            const fines = getFinesForAnalytics(); // Use canonical dataset
            const finesByMonth = {};
            fines.forEach(fine => {
                const date = new Date(fine.date);
                const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
                finesByMonth[monthKey] = (finesByMonth[monthKey] || 0) + fine.amount;
            });

            const sortedMonths = Object.entries(finesByMonth)
                .sort((a, b) => a[0].localeCompare(b[0]))
                .slice(-12);

            if (charts.trends) charts.trends.destroy();
            charts.trends = new Chart(ctx, {
                type: 'line',
                data: {
                    labels: sortedMonths.map(([month]) => {
                        const [year, m] = month.split('-');
                        const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
                        return `${monthNames[parseInt(m) - 1]} ${year}`;
                    }),
                    datasets: [{
                        label: 'Monthly Fines (£)',
                        data: sortedMonths.map(([, total]) => total),
                        backgroundColor: 'rgba(255, 205, 0, 0.15)',
                        borderColor: '#FFCD00',
                        borderWidth: 3,
                        fill: true,
                        tension: 0.4,
                        pointBackgroundColor: '#FFCD00',
                        pointBorderColor: '#16307A',
                        pointBorderWidth: 2,
                        pointRadius: 5,
                        pointHoverRadius: 7
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: { display: false },
                        title: {
                            display: true,
                            text: 'Fine Trends Over Last 12 Months',
                            color: '#FFCD00',
                            font: { size: 14, weight: 'bold' }
                        }
                    },
                    scales: {
                        y: {
                            beginAtZero: true,
                            ticks: {
                                callback: function(value) {
                                    return '£' + value;
                                },
                                color: '#A8BDE0'
                            },
                            grid: { color: 'rgba(46,90,176,0.3)' }
                        },
                        x: {
                            ticks: { color: '#A8BDE0' },
                            grid: { color: 'rgba(46,90,176,0.3)' }
                        }
                    }
                }
            });
        }

        // FINE-SPECIFIC ANALYSIS FUNCTIONS
        function populateFineTypeAnalysisSelector() {
            const selector = document.getElementById('fineTypeAnalysisSelector');
            if (!selector) return;

            const fines = getFinesForAnalytics(); // Use canonical dataset
            // Get unique fine types from all fines
            const fineTypes = new Set();
            fines.forEach(fine => {
                if (fine && fine.reason) {
                    fineTypes.add(fine.reason);
                }
            });

            // Sort alphabetically
            const sortedFineTypes = Array.from(fineTypes).sort();

            // Keep the current selection if it exists
            const currentSelection = selector.value;

            // Rebuild options
            selector.innerHTML = '<option value="">-- Choose a fine type --</option>' +
                sortedFineTypes.map(fineType =>
                    `<option value="${fineType}">${fineType}</option>`
                ).join('');

            // Restore selection if it still exists
            if (currentSelection && sortedFineTypes.includes(currentSelection)) {
                selector.value = currentSelection;
            }
        }

        function analyzeFineType() {
            const selector = document.getElementById('fineTypeAnalysisSelector');
            const content = document.getElementById('fineTypeAnalysisContent');

            if (!selector || !content) return;

            const selectedFineType = selector.value;

            if (!selectedFineType) {
                content.innerHTML = `
                    <div style="text-align: center; padding: 40px; color: #7B9AD4;">
                        <div style="font-size: 3em; margin-bottom: 10px;">🔍</div>
                        <p>Select a fine type to see detailed breakdown</p>
                    </div>`;
                return;
            }

            const fines = getFinesForAnalytics(); // Use canonical dataset
            // Filter fines by selected type
            const finesOfType = fines.filter(f => f.reason === selectedFineType);

            if (finesOfType.length === 0) {
                content.innerHTML = `
                    <div style="text-align: center; padding: 40px; color: #7B9AD4;">
                        <p>No fines found for this type</p>
                    </div>`;
                return;
            }

            // Calculate statistics by player
            const playerStats = {};
            finesOfType.forEach(fine => {
                if (!playerStats[fine.playerName]) {
                    playerStats[fine.playerName] = {
                        count: 0,
                        totalAmount: 0,
                        paidCount: 0,
                        paidAmount: 0,
                        unpaidCount: 0,
                        unpaidAmount: 0
                    };
                }

                const stats = playerStats[fine.playerName];
                stats.count++;
                stats.totalAmount += fine.amount;

                if (fine.paid) {
                    stats.paidCount++;
                    stats.paidAmount += fine.amount;
                } else {
                    stats.unpaidCount++;
                    stats.unpaidAmount += fine.amount;
                }
            });

            // Sort by total count descending
            const sortedPlayers = Object.entries(playerStats)
                .sort((a, b) => b[1].count - a[1].count);

            // Overall statistics
            const totalCount = finesOfType.length;
            const totalAmount = finesOfType.reduce((sum, f) => sum + f.amount, 0);
            const paidCount = finesOfType.filter(f => f.paid).length;
            const paidAmount = finesOfType.filter(f => f.paid).reduce((sum, f) => sum + f.amount, 0);
            const unpaidCount = totalCount - paidCount;
            const unpaidAmount = totalAmount - paidAmount;

            // Build HTML
            content.innerHTML = `
                <div style="margin-bottom: 20px; padding: 15px; background: linear-gradient(135deg, #1D428A 0%, #0f2454 100%); border-radius: 8px; color: white;">
                    <div style="font-size: 1.2em; font-weight: 600; margin-bottom: 10px;">${selectedFineType}</div>
                    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 10px; font-size: 0.9em;">
                        <div>
                            <div style="opacity: 0.8;">Total Occurrences:</div>
                            <div style="font-size: 1.3em; font-weight: 600;">${totalCount}</div>
                        </div>
                        <div>
                            <div style="opacity: 0.8;">Total Amount:</div>
                            <div style="font-size: 1.3em; font-weight: 600;">£${totalAmount.toFixed(2)}</div>
                        </div>
                        <div>
                            <div style="opacity: 0.8;">Paid:</div>
                            <div style="font-size: 1.3em; font-weight: 600; color: #90EE90;">${paidCount} (£${paidAmount.toFixed(2)})</div>
                        </div>
                        <div>
                            <div style="opacity: 0.8;">Unpaid:</div>
                            <div style="font-size: 1.3em; font-weight: 600; color: #FFB6C1;">${unpaidCount} (£${unpaidAmount.toFixed(2)})</div>
                        </div>
                    </div>
                </div>

                <h4 style="margin-bottom: 10px; color: #FFCD00;">Breakdown by Player:</h4>
                <div class="table-container">
                    <table>
                        <thead>
                            <tr>
                                <th>Rank</th>
                                <th>Player</th>
                                <th>Count</th>
                                <th>Total £</th>
                                <th>Paid</th>
                                <th>Unpaid</th>
                                <th>Payment %</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${sortedPlayers.map(([playerName, stats], index) => {
                                const paymentPercentage = stats.count > 0 ? ((stats.paidCount / stats.count) * 100).toFixed(0) : 0;
                                const medals = ['🥇', '🥈', '🥉'];
                                const rank = index < 3 ? medals[index] : `${index + 1}`;

                                return `
                                    <tr>
                                        <td style="text-align: center; font-size: 1.2em;">${rank}</td>
                                        <td style="font-weight: 600;">${playerName}</td>
                                        <td style="text-align: center; font-weight: 600;">${stats.count}</td>
                                        <td style="text-align: right;">£${stats.totalAmount.toFixed(2)}</td>
                                        <td style="text-align: center; color: #6ECEB2;">
                                            ${stats.paidCount} (£${stats.paidAmount.toFixed(2)})
                                        </td>
                                        <td style="text-align: center; color: #ff6b6b;">
                                            ${stats.unpaidCount} (£${stats.unpaidAmount.toFixed(2)})
                                        </td>
                                        <td style="text-align: center;">
                                            <span style="display: inline-block; background: ${paymentPercentage == 100 ? '#6ECEB2' : paymentPercentage >= 50 ? '#FFA500' : '#ff6b6b'}; color: white; padding: 4px 8px; border-radius: 4px; font-weight: 600;">
                                                ${paymentPercentage}%
                                            </span>
                                        </td>
                                    </tr>
                                `;
                            }).join('')}
                        </tbody>
                    </table>
                </div>
            `;
        }

        // =====================================================
        // VOTING SYSTEM FUNCTIONS
        // =====================================================

        // Get today's date as YYYY-MM-DD string
        function getTodayDateString() {
            const now = new Date();
            return now.toISOString().split('T')[0];
        }

        // Get yesterday's date as YYYY-MM-DD string
        function getYesterdayDateString() {
            const now = new Date();
            now.setDate(now.getDate() - 1);
            return now.toISOString().split('T')[0];
        }

        // Check if voting is currently open (6am - 11:59pm)
        function isVotingOpen() {
            const now = new Date();
            const hour = now.getHours();
            const minute = now.getMinutes();

            if (hour < VOTING_OPEN_HOUR) return false;
            if (hour > VOTING_CLOSE_HOUR) return false;
            if (hour === VOTING_CLOSE_HOUR && minute > VOTING_CLOSE_MINUTE) return false;
            return true;
        }

        // Get time remaining until voting closes
        function getVotingTimeRemaining() {
            const now = new Date();
            const closeTime = new Date();
            closeTime.setHours(VOTING_CLOSE_HOUR, VOTING_CLOSE_MINUTE, 59, 999);

            if (now >= closeTime) return null;

            const diff = closeTime - now;
            const hours = Math.floor(diff / (1000 * 60 * 60));
            const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

            if (hours > 0) {
                return `${hours}h ${minutes}m remaining`;
            }
            return `${minutes}m remaining`;
        }

        // Initialize voting system
        async function initializeVoting() {
            updateVotingDropdowns();
            updateVotingStatus();
            checkExistingVote();
            await loadLastNightResults();
            await loadAllTimeVoteTotals();
            setupTodayVotesListener();

            // Update voting status every minute
            setInterval(updateVotingStatus, 60000);
        }

        // Update voting player dropdowns
        function updateVotingDropdowns() {
            const bestSelect = document.getElementById('votingBestPlayer');
            const worstSelect = document.getElementById('votingWorstPlayer');

            if (!bestSelect || !worstSelect) return;

            const playerOptions = allPlayers.map(p =>
                `<option value="${p.name}">${p.name}</option>`
            ).join('');

            bestSelect.innerHTML = '<option value="">Select best player...</option>' + playerOptions;
            worstSelect.innerHTML = '<option value="">Select worst player...</option>' + playerOptions;

            // Update the "Voting as" display
            const votingPlayerName = document.getElementById('votingPlayerName');
            if (votingPlayerName) votingPlayerName.textContent = currentPlayerName || '';
        }

        // Update voting status banner
        function updateVotingStatus() {
            const statusText = document.getElementById('votingStatusText');
            const timeRemaining = document.getElementById('votingTimeRemaining');
            const formContainer = document.getElementById('votingFormContainer');
            const closedMessage = document.getElementById('votingClosedMessage');
            const standingsContainer = document.getElementById('todayStandingsContainer');

            if (!statusText) return;

            const votingOpen = isVotingOpen();

            if (votingOpen) {
                statusText.innerHTML = '🟢 Voting is OPEN';
                statusText.style.color = '#27ae60';
                const remaining = getVotingTimeRemaining();
                if (timeRemaining && remaining) {
                    timeRemaining.textContent = remaining;
                }
                if (formContainer) formContainer.style.display = 'block';
                if (closedMessage) closedMessage.style.display = 'none';
                if (standingsContainer) standingsContainer.style.display = 'block';
            } else {
                statusText.innerHTML = '🔴 Voting is CLOSED';
                statusText.style.color = '#e74c3c';
                if (timeRemaining) {
                    timeRemaining.textContent = 'Opens at 6:00 AM';
                }
                if (formContainer) formContainer.style.display = 'none';
                if (closedMessage) closedMessage.style.display = 'block';
                if (standingsContainer) standingsContainer.style.display = 'none';
            }
        }

        // Load last night's results
        async function loadLastNightResults() {
            try {
                const yesterday = getYesterdayDateString();
                const votesDoc = await getDocs(collection(db, 'dailyVotes'));
                const yesterdayData = votesDoc.docs.find(d => d.id === yesterday);

                if (yesterdayData) {
                    const votes = yesterdayData.data().votes || {};
                    const bestCounts = {};
                    const worstCounts = {};

                    Object.values(votes).forEach(vote => {
                        if (vote.best) {
                            bestCounts[vote.best] = (bestCounts[vote.best] || 0) + 1;
                        }
                        if (vote.worst) {
                            worstCounts[vote.worst] = (worstCounts[vote.worst] || 0) + 1;
                        }
                    });

                    // Find winners
                    const bestWinner = Object.entries(bestCounts).sort((a, b) => b[1] - a[1])[0];
                    const worstWinner = Object.entries(worstCounts).sort((a, b) => b[1] - a[1])[0];

                    if (bestWinner || worstWinner) {
                        lastNightResults = {
                            best: bestWinner ? { name: bestWinner[0], votes: bestWinner[1] } : null,
                            worst: worstWinner ? { name: worstWinner[0], votes: worstWinner[1] } : null
                        };
                        updateLastNightResultsUI();
                    }
                }
            } catch (error) {
                console.error('Error loading last night results:', error);
            }
        }

        // Update last night results UI
        function updateLastNightResultsUI() {
            const container = document.getElementById('lastNightResults');
            const bestEl = document.getElementById('lastNightBest');
            const bestVotesEl = document.getElementById('lastNightBestVotes');
            const worstEl = document.getElementById('lastNightWorst');
            const worstVotesEl = document.getElementById('lastNightWorstVotes');

            if (!container || !lastNightResults) {
                if (container) container.style.display = 'none';
                return;
            }

            if (!lastNightResults.best && !lastNightResults.worst) {
                container.style.display = 'none';
                return;
            }

            container.style.display = 'block';

            if (bestEl && lastNightResults.best) {
                bestEl.textContent = lastNightResults.best.name;
                if (bestVotesEl) bestVotesEl.textContent = `(${lastNightResults.best.votes} votes)`;
            }

            if (worstEl && lastNightResults.worst) {
                worstEl.textContent = lastNightResults.worst.name;
                if (worstVotesEl) worstVotesEl.textContent = `(${lastNightResults.worst.votes} votes)`;
            }
        }

        // Load all-time vote totals
        async function loadAllTimeVoteTotals() {
            try {
                const votesSnapshot = await getDocs(collection(db, 'dailyVotes'));
                const totals = {};

                // Initialize all players with zero votes
                allPlayers.forEach(p => {
                    totals[p.name] = { best: 0, worst: 0 };
                });

                votesSnapshot.docs.forEach(doc => {
                    const votes = doc.data().votes || {};
                    Object.values(votes).forEach(vote => {
                        if (vote.best) {
                            if (!totals[vote.best]) totals[vote.best] = { best: 0, worst: 0 };
                            totals[vote.best].best++;
                        }
                        if (vote.worst) {
                            if (!totals[vote.worst]) totals[vote.worst] = { best: 0, worst: 0 };
                            totals[vote.worst].worst++;
                        }
                    });
                });

                allTimeVoteTotals = totals;
                updateLeaderboardUI();
            } catch (error) {
                console.error('Error loading all-time vote totals:', error);
            }
        }

        // Update leaderboard UI
        function updateLeaderboardUI() {
            const tbody = document.getElementById('leaderboardBody');
            if (!tbody) return;

            const sortedPlayers = Object.entries(allTimeVoteTotals)
                .sort((a, b) => b[1].best - a[1].best);

            if (sortedPlayers.length === 0) {
                tbody.innerHTML = '<tr><td colspan="3" style="text-align: center; padding: 20px; color: #A8BDE0;">No votes yet</td></tr>';
                return;
            }

            tbody.innerHTML = sortedPlayers.map(([name, stats], index) => {
                const bestHighlight = index === 0 && stats.best > 0 ? 'background: rgba(110,206,178,0.15);' : '';
                const worstLeader = sortedPlayers.slice().sort((a, b) => b[1].worst - a[1].worst)[0];
                const worstHighlight = name === worstLeader[0] && stats.worst > 0 ? 'background: rgba(255,107,107,0.15);' : '';

                return `
                    <tr>
                        <td style="padding: 12px; font-weight: 600; ${bestHighlight}">${name}</td>
                        <td style="text-align: center; padding: 12px; font-weight: 600; color: #6ECEB2; ${bestHighlight}">${stats.best}</td>
                        <td style="text-align: center; padding: 12px; font-weight: 600; color: #ff6b6b; ${worstHighlight}">${stats.worst}</td>
                    </tr>
                `;
            }).join('');
        }

        // Setup realtime listener for today's votes
        function setupTodayVotesListener() {
            if (isDevMode) {
                console.log('🔧 DEV MODE: Skipping today votes listener');
                loadTodayVotesOnce();
                return;
            }

            const today = getTodayDateString();
            const todayDocRef = doc(db, 'dailyVotes', today);

            if (votingUnsubscribe) {
                votingUnsubscribe();
            }

            votingUnsubscribe = onSnapshot(todayDocRef, (docSnapshot) => {
                if (docSnapshot.exists()) {
                    todayVotes = docSnapshot.data().votes || {};
                } else {
                    todayVotes = {};
                }
                updateTodayStandingsUI();
            }, (error) => {
                console.error('Error in today votes listener:', error);
            });
        }

        // Load today's votes once (for dev mode)
        async function loadTodayVotesOnce() {
            try {
                const today = getTodayDateString();
                const votesSnapshot = await getDocs(collection(db, 'dailyVotes'));
                const todayDoc = votesSnapshot.docs.find(d => d.id === today);

                if (todayDoc) {
                    todayVotes = todayDoc.data().votes || {};
                } else {
                    todayVotes = {};
                }
                updateTodayStandingsUI();
            } catch (error) {
                console.error('Error loading today votes:', error);
            }
        }

        // Update today's standings UI
        function updateTodayStandingsUI() {
            const voteCount = document.getElementById('todayVoteCount');
            const bestStandings = document.getElementById('todayBestStandings');
            const worstStandings = document.getElementById('todayWorstStandings');

            if (!voteCount || !bestStandings || !worstStandings) return;

            const totalVotes = Object.keys(todayVotes).length;
            const totalPlayers = allPlayers.length;

            voteCount.textContent = `${totalVotes}/${totalPlayers} voted`;

            // Calculate standings
            const bestCounts = {};
            const worstCounts = {};

            Object.values(todayVotes).forEach(vote => {
                if (vote.best) {
                    bestCounts[vote.best] = (bestCounts[vote.best] || 0) + 1;
                }
                if (vote.worst) {
                    worstCounts[vote.worst] = (worstCounts[vote.worst] || 0) + 1;
                }
            });

            // Sort and display
            const sortedBest = Object.entries(bestCounts).sort((a, b) => b[1] - a[1]);
            const sortedWorst = Object.entries(worstCounts).sort((a, b) => b[1] - a[1]);

            if (sortedBest.length === 0) {
                bestStandings.innerHTML = '<div style="text-align: center; color: #7B9AD4; padding: 10px;">No votes yet</div>';
            } else {
                bestStandings.innerHTML = sortedBest.map(([name, count], i) => `
                    <div style="display: flex; justify-content: space-between; padding: 6px 8px; ${i === 0 ? 'font-weight: 600; background: rgba(110,206,178,0.2); border-radius: 4px;' : ''}">
                        <span>${name}</span>
                        <span>${count}</span>
                    </div>
                `).join('');
            }

            if (sortedWorst.length === 0) {
                worstStandings.innerHTML = '<div style="text-align: center; color: #7B9AD4; padding: 10px;">No votes yet</div>';
            } else {
                worstStandings.innerHTML = sortedWorst.map(([name, count], i) => `
                    <div style="display: flex; justify-content: space-between; padding: 6px 8px; ${i === 0 ? 'font-weight: 600; background: rgba(255,107,107,0.2); border-radius: 4px;' : ''}">
                        <span>${name}</span>
                        <span>${count}</span>
                    </div>
                `).join('');
            }
        }

        // Track if we're in edit mode
        let isEditingVote = false;
        let editingVoterName = null;

        // Check if user has already voted today and show appropriate UI
        function checkExistingVote() {
            const voterName = currentPlayerName;
            const submitBtn = document.getElementById('submitVoteBtn');
            const bestSelect = document.getElementById('votingBestPlayer');
            const worstSelect = document.getElementById('votingWorstPlayer');
            const formContainer = document.getElementById('votingFormContainer');
            const summaryCard = document.getElementById('voteSummaryCard');

            if (!voterName) {
                // No player name set - show form, hide summary
                if (formContainer) formContainer.style.display = 'block';
                if (summaryCard) summaryCard.style.display = 'none';
                return;
            }

            const existingVote = todayVotes[voterName];

            if (existingVote && !isEditingVote) {
                // User has voted - show summary, hide form
                showVoteSummary(voterName, existingVote);
            } else if (existingVote && isEditingVote) {
                // User is editing their vote
                submitBtn.textContent = 'Update Vote';
                if (bestSelect) bestSelect.value = existingVote.best;
                if (worstSelect) worstSelect.value = existingVote.worst;
            } else {
                // New vote
                if (formContainer) formContainer.style.display = 'block';
                if (summaryCard) summaryCard.style.display = 'none';
                submitBtn.textContent = 'Submit Vote';
                if (bestSelect) bestSelect.value = '';
                if (worstSelect) worstSelect.value = '';
            }
        }

        // Show vote summary card
        function showVoteSummary(voterName, vote) {
            const formContainer = document.getElementById('votingFormContainer');
            const summaryCard = document.getElementById('voteSummaryCard');
            const summaryVoter = document.getElementById('voteSummaryVoter');
            const summaryBest = document.getElementById('voteSummaryBest');
            const summaryWorst = document.getElementById('voteSummaryWorst');

            if (formContainer) formContainer.style.display = 'none';
            if (summaryCard) summaryCard.style.display = 'block';
            if (summaryVoter) summaryVoter.textContent = `Voted as: ${voterName}`;
            if (summaryBest) summaryBest.textContent = vote.best;
            if (summaryWorst) summaryWorst.textContent = vote.worst;

            // Store who is viewing for edit purposes
            editingVoterName = voterName;
        }

        // Enable vote editing
        function enableVoteEdit() {
            const formContainer = document.getElementById('votingFormContainer');
            const summaryCard = document.getElementById('voteSummaryCard');
            const formTitle = document.getElementById('votingFormTitle');
            const cancelBtn = document.getElementById('cancelEditBtn');
            const submitBtn = document.getElementById('submitVoteBtn');

            isEditingVote = true;

            // Show form, hide summary
            if (formContainer) formContainer.style.display = 'block';
            if (summaryCard) summaryCard.style.display = 'none';

            // Update UI for edit mode
            if (formTitle) formTitle.textContent = '✏️ Edit Your Vote';
            if (cancelBtn) cancelBtn.style.display = 'block';
            if (submitBtn) submitBtn.textContent = 'Update Vote';

            // Pre-fill current selections
            const existingVote = todayVotes[editingVoterName];
            if (existingVote) {
                const bestSelect = document.getElementById('votingBestPlayer');
                const worstSelect = document.getElementById('votingWorstPlayer');
                if (bestSelect) bestSelect.value = existingVote.best;
                if (worstSelect) worstSelect.value = existingVote.worst;
            }
        }

        // Cancel vote editing
        function cancelVoteEdit() {
            const formTitle = document.getElementById('votingFormTitle');
            const cancelBtn = document.getElementById('cancelEditBtn');

            isEditingVote = false;

            // Reset UI
            if (formTitle) formTitle.textContent = '🗳️ Cast Your Vote';
            if (cancelBtn) cancelBtn.style.display = 'none';

            // Show summary again
            const existingVote = todayVotes[editingVoterName];
            if (existingVote) {
                showVoteSummary(editingVoterName, existingVote);
            }
        }

        // Submit or update vote
        async function submitVote() {
            const voterName = currentPlayerName;
            const bestPlayer = document.getElementById('votingBestPlayer').value;
            const worstPlayer = document.getElementById('votingWorstPlayer').value;
            const errorEl = document.getElementById('voteValidationError');

            // Validation
            if (!voterName || !bestPlayer || !worstPlayer) {
                if (errorEl) {
                    errorEl.textContent = 'Please fill in all fields';
                    errorEl.style.display = 'block';
                }
                return;
            }

            // Can't vote same person for both
            if (bestPlayer === worstPlayer) {
                if (errorEl) {
                    errorEl.textContent = "You can't vote for the same person as both best AND worst!";
                    errorEl.style.display = 'block';
                }
                return;
            }

            // Can't vote yourself as best player
            if (voterName === bestPlayer) {
                alert("You can't vote for yourself as best player!");
                if (errorEl) {
                    errorEl.textContent = "You can't vote for yourself as best player!";
                    errorEl.style.display = 'block';
                }
                return;
            }

            // Check if voting is open
            if (!isVotingOpen()) {
                if (errorEl) {
                    errorEl.textContent = 'Voting is closed. Opens at 6:00 AM';
                    errorEl.style.display = 'block';
                }
                return;
            }

            if (errorEl) errorEl.style.display = 'none';

            try {
                showLoading('Submitting vote...');

                const today = getTodayDateString();
                const todayDocRef = doc(db, 'dailyVotes', today);

                // Get current votes
                const votesSnapshot = await getDocs(collection(db, 'dailyVotes'));
                const todayDoc = votesSnapshot.docs.find(d => d.id === today);

                let currentVotes = {};
                if (todayDoc) {
                    currentVotes = todayDoc.data().votes || {};
                }

                // Add/update this vote
                currentVotes[voterName] = {
                    best: bestPlayer,
                    worst: worstPlayer,
                    timestamp: new Date().toISOString(),
                    uid: currentUser.uid
                };

                // Save to Firestore
                await setDoc(todayDocRef, { votes: currentVotes, date: today });

                // Update local state
                todayVotes = currentVotes;

                hideLoading();
                showToast('Vote submitted successfully!', 'success');

                // Reset edit mode
                isEditingVote = false;
                editingVoterName = voterName;

                // Reset form UI
                const formTitle = document.getElementById('votingFormTitle');
                const cancelBtn = document.getElementById('cancelEditBtn');
                if (formTitle) formTitle.textContent = '🗳️ Cast Your Vote';
                if (cancelBtn) cancelBtn.style.display = 'none';

                // Show vote summary
                showVoteSummary(voterName, { best: bestPlayer, worst: worstPlayer });

                // Refresh UI
                updateTodayStandingsUI();

                // Refresh all-time totals
                await loadAllTimeVoteTotals();

            } catch (error) {
                hideLoading();
                console.error('Error submitting vote:', error);
                showToast('Error submitting vote: ' + error.message, 'error');
            }
        }

        // Update all voting UI elements
        function updateVotingUI() {
            updateVotingDropdowns();
            updateVotingStatus();
            updateLastNightResultsUI();
            updateTodayStandingsUI();
            updateLeaderboardUI();
            updateVoteAdminSection();
        }

        // =====================================================
        // ADMIN VOTE MANAGEMENT FUNCTIONS
        // =====================================================

        // Update admin section visibility - always visible for authenticated users
        function updateVoteAdminSection() {
            const adminSection = document.getElementById('voteAdminSection');
            const dateInput = document.getElementById('adminVoteDate');

            if (!adminSection) return;

            adminSection.style.display = 'block';
            // Default to today's date
            if (dateInput && !dateInput.value) {
                dateInput.value = getTodayDateString();
                loadVotesForDate();
            }
        }

        // Load votes for a specific date (admin)
        async function loadVotesForDate() {
            const dateInput = document.getElementById('adminVoteDate');
            const container = document.getElementById('adminVotesContainer');

            if (!dateInput || !container) return;

            const selectedDate = dateInput.value;
            if (!selectedDate) {
                container.innerHTML = '<div style="text-align: center; color: #A8BDE0; padding: 20px;">Select a date to view votes</div>';
                return;
            }

            try {
                container.innerHTML = '<div style="text-align: center; color: #A8BDE0; padding: 20px;">Loading...</div>';

                const votesSnapshot = await getDocs(collection(db, 'dailyVotes'));
                const dateDoc = votesSnapshot.docs.find(d => d.id === selectedDate);

                if (!dateDoc || !dateDoc.data().votes || Object.keys(dateDoc.data().votes).length === 0) {
                    container.innerHTML = '<div style="text-align: center; color: #A8BDE0; padding: 20px;">No votes for this date</div>';
                    return;
                }

                const votes = dateDoc.data().votes;
                const voteEntries = Object.entries(votes);

                container.innerHTML = `
                    <div style="margin-bottom: 10px; color: #A8BDE0; font-size: 0.9em;">${voteEntries.length} vote(s) found</div>
                    <table style="width: 100%; border-collapse: collapse; font-size: 0.9em;">
                        <thead>
                            <tr>
                                <th style="text-align: left; padding: 10px; background: #152C6B; border-bottom: 2px solid #2E5AB0;">Voter</th>
                                <th style="text-align: center; padding: 10px; background: #152C6B; border-bottom: 2px solid #2E5AB0;">Best</th>
                                <th style="text-align: center; padding: 10px; background: #152C6B; border-bottom: 2px solid #2E5AB0;">Worst</th>
                                <th style="text-align: center; padding: 10px; background: #152C6B; border-bottom: 2px solid #2E5AB0;">Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${voteEntries.map(([voter, vote]) => `
                                <tr>
                                    <td style="padding: 10px; border-bottom: 1px solid #2E5AB0; font-weight: 600;">${voter}</td>
                                    <td style="padding: 10px; border-bottom: 1px solid #2E5AB0; text-align: center; color: #6ECEB2;">${vote.best}</td>
                                    <td style="padding: 10px; border-bottom: 1px solid #2E5AB0; text-align: center; color: #ff6b6b;">${vote.worst}</td>
                                    <td style="padding: 10px; border-bottom: 1px solid #2E5AB0; text-align: center;">
                                        <button class="btn btn-small" onclick="openVoteEditModal('${selectedDate}', '${voter}')" style="padding: 5px 10px; margin-right: 5px;">✏️</button>
                                        <button class="btn btn-small btn-danger" onclick="deleteVote('${selectedDate}', '${voter}')" style="padding: 5px 10px;">🗑️</button>
                                    </td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                `;

            } catch (error) {
                console.error('Error loading votes for date:', error);
                container.innerHTML = '<div style="text-align: center; color: #ff6b6b; padding: 20px;">Error loading votes</div>';
            }
        }

        // Open vote edit modal
        function openVoteEditModal(date, voter) {
            const modal = document.getElementById('voteEditModal');
            const dateInput = document.getElementById('editVoteDate');
            const voterInput = document.getElementById('editVoteVoter');
            const voterDisplay = document.getElementById('editVoteVoterDisplay');
            const bestSelect = document.getElementById('editVoteBest');
            const worstSelect = document.getElementById('editVoteWorst');

            if (!modal) return;

            // Set hidden values
            dateInput.value = date;
            voterInput.value = voter;
            voterDisplay.value = voter;

            // Populate player dropdowns
            const playerOptions = allPlayers.map(p =>
                `<option value="${p.name}">${p.name}</option>`
            ).join('');
            bestSelect.innerHTML = playerOptions;
            worstSelect.innerHTML = playerOptions;

            // Load current vote values
            loadVoteForEdit(date, voter);

            modal.style.display = 'flex';
        }

        // Load vote data for editing
        async function loadVoteForEdit(date, voter) {
            try {
                const votesSnapshot = await getDocs(collection(db, 'dailyVotes'));
                const dateDoc = votesSnapshot.docs.find(d => d.id === date);

                if (dateDoc && dateDoc.data().votes && dateDoc.data().votes[voter]) {
                    const vote = dateDoc.data().votes[voter];
                    document.getElementById('editVoteBest').value = vote.best;
                    document.getElementById('editVoteWorst').value = vote.worst;
                }
            } catch (error) {
                console.error('Error loading vote for edit:', error);
            }
        }

        // Close vote edit modal
        function closeVoteEditModal() {
            const modal = document.getElementById('voteEditModal');
            if (modal) modal.style.display = 'none';
        }

        // Save vote edit
        async function saveVoteEdit() {
            const date = document.getElementById('editVoteDate').value;
            const voter = document.getElementById('editVoteVoter').value;
            const newBest = document.getElementById('editVoteBest').value;
            const newWorst = document.getElementById('editVoteWorst').value;

            if (newBest === newWorst) {
                showToast("Can't vote same person for both best and worst", 'error');
                return;
            }

            try {
                showLoading('Saving changes...');

                const dateDocRef = doc(db, 'dailyVotes', date);
                const votesSnapshot = await getDocs(collection(db, 'dailyVotes'));
                const dateDoc = votesSnapshot.docs.find(d => d.id === date);

                if (!dateDoc) {
                    hideLoading();
                    showToast('Vote not found', 'error');
                    return;
                }

                const currentVotes = dateDoc.data().votes || {};
                currentVotes[voter] = {
                    ...currentVotes[voter],
                    best: newBest,
                    worst: newWorst,
                    timestamp: new Date().toISOString(),
                    editedBy: currentUser.uid
                };

                await setDoc(dateDocRef, { votes: currentVotes, date: date });

                // Update local state if it's today
                if (date === getTodayDateString()) {
                    todayVotes = currentVotes;
                    updateTodayStandingsUI();
                }

                hideLoading();
                closeVoteEditModal();
                showToast('Vote updated successfully', 'success');

                // Refresh the admin table and leaderboard
                loadVotesForDate();
                await loadAllTimeVoteTotals();

            } catch (error) {
                hideLoading();
                console.error('Error saving vote edit:', error);
                showToast('Error saving changes: ' + error.message, 'error');
            }
        }

        // Delete a vote
        async function deleteVote(date, voter) {
            if (!confirm(`Delete ${voter}'s vote for ${date}?`)) {
                return;
            }

            try {
                showLoading('Deleting vote...');

                const dateDocRef = doc(db, 'dailyVotes', date);
                const votesSnapshot = await getDocs(collection(db, 'dailyVotes'));
                const dateDoc = votesSnapshot.docs.find(d => d.id === date);

                if (!dateDoc) {
                    hideLoading();
                    showToast('Vote not found', 'error');
                    return;
                }

                const currentVotes = dateDoc.data().votes || {};
                delete currentVotes[voter];

                await setDoc(dateDocRef, { votes: currentVotes, date: date });

                // Update local state if it's today
                if (date === getTodayDateString()) {
                    todayVotes = currentVotes;
                    updateTodayStandingsUI();
                }

                hideLoading();
                showToast('Vote deleted successfully', 'success');

                // Refresh the admin table and leaderboard
                loadVotesForDate();
                await loadAllTimeVoteTotals();

            } catch (error) {
                hideLoading();
                console.error('Error deleting vote:', error);
                showToast('Error deleting vote: ' + error.message, 'error');
            }
        }

        // Make voting functions available globally
        window.submitVote = submitVote;
        window.checkExistingVote = checkExistingVote;
        window.enableVoteEdit = enableVoteEdit;
        window.cancelVoteEdit = cancelVoteEdit;
        window.loadVotesForDate = loadVotesForDate;
        window.openVoteEditModal = openVoteEditModal;
        window.closeVoteEditModal = closeVoteEditModal;
        window.saveVoteEdit = saveVoteEdit;
        window.deleteVote = deleteVote;

        // ==========================================
        // PRO CLUBS MATCH DATA FUNCTIONS
        // ==========================================

        let loggedMatchesCache = null;

        // Log new matches from EA to Firestore
        async function logNewMatches() {
            const btn = document.getElementById('logMatchesBtn');
            const originalText = btn.textContent;
            btn.textContent = '⏳ Logging...';
            btn.disabled = true;

            try {
                const data = await callFunction('logProClubsMatches', {});

                if (data.data) {
                    const { logged, skipped } = data.data;
                    if (logged > 0) {
                        showToast(`Logged ${logged} new matches!`, 'success');
                        // Reload the match history
                        await loadLoggedMatches();
                    } else {
                        showToast(`No new matches to log (${skipped} already logged)`, 'info');
                    }
                }
            } catch (error) {
                console.error('Error logging matches:', error);
                showToast('Failed to log matches: ' + error.message, 'error');
            } finally {
                btn.textContent = originalText;
                btn.disabled = false;
            }
        }

        // Load logged match history from Firestore
        async function loadLoggedMatches() {
            try {
                const data = await callFunctionGet('getLoggedMatches');

                if (data.data) {
                    loggedMatchesCache = data.data;
                    renderMatchHistory();
                    renderPlayerMappingTable(); // Update mapping table with EA players

                    // Show last updated time
                    const updateEl = document.getElementById('matchesLastUpdated');
                    if (updateEl) {
                        const now = new Date();
                        updateEl.textContent = `Last refreshed: ${now.toLocaleTimeString()}`;
                    }
                }
            } catch (error) {
                console.error('Error loading match history:', error);
                showToast('Failed to load match history', 'error');
            }
        }

        function renderMatchHistory() {
            const tbody = document.getElementById('matchHistoryBody');

            if (!loggedMatchesCache || !loggedMatchesCache.matches || loggedMatchesCache.matches.length === 0) {
                tbody.innerHTML = '<tr><td colspan="6" style="text-align: center; padding: 20px; color: #A8BDE0;">No matches logged yet</td></tr>';
                return;
            }

            const matches = loggedMatchesCache.matches;

            // Render history table (all matches)
            let tableHtml = '';
            for (const match of matches) {
                const resultColor = match.result === 'WIN' ? '#27ae60' :
                                   match.result === 'LOSS' ? '#e74c3c' : '#f39c12';

                const matchDate = match.timestamp ? new Date(match.timestamp).toLocaleDateString('en-GB', {
                    day: 'numeric', month: 'short', year: '2-digit'
                }) : '-';

                const matchTime = match.timestamp ? new Date(match.timestamp).toLocaleTimeString('en-GB', {
                    hour: '2-digit', minute: '2-digit'
                }) : '';

                // Sort players by rating with FULL names and position
                const sortedPlayers = [...(match.players || [])].sort((a, b) => b.rating - a.rating);
                const playerRatings = sortedPlayers.map(p => {
                    const ratingColor = p.rating >= 7.5 ? '#27ae60' : p.rating >= 6.5 ? '#f39c12' : '#e74c3c';
                    const posLabel = p.position ? ` (${p.position})` : '';
                    return `<span style="white-space: nowrap;">${p.name}${posLabel}: <strong style="color: ${ratingColor}">${p.rating.toFixed(1)}</strong>${p.mom ? ' ⭐' : ''}</span>`;
                }).join(', ');

                // Build ANY player dropdown options
                const anyPlayerOptions = ['<option value="">-- Select --</option>'];
                anyPlayerOptions.push(`<option value="Void" ${match.anyPlayer === 'Void' ? 'selected' : ''}>Void</option>`);
                for (const player of allPlayers) {
                    const selected = match.anyPlayer === player.name ? 'selected' : '';
                    anyPlayerOptions.push(`<option value="${player.name}" ${selected}>${player.name}</option>`);
                }

                tableHtml += `
                    <tr style="border-bottom: 1px solid #2E5AB0;">
                        <td style="padding: 8px; white-space: nowrap;">${matchDate}<br><span style="font-size: 0.8em; color: #A8BDE0;">${matchTime}</span></td>
                        <td style="padding: 8px; text-align: center;">
                            <select onchange="updateMatchAnyPlayer('${match.matchId}', this.value)" style="padding: 6px 10px; border-radius: 4px; border: 1px solid #ccc; font-size: 0.9em; min-width: 110px; cursor: pointer;">
                                ${anyPlayerOptions.join('')}
                            </select>
                        </td>
                        <td style="padding: 8px; text-align: center;"><span style="font-weight: bold; color: ${resultColor};">${match.result}</span></td>
                        <td style="padding: 8px; text-align: center; font-weight: bold;">${match.ourScore} - ${match.opponentScore}</td>
                        <td style="padding: 8px;">${match.opponentName}</td>
                        <td style="padding: 8px; font-size: 0.85em;">${playerRatings}</td>
                    </tr>
                `;
            }

            tbody.innerHTML = tableHtml;
        }

        // Update ANY player for a match
        async function updateMatchAnyPlayer(matchId, anyPlayer) {
            try {
                const result = await callFunction('updateMatchAnyPlayer', { matchId, anyPlayer });

                // Update local cache
                if (loggedMatchesCache && loggedMatchesCache.matches) {
                    const match = loggedMatchesCache.matches.find(m => m.matchId === matchId);
                    if (match) {
                        match.anyPlayer = anyPlayer || null;
                    }
                }

                showToast(`ANY player updated to: ${anyPlayer || 'None'}`, 'success');
            } catch (error) {
                console.error('Failed to update ANY player:', error);
                showToast('Failed to update ANY player: ' + error.message, 'error');
            }
        }
        window.updateMatchAnyPlayer = updateMatchAnyPlayer;

        // ==========================================
        // EA PRO CLUBS STATS FUNCTIONS
        // ==========================================

        // Fetch games played from EA Pro Clubs API
        async function fetchEAGamesPlayed() {
            const btn = document.getElementById('fetchEABtn');
            const container = document.getElementById('eaGamesPlayedList');

            try {
                btn.disabled = true;
                btn.textContent = 'Fetching...';
                container.innerHTML = '<div style="text-align: center; color: #A8BDE0; padding: 20px;">Loading from EA servers...</div>';

                const result = await callFunctionGet('getProClubsSquad');

                // Response is wrapped in 'data' object
                const data = result.data || result;

                if (!data.members || data.members.length === 0) {
                    container.innerHTML = '<div style="color: #A8BDE0; padding: 10px;">No squad members found</div>';
                    return;
                }

                // Filter to only mapped players and sort by games played
                const mappedMembers = data.members
                    .filter(member => playerMappings[member.name])
                    .sort((a, b) => b.gamesPlayed - a.gamesPlayed);

                if (mappedMembers.length === 0) {
                    container.innerHTML = '<div style="color: #A8BDE0; padding: 10px;">No mapped players found. Set up player mappings in Settings first.</div>';
                    return;
                }

                // Count void matches per EA gamertag
                const voidCountByEaName = {};
                if (loggedMatchesCache && loggedMatchesCache.matches) {
                    for (const match of loggedMatchesCache.matches) {
                        if (match.anyPlayer === 'Void') {
                            for (const p of (match.players || [])) {
                                voidCountByEaName[p.name] = (voidCountByEaName[p.name] || 0) + 1;
                            }
                        }
                    }
                }

                let html = '<table style="width: 100%; border-collapse: collapse; font-size: 0.9em;">';
                html += '<thead><tr style="background: #1D428A; color: #FFCD00;">';
                html += '<th style="padding: 10px; text-align: left;">Player</th>';
                html += '<th style="padding: 10px; text-align: center;">EA Games</th>';
                html += '<th style="padding: 10px; text-align: center;">Void</th>';
                html += '<th style="padding: 10px; text-align: center;">Adjusted</th>';
                html += '</tr></thead><tbody>';

                for (const member of mappedMembers) {
                    const playerName = playerMappings[member.name];
                    const voidCount = voidCountByEaName[member.name] || 0;
                    const adjusted = member.gamesPlayed - voidCount;

                    html += `<tr style="border-bottom: 1px solid #2E5AB0;">
                        <td style="padding: 8px; font-weight: bold;">${playerName}</td>
                        <td style="padding: 8px; text-align: center;">${member.gamesPlayed}</td>
                        <td style="padding: 8px; text-align: center; color: ${voidCount > 0 ? '#e74c3c' : '#999'};">${voidCount}</td>
                        <td style="padding: 8px; text-align: center; font-weight: bold; color: #6ECEB2;">${adjusted}</td>
                    </tr>`;
                }

                html += '</tbody></table>';
                html += `<div style="font-size: 0.8em; color: #888; margin-top: 10px; text-align: right;">Last updated: ${new Date().toLocaleString('en-GB')}</div>`;

                container.innerHTML = html;
                showToast('EA stats loaded successfully', 'success');

            } catch (error) {
                console.error('Failed to fetch EA stats:', error);
                container.innerHTML = `<div style="color: #ff6b6b; padding: 10px;">Failed to load: ${error.message}</div>`;
                showToast('Failed to fetch EA stats: ' + error.message, 'error');
            } finally {
                btn.disabled = false;
                btn.textContent = 'Fetch from EA';
            }
        }
        window.fetchEAGamesPlayed = fetchEAGamesPlayed;

        // Auto-update EAFC 26 games from EA data (excluding void matches)
        async function autoUpdateEAFC26() {
            const btn = document.getElementById('autoUpdateBtn');

            try {
                btn.disabled = true;
                btn.textContent = 'Updating...';

                // Fetch EA data
                const result = await callFunctionGet('getProClubsSquad');

                const data = result.data || result;

                if (!data.members || data.members.length === 0) {
                    throw new Error('No squad members found');
                }

                // Count void matches per EA gamertag from logged matches
                const voidCountByEaName = {};
                if (loggedMatchesCache && loggedMatchesCache.matches) {
                    for (const match of loggedMatchesCache.matches) {
                        if (match.anyPlayer === 'Void') {
                            // Count this void match for each player who participated
                            for (const p of (match.players || [])) {
                                voidCountByEaName[p.name] = (voidCountByEaName[p.name] || 0) + 1;
                            }
                        }
                    }
                }

                let updatedCount = 0;

                // Update each mapped player's EAFC 26 field
                for (const member of data.members) {
                    const appPlayerName = playerMappings[member.name];
                    if (!appPlayerName) continue;

                    const player = allPlayers.find(p => p.name === appPlayerName);
                    if (!player) continue;

                    // Calculate games: EA total minus void matches (by EA gamertag)
                    const voidCount = voidCountByEaName[member.name] || 0;
                    const adjustedGames = member.gamesPlayed - voidCount;

                    player.eafc26 = adjustedGames;
                    updatedCount++;
                }

                await savePlayers();
                updateManagePlayersTable();
                updateSettingsPlayersTable();

                showToast(`Updated ${updatedCount} players (void matches excluded)`, 'success');

                // Refresh the EA stats display
                fetchEAGamesPlayed();

            } catch (error) {
                console.error('Failed to auto-update:', error);
                showToast('Failed to auto-update: ' + error.message, 'error');
            } finally {
                btn.disabled = false;
                btn.textContent = 'Auto-Update EAFC 26';
            }
        }
        window.autoUpdateEAFC26 = autoUpdateEAFC26;

        // ==========================================
        // PLAYER NAME MAPPING FUNCTIONS
        // ==========================================

        let playerMappings = {}; // { eaGamertag: appPlayerName }

        // Load player mappings from Firestore
        async function loadPlayerMappings() {
            try {
                const configDocs = await getDocs(collection(db, 'config'));
                configDocs.forEach(configDoc => {
                    if (configDoc.id === 'playerMappings') {
                        playerMappings = configDoc.data().mappings || {};
                    }
                });
                renderPlayerMappingTable();
            } catch (error) {
                console.error('Error loading player mappings:', error);
            }
        }

        // Get unique EA player names from logged matches
        function getUniqueEaPlayers() {
            const players = new Set();
            if (loggedMatchesCache && loggedMatchesCache.matches) {
                for (const match of loggedMatchesCache.matches) {
                    for (const p of (match.players || [])) {
                        players.add(p.name);
                    }
                }
            }
            return Array.from(players).sort();
        }

        // Render player mapping table in Settings
        function renderPlayerMappingTable() {
            const container = document.getElementById('playerMappingTable');
            if (!container) return;

            const eaPlayers = getUniqueEaPlayers();

            if (eaPlayers.length === 0) {
                container.innerHTML = '<div style="color: #A8BDE0; padding: 10px;">No EA players found. Log some matches first.</div>';
                return;
            }

            let html = '<table style="width: 100%; border-collapse: collapse;">';
            html += '<thead><tr><th style="text-align: left; padding: 8px; background: #152C6B;">EA Gamertag</th><th style="text-align: left; padding: 8px; background: #152C6B;">App Player Name</th></tr></thead>';
            html += '<tbody>';

            for (const eaName of eaPlayers) {
                const currentMapping = playerMappings[eaName] || '';
                html += `
                    <tr style="border-bottom: 1px solid #2E5AB0;">
                        <td style="padding: 8px; font-weight: 500;">${eaName}</td>
                        <td style="padding: 8px;">
                            <select id="mapping_${eaName.replace(/[^a-zA-Z0-9]/g, '_')}" style="width: 100%; padding: 6px; border-radius: 4px; border: 1px solid #ddd;">
                                <option value="">-- Not mapped --</option>
                                ${allPlayers.map(p => `<option value="${p.name}" ${currentMapping === p.name ? 'selected' : ''}>${p.name}</option>`).join('')}
                            </select>
                        </td>
                    </tr>
                `;
            }

            html += '</tbody></table>';
            container.innerHTML = html;
        }

        // Save player mappings to Firestore via Cloud Function
        async function savePlayerMappings() {
            const eaPlayers = getUniqueEaPlayers();
            const newMappings = {};

            for (const eaName of eaPlayers) {
                const selectId = `mapping_${eaName.replace(/[^a-zA-Z0-9]/g, '_')}`;
                const select = document.getElementById(selectId);
                if (select && select.value) {
                    newMappings[eaName] = select.value;
                }
            }

            try {
                await callFunction('updatePlayerMappings', { mappings: newMappings });
                playerMappings = newMappings;
                showToast('Player mappings saved!', 'success');
            } catch (error) {
                console.error('Error saving mappings:', error);
                showToast('Failed to save mappings: ' + error.message, 'error');
            }
        }

        // Make Pro Clubs functions globally available
        window.logNewMatches = logNewMatches;
        window.loadLoggedMatches = loadLoggedMatches;
        window.savePlayerMappings = savePlayerMappings;
        window.loadPlayerMappings = loadPlayerMappings;

        // init() is now called from onAuthStateChanged listener after authentication
