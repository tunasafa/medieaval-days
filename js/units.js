/**
 * Comprehensive unit behavior system handling movement, combat, resource gathering,
 * pathfinding, embark/disembark mechanics, and unit separation. Manages unit states,
 * AI decision making, collision detection, and terrain validation for all unit types.
 */

const UNIT_SPATIAL_CELL_SIZE = 64;
const UNIT_MIN_SEPARATION = 24;
const VESSEL_MIN_SEPARATION = 32;
let __unitSpatialIndex = null;

function buildUnitSpatialIndex() {
    const buckets = new Map();
    const units = typeof getAllUnits === 'function'
        ? getAllUnits()
        : [...gameState.units, ...gameState.enemyUnits];
    for (const unit of units) {
        if (!unit || unit.health <= 0 || unit.state === 'embarked' ||
            !Number.isFinite(unit.x) || !Number.isFinite(unit.y)) continue;
        const cx = Math.floor(unit.x / UNIT_SPATIAL_CELL_SIZE);
        const cy = Math.floor(unit.y / UNIT_SPATIAL_CELL_SIZE);
        const key = `${cx},${cy}`;
        let bucket = buckets.get(key);
        if (!bucket) {
            bucket = [];
            buckets.set(key, bucket);
        }
        bucket.push(unit);
        unit.__spatialIndexKey = key;
    }
    __unitSpatialIndex = buckets;
}

function updateUnitSpatialIndexEntry(unit) {
    if (!__unitSpatialIndex || !unit || !Number.isFinite(unit.x) || !Number.isFinite(unit.y)) return;
    const cx = Math.floor(unit.x / UNIT_SPATIAL_CELL_SIZE);
    const cy = Math.floor(unit.y / UNIT_SPATIAL_CELL_SIZE);
    const nextKey = `${cx},${cy}`;
    const previousKey = unit.__spatialIndexKey;
    if (previousKey === nextKey) return;

    if (previousKey) {
        const previousBucket = __unitSpatialIndex.get(previousKey);
        if (previousBucket) {
            const index = previousBucket.indexOf(unit);
            if (index !== -1) previousBucket.splice(index, 1);
            if (previousBucket.length === 0) __unitSpatialIndex.delete(previousKey);
        }
    }

    let nextBucket = __unitSpatialIndex.get(nextKey);
    if (!nextBucket) {
        nextBucket = [];
        __unitSpatialIndex.set(nextKey, nextBucket);
    }
    if (!nextBucket.includes(unit)) nextBucket.push(unit);
    unit.__spatialIndexKey = nextKey;
}

function getNearbyUnits(unit, radius) {
    if (!__unitSpatialIndex) {
        return typeof getAllUnits === 'function'
            ? getAllUnits()
            : [...gameState.units, ...gameState.enemyUnits];
    }
    const cx = Math.floor(unit.x / UNIT_SPATIAL_CELL_SIZE);
    const cy = Math.floor(unit.y / UNIT_SPATIAL_CELL_SIZE);
    const span = Math.max(1, Math.ceil(radius / UNIT_SPATIAL_CELL_SIZE));
    const nearby = [];
    for (let y = cy - span; y <= cy + span; y++) {
        for (let x = cx - span; x <= cx + span; x++) {
            const bucket = __unitSpatialIndex.get(`${x},${y}`);
            if (bucket) nearby.push(...bucket);
        }
    }
    return nearby;
}

function getUnitSeparationDistance(unit) {
    return GAME_CONFIG.units[unit.type]?.vessel
        ? VESSEL_MIN_SEPARATION
        : UNIT_MIN_SEPARATION;
}

function getDeterministicSeparationDirection(unit, other) {
    const pair = `${unit.id ?? ''}:${other.id ?? ''}`;
    let seed = 0;
    for (let i = 0; i < pair.length; i++) seed = (seed * 31 + pair.charCodeAt(i)) >>> 0;
    const angle = (seed % 6283) / 1000;
    return { x: Math.cos(angle), y: Math.sin(angle) };
}

function hasUnitNearTarget(unit, targetX, targetY) {
    if (!Number.isFinite(targetX) || !Number.isFinite(targetY)) return false;
    const desired = getUnitSeparationDistance(unit);
    const units = typeof getAllUnits === 'function'
        ? getAllUnits()
        : [...gameState.units, ...gameState.enemyUnits];
    return units.some(other => other && other !== unit && other.health > 0 &&
        other.state !== 'embarked' &&
        Math.hypot(other.x - targetX, other.y - targetY) < desired);
}

/**
 * Prevents idle units from clustering by applying positional spread when units are too close.
 * Maintains unit spacing to improve visual clarity and prevent overlapping during idle states.
 * Only affects idle units, preserving intentional formations during movement or combat.
 * @param {Object} unit - The unit to check for spacing against other idle units
 */
function spreadIdleUnits(unit) {
    if (unit.state !== 'idle') return;

    const minDistance = getUnitSeparationDistance(unit);
    const minDistanceSq = minDistance * minDistance;
    let pushX = 0;
    let pushY = 0;

    for (const otherUnit of getNearbyUnits(unit, minDistance)) {
        if (otherUnit === unit || otherUnit.state !== 'idle') continue;
        const dx = unit.x - otherUnit.x;
        const dy = unit.y - otherUnit.y;
        const distSq = dx * dx + dy * dy;
        if (distSq < minDistanceSq) {
            const distance = Math.sqrt(distSq);
            const direction = distance > 0
                ? { x: dx / distance, y: dy / distance }
                : getDeterministicSeparationDirection(unit, otherUnit);
            const overlap = (minDistance - distance) * 0.5;
            pushX += direction.x * overlap;
            pushY += direction.y * overlap;
        }
    }

    if (pushX === 0 && pushY === 0) return;
    const mag = Math.hypot(pushX, pushY) || 1;
    const step = Math.min(1.2, mag);
    const newX = unit.x + (pushX / mag) * step;
    const newY = unit.y + (pushY / mag) * step;
    if (canTakeSeparationStep(unit, newX, newY)) {
        unit.x = newX;
        unit.y = newY;
        updateUnitSpatialIndexEntry(unit);
    }
}

function canTakeSeparationStep(unit, x, y) {
    if (!canTakeNavigationStep(unit, x, y)) return false;
    if (typeof isSpawnPathable !== 'function' || !isSpawnPathable(unit.x, unit.y, unit.type)) return true;
    const comfort = getNavigationComfortClearance(unit);
    const currentLane = getNavigationLaneClearance(unit, unit.x, unit.y);
    const nextLane = getNavigationLaneClearance(unit, x, y);
    if (currentLane >= comfort && nextLane < currentLane - 0.5) return false;
    return getNavigationSafetyScore(unit, x, y) >= getNavigationSafetyScore(unit, unit.x, unit.y) - 0.4;
}

function getNavigationLaneClearance(unit, x, y) {
    if (typeof pathfindingGrid === 'undefined' || !pathfindingGrid) return Infinity;
    const cellPos = pathfindingGrid.worldToGrid(x, y);
    if (!pathfindingGrid.isValidCell(cellPos.x, cellPos.y)) return -Infinity;
    const cell = pathfindingGrid.grid[cellPos.y][cellPos.x];
    const isVessel = !!GAME_CONFIG.units[unit.type]?.vessel;
    if (isVessel) return cell.waterClearance || 0;
    if (cell.isBridge) return cell.clearance || 0;
    return Math.min(cell.clearance || 0, cell.shoreClearance ?? cell.clearance ?? 0);
}

function getNavigationComfortClearance(unit) {
    const isVessel = !!GAME_CONFIG.units[unit.type]?.vessel;
    if (typeof pathfinder !== 'undefined' && pathfinder) {
        const clearanceCells = pathfinder.getClearanceCellsForUnit(unit.type);
        const obstacleClearance = typeof pathfinder.getPreferredObstacleClearanceCells === 'function'
            ? pathfinder.getPreferredObstacleClearanceCells(isVessel, clearanceCells)
            : (GAME_CONFIG.pathfinding?.obstaclePreferredClearanceCells ?? clearanceCells);
        return Math.max(
            pathfinder.getPreferredShoreClearanceCells(isVessel),
            obstacleClearance
        );
    }
    return isVessel
        ? (GAME_CONFIG.pathfinding?.shipShorelinePreferredClearanceCells ?? 4)
        : Math.max(
            GAME_CONFIG.pathfinding?.shorelinePreferredClearanceCells ?? 9,
            GAME_CONFIG.pathfinding?.obstaclePreferredClearanceCells ?? 6
        );
}

function getNavigationSafetyScore(unit, x, y) {
    if (typeof pathfindingGrid === 'undefined' || !pathfindingGrid) return 1;
    const cellPos = pathfindingGrid.worldToGrid(x, y);
    if (!pathfindingGrid.isValidCell(cellPos.x, cellPos.y)) return -Infinity;
    const cell = pathfindingGrid.grid[cellPos.y][cellPos.x];
    const isVessel = !!GAME_CONFIG.units[unit.type]?.vessel;

    if (isVessel) {
        if (!cell.isWater || cell.blocksUnits) return -Infinity;
        return Math.min(12, cell.waterClearance || 0);
    }
    if (cell.isWater || !cell.walkable) return -Infinity;
    const obstacleSafety = Math.min(12, cell.clearance || 0);
    const shoreSafety = Math.min(12, cell.shoreClearance ?? cell.clearance ?? 0);
    return obstacleSafety + shoreSafety * 1.5 + (cell.isBridge ? 8 : 0);
}

function canTakeNavigationStep(unit, x, y) {
    if (!validateTerrainMovement(unit, x, y)) return false;
    if (typeof isSpawnPathable !== 'function') return true;
    const nextPathable = isSpawnPathable(x, y, unit.type);
    if (nextPathable) return true;
    const currentPathable = isSpawnPathable(unit.x, unit.y, unit.type);
    if (currentPathable) return false;

    const currentScore = getNavigationSafetyScore(unit, unit.x, unit.y);
    const nextScore = getNavigationSafetyScore(unit, x, y);
    if (nextScore > currentScore + 0.01) return true;

    // If the unit is already inside one unpathable grid cell, small escape steps
    // can stay in that same cell for several frames. Permit flat-score motion so
    // it can physically reach the neighboring open cell instead of freezing.
    const currentCell = pathfindingGrid.worldToGrid(unit.x, unit.y);
    const nextCell = pathfindingGrid.worldToGrid(x, y);
    return currentCell.x === nextCell.x && currentCell.y === nextCell.y && nextScore >= currentScore;
}

function findSaferNavigationDirection(unit, maxCells = 6) {
    if (typeof pathfindingGrid === 'undefined' || !pathfindingGrid) return null;
    const origin = pathfindingGrid.worldToGrid(unit.x, unit.y);
    if (!pathfindingGrid.isValidCell(origin.x, origin.y)) return null;

    const currentScore = getNavigationSafetyScore(unit, unit.x, unit.y);
    let best = null;
    let bestScore = currentScore;
    for (let dy = -maxCells; dy <= maxCells; dy++) {
        for (let dx = -maxCells; dx <= maxCells; dx++) {
            if (dx === 0 && dy === 0) continue;
            const gx = origin.x + dx;
            const gy = origin.y + dy;
            if (!pathfindingGrid.isValidCell(gx, gy)) continue;
            const world = pathfindingGrid.gridToWorld(gx, gy);
            if (!validateTerrainMovement(unit, world.x, world.y)) continue;
            const dist = Math.hypot(dx, dy) || 1;
            const score = getNavigationSafetyScore(unit, world.x, world.y) - dist * 0.08;
            if (score > bestScore) {
                bestScore = score;
                best = world;
            }
        }
    }
    if (!best) return null;
    return { x: best.x - unit.x, y: best.y - unit.y };
}

/**
 * Applies continuous gentle separation forces to prevent unit stacking during movement.
 * Maintains unit mobility by allowing pass-through while reducing visual overlap.
 * Uses different separation distances for vessels vs land units for appropriate spacing.
 * @param {Object} unit - The moving unit to apply separation forces to
 */
function applyUnitSeparation(unit) {
    if (unit.state === 'building') return;
    // Do not pull a unit backwards while it is still following a multi-cell
    // route. The final crowding pass handles the approach and stopping area,
    // where separation matters most and cannot deadlock the route itself.
    if (unit.state === 'moving' && unit.path && unit.path.length > 1) return;
    updateUnitSpatialIndexEntry(unit);
    const desired = getUnitSeparationDistance(unit);
    const desiredSq = desired * desired;
    let pushX = 0;
    let pushY = 0;

    for (const other of getNearbyUnits(unit, desired)) {
        if (other === unit) continue;
        const dx = unit.x - other.x;
        const dy = unit.y - other.y;
        const distSq = dx * dx + dy * dy;
        if (distSq < desiredSq) {
            const dist = Math.sqrt(distSq);
            const direction = dist > 0
                ? { x: dx / dist, y: dy / dist }
                : getDeterministicSeparationDirection(unit, other);
            const overlap = desired - dist;
            pushX += direction.x * overlap;
            pushY += direction.y * overlap;
        }
    }

    if (pushX !== 0 || pushY !== 0) {
        // Limit the correction per tick to avoid jitter
        const maxStep = 1.2;
        const mag = Math.hypot(pushX, pushY) || 1;
        const stepX = (pushX / mag) * Math.min(maxStep, mag);
        const stepY = (pushY / mag) * Math.min(maxStep, mag);
        const nx = unit.x + stepX;
        const ny = unit.y + stepY;
        // Terrain-legal is not sufficient: crowding could otherwise press a
        // unit into the tight band against a building where it is legal to
        // stand but impossible to path out of. Never let separation make a
        // unit's pathability worse.
        if (canTakeSeparationStep(unit, nx, ny)) {
            unit.x = nx;
            unit.y = ny;
            updateUnitSpatialIndexEntry(unit);
        }
    }
}

function resolveUnitCrowding() {
    const allUnits = (typeof getAllUnits === 'function'
        ? getAllUnits()
        : [...gameState.units, ...gameState.enemyUnits]);
    allUnits.forEach(unit => { if (unit) unit.__crowdOrder = -1; });
    const units = allUnits
        .filter(unit => unit && unit.health > 0 && unit.state !== 'embarked' &&
            unit.state !== 'building' && Number.isFinite(unit.x) && Number.isFinite(unit.y) &&
            (unit.state !== 'moving' || !unit.path || unit.path.length <= 1));
    if (units.length < 2) return;

    units.forEach((unit, index) => { unit.__crowdOrder = index; });
    const maxDistance = Math.max(UNIT_MIN_SEPARATION, VESSEL_MIN_SEPARATION);

    // Multiple short passes converge dense groups without teleporting them or
    // allowing a correction to cross water, buildings, or an unsafe shoreline.
    for (let pass = 0; pass < 4; pass++) {
        buildUnitSpatialIndex();
        let moved = false;

        for (const unit of units) {
            for (const other of getNearbyUnits(unit, maxDistance)) {
                if (other === unit || other.state === 'building' ||
                    !Number.isInteger(other.__crowdOrder) ||
                    other.__crowdOrder <= unit.__crowdOrder) continue;

                const desired = Math.max(
                    getUnitSeparationDistance(unit),
                    getUnitSeparationDistance(other)
                );
                const dx = unit.x - other.x;
                const dy = unit.y - other.y;
                const distance = Math.hypot(dx, dy);
                if (distance >= desired) continue;

                const direction = distance > 0
                    ? { x: dx / distance, y: dy / distance }
                    : getDeterministicSeparationDirection(unit, other);
                const correction = Math.min(6, (desired - distance) * 0.5);
                const unitX = unit.x + direction.x * correction;
                const unitY = unit.y + direction.y * correction;
                const otherX = other.x - direction.x * correction;
                const otherY = other.y - direction.y * correction;
                const moveUnit = canTakeSeparationStep(unit, unitX, unitY);
                const moveOther = canTakeSeparationStep(other, otherX, otherY);

                if (moveUnit) {
                    unit.x = unitX;
                    unit.y = unitY;
                    updateUnitSpatialIndexEntry(unit);
                    moved = true;
                }
                if (moveOther) {
                    other.x = otherX;
                    other.y = otherY;
                    updateUnitSpatialIndexEntry(other);
                    moved = true;
                }
            }
        }

        if (!moved) break;
    }
}

/**
 * Pushes a unit that is standing in a legal-but-unpathable pocket (typically the
 * tight band hugging a building it was just trained from) back out toward open
 * ground. This is the runtime safety net: even if a unit ends up wedged by a
 * newly placed building, separation shove, or disembark, it will walk itself free
 * instead of staying selected-but-immobile forever.
 * @returns {boolean} true if the unit moved this tick.
 */
function nudgeUnitTowardOpenGround(unit) {
    const isVessel = !!GAME_CONFIG.units[unit.type]?.vessel;
    const speed = Math.max(0.6, (GAME_CONFIG.units[unit.type]?.speed || 1) * 0.75);

    // Aim toward the nearest safer navigation cell first; shoreline pockets need
    // an inland gradient, not just a push away from buildings.
    let awayX = 0;
    let awayY = 0;
    const saferDirection = findSaferNavigationDirection(unit);
    if (saferDirection) {
        awayX = saferDirection.x;
        awayY = saferDirection.y;
    } else {
        let best = Infinity;
        for (const b of [...gameState.buildings, ...gameState.enemyBuildings]) {
            const cx = clamp(unit.x, b.x, b.x + b.width);
            const cy = clamp(unit.y, b.y, b.y + b.height);
            const d = Math.hypot(unit.x - cx, unit.y - cy);
            if (d < best) {
                best = d;
                awayX = unit.x - (b.x + b.width / 2);
                awayY = unit.y - (b.y + b.height / 2);
            }
        }
    }
    const mag = Math.hypot(awayX, awayY);
    const baseAngle = mag > 0.001 ? Math.atan2(awayY, awayX) : Math.random() * Math.PI * 2;

    // Sweep outward from the away-direction so the unit prefers the shortest exit.
    for (const spread of [0, 0.4, -0.4, 0.8, -0.8, 1.2, -1.2, 1.6, -1.6, 2.0, -2.0, 2.5, -2.5, Math.PI]) {
        for (const dist of [speed, speed * 2, speed * 4]) {
            const a = baseAngle + spread;
            const nx = unit.x + Math.cos(a) * dist;
            const ny = unit.y + Math.sin(a) * dist;
            if (!canTakeNavigationStep(unit, nx, ny)) continue;
            if (isVessel && !isPointInWater(nx, ny)) continue;
            unit.x = nx;
            unit.y = ny;
            return true;
        }
    }
    return relocateUnitToPathableGround(unit);
}

function findNearestPathableUnitPosition(unit, originX = unit.x, originY = unit.y, maxRadius = 768, step = 24) {
    const currentClear = validateTerrainMovement(unit, originX, originY) &&
        !isPositionOccupied(originX, originY, unit, 15) &&
        isSpawnPathable(originX, originY, unit.type);
    if (currentClear) return { x: originX, y: originY };

    for (let radius = step; radius <= maxRadius; radius += step) {
        const samples = Math.max(16, Math.ceil((radius / step) * 12));
        for (let i = 0; i < samples; i++) {
            const angle = (i / samples) * Math.PI * 2;
            const x = clamp(originX + Math.cos(angle) * radius, 8, GAME_CONFIG.world.width - 8);
            const y = clamp(originY + Math.sin(angle) * radius, 8, GAME_CONFIG.world.height - 8);
            if (!validateTerrainMovement(unit, x, y)) continue;
            if (isPositionOccupied(x, y, unit, 15)) continue;
            if (!isSpawnPathable(x, y, unit.type)) continue;
            return { x, y };
        }
    }
    return null;
}

function relocateUnitToPathableGround(unit) {
    const spot = findNearestPathableUnitPosition(unit);
    if (!spot) return false;
    const retryTargetX = unit.requestedTargetX ?? unit.targetX;
    const retryTargetY = unit.requestedTargetY ?? unit.targetY;
    unit.x = spot.x;
    unit.y = spot.y;
    unit.prevX = spot.x;
    unit.prevY = spot.y;
    unit.path = null;
    unit.pathfindingFailed = false;
    if (Number.isFinite(retryTargetX) && Number.isFinite(retryTargetY) &&
        typeof setUnitDestination === 'function') {
        setUnitDestination(unit, retryTargetX, retryTargetY);
    }
    return true;
}

function updateUnits(deltaTime) {
    updateResourceRates();
    buildUnitSpatialIndex();
    gameState.units.forEach(unit => {
        updateUnit(unit, deltaTime);
        updateUnitAnimation(unit, deltaTime);
        // Keep spacing even when idle or moving
        applyUnitSeparation(unit);
    });
    gameState.enemyUnits.forEach(unit => {
        updateUnit(unit, deltaTime);
        updateEnemyAI(unit, deltaTime);
        updateUnitAnimation(unit, deltaTime);
        applyUnitSeparation(unit);
    });
    resolveUnitCrowding();
    if (typeof updateConstructionSites === 'function') {
        updateConstructionSites(deltaTime);
    }
    updateTrainingQueue(deltaTime);
}

function updateUnit(unit, deltaTime) {
    const config = typeof getEffectiveUnitConfig === 'function'
        ? getEffectiveUnitConfig(unit)
        : GAME_CONFIG.units[unit.type];
    const carryCapacity = typeof getUnitCarryCapacity === 'function'
        ? getUnitCarryCapacity(unit)
        : 25;

    // Handle pending disembark for transports that have arrived near shore
    if (unit._pendingDisembark && isTransport(unit) && unit.cargo && unit.cargo.length > 0) {
        // Check if transport is close to land (within disembark range) or has stopped moving
        const closeToLand = !isPointInWater(unit.x + 30, unit.y) || !isPointInWater(unit.x - 30, unit.y) ||
            !isPointInWater(unit.x, unit.y + 30) || !isPointInWater(unit.x, unit.y - 30);
        const stoppedMoving = unit.state !== 'moving' || (unit.path === null && unit.targetX === undefined);

        if (closeToLand || stoppedMoving) {
            disembarkCargoNearShore(unit);
            unit._pendingDisembark = false;
        }
    }

    // NEW EMBARK SYSTEM: When moving toward a transport, check for automatic embark
    if (unit.embarkTargetId && unit.state === 'moving' && !GAME_CONFIG.units[unit.type]?.vessel) {
        const transport = typeof findUnitById === 'function'
            ? findUnitById(unit.embarkTargetId)
            : [...gameState.units, ...gameState.enemyUnits].find(u => u.id === unit.embarkTargetId && isTransport(u));
        if (transport && isTransport(transport)) {
            const dist = Math.hypot(unit.x - transport.x, unit.y - transport.y);
            const capacity = GAME_CONFIG.units[transport.type].capacity || 0;
            const currentCargo = (transport.cargo || []).length;

            // Auto-embark when close enough and there's space
            if (dist <= 30 && currentCargo < capacity) {
                // Remove from active units and add to transport cargo
                unit.state = 'embarked';
                unit.embarkedIn = transport.id;
                transport.cargo = transport.cargo || [];
                transport.cargo.push(unit);

                // Remove unit from its active owner container
                const unitContainer = getUnitContainerForPlayer(unit.player);
                const unitIndex = unitContainer.indexOf(unit);
                if (unitIndex > -1) {
                    unitContainer.splice(unitIndex, 1);
                }

                // Clean up DOM overlay if exists
                if (unit._domGif && unit._domGif.parentNode) {
                    unit._domGif.parentNode.removeChild(unit._domGif);
                    unit._domGif = null;
                }

                return; // Unit is now embarked, stop processing
            }
        } else {
            unit.embarkTargetId = null; // Transport no longer exists
        }
    }
    if (unit.type === 'fishingBoat') {
        const inWater = isPointInWater(unit.x, unit.y);
        if (unit.state !== 'moving') {
            if (inWater) {
                unit.state = 'fishing';
                unit.gatherType = 'food';
                unit.gatheredAmount = (unit.gatheredAmount || 0) + (config.gatherRate || 2.5) * (deltaTime / 1000);
                if (unit.gatheredAmount >= carryCapacity) {
                    getResourcesForPlayer(unit.player).food += unit.gatheredAmount;
                    if (typeof SFX !== 'undefined') SFX.resourceDeposit();
                    showNotification(`+${Math.floor(unit.gatheredAmount)} food (fishing)`);
                    unit.gatheredAmount = 0;
                }
            } else {
                // Fishing boat is on land - use pathfinding to return to water
                const nearestWater = typeof findNearestWaterPoint === 'function' ? findNearestWaterPoint(unit.x, unit.y) :
                    gameState.worldObjects.find(obj => obj.type === 'water');
                if (nearestWater) {
                    const tx = nearestWater.width ? Math.max(nearestWater.x, Math.min(unit.x, nearestWater.x + nearestWater.width)) : nearestWater.x;
                    const ty = nearestWater.height ? Math.max(nearestWater.y, Math.min(unit.y, nearestWater.y + nearestWater.height)) : nearestWater.y;
                    // Use pathfinding instead of direct movement to respect terrain
                    setUnitDestination(unit, tx, ty);
                }
            }
        }
    }
    if (unit.state === 'moving') {
        if (unit.targetX !== undefined && unit.targetY !== undefined) {
            // Check if we have a path and use pathfinding
            if (unit.path && unit.path.length > 0) {
                const waypoint = getNextWaypoint(unit);
                if (waypoint) {
                    let dx = waypoint.x - unit.x;
                    let dy = waypoint.y - unit.y;
                    const distance = Math.sqrt(dx * dx + dy * dy);
                    // LOS-skip: if we can see farther ahead, pop current waypoint(s)
                    if (unit.path.length > 1) {
                        const far = unit.path[Math.min(2, unit.path.length - 1)];
                        if (hasLOSForUnit(unit.x, unit.y, far.x, far.y, unit)) {
                            unit.path.shift();
                            dx = far.x - unit.x;
                            dy = far.y - unit.y;
                        }
                    }

                    if (distance > 2) {
                        const moveSpeed = config.speed;
                        // Smooth steering especially for vessels
                        if (!!GAME_CONFIG.units[unit.type]?.vessel) {
                            const prevDirX = unit._dirX ?? 0;
                            const prevDirY = unit._dirY ?? 0;
                            const dirX = dx / distance;
                            const dirY = dy / distance;
                            const blend = 0.15; // lower = smoother turns
                            const sdx = prevDirX * (1 - blend) + dirX * blend;
                            const sdy = prevDirY * (1 - blend) + dirY * blend;
                            const sm = Math.hypot(sdx, sdy) || 1;
                            dx = sdx / sm * distance;
                            dy = sdy / sm * distance;
                            unit._dirX = sdx / sm;
                            unit._dirY = sdy / sm;
                        }
                        const dirX = dx / distance;
                        const dirY = dy / distance;
                        const newX = unit.x + dirX * moveSpeed;
                        const newY = unit.y + dirY * moveSpeed;

                        // STRICT TERRAIN VALIDATION - prevent any illegal movement
                        const isValidMove = canTakeNavigationStep(unit, newX, newY);

                        // Allow passing through units: ignore unit collisions here, only block on terrain/buildings/water
                        if (isValidMove && !isPositionOccupied(newX, newY, unit, 8, true)) {
                            unit.x = newX;
                            unit.y = newY;
                            applyUnitSeparation(unit); // keep spacing while moving
                        } else {
                            // Try slight variations if main path is blocked by a unit (but still validate terrain)
                            const alternativeAngles = [-0.2, 0.2, -0.4, 0.4];
                            let moved = false;

                            for (const angleOffset of alternativeAngles) {
                                const adjustedAngle = Math.atan2(dy, dx) + angleOffset;
                                const altX = unit.x + Math.cos(adjustedAngle) * moveSpeed;
                                const altY = unit.y + Math.sin(adjustedAngle) * moveSpeed;

                                // Always validate terrain first; ignore unit collisions to allow passing
                                if (canTakeNavigationStep(unit, altX, altY) && !isPositionOccupied(altX, altY, unit, 8, true)) {
                                    unit.x = altX;
                                    unit.y = altY;
                                    moved = true;
                                    applyUnitSeparation(unit);
                                    break;
                                }
                            }

                            // Axis-aligned corner slide: try x-only then y-only step
                            if (!moved) {
                                const sx = unit.x + dirX * moveSpeed;
                                const sy = unit.y;
                                if (canTakeNavigationStep(unit, sx, sy) && !isPositionOccupied(sx, sy, unit, 8, true)) {
                                    unit.x = sx; moved = true; applyUnitSeparation(unit);
                                } else {
                                    const sy2 = unit.y + dirY * moveSpeed;
                                    const sx2 = unit.x;
                                    if (canTakeNavigationStep(unit, sx2, sy2) && !isPositionOccupied(sx2, sy2, unit, 8, true)) {
                                        unit.y = sy2; moved = true; applyUnitSeparation(unit);
                                    }
                                }
                            }

                            // If still blocked, try to recalculate path
                            if (!moved) {
                                unit.pathRecalculateTimer = (unit.pathRecalculateTimer || 0) + deltaTime;
                                if (unit.pathRecalculateTimer > 2000) { // Recalculate every 2 seconds if stuck
                                    setUnitDestination(unit, unit.targetX, unit.targetY);
                                    unit.pathRecalculateTimer = 0;
                                }
                                // Avoid micro-sliding into buildings: only nudge if terrain allows
                                const sx = unit.x + (dx / distance) * (moveSpeed * 0.1);
                                const sy = unit.y + (dy / distance) * (moveSpeed * 0.1);
                                if (canTakeNavigationStep(unit, sx, sy)) {
                                    unit.x = sx;
                                    unit.y = sy;
                                    applyUnitSeparation(unit);
                                }
                            }
                        }
                    }
                    // Progress-based stuck detection with escalating recovery
                    const progNow = Date.now();
                    if (!unit._moveProg) unit._moveProg = { t: progNow, x: unit.x, y: unit.y };
                    if (!unit._stuckCount) unit._stuckCount = 0;
                    const dprog = Math.hypot(unit.x - unit._moveProg.x, unit.y - unit._moveProg.y);
                    if (progNow - unit._moveProg.t > 1200) {
                        if (dprog < 4) {
                            unit._stuckCount++;
                            if (unit._stuckCount <= 2) {
                                // Normal recalc
                                setUnitDestination(unit, unit.targetX, unit.targetY);
                            } else if (unit._stuckCount === 3) {
                                // Try offset destinations
                                const offsets = [32, -32];
                                let unstuck = false;
                                for (const ox of offsets) {
                                    for (const oy of offsets) {
                                        if (setUnitDestination(unit, unit.targetX + ox, unit.targetY + oy)) {
                                            unstuck = true;
                                            break;
                                        }
                                    }
                                    if (unstuck) break;
                                }
                                if (!unstuck) setUnitDestination(unit, unit.targetX, unit.targetY);
                            } else {
                                const retryX = unit.requestedTargetX ?? unit.targetX;
                                const retryY = unit.requestedTargetY ?? unit.targetY;
                                if (!nudgeUnitTowardOpenGround(unit) && !relocateUnitToPathableGround(unit)) {
                                    unit.path = null;
                                    unit.pathfindingFailed = true;
                                    unit.pathRetryTimer = 800;
                                }
                                if (Number.isFinite(retryX) && Number.isFinite(retryY)) {
                                    setUnitDestination(unit, retryX, retryY);
                                }
                                unit._stuckCount = Math.min(unit._stuckCount, 2);
                            }
                        } else {
                            // Making progress — reset stuck counter
                            unit._stuckCount = 0;
                        }
                        unit._moveProg = { t: progNow, x: unit.x, y: unit.y };
                    }
                } else {
                    // Reached destination
                    if (unit._repathAfterEscape) {
                        const retry = unit._repathAfterEscape;
                        unit._repathAfterEscape = null;
                        unit.path = null;
                        unit.pathfindingFailed = false;
                        setUnitDestination(unit, retry.x, retry.y);
                        return;
                    }
                    if (validateTerrainMovement(unit, unit.targetX, unit.targetY)) {
                        unit.x = unit.targetX;
                        unit.y = unit.targetY;
                    }
                    unit.state = 'idle';
                    unit._dirX = 0; unit._dirY = 0;
                    unit.targetX = undefined;
                    unit.targetY = undefined;
                    unit.requestedTargetX = undefined;
                    unit.requestedTargetY = undefined;
                    unit.path = null;
                    spreadIdleUnits(unit); // Spread out if too close to other idle units
                }
            } else {
                // Fallback to original movement system if no path or pathfinding failed
                if (unit.pathfindingFailed) {
                    nudgeUnitTowardOpenGround(unit);
                    unit.pathRetryTimer = (unit.pathRetryTimer || 0) + deltaTime;
                    if (unit.pathRetryTimer > 700) {
                        unit.pathRetryTimer = 0;
                        unit.pathfindingFailed = false;
                        setUnitDestination(unit,
                            unit.requestedTargetX ?? unit.targetX,
                            unit.requestedTargetY ?? unit.targetY);
                    }
                    return;
                }
                let dx = unit.targetX - unit.x;
                let dy = unit.targetY - unit.y;
                const distance = Math.sqrt(dx * dx + dy * dy);

                // A group can have several units assigned to the same grid cell.
                // Once another unit has claimed the target area, let this unit
                // settle at the nearest legal free point instead of orbiting it.
                const crowdedArrival = hasUnitNearTarget(unit, unit.targetX, unit.targetY);
                const arrivalDistance = crowdedArrival
                    ? getUnitSeparationDistance(unit)
                    : 5;
                if (distance > arrivalDistance) {
                    const moveSpeed = config.speed;
                    // Smooth steering for vessels
                    if (!!GAME_CONFIG.units[unit.type]?.vessel) {
                        const prevDirX = unit._dirX ?? 0;
                        const prevDirY = unit._dirY ?? 0;
                        const dirX = dx / distance;
                        const dirY = dy / distance;
                        const blend = 0.15;
                        const sdx = prevDirX * (1 - blend) + dirX * blend;
                        const sdy = prevDirY * (1 - blend) + dirY * blend;
                        const sm = Math.hypot(sdx, sdy) || 1;
                        dx = sdx / sm * distance;
                        dy = sdy / sm * distance;
                        unit._dirX = sdx / sm;
                        unit._dirY = sdy / sm;
                    }
                    const newX = unit.x + (dx / distance) * moveSpeed;
                    const newY = unit.y + (dy / distance) * moveSpeed;

                    // STRICT TERRAIN VALIDATION - prevent illegal movement through water/no-go zones
                    if (canTakeNavigationStep(unit, newX, newY) && !isPositionOccupied(newX, newY, unit, 8, true)) {
                        unit.x = newX;
                        unit.y = newY;
                        applyUnitSeparation(unit);
                    } else {
                        // Try alternative angles (always validate terrain first)
                        const alternativeAngles = [-0.3, 0.3, -0.6, 0.6, -0.9, 0.9];
                        let moved = false;

                        for (const angleOffset of alternativeAngles) {
                            const adjustedAngle = Math.atan2(dy, dx) + angleOffset;
                            const altX = unit.x + Math.cos(adjustedAngle) * moveSpeed;
                            const altY = unit.y + Math.sin(adjustedAngle) * moveSpeed;

                            if (canTakeNavigationStep(unit, altX, altY) && !isPositionOccupied(altX, altY, unit, 8, true)) {
                                unit.x = altX;
                                unit.y = altY;
                                moved = true;
                                applyUnitSeparation(unit);
                                break;
                            }
                        }

                        if (!moved) {
                            // If still stuck, try pathfinding
                            if (!unit.pathfindingFailed) {
                                setUnitDestination(unit, unit.targetX, unit.targetY);
                            } else {
                                // Ultimate fallback - minimal movement (respect terrain)
                                const fx = unit.x + (dx / distance) * (moveSpeed * 0.2);
                                const fy = unit.y + (dy / distance) * (moveSpeed * 0.2);
                                if (canTakeNavigationStep(unit, fx, fy)) {
                                    unit.x = fx;
                                    unit.y = fy;
                                    applyUnitSeparation(unit);
                                } else if (!nudgeUnitTowardOpenGround(unit)) {
                                    // Genuinely walled in and unable to shuffle:
                                    // retry the full path periodically instead of
                                    // burning CPU on a hopeless direct step.
                                    unit.pathRetryTimer = (unit.pathRetryTimer || 0) + deltaTime;
                                    if (unit.pathRetryTimer > 1000) {
                                        unit.pathRetryTimer = 0;
                                        unit.pathfindingFailed = false;
                                        setUnitDestination(unit,
                                            unit.requestedTargetX ?? unit.targetX,
                                            unit.requestedTargetY ?? unit.targetY);
                                    }
                                }
                            }
                        }
                    }
                } else {
                    // Reached destination
                    if (unit._repathAfterEscape) {
                        const retry = unit._repathAfterEscape;
                        unit._repathAfterEscape = null;
                        unit.path = null;
                        unit.pathfindingFailed = false;
                        setUnitDestination(unit, retry.x, retry.y);
                        return;
                    }
                    const finalX = unit.targetX;
                    const finalY = unit.targetY;

                    if (isPositionOccupied(finalX, finalY, unit, 15)) {
                        const freePos = getAvailablePosition(finalX, finalY, 15);
                        if (validateTerrainMovement(unit, freePos.x, freePos.y)) {
                            unit.x = freePos.x;
                            unit.y = freePos.y;
                        }
                    } else if (validateTerrainMovement(unit, finalX, finalY)) {
                        unit.x = finalX;
                        unit.y = finalY;
                    }

                    unit.state = 'idle';
                    unit._dirX = 0; unit._dirY = 0;
                    unit.targetX = undefined;
                    unit.targetY = undefined;
                    unit.requestedTargetX = undefined;
                    unit.requestedTargetY = undefined;
                    unit.path = null;
                }
            }
        }
    } else if (unit.state === 'attacking' && unit.target) {
        if ((typeof isLocalPlayerEntity !== 'function' || isLocalPlayerEntity(unit)) &&
            typeof canPlayerSeeEntity === 'function' &&
            !canPlayerSeeEntity(unit.target, true)) {
            unit.state = 'idle';
            unit.target = null;
            unit.targetPoint = undefined;
            unit.attackPath = null;
            unit.attackPathTimer = 0;
            unit.attackPathFailed = false;
            unit.attackPathFailCount = 0;
            unit.attackPathRetryDelay = 0;
            spreadIdleUnits(unit);
            return;
        }
        const tx = unit.targetPoint ? unit.targetPoint.x : unit.target.x;
        const ty = unit.targetPoint ? unit.targetPoint.y : unit.target.y;
        const dx = tx - unit.x;
        const dy = ty - unit.y;
        let distance = Math.sqrt(dx * dx + dy * dy);
        if (unit.target.width && unit.target.height) {
            const bx1 = unit.target.x;
            const by1 = unit.target.y;
            const bx2 = unit.target.x + unit.target.width;
            const by2 = unit.target.y + unit.target.height;
            const clampedX = Math.max(bx1, Math.min(unit.x, bx2));
            const clampedY = Math.max(by1, Math.min(unit.y, by2));
            const ex = clampedX - unit.x;
            const ey = clampedY - unit.y;
            distance = Math.sqrt(ex * ex + ey * ey);
        }
        if (unit.target.health <= 0) {
            unit.state = 'idle';
            unit.target = null;
            unit.targetPoint = undefined;
            unit.attackPath = null;
            unit.attackPathTimer = 0;
            unit.attackPathFailed = false;
            unit.attackPathFailCount = 0;
            unit.attackPathRetryDelay = 0;
            spreadIdleUnits(unit);
        } else if (distance > config.attackRange) {
            // Use pathfinding for approaching targets when attacking
            unit.attackPathTimer = (unit.attackPathTimer || 0) + deltaTime;
            const needsAttackPath = !unit.attackPath || unit.attackPath.length === 0;
            const attackRetryDelay = unit.attackPathFailed ? (unit.attackPathRetryDelay || 4500) : 0;
            if ((needsAttackPath && unit.attackPathTimer >= attackRetryDelay) ||
                (!needsAttackPath && unit.attackPathTimer > 3000)) {
                // Generate path to target every 3 seconds or if no path exists
                const nextPath = findPath(unit.x, unit.y, tx, ty, unit.type);
                unit.attackPath = nextPath;
                unit.attackPathTimer = 0;
                unit.attackPathFailed = !(nextPath && nextPath.length > 0);
                if (unit.attackPathFailed) {
                    unit.attackPathFailCount = (unit.attackPathFailCount || 0) + 1;
                    unit.attackPathRetryDelay = Math.min(15000, 3500 + unit.attackPathFailCount * 2200) + Math.random() * 1200;
                } else {
                    unit.attackPathFailCount = 0;
                    unit.attackPathRetryDelay = 0;
                }
            }

            if (unit.attackPath && unit.attackPath.length > 0) {
                // Follow attack path
                const waypoint = unit.attackPath[0];
                const waypointDx = waypoint.x - unit.x;
                const waypointDy = waypoint.y - unit.y;
                const waypointDistance = Math.hypot(waypointDx, waypointDy);

                if (waypointDistance < 18) {
                    unit.attackPath.shift(); // Remove reached waypoint
                }

                if (waypointDistance > 2) {
                    // LOS skip for attack path
                    if (unit.attackPath.length > 1) {
                        const far = unit.attackPath[Math.min(2, unit.attackPath.length - 1)];
                        if (hasLOSForUnit(unit.x, unit.y, far.x, far.y, unit)) {
                            unit.attackPath.shift();
                        }
                    }
                    const dirX = waypointDx / waypointDistance;
                    const dirY = waypointDy / waypointDistance;
                    const tentativeX = unit.x + dirX * config.speed;
                    const tentativeY = unit.y + dirY * config.speed;

                    // Add terrain validation for attacking units
                    const isValidMove = canTakeNavigationStep(unit, tentativeX, tentativeY);

                    if (isValidMove && !isPositionOccupied(tentativeX, tentativeY, unit, 12, true)) {
                        unit.x = tentativeX;
                        unit.y = tentativeY;
                    } else {
                        // Try slight angle variations for immediate obstacles
                        const alternativeAngles = [-0.3, 0.3, -0.6, 0.6];
                        let moved = false;

                        for (const angleOffset of alternativeAngles) {
                            const adjustedAngle = Math.atan2(waypointDy, waypointDx) + angleOffset;
                            const altX = unit.x + Math.cos(adjustedAngle) * config.speed;
                            const altY = unit.y + Math.sin(adjustedAngle) * config.speed;

                            const isValidAltMove = canTakeNavigationStep(unit, altX, altY);

                            if (isValidAltMove && !isPositionOccupied(altX, altY, unit, 12, true)) {
                                unit.x = altX;
                                unit.y = altY;
                                moved = true;
                                break;
                            }
                        }

                        if (!moved) {
                            // Axis slide
                            const sx = unit.x + dirX * config.speed;
                            if (canTakeNavigationStep(unit, sx, unit.y) && !isPositionOccupied(sx, unit.y, unit, 12, true)) {
                                unit.x = sx; moved = true;
                            } else {
                                const sy = unit.y + dirY * config.speed;
                                if (canTakeNavigationStep(unit, unit.x, sy) && !isPositionOccupied(unit.x, sy, unit, 12, true)) {
                                    unit.y = sy; moved = true;
                                }
                            }
                        }
                        if (!moved) {
                            // Force recalculate path if completely stuck
                            unit.attackPath = null;
                            unit.attackPathTimer = 2600 + Math.random() * 350;
                            unit.attackPathFailed = false;
                            unit.attackPathFailCount = 0;
                            unit.attackPathRetryDelay = 0;
                        }
                    }
                }
            } else {
                // Fallback to direct movement if pathfinding fails
                const tentativeX = unit.x + (dx / distance) * config.speed;
                const tentativeY = unit.y + (dy / distance) * config.speed;

                const isValidMove = canTakeNavigationStep(unit, tentativeX, tentativeY);

                if (isValidMove && !isPositionOccupied(tentativeX, tentativeY, unit, 12, true)) {
                    unit.x = tentativeX;
                    unit.y = tentativeY;
                }
            }
        } else {
            if (!unit.lastAttack || Date.now() - unit.lastAttack > 1000) {
                unit.lastAttack = Date.now();
                const hasProjectile = typeof ProjectileSystem !== 'undefined' &&
                    ProjectileSystem.getProjectileType(unit.type);

                if (hasProjectile) {
                    ProjectileSystem.spawn(unit, unit.target, unit.targetPoint);
                    if (typeof SFX !== 'undefined') {
                        if (unit.type === 'catapult' || unit.type === 'ballista') {
                            SFX.siegeFire();
                        } else {
                            SFX.arrowFire();
                        }
                    }
                } else {
                    unit.target.health -= config.attack;
                    if (typeof ParticleSystem !== 'undefined') {
                        ParticleSystem.emitDamageText(unit.target.x + (unit.target.width||0)/2, unit.target.y, config.attack);
                    }
                    if (typeof SFX !== 'undefined') SFX.swordHit();
                    if (typeof ParticleSystem !== 'undefined' && !(unit.target.width && unit.target.height)) {
                        ParticleSystem.emitBlood(unit.target.x, unit.target.y);
                    }
                    if (unit.target.health <= 0) {
                        if (unit.target.width && unit.target.height) {
                            handleBuildingDestruction(unit.target);
                        } else {
                            handleUnitDeath(unit.target);
                        }
                        unit.state = 'idle';
                        unit._dirX = 0; unit._dirY = 0;
                        unit.target = null;
                        unit.targetPoint = undefined;
                        unit.attackPath = null;
                        unit.attackPathTimer = 0;
                        unit.attackPathFailed = false;
                        unit.attackPathFailCount = 0;
                        unit.attackPathRetryDelay = 0;
                        spreadIdleUnits(unit);
                    }
                }
            }
        }
    } else if (unit.state === 'gathering' && unit.targetResource) {
        const targetX = unit.targetResource.x + unit.targetResource.width / 2 + (unit.gatherOffset?.dx || 0);
        const targetY = unit.targetResource.y + unit.targetResource.height / 2 + (unit.gatherOffset?.dy || 0);
        const dx = targetX - unit.x;
        const dy = targetY - unit.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        if (distance > 20) {
            // Use pathfinding for approaching resources
            unit.gatherPathTimer = (unit.gatherPathTimer || 0) + deltaTime;
            const needsGatherPath = !unit.gatherPath || unit.gatherPath.length === 0;
            const gatherRetryDelay = unit.gatherPathFailed ? (unit.gatherPathRetryDelay || 1800) : 0;
            if ((needsGatherPath && unit.gatherPathTimer >= gatherRetryDelay) ||
                (!needsGatherPath && unit.gatherPathTimer > 2000)) {
                const nextPath = findPath(unit.x, unit.y, targetX, targetY, unit.type);
                unit.gatherPath = nextPath;
                unit.gatherPathTimer = 0;
                unit.gatherPathFailed = !(nextPath && nextPath.length > 0);
                if (unit.gatherPathFailed) {
                    unit.gatherPathFailCount = (unit.gatherPathFailCount || 0) + 1;
                    unit.gatherPathRetryDelay = Math.min(7000, 1500 + unit.gatherPathFailCount * 900) + Math.random() * 500;
                } else {
                    unit.gatherPathFailCount = 0;
                    unit.gatherPathRetryDelay = 0;
                }
            }

            if (unit.gatherPath && unit.gatherPath.length > 0) {
                const waypoint = unit.gatherPath[0];
                const waypointDx = waypoint.x - unit.x;
                const waypointDy = waypoint.y - unit.y;
                const waypointDistance = Math.hypot(waypointDx, waypointDy);

                if (waypointDistance < 16) {
                    unit.gatherPath.shift();
                }

                if (waypointDistance > 2) {
                    // LOS skip for gather path
                    if (unit.gatherPath.length > 1) {
                        const far = unit.gatherPath[Math.min(2, unit.gatherPath.length - 1)];
                        if (hasLOSForUnit(unit.x, unit.y, far.x, far.y, unit)) {
                            unit.gatherPath.shift();
                        }
                    }
                    let ddx = waypointDx, ddy = waypointDy, dd = waypointDistance;
                    if (!!GAME_CONFIG.units[unit.type]?.vessel) {
                        const prevDirX = unit._dirX ?? 0;
                        const prevDirY = unit._dirY ?? 0;
                        const dirX = ddx / dd;
                        const dirY = ddy / dd;
                        const blend = 0.15;
                        const sdx = prevDirX * (1 - blend) + dirX * blend;
                        const sdy = prevDirY * (1 - blend) + dirY * blend;
                        const sm = Math.hypot(sdx, sdy) || 1;
                        ddx = sdx / sm * dd;
                        ddy = sdy / sm * dd;
                        unit._dirX = sdx / sm;
                        unit._dirY = sdy / sm;
                    }
                    const dirX = ddx / dd, dirY = ddy / dd;
                    const newX = unit.x + dirX * config.speed;
                    const newY = unit.y + dirY * config.speed;

                    const isValidMove = canTakeNavigationStep(unit, newX, newY);

                    if (isValidMove && !isPositionOccupied(newX, newY, unit, 8, true)) {
                        unit.x = newX;
                        unit.y = newY;
                    } else {
                        const alternativeAngles = [-0.4, 0.4, -0.8, 0.8];
                        let moved = false;

                        for (const angleOffset of alternativeAngles) {
                            const adjustedAngle = Math.atan2(waypointDy, waypointDx) + angleOffset;
                            const altX = unit.x + Math.cos(adjustedAngle) * config.speed;
                            const altY = unit.y + Math.sin(adjustedAngle) * config.speed;

                            const isValidAltMove = canTakeNavigationStep(unit, altX, altY);

                            if (isValidAltMove && !isPositionOccupied(altX, altY, unit, 8, true)) {
                                unit.x = altX;
                                unit.y = altY;
                                moved = true;
                                break;
                            }
                        }

                        if (!moved) {
                            // Axis slide to get around corners
                            const sx = unit.x + dirX * config.speed;
                            if (canTakeNavigationStep(unit, sx, unit.y) && !isPositionOccupied(sx, unit.y, unit, 8, true)) {
                                unit.x = sx; moved = true;
                            } else {
                                const sy = unit.y + dirY * config.speed;
                                if (canTakeNavigationStep(unit, unit.x, sy) && !isPositionOccupied(unit.x, sy, unit, 8, true)) {
                                    unit.y = sy; moved = true;
                                }
                            }
                        }
                        if (!moved) {
                            unit.gatherPath = null; // Recalculate path
                            unit.gatherPathTimer = 2000;
                            unit.gatherPathFailed = false;
                            unit.gatherPathFailCount = 0;
                            unit.gatherPathRetryDelay = 0;
                        }
                    }
                }
            } else {
                // Fallback to direct movement
                const newX = unit.x + (dx / distance) * config.speed;
                const newY = unit.y + (dy / distance) * config.speed;

                const isValidMove = canTakeNavigationStep(unit, newX, newY);

                if (isValidMove && !isPositionOccupied(newX, newY, unit, 8, true)) {
                    unit.x = newX;
                    unit.y = newY;
                } else {
                    const alternativeAngles = [-0.5, 0.5, -1, 1];
                    let moved = false;

                    for (const angleOffset of alternativeAngles) {
                        const adjustedAngle = Math.atan2(dy, dx) + angleOffset;
                        const altX = unit.x + Math.cos(adjustedAngle) * config.speed;
                        const altY = unit.y + Math.sin(adjustedAngle) * config.speed;

                        const isValidAltMove = canTakeNavigationStep(unit, altX, altY);

                        if (isValidAltMove && !isPositionOccupied(altX, altY, unit, 8, true)) {
                            unit.x = altX;
                            unit.y = altY;
                            moved = true;
                            break;
                        }
                    }

                    if (!moved) {
                        // Respect terrain when nudging to avoid stalling
                        const gx = unit.x + (dx / distance) * (config.speed * 0.3);
                        const gy = unit.y + (dy / distance) * (config.speed * 0.3);
                        if (canTakeNavigationStep(unit, gx, gy)) {
                            unit.x = gx;
                            unit.y = gy;
                        }
                    }
                }
            }
        } else {
            if (!unit.gatherStartTime) unit.gatherStartTime = Date.now();
            const gatherTime = (Date.now() - unit.gatherStartTime) / 1000;
            const gathered = Math.min(gatherTime * config.gatherRate, unit.targetResource.amount);
            unit.gatheredAmount = gathered;

            if (gathered >= unit.targetResource.amount || gathered >= carryCapacity) {
                unit.targetResource.amount -= unit.gatheredAmount;
                if (unit.targetResource.amount <= 0) {
                    unit.targetResource.amount = 0;
                }

                unit.state = 'returning';
                unit.gatherStartTime = null;
                unit.gatherPath = null;
                unit.gatherPathTimer = 0;
                unit.gatherPathFailed = false;
                unit.gatherPathFailCount = 0;
                unit.gatherPathRetryDelay = 0;
                unit.returnPath = null;
                unit.returnPathTimer = 0;
                unit.returnPathFailed = false;
                unit.returnPathFailCount = 0;
                unit.returnPathRetryDelay = 0;
                const tc = getBuildingsForPlayer(unit.player).find(b => b.type === 'town-center');
                if (tc) {
                    // Remember which side is closest at the moment we start returning, to avoid oscillation
                    let edge = getDropOffPointOutside(unit, tc);
                    unit.dropOffX = edge.x;
                    unit.dropOffY = edge.y;
                    // Infer fixed drop side from the edge point relative to TC
                    if (edge.x < tc.x) unit.dropSide = 'left';
                    else if (edge.x > tc.x + tc.width) unit.dropSide = 'right';
                    else if (edge.y < tc.y) unit.dropSide = 'top';
                    else unit.dropSide = 'bottom';
                    // Keep a handle to resume the exact same resource afterwards
                    unit.returnResource = unit.targetResource;
                    unit.returnGatherOffset = unit.gatherOffset;
                }
            }
        }
    } else if (unit.state === 'returning') {
        // Dynamically target the nearest Town Center border every tick and deposit once close enough
        const tc = getBuildingsForPlayer(unit.player).find(b => b.type === 'town-center');
        let targetX = unit.dropOffX;
        let targetY = unit.dropOffY;
        if (tc) {
            const margin = (typeof EDGE_CLEARANCE !== 'undefined' ? EDGE_CLEARANCE : 20);
            // Lock to the originally chosen closest side to avoid corner thrashing
            const side = unit.dropSide || 'bottom';
            if (side === 'left') {
                targetX = tc.x - margin;
                targetY = clamp(unit.y, tc.y, tc.y + tc.height);
            } else if (side === 'right') {
                targetX = tc.x + tc.width + margin;
                targetY = clamp(unit.y, tc.y, tc.y + tc.height);
            } else if (side === 'top') {
                targetX = clamp(unit.x, tc.x, tc.x + tc.width);
                targetY = tc.y - margin;
            } else { // bottom
                targetX = clamp(unit.x, tc.x, tc.x + tc.width);
                targetY = tc.y + tc.height + margin;
            }
            // Keep land/water and building buffers only
            unit.dropOffX = targetX;
            unit.dropOffY = targetY;
        }

        if (targetX === undefined || targetY === undefined) {
            // No valid target; fail-safe: finish delivery immediately
            if (unit.gatheredAmount > 0 && unit.gatherType) {
                const resources = getResourcesForPlayer(unit.player);
                resources[unit.gatherType] = (resources[unit.gatherType] || 0) + unit.gatheredAmount;
                if (typeof SFX !== 'undefined') SFX.resourceDeposit();
                showNotification(`+${Math.floor(unit.gatheredAmount)} ${unit.gatherType}`);
            }
            const lastGatherType = unit.gatherType;
            unit.gatheredAmount = 0;
            unit.gatherType = null;
            unit.dropOffX = undefined;
            unit.dropOffY = undefined;
            unit.dropSide = undefined;
            unit.returnPath = null;
            unit.returnPathTimer = 0;
            unit.returnPathFailed = false;
            unit.returnPathFailCount = 0;
            unit.returnPathRetryDelay = 0;
            unit.state = 'idle';
            spreadIdleUnits(unit);
            const nearbyResource = findNearestResource(unit, lastGatherType || 'food');
            if (nearbyResource && nearbyResource.amount > 0) {
                unit.state = 'gathering';
                unit.targetResource = nearbyResource;
                unit.gatherType = lastGatherType || nearbyResource.resourceType;
                unit.gatherPath = null;
                unit.gatherPathTimer = 0;
                unit.gatherPathFailed = false;
                unit.gatherPathFailCount = 0;
                unit.gatherPathRetryDelay = 0;
                const angle = Math.random() * Math.PI * 2;
                const r = 18 + Math.random() * 10;
                unit.gatherOffset = { dx: Math.cos(angle) * r, dy: Math.sin(angle) * r };
            }
            return;
        }

        const dx = targetX - unit.x;
        const dy = targetY - unit.y;
        const distance = Math.sqrt(dx * dx + dy * dy);

        // Consider delivery successful when within a generous radius of the nearest edge
        const depositRadius = 16; // pixels, a bit more generous
        if (distance > depositRadius) {
            // Try to use a path when available (recompute periodically)
            unit.returnPathTimer = (unit.returnPathTimer || 0) + deltaTime;
            const needsReturnPath = !unit.returnPath || unit.returnPath.length === 0;
            const returnRetryDelay = unit.returnPathFailed ? (unit.returnPathRetryDelay || 1800) : 0;
            if ((needsReturnPath && unit.returnPathTimer >= returnRetryDelay) ||
                (!needsReturnPath && unit.returnPathTimer > 2000)) {
                const nextPath = findPath(unit.x, unit.y, targetX, targetY, unit.type);
                unit.returnPath = nextPath;
                unit.returnPathTimer = 0;
                unit.returnPathFailed = !(nextPath && nextPath.length > 0);
                if (unit.returnPathFailed) {
                    unit.returnPathFailCount = (unit.returnPathFailCount || 0) + 1;
                    unit.returnPathRetryDelay = Math.min(7000, 1500 + unit.returnPathFailCount * 900) + Math.random() * 500;
                } else {
                    unit.returnPathFailCount = 0;
                    unit.returnPathRetryDelay = 0;
                }
            }

            if (unit.returnPath && unit.returnPath.length > 0) {
                const waypoint = unit.returnPath[0];
                const wx = waypoint.x - unit.x;
                const wy = waypoint.y - unit.y;
                const wd = Math.hypot(wx, wy);
                if (wd < 16) {
                    unit.returnPath.shift();
                }
                if (wd > 2) {
                    // LOS skip for return path
                    if (unit.returnPath.length > 1) {
                        const far = unit.returnPath[Math.min(2, unit.returnPath.length - 1)];
                        if (hasLOSForUnit(unit.x, unit.y, far.x, far.y, unit)) {
                            unit.returnPath.shift();
                        }
                    }
                    const dirX = wx / wd, dirY = wy / wd;
                    const nx = unit.x + dirX * config.speed;
                    const ny = unit.y + dirY * config.speed;
                    const ok = canTakeNavigationStep(unit, nx, ny);
                    if (ok && !isPositionOccupied(nx, ny, unit, 8, true)) {
                        unit.x = nx; unit.y = ny;
                    } else {
                        // slight alternatives
                        const alternatives = [-0.4, 0.4];
                        let moved = false;
                        for (const off of alternatives) {
                            const ang = Math.atan2(wy, wx) + off;
                            const ax = unit.x + Math.cos(ang) * config.speed;
                            const ay = unit.y + Math.sin(ang) * config.speed;
                            if (canTakeNavigationStep(unit, ax, ay) && !isPositionOccupied(ax, ay, unit, 8, true)) {
                                unit.x = ax; unit.y = ay; moved = true; break;
                            }
                        }
                        if (!moved) {
                            // axis slide
                            const sx = unit.x + dirX * config.speed;
                            if (canTakeNavigationStep(unit, sx, unit.y) && !isPositionOccupied(sx, unit.y, unit, 8, true)) {
                                unit.x = sx; moved = true;
                            } else {
                                const sy = unit.y + dirY * config.speed;
                                if (canTakeNavigationStep(unit, unit.x, sy) && !isPositionOccupied(unit.x, sy, unit, 8, true)) {
                                    unit.y = sy; moved = true;
                                }
                            }
                        }
                        if (!moved) {
                            // If stuck, force path recompute next tick
                            unit.returnPathTimer = 3001;
                            unit.returnPathFailed = false;
                            unit.returnPathFailCount = 0;
                            unit.returnPathRetryDelay = 0;
                        }
                    }
                }
            } else {
                // Fallback direct step towards nearest edge
                const newX = unit.x + (dx / distance) * config.speed;
                const newY = unit.y + (dy / distance) * config.speed;
                const isValidMove = canTakeNavigationStep(unit, newX, newY);
                if (isValidMove && !isPositionOccupied(newX, newY, unit, 8, true)) {
                    unit.x = newX;
                    unit.y = newY;
                } else {
                    const alternativeAngles = [-0.5, 0.5];
                    let moved = false;
                    for (const angleOffset of alternativeAngles) {
                        const adjustedAngle = Math.atan2(dy, dx) + angleOffset;
                        const altX = unit.x + Math.cos(adjustedAngle) * config.speed;
                        const altY = unit.y + Math.sin(adjustedAngle) * config.speed;
                        const isValidAltMove = canTakeNavigationStep(unit, altX, altY);
                        if (isValidAltMove && !isPositionOccupied(altX, altY, unit, 8, true)) {
                            unit.x = altX;
                            unit.y = altY;
                            moved = true;
                            break;
                        }
                    }
                    if (!moved) {
                        const rx = unit.x + (dx / distance) * (config.speed * 0.3);
                        const ry = unit.y + (dy / distance) * (config.speed * 0.3);
                        if (canTakeNavigationStep(unit, rx, ry)) {
                            unit.x = rx;
                            unit.y = ry;
                        }
                    }
                }
            }
        } else {
            // Deposit resources
            if (unit.gatheredAmount > 0 && unit.gatherType) {
                const resources = getResourcesForPlayer(unit.player);
                resources[unit.gatherType] = (resources[unit.gatherType] || 0) + unit.gatheredAmount;
                if (typeof SFX !== 'undefined') SFX.resourceDeposit();
                showNotification(`+${Math.floor(unit.gatheredAmount)} ${unit.gatherType}`);
            }

            const lastGatherType = unit.gatherType;

            unit.gatheredAmount = 0;
            unit.gatherType = null;
            unit.dropOffX = undefined;
            unit.dropOffY = undefined;
            unit.dropSide = undefined;
            unit.returnPath = null;
            unit.returnPathTimer = 0;
            unit.returnPathFailed = false;
            unit.returnPathFailCount = 0;
            unit.returnPathRetryDelay = 0;
            // Resume the SAME resource if it still has amount; else become idle
            const resumeRes = unit.returnResource;
            unit.returnResource = null;
            const resumeOffset = unit.returnGatherOffset;
            unit.returnGatherOffset = null;
            if (resumeRes && resumeRes.amount > 0) {
                unit.state = 'gathering';
                unit.targetResource = resumeRes;
                unit.gatherType = lastGatherType || resumeRes.resourceType;
                if (resumeOffset) unit.gatherOffset = resumeOffset;
                unit.gatherPath = null;
                unit.gatherPathTimer = 0;
                unit.gatherPathFailed = false;
                unit.gatherPathFailCount = 0;
                unit.gatherPathRetryDelay = 0;
            } else {
                unit.state = 'idle';
                spreadIdleUnits(unit);
            }
        }
    }
}

// Decide animation for units (GIFs animate in the DOM; this keeps state only)
function updateUnitAnimation(unit, deltaTime) {
    if (!unit.anim) {
        unit.anim = { action: 'idle', frame: 0, elapsed: 0, direction: 'south' };
    }
    // Basic movement-based state and direction (GIFs animate on their own in DOM)
    const dx = unit.x - (unit.prevX ?? unit.x);
    const dy = unit.y - (unit.prevY ?? unit.y);
    const moving = Math.hypot(dx, dy) > 0.2;
    const newAction = moving ? 'walk' : 'idle';
    if (unit.anim.action !== newAction) {
        unit.anim.action = newAction;
        unit.anim.elapsed = 0;
    }
    if (moving) {
        const angle = Math.atan2(dy, dx);
        const dirs = ['east', 'southeast', 'south', 'southwest', 'west', 'northwest', 'north', 'northeast'];
        const idx = (Math.round(((angle + Math.PI) / (Math.PI / 4))) % 8 + 8) % 8; // 0..7
        unit.anim.direction = dirs[idx];
    }
    unit.anim.elapsed += deltaTime;
    unit.prevX = unit.x;
    unit.prevY = unit.y;
}

// Update unit animation state based on movement
function updateUnitAnimations() {
    gameState.units.forEach(unit => {
        if (!unit.anim) unit.anim = { action: 'idle', frame: 0 };

        // Update animation based on unit state
        if (unit.state === 'moving' && unit.targetX !== undefined && unit.targetY !== undefined) {
            unit.anim.action = 'walk';
        } else {
            unit.anim.action = 'idle';
        }
    });

    gameState.enemyUnits.forEach(unit => {
        if (!unit.anim) unit.anim = { action: 'idle', frame: 0 };

        // Simple enemy animation logic
        if (unit.state === 'moving') {
            unit.anim.action = 'walk';
        } else {
            unit.anim.action = 'idle';
        }
    });
}

function updateTrainingQueue(deltaTime) {
    // Process training per building: one unit at a time per building
    const allPlayerBuildings = getAllBuildings().filter(b => isHumanFaction(b));
    for (const b of allPlayerBuildings) {
        if (b.underConstruction) continue;
        if (!b.trainingQueue || b.trainingQueue.length === 0) continue;
        const t = b.trainingQueue[0];
        t.timeRemaining -= deltaTime;
        if (t.timeRemaining <= 0) {
            const newUnit = spawnUnit(t.type, b);
            if (newUnit && b.rallyPoint) {
                setUnitDestination(newUnit, b.rallyPoint.x, b.rallyPoint.y);
            }
            if (newUnit) {
                b.trainingQueue.shift();
            } else {
                // Keep completed training queued until population or deployment
                // space opens. Losing the unit or forcing an unsafe spawn both
                // feel worse than a paused queue.
                t.timeRemaining = 250;
            }
        }
    }
}

// Simple LOS check for a specific unit using terrain validator
function hasLOSForUnit(x0, y0, x1, y1, unit) {
    if (typeof pathfinder !== 'undefined' && pathfinder &&
        typeof pathfindingGrid !== 'undefined' && pathfindingGrid) {
        const isVessel = !!GAME_CONFIG.units[unit.type]?.vessel;
        const clearanceCells = pathfinder.getClearanceCellsForUnit(unit.type);
        return typeof pathfinder.hasComfortLineOfSight === 'function'
            ? pathfinder.hasComfortLineOfSight(x0, y0, x1, y1, isVessel, clearanceCells)
            : pathfinder.hasLineOfSight(x0, y0, x1, y1, isVessel, clearanceCells);
    }
    const dx = x1 - x0, dy = y1 - y0;
    const dist = Math.hypot(dx, dy);
    if (dist === 0) return true;
    const step = 8; // px sample
    const steps = Math.max(2, Math.ceil(dist / step));
    for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        const sx = x0 + dx * t;
        const sy = y0 + dy * t;
        if (!validateTerrainMovement(unit, sx, sy)) return false;
        if (typeof isSpawnPathable === 'function' && !isSpawnPathable(sx, sy, unit.type)) return false;
    }
    return true;
}

// Compute minimum outward clearance from a building edge along a given side
// side: 'top' | 'right' | 'bottom' | 'left'
function computeSideMinClearance(building, unitType, side) {
    // Probe at least as deep as a spawn needs to be legal, otherwise every side
    // reports the same saturated depth and the "prefer the roomiest side" sort
    // below degenerates into a tie.
    const minProbeDepth = Math.ceil(getSpawnClearance(unitType) * 1.5);
    const stepAlong = 8; // sample along the side every 8px
    const stepOut = 4; // step outward when probing clearance
    let minClear = Infinity;
    const dummyUnit = { type: unitType };

    if (side === 'top' || side === 'bottom') {
        const yEdge = side === 'top' ? building.y : (building.y + building.height);
        const outSign = side === 'top' ? -1 : 1;
        for (let x = building.x + 4; x <= building.x + building.width - 4; x += stepAlong) {
            let depth = 0;
            // probe outward until blocked or reaching minProbeDepth
            while (depth <= minProbeDepth) {
                const px = x;
                const py = yEdge + outSign * (1 + depth);
                // keep within world
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
    const minRequired = Math.ceil(getSpawnClearance(unitType));
    const sides = ['top', 'right', 'bottom', 'left'];
    const allowed = [];
    for (const s of sides) {
        const clear = computeSideMinClearance(building, unitType, s);
        if (clear >= minRequired) allowed.push(s);
    }
    return allowed;
}

// Minimum distance a spawn must keep from any building edge. It is not enough to
// merely satisfy validateTerrainMovement(): the A* grid quantises clearance to
// whole cells, so a unit can sit at a legal-but-tight offset whose grid cell is
// unwalkable — a spot it can occupy but cannot path out of. Reserve a full
// pathfinding cell beyond the terrain radius so every spawn starts on a cell A*
// will actually expand.
function getSpawnClearance(unitType) {
    const terrainRadius = typeof getTerrainClearanceRadius === 'function'
        ? getTerrainClearanceRadius(unitType)
        : 16;
    const cellSize = (typeof pathfindingGrid !== 'undefined' && pathfindingGrid)
        ? pathfindingGrid.cellSize
        : (GAME_CONFIG.pathfinding?.cellSize || 32);
    return terrainRadius + cellSize;
}

// True when the position sits on a grid cell A* can route through for this unit.
function isSpawnPathable(x, y, unitType) {
    if (typeof pathfindingGrid === 'undefined' || !pathfindingGrid || !pathfinder) return true;
    const cell = pathfindingGrid.worldToGrid(x, y);
    if (!pathfindingGrid.isValidCell(cell.x, cell.y)) return false;
    const isShip = !!GAME_CONFIG.units[unitType]?.vessel;
    const clearanceCells = pathfinder.getClearanceCellsForUnit(unitType);
    return pathfinder.isWalkable(cell.x, cell.y, isShip, clearanceCells);
}

// Validate that a unit of unitType can safely exist and move from a position
function isValidSpawnPosition(x, y, unitType, buildingCenter) {
    const worldW = GAME_CONFIG.world.width;
    const worldH = GAME_CONFIG.world.height;
    const edgeMargin = 8; // treat world edges as no-go margin
    if (x < edgeMargin || y < edgeMargin || x > worldW - edgeMargin || y > worldH - edgeMargin) return false;

    // Terrain and collision checks
    const isVessel = !!GAME_CONFIG.units[unitType]?.vessel;
    const inWater = typeof isPointInWater === 'function' ? isPointInWater(x, y) : false;
    const onBridge = typeof isPointOnBridge === 'function' ? isPointOnBridge(x, y) : false;
    if (isVessel) {
        if (!inWater || onBridge) return false; // ships only in open water
    } else {
        if (inWater && !onBridge) return false; // land units not in water unless on bridge
    }

    // Keep clear of every building by the full spawn clearance, not just the
    // 17px collision buffer, so the unit is not born wedged against a wall.
    const spawnClearance = getSpawnClearance(unitType);
    for (const b of [...gameState.buildings, ...gameState.enemyBuildings]) {
        if (isPointInRoundedRectangle(x, y, b, spawnClearance)) return false;
    }

    // Not occupied by other units. Pass a typed probe so the water/land rule is
    // evaluated for THIS unit type — a null probe reports all water occupied,
    // which made every vessel spawn check fail.
    const dummyUnit = { type: unitType };
    if (isPositionOccupied(x, y, dummyUnit, 15)) return false;

    // Respect obstacles/no-go via movement validator
    if (!validateTerrainMovement(dummyUnit, x, y)) return false;

    // The decisive check: the unit must land on a cell A* can route out of.
    if (!isSpawnPathable(x, y, unitType)) return false;

    // Ensure the unit can move at least a few pixels in some direction from here (not stuck)
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

    // Optional: ensure outward direction from building center is movable
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

// Search along building borders with outward offsets to find a safe spawn location
function findSpawnPointNearBuilding(building, unitType) {
    const center = { x: building.x + building.width / 2, y: building.y + building.height / 2 };
    const sides = ['top', 'right', 'bottom', 'left'];
    // Prefer sides with larger clearance
    const byClear = sides.map(s => ({ side: s, clear: computeSideMinClearance(building, unitType, s) }))
        .sort((a, b) => b.clear - a.clear)
        .map(e => e.side);
    const stepAlong = 8;
    const pad = 6; // avoid exact corners
    // Start at the real minimum safe distance rather than a hardcoded 18px. The
    // old first ring sat 1px inside the terrain radius and on an unwalkable A*
    // cell, so the very first spawn attempt usually "succeeded" into a pocket the
    // unit could never path out of.
    const minOffset = Math.ceil(getSpawnClearance(unitType)) + 2;
    const offsets = [];
    for (let off = minOffset; off <= minOffset + 200; off += 12) offsets.push(off);

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
        // Try diagonals (corners) for this offset
        const corners = [
            { x: building.x - off, y: building.y - off },
            { x: building.x + building.width + off, y: building.y - off },
            { x: building.x - off, y: building.y + building.height + off },
            { x: building.x + building.width + off, y: building.y + building.height + off },
        ];
        for (const c of corners) { if (isValidSpawnPosition(c.x, c.y, unitType, center)) return c; }
    }

    // Spiral/radial fallback around center if edge scanning failed
    const maxR = Math.max(GAME_CONFIG.world.width, GAME_CONFIG.world.height) * 0.25; // bounded search
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

// BFS outward from building to find the nearest water cell for vessel spawning
function findWaterSpawnPoint(building, unitType = 'transportLarge') {
    if (!pathfindingGrid) return null;
    const cx = building.x + building.width / 2;
    const cy = building.y + building.height / 2;
    const startCell = pathfindingGrid.worldToGrid(cx, cy);
    const visited = new Set();
    const bfsQ = [startCell];
    let bfsHead = 0;
    visited.add(`${startCell.x},${startCell.y}`);
    const bfsDirs = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, 1], [1, -1], [-1, -1]];
    // Search up to ~200px radius (200/16 ≈ 13 cells, but BFS covers more)
    const maxCells = 8000;
    const probe = { type: unitType };
    while (bfsHead < bfsQ.length && bfsHead < maxCells) {
        const c = bfsQ[bfsHead++];
        if (pathfindingGrid.isValidCell(c.x, c.y) && pathfindingGrid.grid[c.y][c.x].isWater) {
            const wp = pathfindingGrid.gridToWorld(c.x, c.y);
            // Pass the vessel as the probe: with a null probe, isPositionOccupied()
            // reports every water tile as occupied, so this BFS could never return
            // a water cell and ships ended up spawned on land, unable to move.
            if (!isPositionOccupied(wp.x, wp.y, probe, 15) &&
                validateTerrainMovement(probe, wp.x, wp.y) &&
                isSpawnPathable(wp.x, wp.y, unitType)) {
                return wp;
            }
        }
        for (const [ddx, ddy] of bfsDirs) {
            const nx = c.x + ddx, ny = c.y + ddy;
            const nk = `${nx},${ny}`;
            if (!visited.has(nk) && pathfindingGrid.isValidCell(nx, ny)) {
                visited.add(nk);
                bfsQ.push({ x: nx, y: ny });
            }
        }
    }
    return null;
}

function spawnUnit(type, spawnAnchor) {
    let spawnBuilding = spawnAnchor || gameState.selectedBuilding;
    const owner = spawnBuilding?.player || getLocalPlayerId();

    // Check population limit before spawning
    const population = getPopulationForPlayer(owner);
    if (population.current >= population.max) {
        showNotification('Cannot complete training: population limit reached!');
        return;
    }

    if (!spawnBuilding || (spawnBuilding.player && spawnBuilding.player !== owner)) {
        const capable = {
            villager: ['town-center'],
            militia: ['barracks'], warrior: ['barracks'], axeman: ['barracks'],
            archer: ['archeryRange'], crossbowman: ['archeryRange'],
            ballista: ['craftery'], catapult: ['craftery'],
            fishingBoat: ['navy'], transportLarge: ['navy'], warship: ['navy']
        };
        const types = capable[type] || [];
        const ownerBuildings = getBuildingsForPlayer(owner);
        const b = ownerBuildings.find(b => b.player === owner && !b.underConstruction && types.includes(b.type));
        spawnBuilding = b || ownerBuildings.find(b =>
            b.type === 'town-center' && b.player === owner && !b.underConstruction
        );
    }
    if (!spawnBuilding) return;

    const centerX = spawnBuilding.x + spawnBuilding.width / 2;
    const centerY = spawnBuilding.y + spawnBuilding.height / 2;
    const isVessel = !!GAME_CONFIG.units[type]?.vessel;
    const spawnClearance = getSpawnClearance(type);
    const ringRadius = Math.max(spawnBuilding.width, spawnBuilding.height) / 2 + spawnClearance;

    // The grid must reflect current buildings before any spawn decision, or the
    // clearance checks below read a stale map and place the unit in a pocket.
    if (typeof pathfindingGrid !== 'undefined' && pathfindingGrid?._dirty &&
        typeof updatePathfindingGrid === 'function') {
        updatePathfindingGrid();
    }

    // For vessels, use water-specific BFS spawn first
    let position = null;
    if (isVessel) {
        position = findWaterSpawnPoint(spawnBuilding, type);
    }
    if (!position) {
        position = findSpawnPointNearBuilding(spawnBuilding, type);
    }

    // Last-resort placement. Sweep a widening ring and take the first spot that
    // fully validates. If none exists, do not deploy: spawning into a merely
    // terrain-legal fallback is exactly how units end up selected-but-immobile.
    if (!position) {
        outer:
        for (let radius = ringRadius; radius <= ringRadius + 600; radius += 24) {
            for (let i = 0; i < 24; i++) {
                const theta = (i / 24) * Math.PI * 2;
                const px = centerX + Math.cos(theta) * radius;
                const py = centerY + Math.sin(theta) * radius;
                if (isValidSpawnPosition(px, py, type, { x: centerX, y: centerY })) {
                    position = { x: px, y: py };
                    break outer;
                }
            }
        }
        if (!position) {
            showNotification(`No clear space to deploy ${type} — clear the area around the building.`);
            return null;
        }
    }

    const newUnit = {
        id: generateId(),
        type,
        player: owner,
        faction: owner,
        factionName: getFactionName(owner),
        factionColor: getFactionColor(owner),
        x: position.x,
        y: position.y,
        health: GAME_CONFIG.units[type].maxHealth,
        state: 'idle',
        target: null,
        isSelected: false,
        // Enhanced animation defaults for GIF support
        anim: type === 'villager' ? {
            action: 'idle',
            direction: 'down',
            frame: 0,
            elapsed: 0
        } : undefined,
        prevX: position.x,
        prevY: position.y
    };
    getUnitContainerForPlayer(owner).push(newUnit);
    addPopulationForPlayer(owner, 1);
    if (typeof ParticleSystem !== 'undefined') {
        ParticleSystem.emitUnitTrainEffect(position.x, position.y);
    }
    if (typeof SFX !== 'undefined') SFX.unitTrained();
    showNotification(`${type} training complete!`);
    return newUnit;
}

function trainUnit(type, producingBuilding = null) {
    const ageRestrictions = {
        'axeman': ['Feudal Age', 'Castle Age', 'Imperial Age'],
        'catapult': ['Castle Age', 'Imperial Age'],
        'ballista': ['Castle Age', 'Imperial Age'],
        'crossbowman': ['Feudal Age', 'Castle Age', 'Imperial Age']
    };

    const b = producingBuilding || gameState.selectedBuilding;
    const owner = b?.player || getLocalPlayerId();
    const currentAge = getAgeForPlayer(owner);

    if (ageRestrictions[type] && !ageRestrictions[type].includes(currentAge)) {
        showNotification(`Cannot train ${type} in ${currentAge}!`);
        return;
    }

    const unitConfig = GAME_CONFIG.units[type];
    if (!canAfford(unitConfig.cost, owner)) {
        showNotification(`Not enough resources!`);
        return;
    }
    const population = getPopulationForPlayer(owner);
    if (population.current >= population.max) {
        showNotification('Population limit reached. Build more houses.');
        return;
    }
    deductResources(unitConfig.cost, owner);
    if (!b) {
        showNotification('Select a building to train from.');
        return;
    }
    if (b.underConstruction) {
        showNotification(`${displayName(b.type)} is still under construction.`);
        return;
    }
    // Initialize per-building queue
    const trainingTime = typeof getProductionTimeMs === 'function'
        ? getProductionTimeMs(unitConfig.buildTime, 'unit', owner)
        : unitConfig.buildTime * 1000;
    b.trainingQueue = b.trainingQueue || [];
    b.trainingQueue.push({
        type,
        timeRemaining: trainingTime,
        totalTime: trainingTime
    });
    const qLen = b.trainingQueue.length;
    showNotification(`Queued ${type} at ${b.type} (${qLen} in line)`);
}

function trainUnitFromBuilding(type, building) {
    if (!building || building.health <= 0) {
        showNotification('Building is not available!');
        return;
    }
    if (typeof Multiplayer !== 'undefined' && Multiplayer.isClient) {
        if (typeof isLocalPlayerEntity === 'function' && !isLocalPlayerEntity(building)) return;
        Multiplayer.sendCommand({
            action: 'TRAIN',
            buildingId: building.id,
            unitType: type
        });
        showNotification(`Queued ${displayName(type)}.`);
        return;
    }
    trainUnit(type, building);
}

// NEW EMBARK FUNCTION: Simple distance-based embark when units are near transport
function embarkUnitsNearTransport(selectedUnits, transport) {
    if (!isTransport(transport)) return;

    const capacity = GAME_CONFIG.units[transport.type].capacity || 0;
    transport.cargo = transport.cargo || [];
    let embarked = 0;

    for (const unit of selectedUnits) {
        if (unit === transport) continue; // Don't embark the transport itself
        if (GAME_CONFIG.units[unit.type]?.vessel) continue; // Only land units can embark
        if (transport.cargo.length >= capacity) break; // No more space

        const dist = Math.hypot(unit.x - transport.x, unit.y - transport.y);
        if (dist <= 40) { // Within embark range
            // Store unit in transport cargo
            unit.state = 'embarked';
            unit.embarkedIn = transport.id;
            transport.cargo.push(unit);

            // Remove from active owner container
            const unitContainer = getUnitContainerForPlayer(unit.player);
            const unitIndex = unitContainer.indexOf(unit);
            if (unitIndex > -1) unitContainer.splice(unitIndex, 1);

            // Clean up unit selection
            if (unit.isSelected) {
                unit.isSelected = false;
                const selIndex = gameState.selectedUnits.indexOf(unit);
                if (selIndex > -1) {
                    gameState.selectedUnits.splice(selIndex, 1);
                }
            }

            // Clean up DOM overlay
            if (unit._domGif && unit._domGif.parentNode) {
                unit._domGif.parentNode.removeChild(unit._domGif);
                unit._domGif = null;
            }

            embarked++;
        }
    }

    if (embarked > 0) {
        showNotification(`${embarked} unit(s) embarked!`);
        updateSelectionInfo();
    }
}

// NEW DISEMBARK FUNCTION: Land units near shore in spread formation
function disembarkCargoNearShore(transport) {
    if (!isTransport(transport) || !transport.cargo || transport.cargo.length === 0) return;

    const disembarked = [];
    const baseX = transport.x;
    const baseY = transport.y;

    // Find safe landing spots in a spread pattern
    for (let i = 0; i < transport.cargo.length; i++) {
        const unit = transport.cargo[i];
        let landingSpot = null;

        // Try different angles and distances to find a safe landing spot on land
        for (let angle = 0; angle < Math.PI * 2; angle += Math.PI / 8) {
            for (let radius = 25; radius <= 60; radius += 10) {
                const testX = baseX + Math.cos(angle) * radius;
                const testY = baseY + Math.sin(angle) * radius;

                // Must be on valid land terrain (not water, not in no-go zones, not in buildings)
                // Use validateTerrainMovement with the actual cargo unit type so
                // its own clearance rules apply.
                const probe = { type: unit.type };
                if (!isPointInWater(testX, testY) &&
                    validateTerrainMovement(probe, testX, testY) &&
                    !isPositionOccupied(testX, testY, probe, 15) &&
                    // Do not unload troops onto a spot they cannot walk away from.
                    isSpawnPathable(testX, testY, unit.type) &&
                    testX >= 0 && testY >= 0 &&
                    testX < GAME_CONFIG.world.width && testY < GAME_CONFIG.world.height) {

                    landingSpot = { x: testX, y: testY };
                    break;
                }
            }
            if (landingSpot) break;
        }

        if (landingSpot) {
            // Place unit on land
            unit.x = landingSpot.x;
            unit.y = landingSpot.y;
            unit.state = 'idle';
            unit.embarkedIn = null;

            // Add back to active owner container
            getUnitContainerForPlayer(unit.player).push(unit);

            // Clean up DOM overlay to ensure visibility
            if (unit._domGif) {
                try {
                    if (unit._domGif.parentNode) {
                        unit._domGif.parentNode.removeChild(unit._domGif);
                    }
                } catch (e) { }
                unit._domGif = null;
            }

            disembarked.push(unit);
        }
    }

    // Remove disembarked units from cargo
    transport.cargo = transport.cargo.filter(unit => !disembarked.includes(unit));

    if (disembarked.length > 0) {
        showNotification(`${disembarked.length} unit(s) disembarked!`);
    }
}

function handleUnitDeath(unit) {
    if (typeof ParticleSystem !== 'undefined') {
        ParticleSystem.emitBlood(unit.x, unit.y);
    }
    if (typeof SFX !== 'undefined') SFX.unitDeath();
    const container = getUnitContainerForPlayer(unit.player);
    const index = container.indexOf(unit);
    if (index > -1) {
        container.splice(index, 1);
        if (isHumanFaction(unit)) addPopulationForPlayer(unit.player, -1);
    }
    if (unit.type === 'resource' && unit.amount !== undefined) {
        unit.amount = 0;
    }
}

// Rounded rectangle collision detection for buildings
function isPointInRoundedRectangle(x, y, building, buffer) {
    const cornerRadius = Math.min(32, Math.min(building.width, building.height) * 0.4); // Much more rounded corners

    // Expand the building bounds by the buffer
    const left = building.x - buffer;
    const right = building.x + building.width + buffer;
    const top = building.y - buffer;
    const bottom = building.y + building.height + buffer;

    // Check if point is in the main rectangle (excluding corners)
    if (x >= left + cornerRadius && x <= right - cornerRadius && y >= top && y <= bottom) {
        return true; // In horizontal band
    }
    if (y >= top + cornerRadius && y <= bottom - cornerRadius && x >= left && x <= right) {
        return true; // In vertical band
    }

    // Check rounded corners
    const corners = [
        { cx: left + cornerRadius, cy: top + cornerRadius },     // Top-left
        { cx: right - cornerRadius, cy: top + cornerRadius },    // Top-right
        { cx: left + cornerRadius, cy: bottom - cornerRadius },  // Bottom-left
        { cx: right - cornerRadius, cy: bottom - cornerRadius }  // Bottom-right
    ];

    for (const corner of corners) {
        const dx = x - corner.cx;
        const dy = y - corner.cy;
        const distanceSquared = dx * dx + dy * dy;

        if (distanceSquared <= cornerRadius * cornerRadius) {
            return true; // In corner circle
        }
    }

    return false;
}

const __blockingWorldObjectsCache = {
    source: null,
    length: -1,
    objects: []
};

function getBlockingWorldObjects() {
    const worldObjects = gameState.worldObjects || [];
    if (__blockingWorldObjectsCache.source === worldObjects &&
        __blockingWorldObjectsCache.length === worldObjects.length) {
        return __blockingWorldObjectsCache.objects;
    }
    __blockingWorldObjectsCache.source = worldObjects;
    __blockingWorldObjectsCache.length = worldObjects.length;
    __blockingWorldObjectsCache.objects = worldObjects.filter(obj =>
        obj.type === 'obstacle' || obj.type === 'no-go' || obj.type === 'noZone'
    );
    return __blockingWorldObjectsCache.objects;
}

function isPositionOccupied(x, y, excludeUnit = null, radius = 15, ignoreUnits = false) {
    // Check unit collisions only if not ignoring units
    if (!ignoreUnits) {
        const radiusSq = radius * radius;

        if (excludeUnit && excludeUnit.type === 'villager') {
            for (const unit of gameState.units) {
                if (unit === excludeUnit) continue;

                if (unit.type === 'villager' && excludeUnit.state === 'moving') {
                    continue;
                }

                const dx = x - unit.x;
                const dy = y - unit.y;
                if (dx * dx + dy * dy < radiusSq) {
                    return true;
                }
            }
            for (const unit of gameState.enemyUnits) {
                if (unit === excludeUnit) continue;

                if (unit.type === 'villager' && excludeUnit.state === 'moving') {
                    continue;
                }

                const dx = x - unit.x;
                const dy = y - unit.y;
                if (dx * dx + dy * dy < radiusSq) {
                    return true;
                }
            }
        } else {
            for (const unit of gameState.units) {
                if (unit === excludeUnit) continue;
                const dx = x - unit.x;
                const dy = y - unit.y;
                if (dx * dx + dy * dy < radiusSq) {
                    return true;
                }
            }
            for (const unit of gameState.enemyUnits) {
                if (unit === excludeUnit) continue;
                const dx = x - unit.x;
                const dy = y - unit.y;
                if (dx * dx + dy * dy < radiusSq) {
                    return true;
                }
            }
        }
    }

    for (const building of gameState.buildings) {
        if (isPointInRoundedRectangle(x, y, building, 17)) {
            return true;
        }
    }
    for (const building of gameState.enemyBuildings) {
        if (isPointInRoundedRectangle(x, y, building, 17)) {
            return true;
        }
    }

    // Use isPointInWater() for consistent tilemap-aware water detection
    const inWater = typeof isPointInWater === 'function' ? isPointInWater(x, y) :
        gameState.worldObjects.some(obj => obj.type === 'water' &&
            x >= obj.x && x <= obj.x + obj.width && y >= obj.y && y <= obj.y + obj.height);
    const onBridge = isPointOnBridge(x, y);

    // Determine unit type for terrain validation - works even when excludeUnit is null
    // by checking if the position is in water and not on a bridge (invalid for land units)
    if (excludeUnit) {
        const isVessel = !!GAME_CONFIG.units[excludeUnit.type]?.vessel;
        if (!isVessel) {
            // Land units cannot enter water unless on a bridge
            if (inWater && !onBridge) return true;
        } else {
            // Vessels must remain in water
            if (!inWater) return true;
        }
    } else {
        // When no excludeUnit is provided (spawn checks, disembark, etc.),
        // still validate water/bridge consistency to prevent invalid placements
        if (inWater && !onBridge) return true;
    }

    return false;
}

function getAvailablePosition(x, y, radius = 18) {
    let attempts = 0;
    const maxAttempts = 50;
    let currentX = x;
    let currentY = y;
    const radiusSq = radius * radius;

    while (attempts < maxAttempts) {
        let foundCollision = false;

        for (const unit of gameState.units) {
            const dx = currentX - unit.x;
            const dy = currentY - unit.y;
            if (dx * dx + dy * dy < radiusSq) {
                foundCollision = true;
                break;
            }
        }
        if (!foundCollision) {
            for (const unit of gameState.enemyUnits) {
                const dx = currentX - unit.x;
                const dy = currentY - unit.y;
                if (dx * dx + dy * dy < radiusSq) {
                    foundCollision = true;
                    break;
                }
            }
        }

        for (const building of gameState.buildings) {
            if (isPointInRoundedRectangle(currentX, currentY, building, 18)) {
                foundCollision = true;
                break;
            }
        }
        if (!foundCollision) {
            for (const building of gameState.enemyBuildings) {
                if (isPointInRoundedRectangle(currentX, currentY, building, 18)) {
                    foundCollision = true;
                    break;
                }
            }
        }

        if (!foundCollision) {
            return { x: currentX, y: currentY };
        }

        const angle = (attempts / maxAttempts) * Math.PI * 2 * 3;
        const distance = Math.min((attempts / maxAttempts) * 80, 80);
        currentX = x + Math.cos(angle) * distance;
        currentY = y + Math.sin(angle) * distance;

        currentX = Math.max(20, Math.min(GAME_CONFIG.world.width - 20, currentX));
        currentY = Math.max(20, Math.min(GAME_CONFIG.world.height - 20, currentY));

        attempts++;
    }

    return { x: currentX, y: currentY };
}

// STRICT TERRAIN VALIDATION FUNCTION
// Ensures units can never violate terrain rules
function validateTerrainMovement(unit, newX, newY) {
    const unitConfig = GAME_CONFIG.units[unit.type];
    const isVessel = !!unitConfig?.vessel;
    const clearanceRadius = (typeof getTerrainClearanceRadius === 'function')
        ? getTerrainClearanceRadius(unit)
        : 16;

    // Rectangular bounds fallback (still useful for extreme edges)
    if (newX - clearanceRadius < 0 || newY - clearanceRadius < 0 ||
        newX + clearanceRadius >= GAME_CONFIG.world.width ||
        newY + clearanceRadius >= GAME_CONFIG.world.height) {
        return false;
    }

    // Circular map boundaries
    const cx = GAME_CONFIG.world.width / 2;
    const cy = GAME_CONFIG.world.height / 2;
    const distFromCenter = Math.hypot(newX - cx, newY - cy);
    if (distFromCenter + clearanceRadius > GAME_CONFIG.world.radius) {
        return false;
    }

    // Building collision checks use the full unit footprint, not only the center.
    for (const building of gameState.buildings) {
        if (isPointInRoundedRectangle(newX, newY, building, clearanceRadius)) {
            return false; // Prevent movement into building zones
        }
    }
    for (const building of gameState.enemyBuildings) {
        if (isPointInRoundedRectangle(newX, newY, building, clearanceRadius)) {
            return false; // Prevent movement into building zones
        }
    }

    // Block generic no-go zones using an inflated rectangle so corners cannot clip.
    for (const obj of getBlockingWorldObjects()) {
        const left = obj.x - clearanceRadius;
        const right = obj.x + obj.width + clearanceRadius;
        const top = obj.y - clearanceRadius;
        const bottom = obj.y + obj.height + clearanceRadius;
        if (newX >= left && newX <= right && newY >= top && newY <= bottom) {
            return false;
        }
    }

    if (typeof isTerrainFootprintAllowedForUnit === 'function') {
        return isTerrainFootprintAllowedForUnit(unit, newX, newY, clearanceRadius);
    }

    const isInWater = isPointInWater(newX, newY);
    const isOnBridge = isPointOnBridge(newX, newY);
    return isVessel ? isInWater && !isOnBridge : (!isInWater || isOnBridge);
}
