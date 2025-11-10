/**
 * Handles unit movement, pathfinding, and collision avoidance.
 * This file is responsible for updating unit positions based on their state,
 * applying separation to prevent stacking, and validating terrain for movement.
 */

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
 * Handles the movement logic for a unit in the 'moving' state.
 * @param {Object} unit - The unit to move.
 * @param {number} deltaTime - The time elapsed since the last frame.
 */
function handleUnitMovement(unit, deltaTime) {
    const config = GAME_CONFIG.units[unit.type];
    if (unit.targetX !== undefined && unit.targetY !== undefined) {
        if (unit.path && unit.path.length > 0) {
            const waypoint = getNextWaypoint(unit);
            if (waypoint) {
                let dx = waypoint.x - unit.x;
                let dy = waypoint.y - unit.y;
                const distance = Math.sqrt(dx * dx + dy * dy);
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
                    const dirX = dx / distance;
                    const dirY = dy / distance;
                    const newX = unit.x + dirX * moveSpeed;
                    const newY = unit.y + dirY * moveSpeed;

                    const isValidMove = validateTerrainMovement(unit, newX, newY);

                    if (isValidMove && !isPositionOccupied(newX, newY, unit, 8, true)) {
                        unit.x = newX;
                        unit.y = newY;
                        applyUnitSeparation(unit);
                    } else {
                        const alternativeAngles = [-0.2, 0.2, -0.4, 0.4];
                        let moved = false;

                        for (const angleOffset of alternativeAngles) {
                            const adjustedAngle = Math.atan2(dy, dx) + angleOffset;
                            const altX = unit.x + Math.cos(adjustedAngle) * moveSpeed;
                            const altY = unit.y + Math.sin(adjustedAngle) * moveSpeed;

                            if (validateTerrainMovement(unit, altX, altY) && !isPositionOccupied(altX, altY, unit, 8, true)) {
                                unit.x = altX;
                                unit.y = altY;
                                moved = true;
                                applyUnitSeparation(unit);
                                break;
                            }
                        }

                        if (!moved) {
                            const sx = unit.x + dirX * moveSpeed;
                            const sy = unit.y;
                            if (validateTerrainMovement(unit, sx, sy) && !isPositionOccupied(sx, sy, unit, 8, true)) {
                                unit.x = sx; moved = true; applyUnitSeparation(unit);
                            } else {
                                const sy2 = unit.y + dirY * moveSpeed;
                                const sx2 = unit.x;
                                if (validateTerrainMovement(unit, sx2, sy2) && !isPositionOccupied(sx2, sy2, unit, 8, true)) {
                                    unit.y = sy2; moved = true; applyUnitSeparation(unit);
                                }
                            }
                        }

                        if (!moved) {
                            unit.pathRecalculateTimer = (unit.pathRecalculateTimer || 0) + deltaTime;
                            if (unit.pathRecalculateTimer > 2000) {
                                setUnitDestination(unit, unit.targetX, unit.targetY);
                                unit.pathRecalculateTimer = 0;
                            }
                            const sx = unit.x + (dx / distance) * (moveSpeed * 0.1);
                            const sy = unit.y + (dy / distance) * (moveSpeed * 0.1);
                            if (validateTerrainMovement(unit, sx, sy)) {
                                unit.x = sx;
                                unit.y = sy;
                                applyUnitSeparation(unit);
                            }
                        }
                    }
                }
                const progNow = Date.now();
                if (!unit._moveProg) unit._moveProg = { t: progNow, x: unit.x, y: unit.y };
                const dprog = Math.hypot(unit.x - unit._moveProg.x, unit.y - unit._moveProg.y);
                if (progNow - unit._moveProg.t > 1200) {
                    if (dprog < 4) {
                        setUnitDestination(unit, unit.targetX, unit.targetY);
                    }
                    unit._moveProg = { t: progNow, x: unit.x, y: unit.y };
                }
            } else {
                unit.x = unit.targetX;
                unit.y = unit.targetY;
                unit.state = 'idle';
                unit._dirX = 0; unit._dirY = 0;
                unit.targetX = undefined;
                unit.targetY = undefined;
                unit.path = null;
                spreadIdleUnits(unit);
            }
        } else {
            let dx = unit.targetX - unit.x;
            let dy = unit.targetY - unit.y;
            const distance = Math.sqrt(dx * dx + dy * dy);

            if (distance > 5) {
                const moveSpeed = config.speed;
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

                if (!isPositionOccupied(newX, newY, unit, 8, true)) {
                    unit.x = newX;
                    unit.y = newY;
                    applyUnitSeparation(unit);
                } else {
                    const alternativeAngles = [-0.3, 0.3, -0.6, 0.6, -0.9, 0.9];
                    let moved = false;

                    for (const angleOffset of alternativeAngles) {
                        const adjustedAngle = Math.atan2(dy, dx) + angleOffset;
                        const altX = unit.x + Math.cos(adjustedAngle) * moveSpeed;
                        const altY = unit.y + Math.sin(adjustedAngle) * moveSpeed;

                        if (!isPositionOccupied(altX, altY, unit, 8, true)) {
                            unit.x = altX;
                            unit.y = altY;
                            moved = true;
                            applyUnitSeparation(unit);
                            break;
                        }
                    }

                    if (!moved) {
                        if (!unit.pathfindingFailed) {
                            setUnitDestination(unit, unit.targetX, unit.targetY);
                        } else {
                            const fx = unit.x + (dx / distance) * (moveSpeed * 0.2);
                            const fy = unit.y + (dy / distance) * (moveSpeed * 0.2);
                            if (validateTerrainMovement(unit, fx, fy)) {
                                unit.x = fx;
                                unit.y = fy;
                                applyUnitSeparation(unit);
                            }
                        }
                    }
                }
            } else {
                const finalX = unit.targetX;
                const finalY = unit.targetY;

                if (isPositionOccupied(finalX, finalY, unit, 15)) {
                    const freePos = getAvailablePosition(finalX, finalY, 15);
                    unit.x = freePos.x;
                    unit.y = freePos.y;
                } else {
                    unit.x = finalX;
                    unit.y = finalY;
                }

                unit.state = 'idle';
                unit._dirX = 0; unit._dirY = 0;
                unit.targetX = undefined;
                unit.targetY = undefined;
                unit.path = null;
            }
        }
    }
}
