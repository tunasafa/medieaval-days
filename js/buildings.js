function createInitialBuildings() {
    const tcCfg = getBuildingConfig('town-center');
    const configuredEnemyCount = GAME_CONFIG.world.enemyCount ??
        gameState.ui?.selectedEnemyCount ??
        ((GAME_CONFIG.world.numPlayers || 3) - 1);
    const parsedEnemyCount = Number(configuredEnemyCount);
    const enemyCount = Math.max(1, Math.min(4, Number.isFinite(parsedEnemyCount) ? parsedEnemyCount : 2));
    const numPlayers = enemyCount + 1;
    GAME_CONFIG.world.enemyCount = enemyCount;
    GAME_CONFIG.world.numPlayers = numPlayers;
    const cx = GAME_CONFIG.world.width / 2;
    const cy = GAME_CONFIG.world.height / 2;
    const spawnRadius = GAME_CONFIG.world.radius * 0.85; // Spawn near the edge
    const enemyFactions = GAME_CONFIG.enemyFactions || [];

    for (let i = 0; i < numPlayers; i++) {
        const angle = (i * 2 * Math.PI) / numPlayers;
        const enemyFaction = enemyFactions[(i - 1) % Math.max(1, enemyFactions.length)];
        // In multiplayer, slot 1 is a human player ('player2') instead of AI
        const isPlayer2Slot = i === 1 && typeof Multiplayer !== 'undefined' && Multiplayer.isMultiplayer;
        const playerType = i === 0 ? 'player'
                         : isPlayer2Slot ? 'player2'
                         : (enemyFaction?.id || `enemy-${i}`);
        const spawnX = cx + Math.cos(angle) * spawnRadius - (tcCfg.width / 2);
        const spawnY = cy + Math.sin(angle) * spawnRadius - (tcCfg.height / 2);

        const tcMaxHealth = typeof getEffectiveBuildingMaxHealth === 'function'
            ? getEffectiveBuildingMaxHealth('town-center', playerType)
            : tcCfg.maxHealth;

        const building = {
            id: generateId(),
            type: 'town-center',
            player: playerType,
            faction: playerType,
            factionName: getFactionName(playerType),
            factionColor: getFactionColor(playerType),
            x: spawnX,
            y: spawnY,
            health: tcMaxHealth,
            maxHealth: tcMaxHealth,
            width: tcCfg.width,
            height: tcCfg.height,
            rallyPoint: null
        };

        if (playerType === 'player') {
            gameState.buildings.push(building);
        } else {
            gameState.enemyBuildings.push(building);
        }
    }
}

function getConstructionSettings() {
    return {
        minWorkers: GAME_CONFIG.construction?.minWorkers || 1,
        maxWorkers: GAME_CONFIG.construction?.maxWorkers || 4,
        workRange: GAME_CONFIG.construction?.workRange || 30
    };
}

function getSelectedBuilderUnits(owner = getLocalPlayerId()) {
    return gameState.selectedUnits.filter(unit =>
        unit &&
        unit.player === owner &&
        unit.type === 'villager' &&
        unit.health > 0 &&
        unit.state !== 'embarked'
    );
}

function getBuilderUnitsFromIds(ids = [], owner = null) {
    return ids
        .map(id => (typeof findUnitById === 'function'
            ? findUnitById(id)
            : [...gameState.units, ...gameState.enemyUnits].find(unit => unit.id === id)))
        .filter(unit =>
            unit &&
            (!owner || unit.player === owner) &&
            unit.type === 'villager' &&
            unit.health > 0 &&
            unit.state !== 'embarked'
        );
}

function getBuildingBuildTimeMs(type) {
    const cfg = getBuildingConfig(type);
    return Math.max(1000, (cfg?.buildTime || 30) * 1000);
}

function getConstructionProgressPct(building) {
    if (!building?.underConstruction || !building.construction?.totalTime) return 100;
    const remaining = building.construction.timeRemaining || 0;
    return Math.max(0, Math.min(100, (1 - (remaining / building.construction.totalTime)) * 100));
}

function getConstructionWorkers(building) {
    if (!building?.construction) return [];
    return getBuilderUnitsFromIds(building.construction.workerIds || [], building.player)
        .filter(unit => unit.buildTargetId === building.id);
}

function getConstructionWorkCandidates(building, slotIndex = 0) {
    const margin = (typeof EDGE_CLEARANCE !== 'undefined' ? EDGE_CLEARANCE : 20) + 16;
    const insetX = Math.min(28, Math.max(8, building.width * 0.18));
    const insetY = Math.min(28, Math.max(8, building.height * 0.18));
    const x1 = building.x - margin;
    const x2 = building.x + building.width + margin;
    const y1 = building.y - margin;
    const y2 = building.y + building.height + margin;
    const leftInner = building.x + insetX;
    const rightInner = building.x + building.width - insetX;
    const topInner = building.y + insetY;
    const bottomInner = building.y + building.height - insetY;
    const candidates = [
        { x: x1, y: y1 },
        { x: x2, y: y1 },
        { x: x1, y: y2 },
        { x: x2, y: y2 },
        { x: leftInner, y: building.y - margin },
        { x: rightInner, y: building.y - margin },
        { x: leftInner, y: building.y + building.height + margin },
        { x: rightInner, y: building.y + building.height + margin },
        { x: building.x - margin, y: topInner },
        { x: building.x - margin, y: bottomInner },
        { x: building.x + building.width + margin, y: topInner },
        { x: building.x + building.width + margin, y: bottomInner }
    ];

    return candidates.slice(slotIndex).concat(candidates.slice(0, slotIndex));
}

function isConstructionSpotReserved(x, y, reservedSpots = [], radius = 26) {
    const radiusSq = radius * radius;
    return reservedSpots.some(spot => {
        if (!spot) return false;
        const dx = x - spot.x;
        const dy = y - spot.y;
        return dx * dx + dy * dy < radiusSq;
    });
}

function isConstructionWorkSpotOpen(x, y, unit, reservedSpots = []) {
    const dummy = unit || { type: 'villager', player: 'player' };
    return validateTerrainMovement(dummy, x, y) &&
        !isPositionOccupied(x, y, unit || dummy, 12) &&
        !isConstructionSpotReserved(x, y, reservedSpots);
}

function isConstructionWorkSpotPathable(x, y, unit) {
    return typeof isSpawnPathable !== 'function' || isSpawnPathable(x, y, unit?.type || 'villager');
}

function findConstructionWorkSpot(building, unit, slotIndex = 0, reservedSpots = []) {
    const dummy = unit || { type: 'villager', player: 'player' };
    const candidates = getConstructionWorkCandidates(building, slotIndex);
    const nudges = [0, 16, 32, 48, 64, 88, 112];
    const lateralOffsets = [0, -28, 28, -56, 56, -84, 84];
    const centerX = building.x + building.width / 2;
    const centerY = building.y + building.height / 2;

    // Prefer a work side whose grid cell is usable by A*. A legal standing
    // position can still be inside the pathfinding clearance band around a
    // foundation or shoreline; choosing one of those makes the generic failed
    // path recovery walk the worker away from the building.
    const legalFallbacks = [];
    for (const candidate of candidates) {
        const vx = candidate.x - centerX;
        const vy = candidate.y - centerY;
        const mag = Math.hypot(vx, vy) || 1;
        const ux = vx / mag;
        const uy = vy / mag;
        const px = -uy;
        const py = ux;
        for (const nudge of nudges) {
            for (const lateral of lateralOffsets) {
                const x = clamp(candidate.x + ux * nudge + px * lateral, 12, GAME_CONFIG.world.width - 12);
                const y = clamp(candidate.y + uy * nudge + py * lateral, 12, GAME_CONFIG.world.height - 12);
                if (!isConstructionWorkSpotOpen(x, y, unit || dummy, reservedSpots)) continue;
                if (isConstructionWorkSpotPathable(x, y, unit || dummy)) {
                    return { x, y };
                }
                legalFallbacks.push({ x, y });
            }
        }
    }

    // Keep the old legal fallback for tight maps where no pathable work cell
    // exists. This still lets the worker build if it can reach within workRange.
    if (legalFallbacks.length > 0) return legalFallbacks[0];

    const fallback = getDropOffPointOutside(dummy, building, (typeof EDGE_CLEARANCE !== 'undefined' ? EDGE_CLEARANCE : 20) + 24);
    const fallbackOffsets = computeFormationOffsets((GAME_CONFIG.construction?.maxWorkers || 4) * 4, 28);
    for (const offset of fallbackOffsets) {
        const x = clamp(fallback.x + offset.dx, 12, GAME_CONFIG.world.width - 12);
        const y = clamp(fallback.y + offset.dy, 12, GAME_CONFIG.world.height - 12);
        if (isConstructionWorkSpotOpen(x, y, unit || dummy, reservedSpots)) {
            return { x, y };
        }
    }

    return fallback;
}

function clearConstructionMovement(unit) {
    unit.path = null;
    unit.targetX = undefined;
    unit.targetY = undefined;
    unit.requestedTargetX = undefined;
    unit.requestedTargetY = undefined;
    unit.pathfindingFailed = false;
    unit.target = null;
    unit.targetResource = null;
    unit.gatherType = null;
    unit.gatherStartTime = null;
    unit.gatherPath = null;
    unit.returnPath = null;
    unit.attackPath = null;
    unit.embarkTargetId = null;
}

function releaseUnitFromConstruction(unit, nextState = 'idle') {
    if (!unit?.buildTargetId) return;
    const building = typeof findBuildingById === 'function'
        ? findBuildingById(unit.buildTargetId)
        : [...gameState.buildings, ...gameState.enemyBuildings].find(b => b.id === unit.buildTargetId);
    if (building?.construction?.workerIds) {
        building.construction.workerIds = building.construction.workerIds.filter(id => id !== unit.id);
    }
    unit.buildTargetId = null;
    unit.buildSlotIndex = null;
    unit.buildSpot = null;
    if (unit.state === 'building') {
        unit.state = nextState;
    }
}

function assignWorkersToConstruction(building, workers) {
    if (!building?.underConstruction || !building.construction) return 0;
    const owner = building.player || 'player';
    const settings = getConstructionSettings();
    // A* ends at cell centres, so its final point can be several pixels away
    // from the exact work spot even when the route is valid.
    const effectiveWorkRange = settings.workRange + 8;
    const existingWorkers = getConstructionWorkers(building);
    const existingIds = new Set(existingWorkers.map(worker => worker.id));
    const usedSlots = new Set(existingWorkers
        .map(worker => worker.buildSlotIndex)
        .filter(slot => Number.isInteger(slot))
    );
    const reservedSpots = existingWorkers
        .map(worker => worker.buildSpot)
        .filter(Boolean);
    building.construction.workerIds = existingWorkers.map(worker => worker.id);
    let added = 0;

    for (const worker of workers) {
        if (!worker || worker.type !== 'villager' || worker.player !== owner || worker.health <= 0) continue;
        if (existingIds.has(worker.id)) continue;
        if (existingIds.size >= settings.maxWorkers) break;
        if (worker.buildTargetId && worker.buildTargetId !== building.id) {
            releaseUnitFromConstruction(worker);
        }

        let slotIndex = 0;
        while (usedSlots.has(slotIndex) && slotIndex < settings.maxWorkers) {
            slotIndex++;
        }
        usedSlots.add(slotIndex);
        const workSpot = findConstructionWorkSpot(building, worker, slotIndex, reservedSpots);
        reservedSpots.push(workSpot);
        existingIds.add(worker.id);
        building.construction.workerIds.push(worker.id);

        clearConstructionMovement(worker);
        worker.buildTargetId = building.id;
        worker.buildSlotIndex = slotIndex;
        worker.buildSpot = workSpot;

        if (Math.hypot(worker.x - workSpot.x, worker.y - workSpot.y) <= effectiveWorkRange) {
            worker.state = 'building';
            clearConstructionMovement(worker);
        } else if (!setUnitDestination(worker, workSpot.x, workSpot.y)) {
            worker.state = 'idle';
        }
        added++;
    }

    return added;
}

function updateConstructionWorker(building, worker, index) {
    const settings = getConstructionSettings();
    const effectiveWorkRange = settings.workRange + 8;
    const reservedSpots = getConstructionWorkers(building)
        .filter(other => other !== worker)
        .map(other => other.buildSpot)
        .filter(Boolean);
    const workSpot = worker.buildSpot || findConstructionWorkSpot(building, worker, index, reservedSpots);
    worker.buildSpot = workSpot;

    const dist = Math.hypot(worker.x - workSpot.x, worker.y - workSpot.y);
    if (dist <= effectiveWorkRange) {
        if (worker.state !== 'building') {
            clearConstructionMovement(worker);
            worker.state = 'building';
        }
        const cx = building.x + building.width / 2;
        const cy = building.y + building.height / 2;
        const angle = Math.atan2(cy - worker.y, cx - worker.x);
        const dirs = ['east','northeast','north','northwest','west','southwest','south','southeast'];
        const dirIndex = (Math.round(((angle + Math.PI) / (Math.PI / 4))) % 8 + 8) % 8;
        worker._faceDir = dirs[dirIndex];
        worker._lastFaceNatural = worker._faceDir;
        return true;
    }

    if (worker.state !== 'moving' || !worker.path || worker.path.length === 0 ||
        Math.hypot((worker.requestedTargetX || worker.targetX || workSpot.x) - workSpot.x,
            (worker.requestedTargetY || worker.targetY || workSpot.y) - workSpot.y) > 8) {
        setUnitDestination(worker, workSpot.x, workSpot.y);
    }

    return false;
}

function completeConstruction(building) {
    const cfg = getBuildingConfig(building.type);
    const owner = building.player || 'player';
    building.underConstruction = false;
    building.health = building.maxHealth || cfg.maxHealth;
    building.construction = null;

    if (building.type === 'house' && cfg.population) {
        addPopulationCapForPlayer(owner, cfg.population);
    }

    getAllUnits().forEach(unit => {
        if (unit.buildTargetId !== building.id) return;
        clearConstructionMovement(unit);
        unit.buildTargetId = null;
        unit.buildSlotIndex = null;
        unit.buildSpot = null;
        unit.state = 'idle';
    });

    if (typeof markPathfindingDirty === 'function') markPathfindingDirty();
    if (typeof SFX !== 'undefined') SFX.buildingPlace();
    showNotification(`${displayName(building.type)} constructed!`);
    if (gameState.selectedBuilding === building) {
        showBuildingActions(building);
        updateSelectionInfo();
    }
}

function updateConstructionSites(deltaTime) {
    for (const building of getAllBuildings()) {
        if (!building.underConstruction || !building.construction) continue;

        const workers = getConstructionWorkers(building);
        building.construction.workerIds = workers.map(worker => worker.id);

        let activeWorkers = 0;
        workers.forEach((worker, index) => {
            if (updateConstructionWorker(building, worker, index)) {
                activeWorkers++;
            }
        });

        if (activeWorkers > 0) {
            building.construction.timeRemaining -= deltaTime * activeWorkers;
            const progress = getConstructionProgressPct(building) / 100;
            building.health = Math.max(1, Math.ceil((building.maxHealth || 1) * Math.max(0.08, progress)));
        }

        if (building.construction.timeRemaining <= 0) {
            completeConstruction(building);
        }
    }
}

function startPlacingBuilding(type) {
     if (gameState.placingBuilding) {
        showNotification("Finish placing the current building first!");
        return;
    }
    const buildingConfig = getBuildingConfig(type);
    const owner = getLocalPlayerId();
    if (!canAfford(buildingConfig.cost, owner)) {
        showNotification(`Not enough resources to build ${type}!`);
        return;
    }
    if (type !== 'bridge') {
        const settings = getConstructionSettings();
        const workers = getSelectedBuilderUnits(owner).slice(0, settings.maxWorkers);
        if (workers.length < settings.minWorkers) {
            showNotification(`Select ${settings.minWorkers}-${settings.maxWorkers} villager(s) to build ${displayName(type)}.`);
            return;
        }
        gameState.placingWorkerIds = workers.map(worker => worker.id);
    } else {
        gameState.placingWorkerIds = [];
    }
    gameState.placingBuilding = type;
    const canvas = document.getElementById('gameCanvas');
    canvas.classList.add('placing-building');
    const workerCount = (gameState.placingWorkerIds || []).length;
    showNotification(type === 'bridge'
        ? `Placing ${displayName(type)}. Click to place. Press ESC to cancel.`
        : `Placing ${displayName(type)} with ${workerCount} villager(s). Click to place. Press ESC to cancel.`
    );
}

function placeBuilding(type, x, y, options = {}) {
    const buildingConfig = getBuildingConfig(type);
    const owner = options.owner || getLocalPlayerId();
    const workerIds = options.workerIds || gameState.placingWorkerIds || [];
    if (type !== 'bridge') {
        if (!canAfford(buildingConfig.cost, owner)) {
            showNotification(`Not enough resources!`);
            return;
        }
        const settings = getConstructionSettings();
        const workers = getBuilderUnitsFromIds(workerIds, owner).slice(0, settings.maxWorkers);
        if (workers.length < settings.minWorkers) {
            showNotification(`Select ${settings.minWorkers}-${settings.maxWorkers} villager(s) to build ${displayName(type)}.`);
            return;
        }
        deductResources(buildingConfig.cost, owner);
    }
    const buildingX = x - buildingConfig.width / 2;
    const buildingY = y - buildingConfig.height / 2;
    if (type === 'bridge') {
        const blk = computeBridgeBlockAt(x, y);
        if (!blk.ok) {
            showNotification(blk.isLake ? 'Cannot build bridges on lakes.' : 'Bridge must span river water with land on both banks.');
            return;
        }
        const bridgeCost = scaleCost(buildingConfig.cost, blk.costMultiplier || 1);
        if (!canAfford(bridgeCost, owner)) {
            showNotification(`Not enough resources for bridge (${formatCost(bridgeCost)}).`);
            return;
        }
        deductResources(bridgeCost, owner);
        const bridge = {
            id: generateId(),
            type: 'bridge',
            x: blk.x,
            y: blk.y,
            width: blk.width,
            height: blk.height,
            orientation: blk.orientation,
            waterSpan: blk.waterSpan,
            costMultiplier: blk.costMultiplier,
            color: '#A66C3C'
        };
        gameState.worldObjects.push(bridge);
        if (tilemap && tilemap.isLoaded && typeof tilemap.applyBridgeTerrain === 'function') {
            tilemap.applyBridgeTerrain(bridge);
        }
        if (typeof markPathfindingDirty === 'function') markPathfindingDirty();
        if (typeof SFX !== 'undefined') SFX.buildingPlace();
        showNotification(`Bridge built (${formatCost(bridgeCost)}).`);
        return;
    }
    const footprint = { x: buildingX, y: buildingY, width: buildingConfig.width, height: buildingConfig.height };
    const allUnits = [...gameState.units, ...gameState.enemyUnits];
    for (const u of allUnits) {
        if (u.state === 'embarked') continue;
        const inside = (
            u.x >= footprint.x && u.x <= footprint.x + footprint.width &&
            u.y >= footprint.y && u.y <= footprint.y + footprint.height
        );
        if (inside) {
            let edge = getDropOffPointOutside(u, footprint, (typeof EDGE_CLEARANCE !== 'undefined' ? EDGE_CLEARANCE : 20) + 5);
            let px = edge.x, py = edge.y;
            px = Math.max(8, Math.min(GAME_CONFIG.world.width - 8, px));
            py = Math.max(8, Math.min(GAME_CONFIG.world.height - 8, py));
            const cx = footprint.x + footprint.width / 2;
            const cy = footprint.y + footprint.height / 2;
            let vx = (px - cx) || 1;
            let vy = (py - cy) || 0;
            let vm = Math.hypot(vx, vy) || 1;
            let nx = vx / vm, ny = vy / vm;
            const collidesWithAny = () => (
                isPointInRoundedRectangle(px, py, footprint, 17) ||
                [...gameState.buildings, ...gameState.enemyBuildings].some(b => isPointInRoundedRectangle(px, py, b, 17))
            );
            let attempts = 0;
            while (collidesWithAny() && attempts < 5) {
                px = px + nx * 6;
                py = py + ny * 6;
                attempts++;
            }
            const free = getAvailablePosition(px, py, 16);
            px = free.x; py = free.y;
            if (validateTerrainMovement(u, px, py)) {
                u.x = px; u.y = py; u.state = 'idle';
            }
        }
    }

    const maxHealth = typeof getEffectiveBuildingMaxHealth === 'function'
        ? getEffectiveBuildingMaxHealth(type, owner)
        : buildingConfig.maxHealth;
    const buildTime = getBuildingBuildTimeMs(type);
    const building = {
        id: generateId(),
        type: type,
        player: owner,
        faction: owner,
        factionName: getFactionName(owner),
        factionColor: getFactionColor(owner),
        x: buildingX,
        y: buildingY,
        width: buildingConfig.width,
        height: buildingConfig.height,
        health: Math.max(1, Math.ceil(maxHealth * 0.08)),
        maxHealth: maxHealth,
        rallyPoint: null,
        isSelected: false,
        underConstruction: true,
        construction: {
            timeRemaining: buildTime,
            totalTime: buildTime,
            workerIds: []
        },
        trainingQueue: []
    };
    getBuildingContainerForPlayer(owner).push(building);
    if (typeof markPathfindingDirty === 'function') markPathfindingDirty();
    // Rebuild now so the clearance data reflects this footprint, then free any
    // unit the new foundation just sealed into an unpathable pocket.
    if (typeof updatePathfindingGrid === 'function') updatePathfindingGrid();
    if (typeof nudgeUnitTowardOpenGround === 'function' && typeof isSpawnPathable === 'function') {
        for (const u of [...gameState.units, ...gameState.enemyUnits]) {
            if (u.state === 'embarked') continue;
            let guard = 0;
            while (!isSpawnPathable(u.x, u.y, u.type) && nudgeUnitTowardOpenGround(u) && guard++ < 40) { /* walk out */ }
            if (!isSpawnPathable(u.x, u.y, u.type) && typeof relocateUnitToPathableGround === 'function') {
                relocateUnitToPathableGround(u);
            }
        }
    }
    const assigned = assignWorkersToConstruction(building, getBuilderUnitsFromIds(workerIds, owner));
    if (typeof SFX !== 'undefined') SFX.buildingPlace();
    showNotification(`${displayName(type)} foundation placed. ${assigned} villager(s) building.`);
}

function canPlaceBuilding(type, x, y) {
    const config = getBuildingConfig(type);
    const proposedX = x - config.width / 2;
    const proposedY = y - config.height / 2;

    const cx = GAME_CONFIG.world.width / 2;
    const cy = GAME_CONFIG.world.height / 2;
    const r = GAME_CONFIG.world.radius;
    // Check all four corners against the circular boundary
    const corners = [
        { x: proposedX, y: proposedY },
        { x: proposedX + config.width, y: proposedY },
        { x: proposedX, y: proposedY + config.height },
        { x: proposedX + config.width, y: proposedY + config.height }
    ];
    if (corners.some(corner => Math.hypot(corner.x - cx, corner.y - cy) > r)) {
        return false;
    }
    const allBuildings = [...gameState.buildings, ...gameState.enemyBuildings];
    for (const building of allBuildings) {
        if (!(proposedX + config.width <= building.x || proposedX >= building.x + building.width ||
              proposedY + config.height <= building.y || proposedY >= building.y + building.height)) {
            return false;
        }
    }


    for (const obj of gameState.worldObjects) {
        if (obj.type === 'resource') {
            if (!(proposedX + config.width <= obj.x || proposedX >= obj.x + obj.width ||
                  proposedY + config.height <= obj.y || proposedY >= obj.y + obj.height)) {
                return false;
            }
        }
    }


    let intersectsWater = false;
    let nearWater = false;

    if (tilemap && tilemap.isLoaded) {
        const buildingWidthInTiles = Math.ceil(config.width / tilemap.tileSize);
        const buildingHeightInTiles = Math.ceil(config.height / tilemap.tileSize);

        for (let tileY = 0; tileY < buildingHeightInTiles; tileY++) {
            for (let tileX = 0; tileX < buildingWidthInTiles; tileX++) {
                const worldX = proposedX + tileX * tilemap.tileSize;
                const worldY = proposedY + tileY * tilemap.tileSize;
                if (tilemap.isWater(worldX, worldY)) {
                    intersectsWater = true;
                    break;
                }
            }
            if (intersectsWater) break;
        }

        const checkRadius = 50;
        for (let checkY = proposedY - checkRadius; checkY <= proposedY + config.height + checkRadius; checkY += tilemap.tileSize) {
            for (let checkX = proposedX - checkRadius; checkX <= proposedX + config.width + checkRadius; checkX += tilemap.tileSize) {
                if (tilemap.isWater(checkX, checkY)) {
                    nearWater = true;
                    break;
                }
            }
            if (nearWater) break;
        }
    } else {
        intersectsWater = !isRectOnLand(proposedX, proposedY, config.width, config.height);

        const terrainStep = GAME_CONFIG.terrain?.tileSize || 32;
        const checkRadius = 50;
        for (let checkY = proposedY - checkRadius; checkY <= proposedY + config.height + checkRadius; checkY += terrainStep) {
            for (let checkX = proposedX - checkRadius; checkX <= proposedX + config.width + checkRadius; checkX += terrainStep) {
                if (isPointInWater(checkX, checkY)) {
                    nearWater = true;
                    break;
                }
            }
            if (nearWater) break;
        }
    }

    if (type === 'navy') {
        return intersectsWater || nearWater;
    }

    if (type === 'bridge') {
        const blk = computeBridgeBlockAt(x, y);
        return blk.ok;
    }


    if (intersectsWater) {
        return false;
    }


    for (const obj of gameState.worldObjects) {
        if (obj.type === 'obstacle') {
            if (!(proposedX + config.width <= obj.x || proposedX >= obj.x + obj.width ||
                  proposedY + config.height <= obj.y || proposedY >= obj.y + obj.height)) {
                return false;
            }
        }
    }

    return true;
}

function selectBuilding(building) {
    gameState.selectedUnits.forEach(unit => unit.isSelected = false);
    gameState.selectedUnits = [];
    getAllBuildings().forEach(b => b.isSelected = false);

    building.isSelected = true;
    gameState.selectedBuilding = building;

    showBuildingActions(building);
    updateSelectionInfo();
}

function showBuildingActions(building) {
    const actionsSection = document.getElementById('building-actions');
    const generalUnitsSection = document.getElementById('general-units');
    const buildingTitle = document.getElementById('building-title');
    const unitList = document.getElementById('building-unit-list');

    actionsSection.style.display = 'block';
    generalUnitsSection.style.display = 'none';

    buildingTitle.textContent = `${displayName(building.type)} Actions`;

    unitList.innerHTML = '';

    if (building.underConstruction) {
        const pct = typeof getConstructionProgressPct === 'function'
            ? getConstructionProgressPct(building)
            : 0;
        const workerCount = typeof getConstructionWorkers === 'function'
            ? getConstructionWorkers(building).length
            : (building.construction?.workerIds || []).length;
        unitList.innerHTML = `
            <div class="empty-command-state construction-state">
                <div>Under Construction</div>
                <div><span class="construction-pct">${Math.floor(pct)}%</span> complete / <span class="construction-workers">${workerCount}/${getConstructionSettings().maxWorkers}</span> workers</div>
                <div class="progress-bar construction-progress"><div class="progress-fill" style="width: ${pct}%;"></div></div>
            </div>
        `;
        return;
    }

    const buildingUnits = {
        'town-center': ['villager'],
        'barracks': ['militia', 'warrior', 'axeman'],
        'archeryRange': ['archer', 'crossbowman'],
        'craftery': ['ballista', 'catapult'],
        'navy': ['fishingBoat', 'transportLarge', 'warship'],
        'blacksmith': [],
        'university': []
    };

    let availableUnits = buildingUnits[building.type] || [];
    const hasWater = typeof hasWaterTerrain === 'function' ? hasWaterTerrain() :
        gameState.worldObjects.some(o => o.type === 'water' || o.type === 'lake');
    if (building.type === 'craftery' && hasWater) {
        availableUnits = [...availableUnits, 'bridge'];
    }

    availableUnits.forEach((unitType, index) => {
        const commandKey = ['Q', 'W', 'E', 'R'][index] || '';
        if (unitType === 'bridge') {
            const unitDiv = document.createElement('div');
            unitDiv.className = 'unit command-tile';
            unitDiv.dataset.type = 'bridge';
            unitDiv.innerHTML = `
                ${commandKey ? `<span class="command-key">${commandKey}</span>` : ''}
                <canvas class="unit-icon bridge" width="40" height="40"></canvas>
                <div class="command-name">Bridge</div>
                <div class="command-cost">15W, 5S / section</div>
            `;
            unitDiv.addEventListener('click', () => startPlacingBuilding('bridge'));
            unitList.appendChild(unitDiv);
            const canvas = unitDiv.querySelector('canvas.unit-icon.bridge');
            const ctx = canvas.getContext('2d');
            ctx.fillStyle = '#5F3A1F';
            ctx.fillRect(4, 18, 32, 12);
            ctx.fillStyle = '#B98645';
            ctx.fillRect(6, 16, 28, 10);
            ctx.strokeStyle = 'rgba(55, 32, 16, 0.65)';
            ctx.lineWidth = 1;
            for (let x = 10; x < 34; x += 6) {
                ctx.beginPath(); ctx.moveTo(x, 16); ctx.lineTo(x, 26); ctx.stroke();
            }
            if (typeof attachGameTooltip === 'function') {
                attachGameTooltip(unitDiv, () => '<strong>Bridge</strong><br>Creates land passage across valid river water.');
            }
            return;
        }
        const unitConfig = GAME_CONFIG.units[unitType];
        if (!unitConfig) return;

        const ageRestrictions = {
            'axeman': ['Feudal Age', 'Castle Age', 'Imperial Age'],
            'catapult': ['Castle Age', 'Imperial Age'],
            'ballista': ['Castle Age', 'Imperial Age'],
            'crossbowman': ['Feudal Age', 'Castle Age', 'Imperial Age']
        };

        const ownerAge = typeof getAgeForPlayer === 'function'
            ? getAgeForPlayer(building.player || getLocalPlayerId())
            : gameState.currentAge;
        if (ageRestrictions[unitType] && !ageRestrictions[unitType].includes(ownerAge)) {
            const unitDiv = document.createElement('div');
            unitDiv.className = 'unit command-tile disabled';
            unitDiv.dataset.type = unitType;

            const costText = Object.entries(unitConfig.cost)
                .map(([resource, amount]) => `${amount}${resource.charAt(0).toUpperCase()}`)
                .join(', ');

            const requiredAge = ageRestrictions[unitType][0];

            unitDiv.innerHTML = `
                ${commandKey ? `<span class="command-key">${commandKey}</span>` : ''}
                <img class="unit-icon-img" src="${getUnitPortraitSrc(unitType)}" alt="">
                <div class="command-name">${displayName(unitType)}</div>
                <div class="command-cost">${costText}</div>
                <div class="command-lock">Requires ${requiredAge}</div>
                <div class="progress-bar"><div class="progress-fill" style="width: 0%;"></div></div>
            `;

            unitList.appendChild(unitDiv);
            const icon = unitDiv.querySelector('img');
            icon.onerror = () => icon.style.display = 'none';
            if (typeof attachGameTooltip === 'function') {
                attachGameTooltip(unitDiv, () => getUnitTooltipHTML(unitType));
            }
            return;
        }

        const unitDiv = document.createElement('div');
        unitDiv.className = 'unit command-tile';
        unitDiv.dataset.type = unitType;

        const costText = Object.entries(unitConfig.cost)
            .map(([resource, amount]) => `${amount}${resource.charAt(0).toUpperCase()}`)
            .join(', ');

        // Determine queue info for this building and unit type
        const q = (building.trainingQueue || []).filter(t => t.type === unitType);
        const queuedCount = q.length;
        const current = (building.trainingQueue || [])[0];
        const isCurrentThisType = current && current.type === unitType;
        const progressPct = isCurrentThisType ? Math.max(0, Math.min(100, (1 - (current.timeRemaining / current.totalTime)) * 100)) : 0;

        unitDiv.innerHTML = `
            ${commandKey ? `<span class="command-key">${commandKey}</span>` : ''}
            <div class="queue-pill" style="display:${queuedCount > 0 ? 'inline-flex' : 'none'};">x${queuedCount}</div>
            <img class="unit-icon-img" src="${getUnitPortraitSrc(unitType)}" alt="">
            <div class="command-name">${displayName(unitType)}</div>
            <div class="command-cost">${costText}</div>
            <div class="progress-bar" data-type="${unitType}"><div class="progress-fill" style="width: ${progressPct}%;"></div></div>
        `;

        unitDiv.addEventListener('click', () => trainUnitFromBuilding(unitType, building));
        unitList.appendChild(unitDiv);
        const icon = unitDiv.querySelector('img');
        icon.onerror = () => icon.style.display = 'none';
        if (typeof attachGameTooltip === 'function') {
            attachGameTooltip(unitDiv, () => getUnitTooltipHTML(unitType));
        }
    });

    if (typeof renderResearchActions === 'function') {
        renderResearchActions(building, unitList);
    }
}

function handleBuildingDestruction(building) {
    if (typeof ParticleSystem !== 'undefined') {
        ParticleSystem.emitBuildingRubble(building.x, building.y, building.width, building.height);
    }
    if (typeof SFX !== 'undefined') SFX.buildingDestroyed();
    const cfg = getBuildingConfig(building.type);
    const owner = building.player || 'player';
    getAllUnits().forEach(unit => {
        if (unit.buildTargetId !== building.id) return;
        clearConstructionMovement(unit);
        unit.buildTargetId = null;
        unit.buildSlotIndex = null;
        unit.buildSpot = null;
        unit.state = 'idle';
    });
    building.health = 0;
    if (!building.underConstruction && building.type === 'house' && cfg?.population) {
        addPopulationCapForPlayer(owner, -cfg.population);
    }
    const container = getBuildingContainerForPlayer(owner);
    const idx = container.indexOf(building);
    if (idx > -1) container.splice(idx, 1);
    if (gameState.selectedBuilding === building) {
        gameState.selectedBuilding = null;
        updateSelectionInfo();
    }
    if (typeof markPathfindingDirty === 'function') markPathfindingDirty();
    checkWinConditions();
}
