// AI Functions
function getCombatCenter(entity) {
    return {
        x: entity.x + (entity.width ? entity.width / 2 : 0),
        y: entity.y + (entity.height ? entity.height / 2 : 0)
    };
}

function getCombatDistance(a, b) {
    const ac = getCombatCenter(a);
    const bc = getCombatCenter(b);
    return Math.hypot(ac.x - bc.x, ac.y - bc.y);
}

function findNearestHostileUnit(source, maxDistance = Infinity) {
    let nearest = null;
    let bestDistance = maxDistance;
    const groups = [gameState.units, gameState.enemyUnits];
    for (const group of groups) {
        for (const unit of group) {
            if (unit === source || unit.state === 'embarked' || !areHostile(source, unit)) continue;
            const distance = getCombatDistance(source, unit);
            if (distance < bestDistance) {
                bestDistance = distance;
                nearest = unit;
            }
        }
    }
    return nearest;
}

function findNearestHostileBuilding(source, maxDistance = Infinity, type = null) {
    let nearest = null;
    let bestDistance = maxDistance;
    const groups = [gameState.buildings, gameState.enemyBuildings];
    for (const group of groups) {
        for (const building of group) {
            if (!areHostile(source, building) || (type && building.type !== type)) continue;
            const distance = getCombatDistance(source, building);
            if (distance < bestDistance) {
                bestDistance = distance;
                nearest = building;
            }
        }
    }
    return nearest;
}

function assignAttackTarget(unit, target) {
    unit.state = 'attacking';
    unit.target = target;
    unit.targetPoint = target && target.width && target.height
        ? getCombatCenter(target)
        : undefined;
    unit.attackPath = null;
    unit.attackPathTimer = -Math.random() * 700;
    unit.attackPathFailed = false;
    unit.attackPathFailCount = 0;
    unit.attackPathRetryDelay = 0;
}

function selectWaveTarget(enemyTC) {
    return findNearestHostileBuilding(enemyTC, Infinity, 'town-center') ||
        findNearestHostileBuilding(enemyTC);
}

function createEnemyBase() {
    const enemyTCs = gameState.enemyBuildings.filter(b => b.type === 'town-center');

    enemyTCs.forEach(enemyTC => {
        // Spawn requested idle defenders around the enemy Town Center
        const centerX = enemyTC.x + enemyTC.width / 2;
        const centerY = enemyTC.y + enemyTC.height / 2;
        const mapCX = GAME_CONFIG.world.width / 2;
        const mapCY = GAME_CONFIG.world.height / 2;
        const baseR = Math.max(enemyTC.width, enemyTC.height) / 2 + 30; // just outside TC bounds
        const dirToCenter = Math.atan2(mapCY - centerY, mapCX - centerX);

    const composition = [
        { type: 'axeman', count: 2 },
        { type: 'crossbowman', count: 2 },
        { type: 'warrior', count: 3 },
        { type: 'archer', count: 4 }
    ];

    const total = composition.reduce((s, c) => s + c.count, 0);
    let placed = 0;
    const unitBodySize = 24; // pixels; one unit body
    const minSeparation = unitBodySize; // keep at least one body apart
    composition.forEach(entry => {
        for (let i = 0; i < entry.count; i++) {
            let spawn = null;
            for (let tries = 0; tries < 36; tries++) {
                // Evenly spread around a wider ring with mild jitter
                const baseAng = (placed / Math.max(1, total)) * Math.PI * 2;
                const jitter = (Math.random() - 0.5) * (Math.PI / 3);
                const ang = baseAng + jitter;
                // Wider radial ring
                const r = baseR + 60 + Math.random() * 160;
                const px = centerX + Math.cos(ang) * r;
                const py = centerY + Math.sin(ang) * r;
                // World bounds
                if (px < 8 || py < 8 || px > GAME_CONFIG.world.width - 8 || py > GAME_CONFIG.world.height - 8) continue;
                // Not inside/too near the TC
                const margin = 16;
                const rx = enemyTC.x - margin;
                const ry = enemyTC.y - margin;
                const rw = enemyTC.width + margin * 2;
                const rh = enemyTC.height + margin * 2;
                if (px >= rx && px <= rx + rw && py >= ry && py <= ry + rh) continue;
                // Avoid water
                if (typeof isPointInWater === 'function' && isPointInWater(px, py)) continue;
                // Avoid collisions with buildings/units
                if (typeof isPositionOccupied === 'function' && isPositionOccupied(px, py, { type: entry.type }, 15)) continue;
                // Reject spots the unit could stand on but never path out of.
                if (typeof isSpawnPathable === 'function' && !isSpawnPathable(px, py, entry.type)) continue;
                // Keep distance from already-placed enemy idle units (at least one body apart)
                let tooClose = false;
                for (const u of gameState.enemyUnits) {
                    const dx = px - u.x;
                    const dy = py - u.y;
                    if (Math.hypot(dx, dy) < minSeparation) { tooClose = true; break; }
                }
                if (tooClose) continue;
                spawn = { x: px, y: py };
                break;
            }
            if (!spawn) {
                continue;
            }
            const cfg = GAME_CONFIG.units[entry.type] || { maxHealth: 50 };
            gameState.enemyUnits.push({
                id: generateId(),
                type: entry.type,
                player: enemyTC.player,
                faction: enemyTC.player,
                factionName: getFactionName(enemyTC),
                factionColor: getFactionColor(enemyTC),
                x: spawn.x,
                y: spawn.y,
                health: cfg.maxHealth,
                state: 'idle',
                target: null,
                // Initialize animation state for correct idle rendering immediately
                anim: { action: 'idle', direction: 'northwest', frame: 0, elapsed: 0 },
                _faceDir: 'northwest',
                _lastFaceNatural: 'northwest',
                prevX: spawn.x,
                prevY: spawn.y
            });
            placed++;
        }
    });
});
}

function updateEnemyAI(unit, deltaTime = 16) {
    unit.aiThinkElapsed = (unit.aiThinkElapsed || 0) + deltaTime;
    const thinkInterval = unit.aiThinkInterval || (260 + Math.floor(Math.random() * 180));
    if (unit.aiThinkElapsed < thinkInterval) return;
    unit.aiThinkElapsed = 0;
    unit.aiThinkInterval = thinkInterval;

    if (unit.state === 'idle' || unit.state === 'patrol') {
        let nearbyTarget = findNearestHostileUnit(unit, 240);
        if (!nearbyTarget) {
            nearbyTarget = findNearestHostileBuilding(unit, 440);
        }
        if (nearbyTarget) {
            assignAttackTarget(unit, nearbyTarget);
        } else if (unit.state === 'patrol') {
            if (!unit.targetX || getDistance(unit, unit.patrolCenter) > unit.patrolRadius) {
                const angle = Math.random() * Math.PI * 2;
                const px = unit.patrolCenter.x + Math.cos(angle) * (unit.patrolRadius * 0.5);
                const py = unit.patrolCenter.y + Math.sin(angle) * (unit.patrolRadius * 0.5);
                // Use pathfinding so enemy units respect terrain (water, no-go zones, buildings)
                const clamped = clampTargetToAllowed(unit, px, py);
                setUnitDestination(unit, clamped.x, clamped.y);
            }
        }
    }
}

// AI Wave Manager
const AIManager = (function() {
    let timeSinceLastWave = 0;
    let waveCount = 0;
    const waveInterval = 60000; // 60 seconds per wave

    function tick(deltaTime) {
        if (!gameState.enemyBuildings || gameState.enemyBuildings.length === 0) return; // Enemy defeated

        timeSinceLastWave += deltaTime;
        if (timeSinceLastWave >= waveInterval) {
            timeSinceLastWave = 0;
            waveCount++;
            launchWave();
        }
    }

    function findWaveSpawn(enemyTC, unitType, index, total) {
        const centerX = enemyTC.x + enemyTC.width / 2;
        const centerY = enemyTC.y + enemyTC.height / 2;
        const baseRadius = Math.max(enemyTC.width, enemyTC.height) / 2 + 44;
        const dummyUnit = { type: unitType, player: enemyTC.player };

        for (let tries = 0; tries < 64; tries++) {
            const angle = ((index + tries / 64) / Math.max(1, total)) * Math.PI * 2 + (Math.random() - 0.5) * 0.75;
            const radius = baseRadius + 35 + Math.random() * 170;
            const px = centerX + Math.cos(angle) * radius;
            const py = centerY + Math.sin(angle) * radius;

            if (px < 8 || py < 8 || px > GAME_CONFIG.world.width - 8 || py > GAME_CONFIG.world.height - 8) continue;
            if (isPointInRoundedRectangle(px, py, enemyTC, 18)) continue;
            if (typeof validateTerrainMovement === 'function' && !validateTerrainMovement(dummyUnit, px, py)) continue;
            if (typeof isPositionOccupied === 'function' && isPositionOccupied(px, py, dummyUnit, 18)) continue;
            // Same trap as player spawns: a legal-but-unpathable cell produces a
            // wave unit that stands next to its town center and never attacks.
            if (typeof isSpawnPathable === 'function' && !isSpawnPathable(px, py, unitType)) continue;

            return { x: px, y: py };
        }

        return null;
    }

    function launchWave() {
        const enemyTCs = gameState.enemyBuildings.filter(b => b.type === 'town-center' && isEnemyFaction(b));
        if (enemyTCs.length === 0) return;

        // Scale wave based on waveCount
        const composition = [];
        if (waveCount <= 2) {
            composition.push({ type: 'militia', count: waveCount + 2 });
            composition.push({ type: 'archer', count: waveCount });
        } else if (waveCount <= 5) {
            composition.push({ type: 'warrior', count: 4 });
            composition.push({ type: 'archer', count: 4 });
            composition.push({ type: 'axeman', count: 2 });
        } else {
            composition.push({ type: 'warrior', count: 6 });
            composition.push({ type: 'crossbowman', count: 5 });
            composition.push({ type: 'catapult', count: 1 });
            composition.push({ type: 'ballista', count: 1 });
        }

        let spawnedCount = 0;
        const totalUnits = composition.reduce((sum, group) => sum + group.count, 0);
        enemyTCs.forEach(enemyTC => {
            const targetBuilding = selectWaveTarget(enemyTC);
            let baseSpawnedCount = 0;
            composition.forEach(group => {
                for (let i = 0; i < group.count; i++) {
                    const cfg = GAME_CONFIG.units[group.type];
                    if (!cfg) continue;
                    const spawn = findWaveSpawn(enemyTC, group.type, baseSpawnedCount, totalUnits);
                    if (!spawn) continue;

                    const newUnit = {
                        id: generateId(),
                        type: group.type,
                        player: enemyTC.player,
                        faction: enemyTC.player,
                        factionName: getFactionName(enemyTC),
                        factionColor: getFactionColor(enemyTC),
                        x: spawn.x,
                        y: spawn.y,
                        health: cfg.maxHealth,
                        state: targetBuilding ? 'attacking' : 'idle',
                        target: targetBuilding || null,
                        targetPoint: targetBuilding ? getCombatCenter(targetBuilding) : undefined,
                        attackPath: null,
                        attackPathTimer: targetBuilding ? -Math.random() * 2500 : 0,
                        attackPathFailed: false,
                        attackPathFailCount: 0,
                        attackPathRetryDelay: 0,
                        anim: { action: 'idle', direction: 'south', frame: 0, elapsed: 0 },
                        _faceDir: 'south',
                        _lastFaceNatural: 'south',
                        prevX: spawn.x,
                        prevY: spawn.y
                    };

                    gameState.enemyUnits.push(newUnit);
                    spawnedCount++;
                    baseSpawnedCount++;
                }
            });

            if (baseSpawnedCount > 0 && typeof UI !== 'undefined' && UI.minimapPing) {
                UI.minimapPing(enemyTC.x, enemyTC.y, getFactionColor(enemyTC));
            }
        });

        if (spawnedCount > 0) {
            showNotification(`Warning! An enemy wave of ${spawnedCount} units approaches!`);
        }
    }

    return { tick };
})();
