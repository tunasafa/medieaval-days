/**
 * Comprehensive unit behavior system handling movement, combat, resource gathering,
 * pathfinding, embark/disembark mechanics, and unit separation. Manages unit states,
 * AI decision making, collision detection, and terrain validation for all unit types.
 */


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
}

function updateUnit(unit, deltaTime) {
    if (unit.state === 'moving') {
        handleUnitMovement(unit, deltaTime);
        // Embarking logic
        if (unit.embarkTargetId && !GAME_CONFIG.units[unit.type]?.vessel) {
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
    } else {
        handleUnitActions(unit, deltaTime);
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
            
            // Remove from active units
            const unitIndex = gameState.units.indexOf(unit);
            if (unitIndex > -1) {
                gameState.units.splice(unitIndex, 1);
            }
            
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
                
                // Must be on land (not water) and not occupied
                if (!isPointInWater(testX, testY) && 
                    !isPositionOccupied(testX, testY, null, 15) &&
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
            
            // Add back to active units
            gameState.units.push(unit);
            
            // Clean up DOM overlay to ensure visibility
            if (unit._domGif) {
                try {
                    if (unit._domGif.parentNode) {
                        unit._domGif.parentNode.removeChild(unit._domGif);
                    }
                } catch(e) {}
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
