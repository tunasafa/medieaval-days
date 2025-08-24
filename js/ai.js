// AI Functions
function createEnemyBase() {
    const centerX = GAME_CONFIG.world.width * 3/4;
    const centerY = GAME_CONFIG.world.height / 2;
    const river = gameState.worldObjects.find(o => o.type === 'water' && o.width > o.height);
    let spawnY = centerY;
    if (river) {
        const riverMidY = river.y + river.height / 2;
        spawnY = riverMidY + (river.height / 2) + 40;
        spawnY = Math.min(GAME_CONFIG.world.height - getBuildingConfig('town-center').height, spawnY);
    }
    gameState.enemyBuildings.push({
        id: generateId(),
        type: 'town-center',
        player: 'enemy',
        x: centerX - getBuildingConfig('town-center').width/2,
        y: spawnY,
        health: getBuildingConfig('town-center').maxHealth,
        width: getBuildingConfig('town-center').width,
        height: getBuildingConfig('town-center').height
    });

    for (let i = 0; i < 3; i++) {
        gameState.enemyUnits.push({
            id: generateId(),
            type: 'militia',
            player: 'enemy',
            x: centerX + 100 + Math.random() * 100,
            y: centerY + 100 + Math.random() * 100,
            health: GAME_CONFIG.units.militia.maxHealth,
            state: 'patrol',
            target: null,
            patrolCenter: { x: centerX, y: centerY },
            patrolRadius: 200
        });
    }
    gameState.enemyUnits.push({
        id: generateId(),
        type: 'archer',
        player: 'enemy',
        x: centerX - 50,
        y: centerY - 50,
        health: GAME_CONFIG.units.archer.maxHealth,
        state: 'guard',
        target: null
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