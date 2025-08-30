// Building-related Functions
function createInitialBuildings() {
    // Always place the player's Town Center at the top-left corner with a small edge padding
    const edgePad = 24;
    const tcCfg = getBuildingConfig('town-center');
    const spawnX = edgePad;
    const spawnY = edgePad;
    gameState.buildings.push({
        id: generateId(),
        type: 'town-center',
        player: 'player',
        x: spawnX,
        y: spawnY,
        health: tcCfg.maxHealth,
        width: tcCfg.width,
        height: tcCfg.height
    });
}

function startPlacingBuilding(type) {
     if (gameState.placingBuilding) {
        showNotification("Finish placing the current building first!");
        return;
    }
    const buildingConfig = getBuildingConfig(type);
    if (!canAfford(buildingConfig.cost)) {
        showNotification(`Not enough resources to build ${type}!`);
        return;
    }
    gameState.placingBuilding = type;
    const canvas = document.getElementById('gameCanvas');
    canvas.classList.add('placing-building');
    showNotification(`Placing ${type}. Click to place. Press ESC to cancel.`);
}

function placeBuilding(type, x, y) {
    const buildingConfig = getBuildingConfig(type);
    // For bridge block placement, we validate first then deduct cost
    if (type !== 'bridge') {
        if (!canAfford(buildingConfig.cost)) {
            showNotification(`Not enough resources!`);
            return;
        }
        deductResources(buildingConfig.cost);
    }
    const buildingX = x - buildingConfig.width / 2;
    const buildingY = y - buildingConfig.height / 2;
    if (type === 'bridge') {
        // Place a single tile-sized bridge block; reject lakes; align to grid
        const blk = computeBridgeBlockAt(x, y);
        if (!blk.ok) {
            showNotification(blk.isLake ? 'Cannot build bridge blocks on lakes.' : 'Bridge blocks must be placed over river water tiles.');
            return;
        }
        if (!canAfford(buildingConfig.cost)) {
            showNotification('Not enough resources for bridge block!');
            return;
        }
        deductResources(buildingConfig.cost);
        gameState.worldObjects.push({
            type: 'bridge',
            x: blk.x,
            y: blk.y,
            width: blk.width,
            height: blk.height,
            color: '#C8A165'
        });
        if (typeof updatePathfindingGrid === 'function') {
            updatePathfindingGrid();
        }
        showNotification('Bridge block placed.');
        return;
    }
    // Before placing, ensure no unit is inside the footprint; evict any overlapping units outward
    const footprint = { x: buildingX, y: buildingY, width: buildingConfig.width, height: buildingConfig.height };
    const allUnits = [...gameState.units, ...gameState.enemyUnits];
    for (const u of allUnits) {
        if (u.state === 'embarked') continue;
        const inside = (
            u.x >= footprint.x && u.x <= footprint.x + footprint.width &&
            u.y >= footprint.y && u.y <= footprint.y + footprint.height
        );
        if (inside) {
            // Compute a safe edge point outside the new building with ample clearance
            let edge = getDropOffPointOutside(u, footprint, (typeof EDGE_CLEARANCE !== 'undefined' ? EDGE_CLEARANCE : 20) + 5);
            let px = edge.x, py = edge.y;
            // Clamp within world bounds
            px = Math.max(8, Math.min(GAME_CONFIG.world.width - 8, px));
            py = Math.max(8, Math.min(GAME_CONFIG.world.height - 8, py));
            // If spot intersects any existing building buffer OR the new building buffer, nudge outward
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
            // Find a nearby available free point to avoid unit-unit overlap
            const free = getAvailablePosition(px, py, 16);
            px = free.x; py = free.y;
            // Avoid water for land units
            if (!isPointInWater(px, py)) {
                u.x = px; u.y = py; u.state = 'idle';
            }
        }
    }

    gameState.buildings.push({
        id: generateId(),
        type: type,
        player: 'player',
        x: buildingX,
        y: buildingY,
        health: buildingConfig.maxHealth,
        width: buildingConfig.width,
        height: buildingConfig.height,
        isSelected: false
    });
    if (type === 'house') {
        gameState.population.max += buildingConfig.population;
    }
    showNotification(`${type.charAt(0).toUpperCase() + type.slice(1)} constructed!`);
}

function canPlaceBuilding(type, x, y) {
    const config = getBuildingConfig(type);
    const proposedX = x - config.width / 2;
    const proposedY = y - config.height / 2;
    
    // Check if building fits within world boundaries
    if (proposedX < 0 || proposedY < 0 || 
        proposedX + config.width > GAME_CONFIG.world.width || 
        proposedY + config.height > GAME_CONFIG.world.height) {
        return false;
    }
    
    // Check for overlaps with existing buildings (player and enemy)
    const allBuildings = [...gameState.buildings, ...gameState.enemyBuildings];
    for (const building of allBuildings) {
        if (!(proposedX + config.width <= building.x || proposedX >= building.x + building.width ||
              proposedY + config.height <= building.y || proposedY >= building.y + building.height)) {
            return false; // Overlaps with existing building
        }
    }

    // Note: We allow placing over units; units will be evicted outward in placeBuilding() to avoid trapping.
    
    // Check for overlaps with resources (prevent building on top of resources)
    for (const obj of gameState.worldObjects) {
        if (obj.type === 'resource') {
            if (!(proposedX + config.width <= obj.x || proposedX >= obj.x + obj.width ||
                  proposedY + config.height <= obj.y || proposedY >= obj.y + obj.height)) {
                return false; // Overlaps with resource
            }
        }
    }
    
    // Special rules for water-related buildings
    let intersectsWater = false;
    let nearWater = false;
    
    if (tilemap && tilemap.isLoaded) {
        // Use tilemap for water detection
        const buildingWidthInTiles = Math.ceil(config.width / tilemap.tileSize);
        const buildingHeightInTiles = Math.ceil(config.height / tilemap.tileSize);
        
        // Check if building intersects water tiles
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
        
        // Check if building is near water (within 50px)
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
        // Fallback to old method if tilemap not available
        intersectsWater = gameState.worldObjects.some(o => o.type === 'water' &&
            !(proposedX + config.width <= o.x || proposedX >= o.x + o.width || 
              proposedY + config.height <= o.y || proposedY >= o.y + o.height));
        
        nearWater = gameState.worldObjects.some(o => o.type === 'water' &&
            !(proposedX + config.width + 50 <= o.x || proposedX - 50 >= o.x + o.width || 
              proposedY + config.height + 50 <= o.y || proposedY - 50 >= o.y + o.height));
    }
    
    if (type === 'navy') {
        // Navy buildings must be near or on water
        return intersectsWater || nearWater;
    }
    
    if (type === 'bridge') {
        const blk = computeBridgeBlockAt(x, y);
        return blk.ok; // must be on river and tile-aligned
    }
    
    // Land buildings cannot be built on water
    if (intersectsWater) {
        return false;
    }
    
    // Check for overlaps with obstacles (rocks, etc.) but not water
    for (const obj of gameState.worldObjects) {
        if (obj.type === 'obstacle') {
            if (!(proposedX + config.width <= obj.x || proposedX >= obj.x + obj.width ||
                  proposedY + config.height <= obj.y || proposedY >= obj.y + obj.height)) {
                return false; // Overlaps with obstacle
            }
        }
    }
    
    return true; // Building can be placed here
}

function selectBuilding(building) {
    gameState.selectedUnits.forEach(unit => unit.isSelected = false);
    gameState.selectedUnits = [];
    gameState.buildings.forEach(b => b.isSelected = false);
    
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
    
    buildingTitle.textContent = `${building.type.charAt(0).toUpperCase() + building.type.slice(1)} Actions`;
    
    unitList.innerHTML = '';
    
    const buildingUnits = {
        'town-center': ['villager'],
    'barracks': ['militia', 'warrior', 'axeman'],
        'archeryRange': ['archer', 'crossbowman'],
        'craftery': ['ballista', 'catapult'],
        'navy': ['fishingBoat', 'transportLarge', 'warship']
    };
    
    let availableUnits = buildingUnits[building.type] || [];
    const hasWater = gameState.worldObjects.some(o => o.type === 'water');
    if (building.type === 'craftery' && hasWater) {
        availableUnits = [...availableUnits, 'bridge'];
    }
    
    availableUnits.forEach(unitType => {
        if (unitType === 'bridge') {
            const unitDiv = document.createElement('div');
            unitDiv.className = 'unit';
            unitDiv.dataset.type = 'bridge';
            unitDiv.innerHTML = `
                <canvas class="unit-icon bridge" width="40" height="40"></canvas>
                <div style="font-weight: bold; font-size: 12px;">Bridge</div>
                <div style="font-size: 11px; color: #ccc;">150W, 50S</div>
            `;
            unitDiv.addEventListener('click', () => startPlacingBuilding('bridge'));
            unitList.appendChild(unitDiv);
            const canvas = unitDiv.querySelector('canvas.unit-icon.bridge');
            const ctx = canvas.getContext('2d');
            ctx.fillStyle = '#8B4513';
            ctx.fillRect(8, 20, 32, 8);
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
        
        if (ageRestrictions[unitType] && !ageRestrictions[unitType].includes(gameState.currentAge)) {
            const unitDiv = document.createElement('div');
            unitDiv.className = 'unit disabled';
            unitDiv.dataset.type = unitType;
            
            const costText = Object.entries(unitConfig.cost)
                .map(([resource, amount]) => `${amount}${resource.charAt(0).toUpperCase()}`)
                .join(', ');
            
            const requiredAge = ageRestrictions[unitType][0];
            
            unitDiv.innerHTML = `
                <canvas class="unit-icon ${unitType}" width="40" height="40"></canvas>
                <div style="font-weight: bold; font-size: 12px;">${unitType.charAt(0).toUpperCase() + unitType.slice(1)}</div>
                <div style="font-size: 11px; color: #ccc;">${costText}</div>
                <div style="font-size: 9px; color: #ff6666;">Requires ${requiredAge}</div>
                <div class="progress-bar"><div class="progress-fill" style="width: 0%;"></div></div>
            `;
            
            unitList.appendChild(unitDiv);
            
            const canvas = unitDiv.querySelector(`canvas.unit-icon.${unitType}`);
            const ctx = canvas.getContext('2d');
            drawUnitIcon(ctx, unitType, 6);
            return;
        }
        
        const unitDiv = document.createElement('div');
        unitDiv.className = 'unit';
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
            <canvas class="unit-icon ${unitType}" width="40" height="40"></canvas>
            <div style="display:flex; align-items:center; gap:6px;">
                <div style="font-weight: bold; font-size: 12px;">${unitType.charAt(0).toUpperCase() + unitType.slice(1)}</div>
                <div class="queue-pill" style="display:${queuedCount>0?'inline-flex':'none'}; background:#333; color:#fff; border-radius:10px; padding:0 6px; font-size:10px; line-height:16px; height:16px;">x${queuedCount}</div>
            </div>
            <div style="font-size: 11px; color: #ccc;">${costText}</div>
            <div class="progress-bar" data-type="${unitType}"><div class="progress-fill" style="width: ${progressPct}%;"></div></div>
        `;
        
        unitDiv.addEventListener('click', () => trainUnitFromBuilding(unitType, building));
        unitList.appendChild(unitDiv);
        
        const canvas = unitDiv.querySelector(`canvas.unit-icon.${unitType}`);
        const ctx = canvas.getContext('2d');
        drawUnitIcon(ctx, unitType, 6);
    });
}

function handleBuildingDestruction(building) {
    building.health = 0;
    if (building.player === 'player') {
        const idx = gameState.buildings.indexOf(building);
        if (idx > -1) gameState.buildings.splice(idx, 1);
    } else {
        const idx = gameState.enemyBuildings.indexOf(building);
        if (idx > -1) gameState.enemyBuildings.splice(idx, 1);
    }
    checkWinConditions();
}