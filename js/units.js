// Unit-related Functions
function updateUnits(deltaTime) {
    updateResourceRates();
    gameState.units.forEach(unit => {
        updateUnit(unit, deltaTime);
        updateUnitAnimation(unit, deltaTime);
    });
    gameState.enemyUnits.forEach(unit => {
        updateUnit(unit, deltaTime);
        updateEnemyAI(unit);
        updateUnitAnimation(unit, deltaTime);
    });
    updateTrainingQueue(deltaTime);
}

function updateUnit(unit, deltaTime) {
    const config = GAME_CONFIG.units[unit.type];
    if (unit.embarkTargetId && unit.state === 'moving' && !GAME_CONFIG.units[unit.type]?.vessel) {
        const t = gameState.units.find(u => u.id === unit.embarkTargetId && isTransport(u));
        if (t) {
            const dist = Math.hypot(unit.x - t.x, unit.y - t.y);
            if (dist <= 20 && (t.cargo ? t.cargo.length : 0) < (GAME_CONFIG.units[t.type].capacity || 0)) {
                tryEmbarkUnitsToTransport([unit], t);
                unit.embarkTargetId = null;
                return;
            }
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
                    const dx = waypoint.x - unit.x;
                    const dy = waypoint.y - unit.y;
                    const distance = Math.sqrt(dx * dx + dy * dy);
                    
                    if (distance > 2) {
                        const moveSpeed = config.speed;
                        const newX = unit.x + (dx / distance) * moveSpeed;
                        const newY = unit.y + (dy / distance) * moveSpeed;
                        
                        // STRICT TERRAIN VALIDATION - prevent any illegal movement
                        const isValidMove = validateTerrainMovement(unit, newX, newY);
                        
                        // Check for immediate obstacles and try to move only if terrain allows
                        if (isValidMove && !isPositionOccupied(newX, newY, unit, 8)) {
                            unit.x = newX;
                            unit.y = newY;
                        } else {
                            // Try slight variations if main path is blocked by a unit (but still validate terrain)
                            const alternativeAngles = [-0.2, 0.2, -0.4, 0.4];
                            let moved = false;
                            
                            for (const angleOffset of alternativeAngles) {
                                const adjustedAngle = Math.atan2(dy, dx) + angleOffset;
                                const altX = unit.x + Math.cos(adjustedAngle) * moveSpeed;
                                const altY = unit.y + Math.sin(adjustedAngle) * moveSpeed;
                                
                                // Always validate terrain first, then check unit occupation
                                if (validateTerrainMovement(unit, altX, altY) && !isPositionOccupied(altX, altY, unit, 8)) {
                                    unit.x = altX;
                                    unit.y = altY;
                                    moved = true;
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
                                // Move slightly anyway to avoid complete stalling
                                unit.x += (dx / distance) * (moveSpeed * 0.1);
                                unit.y += (dy / distance) * (moveSpeed * 0.1);
                            }
                        }
                    }
                } else {
                    // Reached destination
                    unit.x = unit.targetX;
                    unit.y = unit.targetY;
                    unit.state = 'idle';
                    unit.targetX = undefined;
                    unit.targetY = undefined;
                    unit.path = null;
                }
            } else {
                // Fallback to original movement system if no path or pathfinding failed
                const dx = unit.targetX - unit.x;
                const dy = unit.targetY - unit.y;
                const distance = Math.sqrt(dx * dx + dy * dy);
                
                if (distance > 5) {
                    const moveSpeed = config.speed;
                    const newX = unit.x + (dx / distance) * moveSpeed;
                    const newY = unit.y + (dy / distance) * moveSpeed;
                    
                    if (!isPositionOccupied(newX, newY, unit, 8)) {
                        unit.x = newX;
                        unit.y = newY;
                    } else {
                        // Try alternative angles
                        const alternativeAngles = [-0.3, 0.3, -0.6, 0.6, -0.9, 0.9];
                        let moved = false;
                        
                        for (const angleOffset of alternativeAngles) {
                            const adjustedAngle = Math.atan2(dy, dx) + angleOffset;
                            const altX = unit.x + Math.cos(adjustedAngle) * moveSpeed;
                            const altY = unit.y + Math.sin(adjustedAngle) * moveSpeed;
                            
                            if (!isPositionOccupied(altX, altY, unit, 8)) {
                                unit.x = altX;
                                unit.y = altY;
                                moved = true;
                                break;
                            }
                        }
                        
                        if (!moved) {
                            // If still stuck, try pathfinding
                            if (!unit.pathfindingFailed) {
                                setUnitDestination(unit, unit.targetX, unit.targetY);
                            } else {
                                // Ultimate fallback - minimal movement
                                unit.x += (dx / distance) * (moveSpeed * 0.2);
                                unit.y += (dy / distance) * (moveSpeed * 0.2);
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
                
                if (waypointDistance < 15) {
                    unit.attackPath.shift(); // Remove reached waypoint
                }
                
                if (waypointDistance > 2) {
                    const tentativeX = unit.x + (waypointDx / waypointDistance) * config.speed;
                    const tentativeY = unit.y + (waypointDy / waypointDistance) * config.speed;
                    
                    if (!isPositionOccupied(tentativeX, tentativeY, unit, 12)) {
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
                            
                            if (!isPositionOccupied(altX, altY, unit, 12)) {
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
                if (!isPositionOccupied(tentativeX, tentativeY, unit, 12)) {
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
                    unit.target = null;
                    unit.targetPoint = undefined;
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
                
                if (waypointDistance < 12) {
                    unit.gatherPath.shift();
                }
                
                if (waypointDistance > 2) {
                    const newX = unit.x + (waypointDx / waypointDistance) * config.speed;
                    const newY = unit.y + (waypointDy / waypointDistance) * config.speed;
                    
                    if (!isPositionOccupied(newX, newY, unit, 8)) {
                        unit.x = newX;
                        unit.y = newY;
                    } else {
                        const alternativeAngles = [-0.4, 0.4, -0.8, 0.8];
                        let moved = false;
                        
                        for (const angleOffset of alternativeAngles) {
                            const adjustedAngle = Math.atan2(waypointDy, waypointDx) + angleOffset;
                            const altX = unit.x + Math.cos(adjustedAngle) * config.speed;
                            const altY = unit.y + Math.sin(adjustedAngle) * config.speed;
                            
                            if (!isPositionOccupied(altX, altY, unit, 8)) {
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
                
                if (!isPositionOccupied(newX, newY, unit, 8)) {
                    unit.x = newX;
                    unit.y = newY;
                } else {
                    const alternativeAngles = [-0.5, 0.5, -1, 1];
                    let moved = false;
                    
                    for (const angleOffset of alternativeAngles) {
                        const adjustedAngle = Math.atan2(dy, dx) + angleOffset;
                        const altX = unit.x + Math.cos(adjustedAngle) * config.speed;
                        const altY = unit.y + Math.sin(adjustedAngle) * config.speed;
                        
                        if (!isPositionOccupied(altX, altY, unit, 8)) {
                            unit.x = altX;
                            unit.y = altY;
                            moved = true;
                            break;
                        }
                    }
                    
                    if (!moved) {
                        unit.x += (dx / distance) * (config.speed * 0.3);
                        unit.y += (dy / distance) * (config.speed * 0.3);
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
                    let edge = getDropOffPointOutside(unit, tc, 8);
                    if (isOnLandShoreBand(edge.x, edge.y, 1)) {
                        const dirX = Math.sign(edge.x - (tc.x + tc.width/2)) || 1;
                        const dirY = Math.sign(edge.y - (tc.y + tc.height/2)) || 1;
                        edge = { x: edge.x + dirX * 2, y: edge.y + dirY * 2 };
                    }
                    unit.dropOffX = edge.x;
                    unit.dropOffY = edge.y;
                }
            }
        }
    } else if (unit.state === 'returning' && unit.dropOffX !== undefined) {
        const dx = unit.dropOffX - unit.x;
        const dy = unit.dropOffY - unit.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        if (distance > 8) {
            const newX = unit.x + (dx / distance) * config.speed;
            const newY = unit.y + (dy / distance) * config.speed;
            
            if (!isPositionOccupied(newX, newY, unit, 8)) {
                unit.x = newX;
                unit.y = newY;
            } else {
                const alternativeAngles = [-0.5, 0.5];
                let moved = false;
                
                for (const angleOffset of alternativeAngles) {
                    const adjustedAngle = Math.atan2(dy, dx) + angleOffset;
                    const altX = unit.x + Math.cos(adjustedAngle) * config.speed;
                    const altY = unit.y + Math.sin(adjustedAngle) * config.speed;
                    
                    if (!isPositionOccupied(altX, altY, unit, 8)) {
                        unit.x = altX;
                        unit.y = altY;
                        moved = true;
                        break;
                    }
                }
                
                if (!moved) {
                    unit.x += (dx / distance) * (config.speed * 0.3);
                    unit.y += (dy / distance) * (config.speed * 0.3);
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
            unit.state = 'idle';
            
            const nearbyResource = findNearestResource(unit, lastGatherType || 'food');
            if (nearbyResource && nearbyResource.amount > 0) {
                unit.state = 'gathering';
                unit.targetResource = nearbyResource;
                unit.gatherType = lastGatherType || nearbyResource.resourceType;
                const angle = Math.random() * Math.PI * 2;
                const r = 18 + Math.random() * 10;
                unit.gatherOffset = { dx: Math.cos(angle) * r, dy: Math.sin(angle) * r };
            }
        }
    }
}

// Decide animation for units (currently villager spritesheet)
function updateUnitAnimation(unit, deltaTime) {
    if (unit.type !== 'villager') return;
    const cfg = GAME_CONFIG.units.villager.sprite;
    if (!unit.anim) {
        unit.anim = { action: 'idle', frame: 0, elapsed: 0 };
    }
    // Determine movement state only
    const dx = unit.x - (unit.prevX ?? unit.x);
    const dy = unit.y - (unit.prevY ?? unit.y);
    const moving = Math.hypot(dx, dy) > 0.2;
    unit.anim.action = moving ? 'walk' : 'idle';

    // Advance frame timing
    const animDef = cfg.animations[unit.anim.action] || cfg.animations.idle || { frames: 4, fps: 8 };
    unit.anim.elapsed += deltaTime;
    const msPerFrame = 1000 / (animDef.fps || 8);
    while (unit.anim.elapsed >= msPerFrame) {
        unit.anim.elapsed -= msPerFrame;
        const totalFrames = Math.max(1, animDef.frames || 4);
        unit.anim.frame = (unit.anim.frame + 1) % totalFrames;
    }

    // Cache position for next frame
    unit.prevX = unit.x;
    unit.prevY = unit.y;
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
    for (let i = gameState.trainingQueue.length - 1; i >= 0; i--) {
        const training = gameState.trainingQueue[i];
        training.timeRemaining -= deltaTime;
        if (training.timeRemaining <= 0) {
            spawnUnit(training.type, training.spawnAnchor);
            gameState.trainingQueue.splice(i, 1);
        }
    }
}

function spawnUnit(type, spawnAnchor) {
    let spawnBuilding = spawnAnchor || gameState.selectedBuilding;
    if (!spawnBuilding || (spawnBuilding.player && spawnBuilding.player !== 'player')) {
        const capable = {
            villager: ['town-center'],
            militia: ['barracks'], warrior: ['barracks'], soldier: ['barracks'], knight: ['barracks'],
            archer: ['archeryRange'], crossbowman: ['archeryRange'],
            ballista: ['craftery'], trebuchet: ['craftery'], catapult: ['craftery'], mangonel: ['craftery'],
            fishingBoat: ['navy'], transportSmall: ['navy'], transportLarge: ['navy'], galley: ['navy'], warship: ['navy']
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
    // Animation-related defaults
    anim: type === 'villager' ? { action: 'idle', dir: 'down', frame: 0, elapsed: 0 } : undefined,
    prevX: position.x,
    prevY: position.y
    });
    gameState.population.current++;
    showNotification(`${type} training complete!`);
}

function trainUnit(type, producingBuilding = null) {
    const ageRestrictions = {
        'knight': ['Feudal Age', 'Castle Age', 'Imperial Age'],
        'catapult': ['Castle Age', 'Imperial Age'],
        'ballista': ['Castle Age', 'Imperial Age'],
        'mangonel': ['Castle Age', 'Imperial Age'],
        'trebuchet': ['Imperial Age'],
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
    const spawnAnchor = producingBuilding ? { x: producingBuilding.x, y: producingBuilding.y, width: producingBuilding.width, height: producingBuilding.height } :
                        (gameState.selectedBuilding ? { x: gameState.selectedBuilding.x, y: gameState.selectedBuilding.y, width: gameState.selectedBuilding.width, height: gameState.selectedBuilding.height } : null);
    gameState.trainingQueue.push({
        type,
        timeRemaining: unitConfig.buildTime * 1000,
        totalTime: unitConfig.buildTime * 1000,
        spawnAnchor
    });
    showNotification(`Training ${type}...`);
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
        transport.cargo.push(u);
        gameState.units = gameState.units.filter(x => x !== u);
    }
}

function disembarkCargo(transport) {
    if (!isTransport(transport) || !transport.cargo || transport.cargo.length === 0) return;
    const placed = [];
    const origin = { x: transport.x, y: transport.y };
    const around = [0, 0.5, -0.5, 1.0, -1.0, 1.5, -1.5, 2.0].map(a => a * Math.PI);
    for (const u of [...transport.cargo]) {
        let drop = null;
        const r = 20;
        for (let i = 0; i < 16; i++) {
            const ang = (i / 16) * Math.PI * 2;
            const tx = origin.x + Math.cos(ang) * r;
            const ty = origin.y + Math.sin(ang) * r;
            if (!isPointInWater(tx, ty) || isPointOnBridge(tx, ty)) {
                if (!isOnLandShoreBand(tx, ty, 1) && !isPositionOccupied(tx, ty, null, 12)) { drop = { x: tx, y: ty }; break; }
            }
        }
        if (!drop) continue;
        u.x = drop.x; u.y = drop.y; u.state = 'idle';
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

function isPositionOccupied(x, y, excludeUnit = null, radius = 15) {
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
    
    for (const building of [...gameState.buildings, ...gameState.enemyBuildings]) {
        const buffer = 4;
        if (x >= building.x - buffer && x <= building.x + building.width + buffer &&
            y >= building.y - buffer && y <= building.y + building.height + buffer) {
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
            if (inWater && !onBridge) return true;
            if (isOnLandShoreBand(x, y, 1) && !onBridge) return true;
        }
        if (isVessel) {
            if (!inWater) return true;
            if (isInWaterInnerBand(x, y, 1)) return true;
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
            if (currentX >= building.x - 15 && currentX <= building.x + building.width + 15 &&
                currentY >= building.y - 15 && currentY <= building.y + building.height + 15) {
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