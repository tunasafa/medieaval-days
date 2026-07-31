// UI Functions
const UNIT_PORTRAITS = {
    villager: 'assets/units/villager/idle/villager-idle_south.gif',
    militia: 'assets/units/militia/idle/militia_idle-idle_south.gif',
    warrior: 'assets/units/warrior/idle/warrior_idle_south.gif',
    axeman: 'assets/units/axeman/idle/axeman_idle_south.gif',
    archer: 'assets/units/archer/idle/archer_idle_south.gif',
    crossbowman: 'assets/units/crossbowman/idle/crossbowman_south.gif',
    ballista: 'assets/units/ballista/idle/ballista_south.gif',
    catapult: 'assets/units/catapult/idle/catapult_idle_south.gif',
    fishingBoat: 'assets/units/FishingBoat/fishingboat_south.gif',
    transportLarge: 'assets/units/TransportLarge/transport_south.gif',
    warship: 'assets/units/warship/warship_south.gif'
};

function displayName(type) {
    if (typeof formatEntityName === 'function') return formatEntityName(type);
    return String(type || '')
        .replace(/([a-z])([A-Z])/g, '$1 $2')
        .replace(/[-_]/g, ' ')
        .replace(/\b\w/g, char => char.toUpperCase());
}

function getUnitPortraitSrc(unitType) {
    return UNIT_PORTRAITS[unitType] || '';
}

function formatNumber(value, digits = 1) {
    if (!Number.isFinite(value)) return '0';
    return Number.isInteger(value) ? String(value) : value.toFixed(digits);
}

function getRadialMapPosition(entity) {
    if (!entity || !Number.isFinite(entity.x) || !Number.isFinite(entity.y)) return 'Unknown';
    const centerX = GAME_CONFIG.world.width / 2;
    const centerY = GAME_CONFIG.world.height / 2;
    const entityX = entity.x + (entity.width ? entity.width / 2 : 0);
    const entityY = entity.y + (entity.height ? entity.height / 2 : 0);
    const distancePct = Math.min(100, (Math.hypot(entityX - centerX, entityY - centerY) / GAME_CONFIG.world.radius) * 100);
    const bearing = (Math.atan2(entityY - centerY, entityX - centerX) * 180 / Math.PI + 360) % 360;
    return `${Math.round(distancePct)}% ring / ${Math.round(bearing)} deg`;
}

function setResourceCounter(resource, value) {
    const el = document.getElementById(`${resource}-count`);
    if (!el) return;
    const next = Math.floor(value);
    const prev = gameState.ui.resourceValues[resource];
    if (prev === next) return;
    el.textContent = next;
    if (prev !== undefined && next > prev) {
        el.classList.remove('bounce-text');
        void el.offsetWidth;
        el.classList.add('bounce-text');
    }
    gameState.ui.resourceValues[resource] = next;
}

function setTextIfChanged(id, value) {
    const el = document.getElementById(id);
    if (!el) return;
    const text = String(value);
    if (el.textContent !== text) el.textContent = text;
}

function updateUI() {
    const owner = getLocalPlayerId();
    const resources = getResourcesForPlayer(owner);
    const population = getPopulationForPlayer(owner);
    setResourceCounter('food', resources.food);
    setResourceCounter('wood', resources.wood);
    setResourceCounter('stone', resources.stone);
    setResourceCounter('gold', resources.gold);
    setTextIfChanged('population', `${population.current}/${population.max}`);
    setTextIfChanged('enemy-units', getAllUnits().filter(unit => areHostile(owner, unit)).length);
    setTextIfChanged('enemy-buildings', getAllBuildings().filter(building => areHostile(owner, building)).length);
}

function updateTrainingQueueUI() {
    const b = gameState.selectedBuilding;
    if (!b) return;
    const list = document.querySelector('#building-unit-list');
    if (!list) return;
    if (b.underConstruction) {
        const pct = typeof getConstructionProgressPct === 'function' ? getConstructionProgressPct(b) : 0;
        const workers = typeof getConstructionWorkers === 'function' ? getConstructionWorkers(b).length : 0;
        const fill = list.querySelector('.construction-progress .progress-fill');
        const pctEl = list.querySelector('.construction-pct');
        const workerEl = list.querySelector('.construction-workers');
        if (fill) fill.style.width = `${pct}%`;
        if (pctEl) pctEl.textContent = `${Math.floor(pct)}%`;
        if (workerEl) workerEl.textContent = `${workers}/${GAME_CONFIG.construction?.maxWorkers || 4}`;
        updateSelectionInfo();
        return;
    }
    const current = (b.trainingQueue || [])[0] || null;
    list.querySelectorAll('.unit').forEach(unitEl => {
        const type = unitEl.dataset.type;
        const progressFill = unitEl.querySelector('.progress-bar .progress-fill');
        const pill = unitEl.querySelector('.queue-pill');
        const items = (b.trainingQueue || []).filter(t => t.type === type);
        const queuedCount = items.length;
        if (pill) {
            pill.style.display = queuedCount > 0 ? 'inline-flex' : 'none';
            if (queuedCount > 0) pill.textContent = `x${queuedCount}`;
        }
        if (progressFill) {
            if (current && current.type === type) {
                const pct = 1 - (current.timeRemaining / current.totalTime);
                progressFill.style.width = `${Math.max(0, Math.min(100, pct * 100))}%`;
            } else {
                progressFill.style.width = '0%';
            }
        }
    });
    updateResearchQueueUI();
}

function getUnitTooltipHTML(unitType) {
    const base = GAME_CONFIG.units[unitType] || {};
    const cfg = typeof getEffectiveUnitConfig === 'function'
        ? getEffectiveUnitConfig({ type: unitType, player: getLocalPlayerId() })
        : base;
    const cost = typeof formatUpgradeCost === 'function' ? formatUpgradeCost(base.cost || {}) : formatCost(base.cost || {});
    const parts = [
        `<strong>${displayName(unitType)}</strong>`,
        `HP: ${base.maxHealth || base.health || 0}`,
        `Attack: ${formatNumber(cfg.attack || 0)}`,
        `Range: ${formatNumber(cfg.attackRange || 0, 0)}`,
        `Speed: ${formatNumber(cfg.speed || 0, 2)}`,
        `Train: ${typeof formatProductionSeconds === 'function' ? formatProductionSeconds(base.buildTime || 0, 'unit') : base.buildTime || 0}s`,
        `Cost: ${cost || 'Free'}`
    ];
    if (unitType === 'villager') parts.splice(5, 0, `Carry: ${getUnitCarryCapacity({ type: unitType, player: getLocalPlayerId() })}`);
    if (base.capacity) parts.splice(5, 0, `Capacity: ${base.capacity}`);
    return parts.join('<br>');
}

function getBuildingTooltipHTML(buildingType) {
    const cfg = getBuildingConfig(buildingType) || {};
    const cost = typeof formatUpgradeCost === 'function' ? formatUpgradeCost(cfg.cost || {}) : formatCost(cfg.cost || {});
    const maxHealth = typeof getEffectiveBuildingMaxHealth === 'function'
        ? getEffectiveBuildingMaxHealth(buildingType, getLocalPlayerId())
        : cfg.maxHealth;
    return [
        `<strong>${displayName(buildingType)}</strong>`,
        `HP: ${maxHealth || 0}`,
        cfg.buildTime ? `Build: ${cfg.buildTime}s with 1 villager` : '',
        cfg.buildTime ? `Workers: ${GAME_CONFIG.construction?.minWorkers || 1}-${GAME_CONFIG.construction?.maxWorkers || 4}` : '',
        `Cost: ${cost || 'Free'}`
    ].filter(Boolean).join('<br>');
}

function updateSelectionInfo() {
    const info = document.getElementById('selection-info');

    if (gameState.selectedBuilding) {
        const building = gameState.selectedBuilding;
        const maxHealth = building.maxHealth || (
            typeof getEffectiveBuildingMaxHealth === 'function'
                ? getEffectiveBuildingMaxHealth(building)
                : getBuildingConfig(building.type).maxHealth
        );
        const activeResearch = typeof getActiveResearchForBuilding === 'function'
            ? getActiveResearchForBuilding(building)
            : null;
        const researchLine = activeResearch && GAME_UPGRADES[activeResearch.id]
            ? `
                <div class="selection-stat">
                    <span>Research</span>
                    <strong>${GAME_UPGRADES[activeResearch.id].name} ${Math.floor(getResearchProgressPct(activeResearch))}%</strong>
                </div>
            `
            : '';
        const constructionLine = building.underConstruction
            ? `
                <div class="selection-stat">
                    <span>Construction</span>
                    <strong>${Math.floor(getConstructionProgressPct(building))}% / ${getConstructionWorkers(building).length}/${GAME_CONFIG.construction?.maxWorkers || 4} workers</strong>
                </div>
            `
            : '';
        info.innerHTML = `
            <div class="selected-entity-title">
                <strong>${displayName(building.type)}</strong>
                <span class="faction-tag">${getFactionName(building)}</span>
            </div>
            <div class="selection-stat-grid">
                <div class="selection-stat">
                    <span>Health</span>
                    <strong>${Math.ceil(building.health)}/${maxHealth}</strong>
                </div>
                <div class="selection-stat">
                    <span>Radial Position</span>
                    <strong>${getRadialMapPosition(building)}</strong>
                </div>
                ${constructionLine}
                ${researchLine}
            </div>
        `;
    } else if (gameState.selectedUnits.length === 0) {
        info.textContent = 'No units or buildings selected';
    } else if (gameState.selectedUnits.length === 1) {
        const unit = gameState.selectedUnits[0];
        const cfg = typeof getEffectiveUnitConfig === 'function'
            ? getEffectiveUnitConfig(unit)
            : GAME_CONFIG.units[unit.type];
        info.innerHTML = `
            <div class="selected-entity-title">
                <strong>${displayName(unit.type)}</strong>
                <span class="faction-tag">${getFactionName(unit)}</span>
            </div>
            <div class="selection-stat-grid">
                <div class="selection-stat">
                    <span>Health</span>
                    <strong>${Math.ceil(unit.health)}/${cfg.maxHealth}</strong>
                </div>
                <div class="selection-stat">
                    <span>Attack</span>
                    <strong>${formatNumber(cfg.attack || 0)} / ${formatNumber(cfg.attackRange || 0, 0)}</strong>
                </div>
                <div class="selection-stat">
                    <span>Radial Position</span>
                    <strong>${getRadialMapPosition(unit)}</strong>
                </div>
            </div>
        `;
        if (isTransport(unit)) {
            unit.cargo = unit.cargo || [];
            const cap = cfg.capacity || 0;
            const used = unit.cargo.length;
            const btns = document.createElement('div');
            btns.className = 'transport-actions';
            btns.innerHTML = `<div class="selection-stat"><span>Cargo</span><strong>${used}/${cap}</strong></div>`;

            if (used > 0) {
                const disembarkBtn = document.createElement('button');
                disembarkBtn.textContent = `Disembark ${used} unit(s)`;
                disembarkBtn.onclick = () => {
                    if (typeof Multiplayer !== 'undefined' && Multiplayer.isClient) {
                        Multiplayer.sendCommand({
                            action: 'DISEMBARK',
                            transportId: unit.id,
                            targetX: unit.x,
                            targetY: unit.y
                        });
                    } else {
                        disembarkCargoNearShore(unit);
                    }
                };
                btns.appendChild(disembarkBtn);
            }

            info.appendChild(btns);
        }
    } else {
        const groups = new Map();
        gameState.selectedUnits.forEach(unit => {
            const list = groups.get(unit.type) || [];
            list.push(unit);
            groups.set(unit.type, list);
        });
        info.innerHTML = `
            <div class="selected-entity-title">
                <strong>${gameState.selectedUnits.length} units selected</strong>
                <span class="faction-tag">formation</span>
            </div>
        `;
        const grid = document.createElement('div');
        grid.className = 'selection-unit-grid';
        groups.forEach((units, type) => {
            const card = document.createElement('button');
            card.type = 'button';
            card.className = 'selection-unit-card';
        card.innerHTML = `
                <img src="${getUnitPortraitSrc(type)}" alt="">
                <div>${displayName(type)}</div>
                <div>x${units.length}</div>
            `;
            card.addEventListener('click', () => subSelectUnitsByType(type));
            attachGameTooltip(card, () => getUnitTooltipHTML(type));
            const icon = card.querySelector('img');
            icon.onerror = () => icon.style.display = 'none';
            grid.appendChild(card);
        });
        info.appendChild(grid);
    }
}

function subSelectUnitsByType(type) {
    const nextSelection = gameState.selectedUnits.filter(unit => unit.type === type);
    if (nextSelection.length === 0) return;
    gameState.selectedUnits.forEach(unit => unit.isSelected = false);
    nextSelection.forEach(unit => unit.isSelected = true);
    gameState.selectedUnits = nextSelection;
    gameState.selectedBuilding = null;
    updateSelectionInfo();
    if (typeof SFX !== 'undefined') SFX.unitSelected();
}

function renderResearchActions(building, container) {
    if (!building || !container || typeof getUpgradesForBuilding !== 'function') return;
    const upgrades = getUpgradesForBuilding(building.type);
    if (upgrades.length === 0) return;

    const group = document.createElement('div');
    group.className = 'research-group';
    const heading = document.createElement('div');
    heading.className = 'research-heading';
    heading.textContent = 'Research';
    group.appendChild(heading);

    upgrades.forEach(([upgradeId, upgrade]) => {
        const owner = building.player || getLocalPlayerId();
        const status = getUpgradeStatus(upgradeId, building);
        const active = status.active || getActiveResearchForUpgrade(upgradeId, owner);
        const pct = active ? getResearchProgressPct(active) : 0;
        const card = document.createElement('button');
        card.type = 'button';
        card.className = `research-card ${status.state}`;
        card.dataset.upgradeId = upgradeId;
        card.disabled = status.state !== 'available';
            card.innerHTML = `
            <div class="research-name">
                <span>${upgrade.name}</span>
                <span>${typeof formatProductionSeconds === 'function' ? formatProductionSeconds(upgrade.time, 'research', owner) : upgrade.time}s</span>
            </div>
            <div class="research-desc">${upgrade.desc}</div>
            <div class="research-cost">${formatUpgradeCost(upgrade.cost)}</div>
            <div class="research-status">${status.label}</div>
            <div class="research-progress"><div class="research-fill" style="width: ${pct}%;"></div></div>
        `;
        card.addEventListener('click', () => startResearchUpgrade(upgradeId, building));
        attachGameTooltip(card, () => getUpgradeTooltipHTML(upgradeId, building));
        group.appendChild(card);
    });
    container.appendChild(group);
}

function updateResearchQueueUI() {
    const list = document.querySelector('#building-unit-list');
    const building = gameState.selectedBuilding;
    if (!list || !building || typeof getUpgradeStatus !== 'function') return;
    list.querySelectorAll('.research-card').forEach(card => {
        const upgradeId = card.dataset.upgradeId;
        const owner = building.player || getLocalPlayerId();
        const status = getUpgradeStatus(upgradeId, building);
        const active = status.active || getActiveResearchForUpgrade(upgradeId, owner);
        const fill = card.querySelector('.research-fill');
        const label = card.querySelector('.research-status');
        card.className = `research-card ${status.state}`;
        card.disabled = status.state !== 'available';
        if (label) label.textContent = status.label;
        if (fill) fill.style.width = `${active ? getResearchProgressPct(active) : 0}%`;
    });
}

function getUpgradeTooltipHTML(upgradeId, building = null) {
    const upgrade = GAME_UPGRADES[upgradeId];
    if (!upgrade) return '';
    const owner = building?.player || getLocalPlayerId();
    const status = getUpgradeStatus(upgradeId, building);
    return [
        `<strong>${upgrade.name}</strong>`,
        upgrade.desc,
        `Cost: ${formatUpgradeCost(upgrade.cost)}`,
        `Time: ${upgrade.time}s`,
        typeof formatProductionSeconds === 'function' ? `Current Time: ${formatProductionSeconds(upgrade.time, 'research', owner)}s` : '',
        `At: ${displayName(upgrade.researchedAt)}`,
        status.label
    ].filter(Boolean).join('<br>');
}

function renderTechTreeModal() {
    const root = document.getElementById('tech-tree-content');
    if (!root || typeof getUpgradeEntries !== 'function') return;
    const columns = [
        { key: 'dark', name: 'Dark Age' },
        { key: 'feudal', name: 'Feudal Age' },
        { key: 'castle', name: 'Castle Age' }
    ];
    root.innerHTML = '';
    columns.forEach(column => {
        const col = document.createElement('div');
        col.className = 'tech-age-column';
        col.innerHTML = `<div class="tech-age-title">${column.name}</div>`;
        if (column.key === 'dark') {
            const start = document.createElement('div');
            start.className = 'tech-upgrade-card researched';
            start.innerHTML = `
                <div class="tech-upgrade-title">Town Center</div>
                <div class="tech-upgrade-meta">Advance path and villagers</div>
            `;
            col.appendChild(start);
        }
        getUpgradeEntries()
            .filter(([, upgrade]) => normalizeAge(upgrade.requiredAge) === column.key)
            .forEach(([upgradeId, upgrade]) => {
                const status = getUpgradeStatus(upgradeId);
                const active = status.active || getActiveResearchForUpgrade(upgradeId, getLocalPlayerId());
                const card = document.createElement('div');
                card.className = `tech-upgrade-card ${status.state}`;
                card.innerHTML = `
                    <div class="tech-upgrade-title">${upgrade.name}</div>
                    <div class="tech-upgrade-meta">${upgrade.desc}</div>
                    <div class="tech-upgrade-meta">${displayName(upgrade.researchedAt)} - ${formatUpgradeCost(upgrade.cost)} - ${typeof formatProductionSeconds === 'function' ? formatProductionSeconds(upgrade.time, 'research', getLocalPlayerId()) : upgrade.time}s</div>
                    <div class="tech-upgrade-meta">${status.label}</div>
                    <div class="research-progress"><div class="research-fill" style="width: ${active ? getResearchProgressPct(active) : 0}%;"></div></div>
                `;
                col.appendChild(card);
            });
        root.appendChild(col);
    });
}

function setModalOpen(id, open) {
    const modal = document.getElementById(id);
    if (!modal) return false;
    modal.classList.toggle('open', open);
    modal.setAttribute('aria-hidden', open ? 'false' : 'true');
    gameState.ui.modalOpen = open ? id : (isMainMenuOpen() ? 'main-menu' : null);
    return true;
}

function toggleTechTreeModal(forceOpen = null) {
    renderTechTreeModal();
    const modal = document.getElementById('tech-tree-modal');
    const open = forceOpen === null ? !modal?.classList.contains('open') : forceOpen;
    setModalOpen('settings-modal', false);
    setModalOpen('mp-modal', false);
    return setModalOpen('tech-tree-modal', open);
}

function toggleSettingsModal(forceOpen = null) {
    const modal = document.getElementById('settings-modal');
    const open = forceOpen === null ? !modal?.classList.contains('open') : forceOpen;
    setModalOpen('tech-tree-modal', false);
    setModalOpen('mp-modal', false);
    return setModalOpen('settings-modal', open);
}

function toggleMultiplayerModal(forceOpen = null) {
    const modal = document.getElementById('mp-modal');
    const open = forceOpen === null ? !modal?.classList.contains('open') : forceOpen;
    setModalOpen('tech-tree-modal', false);
    setModalOpen('settings-modal', false);
    const didToggle = setModalOpen('mp-modal', open);
    syncMultiplayerStartButton();
    return didToggle;
}

function getDefaultMultiplayerSignalUrl() {
    return GAME_CONFIG.multiplayer?.signalUrl || 'ws://localhost:9000';
}

function createMultiplayerRoomCode() {
    return `MD-${Math.random().toString(36).slice(2, 7).toUpperCase()}`;
}

function normalizeMultiplayerRoomCode(value) {
    return String(value || '').trim().toUpperCase().replace(/[^A-Z0-9-]/g, '');
}

function getMultiplayerRoomCode(createIfMissing = false) {
    const input = document.getElementById('mp-room-input');
    if (!input) return '';
    let roomCode = normalizeMultiplayerRoomCode(input.value);
    if (!roomCode && createIfMissing) roomCode = createMultiplayerRoomCode();
    input.value = roomCode;
    syncMultiplayerRoomCode(roomCode);
    return roomCode;
}

function getMultiplayerSignalUrl() {
    const input = document.getElementById('mp-signal-input');
    if (!input) return getDefaultMultiplayerSignalUrl();
    const value = input.value.trim() || getDefaultMultiplayerSignalUrl();
    input.value = value;
    return value;
}

function syncMultiplayerRoomCode(roomCode = null) {
    const code = normalizeMultiplayerRoomCode(roomCode ?? document.getElementById('mp-room-input')?.value);
    const roomCodeEl = document.getElementById('mp-room-code');
    const copyBtn = document.getElementById('btn-mp-copy-code');
    if (roomCodeEl) roomCodeEl.textContent = code || 'MEDIEVAL';
    if (copyBtn) copyBtn.disabled = !code;
}

async function copyMultiplayerRoomCode() {
    const roomCode = getMultiplayerRoomCode(true);
    if (!roomCode) {
        setMultiplayerStatus('Create a room code first.', 'error');
        return;
    }

    const copyBtn = document.getElementById('btn-mp-copy-code');
    try {
        if (!navigator.clipboard?.writeText) throw new Error('Clipboard unavailable');
        await navigator.clipboard.writeText(roomCode);
        if (copyBtn) copyBtn.textContent = 'Copied';
        setMultiplayerStatus(`Room ${roomCode} copied.`, 'success');
    } catch (error) {
        const input = document.getElementById('mp-room-input');
        if (input) {
            input.focus();
            input.select();
        }
        setMultiplayerStatus('Room code selected.', 'neutral');
    } finally {
        if (copyBtn) setTimeout(() => { copyBtn.textContent = 'Copy'; }, 1200);
    }
}

function setMultiplayerStatus(message, tone = 'neutral') {
    const statusEl = document.getElementById('mp-status');
    if (statusEl) {
        statusEl.textContent = message;
        const colors = {
            neutral: 'var(--muted)',
            success: 'var(--green)',
            error: 'var(--red)'
        };
        statusEl.style.color = colors[tone] || colors.neutral;
    }
    syncMultiplayerStartButton();
}

function syncMultiplayerStartButton() {
    const startBtn = document.getElementById('btn-mp-start-game');
    if (!startBtn) return;

    const multiplayerReady = typeof Multiplayer !== 'undefined' && Multiplayer.isHost && Multiplayer.connected;
    const locked = !multiplayerReady || !!gameState.ui.gameLoading || !!gameState.ui.hasStarted;
    startBtn.disabled = locked;

    if (gameState.ui.gameLoading) {
        startBtn.textContent = 'Starting...';
    } else if (gameState.ui.hasStarted) {
        startBtn.textContent = 'Game Started';
    } else {
        startBtn.textContent = 'Start Game';
    }
}

function closeOpenModal() {
    const hadOpen = !!document.querySelector('.modal-overlay.open');
    setModalOpen('tech-tree-modal', false);
    setModalOpen('settings-modal', false);
    setModalOpen('mp-modal', false);
    return hadOpen;
}

function isMainMenuOpen() {
    return !!document.getElementById('main-menu')?.classList.contains('open');
}

function syncMainMenuButtons() {
    const startBtn = document.getElementById('btn-menu-start');
    if (startBtn) {
        if (gameState.ui.gameLoading) {
            startBtn.textContent = 'Generating World...';
            startBtn.disabled = true;
        } else {
            startBtn.textContent = gameState.ui.hasStarted ? 'Resume' : 'Play';
            startBtn.disabled = false;
        }
    }
    const menuBtn = document.getElementById('btn-main-menu');
    if (menuBtn) {
        menuBtn.textContent = isMainMenuOpen() ? 'Resume' : 'Menu';
    }
    document.querySelectorAll('input[name="enemy-count"]').forEach(input => {
        input.disabled = !!gameState.ui.hasStarted || !!gameState.ui.gameLoading;
    });
    syncMultiplayerStartButton();
}

function getSelectedEnemyCount() {
    const selected = document.querySelector('input[name="enemy-count"]:checked');
    const fallback = gameState.ui.selectedEnemyCount || GAME_CONFIG.world.enemyCount || 2;
    const value = Number.parseInt(selected?.value || String(fallback), 10);
    return Math.max(1, Math.min(4, Number.isFinite(value) ? value : 2));
}

function updateEnemyCountLabel() {
    const count = getSelectedEnemyCount();
    gameState.ui.selectedEnemyCount = count;
    GAME_CONFIG.world.enemyCount = count;
    const label = document.getElementById('enemy-count-label');
    if (label) label.textContent = `${count} ${count === 1 ? 'Enemy' : 'Enemies'}`;
}

async function beginGameFromMenu() {
    if (gameState.ui.hasStarted) {
        toggleMainMenu(false);
        toggleMultiplayerModal(false);
        return true;
    }
    if (gameState.ui.gameLoading) return false;

    gameState.ui.gameLoading = true;
    const enemyCount = getSelectedEnemyCount();
    gameState.ui.selectedEnemyCount = enemyCount;
    GAME_CONFIG.world.enemyCount = enemyCount;
    GAME_CONFIG.world.numPlayers = enemyCount + 1;
    updateEnemyCountLabel();
    syncMainMenuButtons();

    try {
        const initResult = initGame();
        if (initResult && typeof initResult.then === 'function') {
            await initResult;
        }
        toggleMainMenu(false);
        toggleMultiplayerModal(false);

        // In multiplayer, host broadcasts initial state to all clients
        if (typeof Multiplayer !== 'undefined' && Multiplayer.isHost && Multiplayer.connected) {
            // Small delay to ensure all initial state is settled
            setTimeout(() => Multiplayer.broadcastGameStart(), 500);
        }
        return true;
    } catch (error) {
        console.error(error);
        showNotification('World generation failed. Check the console for details.');
        return false;
    } finally {
        gameState.ui.gameLoading = false;
        syncMainMenuButtons();
    }
}

function toggleMainMenu(forceOpen = null) {
    const menu = document.getElementById('main-menu');
    if (!menu) return false;
    const open = forceOpen === null ? !menu.classList.contains('open') : forceOpen;
    if (open) {
        closeOpenModal();
    }
    menu.classList.toggle('open', open);
    menu.setAttribute('aria-hidden', open ? 'false' : 'true');
    document.body.classList.toggle('menu-open', open);
    gameState.ui.modalOpen = open ? 'main-menu' : null;
    if (!open) {
        const firstLaunch = !gameState.ui.hasStarted;
        gameState.ui.hasStarted = true;
        if (firstLaunch) {
            showNotification('Battle launched. Secure the circular frontier and eliminate every rival command.');
        }
    }
    syncMainMenuButtons();
    return true;
}

function updateGameTimerUI() {
    const timer = document.getElementById('game-timer');
    if (!timer) return;
    const totalSeconds = Math.floor((gameState.gameTime || 0) / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    const text = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
    if (timer.textContent !== text) timer.textContent = text;
}

function scanIdleVillagers() {
    gameState.ui.idleVillagers = getUnitsForPlayer(getLocalPlayerId()).filter(unit =>
        unit.type === 'villager' &&
        unit.state === 'idle' &&
        unit.health > 0
    );
    if (gameState.ui.idleVillagerIndex >= gameState.ui.idleVillagers.length) {
        gameState.ui.idleVillagerIndex = -1;
    }
}

function updateIdleVillagerUI() {
    const count = document.getElementById('idle-villager-count');
    if (count) count.textContent = gameState.ui.idleVillagers.length;
}

function updateTimedUI(deltaTime) {
    updateGameTimerUI();
    gameState.ui.secondTick = (gameState.ui.secondTick || 0) + deltaTime;
    if (gameState.ui.secondTick >= 1000) {
        gameState.ui.secondTick = 0;
        scanIdleVillagers();
        updateIdleVillagerUI();
    }
}

function centerCameraOn(x, y) {
    const zoom = gameState.zoomLevel || 1;
    gameState.camera.x = x - (GAME_CONFIG.canvas.width / zoom) / 2;
    gameState.camera.y = y - (GAME_CONFIG.canvas.height / zoom) / 2;
    if (typeof clampCameraToBounds === 'function') clampCameraToBounds();
}

function selectNextIdleVillager() {
    scanIdleVillagers();
    const idle = gameState.ui.idleVillagers;
    updateIdleVillagerUI();
    if (idle.length === 0) {
        showNotification('No idle villagers found.');
        return false;
    }
    gameState.ui.idleVillagerIndex = (gameState.ui.idleVillagerIndex + 1) % idle.length;
    const villager = idle[gameState.ui.idleVillagerIndex];
    gameState.selectedUnits.forEach(unit => unit.isSelected = false);
    getAllBuildings().forEach(building => building.isSelected = false);
    gameState.selectedUnits = [villager];
    villager.isSelected = true;
    gameState.selectedBuilding = null;
    document.getElementById('building-actions').style.display = 'none';
    document.getElementById('general-units').style.display = 'block';
    centerCameraOn(villager.x, villager.y);
    updateSelectionInfo();
    if (typeof SFX !== 'undefined') SFX.unitSelected();
    return true;
}

function attachGameTooltip(element, contentProvider) {
    if (!element || element.dataset.tooltipBound === 'true') return;
    element.dataset.tooltipBound = 'true';
    const tooltip = document.getElementById('game-tooltip');
    if (!tooltip) return;

    const move = (event) => {
        const pad = 14;
        const width = tooltip.offsetWidth || 220;
        const height = tooltip.offsetHeight || 80;
        let x = event.clientX + pad;
        let y = event.clientY + pad;
        if (x + width > window.innerWidth - 8) x = event.clientX - width - pad;
        if (y + height > window.innerHeight - 8) y = event.clientY - height - pad;
        tooltip.style.left = `${Math.max(8, x)}px`;
        tooltip.style.top = `${Math.max(8, y)}px`;
    };
    element.addEventListener('mouseenter', event => {
        tooltip.innerHTML = typeof contentProvider === 'function' ? contentProvider() : contentProvider;
        tooltip.style.display = 'block';
        move(event);
    });
    element.addEventListener('mousemove', move);
    element.addEventListener('mouseleave', () => {
        tooltip.style.display = 'none';
    });
}

function setupStaticTooltips() {
    document.querySelectorAll('.building-list .building').forEach(el => {
        attachGameTooltip(el, () => getBuildingTooltipHTML(el.dataset.type));
    });
    const ageBtn = document.getElementById('btn-age-up');
    attachGameTooltip(ageBtn, () => '<strong>Age Advancement</strong><br>Unlocks stronger units and technologies.');
}

function setupUiControls() {
    if (gameState.ui.controlsReady) return;
    gameState.ui.controlsReady = true;

    const idleBtn = document.getElementById('btn-idle-villager');
    if (idleBtn) idleBtn.addEventListener('click', selectNextIdleVillager);
    const mainMenuBtn = document.getElementById('btn-main-menu');
    if (mainMenuBtn) mainMenuBtn.addEventListener('click', () => toggleMainMenu());
    const menuStartBtn = document.getElementById('btn-menu-start');
    if (menuStartBtn) menuStartBtn.addEventListener('click', beginGameFromMenu);
    document.querySelectorAll('input[name="enemy-count"]').forEach(input => {
        input.addEventListener('change', updateEnemyCountLabel);
    });
    const menuSettingsBtn = document.getElementById('btn-menu-settings');
    if (menuSettingsBtn) menuSettingsBtn.addEventListener('click', () => toggleSettingsModal(true));
    const techBtn = document.getElementById('btn-tech-tree');
    if (techBtn) techBtn.addEventListener('click', () => toggleTechTreeModal());
    const settingsBtn = document.getElementById('btn-settings');
    if (settingsBtn) settingsBtn.addEventListener('click', () => toggleSettingsModal());
    const techClose = document.getElementById('tech-tree-close');
    if (techClose) techClose.addEventListener('click', () => toggleTechTreeModal(false));
    const settingsClose = document.getElementById('settings-close');
    if (settingsClose) settingsClose.addEventListener('click', () => toggleSettingsModal(false));

    document.querySelectorAll('.modal-overlay').forEach(modal => {
        modal.addEventListener('mousedown', event => {
            if (event.target === modal) closeOpenModal();
        });
    });

    const edgeToggle = document.getElementById('setting-edge-scrolling');
    if (edgeToggle) {
        edgeToggle.checked = !!gameState.settings.edgeScrolling;
        edgeToggle.addEventListener('change', () => {
            gameState.settings.edgeScrolling = edgeToggle.checked;
        });
    }

    setupStaticTooltips();
    renderTechTreeModal();
    scanIdleVillagers();
    updateIdleVillagerUI();
    updateGameTimerUI();
    updateEnemyCountLabel();
    syncMainMenuButtons();

    // ─── Multiplayer UI Controls ────────────────────
    const mpBtn = document.getElementById('btn-menu-mp');
    if (mpBtn) {
        mpBtn.addEventListener('click', () => {
            const signalInput = document.getElementById('mp-signal-input');
            if (signalInput && !signalInput.value.trim()) signalInput.value = getDefaultMultiplayerSignalUrl();
            getMultiplayerRoomCode(true);
            syncMultiplayerRoomCode();
            setMultiplayerStatus('');
            toggleMultiplayerModal(true);
        });
    }

    const mpClose = document.getElementById('mp-close');
    if (mpClose) {
        mpClose.addEventListener('click', () => toggleMultiplayerModal(false));
    }

    const mpRoomInput = document.getElementById('mp-room-input');
    if (mpRoomInput) {
        mpRoomInput.addEventListener('input', () => syncMultiplayerRoomCode());
        mpRoomInput.addEventListener('blur', () => getMultiplayerRoomCode(false));
    }

    const mpCopyBtn = document.getElementById('btn-mp-copy-code');
    if (mpCopyBtn) {
        mpCopyBtn.addEventListener('click', copyMultiplayerRoomCode);
        syncMultiplayerRoomCode();
    }

    const mpHostBtn = document.getElementById('btn-mp-host');
    if (mpHostBtn) {
        mpHostBtn.addEventListener('click', async () => {
            const roomCode = getMultiplayerRoomCode(true);
            const signalUrl = getMultiplayerSignalUrl();
            const hostInfo = document.getElementById('mp-host-info');
            const roomCodeEl = document.getElementById('mp-room-code');
            if (roomCodeEl) roomCodeEl.textContent = roomCode;
            if (hostInfo) hostInfo.style.display = 'none';
            setMultiplayerStatus('Opening room...');
            mpHostBtn.disabled = true;
            try {
                await Multiplayer.connect({ signalUrl, roomId: roomCode, mode: 'host' });
                if (hostInfo) hostInfo.style.display = 'block';
                setMultiplayerStatus('Room ready. Waiting for friend...', 'success');
            } catch (e) {
                setMultiplayerStatus(e?.message || 'Could not open the room.', 'error');
            } finally {
                mpHostBtn.disabled = false;
                syncMultiplayerStartButton();
            }
        });
    }

    const mpJoinBtn = document.getElementById('btn-mp-join');
    if (mpJoinBtn) {
        mpJoinBtn.addEventListener('click', async () => {
            const roomCode = getMultiplayerRoomCode(false);
            const signalUrl = getMultiplayerSignalUrl();
            if (!roomCode) {
                setMultiplayerStatus('Enter a room code.', 'error');
                return;
            }
            setMultiplayerStatus('Joining room...');
            mpJoinBtn.disabled = true;
            try {
                await Multiplayer.connect({ signalUrl, roomId: roomCode, mode: 'client' });
                setMultiplayerStatus('Connected. Waiting for host to start the game...', 'success');
            } catch (e) {
                setMultiplayerStatus(e?.message || 'Connection failed.', 'error');
            } finally {
                mpJoinBtn.disabled = false;
                syncMultiplayerStartButton();
            }
        });
    }

    const mpStartBtn = document.getElementById('btn-mp-start-game');
    if (mpStartBtn) {
        mpStartBtn.addEventListener('click', async () => {
            syncMultiplayerStartButton();
            if (mpStartBtn.disabled) return;
            setMultiplayerStatus('Starting multiplayer match...');
            const started = await beginGameFromMenu();
            if (!started) setMultiplayerStatus('Could not start the match.', 'error');
        });
    }

    window.addEventListener('multiplayer-status', event => {
        const { message, tone } = event.detail || {};
        if (message) setMultiplayerStatus(message, tone);
        syncMultiplayerStartButton();
    });
}

function advanceAge() {
    if (typeof Multiplayer !== 'undefined' && Multiplayer.isClient) {
        Multiplayer.sendCommand({ action: 'AGE_UP' });
        showNotification('Age advancement requested.');
        return;
    }

    const owner = getLocalPlayerId();
    advanceAgeForPlayer(owner);
}

function advanceAgeForPlayer(owner = getLocalPlayerId()) {
    const resources = getResourcesForPlayer(owner);
    const currentAge = getAgeForPlayer(owner);

    if (currentAge === 'Dark Age') {
        if (resources.food < 500) {
            showNotification('Not enough Food (need 500)!');
            return false;
        }
        resources.food -= 500;
        setAgeForPlayer(owner, 'Feudal Age');
        showNotification('Advanced to Feudal Age! Axemen, Crossbowmen and Feudal technologies unlocked.');
    } else if (currentAge === 'Feudal Age') {
        if (resources.food < 800 || resources.gold < 200) {
            showNotification('Not enough resources (need 800 Food, 200 Gold)!');
            return false;
        }
        resources.food -= 800;
        resources.gold -= 200;
        setAgeForPlayer(owner, 'Castle Age');
        showNotification('Advanced to Castle Age! Siege weapons and Castle technologies unlocked.');
    } else if (currentAge === 'Castle Age') {
        if (resources.food < 1000 || resources.gold < 800) {
            showNotification('Not enough resources (need 1000 Food, 800 Gold)!');
            return false;
        }
        resources.food -= 1000;
        resources.gold -= 800;
        setAgeForPlayer(owner, 'Imperial Age');
        showNotification('Advanced to Imperial Age!');
    } else {
        return false;
    }

    syncAgeUiForLocalPlayer();
    if (gameState.selectedBuilding) showBuildingActions(gameState.selectedBuilding);
    renderTechTreeModal();
    return true;
}

function syncAgeUiForLocalPlayer() {
    const age = getAgeForPlayer(getLocalPlayerId());
    const ageDisplay = document.getElementById('age-display');
    const ageButton = document.getElementById('btn-age-up');
    if (ageDisplay) ageDisplay.textContent = age;
    if (!ageButton) return;
    if (age === 'Dark Age') {
        ageButton.disabled = false;
        ageButton.textContent = 'Advance to Feudal Age (500 Food)';
    } else if (age === 'Feudal Age') {
        ageButton.disabled = false;
        ageButton.textContent = 'Advance to Castle Age (800 Food, 200 Gold)';
    } else if (age === 'Castle Age') {
        ageButton.disabled = false;
        ageButton.textContent = 'Advance to Imperial Age (1000 Food, 800 Gold)';
    } else {
        ageButton.disabled = true;
        ageButton.textContent = 'Max Age Reached';
    }
}

function checkWinConditions() {
    const owner = typeof getLocalPlayerId === 'function' ? getLocalPlayerId() : 'player';
    const allBuildings = typeof getAllBuildings === 'function'
        ? getAllBuildings()
        : [...gameState.buildings, ...gameState.enemyBuildings];
    const enemyTownCenters = allBuildings.filter(b =>
        b.type === 'town-center' &&
        b.health > 0 &&
        (typeof areHostile !== 'function' || areHostile(owner, b))
    );
    if (enemyTownCenters.length === 0) {
        endGame(true, 'Victory! Every rival command has fallen.');
        return;
    }
    const playerTownCenters = (typeof getBuildingsForPlayer === 'function' ? getBuildingsForPlayer(owner) : gameState.buildings).filter(b =>
        b.type === 'town-center' && b.health > 0
    );
    if (playerTownCenters.length === 0) {
        endGame(false, 'Defeat! Your empire has fallen!');
    }
}

function endGame(victory, message) {
    gameState.gameOver = true;
    const gameOverDiv = document.getElementById('gameOver');
    const gameOverText = document.getElementById('gameOverText');
    const gameOverSubtext = document.getElementById('gameOverSubtext');
    gameOverText.textContent = victory ? 'Victory!' : 'Defeat!';
    gameOverText.style.color = victory ? '#4CAF50' : '#F44336';
    gameOverSubtext.textContent = message;
    gameOverDiv.style.display = 'flex';
}

function showNotification(message) {
    const notification = document.getElementById('notification');
    notification.textContent = message;
    notification.style.display = 'block';
    setTimeout(() => {
        notification.style.display = 'none';
    }, 3000);
}

// Removed legacy PNG sprite-sheet debug/preload; units load via AssetManager GIFs.

function centerOnTownCenter() {
    const townCenter = getBuildingsForPlayer(getLocalPlayerId()).find(b => b.type === 'town-center');
    if (townCenter) {
        centerCameraOn(townCenter.x + townCenter.width / 2, townCenter.y + townCenter.height / 2);
    }
}

// Initialize the game when the page loads
document.addEventListener('DOMContentLoaded', function() {
    console.log('dw loaded, awaiting game setup...');
    setupUiControls();
});
