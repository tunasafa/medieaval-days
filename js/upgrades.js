const UPGRADE_AGE_ORDER = ['dark', 'feudal', 'castle', 'imperial'];

const GAME_UPGRADES = {
    iron_weapons: {
        name: 'Iron Weapons',
        desc: 'Infantry and Cavalry deal +2 damage.',
        cost: { food: 100, gold: 50 },
        time: 30,
        researchedAt: 'blacksmith',
        requiredAge: 'feudal',
        effect: (state) => {
            state.modifiers.meleeAttack += 2;
        }
    },
    fletching: {
        name: 'Fletching',
        desc: 'Archers gain +1 damage and +1 range.',
        cost: { food: 100, wood: 50 },
        time: 25,
        researchedAt: 'blacksmith',
        requiredAge: 'feudal',
        effect: (state) => {
            state.modifiers.rangedAttack += 1;
            state.modifiers.rangedRange += 1;
        }
    },
    wheelbarrow: {
        name: 'Wheelbarrow',
        desc: 'Villagers move 15% faster and carry +5 resources.',
        cost: { food: 175, wood: 50 },
        time: 40,
        researchedAt: 'town_center',
        requiredAge: 'feudal',
        effect: (state) => {
            state.modifiers.villagerSpeed += 0.15;
            state.modifiers.villagerCarry += 5;
        }
    },
    masonry: {
        name: 'Masonry',
        desc: 'All buildings have +20% HP.',
        cost: { wood: 150, stone: 150 },
        time: 50,
        researchedAt: 'university',
        requiredAge: 'castle',
        effect: (state) => {
            state.modifiers.buildingHpMult += 0.2;
            if (typeof state.refreshBuildingMaxHealths === 'function') {
                state.refreshBuildingMaxHealths();
            } else if (typeof refreshPlayerBuildingMaxHealths === 'function') {
                refreshPlayerBuildingMaxHealths(state.owner || 'player');
            }
        }
    },
    chemistry: {
        name: 'Chemistry',
        desc: 'Unlocks Fire Arrows. Archers deal +3 damage.',
        cost: { food: 200, gold: 200 },
        time: 60,
        researchedAt: 'university',
        requiredAge: 'castle',
        effect: (state) => {
            state.modifiers.rangedAttack += 3;
            state.modifiers.projectileFire = true;
        }
    },
    ballistics: {
        name: 'Ballistics',
        desc: 'Projectiles travel 40% faster and track better.',
        cost: { wood: 200, gold: 100 },
        time: 50,
        researchedAt: 'university',
        requiredAge: 'castle',
        effect: (state) => {
            state.modifiers.projectileSpeedMult += 0.4;
        }
    }
};

const UPGRADE_DEFAULT_MODIFIERS = {
    meleeAttack: 0,
    rangedAttack: 0,
    rangedRange: 0,
    villagerSpeed: 0,
    villagerCarry: 0,
    buildingHpMult: 0,
    projectileSpeedMult: 0,
    trainingSpeedMult: 0,
    researchSpeedMult: 0,
    projectileFire: false
};

const UPGRADE_MELEE_TYPES = new Set(['militia', 'warrior', 'axeman']);
const UPGRADE_RANGED_TYPES = new Set(['archer', 'crossbowman']);
const UPGRADE_RANGED_RANGE_STEP = 32;
const DEFAULT_CARRY_CAPACITY = 25;

function normalizeUpgradeState(upgrades) {
    const state = upgrades && typeof upgrades === 'object' ? upgrades : {};
    state.researched = Array.isArray(state.researched) ? state.researched : [];
    state.activeResearch = Array.isArray(state.activeResearch) ? state.activeResearch : [];
    return state;
}

function normalizeUpgradeModifiers(modifiers) {
    const state = modifiers && typeof modifiers === 'object' ? modifiers : {};
    Object.entries(UPGRADE_DEFAULT_MODIFIERS).forEach(([key, value]) => {
        if (typeof value === 'number') {
            if (typeof state[key] !== 'number') state[key] = value;
        } else if (typeof state[key] !== typeof value) {
            state[key] = value;
        }
    });
    return state;
}

function ensureUpgradeState(owner = 'player') {
    const resolvedOwner = owner === 'player2' ? 'player2' : 'player';
    if (resolvedOwner === 'player2') {
        gameState.p2Upgrades = normalizeUpgradeState(gameState.p2Upgrades);
        gameState.p2Modifiers = normalizeUpgradeModifiers(gameState.p2Modifiers);
        return { upgrades: gameState.p2Upgrades, modifiers: gameState.p2Modifiers, owner: 'player2' };
    }

    gameState.upgrades = normalizeUpgradeState(gameState.upgrades);
    gameState.modifiers = normalizeUpgradeModifiers(gameState.modifiers);
    return { upgrades: gameState.upgrades, modifiers: gameState.modifiers, owner: 'player' };
}

function getUpgradeStateForPlayer(owner = getLocalPlayerId()) {
    return ensureUpgradeState(owner);
}

function getModifiersForPlayer(owner = getLocalPlayerId()) {
    return getUpgradeStateForPlayer(owner).modifiers;
}

function normalizeAge(age) {
    return String(age || 'dark')
        .toLowerCase()
        .replace(/\s+age$/, '')
        .replace(/\s+/g, '_');
}

function normalizeResearchBuildingType(type) {
    return String(type || '').replace(/_/g, '-');
}

function formatEntityName(type) {
    return String(type || '')
        .replace(/([a-z])([A-Z])/g, '$1 $2')
        .replace(/[-_]/g, ' ')
        .replace(/\b\w/g, char => char.toUpperCase());
}

function isAgeAtLeast(currentAge, requiredAge) {
    const currentIndex = UPGRADE_AGE_ORDER.indexOf(normalizeAge(currentAge));
    const requiredIndex = UPGRADE_AGE_ORDER.indexOf(normalizeAge(requiredAge));
    if (requiredIndex < 0) return true;
    return currentIndex >= requiredIndex;
}

function formatUpgradeCost(cost) {
    return Object.entries(cost || {})
        .map(([resource, amount]) => `${amount}${resource.charAt(0).toUpperCase()}`)
        .join(', ');
}

function getUpgradeEntries() {
    return Object.entries(GAME_UPGRADES);
}

function getUpgradesForBuilding(buildingType) {
    const normalized = normalizeResearchBuildingType(buildingType);
    return getUpgradeEntries().filter(([, upgrade]) => (
        normalizeResearchBuildingType(upgrade.researchedAt) === normalized
    ));
}

function isUpgradeResearched(upgradeId, owner = getLocalPlayerId()) {
    const state = ensureUpgradeState(owner);
    return state.upgrades.researched.includes(upgradeId);
}

function getActiveResearchForUpgrade(upgradeId, owner = getLocalPlayerId()) {
    const state = ensureUpgradeState(owner);
    return state.upgrades.activeResearch.find(research => research.id === upgradeId) || null;
}

function getActiveResearchForBuilding(building) {
    if (!building) return null;
    const state = ensureUpgradeState(building.player || 'player');
    return state.upgrades.activeResearch.find(research => research.buildingId === building.id) || null;
}

function getUpgradeStatus(upgradeId, building = null) {
    const owner = building?.player || getLocalPlayerId();
    const upgrade = GAME_UPGRADES[upgradeId];
    if (!upgrade) return { state: 'missing', label: 'Missing' };
    if (isUpgradeResearched(upgradeId, owner)) return { state: 'researched', label: 'Researched' };
    const active = getActiveResearchForUpgrade(upgradeId, owner);
    if (active) return { state: 'researching', label: 'Researching', active };
    if (!isAgeAtLeast(getAgeForPlayer(owner), upgrade.requiredAge)) {
        return { state: 'locked', label: `Requires ${formatEntityName(upgrade.requiredAge)} Age` };
    }
    if (building) {
        if (building.underConstruction) {
            return { state: 'locked', label: 'Under Construction' };
        }
        const expected = normalizeResearchBuildingType(upgrade.researchedAt);
        if (normalizeResearchBuildingType(building.type) !== expected) {
            return { state: 'locked', label: `Needs ${formatEntityName(expected)}` };
        }
        if (getActiveResearchForBuilding(building)) {
            return { state: 'busy', label: 'Building Busy' };
        }
    }
    if (!canAfford(upgrade.cost, owner)) {
            return { state: 'unaffordable', label: `Need ${formatUpgradeCost(upgrade.cost)}` };
    }
    return { state: 'available', label: 'Research' };
}

function startResearchUpgrade(upgradeId, building) {
    const upgrade = GAME_UPGRADES[upgradeId];
    if (!upgrade || !building || (typeof isHumanFaction === 'function' && !isHumanFaction(building))) return false;
    if (typeof Multiplayer !== 'undefined' && Multiplayer.isClient) {
        if (typeof isLocalPlayerEntity === 'function' && !isLocalPlayerEntity(building)) return false;
        Multiplayer.sendCommand({
            action: 'RESEARCH',
            buildingId: building.id,
            upgradeId
        });
        showNotification(`Researching ${upgrade.name}.`);
        return true;
    }

    const owner = building.player || 'player';
    const state = ensureUpgradeState(owner);
    const status = getUpgradeStatus(upgradeId, building);
    if (status.state !== 'available') {
        showNotification(status.label);
        return false;
    }
    deductResources(upgrade.cost, owner);
    const researchTime = typeof getProductionTimeMs === 'function'
        ? getProductionTimeMs(upgrade.time, 'research', owner)
        : upgrade.time * 1000;
    building.activeResearchId = upgradeId;
    state.upgrades.activeResearch.push({
        id: upgradeId,
        buildingId: building.id,
        owner,
        timeRemaining: researchTime,
        totalTime: researchTime
    });
    showNotification(`Researching ${upgrade.name}`);
    if (typeof showBuildingActions === 'function' && gameState.selectedBuilding === building) {
        showBuildingActions(building);
    }
    if (typeof renderTechTreeModal === 'function') renderTechTreeModal();
    return true;
}

function completeResearch(research, owner = research?.owner || 'player') {
    const upgrade = GAME_UPGRADES[research.id];
    const state = ensureUpgradeState(owner);
    if (!upgrade || isUpgradeResearched(research.id, owner)) return;
    state.upgrades.researched.push(research.id);
    const effectState = {
        ...gameState,
        owner,
        modifiers: state.modifiers,
        refreshBuildingMaxHealths: () => refreshPlayerBuildingMaxHealths(owner)
    };
    upgrade.effect(effectState);
    const building = typeof findBuildingById === 'function'
        ? findBuildingById(research.buildingId)
        : null;
    if (building && building.activeResearchId === research.id) {
        building.activeResearchId = null;
    }
    showNotification(`${upgrade.name} researched!`);
    if (typeof showBuildingActions === 'function' && gameState.selectedBuilding) {
        showBuildingActions(gameState.selectedBuilding);
    }
    if (typeof updateSelectionInfo === 'function') updateSelectionInfo();
    if (typeof renderTechTreeModal === 'function') renderTechTreeModal();
}

function updateResearchQueues(deltaTime) {
    const owners = typeof HUMAN_FACTIONS !== 'undefined' ? HUMAN_FACTIONS : ['player'];
    owners.forEach(owner => {
        const state = ensureUpgradeState(owner);
        for (let index = state.upgrades.activeResearch.length - 1; index >= 0; index--) {
            const research = state.upgrades.activeResearch[index];
            const building = typeof findBuildingById === 'function'
                ? findBuildingById(research.buildingId)
                : null;
            if (!building || building.health <= 0 || building.player !== owner) {
                state.upgrades.activeResearch.splice(index, 1);
                continue;
            }
            research.timeRemaining -= deltaTime;
            if (research.timeRemaining <= 0) {
                state.upgrades.activeResearch.splice(index, 1);
                completeResearch(research, owner);
            }
        }
    });
}

function getResearchProgressPct(research) {
    if (!research || !research.totalTime) return 0;
    return Math.max(0, Math.min(100, (1 - (research.timeRemaining / research.totalTime)) * 100));
}

function getCurrentAgeIndex(owner = getLocalPlayerId()) {
    const index = UPGRADE_AGE_ORDER.indexOf(normalizeAge(getAgeForPlayer(owner)));
    return Math.max(0, index);
}

function getDevelopmentSpeedMultiplier(kind = 'unit', owner = getLocalPlayerId()) {
    const state = ensureUpgradeState(owner);
    const ageBonus = getCurrentAgeIndex(owner) * 0.08;
    const researchedCount = state.upgrades.researched.length;
    const researchBonus = Math.min(0.18, researchedCount * (kind === 'research' ? 0.035 : 0.025));
    const modifierBonus = kind === 'research'
        ? state.modifiers.researchSpeedMult
        : state.modifiers.trainingSpeedMult;
    return Math.max(1, 1 + ageBonus + researchBonus + (modifierBonus || 0));
}

function getProductionTimeMs(baseSeconds, kind = 'unit', owner = getLocalPlayerId()) {
    const baseMs = Math.max(0, (Number(baseSeconds) || 0) * 1000);
    if (baseMs === 0) return 0;
    return Math.max(1000, Math.round(baseMs / getDevelopmentSpeedMultiplier(kind, owner)));
}

function formatProductionSeconds(baseSeconds, kind = 'unit', owner = getLocalPlayerId()) {
    return Math.ceil(getProductionTimeMs(baseSeconds, kind, owner) / 1000);
}

function getEffectiveUnitConfig(unitOrType) {
    const type = typeof unitOrType === 'string' ? unitOrType : unitOrType?.type;
    const base = GAME_CONFIG.units[type];
    if (!base) return {};
    const owner = typeof unitOrType === 'string' ? getLocalPlayerId() : unitOrType?.player;
    if (owner && typeof isHumanFaction === 'function' && !isHumanFaction(owner)) return base;
    const state = ensureUpgradeState(owner);
    const config = { ...base };
    if (UPGRADE_MELEE_TYPES.has(type)) {
        config.attack = (config.attack || 0) + state.modifiers.meleeAttack;
    }
    if (UPGRADE_RANGED_TYPES.has(type)) {
        config.attack = (config.attack || 0) + state.modifiers.rangedAttack;
        config.attackRange = (config.attackRange || 0) + state.modifiers.rangedRange * UPGRADE_RANGED_RANGE_STEP;
    }
    if (type === 'villager') {
        config.speed = (config.speed || 0) * (1 + state.modifiers.villagerSpeed);
        config.carryCapacity = DEFAULT_CARRY_CAPACITY + state.modifiers.villagerCarry;
    }
    return config;
}

function getUnitAttack(unitOrType) {
    return getEffectiveUnitConfig(unitOrType).attack || 0;
}

function getUnitAttackRange(unitOrType) {
    return getEffectiveUnitConfig(unitOrType).attackRange || 0;
}

function getUnitSpeed(unitOrType) {
    return getEffectiveUnitConfig(unitOrType).speed || 0;
}

function getUnitCarryCapacity(unitOrType) {
    const type = typeof unitOrType === 'string' ? unitOrType : unitOrType?.type;
    const config = getEffectiveUnitConfig(unitOrType);
    if (type === 'villager') return config.carryCapacity || DEFAULT_CARRY_CAPACITY;
    return DEFAULT_CARRY_CAPACITY;
}

function getEffectiveBuildingMaxHealth(buildingOrType, owner = 'player') {
    const type = typeof buildingOrType === 'string' ? buildingOrType : buildingOrType?.type;
    const buildingOwner = typeof buildingOrType === 'string' ? owner : buildingOrType?.player;
    const base = getBuildingConfig(type);
    if (!base) return 0;
    if (buildingOwner && typeof isHumanFaction === 'function' && !isHumanFaction(buildingOwner)) return base.maxHealth;
    const state = ensureUpgradeState(buildingOwner || owner);
    return Math.round(base.maxHealth * (1 + state.modifiers.buildingHpMult));
}

function refreshPlayerBuildingMaxHealths(owner = 'player') {
    ensureUpgradeState(owner);
    const buildings = typeof getBuildingsForPlayer === 'function'
        ? getBuildingsForPlayer(owner)
        : (gameState.buildings || []).filter(building => building.player === owner);
    buildings.forEach(building => {
        const previousMax = building.maxHealth || getBuildingConfig(building.type)?.maxHealth || 0;
        const nextMax = getEffectiveBuildingMaxHealth(building);
        if (!nextMax || nextMax === previousMax) return;
        building.maxHealth = nextMax;
        building.health = Math.min(nextMax, Math.round(building.health + Math.max(0, nextMax - previousMax)));
    });
}
