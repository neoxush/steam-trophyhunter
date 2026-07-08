// Steam Trophy Hunter - Main Application Logic

// State Management
let achievements = [];
let filteredAchievements = [];
let games = [];
let currentGame = 'all'; // 'all' or specific game name
let aiPreference = 'gemini'; // Default AI provider
let guideLanguage = 'Chinese'; // Default language for AI guides
let selectedAchievementId = null; // Track which achievement opened the modal
let addGamePasteResult = null; // Parsed { appId, gameName, achievements } from Add Game paste box

// Initialize App
document.addEventListener('DOMContentLoaded', () => {
    console.log('[App] Initializing sync...');
    try {
        loadAchievements();
        loadAiPreference(); // Restore AI settings
        setupEventListeners();
        initializeTheme();

        // Final sync of the UI state
        updateUI();

        console.log(`[App] Started. Tracking ${achievements.length} achievements.`);
    } catch (e) {
        console.error("[App] Fatal startup error:", e);
    }
});

// Event Listeners
function setupEventListeners() {
    const searchInput = document.getElementById('searchInput');
    const filterSelect = document.getElementById('filterSelect');
    const addGamePaste = document.getElementById('addGamePaste');

    if (searchInput) {
        searchInput.addEventListener('input', handleSearch);
        searchInput.addEventListener('paste', handleSearchPaste);
    }
    if (filterSelect) {
        filterSelect.addEventListener('change', handleFilter);
    }
    if (addGamePaste) {
        addGamePaste.addEventListener('input', handleAddGamePasteInput);
    }
}

// Search Handler
function handleSearch(event) {
    const query = event.target.value.toLowerCase();
    applyFilters(query);
}

// Filter Handler
function handleFilter(event) {
    const searchInput = document.getElementById('searchInput');
    const query = searchInput ? searchInput.value.toLowerCase() : '';
    applyFilters(query);
}

// Paste Handler for Search Bar (Smart Sync + Add-Game Detection).
// The search bar is the "paste anything" surface. We inspect the paste and
// route it to the right modal:
//   - Steam URL alone                → Add Game (auto-fetch kicks in)
//   - Steam page for a NEW game      → Add Game (with paste pre-filled)
//   - Steam page for an EXISTING game → Sync
//   - JSON blob                      → Sync (import path)
//   - Anything shorter/other         → let the search filter handle it.
function handleSearchPaste(event) {
    const pastedText = (event.clipboardData || window.clipboardData).getData('text');
    if (!pastedText || pastedText.length < 30) return;

    const parsed = parseSteamAchievementsPaste(pastedText);

    if (parsed.isUrlOnly && parsed.appId) {
        event.preventDefault();
        openAddGameWithPaste(pastedText);
        return;
    }

    if (parsed.achievements.length > 0 && parsed.gameName) {
        const alreadyTracked = achievements.some(a => a.game === parsed.gameName);
        event.preventDefault();
        if (alreadyTracked) {
            showSyncModal(pastedText);
        } else {
            openAddGameWithPaste(pastedText);
        }
        return;
    }

    // Legacy heuristic — big text that looks Steam-ish or JSON-ish.
    const trimmed = pastedText.trim();
    const isSteamText = pastedText.length > 300 && (pastedText.includes('Unlocked') || pastedText.includes('earned') || pastedText.includes('@'));
    const isJson = (trimmed.startsWith('[') || trimmed.startsWith('{')) && pastedText.length > 50;
    if (isSteamText || isJson) {
        event.preventDefault();
        showSyncModal(pastedText);
    }
}

// Open Add Game and populate the paste box with the given text. Fires an
// `input` event so the existing parse-preview-autofill pipeline runs.
function openAddGameWithPaste(text) {
    showAddGameModal();
    const pasteEl = document.getElementById('addGamePaste');
    if (!pasteEl) return;
    pasteEl.value = text;
    try {
        pasteEl.dispatchEvent(new Event('input', { bubbles: true }));
    } catch (_) {
        handleAddGamePasteInput({ target: pasteEl });
    }
}

// Apply all filters
function applyFilters(searchQuery = '') {
    const filterSelect = document.getElementById('filterSelect');
    const filter = filterSelect ? filterSelect.value : '';

    // Start with all achievements
    let filtered = [...achievements];

    // Filter by current game
    if (currentGame !== 'all') {
        filtered = filtered.filter(a => a.game === currentGame);
    }

    // Apply search
    if (searchQuery) {
        filtered = filtered.filter(ach =>
            ach.name.toLowerCase().includes(searchQuery) ||
            ach.description.toLowerCase().includes(searchQuery)
        );
    }

    // Apply status filter
    switch (filter) {
        case 'priority':
            filtered = filtered.filter(a =>
                a.priority === 'high' || a.priority === 'medium'
            );
            break;
        case 'favorite':
            filtered = filtered.filter(a => a.favorite);
            break;
        case 'incomplete':
            filtered = filtered.filter(a => !a.achieved);
            break;
        case 'completed':
            filtered = filtered.filter(a => a.achieved);
            break;
    }

    filteredAchievements = filtered;
    renderAchievements();
}

// Switch game tab
function switchGame(gameName, event) {
    currentGame = gameName;

    // Use the centralized UI update function to ensure all elements are consistent
    // This fixes bugs where some buttons (like Pasteboard Sync) would show/hide inconsistently
    updateUI();

    // Persist current game selection
    if (currentGame) {
        localStorage.setItem('currentGame', currentGame);
    }
}

// Render game tabs
function renderGameTabs() {
    const tabsContainer = document.getElementById('gameTabs');

    if (!tabsContainer) {
        console.error("Game tabs container not found.");
        return;
    }

    if (achievements.length === 0) {
        tabsContainer.innerHTML = '';
        return;
    }

    try {
        // Get unique games with counts
        const gameStats = {};
        achievements.forEach(ach => {
            const name = ach.game || 'Unknown Game';
            if (!gameStats[name]) {
                gameStats[name] = {
                    total: 0,
                    completed: 0,
                    icon: ach.gameIcon || '🏆'
                };
            }
            gameStats[name].total++;
            if (ach.achieved) {
                gameStats[name].completed++;
            }
        });

        // Create tabs HTML
        let tabsHTML = `
            <div class="game-tab game-tab-all ${currentGame === 'all' ? 'active' : ''}" onclick="switchGame('all', event)">
                <span class="game-tab-icon">🏆</span>
                <span class="game-tab-name">All Games</span>
                <span class="game-tab-count">${achievements.length}</span>
            </div>
        `;

        Object.keys(gameStats).sort().forEach(gameName => {
            const stats = gameStats[gameName];
            const escapedName = gameName.replace(/'/g, "\\'");
            const isActive = currentGame === gameName;

            tabsHTML += `
                <div class="game-tab ${isActive ? 'active' : ''}" onclick="switchGame('${escapedName}', event)">
                    <span class="game-tab-icon">${stats.icon}</span>
                    <span class="game-tab-name">${gameName}</span>
                    <span class="game-tab-count">${stats.completed}/${stats.total}</span>
                </div>
            `;
        });

        tabsContainer.innerHTML = tabsHTML;
    } catch (e) {
        console.error("Error rendering game tabs:", e);
        tabsContainer.innerHTML = '<div class="error-message">Error loading game tabs.</div>';
    }
}



// Render Achievements
function renderAchievements() {
    const listContainer = document.getElementById('achievementList');
    const emptyState = document.getElementById('emptyState');

    if (!listContainer || !emptyState) {
        console.error("Achievement list or empty state container not found.");
        return;
    }

    if (filteredAchievements.length === 0 && achievements.length === 0) {
        listContainer.classList.add('hidden');
        emptyState.classList.remove('hidden');
        return;
    }

    listContainer.classList.remove('hidden');
    emptyState.classList.add('hidden');

    if (filteredAchievements.length === 0) {
        listContainer.innerHTML = '<div class="empty-state"><p>No achievements match your search</p></div>';
        return;
    }

    listContainer.innerHTML = filteredAchievements.map(ach => createAchievementCard(ach)).join('');
    updateStats();
}

// Create Achievement Card HTML
function createAchievementCard(ach) {
    const completedClass = ach.achieved ? 'completed' : '';
    const priorityClass = `priority-${ach.priority}`;
    const displayProgress = ach.achieved ? 100 : ach.progress;

    return `
        <div class="achievement-card ${completedClass} ${priorityClass}" onclick="toggleAchievement('${ach.id}')">
            <div class="achievement-icon">${ach.icon}</div>
            <div class="achievement-content">
                <div class="achievement-header">
                    <span class="achievement-name">${escapeHtml(ach.name)}</span>
                    <div class="achievement-badges">
                        ${ach.favorite ? '<span>⭐</span>' : ''}
                    </div>
                </div>
                <div class="achievement-description">${escapeHtml(ach.description)}</div>
                <div class="achievement-progress">
                    <div class="progress-bar">
                        <div class="progress-fill" style="width: ${displayProgress}%; background: ${ach.achieved ? 'var(--success-color)' : ''}"></div>
                    </div>
                    <span class="progress-text" style="${ach.achieved ? 'color: var(--success-color); font-weight: bold;' : ''}">${displayProgress}%</span>
                </div>
                <div class="achievement-meta">
                    <span class="meta-item">Game: ${escapeHtml(ach.game)}</span>
                    <span class="meta-item">${ach.globalPercentage}% players</span>
                    <span class="meta-item">Rarity: ${ach.rarity}</span>
                </div>
            </div>
            ${!ach.achieved ? `
                <button class="btn-guide" onclick="event.stopPropagation(); openGuideModal('${ach.id}')" title="Ask AI for a guide">
                    🧠 Guide
                </button>
            ` : ''}
        </div>
    `;
}

// Escape HTML to prevent XSS
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Update UI
function updateUI() {
    // Ensure data is filtered correctly before rendering
    const searchInput = document.getElementById('searchInput');
    const searchQuery = searchInput ? searchInput.value.toLowerCase() : '';
    applyFilters(searchQuery);

    renderGameTabs();
    renderAchievements();
    updateStats();

    // Sync buttons visibility
    const deleteBtn = document.getElementById('deleteGameBtn');
    const syncBtn = document.getElementById('syncProgressBtn');
    const isAll = currentGame === 'all';

    if (deleteBtn) deleteBtn.classList.toggle('hidden', isAll);
    if (syncBtn) syncBtn.classList.toggle('hidden', isAll || achievements.length === 0);
}

// Update Statistics (based on current view/filter)
function updateStats() {
    const total = filteredAchievements.length;
    const completed = filteredAchievements.filter(a => a.achieved).length;

    const totalCountEl = document.getElementById('totalCount');
    const completedCountEl = document.getElementById('completedCount');

    if (totalCountEl) totalCountEl.textContent = total;
    if (completedCountEl) completedCountEl.textContent = completed;
}

// Modal Functions
function showAddGameModal() {
    const modal = document.getElementById('addGameModal');
    const appIdInput = document.getElementById('appIdInput');
    const gameNameInput = document.getElementById('gameNameInput');
    const pasteEl = document.getElementById('addGamePaste');

    if (modal) modal.classList.remove('hidden');
    if (appIdInput) appIdInput.value = '';
    if (gameNameInput) gameNameInput.value = '';
    if (pasteEl) pasteEl.value = '';
    addGamePasteResult = null;
    hideAddGamePreview();
    hideAddGameError();
    hideAddGameLoading();
    if (pasteEl) pasteEl.focus();
}

function closeAddGameModal() {
    const modal = document.getElementById('addGameModal');
    if (modal) modal.classList.add('hidden');
}

function showSettingsModal() {
    const modal = document.getElementById('settingsModal');
    if (modal) modal.classList.remove('hidden');
}

function closeSettingsModal() {
    const modal = document.getElementById('settingsModal');
    if (modal) modal.classList.add('hidden');
}

function showAddGameError(message) {
    const errorEl = document.getElementById('addGameError');
    if (errorEl) {
        errorEl.textContent = message;
        errorEl.classList.remove('hidden');
    }
}

function hideAddGameError() {
    const errorEl = document.getElementById('addGameError');
    if (errorEl) errorEl.classList.add('hidden');
}

function showAddGameLoading() {
    const loadingEl = document.getElementById('addGameLoading');
    if (loadingEl) loadingEl.classList.remove('hidden');
}

function hideAddGameLoading() {
    const loadingEl = document.getElementById('addGameLoading');
    if (loadingEl) loadingEl.classList.add('hidden');
}

// Sync Modal Functions
function showSyncModal(initialText = '') {
    const syncInput = document.getElementById('syncInput');
    const syncModal = document.getElementById('syncModal');

    if (syncInput) syncInput.value = initialText;
    if (syncModal) syncModal.classList.remove('hidden');

    if (!initialText && syncInput) {
        syncInput.focus();
    }
}

function closeSyncModal() {
    const syncModal = document.getElementById('syncModal');
    if (syncModal) syncModal.classList.add('hidden');
}

function processBulkSync(overwrite = false) {
    const syncInput = document.getElementById('syncInput');
    const text = syncInput ? syncInput.value : '';
    if (!text.trim()) {
        showNotification('Please paste some text first.', 'warning');
        return;
    }

    // Confirmation for overwrite (Reuse import logic behavior)
    if (overwrite) {
        const scope = currentGame === 'all' ? 'ALL games' : `"${currentGame}"`;
        if (!confirm(`This will OVERWRITE your current progress for ${scope}. All achievements not found as "Unlocked" in your paste will be reset. Are you sure?`)) {
            return;
        }
    }

    // 1. Check if it's JSON (Import-style sync)
    try {
        if (text.trim().startsWith('[') || text.trim().startsWith('{')) {
            const jsonData = JSON.parse(text);
            const dataToProcess = Array.isArray(jsonData) ? jsonData : (jsonData.achievements || null);

            if (dataToProcess && Array.isArray(dataToProcess)) {
                handleJsonSync(dataToProcess, overwrite);
                return;
            }
        }
    } catch (e) {
        console.log('[Sync] Not JSON, falling back to text parsing');
    }

    // 2. Text-based Steam Sync
    const gameAchievements = currentGame === 'all' ? achievements : achievements.filter(a => a.game === currentGame);
    if (gameAchievements.length === 0) {
        showNotification(currentGame === 'all' ? 'No achievements found.' : 'No achievements found for the current game.', 'error');
        return;
    }

    // If overwriting, reset all targeted achievements first
    if (overwrite) {
        gameAchievements.forEach(ach => {
            ach.achieved = false;
            ach.progress = 0;
        });
    }

    let syncedCount = 0;
    let progressUpdatedCount = 0;
    const fullText = text.toLowerCase();
    const months = 'jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec|january|february|march|april|may|june|july|august|september|october|november|december';

    gameAchievements.forEach(ach => {
        const achName = ach.name.toLowerCase();

        // Find name in text
        const nameIdx = fullText.indexOf(achName);
        if (nameIdx !== -1) {
            // Find in a window after the name
            const excerpt = fullText.substring(nameIdx, nameIdx + 300);

            // 1. Check for 100% completion
            const completionRegex = new RegExp(`(unlocked|earned)\\s+(\\d+|${months})\\s+(\\d+|${months})`, 'i');
            const isCompleted = completionRegex.test(excerpt) && !excerpt.includes('once unlocked');

            if (isCompleted) {
                if (!ach.achieved) {
                    ach.achieved = true;
                    ach.progress = 100;
                    syncedCount++;
                }
            } else if (!ach.achieved) {
                // 2. Check for progress (e.g. "5 / 10" or "50%")
                const progressRegex = /(\d+)\s*\/\s*(\d+)/;
                const progressMatch = excerpt.match(progressRegex);

                if (progressMatch) {
                    const current = parseInt(progressMatch[1]);
                    const target = parseInt(progressMatch[2]);
                    if (target > 0) {
                        const newProgress = Math.min(99, Math.round((current / target) * 100)); // Cap at 99% if not 'Unlocked'
                        if (newProgress > ach.progress) {
                            ach.progress = newProgress;
                            progressUpdatedCount++;
                        }
                    }
                }
            }
        }
    });

    if (syncedCount > 0 || progressUpdatedCount > 0 || overwrite) {
        saveAchievements();
        updateUI();
        closeSyncModal();
        let msg = '';
        if (overwrite) {
            msg = `Fresh sync complete for ${currentGame === 'all' ? 'all games' : currentGame}!`;
        } else if (syncedCount > 0 && progressUpdatedCount > 0) {
            msg = `Synced ${syncedCount} completed and updated progress for ${progressUpdatedCount} achievements!`;
        } else if (syncedCount > 0) {
            msg = `Synced ${syncedCount} new achievements!`;
        } else {
            msg = `Updated progress for ${progressUpdatedCount} achievements!`;
        }
        showNotification(msg, 'success');
    } else {
        showNotification('No updates detected. Make sure you copied the "Unlocked" status or progress counters.', 'info');
    }
}

// Help handle JSON-based sync (Import-style)
function handleJsonSync(jsonData, overwrite) {
    // Basic validation
    if (!Array.isArray(jsonData)) {
        showNotification('Invalid format: Data must be an array of achievements.', 'error');
        return;
    }

    if (jsonData.length > 0 && !jsonData[0].name) {
        showNotification('Invalid data: Achievements must have a name property.', 'error');
        return;
    }

    if (currentGame === 'all') {
        if (overwrite) {
            achievements = jsonData;
        } else {
            // Merge logic
            jsonData.forEach(newAch => {
                const existing = achievements.find(a => a.id === newAch.id);
                if (existing) {
                    Object.assign(existing, newAch);
                } else {
                    achievements.push(newAch);
                }
            });
        }
    } else {
        // Scope to current game
        if (overwrite) {
            // Remove old ones for this game, add new ones
            achievements = achievements.filter(a => a.game !== currentGame);
            jsonData.forEach(a => {
                const newAch = { ...a, game: currentGame }; // Force current game
                achievements.push(newAch);
            });
        } else {
            // Merge per achievement
            jsonData.forEach(newAch => {
                const existing = achievements.find(a => a.id === newAch.id || (a.name === newAch.name && a.game === currentGame));
                if (existing) {
                    Object.assign(existing, newAch);
                } else {
                    achievements.push({ ...newAch, game: currentGame });
                }
            });
        }
    }

    saveAchievements();
    updateUI();
    closeSyncModal();
    showNotification(overwrite ? 'Data overwritten for current view!' : 'Progress updated from JSON!', 'success');
}

// Add Game by App ID - Fetch REAL achievements from Steam
async function submitAddGame() {
    const appIdInput = document.getElementById('appIdInput');
    const gameNameInput = document.getElementById('gameNameInput');
    const addGameBtn = document.getElementById('addGameBtn');

    // Prefer manually-typed values; fall back to paste-parsed values.
    let appId = appIdInput ? appIdInput.value.trim() : '';
    let gameName = gameNameInput ? gameNameInput.value.trim() : '';
    if (addGamePasteResult) {
        if (!appId && addGamePasteResult.appId) appId = addGamePasteResult.appId;
        if (!gameName && addGamePasteResult.gameName) gameName = addGamePasteResult.gameName;
    }

    // Validation
    if (appId && !/^(custom_\d+|\d+)$/.test(appId)) {
        showAddGameError('App ID must be a number');
        return;
    }
    if (!gameName) {
        showAddGameError('Enter a game name (or paste a Steam achievements page that includes the title).');
        return;
    }
    // Paste-only flow may not have a real App ID — synthesize one so achievement
    // IDs remain unique across localStorage. Users won't see this value.
    if (!appId) {
        appId = 'custom_' + Date.now();
    }

    // Dedup: name-based and ID-based
    if (achievements.find(a => a.game === gameName)) {
        showAddGameError(`Game "${gameName}" is already added!`);
        return;
    }
    if (achievements.find(a => a.id && a.id.startsWith(appId + '_'))) {
        showAddGameError(`App ID ${appId} is already tracked as "${achievements.find(a => a.id && a.id.startsWith(appId + '_')).game}"`);
        return;
    }

    hideAddGameError();
    showAddGameLoading();
    if (addGameBtn) addGameBtn.disabled = true;

    try {
        let realAchievements = null;

        // Path A: paste-parsed achievements (primary). Rebuild with the final
        // appId/gameName the user confirmed so IDs and game tag are correct.
        if (addGamePasteResult && addGamePasteResult.achievements.length > 0) {
            realAchievements = addGamePasteResult.achievements.map((a, i) => ({
                ...a,
                id: `${appId}_${i}`,
                game: gameName,
            }));
            console.log(`[Add Game] Using ${realAchievements.length} paste-parsed achievements.`);
        }
        // Path B: no paste — try the CORS-proxy fetch. May fail.
        else {
            if (appId.startsWith('custom_')) {
                throw new Error('Nothing to add. Paste a Steam achievements page, or enter a numeric App ID to try the auto-fetch fallback.');
            }
            console.log('[Add Game] No paste — falling back to CORS-proxy fetch.');
            realAchievements = await fetchRealSteamAchievements(appId, gameName);
        }

        if (realAchievements && realAchievements.length > 0) {
            achievements = [...achievements, ...realAchievements];
            filteredAchievements = [...achievements];
            saveAchievements();
            updateUI();
            closeAddGameModal();
            let msg = `Added ${gameName} with ${realAchievements.length} achievements!`;
            if (addGamePasteResult && addGamePasteResult.hiddenCount > 0) {
                msg += ` (${addGamePasteResult.hiddenCount} hidden — placeholders added.)`;
            }
            showNotification(msg, 'success');
        } else {
            throw new Error('No achievements were found in the paste or from Steam.');
        }

    } catch (error) {
        console.error('Add game error:', error);
        showAddGameError(`Error: ${error.message || 'Unknown error occurred'}`);
    } finally {
        hideAddGameLoading();
        if (addGameBtn) addGameBtn.disabled = false;
    }
}

// --- Add Game paste parsing ---
// Two accepted paste flavors:
//   1) View-source HTML (contains <div class="achieveRow">…) — parsed with DOMParser
//   2) Plain text from Ctrl+A on the rendered page — parsed line-by-line using
//      the "…\nDescription\n[Unlocked date]\nXX.Y%" pattern Steam produces.

function handleAddGamePasteInput(e) {
    const text = e.target.value;
    if (!text.trim()) {
        addGamePasteResult = null;
        hideAddGamePreview();
        return;
    }
    const parsed = parseSteamAchievementsPaste(text);

    // URL-only paste — auto-fetch via CORS proxies. On failure, open the
    // page in a new tab so the user is already there for the bookmarklet.
    if (parsed.isUrlOnly && parsed.appId) {
        autoFetchFromUrl(parsed.appId, text.trim());
        return;
    }

    addGamePasteResult = parsed;
    updateAddGamePreview(parsed);

    // Autofill manual fields only if user hasn't typed anything there yet.
    const appIdInput = document.getElementById('appIdInput');
    const gameNameInput = document.getElementById('gameNameInput');
    if (parsed.appId && appIdInput && !appIdInput.value.trim()) appIdInput.value = parsed.appId;
    if (parsed.gameName && gameNameInput && !gameNameInput.value.trim()) gameNameInput.value = parsed.gameName;
}

// Auto-fetch a Steam achievements page when the user pastes only a URL.
// Silent success → preview populates like a normal paste.
// Total failure → error message points at the bookmarklet, and we open
// the page in a new tab so the user is one click away from clicking it.
let _autoFetchInFlight = false;
async function autoFetchFromUrl(appId, url) {
    if (_autoFetchInFlight) return;
    _autoFetchInFlight = true;

    hideAddGameError();
    showAddGameLoading();

    try {
        const list = await fetchRealSteamAchievements(appId, ''); // gameName resolved from HTML
        // fetchRealSteamAchievements already stamped game name into each row.
        const gameName = list[0] && list[0].game ? list[0].game : `Game ${appId}`;
        addGamePasteResult = { appId, gameName, achievements: list, isUrlOnly: false };
        updateAddGamePreview(addGamePasteResult);

        // Autofill manual fields
        const appIdInput = document.getElementById('appIdInput');
        const gameNameInput = document.getElementById('gameNameInput');
        if (appIdInput && !appIdInput.value.trim()) appIdInput.value = appId;
        if (gameNameInput && !gameNameInput.value.trim()) gameNameInput.value = gameName;
    } catch (err) {
        console.warn('[Add Game] URL auto-fetch failed:', err);
        addGamePasteResult = null;
        hideAddGamePreview();
        showAddGameError(
            `Auto-fetch failed (${err.message}). Opening the page for you — click the "🏆 Grab Steam Achievements" bookmarklet on it, then paste the result back here.`
        );
        try { window.open(url, '_blank', 'noopener'); } catch (_) { /* ignore popup blocker */ }
    } finally {
        hideAddGameLoading();
        _autoFetchInFlight = false;
    }
}

function parseSteamAchievementsPaste(text) {
    const result = {
        appId: null,
        gameName: null,
        achievements: [],
        isUrlOnly: false,
        reportedTotal: null,   // From "N of M" count line, if present
        reportedEarned: null,  // From "N of M" count line, if present
    };

    // 1. App ID from any Steam URL present in the paste.
    const urlMatch = text.match(/(?:steamcommunity\.com\/(?:stats|id\/[^/]+\/stats|profiles\/\d+\/stats)\/(\d+)|store\.steampowered\.com\/app\/(\d+))/i);
    if (urlMatch) result.appId = urlMatch[1] || urlMatch[2];

    // 1b. URL-only paste — no meaningful content besides the URL.
    if (result.appId && /^\s*https?:\/\/\S+\s*$/.test(text)) {
        result.isUrlOnly = true;
        return result;
    }

    // 2. HTML path — paste looks like view-source content.
    if (text.includes('achieveRow') || /<html[\s>]/i.test(text)) {
        try {
            const htmlParsed = parseAchievementsHTML(text, result.appId);
            if (htmlParsed.achievements.length > 0) {
                if (htmlParsed.gameName) result.gameName = htmlParsed.gameName;
                result.achievements = htmlParsed.achievements;
                return result;
            }
        } catch (err) {
            console.warn('[Add Game] HTML parse failed, falling back to text:', err);
        }
    }

    // 3. Plain text paths — handles both the Personal Achievements view
    //    (has unlock-date lines, no percentages) and the Global Achievements
    //    view (has percentage lines). Locale-agnostic where possible.
    //
    // Game name resolution — universal `»` breadcrumb (works in every locale)
    // with a locale-specific "Stats" suffix stripped. Fallback: English
    // "<Name> > Global Achievements" header form.
    if (!result.gameName) {
        result.gameName = extractGameNameFromBreadcrumb(text);
    }
    if (!result.gameName) {
        const mB = text.match(/^\s*([^\n>·|]{1,80})\s*[>·]\s*(?:Global\s+)?Achievements?\b/im);
        if (mB) result.gameName = mB[1].trim();
    }

    // Count line — "N of M (X%) achievements earned" (English) or
    // "已获得 N / M (X%) 个成就" (Chinese) or similar. We use this as the
    // authoritative total from Steam so we can honestly report the delta
    // between what was in the paste and what Steam claims exists.
    const countM = text.match(/\b(\d+)\s*(?:of|\/)\s*(\d+)\s*\(\s*\d+\s*%\s*\)\s*achievements?\s+earned/i)
        || text.match(/已?获得\s*(\d+)\s*\/\s*(\d+)\s*\(\s*\d+\s*%\s*\)\s*[个個]?\s*成就/);
    if (countM) {
        result.reportedEarned = parseInt(countM[1], 10);
        result.reportedTotal = parseInt(countM[2], 10);
    }

    // Guard: only proceed if the paste looks like a Steam achievements page.
    // Locale-aware — accepts English/Chinese keywords plus universal
    // structural signals (breadcrumb, percentages, unlock-date lines).
    const looksLikeSteam =
        /\bachievements?\s+earned\b/i.test(text) ||
        /\b(personal|global)\s+achievements\b/i.test(text) ||
        /(个人成就|個人成就|全球成就|已获得\s*\d+.*成就|个成就|個成就)/.test(text) ||
        /»\s*(Games?|游戏|遊戲)\s*»/i.test(text) ||
        UNLOCK_KEYWORDS.test(text) ||
        /^\s*\d+(?:\.\d+)?\s*%\s*$/m.test(text);
    if (!looksLikeSteam) {
        return result;
    }

    const globalRows = extractPlainTextGlobal(text, result);
    const personalRows = extractPlainTextPersonal(text, result);
    // Whichever strategy found more rows wins. If tied, prefer Personal
    // because it also carries achieved-status data.
    result.achievements = personalRows.length >= globalRows.length ? personalRows : globalRows;

    // Hidden-count padding. Steam pages advertise a total ("17 of 43") and,
    // separately, count hidden achievements the paste doesn't enumerate
    // ("+1 / 1 hidden achievement remaining"). If we know the delta, pad
    // with placeholder rows so Trophy Hunter's total matches Steam's total.
    // This mirrors Steam's own presentation — locked, name-hidden rows —
    // rather than silently under-reporting.
    let hiddenCount = 0;
    if (typeof result.reportedTotal === 'number' && result.reportedTotal > result.achievements.length) {
        hiddenCount = result.reportedTotal - result.achievements.length;
    }
    const hiddenLine =
        text.match(/^\s*\+?(\d+)\s+hidden\s+achievements?\s+remaining/im) ||
        text.match(/^\s*\+?(\d+)\s*[个個]?\s*(?:隐藏成就|隱藏成就)/im) ||
        text.match(/^\+(\d+)\s*$/m);
    if (hiddenLine) {
        const explicit = parseInt(hiddenLine[1], 10);
        if (!isNaN(explicit) && explicit > hiddenCount) hiddenCount = explicit;
    }
    if (hiddenCount > 0) {
        const startIdx = result.achievements.length;
        for (let i = 0; i < hiddenCount; i++) {
            const label = hiddenCount === 1
                ? 'Hidden Achievement'
                : `Hidden Achievement (${i + 1} of ${hiddenCount})`;
            const rec = buildAchievementRecord(
                label,
                'Details revealed once you unlock this achievement in-game.',
                0,
                startIdx + i,
                result
            );
            rec.isHidden = true;
            rec.icon = '🔒';
            rec.rarity = 'epic'; // Hidden achievements tend to be rare.
            result.achievements.push(rec);
        }
    }
    result.hiddenCount = hiddenCount;

    return result;
}

// Universal breadcrumb parser. Steam breadcrumbs are separated by `»` in
// every locale. Take the last segment and strip a locale-specific "Stats"
// suffix. Works for:
//   English: "<User> » Games » <GameName> Stats"       → "<GameName>"
//   Chinese: "<User> » 游戏 » <GameName> 统计信息"     → "<GameName>"
//   Otherwise: returns the last segment as-is.
function extractGameNameFromBreadcrumb(text) {
    const lines = text.split(/\r?\n/);
    const STATS_SUFFIX = /\s*(Stats|Statistics|Statistiken|Statistiques|Statistiche|Estad[íi]sticas|Estat[íi]sticas|Статистика|统计信息|統計信息|统计|統計|統計情報|통계|統計データ)\s*$/i;
    for (const line of lines) {
        if (!line.includes('»')) continue;
        const parts = line.split('»').map(s => s.trim()).filter(Boolean);
        if (parts.length < 2) continue;
        let candidate = parts[parts.length - 1];
        candidate = candidate.replace(STATS_SUFFIX, '').trim();
        if (candidate.length >= 1 && candidate.length <= 80) return candidate;
    }
    return null;
}

// Recognize the "Unlocked <date>" line in any locale.
//   1. Explicit keyword list (extensible), OR
//   2. Universal fallback: line has TWO OR MORE of { @-marker, HH:MM time,
//      4-digit year } — sufficient to identify a datestamp in almost any
//      locale, without relying on translated verbs.
const UNLOCK_KEYWORDS = new RegExp(
    "^\\s*(" +
    "unlocked|earned|" +
    "已解锁|已解鎖|解锁于|解鎖於|获得于|獲得於|获得|獲得|已获得|" +
    "d[ée]bloqu[ée]|freigeschaltet|desbloqueado[a]?|desbloqueada|sbloccato|conquistato|" +
    "ロック解除|解除済み|해제됨|해제|разблокировано|получено" +
    ")\\b", 'i'
);
function looksLikeUnlockLine(line) {
    if (!line) return false;
    if (UNLOCK_KEYWORDS.test(line)) return true;
    let hits = 0;
    if (/@/.test(line)) hits++;
    if (/\d{1,2}:\d{2}/.test(line)) hits++;
    if (/(?<!\d)(?:19|20)\d{2}(?!\d)/.test(line)) hits++;
    return hits >= 2;
}

// Strategy G — Global Achievements view: anchor on lines like "78.4%".
// Description sits directly above %; name sits above description.
function extractPlainTextGlobal(text, ctx) {
    const lines = text.split(/\r?\n/).map(l => l.trim());
    const pctRegex = /^(\d+(?:\.\d+)?)\s*%$/;
    const out = [];
    let idx = 0;
    for (let i = 0; i < lines.length; i++) {
        const m = lines[i].match(pctRegex);
        if (!m) continue;
        let cursor = i - 1;
        while (cursor >= 0 && looksLikeUnlockLine(lines[cursor])) cursor--;
        while (cursor >= 0 && !lines[cursor]) cursor--;
        const descOrName = cursor >= 0 ? lines[cursor--] : '';
        while (cursor >= 0 && !lines[cursor]) cursor--;
        const maybeName = cursor >= 0 ? lines[cursor] : '';

        let name, description;
        if (!maybeName || isNoiseLine(maybeName)) {
            name = descOrName; description = '';
        } else {
            name = maybeName; description = descOrName;
        }
        if (!name || isNoiseLine(name)) continue;

        out.push(buildAchievementRecord(name, description, parseFloat(m[1]), idx++, ctx));
    }
    return out;
}

// Strategy P — Personal Achievements view: block-anchored parsing.
// Each block is 1-3 lines separated by blank lines. Layouts:
//   [Name]                  [Name]              [Name]
//   [Description]           [Description]
//   Unlocked <date>         Unlocked <date>
// A block is achieved iff it contains a date-looking line (locale-agnostic).
function extractPlainTextPersonal(text, ctx) {
    const lines = text.split(/\r?\n/).map(l => l.trim());

    // Region anchor — skip page nav/header before the count line and stop
    // at the footer copyright. Matches English or Chinese count phrasing.
    let start = 0, end = lines.length;
    for (let i = 0; i < lines.length; i++) {
        if (/achievements\s+earned/i.test(lines[i]) ||
            /[个個]\s*成就|已获得.*成就|已獲得.*成就/.test(lines[i])) {
            start = i + 1; break;
        }
    }
    for (let i = end - 1; i >= start; i--) {
        if (/©\s*\d{4}\s*Valve|VAT\s+included|All\s+trademarks\s+are\s+property|Valve\s*(公司|Corporation)/i.test(lines[i])) {
            end = i; break;
        }
    }

    // Split region into blocks separated by blank lines.
    const blocks = [];
    let current = [];
    for (let i = start; i < end; i++) {
        const l = lines[i];
        if (!l) {
            if (current.length) { blocks.push(current); current = []; }
        } else {
            current.push(l);
        }
    }
    if (current.length) blocks.push(current);

    const out = [];
    let idx = 0;
    for (const block of blocks) {
        if (block.length === 1 && isSectionHeaderOrCounter(block[0])) continue;
        if (block.every(l => isNoiseLine(l))) continue;

        const unlockIdx = block.findIndex(l => looksLikeUnlockLine(l));
        const achieved = unlockIdx !== -1;

        const meat = block.filter((_, k) => k !== unlockIdx).filter(l => !isNoiseLine(l));
        if (meat.length === 0) continue;

        const name = meat[0];
        const description = meat.slice(1).join(' ').trim();
        if (isSectionHeaderOrCounter(name)) continue;

        const rec = buildAchievementRecord(name, description, 0, idx++, ctx);
        if (achieved) {
            rec.achieved = true;
            rec.progress = 100;
        }
        out.push(rec);
    }
    return out;
}

// Line-level noise: Steam nav chrome, one-line meta strings. Multi-locale.
function isNoiseLine(l) {
    if (!l) return true;
    // English nav / footer sections
    if (/^(steam|store|community|about|support|install\s+steam|login|language|profile|badges|inventory|screenshots|videos|workshop|reviews|guides|artwork|broadcasts|friends|groups|about\s+steam|jobs|hardware|recycling|privacy|accessibility|cookies|refunds|get\s+steam|get\s+mobile\s+apps|get\s+support|my\s+account|steam\s+ssa|steamworks|steam\s+distribution|gift\s+cards|about\s+valve|notices\s+&\s+policies|legal|valve|more|chat)$/i.test(l)) return true;
    if (/^(personal\s+achievements|global\s+achievements|view\s+global\s+achievement\s+stats|% of all players|view\s+achievements|view\s+details|link\s+to\s+the\s+steam\s+homepage)$/i.test(l)) return true;
    if (/^hidden achievement\.?$/i.test(l)) return true;
    if (/^details for each achievement will be revealed once unlocked$/i.test(l)) return true;
    if (/^\+\d+$/.test(l)) return true;
    if (/^\d+\s+hidden\s+achievements?\s+remaining/i.test(l)) return true;
    if (/^\d+\s+of\s+\d+\s+\(\d+%\)\s+achievements\s+earned/i.test(l)) return true;
    if (/^playtime\s+past/i.test(l)) return true;
    if (/^[¥$€£]\s*\d/.test(l)) return true;
    // Chinese nav / footer / meta lines
    if (/^(商店|社区|社群|支持|个人资料|個人資料|库|庫|徽章|库存|庫存|截图|截圖|视频|視頻|创意工坊|創意工坊|评测|評測|指南|艺术作品|藝術作品|直播|好友|群组|群組|个人成就|個人成就|全球成就|安装\s*Steam|安裝\s*Steam|登录|登入|语言|語言|获取\s*Steam|獲取\s*Steam|获取移动应用|獲取移動應用|帮助|說明|我的账户|我的帳戶|关于\s*Steam|關於\s*Steam|关于\s*Valve|關於\s*Valve|工作|硬件|硬體|回收|隐私|隱私|辅助功能|輔助功能|Cookies|退款|法律|礼品卡|禮品卡|Steamworks|Steam\s*分发|Steam\s*分發|更多|Chat|聊天|Neo.*Chat)$/i.test(l)) return true;
    if (/^隐藏成就\.?$|^隱藏成就\.?$/.test(l)) return true;
    if (/^还有?\s*\d+\s*[个個]?\s*隐藏成就|^還有?\s*\d+\s*[个個]?\s*隱藏成就/.test(l)) return true;
    if (/^已?获得?\s*\d+\s*[\/]?\s*\d+\s*\(\d+%\)\s*[个個]?\s*成就/.test(l)) return true;
    if (/^查看全球成就统计|^查看全球成就統計/.test(l)) return true;
    if (/^解锁后.*详细信息|^解鎖後.*詳細信息/.test(l)) return true;
    if (/^所有玩家.*百分比|^%\s*所有玩家/.test(l)) return true;
    if (/^最近两周游戏时间|^最近兩週遊戲時間/.test(l)) return true;
    return false;
}

// Block-level: single-line strings that are clearly not achievement names.
function isSectionHeaderOrCounter(l) {
    if (isNoiseLine(l)) return true;
    if (/»\s*(Games?|游戏|遊戲)\s*»/i.test(l)) return true;
    if (/^Link to the Steam Homepage/i.test(l)) return true;
    if (/^©\s*\d{4}/i.test(l)) return true;
    return false;
}

function buildAchievementRecord(name, description, globalPercentage, index, ctx) {
    let rarity = 'common';
    if (globalPercentage < 5) rarity = 'epic';
    else if (globalPercentage < 15) rarity = 'rare';
    else if (globalPercentage < 40) rarity = 'uncommon';

    const appId = ctx.appId || 'custom';
    const gameName = ctx.gameName || 'Untitled';
    return {
        id: `${appId}_${index}`,
        name,
        description,
        icon: '🏆',
        achieved: false,
        progress: 0,
        priority: 'medium',
        favorite: false,
        globalPercentage,
        rarity,
        game: gameName,
        gameIcon: '🏆',
    };
}

function updateAddGamePreview(parsed) {
    const el = document.getElementById('addGamePreview');
    if (!el) return;
    if (!parsed || parsed.achievements.length === 0) {
        el.classList.add('hidden');
        el.textContent = '';
        return;
    }
    const total = parsed.achievements.length;
    const parts = [`Found ${total} achievement${total === 1 ? '' : 's'}`];
    if (parsed.gameName) parts.push(`for "${parsed.gameName}"`);
    if (parsed.appId) parts.push(`(App ID ${parsed.appId})`);
    let msg = parts.join(' ') + '.';
    const unlocked = parsed.achievements.filter(a => a.achieved).length;
    if (unlocked > 0) msg += ` ${unlocked} already unlocked.`;
    if (parsed.hiddenCount > 0) {
        msg += ` ${parsed.hiddenCount} hidden — locked rows added as placeholders; names will need a manual re-add after you unlock them in-game.`;
    }
    msg += ' Review below and click Add.';
    el.textContent = msg;
    el.classList.remove('hidden');
}

function hideAddGamePreview() {
    const el = document.getElementById('addGamePreview');
    if (el) el.classList.add('hidden');
}

// Fetch REAL achievements from Steam Community page
async function fetchRealSteamAchievements(appId, gameName) {
    const steamUrl = `https://steamcommunity.com/stats/${appId}/achievements`;

    // Public CORS proxies — Steam Community doesn't serve CORS headers to
    // browsers, so we route through a third party. Multiple proxies tried
    // in order; first success wins. If all fail, throw so the caller can
    // fall through to the bookmarklet workflow.
    const proxies = [
        { url: `https://corsproxy.io/?${encodeURIComponent(steamUrl)}`, type: 'text' },
        { url: `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(steamUrl)}`, type: 'text' },
        { url: `https://api.allorigins.win/raw?url=${encodeURIComponent(steamUrl)}`, type: 'text' },
        { url: `https://api.allorigins.win/get?url=${encodeURIComponent(steamUrl)}`, type: 'json' }
    ];

    const PROXY_TIMEOUT_MS = 8000;
    let html = null;

    for (const proxy of proxies) {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), PROXY_TIMEOUT_MS);
        try {
            console.log(`[Add Game] Trying proxy: ${proxy.url}`);
            const response = await fetch(proxy.url, { signal: controller.signal });
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            if (proxy.type === 'json') {
                const data = await response.json();
                html = data.contents;
            } else {
                html = await response.text();
            }
            if (html && html.includes('achieveRow')) {
                console.log(`[Add Game] Proxy hit: ${proxy.url}`);
                break;
            }
            html = null; // response didn't contain achievements — keep trying
        } catch (e) {
            const reason = e.name === 'AbortError' ? `timeout after ${PROXY_TIMEOUT_MS}ms` : e.message;
            console.warn(`[Add Game] Proxy failed: ${proxy.url} — ${reason}`);
        } finally {
            clearTimeout(timer);
        }
    }

    if (!html) {
        throw new Error(
            'All CORS proxies failed. Use the bookmarklet above (fastest), ' +
            'or paste the page content directly.'
        );
    }

    const parsed = parseAchievementsHTML(html, appId);
    if (parsed.achievements.length === 0) {
        throw new Error('No achievements found on the page (private profile, or empty game).');
    }

    // Caller-provided gameName wins; otherwise use whatever the page told us.
    const finalName = gameName || parsed.gameName || `Game ${appId}`;
    return parsed.achievements.map((a, i) => ({
        ...a,
        id: `${appId}_${i}`,
        game: finalName,
    }));
}

// Parse a Steam achievements HTML page → { gameName, achievements[] }.
// Shared between the CORS-proxy fetch and the paste-HTML path.
function parseAchievementsHTML(html, appId) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    const ctx = { appId: appId || null, gameName: null };

    // Extract game name from common Steam locations.
    const titleCandidates = [
        doc.querySelector('.gameLogo a'),
        doc.querySelector('.apphub_AppName'),
        doc.querySelector('.profile_small_header_name'),
        doc.querySelector('.pageheader'),
        doc.querySelector('title'),
    ];
    for (const el of titleCandidates) {
        if (!el) continue;
        let t = (el.textContent || '').trim();
        t = t.replace(/^Steam\s*Community\s*::\s*/i, '');
        t = t.replace(/\s*[·>\-|]\s*(Global\s+)?Achievements?.*$/i, '');
        t = t.replace(/^Achievements?\s*[·>\-|]\s*/i, '');
        t = t.trim();
        if (t) { ctx.gameName = t; break; }
    }

    const rows = doc.querySelectorAll('.achieveRow');
    const achievements = [];
    rows.forEach((row, i) => {
        const nameEl = row.querySelector('h3');
        const descEl = row.querySelector('h5');
        const percentEl = row.querySelector('.achievePercent');
        const name = nameEl ? nameEl.textContent.trim() : `Achievement ${i + 1}`;
        const description = descEl ? descEl.textContent.trim() : '';
        let pct = 0;
        if (percentEl) {
            pct = parseFloat(percentEl.textContent.trim().replace('%', '')) || 0;
        }
        achievements.push(buildAchievementRecord(name, description, pct, i, ctx));
    });

    return { gameName: ctx.gameName, achievements };
}



// Clear Data
function clearData() {
    if (confirm('Are you sure you want to clear all data? This will remove all achievements.')) {
        achievements = [];
        filteredAchievements = [];
        currentGame = 'all';
        localStorage.removeItem('achievements');
        closeDataModal();
        updateUI();
        showNotification('All data cleared', 'info');
    }
}

// Data Compression for Export
function compressAchievements(data) {
    const COMPACT_KEYS = ['id', 'game', 'name', 'description', 'icon', 'achieved', 'progress', 'priority', 'favorite', 'globalPercentage', 'rarity', 'gameIcon'];

    // Map to a strict array format to eliminate repeated keys
    const compact = data.map(ach => COMPACT_KEYS.map(key => {
        if (key === 'achieved' || key === 'favorite') return ach[key] ? 1 : 0;
        return ach[key] ?? '';
    }));

    // Encode to Base64 with a version prefix
    // unescape(encodeURIComponent) makes it safe for UTF-8 (emojis etc)
    return 'STH1:' + btoa(unescape(encodeURIComponent(JSON.stringify(compact))));
}

// Data Decompression for Import
function decompressAchievements(code) {
    const COMPACT_KEYS = ['id', 'game', 'name', 'description', 'icon', 'achieved', 'progress', 'priority', 'favorite', 'globalPercentage', 'rarity', 'gameIcon'];

    // Support legacy JSON format
    if (!code.startsWith('STH1:')) {
        return JSON.parse(code);
    }

    try {
        const raw = JSON.parse(decodeURIComponent(escape(atob(code.substring(5)))));
        if (!Array.isArray(raw)) return [];

        return raw.map(arr => {
            const obj = {};
            COMPACT_KEYS.forEach((key, i) => {
                if (key === 'achieved' || key === 'favorite') obj[key] = arr[i] === 1;
                else obj[key] = arr[i];
            });
            return obj;
        });
    } catch (e) {
        console.error('[Import] Decompression failed:', e);
        throw new Error('Invalid code format');
    }
}

// Theme Management
let currentTheme = 'light';

function initializeTheme() {
    const savedTheme = localStorage.getItem('theme') || 'auto';
    currentTheme = savedTheme;
    applyTheme(currentTheme);
}

function toggleTheme() {
    const themes = ['light', 'dark', 'auto'];
    const currentIndex = themes.indexOf(currentTheme);
    const nextIndex = (currentIndex + 1) % themes.length;
    currentTheme = themes[nextIndex];

    applyTheme(currentTheme);
    localStorage.setItem('theme', currentTheme);

    const themeNames = { light: '☀️', dark: '🌙', auto: '🔄' };
    const themeBtn = document.getElementById('themeBtn');
    if (themeBtn) themeBtn.textContent = themeNames[currentTheme];
    showNotification(`Theme: ${currentTheme}`, 'info');
}

function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    const themeNames = { light: '☀️', dark: '🌙', auto: '🔄' };
    const themeBtn = document.getElementById('themeBtn');
    if (themeBtn) themeBtn.textContent = themeNames[theme];
}

// Toggle Achievement Completion
function toggleAchievement(achievementId) {
    const achievement = achievements.find(a => a.id === achievementId);
    if (achievement) {
        achievement.achieved = !achievement.achieved;
        achievement.progress = achievement.achieved ? 100 : 0;

        saveAchievements();
        updateUI();

        const status = achievement.achieved ? 'completed' : 'incomplete';
        showNotification(`${achievement.name} marked as ${status}`, 'success');
    }
}

// Copy All Data
function copyAllData() {
    const gameStats = {};
    achievements.forEach(ach => {
        if (!gameStats[ach.game]) {
            gameStats[ach.game] = { total: 0, completed: 0, achievements: [] };
        }
        gameStats[ach.game].total++;
        if (ach.achieved) gameStats[ach.game].completed++;
        gameStats[ach.game].achievements.push({
            name: ach.name,
            description: ach.description,
            completed: ach.achieved,
            priority: ach.priority,
            favorite: ach.favorite,
            globalPercentage: ach.globalPercentage
        });
    });

    let report = '🏆 STEAM TROPHY HUNTER - PROGRESS REPORT\n';
    report += '='.repeat(50) + '\n\n';

    Object.keys(gameStats).forEach(gameName => {
        const stats = gameStats[gameName];
        const percentage = Math.round((stats.completed / stats.total) * 100);

        report += `🎮 ${gameName}\n`;
        report += `   Progress: ${stats.completed}/${stats.total} (${percentage}%)\n`;
        report += `   Achievements:\n`;

        stats.achievements.forEach(ach => {
            const status = ach.completed ? '✅' : '⏳';
            const priority = ach.priority === 'high' ? '🔥' : ach.priority === 'medium' ? '⚡' : '📝';
            const favorite = ach.favorite ? '⭐' : '';
            report += `   ${status} ${ach.name} ${priority}${favorite} (${ach.globalPercentage}%)\n`;
        });
        report += '\n';
    });

    report += `Generated: ${new Date().toLocaleString()}\n`;
    report += 'Created with Steam Trophy Hunter';

    navigator.clipboard.writeText(report).then(() => {
        showNotification('Progress report copied to clipboard!', 'success');
    }).catch(() => {
        showNotification('Could not copy to clipboard', 'error');
    });
}

// Data Persistence
function saveAchievements() {
    // Deduplicate by achievement ID before saving (safety net)
    const seen = new Set();
    achievements = achievements.filter(a => {
        if (seen.has(a.id)) return false;
        seen.add(a.id);
        return true;
    });
    filteredAchievements = [...achievements];
    localStorage.setItem('achievements', JSON.stringify(achievements));
}

function loadAchievements() {
    console.log('[Cache] Reading data...');
    const saved = localStorage.getItem('achievements');
    const savedGame = localStorage.getItem('currentGame');

    if (saved) {
        try {
            const parsed = JSON.parse(saved);

            // Critical check: Ensure achievements is always an array
            if (Array.isArray(parsed)) {
                achievements = parsed;

                // Deduplicate on load
                const seen = new Set();
                achievements = achievements.filter(a => {
                    if (!a.id || seen.has(a.id)) return false;
                    seen.add(a.id);
                    return true;
                });

                filteredAchievements = [...achievements];
                console.log(`[Cache] Successfully loaded ${achievements.length} records.`);
            } else {
                console.warn('[Cache] Data format invalid, resetting cache.');
                achievements = [];
            }
        } catch (e) {
            console.error('[Cache] Parse error, resetting cache:', e);
            achievements = [];
        }
    }

    // Reconcile tab selection
    if (savedGame && achievements.some(a => a.game === savedGame)) {
        currentGame = savedGame;
    } else {
        currentGame = 'all';
    }
}
// Data Management
function showDataModal() {
    // Generate a compact code instead of raw JSON
    const data = compressAchievements(achievements);
    document.getElementById('exportInput').value = data;
    document.getElementById('importInput').value = '';
    document.getElementById('importError').classList.add('hidden');
    document.getElementById('dataModal').classList.remove('hidden');
}

function closeDataModal() {
    document.getElementById('dataModal').classList.add('hidden');
}

function exportData() {
    const data = document.getElementById('exportInput').value;
    navigator.clipboard.writeText(data).then(() => {
        closeDataModal();
        showNotification('Data copied to clipboard!', 'success');
    }).catch(err => {
        console.error('Failed to copy: ', err);
        // Modal stays open — user can manually select & copy
        showNotification('Clipboard not available. Please select the text and copy manually.', 'error');
    });
}

function importData() {
    const input = document.getElementById('importInput').value.trim();
    if (!input) {
        showImportError('Please paste data code first');
        return;
    }

    try {
        // Automatically detect and decompress code or parse legacy JSON
        const data = decompressAchievements(input);

        // Basic validation
        if (!Array.isArray(data)) {
            throw new Error('Data must be an array');
        }

        if (confirm('This will OVERWRITE your current progress. Are you sure?')) {
            achievements = data;
            filteredAchievements = [...achievements];
            saveAchievements();
            updateUI();
            closeDataModal();
            showNotification(`Imported ${achievements.length} achievements!`, 'success');
        }

    } catch (e) {
        console.error(e);
        showImportError('Invalid or corrupted data code');
    }
}

function showImportError(msg) {
    const el = document.getElementById('importError');
    el.textContent = msg;
    el.classList.remove('hidden');
}


// AI Guide Integration
function openGuideModal(id) {
    selectedAchievementId = id;
    const checkbox = document.getElementById('includeAllIncomplete');

    // Reset checkbox
    if (checkbox) {
        checkbox.checked = false;
        // Remove old listener to avoid duplicates, then add new one
        const newCheckbox = checkbox.cloneNode(true);
        checkbox.parentNode.replaceChild(newCheckbox, checkbox);
        newCheckbox.addEventListener('change', updateGuidePrompt);
    }

    updateGuidePrompt();

    // Show modal
    const modal = document.getElementById('guideModal');
    if (modal) {
        modal.classList.remove('hidden');
        const textarea = document.getElementById('guidePromptInput');
        if (textarea) textarea.focus();
    }
}

function updateGuidePrompt() {
    const textarea = document.getElementById('guidePromptInput');
    const checkbox = document.getElementById('includeAllIncomplete');

    if (!textarea) return;

    if (checkbox && checkbox.checked) {
        // Bulk Prompt
        const incomplete = achievements.filter(a => a.game === currentGame && !a.achieved);
        const list = incomplete.map(a => `${a.name}: ${a.description}`).join('\n');

        textarea.value = `INSTRUCTION: COMPREHENSIVE ACHIEVEMENT MASTER STRATEGY SHEET
GAME: "${currentGame}"
DATASET:
${list}

STRICT OUTPUT RULES:
1. FORMAT: A SINGLE unified Markdown Table for all data.
2. COLUMNS: | Achievement | Step | Technical Task | Location/Prerequisite | Optimization Notes |
3. EXHAUSTIVE FACTORIZATION: You MUST deconstruct every achievement into its FULL technical roadmap. 
4. NO SUMMARIES: If an achievement needs 5 actions to solve, it MUST occupy 5 separate rows. Do not collapse details into "Step 1".
5. SORTING: All rows MUST be grouped by Achievement Name. All steps for a single achievement must appear consecutively from Step 1 to Final Step.
6. NO LISTS: Use only table rows. No checkboxes, no bullets.
7. MISSABLES: Put "!!MISSABLE!!" in the Notes column for critical steps.
8. LANGUAGE: Generate the entire response, including headers and descriptions, in ${guideLanguage}.

EXAMPLE MASTER SHEET (IN ${guideLanguage}):
| Achievement | Step | Technical Task | Location/Prerequisite | Optimization Notes |
| :--- | :--- | :--- | :--- | :--- |
| Treasure Hunter | 1 | Unlock [Skill: Sight] | Skill Menu | Required to see hidden chests |
| Treasure Hunter | 2 | Secure [Chest A] | [Area 1] | !!MISSABLE!! Before boss fight |
| Combat Master | 1 | Kill 10 [Enemy X] | [Area 1] | Use [Weapon A] |
| Treasure Hunter | 3 | Secure [Chest B] | [Area 2] | Use Key from Area 1 |`;
    } else {
        // Single Prompt
        const achievement = achievements.find(a => a.id === selectedAchievementId);
        if (achievement) {
            const game = achievement.game;
            const name = achievement.name;
            const desc = achievement.description;
            textarea.value = `INSTRUCTION: SINGLE ACHIEVEMENT DATA SHEET
GAME: "${game}"
ACHIEVEMENT: "${name}"
DESCRIPTION: "${desc}"

STRICT OUTPUT RULES:
1. FORMAT: A single Markdown Table.
2. COLUMNS: | Step | Technical Task | Location/Prerequisite | Optimization Notes |
3. EXHAUSTIVE FACTORIZATION: Deconstruct the solution into its full technical roadmap. 
4. TONE: Command-line style. No intro/outro text.
5. NO LISTS: Use only the table format for the guide content.
6. LANGUAGE: Generate the entire response in ${guideLanguage}.

EXAMPLE (IN ${guideLanguage}):
| Step | Technical Task | Location/Prerequisite | Optimization Notes |
| :--- | :--- | :--- | :--- |
| 1 | Unlock [Skill] | Skill Tree | Required for Step 2 |
| 2 | Execute [Action] | [Specific Location] | Must be done during Night |`;
        }
    }
}

function closeGuideModal() {
    const modal = document.getElementById('guideModal');
    if (modal) modal.classList.add('hidden');
}

function confirmGuideLaunch() {
    const textarea = document.getElementById('guidePromptInput');
    const prompt = textarea ? textarea.value : '';

    if (!prompt.trim()) {
        showNotification('Please enter a prompt first.', 'warning');
        return;
    }

    const provider = localStorage.getItem('aiProvider') || 'gemini';
    let url = '';

    switch (provider) {
        case 'claude':
            url = `https://claude.ai/new?q=${encodeURIComponent(prompt)}`;
            break;
        case 'gemini':
            url = `https://gemini.google.com/app?q=${encodeURIComponent(prompt)}`;
            break;
        case 'perplexity':
            url = `https://www.perplexity.ai/search?q=${encodeURIComponent(prompt)}`;
            break;
        case 'chatgpt':
        default:
            url = `https://chatgpt.com/?q=${encodeURIComponent(prompt)}`;
            break;
    }

    // Close modal
    closeGuideModal();

    // Proactively copy to clipboard for reliability
    navigator.clipboard.writeText(prompt).then(() => {
        showNotification('Prompt copied! Paste it in the chat if needed.', 'info', 4000);
    }).catch(() => {
        // Ignore clipboard errors
    });

    // Open in new tab
    window.open(url, '_blank');
}

// Settings Management
function saveSettings() {
    const provider = document.getElementById('aiProviderSelect').value;
    const language = document.getElementById('aiLanguageSelect').value;

    aiPreference = provider;
    guideLanguage = language;

    localStorage.setItem('aiProvider', provider);
    localStorage.setItem('guideLanguage', language);
}

function loadAiPreference() {
    aiPreference = localStorage.getItem('aiProvider') || 'gemini';
    guideLanguage = localStorage.getItem('guideLanguage') || 'Chinese';

    const providerSelect = document.getElementById('aiProviderSelect');
    const languageSelect = document.getElementById('aiLanguageSelect');

    if (providerSelect) providerSelect.value = aiPreference;
    if (languageSelect) languageSelect.value = guideLanguage;
}

function showSettingsModal() {
    loadAiPreference(); // Ensure UI matches state
    document.getElementById('settingsModal').classList.remove('hidden');
}

function closeSettingsModal() {
    document.getElementById('settingsModal').classList.add('hidden');
}

// Confirm Delete Game
function confirmDeleteGame() {
    if (currentGame === 'all') return;

    if (confirm(`Are you sure you want to delete "${currentGame}" and all its achievements? This cannot be undone.`)) {
        // Remove achievements for this game
        const initialCount = achievements.length;
        achievements = achievements.filter(a => a.game !== currentGame);
        const deletedCount = initialCount - achievements.length;

        filteredAchievements = [...achievements];
        const deletedGameName = currentGame;

        // Reset to all games
        currentGame = 'all';
        saveAchievements();
        updateUI(); // This will re-render tabs and hide the delete button

        showNotification(`Deleted "${deletedGameName}" and ${deletedCount} achievements.`, 'success');
    }
}

// Notification System
function showNotification(message, type = 'info', duration = 3000) {
    const notification = document.createElement('div');
    notification.className = 'notification';
    notification.textContent = message;

    // Make errors persistent by default unless duration overrides
    if (type === 'error' && duration === 3000) {
        duration = 0; // Persistent
    }

    const colors = {
        success: '#26de81',
        error: '#eb3b5a',
        info: '#4b6584',
        warning: '#fed330'
    };

    notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: ${colors[type] || colors.info};
        color: white;
        padding: 16px 24px;
        border-radius: 8px;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
        z-index: 2000;
        animation: slideInRight 0.3s ease-out;
        max-width: 400px;
        cursor: pointer;
    `;

    // Add click to close
    notification.onclick = () => {
        notification.style.animation = 'slideOutRight 0.3s ease-out';
        setTimeout(() => notification.remove(), 300);
    };

    document.body.appendChild(notification);

    if (duration > 0) {
        setTimeout(() => {
            if (document.body.contains(notification)) {
                notification.style.animation = 'slideOutRight 0.3s ease-out';
                setTimeout(() => notification.remove(), 300);
            }
        }, duration);
    }
}

// Add notification animations to CSS dynamically
const style = document.createElement('style');
style.textContent = `
    @keyframes slideInRight {
        from {
            transform: translateX(400px);
            opacity: 0;
        }
        to {
            transform: translateX(0);
            opacity: 1;
        }
    }
    
    @keyframes slideOutRight {
        from {
            transform: translateX(0);
            opacity: 1;
        }
        to {
            transform: translateX(400px);
            opacity: 0;
        }
    }
`;
document.head.appendChild(style);
