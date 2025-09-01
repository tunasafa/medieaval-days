// AI Functions
function createEnemyBase() {
    const edgePad = 24;
    const tcCfg = getBuildingConfig('town-center');
    const spawnX = Math.max(edgePad, GAME_CONFIG.world.width - tcCfg.width - edgePad);
    const spawnY = Math.max(edgePad, GAME_CONFIG.world.height - tcCfg.height - edgePad);
    const enemyTC = {
        id: generateId(),
        type: 'town-center',
        player: 'enemy',
        x: spawnX,
        y: spawnY,
        health: tcCfg.maxHealth,
        width: tcCfg.width,
        height: tcCfg.height
    };
    gameState.enemyBuildings.push(enemyTC);

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
                unit.targetX = unit.patrolCenter.x + Math.cos(angle) * (unit.patrolRadius * 0.5);
                unit.targetY = unit.patrolCenter.y + Math.sin(angle) * (unit.patrolRadius * 0.5);
                unit.state = 'moving';
            }
        }
    }
}
