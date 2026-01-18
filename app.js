        import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js';
        import { getFirestore, collection, addDoc, getDocs, deleteDoc, doc, updateDoc, onSnapshot, query, orderBy, setDoc } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';

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

        let allFines = [];
        let allPlayers = [];
        let batonHistory = [];
        let currentPaidFineId = null;
        let currentDateRangeFilter = 'all';

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
        window.closePaidModal = closePaidModal;
        window.confirmPaid = confirmPaid;
        window.updatePlayerStats = updatePlayerStats;
        window.applyFilters = applyFilters;
        window.setDateFilter = setDateFilter;
        window.addNewFineReason = addNewFineReason;
        window.editFineReason = editFineReason;
        window.deleteFineReason = deleteFineReason;
        window.deleteBatonEntry = deleteBatonEntry;
        window.markAllPaid = markAllPaid;
        window.markAllPaidSettings = markAllPaidSettings;
        window.closeMarkAllModal = closeMarkAllModal;
        window.confirmMarkAllPaid = confirmMarkAllPaid;
        window.deletePlayerFromSettings = deletePlayerFromSettings;
        window.updateGamesField = updateGamesField;

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
            console.log('🚀 Initializing Booze Baton Tracker...');
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
            filterSelect.innerHTML = '<option value="">All Fines</option>';
            
            console.log('📋 Adding', fineReasons.length, 'fine reasons');
            fineReasons.forEach((fine, index) => {
                const option = document.createElement('option');
                option.value = fine.reason;
                option.textContent = `${fine.reason} - £${fine.amount.toFixed(2)}`;
                option.dataset.amount = fine.amount;
                select.appendChild(option);
                
                const filterOption = document.createElement('option');
                filterOption.value = fine.reason;
                filterOption.textContent = fine.reason;
                filterSelect.appendChild(filterOption);
                
                if (index < 3) {
                    console.log(`  ${index + 1}. ${fine.reason} - £${fine.amount}`);
                }
            });
            console.log('✅ Fine reasons populated successfully');
        }

        function setDefaultDate() {
            const today = new Date().toISOString().split('T')[0];
            document.getElementById('fineDate').value = today;
            document.getElementById('batonDate').value = today;
            document.getElementById('paidDateInput').value = today;
            document.getElementById('markAllDateInput').value = today;
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
            document.getElementById('fineForm').addEventListener('submit', async (e) => {
                e.preventDefault();
                console.log('📝 Form submitted');

                // Get selected players from checkboxes
                const selectedCheckboxes = document.querySelectorAll('input[name="selectedPlayers"]:checked');
                const selectedPlayers = Array.from(selectedCheckboxes).map(cb => cb.value);

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
                        await addDoc(collection(db, 'fines'), fine);
                        console.log('✅ Saved fine for', playerName);
                    }

                    hideLoading();
                    e.target.reset();
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

            document.getElementById('batonForm').addEventListener('submit', async (e) => {
                e.preventDefault();
                
                const entry = {
                    from: document.getElementById('batonCurrentTeam').textContent,
                    to: document.getElementById('batonLostTo').value,
                    score: document.getElementById('batonScore').value,
                    date: document.getElementById('batonDate').value,
                    timestamp: new Date().toISOString()
                };

                try {
                    showLoading('Updating baton...');
                    await addDoc(collection(db, 'baton'), entry);
                    hideLoading();
                    e.target.reset();
                    setDefaultDate();
                    showToast('Baton updated successfully!', 'success');
                } catch (error) {
                    hideLoading();
                    showToast('Failed to update baton', 'error');
                }
            });
        }

        function setupRealtimeListeners() {
            const finesQuery = query(collection(db, 'fines'), orderBy('timestamp', 'desc'));
            onSnapshot(finesQuery, (snapshot) => {
                allFines = [];
                snapshot.forEach((d) => {
                    allFines.push({ id: d.id, ...d.data() });
                });
                updateAll();
            });

            const batonQuery = query(collection(db, 'baton'), orderBy('timestamp', 'desc'));
            onSnapshot(batonQuery, (snapshot) => {
                batonHistory = [];
                snapshot.forEach((d) => {
                    batonHistory.push({ id: d.id, ...d.data() });
                });
                updateBatonTracker();
                updateSpakkaTab();
            });
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
                    playerCheckboxes.innerHTML = '<div style="color: #999; padding: 10px; font-size: 0.9em;">No players yet. Add players in the Manage tab.</div>';
                } else {
                    playerCheckboxes.innerHTML = allPlayers.map(player => `
                        <label style="display: flex; align-items: center; padding: 6px 8px; margin-bottom: 3px; cursor: pointer; border-radius: 4px; transition: background 0.15s;"
                               onmouseover="this.style.background='#f5f5f5'"
                               onmouseout="this.style.background='white'">
                            <input type="checkbox" name="selectedPlayers" value="${player.name}"
                                   style="margin-right: 8px; width: 16px; height: 16px; cursor: pointer;">
                            <span style="font-size: 0.9em; color: #333;">${player.name}</span>
                        </label>
                    `).join('');
                }
            }

            // Keep backwards compatibility for old select element if it exists
            const addFineSelect = document.getElementById('playerName');
            const statsSelect = document.getElementById('playerSelector');
            const filterSelect = document.getElementById('filterPlayer');
            const deleteSelect = document.getElementById('deletePlayerSelect');

            if (addFineSelect) addFineSelect.innerHTML = '<option value="">Select player...</option>';
            if (statsSelect) statsSelect.innerHTML = '<option value="all">All Players</option>';
            if (filterSelect) filterSelect.innerHTML = '<option value="">All Players</option>';
            if (deleteSelect) deleteSelect.innerHTML = '<option value="">Select player to delete...</option>';

            allPlayers.forEach(player => {
                [addFineSelect, statsSelect, filterSelect, deleteSelect].forEach(select => {
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
                await deleteDoc(doc(db, 'fines', fine.id));
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
                await deleteDoc(doc(db, 'fines', fine.id));
            }

            document.getElementById('deletePlayerSelect').value = '';
            hideLoading();
            showToast(`${name} and all fines deleted`, 'success');
        }

        async function savePlayers() {
            try {
                await setDoc(doc(db, 'config', 'players'), { list: allPlayers });
                updatePlayerDropdowns();
                updateManagePlayersTable();
                updateSettingsPlayersTable();
            } catch (error) {
                console.error('Error:', error);
            }
        }

        function switchTab(tabName) {
            document.querySelectorAll('.tab').forEach(tab => tab.classList.remove('active'));
            event.target.classList.add('active');
            document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));
            document.getElementById(tabName).classList.add('active');
            window.scrollTo(0, 0);
        }

        function updateAll() {
            updatePlayerDropdowns();
            updateStats();
            updateHistory();
            updatePlayers();
            updatePlayerStats();
            updateBatonTracker();
            updateManagePlayersTable();
            updateSettingsPlayersTable();
            updateFineReasonsTable();
            updateCharts();
            updateSpakkaTab();
            document.getElementById('totalRecords').textContent = allFines.length;
        }

        function updateStats() {
            const totalPot = allFines.reduce((sum, fine) => sum + fine.amount, 0);
            const totalUnpaid = allFines.filter(f => !f.paid).reduce((sum, fine) => sum + fine.amount, 0);

            document.getElementById('totalPot').textContent = `£${totalPot.toFixed(0)}`;
            document.getElementById('totalUnpaid').textContent = `£${totalUnpaid.toFixed(0)}`;
            document.getElementById('totalFines').textContent = allFines.length;
            document.getElementById('batonTotalPot').textContent = `£${totalPot.toFixed(0)}`;

            const playerTotals = {};
            allFines.forEach(fine => {
                playerTotals[fine.playerName] = (playerTotals[fine.playerName] || 0) + fine.amount;
            });
            
            const worstOffender = Object.entries(playerTotals).sort((a, b) => b[1] - a[1])[0];
            document.getElementById('worstOffender').textContent = worstOffender ? worstOffender[0] : '-';

            updateLeaderboards();
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

            const playerFines = allFines ? allFines.filter(f => f.playerName === selectedPlayer) : [];
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
                    <h3 style="margin-bottom: 15px; color: #1D428A;">${selectedPlayer}</h3>
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

        function setDateFilter(range) {
            currentDateRangeFilter = range;

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

            const rows = document.querySelectorAll('#historyContent table tbody tr');

            rows.forEach(row => {
                const cells = row.cells;
                const dateDDMMYYYY = cells[0].textContent;
                const player = cells[1].textContent;
                const reason = cells[2].textContent;
                const status = cells[4].textContent.includes('✓') ? 'paid' : 'unpaid';

                let show = true;

                // Search filter
                if (searchTerm && !row.textContent.toLowerCase().includes(searchTerm)) {
                    show = false;
                }

                // Player filter
                if (playerFilter && player !== playerFilter) {
                    show = false;
                }

                // Fine filter
                if (fineFilter && !reason.includes(fineFilter)) {
                    show = false;
                }

                // Paid filter
                if (paidFilter && status !== paidFilter) {
                    show = false;
                }

                // Date filter (specific date)
                if (dateFilter && !dateDDMMYYYY.includes(formatDateDDMMYYYY(dateFilter))) {
                    show = false;
                }

                // Date range filter
                if (window.dateRangeStart || window.dateRangeEnd) {
                    // Parse DD/MM/YYYY to Date object
                    const parts = dateDDMMYYYY.split('/');
                    if (parts.length === 3) {
                        const fineDate = new Date(parts[2], parts[1] - 1, parts[0]);
                        if (window.dateRangeStart && fineDate < window.dateRangeStart) {
                            show = false;
                        }
                        if (window.dateRangeEnd && fineDate > window.dateRangeEnd) {
                            show = false;
                        }
                    }
                }

                row.style.display = show ? '' : 'none';
            });
        }

        function updateHistory() {
            const historyContent = document.getElementById('historyContent');
            
            if (allFines.length === 0) {
                historyContent.innerHTML = '<div class="empty-state"><div class="empty-state-icon">📝</div><p>No fines yet</p></div>';
                return;
            }

            // Sort by date descending (most recent first)
            const sortedFines = [...allFines].sort((a, b) => new Date(b.date) - new Date(a.date));

            historyContent.innerHTML = `
                <div class="table-container">
                    <table>
                        <thead>
                            <tr>
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
                                <tr>
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
                                        <button class="btn-small ${fine.paid ? 'btn-secondary' : 'btn-success'}" onclick="togglePaid('${fine.id}', ${!fine.paid})">
                                            ${fine.paid ? 'Unpaid' : 'Paid'}
                                        </button>
                                        <button class="btn-small btn-danger" onclick="deleteFine('${fine.id}')">Del</button>
                                    </td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
            `;
        }

        function updatePlayers() {
            const playersContent = document.getElementById('playersContent');
            
            if (allFines.length === 0) {
                playersContent.innerHTML = '<div class="empty-state"><div class="empty-state-icon">👥</div><p>No players yet</p></div>';
                return;
            }

            const playerStats = {};
            allFines.forEach(fine => {
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
                        <div style="margin-top: 10px; padding-top: 10px; border-top: 1px solid #e0e0e0;">
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
                if (batonCurrentTeam) batonCurrentTeam.textContent = latest.to || '-';
                if (batonCurrentDate) batonCurrentDate.textContent = `Updated: ${formatDateDDMMYYYY(latest.date)}`;
            } else {
                if (batonCurrentTeam) batonCurrentTeam.textContent = '-';
                if (batonCurrentDate) batonCurrentDate.textContent = 'No baton history';
            }

            const forfeitTable = document.getElementById('forfeitTable');
            if (!forfeitTable) return;

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
            if (allFines && allFines.length > 0) {
                allFines.forEach(fine => {
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
                    ? batonHistory.map(entry => `
                        <tr>
                            <td>${formatDateDDMMYYYY(entry.date)}</td>
                            <td>${entry.from}</td>
                            <td>${entry.score}</td>
                            <td>${entry.to}</td>
                            <td>
                                <button class="btn-small btn-danger" onclick="deleteBatonEntry('${entry.id}')">Del</button>
                            </td>
                        </tr>
                    `).join('')
                    : '<tr><td colspan="5" style="text-align: center;">No history</td></tr>';
            }

            updateBatonRiskPrediction();
        }

        async function deleteBatonEntry(id) {
            if (confirm('Delete this entry?')) {
                try {
                    showLoading('Deleting...');
                    await deleteDoc(doc(db, 'baton', id));
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

            // Update total pot
            const totalPot = allFines.reduce((sum, fine) => sum + fine.amount, 0);
            potElement.textContent = `£${totalPot.toFixed(0)}`;

            // Update unpaid list - show who owes money
            const unpaidByPlayer = {};
            allFines.filter(f => !f.paid).forEach(fine => {
                unpaidByPlayer[fine.playerName] = (unpaidByPlayer[fine.playerName] || 0) + fine.amount;
            });

            const unpaidList = document.getElementById('spakkaUnpaidList');
            if (unpaidList) {
                const sortedUnpaid = Object.entries(unpaidByPlayer).sort((a, b) => b[1] - a[1]);

                if (sortedUnpaid.length === 0) {
                    unpaidList.innerHTML = '<div style="text-align: center; padding: 20px; font-size: 1.2em; color: #27ae60;">🎉 Everyone has paid!</div>';
                } else {
                    unpaidList.innerHTML = sortedUnpaid.map(([name, amount]) => `
                        <div style="background: #fff3cd; padding: 15px; border-radius: 8px; margin-bottom: 10px; border-left: 4px solid #e74c3c;">
                            <div style="display: flex; justify-content: space-between; align-items: center;">
                                <span style="font-size: 1.2em; font-weight: 600; color: #333;">${name}</span>
                                <span style="font-size: 1.5em; font-weight: bold; color: #e74c3c;">£${amount.toFixed(0)}</span>
                            </div>
                        </div>
                    `).join('');
                }
            }

            // Update top offenders - who has most fines
            const totalsByPlayer = {};
            allFines.forEach(fine => {
                totalsByPlayer[fine.playerName] = (totalsByPlayer[fine.playerName] || 0) + fine.amount;
            });

            const topOffenders = document.getElementById('spakkaTopOffenders');
            if (topOffenders) {
                const sortedOffenders = Object.entries(totalsByPlayer).sort((a, b) => b[1] - a[1]).slice(0, 3);

                if (sortedOffenders.length === 0) {
                    topOffenders.innerHTML = '<div style="text-align: center; padding: 20px; color: #999;">No fines yet</div>';
                } else {
                    const medals = ['🥇', '🥈', '🥉'];
                    topOffenders.innerHTML = sortedOffenders.map(([name, amount], index) => `
                        <div style="background: ${index === 0 ? '#fff3cd' : '#f9f9f9'}; padding: 15px; border-radius: 8px; margin-bottom: 10px; border-left: 4px solid ${index === 0 ? '#FFCD00' : '#e0e0e0'};">
                            <div style="display: flex; justify-content: space-between; align-items: center;">
                                <span style="font-size: 1.2em;">
                                    <span style="font-size: 1.5em; margin-right: 8px;">${medals[index]}</span>
                                    <strong>${name}</strong>
                                </span>
                                <span style="font-size: 1.5em; font-weight: bold; color: #1D428A;">£${amount.toFixed(0)}</span>
                            </div>
                        </div>
                    `).join('');
                }
            }

            // Update baton holder
            const batonHolderElement = document.getElementById('spakkaBatonHolder');
            if (batonHolderElement) {
                if (batonHistory && batonHistory.length > 0) {
                    const latest = batonHistory[0];
                    batonHolderElement.textContent = latest.to || '-';
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
                allFines.forEach(fine => {
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
                    forfeitsDiv.innerHTML = '<div style="text-align: center; padding: 20px; color: #999;">No player data yet</div>';
                } else {
                    forfeitsDiv.innerHTML = `
                        <div style="background: #e8f5e9; padding: 15px; border-radius: 8px; margin-bottom: 10px; border-left: 4px solid #27ae60;">
                            <div style="font-size: 1.1em; margin-bottom: 5px; color: #666;">Least Games</div>
                            <div style="font-size: 1.3em; font-weight: bold; color: #1D428A;">${leastGames?.name || '-'} (${leastGames?.games || 0} games)</div>
                        </div>
                        <div style="background: #fff3cd; padding: 15px; border-radius: 8px; margin-bottom: 10px; border-left: 4px solid #FFCD00;">
                            <div style="font-size: 1.1em; margin-bottom: 5px; color: #666;">Most Fines Total</div>
                            <div style="font-size: 1.3em; font-weight: bold; color: #1D428A;">${highestTotal?.name || '-'} (£${(highestTotal?.total || 0).toFixed(0)})</div>
                        </div>
                        <div style="background: #ffe5e5; padding: 15px; border-radius: 8px; margin-bottom: 10px; border-left: 4px solid #e74c3c;">
                            <div style="font-size: 1.1em; margin-bottom: 5px; color: #666;">Worst Per Game</div>
                            <div style="font-size: 1.3em; font-weight: bold; color: #1D428A;">${highestPerGame?.name || '-'} (£${(highestPerGame?.perGame || 0).toFixed(2)})</div>
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
                await updateDoc(doc(db, 'fines', currentPaidFineId), {
                    paid: true,
                    paidDate: paidDate
                });
                closePaidModal();
            } catch (error) {
                alert('❌ Failed to update');
            }
        }

        async function confirmUnpaid(id) {
            try {
                await updateDoc(doc(db, 'fines', id), {
                    paid: false,
                    paidDate: null
                });
            } catch (error) {
                alert('❌ Failed to update');
            }
        }

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
                    await updateDoc(doc(db, 'fines', fine.id), {
                        paid: true,
                        paidDate: paidDate
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
                    await deleteDoc(doc(db, 'fines', id));
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
                const snapshot = await getDocs(collection(db, 'fines'));
                for (const d of snapshot.docs) {
                    await deleteDoc(d.ref);
                }
                hideLoading();
                showToast('All fines cleared successfully', 'success');
            } catch (error) {
                hideLoading();
                showToast('Failed to clear fines', 'error');
            }
        }

        function copyUnpaidList() {
            const unpaidByPlayer = {};
            allFines.filter(f => !f.paid).forEach(fine => {
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
            const unpaidByPlayer = {};
            allFines.filter(f => !f.paid).forEach(fine => {
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
            // Hall of Shame - Top 5 by total fines
            const playerTotals = {};
            allFines.forEach(fine => {
                playerTotals[fine.playerName] = (playerTotals[fine.playerName] || 0) + fine.amount;
            });

            const hallOfShame = Object.entries(playerTotals)
                .sort((a, b) => b[1] - a[1])
                .slice(0, 5);

            const hallOfShameEl = document.getElementById('hallOfShameList');
            if (hallOfShameEl) {
                if (hallOfShame.length === 0) {
                    hallOfShameEl.innerHTML = '<div style="color: #999; padding: 10px;">No data yet</div>';
                } else {
                    const medals = ['🥇', '🥈', '🥉', '4️⃣', '5️⃣'];
                    hallOfShameEl.innerHTML = hallOfShame.map(([name, total], index) =>
                        `<div style="padding: 8px; border-bottom: 1px solid #f0f0f0; display: flex; justify-content: space-between;">
                            <span>${medals[index]} ${name}</span>
                            <span style="font-weight: bold; color: #C8102E;">£${total.toFixed(2)}</span>
                        </div>`
                    ).join('');
                }
            }

            // Most Improved - Most fines paid in last 30 days
            const thirtyDaysAgo = new Date();
            thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

            const recentPayments = {};
            allFines.filter(f => f.paid && f.paidDate).forEach(fine => {
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
                    mostImprovedEl.innerHTML = '<div style="color: #999; padding: 10px;">No payments in last 30 days</div>';
                } else {
                    const medals = ['🥇', '🥈', '🥉', '4️⃣', '5️⃣'];
                    mostImprovedEl.innerHTML = mostImproved.map(([name, total], index) =>
                        `<div style="padding: 8px; border-bottom: 1px solid #f0f0f0; display: flex; justify-content: space-between;">
                            <span>${medals[index]} ${name}</span>
                            <span style="font-weight: bold; color: #00843D;">£${total.toFixed(2)} paid</span>
                        </div>`
                    ).join('');
                }
            }

            // Clean Record - Zero unpaid, sorted by total paid
            const unpaidByPlayer = {};
            allFines.filter(f => !f.paid).forEach(fine => {
                unpaidByPlayer[fine.playerName] = (unpaidByPlayer[fine.playerName] || 0) + fine.amount;
            });

            const paidByPlayer = {};
            allFines.filter(f => f.paid).forEach(fine => {
                paidByPlayer[fine.playerName] = (paidByPlayer[fine.playerName] || 0) + fine.amount;
            });

            const cleanRecord = Object.entries(paidByPlayer)
                .filter(([name]) => !unpaidByPlayer[name] || unpaidByPlayer[name] === 0)
                .sort((a, b) => b[1] - a[1])
                .slice(0, 5);

            const cleanRecordEl = document.getElementById('cleanRecordList');
            if (cleanRecordEl) {
                if (cleanRecord.length === 0) {
                    cleanRecordEl.innerHTML = '<div style="color: #999; padding: 10px;">No players with clean record yet</div>';
                } else {
                    const medals = ['🥇', '🥈', '🥉', '4️⃣', '5️⃣'];
                    cleanRecordEl.innerHTML = cleanRecord.map(([name, total], index) =>
                        `<div style="padding: 8px; border-bottom: 1px solid #f0f0f0; display: flex; justify-content: space-between;">
                            <span>${medals[index]} ${name}</span>
                            <span style="font-weight: bold; color: #1D428A;">£${total.toFixed(2)} paid</span>
                        </div>`
                    ).join('');
                }
            }
        }

        function updateBatonRiskPrediction() {
            if (allPlayers.length === 0) {
                const safeEl = document.getElementById('safePlayers');
                const riskEl = document.getElementById('atRiskPlayers');
                if (safeEl) safeEl.innerHTML = '<div style="color: #999; padding: 10px;">No player data yet</div>';
                if (riskEl) riskEl.innerHTML = '<div style="color: #999; padding: 10px;">No player data yet</div>';
                return;
            }

            // Calculate per-game fine rate for each player
            const playerStats = allPlayers.map(player => {
                const playerFines = allFines.filter(f => f.playerName === player.name);
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
                    safePlayersEl.innerHTML = '<div style="color: #999; padding: 10px;">No players with games played yet</div>';
                } else {
                    safePlayersEl.innerHTML = safePlayers.map((player, index) => {
                        const icons = ['🥇', '🥈', '🥉', '4️⃣', '5️⃣'];
                        return `<div style="padding: 8px; border-bottom: 1px solid #f0f0f0; display: flex; justify-content: space-between; align-items: center;">
                            <div>
                                <span>${icons[index]} ${player.name}</span>
                                <div style="font-size: 0.85em; color: #666; margin-top: 2px;">
                                    ${player.totalGames} games played • ${player.fineCount} fines
                                </div>
                            </div>
                            <div style="text-align: right;">
                                <div style="font-weight: bold; color: #00843D;">£${player.finesPerGame.toFixed(2)}/game</div>
                                <div style="font-size: 0.85em; color: #666;">£${player.totalFines.toFixed(2)} total</div>
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
                    atRiskPlayersEl.innerHTML = '<div style="color: #999; padding: 10px;">No players with games played yet</div>';
                } else {
                    atRiskPlayersEl.innerHTML = atRiskPlayers.map((player, index) => {
                        const icons = ['⚠️', '🔴', '🚨', '💀', '☠️'];
                        return `<div style="padding: 8px; border-bottom: 1px solid #f0f0f0; display: flex; justify-content: space-between; align-items: center;">
                            <div>
                                <span>${icons[index]} ${player.name}</span>
                                <div style="font-size: 0.85em; color: #666; margin-top: 2px;">
                                    ${player.totalGames} games played • ${player.fineCount} fines
                                </div>
                            </div>
                            <div style="text-align: right;">
                                <div style="font-weight: bold; color: #C8102E;">£${player.finesPerGame.toFixed(2)}/game</div>
                                <div style="font-size: 0.85em; color: #666;">£${player.totalFines.toFixed(2)} total</div>
                            </div>
                        </div>`;
                    }).join('');
                }
            }
        }

        function exportData() {
            if (allFines.length === 0) {
                alert('No data to export');
                return;
            }

            const csv = [
                ['Name', 'Date', 'Fine', 'Amount', 'Paid'],
                ...allFines.map(f => [
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
            if (allFines.length === 0) {
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
            const totalPot = allFines.reduce((sum, f) => sum + f.amount, 0);
            const totalUnpaid = allFines.filter(f => !f.paid).reduce((sum, f) => sum + f.amount, 0);
            const totalPaid = totalPot - totalUnpaid;

            doc.setFontSize(14);
            doc.setTextColor(0);
            doc.text('Season Statistics', 20, 40);

            doc.setFontSize(11);
            doc.text(`Total Fines: ${allFines.length}`, 20, 48);
            doc.text(`Total Pot: £${totalPot.toFixed(2)}`, 20, 54);
            doc.text(`Paid: £${totalPaid.toFixed(2)}`, 20, 60);
            doc.text(`Unpaid: £${totalUnpaid.toFixed(2)}`, 20, 66);

            // Player Breakdown
            const playerTotals = {};
            const playerUnpaid = {};
            allFines.forEach(fine => {
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
            if (allFines.length === 0) {
                showToast('No data to export', 'error');
                return;
            }

            const totalPot = allFines.reduce((sum, f) => sum + f.amount, 0);
            const totalUnpaid = allFines.filter(f => !f.paid).reduce((sum, f) => sum + f.amount, 0);
            const totalPaid = totalPot - totalUnpaid;

            // Calculate player stats
            const playerTotals = {};
            const playerUnpaid = {};
            const playerFineCount = {};

            allFines.forEach(fine => {
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
            message += `Total Fines: ${allFines.length}\n`;
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
                    const snapshot = await getDocs(collection(db, 'fines'));
                    let deleted = 0;
                    for (const d of snapshot.docs) {
                        await deleteDoc(d.ref);
                        deleted++;
                        if (deleted % 50 === 0) {
                            showImportAlert(`Deleting... ${deleted}/${snapshot.size} fines`, 'info');
                        }
                    }
                    showImportAlert(`Deleted ${snapshot.size} existing fines`, 'success');
                }

                // Show progress message
                const action = replaceAll ? 'Replacing with' : 'Importing';
                showImportAlert(`${action} ${fines.length} fines... Please wait (this may take 30-60 seconds)`, 'success');
                showLoading(`${action} ${fines.length} fines...`);

                let imported = 0;
                for (const fine of fines) {
                    await addDoc(collection(db, 'fines'), fine);
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
                await setDoc(doc(db, 'config', 'fineReasons'), { list: fineReasons });
                populateFineReasons();
                updateFineReasonsTable();
            } catch (error) {
                console.error('Error:', error);
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
            fineTypes: null,
            payment: null,
            trends: null
        };

        function updateCharts() {
            if (allFines.length === 0) return;

            updatePlayerFinesChart();
            updatePerGameChart();
            updateFineTypesChart();
            updatePaymentChart();
            updateTrendsChart();
        }

        function updatePlayerFinesChart() {
            const ctx = document.getElementById('playerFinesChart');
            if (!ctx) return;

            const playerTotals = {};
            allFines.forEach(fine => {
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
                        backgroundColor: '#1D428A',
                        borderColor: '#FFCD00',
                        borderWidth: 2
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
                            color: '#1D428A',
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
                                font: { size: 11 }
                            }
                        },
                        x: {
                            ticks: {
                                font: { size: 11 }
                            }
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

                if (allFines && allFines.length > 0) {
                    allFines.forEach(fine => {
                        if (fine && playerStats[fine.playerName]) {
                            playerStats[fine.playerName].total += (fine.amount || 0);
                        }
                    });
                }

                const perGameData = Object.entries(playerStats)
                    .filter(([, stats]) => stats && stats.games > 0)
                    .map(([name, stats]) => ({
                        name,
                        perGame: stats.total / stats.games
                    }))
                    .sort((a, b) => b.perGame - a.perGame)
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
                        datasets: [{
                            label: 'Fines Per Game (£)',
                            data: perGameData.map(p => p.perGame || 0),
                            backgroundColor: '#FFCD00',
                            borderColor: '#1D428A',
                            borderWidth: 2
                        }]
                    },
                    options: {
                        responsive: true,
                        maintainAspectRatio: false,
                        plugins: {
                            legend: { display: false },
                            title: {
                                display: true,
                                text: 'Top 10 Players by Fines Per Game',
                                color: '#1D428A',
                                font: { size: 14, weight: 'bold' }
                            }
                        },
                        scales: {
                            y: {
                                beginAtZero: true,
                                ticks: {
                                    callback: function(value) {
                                        return '£' + (value || 0).toFixed(2);
                                    },
                                    font: { size: 11 }
                                }
                            },
                            x: {
                                ticks: {
                                    font: { size: 11 }
                                }
                            }
                        }
                    }
                });
            } catch (error) {
                console.error('Error updating per game chart:', error);
            }
        }

        function updateFineTypesChart() {
            const ctx = document.getElementById('fineTypesChart');
            if (!ctx) return;

            const fineTypeCounts = {};
            allFines.forEach(fine => {
                fineTypeCounts[fine.reason] = (fineTypeCounts[fine.reason] || 0) + 1;
            });

            const topFines = Object.entries(fineTypeCounts)
                .sort((a, b) => b[1] - a[1])
                .slice(0, 10);

            if (charts.fineTypes) charts.fineTypes.destroy();
            charts.fineTypes = new Chart(ctx, {
                type: 'doughnut',
                data: {
                    labels: topFines.map(([reason]) => reason.substring(0, 30)),
                    datasets: [{
                        data: topFines.map(([, count]) => count),
                        backgroundColor: [
                            '#1D428A', '#FFCD00', '#C8102E', '#00A3E0', '#6ECEB2',
                            '#FF6B6B', '#95E1D3', '#F38181', '#AA96DA', '#FCBAD3'
                        ],
                        borderWidth: 2,
                        borderColor: '#ffffff'
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: {
                            position: 'bottom',
                            labels: {
                                boxWidth: 15,
                                font: { size: 11 }
                            }
                        },
                        title: {
                            display: true,
                            text: 'Most Common Fine Types',
                            color: '#1D428A',
                            font: { size: 14, weight: 'bold' }
                        }
                    }
                }
            });
        }

        function updatePaymentChart() {
            const ctx = document.getElementById('paymentChart');
            if (!ctx) return;

            const paid = allFines.filter(f => f.paid).reduce((sum, f) => sum + f.amount, 0);
            const unpaid = allFines.filter(f => !f.paid).reduce((sum, f) => sum + f.amount, 0);

            if (charts.payment) charts.payment.destroy();
            charts.payment = new Chart(ctx, {
                type: 'pie',
                data: {
                    labels: ['Paid', 'Unpaid'],
                    datasets: [{
                        data: [paid, unpaid],
                        backgroundColor: ['#6ECEB2', '#C8102E'],
                        borderWidth: 3,
                        borderColor: '#ffffff'
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
                            color: '#1D428A',
                            font: { size: 14, weight: 'bold' }
                        }
                    }
                }
            });
        }

        function updateTrendsChart() {
            const ctx = document.getElementById('trendsChart');
            if (!ctx) return;

            const finesByMonth = {};
            allFines.forEach(fine => {
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
                        backgroundColor: 'rgba(29, 66, 138, 0.2)',
                        borderColor: '#1D428A',
                        borderWidth: 3,
                        fill: true,
                        tension: 0.4,
                        pointBackgroundColor: '#FFCD00',
                        pointBorderColor: '#1D428A',
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
                            color: '#1D428A',
                            font: { size: 14, weight: 'bold' }
                        }
                    },
                    scales: {
                        y: {
                            beginAtZero: true,
                            ticks: {
                                callback: function(value) {
                                    return '£' + value;
                                }
                            }
                        }
                    }
                }
            });
        }

        init();
