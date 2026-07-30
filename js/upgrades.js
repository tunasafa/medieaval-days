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
            refreshPlayerBuildingMaxHealths();
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

function ensureUpgradeState() {
    gameState.upgrades = gameState.upgrades || {};
    gameState.upgrades.researched = Array.isArray(gameState.upgrades.researched) ? gameState.upgrades.researched : [];
    gameState.upgrades.activeResearch = Array.isArray(gameState.upgrades.activeResearch) ? gameState.upgrades.activeResearch : [];
    gameState.modifiers = gameState.modifiers || {};
    Object.entries(UPGRADE_DEFAULT_MODIFIERS).forEach(([key, value]) => {
        if (typeof value === 'number') {
            if (typeof gameState.modifiers[key] !== 'number') gameState.modifiers[key] = value;
        } else if (typeof gameState.modifiers[key] !== typeof value) {
            gameState.modifiers[key] = value;
        }
    });
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

function isUpgradeResearched(upgradeId) {
    ensureUpgradeState();
    return gameState.upgrades.researched.includes(upgradeId);
}

function getActiveResearchForUpgrade(upgradeId) {
    ensureUpgradeState();
    return gameState.upgrades.activeResearch.find(research => research.id === upgradeId) || null;
}

function getActiveResearchForBuilding(building) {
    if (!building) return null;
    ensureUpgradeState();
    return gameState.upgrades.activeResearch.find(research => research.buildingId === building.id) || null;
}

function getUpgradeStatus(upgradeId, building = null) {
    ensureUpgradeState();
    const upgrade = GAME_UPGRADES[upgradeId];
    if (!upgrade) return { state: 'missing', label: 'Missing' };
    if (isUpgradeResearched(upgradeId)) return { state: 'researched', label: 'Researched' };
    const active = getActiveResearchForUpgrade(upgradeId);
    if (active) return { state: 'researching', label: 'Researching', active };
    if (!isAgeAtLeast(gameState.currentAge, upgrade.requiredAge)) {
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
    if (!canAfford(upgrade.cost)) {
            return { state: 'unaffordable', label: `Need ${formatUpgradeCost(upgrade.cost)}` };
    }
    return { state: 'available', label: 'Research' };
}

function startResearchUpgrade(upgradeId, building) {
    ensureUpgradeState();
    const upgrade = GAME_UPGRADES[upgradeId];
    if (!upgrade || !building || building.player !== 'player') return false;
    const status = getUpgradeStatus(upgradeId, building);
    if (status.state !== 'available') {
        showNotification(status.label);
        return false;
    }
    deductResources(upgrade.cost);
    const researchTime = typeof getProductionTimeMs === 'function'
        ? getProductionTimeMs(upgrade.time, 'research')
        : upgrade.time * 1000;
    building.activeResearchId = upgradeId;
    gameState.upgrades.activeResearch.push({
        id: upgradeId,
        buildingId: building.id,
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

function completeResearch(research) {
    const upgrade = GAME_UPGRADES[research.id];
    if (!upgrade || isUpgradeResearched(research.id)) return;
    gameState.upgrades.researched.push(research.id);
    upgrade.effect(gameState);
    const building = gameState.buildings.find(b => b.id === research.buildingId);
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
    ensureUpgradeState();
    for (let index = gameState.upgrades.activeResearch.length - 1; index >= 0; index--) {
        const research = gameState.upgrades.activeResearch[index];
        const building = gameState.buildings.find(b => b.id === research.buildingId);
        if (!building || building.health <= 0) {
            gameState.upgrades.activeResearch.splice(index, 1);
            continue;
        }
        research.timeRemaining -= deltaTime;
        if (research.timeRemaining <= 0) {
            gameState.upgrades.activeResearch.splice(index, 1);
            completeResearch(research);
        }
    }
}

function getResearchProgressPct(research) {
    if (!research || !research.totalTime) return 0;
    return Math.max(0, Math.min(100, (1 - (research.timeRemaining / research.totalTime)) * 100));
}

function getCurrentAgeIndex() {
    const index = UPGRADE_AGE_ORDER.indexOf(normalizeAge(gameState.currentAge));
    return Math.max(0, index);
}

function getDevelopmentSpeedMultiplier(kind = 'unit') {
    ensureUpgradeState();
    const ageBonus = getCurrentAgeIndex() * 0.08;
    const researchedCount = gameState.upgrades.researched.length;
    const researchBonus = Math.min(0.18, researchedCount * (kind === 'research' ? 0.035 : 0.025));
    const modifierBonus = kind === 'research'
        ? gameState.modifiers.researchSpeedMult
        : gameState.modifiers.trainingSpeedMult;
    return Math.max(1, 1 + ageBonus + researchBonus + (modifierBonus || 0));
}

function getProductionTimeMs(baseSeconds, kind = 'unit') {
    const baseMs = Math.max(0, (Number(baseSeconds) || 0) * 1000);
    if (baseMs === 0) return 0;
    return Math.max(1000, Math.round(baseMs / getDevelopmentSpeedMultiplier(kind)));
}

function formatProductionSeconds(baseSeconds, kind = 'unit') {
    return Math.ceil(getProductionTimeMs(baseSeconds, kind) / 1000);
}

function getEffectiveUnitConfig(unitOrType) {
    const type = typeof unitOrType === 'string' ? unitOrType : unitOrType?.type;
    const base = GAME_CONFIG.units[type];
    if (!base) return {};
    const owner = typeof unitOrType === 'string' ? 'player' : unitOrType?.player;
    if (owner && owner !== 'player') return base;
    ensureUpgradeState();
    const config = { ...base };
    if (UPGRADE_MELEE_TYPES.has(type)) {
        config.attack = (config.attack || 0) + gameState.modifiers.meleeAttack;
    }
    if (UPGRADE_RANGED_TYPES.has(type)) {
        config.attack = (config.attack || 0) + gameState.modifiers.rangedAttack;
        config.attackRange = (config.attackRange || 0) + gameState.modifiers.rangedRange * UPGRADE_RANGED_RANGE_STEP;
    }
    if (type === 'villager') {
        config.speed = (config.speed || 0) * (1 + gameState.modifiers.villagerSpeed);
        config.carryCapacity = DEFAULT_CARRY_CAPACITY + gameState.modifiers.villagerCarry;
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
    if (buildingOwner && buildingOwner !== 'player') return base.maxHealth;
    ensureUpgradeState();
    return Math.round(base.maxHealth * (1 + gameState.modifiers.buildingHpMult));
}

function refreshPlayerBuildingMaxHealths() {
    ensureUpgradeState();
    gameState.buildings.forEach(building => {
        if (building.player !== 'player') return;
        const previousMax = building.maxHealth || getBuildingConfig(building.type)?.maxHealth || 0;
        const nextMax = getEffectiveBuildingMaxHealth(building);
        if (!nextMax || nextMax === previousMax) return;
        building.maxHealth = nextMax;
        building.health = Math.min(nextMax, Math.round(building.health + Math.max(0, nextMax - previousMax)));
    });
}
