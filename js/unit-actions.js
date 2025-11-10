/**
 * Manages unit actions such as attacking, gathering, and resource returning.
 * This file centralizes the logic for unit behaviors beyond simple movement.
 */

/**
 * Handles all non-movement actions for a unit based on its current state.
 * @param {Object} unit - The unit performing the action.
 * @param {number} deltaTime - The time elapsed since the last frame.
 */
function handleUnitActions(unit, deltaTime) {
    const config = GAME_CONFIG.units[unit.type];

    // Embarking logic
    if (unit.embarkTargetId && unit.state === 'moving' && !GAME_CONFIG.units[unit.type]?.vessel) {
        const transport = gameState.units.find(u => u.id === unit.embarkTargetId && isTransport(u));
        if (transport) {
            const dist = Math.hypot(unit.x - transport.x, unit.y - transport.y);
            const capacity = GAME_CONFIG.units[transport.type].capacity || 0;
            const currentCargo = (transport.cargo || []).length;

            if (dist <= 30 && currentCargo < capacity) {
                unit.state = 'embarked';
                unit.embarkedIn = transport.id;
                transport.cargo = transport.cargo || [];
                transport.cargo.push(unit);

                const unitIndex = gameState.units.indexOf(unit);
                if (unitIndex > -1) {
                    gameState.units.splice(unitIndex, 1);
                }

                if (unit._domGif && unit._domGif.parentNode) {
                    unit._domGif.parentNode.removeChild(unit._domGif);
                    unit._domGif = null;
                }
                return; // Unit is embarked, stop processing
            }
        } else {
            unit.embarkTargetId = null;
        }
    }

    // Fishing boat logic
    if (unit.type === 'fishingBoat') {
        const inWater = isPointInWater(unit.x, unit.y);
        if (unit.state !== 'moving') {
            if (inWater) {
                unit.state = 'fishing';
                unit.gatherType = 'food';
                unit.gatheredAmount = (unit.gatheredAmount || 0) + (config.gatherRate || 2.5) * (deltaTime / 1000);
                if (unit.gatheredAmount >= 25) {
                    gameState.resources.food += unit.gatheredAmount;
                    showNotification(`+${Math.floor(unit.gatheredAmount)} food (fishing)`);
                    unit.gatheredAmount = 0;
                }
            } else {
                const nearestWater = gameState.worldObjects.find(obj => obj.type === 'water');
                if (nearestWater) {
                    const tx = Math.max(nearestWater.x, Math.min(unit.x, nearestWater.x + nearestWater.width));
                    const ty = Math.max(nearestWater.y, Math.min(unit.y, nearestWater.y + nearestWater.height));
                    unit.state = 'moving';
                    unit.targetX = tx;
                    unit.targetY = ty;
                }
            }
        }
    }

    // Attacking logic
    if (unit.state === 'attacking' && unit.target) {
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
            spreadIdleUnits(unit);
        } else if (distance > config.attackRange) {
            if (!unit.attackPath || unit.attackPathTimer > 3000) {
                unit.attackPath = findPath(unit.x, unit.y, tx, ty, unit.type);
                unit.attackPathTimer = 0;
            }

            if (unit.attackPath && unit.attackPath.length > 0) {
                const waypoint = unit.attackPath[0];
                const waypointDx = waypoint.x - unit.x;
                const waypointDy = waypoint.y - unit.y;
                const waypointDistance = Math.hypot(waypointDx, waypointDy);

                if (waypointDistance < 18) {
                    unit.attackPath.shift();
                }

                if (waypointDistance > 2) {
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

                    const isValidMove = validateTerrainMovement(unit, tentativeX, tentativeY);

                    if (isValidMove && !isPositionOccupied(tentativeX, tentativeY, unit, 12, true)) {
                        unit.x = tentativeX;
                        unit.y = tentativeY;
                    } else {
                        const alternativeAngles = [-0.3, 0.3, -0.6, 0.6];
                        let moved = false;

                        for (const angleOffset of alternativeAngles) {
                            const adjustedAngle = Math.atan2(waypointDy, waypointDx) + angleOffset;
                            const altX = unit.x + Math.cos(adjustedAngle) * config.speed;
                            const altY = unit.y + Math.sin(adjustedAngle) * config.speed;

                            const isValidAltMove = validateTerrainMovement(unit, altX, altY);

                            if (isValidAltMove && !isPositionOccupied(altX, altY, unit, 12, true)) {
                                unit.x = altX;
                                unit.y = altY;
                                moved = true;
                                break;
                            }
                        }

                        if (!moved) {
                            const sx = unit.x + dirX * config.speed;
                            if (validateTerrainMovement(unit, sx, unit.y) && !isPositionOccupied(sx, unit.y, unit, 12, true)) {
                                unit.x = sx; moved = true;
                            } else {
                                const sy = unit.y + dirY * config.speed;
                                if (validateTerrainMovement(unit, unit.x, sy) && !isPositionOccupied(unit.x, sy, unit, 12, true)) {
                                    unit.y = sy; moved = true;
                                }
                            }
                        }
                        if (!moved) {
                            unit.attackPath = null;
                            unit.attackPathTimer = 3000;
                        }
                    }
                }
            } else {
                const tentativeX = unit.x + (dx / distance) * config.speed;
                const tentativeY = unit.y + (dy / distance) * config.speed;

                const isValidMove = validateTerrainMovement(unit, tentativeX, tentativeY);

                if (isValidMove && !isPositionOccupied(tentativeX, tentativeY, unit, 12, true)) {
                    unit.x = tentativeX;
                    unit.y = tentativeY;
                }
            }

            unit.attackPathTimer = (unit.attackPathTimer || 0) + deltaTime;
        } else {
            if (!unit.lastAttack || Date.now() - unit.lastAttack > 1000) {
                unit.target.health -= config.attack;
                unit.lastAttack = Date.now();
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
                    spreadIdleUnits(unit);
                }
            }
        }
    }
    // Gathering logic
    else if (unit.state === 'gathering' && unit.targetResource) {
        const targetX = unit.targetResource.x + unit.targetResource.width/2 + (unit.gatherOffset?.dx || 0);
        const targetY = unit.targetResource.y + unit.targetResource.height/2 + (unit.gatherOffset?.dy || 0);
        const dx = targetX - unit.x;
        const dy = targetY - unit.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        if (distance > 20) {
            if (!unit.gatherPath || unit.gatherPathTimer > 2000) {
                unit.gatherPath = findPath(unit.x, unit.y, targetX, targetY, unit.type);
                unit.gatherPathTimer = 0;
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

                    const isValidMove = validateTerrainMovement(unit, newX, newY);

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

                            const isValidAltMove = validateTerrainMovement(unit, altX, altY);

                            if (isValidAltMove && !isPositionOccupied(altX, altY, unit, 8, true)) {
                                unit.x = altX;
                                unit.y = altY;
                                moved = true;
                                break;
                            }
                        }

                        if (!moved) {
                            const sx = unit.x + dirX * config.speed;
                            if (validateTerrainMovement(unit, sx, unit.y) && !isPositionOccupied(sx, unit.y, unit, 8, true)) {
                                unit.x = sx; moved = true;
                            } else {
                                const sy = unit.y + dirY * config.speed;
                                if (validateTerrainMovement(unit, unit.x, sy) && !isPositionOccupied(unit.x, sy, unit, 8, true)) {
                                    unit.y = sy; moved = true;
                                }
                            }
                        }
                        if (!moved) {
                            unit.gatherPath = null;
                        }
                    }
                }
            } else {
                const newX = unit.x + (dx / distance) * config.speed;
                const newY = unit.y + (dy / distance) * config.speed;

                const isValidMove = validateTerrainMovement(unit, newX, newY);

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

                        const isValidAltMove = validateTerrainMovement(unit, altX, altY);

                        if (isValidAltMove && !isPositionOccupied(altX, altY, unit, 8, true)) {
                            unit.x = altX;
                            unit.y = altY;
                            moved = true;
                            break;
                        }
                    }

                    if (!moved) {
                        const gx = unit.x + (dx / distance) * (config.speed * 0.3);
                        const gy = unit.y + (dy / distance) * (config.speed * 0.3);
                        if (validateTerrainMovement(unit, gx, gy)) {
                            unit.x = gx;
                            unit.y = gy;
                        }
                    }
                }
            }

            unit.gatherPathTimer = (unit.gatherPathTimer || 0) + deltaTime;
        } else {
            if (!unit.gatherStartTime) unit.gatherStartTime = Date.now();
            const gatherTime = (Date.now() - unit.gatherStartTime) / 1000;
            const gathered = Math.min(gatherTime * config.gatherRate, unit.targetResource.amount);
            unit.gatheredAmount = gathered;

            if (gathered >= unit.targetResource.amount || gathered >= 25) {
                unit.targetResource.amount -= unit.gatheredAmount;
                if (unit.targetResource.amount <= 0) {
                    unit.targetResource.amount = 0;
                }

                unit.state = 'returning';
                unit.gatherStartTime = null;
                const tc = gameState.buildings.find(b => b.type === 'town-center' && b.player === 'player');
                if (tc) {
                    let edge = getDropOffPointOutside(unit, tc);
                    unit.dropOffX = edge.x;
                    unit.dropOffY = edge.y;
                    if (edge.x < tc.x) unit.dropSide = 'left';
                    else if (edge.x > tc.x + tc.width) unit.dropSide = 'right';
                    else if (edge.y < tc.y) unit.dropSide = 'top';
                    else unit.dropSide = 'bottom';
                    unit.returnResource = unit.targetResource;
                    unit.returnGatherOffset = unit.gatherOffset;
                }
            }
        }
    }
    // Returning resources logic
    else if (unit.state === 'returning') {
        const tc = gameState.buildings.find(b => b.type === 'town-center' && b.player === 'player');
        let targetX = unit.dropOffX;
        let targetY = unit.dropOffY;
        if (tc) {
            const margin = (typeof EDGE_CLEARANCE !== 'undefined' ? EDGE_CLEARANCE : 20);
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
            } else {
                targetX = clamp(unit.x, tc.x, tc.x + tc.width);
                targetY = tc.y + tc.height + margin;
            }
            unit.dropOffX = targetX;
            unit.dropOffY = targetY;
        }

        if (targetX === undefined || targetY === undefined) {
            if (unit.gatheredAmount > 0 && unit.gatherType) {
                gameState.resources[unit.gatherType] += unit.gatheredAmount;
                showNotification(`+${Math.floor(unit.gatheredAmount)} ${unit.gatherType}`);
            }
            const lastGatherType = unit.gatherType;
            unit.gatheredAmount = 0;
            unit.gatherType = null;
            unit.dropOffX = undefined;
            unit.dropOffY = undefined;
            unit.state = 'idle';
            spreadIdleUnits(unit);
            const nearbyResource = findNearestResource(unit, lastGatherType || 'food');
            if (nearbyResource && nearbyResource.amount > 0) {
                unit.state = 'gathering';
                unit.targetResource = nearbyResource;
                unit.gatherType = lastGatherType || nearbyResource.resourceType;
                const angle = Math.random() * Math.PI * 2;
                const r = 18 + Math.random() * 10;
                unit.gatherOffset = { dx: Math.cos(angle) * r, dy: Math.sin(angle) * r };
            }
            return;
        }

        const dx = targetX - unit.x;
        const dy = targetY - unit.y;
        const distance = Math.sqrt(dx * dx + dy * dy);

        const depositRadius = 16;
        if (distance > depositRadius) {
            unit.returnPathTimer = (unit.returnPathTimer || 0) + deltaTime;
            if (!unit.returnPath || unit.returnPathTimer > 2000) {
                unit.returnPath = findPath(unit.x, unit.y, targetX, targetY, unit.type);
                unit.returnPathTimer = 0;
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
                    if (unit.returnPath.length > 1) {
                        const far = unit.returnPath[Math.min(2, unit.returnPath.length - 1)];
                        if (hasLOSForUnit(unit.x, unit.y, far.x, far.y, unit)) {
                            unit.returnPath.shift();
                        }
                    }
                    const dirX = wx / wd, dirY = wy / wd;
                    const nx = unit.x + dirX * config.speed;
                    const ny = unit.y + dirY * config.speed;
                    const ok = validateTerrainMovement(unit, nx, ny);
                    if (ok && !isPositionOccupied(nx, ny, unit, 8, true)) {
                        unit.x = nx; unit.y = ny;
                    } else {
                        const alternatives = [-0.4, 0.4];
                        let moved = false;
                        for (const off of alternatives) {
                            const ang = Math.atan2(wy, wx) + off;
                            const ax = unit.x + Math.cos(ang) * config.speed;
                            const ay = unit.y + Math.sin(ang) * config.speed;
                            if (validateTerrainMovement(unit, ax, ay) && !isPositionOccupied(ax, ay, unit, 8, true)) {
                                unit.x = ax; unit.y = ay; moved = true; break;
                            }
                        }
                        if (!moved) {
                            const sx = unit.x + dirX * config.speed;
                            if (validateTerrainMovement(unit, sx, unit.y) && !isPositionOccupied(sx, unit.y, unit, 8, true)) {
                                unit.x = sx; moved = true;
                            } else {
                                const sy = unit.y + dirY * config.speed;
                                if (validateTerrainMovement(unit, unit.x, sy) && !isPositionOccupied(unit.x, sy, unit, 8, true)) {
                                    unit.y = sy; moved = true;
                                }
                            }
                        }
                        if (!moved) {
                            unit.returnPathTimer = 3001;
                        }
                    }
                }
            } else {
                const newX = unit.x + (dx / distance) * config.speed;
                const newY = unit.y + (dy / distance) * config.speed;
                const isValidMove = validateTerrainMovement(unit, newX, newY);
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
                        const isValidAltMove = validateTerrainMovement(unit, altX, altY);
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
                        if (validateTerrainMovement(unit, rx, ry)) {
                            unit.x = rx;
                            unit.y = ry;
                        }
                    }
                }
            }
        } else {
            if (unit.gatheredAmount > 0 && unit.gatherType) {
                gameState.resources[unit.gatherType] += unit.gatheredAmount;
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
            } else {
                unit.state = 'idle';
                spreadIdleUnits(unit);
            }
        }
    }
}
