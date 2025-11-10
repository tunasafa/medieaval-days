/**
 * Handles unit movement, pathfinding, and collision avoidance.
 * This file is responsible for updating unit positions based on their state,
 * applying separation to prevent stacking, and validating terrain for movement.
 */

/**
 * Finds nearby obstacles for a given unit.
 * @param {Object} unit - The unit to check for nearby obstacles.
 * @param {number} radius - The radius to check for obstacles.
 * @returns {Array} - An array of nearby obstacles.
 */
function getNearbyObstacles(unit, radius) {
    const nearby = [];
    const allObstacles = [...gameState.buildings, ...gameState.enemyBuildings]; // Can add other obstacle types here

    for (const obstacle of allObstacles) {
        // Simple bounding box check for now
        const dist = Math.hypot(unit.x - (obstacle.x + obstacle.width / 2), unit.y - (obstacle.y + obstacle.height / 2));
        if (dist < radius + Math.max(obstacle.width, obstacle.height)) {
            nearby.push(obstacle);
        }
    }
    return nearby;
}

/**
 * Calculates a steering force for a unit to avoid obstacles and follow its path.
 * @param {Object} unit - The unit to calculate the steering force for.
 * @param {Object} waypoint - The current target waypoint.
 * @returns {Object} - An object with {x, y} components of the steering force.
 */
function calculateSteeringForce(unit, waypoint) {
    const config = GAME_CONFIG.units[unit.type];
    const maxSpeed = config.speed;
    const maxForce = 0.5; // Tweak this value

    // 1. Seek force (towards waypoint)
    const desiredVelocity = { x: waypoint.x - unit.x, y: waypoint.y - unit.y };
    const distance = Math.hypot(desiredVelocity.x, desiredVelocity.y);
    if (distance > 0) {
        desiredVelocity.x = (desiredVelocity.x / distance) * maxSpeed;
        desiredVelocity.y = (desiredVelocity.y / distance) * maxSpeed;
    }

    const currentVelocity = { x: unit.vx || 0, y: unit.vy || 0 };
    const steer = { x: desiredVelocity.x - currentVelocity.x, y: desiredVelocity.y - currentVelocity.y };

    // 2. Obstacle avoidance force
    const avoidanceRadius = 40;
    const nearbyObstacles = getNearbyObstacles(unit, avoidanceRadius);
    const avoidanceForce = { x: 0, y: 0 };

    for (const obs of nearbyObstacles) {
        const obsCenterX = obs.x + obs.width / 2;
        const obsCenterY = obs.y + obs.height / 2;
        const distToObs = Math.hypot(unit.x - obsCenterX, unit.y - obsCenterY);

        // Simple repulsion force
        const repulsionStrength = 1 - (distToObs / avoidanceRadius);
        if (repulsionStrength > 0) {
            avoidanceForce.x += (unit.x - obsCenterX) / distToObs * repulsionStrength;
            avoidanceForce.y += (unit.y - obsCenterY) / distToObs * repulsionStrength;
        }
    }

    // 3. Separation force (from other units)
    const separationForce = { x: 0, y: 0 };
    const desiredSeparation = 20;
    const allUnits = [...gameState.units, ...gameState.enemyUnits];
    for (const other of allUnits) {
        if (other === unit) continue;
        const d = Math.hypot(unit.x - other.x, unit.y - other.y);
        if ((d > 0) && (d < desiredSeparation)) {
            // Calculate vector pointing away from neighbor
            let diffX = unit.x - other.x;
            let diffY = unit.y - other.y;
            diffX /= d; // normalize
            diffY /= d;
            separationForce.x += diffX;
            separationForce.y += diffY;
        }
    }

    // Combine forces with weights
    steer.x += avoidanceForce.x * 2.0; // Avoidance is important
    steer.y += avoidanceForce.y * 2.0;
    steer.x += separationForce.x * 1.5; // Separation is also important
    steer.y += separationForce.y * 1.5;

    // Limit the steering force
    const steerMagnitude = Math.hypot(steer.x, steer.y);
    if (steerMagnitude > maxForce) {
        steer.x = (steer.x / steerMagnitude) * maxForce;
        steer.y = (steer.y / steerMagnitude) * maxForce;
    }

    return steer;
}

/**
 * Prevents idle units from clustering by applying positional spread when units are too close.
 * @param {Object} unit - The unit to check for spacing against other idle units
 */
function spreadIdleUnits(unit) {
    if (unit.state !== 'idle') return;

    const unitSize = 24;
    const minDistance = unitSize * 0.5;
    const allUnits = [...gameState.units, ...gameState.enemyUnits];

    for (const otherUnit of allUnits) {
        if (otherUnit === unit || otherUnit.state !== 'idle') continue;

        const dx = unit.x - otherUnit.x;
        const dy = unit.y - otherUnit.y;
        const distance = Math.hypot(dx, dy);

        if (distance < minDistance && distance > 0) {
            const pushDistance = (minDistance - distance) / 2;
            const pushAngle = Math.atan2(dy, dx);

            const pushX = Math.cos(pushAngle) * pushDistance;
            const pushY = Math.sin(pushAngle) * pushDistance;

            const newX = unit.x + pushX;
            const newY = unit.y + pushY;

            if (!isPositionOccupied(newX, newY, unit, 8)) {
                unit.x = newX;
                unit.y = newY;
            }

            const otherNewX = otherUnit.x - pushX;
            const otherNewY = otherUnit.y - pushY;

            if (!isPositionOccupied(otherNewX, otherNewY, otherUnit, 8)) {
                otherUnit.x = otherNewX;
                otherUnit.y = otherNewY;
            }
        }
    }
}

/**
 * Applies continuous gentle separation forces to prevent unit stacking during movement.
 * @param {Object} unit - The moving unit to apply separation forces to
 */
function applyUnitSeparation(unit) {
    const allUnits = [...gameState.units, ...gameState.enemyUnits];
    const isVessel = !!GAME_CONFIG.units[unit.type]?.vessel;
    const isEnemyIdle = unit.player === 'enemy' && unit.state === 'idle';
    const desired = isVessel ? 28 : (isEnemyIdle ? 24 : 18);
    let pushX = 0;
    let pushY = 0;
    for (const other of allUnits) {
        if (other === unit) continue;
        const dx = unit.x - other.x;
        const dy = unit.y - other.y;
        const dist = Math.hypot(dx, dy);
        if (dist > 0 && dist < desired) {
            const overlap = desired - dist;
            pushX += (dx / dist) * overlap;
            pushY += (dy / dist) * overlap;
        }
    }
    if (pushX !== 0 || pushY !== 0) {
        const maxStep = 0.9;
        const mag = Math.hypot(pushX, pushY) || 1;
        const stepX = (pushX / mag) * Math.min(maxStep, mag);
        const stepY = (pushY / mag) * Math.min(maxStep, mag);
        const nx = unit.x + stepX;
        const ny = unit.y + stepY;
        if (validateTerrainMovement(unit, nx, ny)) {
            unit.x = nx;
            unit.y = ny;
        }
    }
}

/**
 * Handles the movement logic for a unit in the 'moving' state using steering behaviors.
 * @param {Object} unit - The unit to move.
 * @param {number} deltaTime - The time elapsed since the last frame.
 */
function handleUnitMovement(unit, deltaTime) {
    const config = GAME_CONFIG.units[unit.type];
    if (unit.targetX === undefined || unit.targetY === undefined) {
        unit.state = 'idle';
        return;
    }

    if (!unit.path || unit.path.length === 0) {
        // No path, or path is complete. Move directly to target or stop.
        const dx = unit.targetX - unit.x;
        const dy = unit.targetY - unit.y;
        const distance = Math.hypot(dx, dy);

        if (distance < 5) {
            unit.state = 'idle';
            unit.vx = 0;
            unit.vy = 0;
            return;
        }

        // Attempt to repath if stuck
        setUnitDestination(unit, unit.targetX, unit.targetY);
        if (!unit.path || unit.path.length === 0) {
            // Repath failed, stop.
            unit.state = 'idle';
            return;
        }
    }

    const waypoint = getNextWaypoint(unit);
    if (!waypoint) {
        unit.state = 'idle';
        return;
    }

    const steeringForce = calculateSteeringForce(unit, waypoint);

    // Update velocity
    unit.vx = (unit.vx || 0) + steeringForce.x;
    unit.vy = (unit.vy || 0) + steeringForce.y;

    // Limit speed
    const speed = Math.hypot(unit.vx, unit.vy);
    const maxSpeed = config.speed;
    if (speed > maxSpeed) {
        unit.vx = (unit.vx / speed) * maxSpeed;
        unit.vy = (unit.vy / speed) * maxSpeed;
    }

    // Update position
    const newX = unit.x + unit.vx;
    const newY = unit.y + unit.vy;

    if (validateTerrainMovement(unit, newX, newY)) {
        unit.x = newX;
        unit.y = newY;
    } else {
        // If move is invalid, try to slide along the obstacle
        // Try moving only on X
        const slideX = unit.x + unit.vx;
        const slideY = unit.y;
        if (validateTerrainMovement(unit, slideX, slideY)) {
            unit.x = slideX;
            unit.y = slideY;
        } else {
            // Try moving only on Y
            const slideX2 = unit.x;
            const slideY2 = unit.y + unit.vy;
            if (validateTerrainMovement(unit, slideX2, slideY2)) {
                unit.x = slideX2;
                unit.y = slideY2;
            } else {
                // Can't move, so stop and try to repath next frame
                unit.vx = 0;
                unit.vy = 0;
                unit.pathRecalculateTimer = (unit.pathRecalculateTimer || 0) + deltaTime;
                if (unit.pathRecalculateTimer > 1000) { // Repath if stuck for 1 sec
                    setUnitDestination(unit, unit.targetX, unit.targetY);
                    unit.pathRecalculateTimer = 0;
                }
            }
        }
    }
}
