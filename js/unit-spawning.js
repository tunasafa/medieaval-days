/**
 * Handles unit spawning, training queues, and population management.
 * This file is responsible for creating new units and managing the training process.
 */

function updateTrainingQueue(deltaTime) {
    // Process training per building: one unit at a time per building
    const allPlayerBuildings = gameState.buildings.filter(b => b.player === 'player');
    for (const b of allPlayerBuildings) {
        if (!b.trainingQueue || b.trainingQueue.length === 0) continue;
        const t = b.trainingQueue[0];
        t.timeRemaining -= deltaTime;
        if (t.timeRemaining <= 0) {
            spawnUnit(t.type, b);
            b.trainingQueue.shift();
        }
    }
}

function computeSideMinClearance(building, unitType, side) {
    const unitSize = 24;
    const minProbeDepth = Math.ceil(unitSize * 1.5);
    const stepAlong = 8;
    const stepOut = 4;
    let minClear = Infinity;
    const dummyUnit = { type: unitType };

    if (side === 'top' || side === 'bottom') {
        const yEdge = side === 'top' ? building.y : (building.y + building.height);
        const outSign = side === 'top' ? -1 : 1;
        for (let x = building.x + 4; x <= building.x + building.width - 4; x += stepAlong) {
            let depth = 0;
            while (depth <= minProbeDepth) {
                const px = x;
                const py = yEdge + outSign * (1 + depth);
                if (px < 0 || py < 0 || px >= GAME_CONFIG.world.width || py >= GAME_CONFIG.world.height) break;
                if (!validateTerrainMovement(dummyUnit, px, py)) break;
                depth += stepOut;
            }
            minClear = Math.min(minClear, depth);
        }
    } else {
        const xEdge = side === 'left' ? building.x : (building.x + building.width);
        const outSign = side === 'left' ? -1 : 1;
        for (let y = building.y + 4; y <= building.y + building.height - 4; y += stepAlong) {
            let depth = 0;
            while (depth <= minProbeDepth) {
                const px = xEdge + outSign * (1 + depth);
                const py = y;
                if (px < 0 || py < 0 || px >= GAME_CONFIG.world.width || py >= GAME_CONFIG.world.height) break;
                if (!validateTerrainMovement(dummyUnit, px, py)) break;
                depth += stepOut;
            }
            minClear = Math.min(minClear, depth);
        }
    }
    if (!isFinite(minClear)) return 0;
    return minClear;
}

function getAllowedSpawnSides(building, unitType) {
    const unitSize = 24;
    const minRequired = Math.ceil(unitSize * 1.5);
    const sides = ['top','right','bottom','left'];
    const allowed = [];
    for (const s of sides) {
        const clear = computeSideMinClearance(building, unitType, s);
        if (clear >= minRequired) allowed.push(s);
    }
    return allowed;
}

function isValidSpawnPosition(x, y, unitType, buildingCenter) {
    const worldW = GAME_CONFIG.world.width;
    const worldH = GAME_CONFIG.world.height;
    const edgeMargin = 8;
    if (x < edgeMargin || y < edgeMargin || x > worldW - edgeMargin || y > worldH - edgeMargin) return false;

    const isVessel = !!GAME_CONFIG.units[unitType]?.vessel;
    const inWater = typeof isPointInWater === 'function' ? isPointInWater(x, y) : false;
    const onBridge = typeof isPointOnBridge === 'function' ? isPointOnBridge(x, y) : false;
    if (isVessel) {
        if (!inWater) return false;
    } else {
        if (inWater && !onBridge) return false;
    }

    for (const b of [...gameState.buildings, ...gameState.enemyBuildings]) {
        if (isPointInRoundedRectangle(x, y, b, 17)) return false;
    }

    if (isPositionOccupied(x, y, null, 15)) return false;

    const dummyUnit = { type: unitType };
    if (!validateTerrainMovement(dummyUnit, x, y)) return false;

    const steps = [
        [6, 0], [-6, 0], [0, 6], [0, -6], [4, 4], [-4, 4], [4, -4], [-4, -4]
    ];
    let canMove = false;
    for (const [dx, dy] of steps) {
        const nx = x + dx, ny = y + dy;
        if (nx < edgeMargin || ny < edgeMargin || nx > worldW - edgeMargin || ny > worldH - edgeMargin) continue;
        if (validateTerrainMovement(dummyUnit, nx, ny)) { canMove = true; break; }
    }
    if (!canMove) return false;

    if (buildingCenter) {
        const vx = x - buildingCenter.x, vy = y - buildingCenter.y;
        const m = Math.hypot(vx, vy) || 1;
        const ox = x + (vx / m) * 6, oy = y + (vy / m) * 6;
        if (ox >= edgeMargin && oy >= edgeMargin && ox <= worldW - edgeMargin && oy <= worldH - edgeMargin) {
            if (!validateTerrainMovement(dummyUnit, ox, oy)) return false;
        }
    }
    return true;
}

function findSpawnPointNearBuilding(building, unitType) {
    const center = { x: building.x + building.width / 2, y: building.y + building.height / 2 };
    const sides = ['top', 'right', 'bottom', 'left'];
    const byClear = sides.map(s => ({ side: s, clear: computeSideMinClearance(building, unitType, s) }))
                        .sort((a, b) => b.clear - a.clear)
                        .map(e => e.side);
    const stepAlong = 8;
    const pad = 6;
    const offsets = [18, 26, 34, 42, 50, 60, 72, 84, 96];

    for (const off of offsets) {
        for (const side of byClear) {
            if (side === 'top' || side === 'bottom') {
                const y = side === 'top' ? (building.y - off) : (building.y + building.height + off);
                const x1 = building.x + pad, x2 = building.x + building.width - pad;
                for (let x = x1; x <= x2; x += stepAlong) {
                    if (isValidSpawnPosition(x, y, unitType, center)) return { x, y };
                }
            } else {
                const x = side === 'left' ? (building.x - off) : (building.x + building.width + off);
                const y1 = building.y + pad, y2 = building.y + building.height - pad;
                for (let y = y1; y <= y2; y += stepAlong) {
                    if (isValidSpawnPosition(x, y, unitType, center)) return { x, y };
                }
            }
        }
        const corners = [
            { x: building.x - off, y: building.y - off },
            { x: building.x + building.width + off, y: building.y - off },
            { x: building.x - off, y: building.y + building.height + off },
            { x: building.x + building.width + off, y: building.y + building.height + off },
        ];
        for (const c of corners) { if (isValidSpawnPosition(c.x, c.y, unitType, center)) return c; }
    }

    const maxR = Math.max(GAME_CONFIG.world.width, GAME_CONFIG.world.height) * 0.25;
    for (let r = 24; r <= maxR; r += 16) {
        const steps = 24;
        for (let i = 0; i < steps; i++) {
            const theta = (i / steps) * Math.PI * 2;
            const x = center.x + Math.cos(theta) * r;
            const y = center.y + Math.sin(theta) * r;
            if (isValidSpawnPosition(x, y, unitType, center)) return { x, y };
        }
    }
    return null;
}

function spawnUnit(type, spawnAnchor) {
    if (gameState.population.current >= gameState.population.max) {
        showNotification('Cannot complete training: population limit reached!');
        return;
    }

    let spawnBuilding = spawnAnchor || gameState.selectedBuilding;
    if (!spawnBuilding || (spawnBuilding.player && spawnBuilding.player !== 'player')) {
        const capable = {
            villager: ['town-center'],
            militia: ['barracks'], warrior: ['barracks'], axeman: ['barracks'],
            archer: ['archeryRange'], crossbowman: ['archeryRange'],
            ballista: ['craftery'], catapult: ['craftery'],
            fishingBoat: ['navy'], transportLarge: ['navy'], warship: ['navy']
        };
        const types = capable[type] || [];
        const b = gameState.buildings.find(b => b.player === 'player' && types.includes(b.type));
        spawnBuilding = b || gameState.buildings.find(b => b.type === 'town-center' && b.player === 'player');
    }
    if (!spawnBuilding) return;

    const centerX = spawnBuilding.x + spawnBuilding.width / 2;
    const centerY = spawnBuilding.y + spawnBuilding.height / 2;
    const ringRadius = Math.max(spawnBuilding.width, spawnBuilding.height) / 2 + 18;
    let position = findSpawnPointNearBuilding(spawnBuilding, type);

    if (!position) {
        const extra = Math.ceil(24 * 1.5);
        const fx = centerX;
        const fy = centerY + ringRadius + extra;
        const free = getAvailablePosition(fx, fy, 15);
        const ok = isValidSpawnPosition(free.x, free.y, type, { x: centerX, y: centerY });
        position = ok ? { x: free.x, y: free.y } : { x: centerX, y: centerY + ringRadius + extra };
    }

    gameState.units.push({
        id: generateId(),
        type,
        player: 'player',
        x: position.x,
        y: position.y,
        health: GAME_CONFIG.units[type].maxHealth,
        state: 'idle',
        target: null,
        isSelected: false,
        anim: type === 'villager' ? {
            action: 'idle',
            direction: 'down',
            frame: 0,
            elapsed: 0
        } : undefined,
        prevX: position.x,
        prevY: position.y
    });
    gameState.population.current++;
    showNotification(`${type} training complete!`);
}

function trainUnit(type, producingBuilding = null) {
    const ageRestrictions = {
    'axeman': ['Feudal Age', 'Castle Age', 'Imperial Age'],
        'catapult': ['Castle Age', 'Imperial Age'],
        'ballista': ['Castle Age', 'Imperial Age'],
        'crossbowman': ['Feudal Age', 'Castle Age', 'Imperial Age']
    };

    if (ageRestrictions[type] && !ageRestrictions[type].includes(gameState.currentAge)) {
        showNotification(`Cannot train ${type} in ${gameState.currentAge}!`);
        return;
    }

    const unitConfig = GAME_CONFIG.units[type];
    if (!canAfford(unitConfig.cost)) {
        showNotification(`Not enough resources!`);
        return;
    }
    if (gameState.population.current >= gameState.population.max) {
        showNotification('Population limit reached. Build more houses.');
        return;
    }
    deductResources(unitConfig.cost);
    const b = producingBuilding || gameState.selectedBuilding;
    if (!b) {
        showNotification('Select a building to train from.');
        return;
    }
    b.trainingQueue = b.trainingQueue || [];
    b.trainingQueue.push({
        type,
        timeRemaining: unitConfig.buildTime * 1000,
        totalTime: unitConfig.buildTime * 1000
    });
    const qLen = b.trainingQueue.length;
    showNotification(`Queued ${type} at ${b.type} (${qLen} in line)`);
}

function trainUnitFromBuilding(type, building) {
    if (!building || building.health <= 0) {
        showNotification('Building is not available!');
        return;
    }
    trainUnit(type, building);
}

// Expose functions to global scope for testing
window.createUnit = function(type, x, y, player) {
    gameState.units.push({
        id: generateId(),
        type,
        player,
        x,
        y,
        health: GAME_CONFIG.units[type].maxHealth,
        state: 'idle',
        target: null,
        isSelected: false,
        anim: {
            action: 'idle',
            direction: 'down',
            frame: 0,
            elapsed: 0
        },
        prevX: x,
        prevY: y
    });
};
