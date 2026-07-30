function createInitialBuildings() {
    const tcCfg = getBuildingConfig('town-center');
    const numPlayers = GAME_CONFIG.world.numPlayers || 2;
    const cx = GAME_CONFIG.world.width / 2;
    const cy = GAME_CONFIG.world.height / 2;
    const spawnRadius = GAME_CONFIG.world.radius * 0.85; // Spawn near the edge

    for (let i = 0; i < numPlayers; i++) {
        const angle = (i * 2 * Math.PI) / numPlayers;
        const playerType = i === 0 ? 'player' : 'enemy';
        const spawnX = cx + Math.cos(angle) * spawnRadius - (tcCfg.width / 2);
        const spawnY = cy + Math.sin(angle) * spawnRadius - (tcCfg.height / 2);

        const tcMaxHealth = typeof getEffectiveBuildingMaxHealth === 'function'
            ? getEffectiveBuildingMaxHealth('town-center', playerType)
            : tcCfg.maxHealth;

        const building = {
            id: generateId(),
            type: 'town-center',
            player: playerType,
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
        const blk = computeBridgeBlockAt(x, y);
        if (!blk.ok) {
            showNotification(blk.isLake ? 'Cannot build bridges on lakes.' : 'Bridge must span river water with land on both banks.');
            return;
        }
        const bridgeCost = scaleCost(buildingConfig.cost, blk.costMultiplier || 1);
        if (!canAfford(bridgeCost)) {
            showNotification(`Not enough resources for bridge (${formatCost(bridgeCost)}).`);
            return;
        }
        deductResources(bridgeCost);
        const bridge = {
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
        ? getEffectiveBuildingMaxHealth(type, 'player')
        : buildingConfig.maxHealth;

    gameState.buildings.push({
        id: generateId(),
        type: type,
        player: 'player',
        x: buildingX,
        y: buildingY,
        width: buildingConfig.width,
        height: buildingConfig.height,
        health: maxHealth,
        maxHealth: maxHealth,
        rallyPoint: null,
        isSelected: false
    });
    if (type === 'house') {
        gameState.population.max += buildingConfig.population;
    }
    if (typeof markPathfindingDirty === 'function') markPathfindingDirty();
    if (typeof window.SFX !== 'undefined') window.SFX.play('build');
    showNotification(`${type.charAt(0).toUpperCase() + type.slice(1)} constructed!`);
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

    buildingTitle.textContent = `${displayName(building.type)} Actions`;

    unitList.innerHTML = '';

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

        if (ageRestrictions[unitType] && !ageRestrictions[unitType].includes(gameState.currentAge)) {
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
    building.health = 0;
    if (building.player === 'player') {
        const idx = gameState.buildings.indexOf(building);
        if (idx > -1) gameState.buildings.splice(idx, 1);
    } else {
        const idx = gameState.enemyBuildings.indexOf(building);
        if (idx > -1) gameState.enemyBuildings.splice(idx, 1);
    }
    if (typeof markPathfindingDirty === 'function') markPathfindingDirty();
    checkWinConditions();
}
