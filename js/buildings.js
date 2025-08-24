// Building-related Functions
function createInitialBuildings() {
    const centerX = GAME_CONFIG.world.width / 4;
    const centerY = GAME_CONFIG.world.height / 2;
    const river = gameState.worldObjects.find(o => o.type === 'water' && o.width > o.height);
    let spawnY = centerY;
    if (river) {
        const riverMidY = river.y + river.height / 2;
        spawnY = riverMidY - (river.height / 2) - GAME_CONFIG.buildings.townCenter.height - 40;
        spawnY = Math.max(0, spawnY);
    }
    gameState.buildings.push({
        id: generateId(),
        type: 'town-center',
        player: 'player',
        x: centerX - getBuildingConfig('town-center').width/2,
        y: spawnY,
        health: getBuildingConfig('town-center').maxHealth,
        width: getBuildingConfig('town-center').width,
        height: getBuildingConfig('town-center').height
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
    if (!canAfford(buildingConfig.cost)) {
        showNotification(`Not enough resources!`);
        return;
    }
    deductResources(buildingConfig.cost);
    const buildingX = x - buildingConfig.width / 2;
    const buildingY = y - buildingConfig.height / 2;
    if (type === 'bridge') {
        gameState.worldObjects.push({
            ...GAME_CONFIG.worldObjects.bridgeSpan,
            x: buildingX,
            y: buildingY
        });
        showNotification('Bridge constructed!');
        return;
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
    const intersectsWater = gameState.worldObjects.some(o => o.type === 'water' &&
        !(proposedX + config.width <= o.x || proposedX >= o.x + o.width || 
          proposedY + config.height <= o.y || proposedY >= o.y + o.height));
    
    const nearWater = gameState.worldObjects.some(o => o.type === 'water' &&
        !(proposedX + config.width + 50 <= o.x || proposedX - 50 >= o.x + o.width || 
          proposedY + config.height + 50 <= o.y || proposedY - 50 >= o.y + o.height));
    
    if (type === 'navy') {
        // Navy buildings must be near or on water
        return intersectsWater || nearWater;
    }
    
    if (type === 'bridge') {
        // Bridges must be built on water
        return intersectsWater;
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
        'barracks': ['militia', 'warrior', 'soldier', 'knight'],
        'archeryRange': ['archer', 'crossbowman'],
        'craftery': ['ballista', 'trebuchet'],
        'navy': ['fishingBoat', 'transportSmall', 'transportLarge', 'galley', 'warship']
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
            'knight': ['Feudal Age', 'Castle Age', 'Imperial Age'],
            'catapult': ['Castle Age', 'Imperial Age'],
            'ballista': ['Castle Age', 'Imperial Age'],
            'mangonel': ['Castle Age', 'Imperial Age'],
            'trebuchet': ['Imperial Age'],
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
        
        unitDiv.innerHTML = `
            <canvas class="unit-icon ${unitType}" width="40" height="40"></canvas>
            <div style="font-weight: bold; font-size: 12px;">${unitType.charAt(0).toUpperCase() + unitType.slice(1)}</div>
            <div style="font-size: 11px; color: #ccc;">${costText}</div>
            <div class="progress-bar"><div class="progress-fill" style="width: 0%;"></div></div>
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