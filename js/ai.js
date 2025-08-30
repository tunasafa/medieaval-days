// AI Functions
function createEnemyBase() {
    // Always place the enemy Town Center at the bottom-right corner with a small edge padding
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

    // Spawn a small enemy patrol outside the TC footprint, away from the corner (toward map center)
    const centerX = enemyTC.x + enemyTC.width / 2;
    const centerY = enemyTC.y + enemyTC.height / 2;
    const mapCX = GAME_CONFIG.world.width / 2;
    const mapCY = GAME_CONFIG.world.height / 2;
    const baseR = Math.max(enemyTC.width, enemyTC.height) / 2 + 26;
    const dirToCenter = Math.atan2(mapCY - centerY, mapCX - centerX);

    for (let i = 0; i < 3; i++) {
        let spawn = null;
        for (let tries = 0; tries < 16; tries++) {
            const jitter = (Math.random() - 0.5) * (Math.PI / 3); // +/- 60 degrees
            const ang = dirToCenter + jitter;
            const r = baseR + 20 + Math.random() * 60;
            const px = centerX + Math.cos(ang) * r;
            const py = centerY + Math.sin(ang) * r;
            // Bounds check
            if (px < 8 || py < 8 || px > GAME_CONFIG.world.width - 8 || py > GAME_CONFIG.world.height - 8) continue;
            // Outside the TC expanded rectangle (margin to keep clear of borders)
            const margin = 12;
            const rx = enemyTC.x - margin;
            const ry = enemyTC.y - margin;
            const rw = enemyTC.width + margin * 2;
            const rh = enemyTC.height + margin * 2;
            if (px >= rx && px <= rx + rw && py >= ry && py <= ry + rh) continue;
            // Avoid water for land units
            if (typeof isPointInWater === 'function' && isPointInWater(px, py)) continue;
            spawn = { x: px, y: py };
            break;
        }
        if (!spawn) {
            // Fallback along the line toward the map center
            const px = Math.max(8, Math.min(GAME_CONFIG.world.width - 8, centerX + Math.cos(dirToCenter) * (baseR + 30)));
            const py = Math.max(8, Math.min(GAME_CONFIG.world.height - 8, centerY + Math.sin(dirToCenter) * (baseR + 30)));
            spawn = { x: px, y: py };
        }
        gameState.enemyUnits.push({
            id: generateId(),
            type: 'militia',
            player: 'enemy',
            x: spawn.x,
            y: spawn.y,
            health: GAME_CONFIG.units.militia.maxHealth,
            state: 'patrol',
            target: null,
            patrolCenter: { x: centerX, y: centerY },
            patrolRadius: 160
        });
    }
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