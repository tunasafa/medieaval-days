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

function setResourceCounter(resource, value) {
    const el = document.getElementById(`${resource}-count`);
    if (!el) return;
    const next = Math.floor(value);
    const prev = gameState.ui.resourceValues[resource];
    el.textContent = next;
    if (prev !== undefined && next > prev) {
        el.classList.remove('bounce-text');
        void el.offsetWidth;
        el.classList.add('bounce-text');
    }
    gameState.ui.resourceValues[resource] = next;
}

function updateUI() {
    setResourceCounter('food', gameState.resources.food);
    setResourceCounter('wood', gameState.resources.wood);
    setResourceCounter('stone', gameState.resources.stone);
    setResourceCounter('gold', gameState.resources.gold);
    document.getElementById('population').textContent = `${gameState.population.current}/${gameState.population.max}`;
    document.getElementById('enemy-units').textContent = gameState.enemyUnits.length;
    document.getElementById('enemy-buildings').textContent = gameState.enemyBuildings.length;
}

function updateTrainingQueueUI() {
    const b = gameState.selectedBuilding;
    if (!b) return;
    const current = (b.trainingQueue || [])[0] || null;
    const list = document.querySelector('#building-unit-list');
    if (!list) return;
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
    const cfg = typeof getEffectiveUnitConfig === 'function' ? getEffectiveUnitConfig(unitType) : base;
    const cost = typeof formatUpgradeCost === 'function' ? formatUpgradeCost(base.cost || {}) : formatCost(base.cost || {});
    const parts = [
        `<strong>${displayName(unitType)}</strong>`,
        `HP: ${base.maxHealth || base.health || 0}`,
        `Attack: ${formatNumber(cfg.attack || 0)}`,
        `Range: ${formatNumber(cfg.attackRange || 0, 0)}`,
        `Speed: ${formatNumber(cfg.speed || 0, 2)}`,
        `Cost: ${cost || 'Free'}`
    ];
    if (unitType === 'villager') parts.splice(5, 0, `Carry: ${getUnitCarryCapacity(unitType)}`);
    if (base.capacity) parts.splice(5, 0, `Capacity: ${base.capacity}`);
    return parts.join('<br>');
}

function getBuildingTooltipHTML(buildingType) {
    const cfg = getBuildingConfig(buildingType) || {};
    const cost = typeof formatUpgradeCost === 'function' ? formatUpgradeCost(cfg.cost || {}) : formatCost(cfg.cost || {});
    const maxHealth = typeof getEffectiveBuildingMaxHealth === 'function'
        ? getEffectiveBuildingMaxHealth(buildingType, 'player')
        : cfg.maxHealth;
    return [
        `<strong>${displayName(buildingType)}</strong>`,
        `HP: ${maxHealth || 0}`,
        `Cost: ${cost || 'Free'}`
    ].join('<br>');
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
            ? `<div>Research: ${GAME_UPGRADES[activeResearch.id].name} ${Math.floor(getResearchProgressPct(activeResearch))}%</div>`
            : '';
        info.innerHTML = `
            <div><strong>${displayName(building.type)}</strong></div>
            <div>Health: ${Math.ceil(building.health)}/${maxHealth}</div>
            <div>Player: ${building.player}</div>
            ${researchLine}
        `;
    } else if (gameState.selectedUnits.length === 0) {
        info.textContent = 'No units or buildings selected';
    } else if (gameState.selectedUnits.length === 1) {
        const unit = gameState.selectedUnits[0];
        const cfg = typeof getEffectiveUnitConfig === 'function'
            ? getEffectiveUnitConfig(unit)
            : GAME_CONFIG.units[unit.type];
        info.innerHTML = `
            <div><strong>${displayName(unit.type)}</strong></div>
            <div>Health: ${Math.ceil(unit.health)}/${cfg.maxHealth}</div>
            <div>Attack: ${formatNumber(cfg.attack || 0)} / Range: ${formatNumber(cfg.attackRange || 0, 0)}</div>
            <div>State: ${unit.state}</div>
        `;
        if (isTransport(unit)) {
            unit.cargo = unit.cargo || [];
            const cap = cfg.capacity || 0;
            const used = unit.cargo.length;
            const btns = document.createElement('div');
            btns.style.marginTop = '6px';
            btns.innerHTML = `<div>Cargo: ${used}/${cap}</div>`;

            if (used > 0) {
                const disembarkBtn = document.createElement('button');
                disembarkBtn.textContent = `Disembark ${used} unit(s)`;
                disembarkBtn.style.marginTop = '4px';
                disembarkBtn.onclick = () => disembarkCargoNearShore(unit);
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
        info.innerHTML = `<div><strong>${gameState.selectedUnits.length} units selected</strong></div>`;
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
        const status = getUpgradeStatus(upgradeId, building);
        const active = status.active || getActiveResearchForUpgrade(upgradeId);
        const pct = active ? getResearchProgressPct(active) : 0;
        const card = document.createElement('button');
        card.type = 'button';
        card.className = `research-card ${status.state}`;
        card.dataset.upgradeId = upgradeId;
        card.disabled = status.state !== 'available';
        card.innerHTML = `
            <div class="research-name">
                <span>${upgrade.name}</span>
                <span>${upgrade.time}s</span>
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
        const status = getUpgradeStatus(upgradeId, building);
        const active = status.active || getActiveResearchForUpgrade(upgradeId);
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
    const status = getUpgradeStatus(upgradeId, building);
    return [
        `<strong>${upgrade.name}</strong>`,
        upgrade.desc,
        `Cost: ${formatUpgradeCost(upgrade.cost)}`,
        `Time: ${upgrade.time}s`,
        `At: ${displayName(upgrade.researchedAt)}`,
        status.label
    ].join('<br>');
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
                const active = status.active || getActiveResearchForUpgrade(upgradeId);
                const card = document.createElement('div');
                card.className = `tech-upgrade-card ${status.state}`;
                card.innerHTML = `
                    <div class="tech-upgrade-title">${upgrade.name}</div>
                    <div class="tech-upgrade-meta">${upgrade.desc}</div>
                    <div class="tech-upgrade-meta">${displayName(upgrade.researchedAt)} - ${formatUpgradeCost(upgrade.cost)}</div>
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
    gameState.ui.modalOpen = open ? id : null;
    return true;
}

function toggleTechTreeModal(forceOpen = null) {
    renderTechTreeModal();
    const modal = document.getElementById('tech-tree-modal');
    const open = forceOpen === null ? !modal?.classList.contains('open') : forceOpen;
    setModalOpen('settings-modal', false);
    return setModalOpen('tech-tree-modal', open);
}

function toggleSettingsModal(forceOpen = null) {
    const modal = document.getElementById('settings-modal');
    const open = forceOpen === null ? !modal?.classList.contains('open') : forceOpen;
    setModalOpen('tech-tree-modal', false);
    return setModalOpen('settings-modal', open);
}

function closeOpenModal() {
    const hadOpen = !!document.querySelector('.modal-overlay.open');
    setModalOpen('tech-tree-modal', false);
    setModalOpen('settings-modal', false);
    return hadOpen;
}

function updateGameTimerUI() {
    const timer = document.getElementById('game-timer');
    if (!timer) return;
    const totalSeconds = Math.floor((gameState.gameTime || 0) / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    timer.textContent = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

function scanIdleVillagers() {
    gameState.ui.idleVillagers = gameState.units.filter(unit =>
        unit.player === 'player' &&
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
    gameState.buildings.forEach(building => building.isSelected = false);
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
}

function advanceAge() {
    if (gameState.currentAge === 'Dark Age') {
        if (gameState.resources.food >= 500) {
            gameState.resources.food -= 500;
            gameState.currentAge = 'Feudal Age';
            document.getElementById('age-display').textContent = gameState.currentAge;
            showNotification('Advanced to Feudal Age! Axemen, Crossbowmen and Feudal technologies unlocked.');
            document.getElementById('btn-age-up').textContent = 'Advance to Castle Age (800 Food, 200 Gold)';

            if (gameState.selectedBuilding) showBuildingActions(gameState.selectedBuilding);
            renderTechTreeModal();
        } else {
            showNotification('Not enough Food (need 500)!');
        }
    } else if (gameState.currentAge === 'Feudal Age') {
        if (gameState.resources.food >= 800 && gameState.resources.gold >= 200) {
            gameState.resources.food -= 800;
            gameState.resources.gold -= 200;
            gameState.currentAge = 'Castle Age';
            document.getElementById('age-display').textContent = gameState.currentAge;
            showNotification('Advanced to Castle Age! Siege weapons and Castle technologies unlocked.');
            document.getElementById('btn-age-up').textContent = 'Advance to Imperial Age (1000 Food, 800 Gold)';

            if (gameState.selectedBuilding) showBuildingActions(gameState.selectedBuilding);
            renderTechTreeModal();
        } else {
            showNotification('Not enough resources (need 800 Food, 200 Gold)!');
        }
    } else if (gameState.currentAge === 'Castle Age') {
        if (gameState.resources.food >= 1000 && gameState.resources.gold >= 800) {
            gameState.resources.food -= 1000;
            gameState.resources.gold -= 800;
            gameState.currentAge = 'Imperial Age';
            document.getElementById('age-display').textContent = gameState.currentAge;
            showNotification('Advanced to Imperial Age!');
            document.getElementById('btn-age-up').disabled = true;
            document.getElementById('btn-age-up').textContent = 'Max Age Reached';
            if (gameState.selectedBuilding) showBuildingActions(gameState.selectedBuilding);
            renderTechTreeModal();
        } else {
            showNotification('Not enough resources (need 1000 Food, 800 Gold)!');
        }
    }
}

function checkWinConditions() {
    const enemyTownCenters = gameState.enemyBuildings.filter(b =>
        b.type === 'town-center' && b.health > 0
    );
    if (enemyTownCenters.length === 0) {
        endGame(true, 'Victory! You have destroyed the enemy!');
        return;
    }
    const playerTownCenters = gameState.buildings.filter(b =>
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
    const townCenter = gameState.buildings.find(b => b.type === 'town-center' && b.player === 'player');
    if (townCenter) {
        centerCameraOn(townCenter.x + townCenter.width / 2, townCenter.y + townCenter.height / 2);
    }
}

// Initialize the game when the page loads
document.addEventListener('DOMContentLoaded', function() {
    console.log('dw loaded, initializing game...');
    const initResult = initGame();
    if (initResult && typeof initResult.then === 'function') {
        initResult.then(setupUiControls).catch(error => {
            console.error(error);
            setupUiControls();
        });
    } else {
        setupUiControls();
    }
});
