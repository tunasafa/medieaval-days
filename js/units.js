// Unit-related Functions

// Function to spread out idle units that are too close to each other
function spreadIdleUnits(unit) {
    if (unit.state !== 'idle') return;
    
    const unitSize = 24; // Standard unit size
    const minDistance = unitSize * 0.5; // Half unit size spacing
    const allUnits = [...gameState.units, ...gameState.enemyUnits];
    
    for (const otherUnit of allUnits) {
        if (otherUnit === unit || otherUnit.state !== 'idle') continue;
        
        const dx = unit.x - otherUnit.x;
        const dy = unit.y - otherUnit.y;
        const distance = Math.hypot(dx, dy);
        
        // If units are too close, move them apart
        if (distance < minDistance && distance > 0) {
            const pushDistance = (minDistance - distance) / 2;
            const pushAngle = Math.atan2(dy, dx);
            
            const pushX = Math.cos(pushAngle) * pushDistance;
            const pushY = Math.sin(pushAngle) * pushDistance;
            
            // Move current unit away
            const newX = unit.x + pushX;
            const newY = unit.y + pushY;
            
            // Check if new position is valid (not in water, obstacles, etc.)
            if (!isPositionOccupied(newX, newY, unit, 8)) {
                unit.x = newX;
                unit.y = newY;
            }
            
            // Move other unit in opposite direction
            const otherNewX = otherUnit.x - pushX;
            const otherNewY = otherUnit.y - pushY;
            
            if (!isPositionOccupied(otherNewX, otherNewY, otherUnit, 8)) {
                otherUnit.x = otherNewX;
                otherUnit.y = otherNewY;
            }
        }
    }
}

// Apply a gentle separation to keep units from stacking while still allowing them to pass through each other
function applyUnitSeparation(unit) {
    const allUnits = [...gameState.units, ...gameState.enemyUnits];
    const isVessel = !!GAME_CONFIG.units[unit.type]?.vessel;
    const desired = isVessel ? 28 : 18; // give ships more berth
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
        // Limit the correction per tick to avoid jitter
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

function updateUnits(deltaTime) {
    updateResourceRates();
    gameState.units.forEach(unit => {
        updateUnit(unit, deltaTime);
        updateUnitAnimation(unit, deltaTime);
        // Keep spacing even when idle or moving
        applyUnitSeparation(unit);
    });
    gameState.enemyUnits.forEach(unit => {
        updateUnit(unit, deltaTime);
        updateEnemyAI(unit);
        updateUnitAnimation(unit, deltaTime);
        applyUnitSeparation(unit);
    });
    updateTrainingQueue(deltaTime);
}

function updateUnit(unit, deltaTime) {
    const config = GAME_CONFIG.units[unit.type];
    // Simple EMBARK: land units head toward the transport center; auto-embark within pickup radius
    if (unit.embarkTargetId && unit.state === 'moving' && !GAME_CONFIG.units[unit.type]?.vessel) {
        const t = gameState.units.find(u => u.id === unit.embarkTargetId && isTransport(u));
        if (t) {
            // If close enough to transport center, attempt embark (auto-embark radius = 20)
            const pickupRadius = 20;
            const dist = Math.hypot(unit.x - t.x, unit.y - t.y);
            if (dist <= pickupRadius && (t.cargo ? t.cargo.length : 0) < (GAME_CONFIG.units[t.type].capacity || 0)) {
                tryEmbarkUnitsToTransport([unit], t);
                unit.embarkTargetId = null;
                return;
            }
            // Otherwise keep moving toward the transport center (target set on command)
        } else {
            unit.embarkTargetId = null;
        }
    }
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
    if (unit.state === 'moving') {
        if (unit.targetX !== undefined && unit.targetY !== undefined) {
            // Check if we have a path and use pathfinding
            if (unit.path && unit.path.length > 0) {
                const waypoint = getNextWaypoint(unit);
                if (waypoint) {
                    let dx = waypoint.x - unit.x;
                    let dy = waypoint.y - unit.y;
                    const distance = Math.sqrt(dx * dx + dy * dy);
                    
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
                        const newX = unit.x + (dx / distance) * moveSpeed;
                        const newY = unit.y + (dy / distance) * moveSpeed;
                        
                        // STRICT TERRAIN VALIDATION - prevent any illegal movement
                        const isValidMove = validateTerrainMovement(unit, newX, newY);
                        
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
                                if (validateTerrainMovement(unit, altX, altY) && !isPositionOccupied(altX, altY, unit, 8, true)) {
                                    unit.x = altX;
                                    unit.y = altY;
                                    moved = true;
                                    applyUnitSeparation(unit);
                                    break;
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
                                if (validateTerrainMovement(unit, sx, sy)) {
                                    unit.x = sx;
                                    unit.y = sy;
                                    applyUnitSeparation(unit);
                                }
                            }
                        }
                    }
                } else {
                    // Reached destination
                    unit.x = unit.targetX;
                    unit.y = unit.targetY;
                    unit.state = 'idle';
                    unit._dirX = 0; unit._dirY = 0;
                    unit.targetX = undefined;
                    unit.targetY = undefined;
                    unit.path = null;
                    spreadIdleUnits(unit); // Spread out if too close to other idle units
                }
            } else {
                // Fallback to original movement system if no path or pathfinding failed
                let dx = unit.targetX - unit.x;
                let dy = unit.targetY - unit.y;
                const distance = Math.sqrt(dx * dx + dy * dy);
                
                if (distance > 5) {
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
                    
                    if (!isPositionOccupied(newX, newY, unit, 8, true)) {
                        unit.x = newX;
                        unit.y = newY;
                        applyUnitSeparation(unit);
                    } else {
                        // Try alternative angles
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
                            // If still stuck, try pathfinding
                            if (!unit.pathfindingFailed) {
                                setUnitDestination(unit, unit.targetX, unit.targetY);
                            } else {
                                // Ultimate fallback - minimal movement (respect terrain)
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
                    // Reached destination
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
    } else if (unit.state === 'attacking' && unit.target) {
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
            // Use pathfinding for approaching targets when attacking
            if (!unit.attackPath || unit.attackPathTimer > 3000) {
                // Generate path to target every 3 seconds or if no path exists
                unit.attackPath = findPath(unit.x, unit.y, tx, ty, unit.type);
                unit.attackPathTimer = 0;
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
                    const tentativeX = unit.x + (waypointDx / waypointDistance) * config.speed;
                    const tentativeY = unit.y + (waypointDy / waypointDistance) * config.speed;
                    
                    // Add terrain validation for attacking units
                    const isValidMove = validateTerrainMovement(unit, tentativeX, tentativeY);
                    
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
                            
                            const isValidAltMove = validateTerrainMovement(unit, altX, altY);
                            
                            if (isValidAltMove && !isPositionOccupied(altX, altY, unit, 12, true)) {
                                unit.x = altX;
                                unit.y = altY;
                                moved = true;
                                break;
                            }
                        }
                        
                        if (!moved) {
                            // Force recalculate path if completely stuck
                            unit.attackPath = null;
                            unit.attackPathTimer = 3000;
                        }
                    }
                }
            } else {
                // Fallback to direct movement if pathfinding fails
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
    } else if (unit.state === 'gathering' && unit.targetResource) {
        const targetX = unit.targetResource.x + unit.targetResource.width/2 + (unit.gatherOffset?.dx || 0);
        const targetY = unit.targetResource.y + unit.targetResource.height/2 + (unit.gatherOffset?.dy || 0);
        const dx = targetX - unit.x;
        const dy = targetY - unit.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        if (distance > 20) {
            // Use pathfinding for approaching resources
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
                    const newX = unit.x + (ddx / dd) * config.speed;
                    const newY = unit.y + (ddy / dd) * config.speed;
                    
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
                            unit.gatherPath = null; // Recalculate path
                        }
                    }
                }
            } else {
                // Fallback to direct movement
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
                        // Respect terrain when nudging to avoid stalling
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
                    // Remember which side is closest at the moment we start returning, to avoid oscillation
                    let edge = getDropOffPointOutside(unit, tc);
                    if (isOnLandShoreBand(edge.x, edge.y, 1)) {
                        const dirX = Math.sign(edge.x - (tc.x + tc.width/2)) || 1;
                        const dirY = Math.sign(edge.y - (tc.y + tc.height/2)) || 1;
                        edge = { x: edge.x + dirX * 2, y: edge.y + dirY * 2 };
                    }
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
        const tc = gameState.buildings.find(b => b.type === 'town-center' && b.player === 'player');
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
            // Nudge away from potential water shore band
            if (isOnLandShoreBand(targetX, targetY, 1)) {
                const dirX = Math.sign(targetX - (tc.x + tc.width / 2)) || 1;
                const dirY = Math.sign(targetY - (tc.y + tc.height / 2)) || 1;
                targetX += dirX * 2; targetY += dirY * 2;
            }
            unit.dropOffX = targetX;
            unit.dropOffY = targetY;
        }

        if (targetX === undefined || targetY === undefined) {
            // No valid target; fail-safe: finish delivery immediately
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

        // Consider delivery successful when within a generous radius of the nearest edge
    const depositRadius = 16; // pixels, a bit more generous
        if (distance > depositRadius) {
            // Try to use a path when available (recompute periodically)
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
                    const nx = unit.x + (wx / wd) * config.speed;
                    const ny = unit.y + (wy / wd) * config.speed;
                    const ok = validateTerrainMovement(unit, nx, ny);
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
                            if (validateTerrainMovement(unit, ax, ay) && !isPositionOccupied(ax, ay, unit, 8, true)) {
                                unit.x = ax; unit.y = ay; moved = true; break;
                            }
                        }
                        if (!moved) {
                            // If stuck, force path recompute next tick
                            unit.returnPathTimer = 3001;
                        }
                    }
                }
            } else {
                // Fallback direct step towards nearest edge
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
            // Deposit resources
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
        const dirs = ['east','southeast','south','southwest','west','northwest','north','northeast'];
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

function pushUnitsAway(centerUnit) {
    const pushRadius = 25;
    const pushForce = 2;
    const allUnits = [...gameState.units, ...gameState.enemyUnits];
    
    allUnits.forEach(unit => {
        if (unit === centerUnit) return;
        
        const dx = unit.x - centerUnit.x;
        const dy = unit.y - centerUnit.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        
        if (distance < pushRadius && distance > 0) {
            const pushX = (dx / distance) * pushForce;
            const pushY = (dy / distance) * pushForce;
            
            unit.x += pushX;
            unit.y += pushY;
        }
    });
}

function updateTrainingQueue(deltaTime) {
    // Process training per building: one unit at a time per building
    const allPlayerBuildings = gameState.buildings.filter(b => b.player === 'player');
    for (const b of allPlayerBuildings) {
        if (!b.trainingQueue || b.trainingQueue.length === 0) continue;
        const t = b.trainingQueue[0];
        t.timeRemaining -= deltaTime;
        if (t.timeRemaining <= 0) {
            spawnUnit(t.type, b);
            b.trainingQueue.shift();
        }
    }
}

function spawnUnit(type, spawnAnchor) {
    let spawnBuilding = spawnAnchor || gameState.selectedBuilding;
    if (!spawnBuilding || (spawnBuilding.player && spawnBuilding.player !== 'player')) {
        const capable = {
            villager: ['town-center'],
            militia: ['barracks'], warrior: ['barracks'], axeman: ['barracks'],
            archer: ['archeryRange'], crossbowman: ['archeryRange'],
            ballista: ['craftery'], catapult: ['craftery'],
            fishingBoat: ['navy'], transportLarge: ['navy'], warship: ['navy']
        };
        const types = capable[type] || [];
        const b = gameState.buildings.find(b => b.player === 'player' && types.includes(b.type));
        spawnBuilding = b || gameState.buildings.find(b => b.type === 'town-center' && b.player === 'player');
    }
    if (!spawnBuilding) return;

    const centerX = spawnBuilding.x + spawnBuilding.width / 2;
    const centerY = spawnBuilding.y + spawnBuilding.height / 2;
    const ringRadius = Math.max(spawnBuilding.width, spawnBuilding.height) / 2 + 18;
    const tries = 24;
    let position = null;
    const isVessel = !!GAME_CONFIG.units[type]?.vessel;
    
    for (let i = 0; i < tries; i++) {
        const theta = (i / tries) * Math.PI * 2;
        const tx = centerX + Math.cos(theta) * ringRadius;
        const ty = centerY + Math.sin(theta) * ringRadius;
        
        // STRICT TERRAIN VALIDATION for spawning
        const isInWater = isPointInWater(tx, ty);
        const isOnBridge = isPointOnBridge(tx, ty);
        
        if (isVessel) {
            // Water units can ONLY spawn in water
            if (!isInWater) continue;
        } else {
            // Land units can NEVER spawn in water (except on bridges)
            if (isInWater && !isOnBridge) continue;
        }
        
        const free = getAvailablePosition(tx, ty, 15);
        if (free) {
            // Double-check terrain validation for the final position
            const finalInWater = isPointInWater(free.x, free.y);
            const finalOnBridge = isPointOnBridge(free.x, free.y);
            
            if (isVessel) {
                // Water unit must be in water
                if (finalInWater) {
                    position = free;
                    break;
                }
            } else {
                // Land unit must not be in water (unless on bridge)
                if (!finalInWater || finalOnBridge) {
                    position = free;
                    break;
                }
            }
        }
    }
    
    // Fallback position with terrain validation
    if (!position) {
        let fallbackX = centerX;
        let fallbackY = centerY + ringRadius;
        
        // Make sure fallback position is valid for unit type
        const fallbackInWater = isPointInWater(fallbackX, fallbackY);
        const fallbackOnBridge = isPointOnBridge(fallbackX, fallbackY);
        
        if (isVessel && !fallbackInWater) {
            // Find nearest water for vessel
            const nearestWater = gameState.worldObjects.find(obj => obj.type === 'water');
            if (nearestWater) {
                fallbackX = nearestWater.x + nearestWater.width / 2;
                fallbackY = nearestWater.y + nearestWater.height / 2;
            }
        } else if (!isVessel && fallbackInWater && !fallbackOnBridge) {
            // Move land unit away from water
            fallbackY = centerY - ringRadius; // Try the other side
            if (isPointInWater(fallbackX, fallbackY)) {
                fallbackX = centerX + ringRadius; // Try to the side
            }
        }
        
        position = { x: fallbackX, y: fallbackY };
    }

    gameState.units.push({
        id: generateId(),
        type,
        player: 'player',
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
    });
    gameState.population.current++;
    showNotification(`${type} training complete!`);
}

function trainUnit(type, producingBuilding = null) {
    const ageRestrictions = {
    'axeman': ['Feudal Age', 'Castle Age', 'Imperial Age'],
        'catapult': ['Castle Age', 'Imperial Age'],
        'ballista': ['Castle Age', 'Imperial Age'],
        'crossbowman': ['Feudal Age', 'Castle Age', 'Imperial Age']
    };
    
    if (ageRestrictions[type] && !ageRestrictions[type].includes(gameState.currentAge)) {
        showNotification(`Cannot train ${type} in ${gameState.currentAge}!`);
        return;
    }
    
    const unitConfig = GAME_CONFIG.units[type];
    if (!canAfford(unitConfig.cost)) {
        showNotification(`Not enough resources!`);
        return;
    }
    if (gameState.population.current >= gameState.population.max) {
        showNotification('Population limit reached. Build more houses.');
        return;
    }
    deductResources(unitConfig.cost);
    const b = producingBuilding || gameState.selectedBuilding;
    if (!b) {
        showNotification('Select a building to train from.');
        return;
    }
    // Initialize per-building queue
    b.trainingQueue = b.trainingQueue || [];
    b.trainingQueue.push({
        type,
        timeRemaining: unitConfig.buildTime * 1000,
        totalTime: unitConfig.buildTime * 1000
    });
    const qLen = b.trainingQueue.length;
    showNotification(`Queued ${type} at ${b.type} (${qLen} in line)`);
}

function trainUnitFromBuilding(type, building) {
    if (!building || building.health <= 0) {
        showNotification('Building is not available!');
        return;
    }
    trainUnit(type, building);
}

function tryEmbarkUnitsToTransport(units, transport) {
    if (!isTransport(transport)) return;
    transport.cargo = transport.cargo || [];
    const cap = GAME_CONFIG.units[transport.type].capacity || 0;
    for (const u of units) {
        if (u === transport) continue;
        if (!canEmbark(u)) continue;
        const dist = getDistance(u, transport);
        if (dist > 24) continue;
        if (transport.cargo.length >= cap) break;
        u._saved = { x: u.x, y: u.y, state: u.state };
        u.state = 'embarked';
        // Remove DOM overlay so stale references don't linger while embarked
        if (u._domGif) {
            try { if (u._domGif.parentNode) u._domGif.parentNode.removeChild(u._domGif); } catch(_) {}
            u._domGif = null;
        }
        transport.cargo.push(u);
        gameState.units = gameState.units.filter(x => x !== u);
    }
}

function disembarkCargo(transport) {
    if (!isTransport(transport) || !transport.cargo || transport.cargo.length === 0) return;
    const placed = [];
    const ox = transport.x, oy = transport.y;
    for (const u of [...transport.cargo]) {
        let drop = null;
        const R = 20;
        // Simple radial search around transport for first legal land/bridge spot, avoid 1px shoreline band
        for (let i = 0; i < 16; i++) {
            const ang = (i / 16) * Math.PI * 2;
            const tx = ox + Math.cos(ang) * R;
            const ty = oy + Math.sin(ang) * R;
            const legal = (!isPointInWater(tx, ty) || isPointOnBridge(tx, ty));
            if (legal && !isOnLandShoreBand(tx, ty, 1) && !isPositionOccupied(tx, ty, null, 12)) { drop = { x: Math.round(tx), y: Math.round(ty) }; break; }
        }
        if (!drop) continue;
        u.x = drop.x; u.y = drop.y; u.state = 'idle';
        // Ensure visibility by recreating DOM overlay next render
        if (u._domGif) { try { if (u._domGif.parentNode) u._domGif.parentNode.removeChild(u._domGif); } catch(_) {} u._domGif = null; }
        placed.push(u);
        gameState.units.push(u);
        transport.cargo = transport.cargo.filter(x => x !== u);
    }
    if (placed.length > 0) showNotification(`Disembarked ${placed.length} unit(s).`);
}

function handleUnitDeath(unit) {
    if (unit.player === 'player') {
        const index = gameState.units.indexOf(unit);
        if (index > -1) {
            gameState.units.splice(index, 1);
            gameState.population.current--;
        }
    } else {
        const index = gameState.enemyUnits.indexOf(unit);
        if (index > -1) gameState.enemyUnits.splice(index, 1);
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

function isPositionOccupied(x, y, excludeUnit = null, radius = 15, ignoreUnits = false) {
    // Check unit collisions only if not ignoring units
    if (!ignoreUnits) {
        const allUnits = [...gameState.units, ...gameState.enemyUnits];
        
        if (excludeUnit && excludeUnit.type === 'villager') {
            for (const unit of allUnits) {
                if (unit === excludeUnit) continue;
                
                if (unit.type === 'villager' && excludeUnit.state === 'moving') {
                    continue;
                }
                
                const distance = Math.sqrt(Math.pow(x - unit.x, 2) + Math.pow(y - unit.y, 2));
                if (distance < radius) {
                    return true;
                }
            }
        } else {
            for (const unit of allUnits) {
                if (unit === excludeUnit) continue;
                const distance = Math.sqrt(Math.pow(x - unit.x, 2) + Math.pow(y - unit.y, 2));
                if (distance < radius) {
                    return true;
                }
            }
        }
    }
    
    for (const building of [...gameState.buildings, ...gameState.enemyBuildings]) {
        if (isPointInRoundedRectangle(x, y, building, 17)) {
            return true;
        }
    }

    const inWater = gameState.worldObjects.some(obj => obj.type === 'water' &&
        x >= obj.x && x <= obj.x + obj.width && y >= obj.y && y <= obj.y + obj.height);
    const onBridge = gameState.worldObjects.some(obj => obj.type === 'bridge' &&
        x >= obj.x && x <= obj.x + obj.width && y >= obj.y && y <= obj.y + obj.height);
    if (excludeUnit) {
        const isVessel = !!GAME_CONFIG.units[excludeUnit.type]?.vessel;
        if (!isVessel) {
            // Land units cannot enter water unless on a bridge
            if (inWater && !onBridge) return true;
            // Allow approaching shoreline; do not block on shore band alone
        } else {
            // Vessels must remain in water
            if (!inWater) return true;
            // Allow near inner water band so ships can skim the shore without getting stuck
        }
    }
    
    return false;
}

function getAvailablePosition(x, y, radius = 18) {
    const allUnits = [...gameState.units, ...gameState.enemyUnits];
    let attempts = 0;
    const maxAttempts = 50;
    let currentX = x;
    let currentY = y;
    
    while (attempts < maxAttempts) {
        let foundCollision = false;
        
        for (const unit of allUnits) {
            const distance = Math.sqrt(Math.pow(currentX - unit.x, 2) + Math.pow(currentY - unit.y, 2));
            if (distance < radius) {
                foundCollision = true;
                break;
            }
        }
        
        for (const building of [...gameState.buildings, ...gameState.enemyBuildings]) {
            if (isPointInRoundedRectangle(currentX, currentY, building, 18)) {
                foundCollision = true;
                break;
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
    const isInWater = isPointInWater(newX, newY);
    const isOnBridge = isPointOnBridge(newX, newY);

    // Additional building collision check with larger buffer for movement
    for (const building of [...gameState.buildings, ...gameState.enemyBuildings]) {
        if (isPointInRoundedRectangle(newX, newY, building, 17)) { // at least 2px buffer beyond art
            return false; // Prevent movement into building zones
        }
    }
    // Block generic no-go zones (obstacles, explicit no-go types)
    for (const obj of gameState.worldObjects) {
        if (obj.type === 'obstacle' || obj.type === 'no-go' || obj.type === 'noZone') {
            const left = obj.x - 2, right = obj.x + obj.width + 2;
            const top = obj.y - 2, bottom = obj.y + obj.height + 2;
            if (newX >= left && newX <= right && newY >= top && newY <= bottom) {
                return false;
            }
        }
    }
    
    if (isVessel) {
        // WATER UNITS: Can ONLY move in water, never on land
        return isInWater;
    } else {
        // LAND UNITS: Can NEVER move in water (except on bridges)
        if (isInWater) {
            return isOnBridge; // Only allowed if there's a bridge
        }
        return true; // Can move on land
    }
}