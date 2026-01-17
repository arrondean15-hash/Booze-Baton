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

        window.switchTab = switchTab;
        window.updateAmount = updateAmount;
        window.deleteFine = deleteFine;
        window.togglePaid = togglePaid;
        window.clearAllFines = clearAllFines;
        window.handleFileSelect = handleFileSelect;
        window.addNewPlayer = addNewPlayer;
        window.deletePlayer = deletePlayer;
        window.exportData = exportData;
        window.closePaidModal = closePaidModal;
        window.confirmPaid = confirmPaid;
        window.updatePlayerStats = updatePlayerStats;
        window.applyFilters = applyFilters;
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
            const date = new Date(dateStr);
            const day = String(date.getDate()).padStart(2, '0');
            const month = String(date.getMonth() + 1).padStart(2, '0');
            const year = date.getFullYear();
            return `${day}/${month}/${year}`;
        }

        function init() {
            console.log('🚀 Initializing Booze Baton Tracker...');
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
                
                const fine = {
                    playerName: document.getElementById('playerName').value,
                    reason: document.getElementById('fineReason').value,
                    amount: parseFloat(document.getElementById('fineAmount').value),
                    date: document.getElementById('fineDate').value,
                    paid: false,
                    paidDate: null,
                    timestamp: new Date().toISOString()
                };

                console.log('📝 Fine data:', fine);

                try {
                    console.log('💾 Saving to Firebase...');
                    await addDoc(collection(db, 'fines'), fine);
                    console.log('✅ Saved successfully!');
                    e.target.reset();
                    setDefaultDate();
                    alert(`✅ Fine added for ${fine.playerName}!`);
                } catch (error) {
                    console.error('❌ Firebase error:', error);
                    alert(`❌ Failed to add fine: ${error.message}`);
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
                    await addDoc(collection(db, 'baton'), entry);
                    e.target.reset();
                    setDefaultDate();
                    alert('✅ Baton updated!');
                } catch (error) {
                    alert('❌ Failed to update');
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
            } catch (error) {
                console.error('Error:', error);
            }
        }

        async function loadFineReasons() {
            // Always use the hardcoded list - don't load from Firebase
            // This ensures we always have the full, up-to-date fine descriptions
            populateFineReasons();
            updateFineReasonsTable();
        }

        function updatePlayerDropdowns() {
            const addFineSelect = document.getElementById('playerName');
            const statsSelect = document.getElementById('playerSelector');
            const filterSelect = document.getElementById('filterPlayer');
            const deleteSelect = document.getElementById('deletePlayerSelect');
            
            addFineSelect.innerHTML = '<option value="">Select player...</option>';
            statsSelect.innerHTML = '<option value="all">All Players</option>';
            filterSelect.innerHTML = '<option value="">All Players</option>';
            deleteSelect.innerHTML = '<option value="">Select player to delete...</option>';
            
            allPlayers.forEach(player => {
                [addFineSelect, statsSelect, filterSelect, deleteSelect].forEach(select => {
                    const option = document.createElement('option');
                    option.value = player.name;
                    option.textContent = player.name;
                    select.appendChild(option);
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
                                    <label style="font-size: 0.85em;">EAFC 26</label>
                                    <input type="number" class="games-input" value="${player.eafc26 || 0}" 
                                           onchange="updateGamesField('${player.name}', 'eafc26', this.value)">
                                </div>
                                <div>
                                    <label style="font-size: 0.85em;">Adjustment (+/-)</label>
                                    <input type="number" class="games-input" value="${player.adjustment || 0}" 
                                           onchange="updateGamesField('${player.name}', 'adjustment', this.value)">
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

        async function updateGamesField(playerName, field, value) {
            const player = allPlayers.find(p => p.name === playerName);
            if (player) {
                player[field] = parseInt(value) || 0;
                await savePlayers();
                updateManagePlayersTable();
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
            alert(`✅ ${name} added!`);
        }

        async function deletePlayer(name) {
            if (!confirm(`⚠️ Delete ${name}? This will remove ALL their fines!`)) {
                return;
            }

            allPlayers = allPlayers.filter(p => p.name !== name);
            await savePlayers();
            
            const playerFines = allFines.filter(f => f.playerName === name);
            for (const fine of playerFines) {
                await deleteDoc(doc(db, 'fines', fine.id));
            }
            
            alert(`✅ ${name} deleted`);
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

            allPlayers = allPlayers.filter(p => p.name !== name);
            await savePlayers();
            
            const playerFines = allFines.filter(f => f.playerName === name);
            for (const fine of playerFines) {
                await deleteDoc(doc(db, 'fines', fine.id));
            }
            
            document.getElementById('deletePlayerSelect').value = '';
            alert(`✅ ${name} and all their fines have been deleted`);
        }

        async function savePlayers() {
            try {
                await setDoc(doc(db, 'config', 'players'), { list: allPlayers });
                updatePlayerDropdowns();
                updateManagePlayersTable();
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
            updateStats();
            updateHistory();
            updatePlayers();
            updatePlayerStats();
            updateBatonTracker();
            updateFineReasonsTable();
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
        }

        function updatePlayerStats() {
            const selectedPlayer = document.getElementById('playerSelector').value;
            const detailDiv = document.getElementById('playerStatsDetail');

            if (selectedPlayer === 'all' || !selectedPlayer) {
                detailDiv.innerHTML = '';
                return;
            }

            const playerFines = allFines.filter(f => f.playerName === selectedPlayer);
            const player = allPlayers.find(p => p.name === selectedPlayer);
            
            if (playerFines.length === 0) {
                detailDiv.innerHTML = '<div class="empty-state"><p>No fines yet</p></div>';
                return;
            }

            const totalFines = playerFines.reduce((sum, f) => sum + f.amount, 0);
            const unpaidFines = playerFines.filter(f => !f.paid).reduce((sum, f) => sum + f.amount, 0);
            const totalGames = player ? calculateTotalGames(player) : 0;
            const finesPerGame = totalGames > 0 ? totalFines / totalGames : 0;
            const avgFine = totalFines / playerFines.length;
            const worstFine = Math.max(...playerFines.map(f => f.amount));
            const paymentRate = ((playerFines.filter(f => f.paid).length / playerFines.length) * 100).toFixed(0);

            const finesByReason = {};
            playerFines.forEach(f => {
                finesByReason[f.reason] = (finesByReason[f.reason] || 0) + 1;
            });
            const mostCommon = Object.entries(finesByReason).sort((a, b) => b[1] - a[1])[0];

            const finesByDate = {};
            playerFines.forEach(f => {
                finesByDate[f.date] = (finesByDate[f.date] || 0) + 1;
            });
            const mostInDay = Math.max(...Object.values(finesByDate));

            detailDiv.innerHTML = `
                <div class="card">
                    <h3 style="margin-bottom: 15px; color: #1D428A;">${selectedPlayer}</h3>
                    <div class="stats-grid">
                        <div class="stat-card">
                            <div class="stat-label">🎮 Games</div>
                            <div class="stat-value">${totalGames}</div>
                        </div>
                        <div class="stat-card">
                            <div class="stat-label">💰 Total</div>
                            <div class="stat-value">£${totalFines.toFixed(0)}</div>
                        </div>
                        <div class="stat-card">
                            <div class="stat-label">📊 Per Game</div>
                            <div class="stat-value">£${finesPerGame.toFixed(2)}</div>
                        </div>
                        <div class="stat-card">
                            <div class="stat-label">📝 Count</div>
                            <div class="stat-value">${playerFines.length}</div>
                        </div>
                        <div class="stat-card">
                            <div class="stat-label">💵 Average</div>
                            <div class="stat-value">£${avgFine.toFixed(2)}</div>
                        </div>
                        <div class="stat-card">
                            <div class="stat-label">💥 Worst</div>
                            <div class="stat-value">£${worstFine.toFixed(0)}</div>
                        </div>
                        <div class="stat-card">
                            <div class="stat-label">🔥 Most/Day</div>
                            <div class="stat-value">${mostInDay}</div>
                        </div>
                        <div class="stat-card">
                            <div class="stat-label">⚠️ Unpaid</div>
                            <div class="stat-value">£${unpaidFines.toFixed(0)}</div>
                        </div>
                        <div class="stat-card">
                            <div class="stat-label">✓ Paid %</div>
                            <div class="stat-value">${paymentRate}%</div>
                        </div>
                        <div class="stat-card">
                            <div class="stat-label">🎯 Top Fine</div>
                            <div class="stat-value" style="font-size: 0.8em;">${mostCommon ? mostCommon[0].substring(0, 15) : '-'}</div>
                        </div>
                    </div>
                </div>
            `;
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
                const date = cells[0].textContent;
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
                
                // Date filter
                if (dateFilter && !date.includes(formatDateDDMMYYYY(dateFilter))) {
                    show = false;
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
            if (batonHistory.length > 0) {
                const latest = batonHistory[0];
                document.getElementById('batonCurrentTeam').textContent = latest.to;
                document.getElementById('batonCurrentDate').textContent = `Updated: ${formatDateDDMMYYYY(latest.date)}`;
            }

            const forfeitTable = document.getElementById('forfeitTable');
            
            const playerStats = {};
            allFines.forEach(fine => {
                if (!playerStats[fine.playerName]) {
                    const player = allPlayers.find(p => p.name === fine.playerName);
                    playerStats[fine.playerName] = {
                        total: 0,
                        games: player ? calculateTotalGames(player) : 0
                    };
                }
                playerStats[fine.playerName].total += fine.amount;
            });

            const leastGames = Object.entries(playerStats)
                .map(([name, stats]) => ({ name, games: stats.games }))
                .sort((a, b) => a.games - b.games)[0];

            const highestTotal = Object.entries(playerStats)
                .map(([name, stats]) => ({ name, total: stats.total }))
                .sort((a, b) => b.total - a.total)[0];

            const highestPerGame = Object.entries(playerStats)
                .map(([name, stats]) => ({ 
                    name, 
                    perGame: stats.games > 0 ? stats.total / stats.games : 0 
                }))
                .sort((a, b) => b.perGame - a.perGame)[0];

            forfeitTable.innerHTML = `
                <div class="player-card">
                    <div style="display: flex; justify-content: space-between; margin-bottom: 5px;">
                        <span>🎮 Least Games</span>
                        <strong>${leastGames?.name || '-'} (${leastGames?.games || 0})</strong>
                    </div>
                    <div style="display: flex; justify-content: space-between; margin-bottom: 5px;">
                        <span>💰 Highest Total</span>
                        <strong>${highestTotal?.name || '-'} (£${highestTotal?.total.toFixed(0) || 0})</strong>
                    </div>
                    <div style="display: flex; justify-content: space-between;">
                        <span>📊 Highest Per Game</span>
                        <strong>${highestPerGame?.name || '-'} (£${highestPerGame?.perGame.toFixed(2) || 0})</strong>
                    </div>
                </div>
            `;

            const historyTable = document.getElementById('batonHistoryTable');
            historyTable.innerHTML = batonHistory.map(entry => `
                <tr>
                    <td>${formatDateDDMMYYYY(entry.date)}</td>
                    <td>${entry.from}</td>
                    <td>${entry.score}</td>
                    <td>${entry.to}</td>
                    <td>
                        <button class="btn-small btn-danger" onclick="deleteBatonEntry('${entry.id}')">Del</button>
                    </td>
                </tr>
            `).join('') || '<tr><td colspan="5" style="text-align: center;">No history</td></tr>';
        }

        async function deleteBatonEntry(id) {
            if (confirm('Delete this entry?')) {
                try {
                    await deleteDoc(doc(db, 'baton', id));
                } catch (error) {
                    alert('❌ Failed to delete');
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
                for (const fine of unpaidFines) {
                    await updateDoc(doc(db, 'fines', fine.id), {
                        paid: true,
                        paidDate: paidDate
                    });
                }
                alert(`✅ Marked ${unpaidFines.length} fines as paid!`);
                closeMarkAllModal();
            } catch (error) {
                alert('❌ Failed to mark all as paid');
            }
        }

        async function deleteFine(id) {
            if (confirm('Delete this fine?')) {
                try {
                    await deleteDoc(doc(db, 'fines', id));
                } catch (error) {
                    alert('❌ Failed to delete');
                }
            }
        }

        async function clearAllFines() {
            if (!confirm('⚠️ Clear ALL fines? Cannot be undone!')) return;
            if (!confirm('Are you SURE?')) return;
            
            try {
                const snapshot = await getDocs(collection(db, 'fines'));
                for (const d of snapshot.docs) {
                    await deleteDoc(d.ref);
                }
                alert('✅ All cleared');
            } catch (error) {
                alert('❌ Failed');
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

        function handleFileSelect(event) {
            console.log('File select triggered');
            const file = event.target.files[0];
            if (!file) {
                console.log('No file selected');
                return;
            }

            console.log('File selected:', file.name);
            showImportAlert('Reading file...', 'success');

            const reader = new FileReader();
            reader.onload = async function(e) {
                console.log('File loaded, starting import');
                await parseAndImportCSV(e.target.result);
            };
            reader.onerror = function(e) {
                console.error('File read error:', e);
                showImportAlert('❌ Failed to read file', 'error');
            };
            reader.readAsText(file);
        }

        async function parseAndImportCSV(csvText) {
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

            // Show progress message
            showImportAlert(`Importing ${fines.length} fines... Please wait (this may take 30-60 seconds)`, 'success');

            let imported = 0;
            try {
                for (const fine of fines) {
                    await addDoc(collection(db, 'fines'), fine);
                    imported++;
                    
                    // Update progress every 50 fines
                    if (imported % 50 === 0) {
                        showImportAlert(`Importing... ${imported}/${fines.length} fines`, 'success');
                    }
                }
                showImportAlert(`✅ Imported ${fines.length} fines successfully!`, 'success');
            } catch (error) {
                console.error('Import error:', error);
                showImportAlert(`❌ Import failed after ${imported} fines. Error: ${error.message}`, 'error');
            }
        }

        function formatDateToISO(dateStr) {
            if (!dateStr) return null;
            
            const date = new Date(dateStr);
            if (!isNaN(date.getTime())) {
                return date.toISOString().split('T')[0];
            }
            
            const parts = dateStr.split('/');
            if (parts.length === 3) {
                const [day, month, year] = parts;
                return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
            }
            
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

        init();
