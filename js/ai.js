// AI Functions
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
                if (typeof isPositionOccupied === 'function' && isPositionOccupied(px, py, null, 15)) continue;
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
                const px = Math.max(8, Math.min(GAME_CONFIG.world.width - 8, centerX + Math.cos(dirToCenter) * (baseR + 60)));
                const py = Math.max(8, Math.min(GAME_CONFIG.world.height - 8, centerY + Math.sin(dirToCenter) * (baseR + 60)));
                // Final guard: nudge fallback outward slightly until separation is met
                let fx = px, fy = py, attempts = 0;
                while (attempts < 10) {
                    let bad = false;
                    for (const u of gameState.enemyUnits) {
                        if (Math.hypot(fx - u.x, fy - u.y) < minSeparation) { bad = true; break; }
                    }
                    if (!bad) break;
                    const bumpAng = dirToCenter + Math.PI + (Math.random() - 0.5) * 0.6;
                    const bump = minSeparation * 0.6;
                    fx = Math.max(8, Math.min(GAME_CONFIG.world.width - 8, fx + Math.cos(bumpAng) * bump));
                    fy = Math.max(8, Math.min(GAME_CONFIG.world.height - 8, fy + Math.sin(bumpAng) * bump));
                    attempts++;
                }
                spawn = { x: fx, y: fy };
            }
            const cfg = GAME_CONFIG.units[entry.type] || { maxHealth: 50 };
            gameState.enemyUnits.push({
                id: generateId(),
                type: entry.type,
                player: 'enemy',
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

function updateEnemyAI(unit) {
    if (unit.state === 'idle' || unit.state === 'patrol') {
        let nearbyTarget = gameState.units.find(playerUnit =>
            getDistance(unit, playerUnit) < 200 && playerUnit.player === 'player'
        );
        if (!nearbyTarget) {
            let closestBuilding = null;
            let bestDist = Infinity;
            gameState.buildings.forEach(b => {
                const d = getDistance(unit, { x: b.x + b.width / 2, y: b.y + b.height / 2 });
                if (d < bestDist) { bestDist = d; closestBuilding = b; }
            });
            if (closestBuilding && bestDist < 400) {
                nearbyTarget = closestBuilding;
            }
        }
        if (nearbyTarget) {
            unit.state = 'attacking';
            unit.target = nearbyTarget;
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
        const dummyUnit = { type: unitType, player: 'enemy' };

        for (let tries = 0; tries < 64; tries++) {
            const angle = ((index + tries / 64) / Math.max(1, total)) * Math.PI * 2 + (Math.random() - 0.5) * 0.75;
            const radius = baseRadius + 35 + Math.random() * 170;
            const px = centerX + Math.cos(angle) * radius;
            const py = centerY + Math.sin(angle) * radius;

            if (px < 8 || py < 8 || px > GAME_CONFIG.world.width - 8 || py > GAME_CONFIG.world.height - 8) continue;
            if (isPointInRoundedRectangle(px, py, enemyTC, 18)) continue;
            if (typeof validateTerrainMovement === 'function' && !validateTerrainMovement(dummyUnit, px, py)) continue;
            if (typeof isPositionOccupied === 'function' && isPositionOccupied(px, py, dummyUnit, 18)) continue;

            return { x: px, y: py };
        }

        return null;
    }

    function launchWave() {
        const enemyTCs = gameState.enemyBuildings.filter(b => b.type === 'town-center' && b.player === 'enemy');
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

        // Find player TC to target
        let targetBuilding = gameState.buildings.find(b => b.player === 'player' && b.type === 'town-center');
        if (!targetBuilding && gameState.buildings.length > 0) {
            targetBuilding = gameState.buildings[0];
        }

        let spawnedCount = 0;
        const totalUnits = composition.reduce((sum, group) => sum + group.count, 0);
        enemyTCs.forEach(enemyTC => {
            let baseSpawnedCount = 0;
            composition.forEach(group => {
                for (let i = 0; i < group.count; i++) {
                    const cfg = GAME_CONFIG.units[group.type];
                    if (!cfg) continue;
                    const spawn = findWaveSpawn(enemyTC, group.type, baseSpawnedCount, totalUnits);
                    if (!spawn) continue;

                    const targetPoint = targetBuilding ? {
                        x: targetBuilding.x + targetBuilding.width / 2,
                        y: targetBuilding.y + targetBuilding.height / 2
                    } : undefined;

                    const newUnit = {
                        id: generateId(),
                        type: group.type,
                        player: 'enemy',
                        x: spawn.x,
                        y: spawn.y,
                        health: cfg.maxHealth,
                        state: targetBuilding ? 'attacking' : 'idle',
                        target: targetBuilding || null,
                        targetPoint,
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
                UI.minimapPing(enemyTC.x, enemyTC.y, '#ff0000');
            }
        });

        if (spawnedCount > 0) {
            showNotification(`Warning! An enemy wave of ${spawnedCount} units approaches!`);
        }
    }

    return { tick };
})();
