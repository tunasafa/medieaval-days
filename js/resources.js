// Resource-related Functions
function updateResourceRates() {
    gameState.resourceRates = { food: 0, wood: 0, stone: 0, gold: 0 };
    gameState.units.forEach(unit => {
        if (unit.state === 'gathering' && unit.gatherType && unit.gatheredAmount > 0) {
            const config = GAME_CONFIG.units[unit.type];
            gameState.resourceRates[unit.gatherType] += config.gatherRate;
        } else if (unit.type === 'fishingBoat' && unit.state === 'fishing') {
            const config = GAME_CONFIG.units[unit.type];
            gameState.resourceRates.food += (config.gatherRate || 2.5);
        }
    });
    document.getElementById('food-rate').textContent = gameState.resourceRates.food.toFixed(1);
    document.getElementById('wood-rate').textContent = gameState.resourceRates.wood.toFixed(1);
    document.getElementById('stone-rate').textContent = gameState.resourceRates.stone.toFixed(1);
    document.getElementById('gold-rate').textContent = gameState.resourceRates.gold.toFixed(1);
}

function findNearestResource(unit, resourceType) {
     let closest = null;
     let closestDist = Infinity;
     gameState.worldObjects.forEach(obj => {
         if (obj.type === 'resource' && obj.resourceType === resourceType && obj.amount > 0) {
             const dist = getDistance(unit, {x: obj.x + obj.width/2, y: obj.y + obj.height/2});
             if (dist < closestDist) {
                 closestDist = dist;
                 closest = obj;
             }
         }
     });
     return closest;
}

// Randomly scatter resources across the map with sprite variety per category
function scatterResourcesAcrossWorld(options = {}) {
    const {
    // 70% fewer nodes than before (keep 30%)
    foodCount = 36,
    woodCount = 60,
    stoneCount = 18,
    goldCount = 18,
        minSpacing = 24
    } = options;

    const placed = [];
    const tryPlace = (resourceType, width, height, amountRange, spriteNames, count) => {
        let attempts = 0;
        const maxAttempts = count * 50;
        while (count > 0 && attempts < maxAttempts) {
            attempts++;
            const x = Math.floor(Math.random() * (GAME_CONFIG.world.width - width));
            const y = Math.floor(Math.random() * (GAME_CONFIG.world.height - height));
            // Reject if any part overlaps water (supports lakes/rivers)
            if (!isRectOnLand(x, y, width, height)) continue;
            // Reject if overlapping buildings
            const overlapsBuilding = [...gameState.buildings, ...gameState.enemyBuildings].some(b => (
                x + width > b.x && x < b.x + b.width && y + height > b.y && y < b.y + b.height
            ));
            if (overlapsBuilding) continue;
            // Reject if overlapping units (with a buffer)
            const overlapsUnit = [...gameState.units, ...gameState.enemyUnits].some(u => (
                Math.hypot((x + width/2) - u.x, (y + height/2) - u.y) < minSpacing
            ));
            if (overlapsUnit) continue;
            // Reject if too close to another resource
            const overlapsResource = placed.some(r => (
                x + width > r.x && x < r.x + r.width && y + height > r.y && y < r.y + r.height
            ));
            if (overlapsResource) continue;

            const amount = Math.floor(amountRange[0] + Math.random() * (amountRange[1] - amountRange[0] + 1));
            const sprite = spriteNames[Math.floor(Math.random() * spriteNames.length)];
            const obj = {
                type: 'resource',
                resourceType,
                amount,
                width,
                height,
                x,
                y,
                color: '#696969',
                spriteName: sprite // custom field: resources/<sprite>.png
            };
            gameState.worldObjects.push(obj);
            placed.push(obj);
            count--;
        }
    };

    // Define sprite pools and sizes; capacities increased 10x
    tryPlace('food', 30, 30, [800, 1600], ['food1','food2','food3','food4','food5'], foodCount);
    tryPlace('wood', 40, 40, [1200, 2200], ['wood1','wood2','wood3','wood4'], woodCount);
    tryPlace('stone', 50, 50, [1000, 1800], ['stone1','stone2'], stoneCount);
    tryPlace('gold', 50, 50, [1000, 1800], ['gold1','gold2'], goldCount);
}

// Randomly scatter environmental decorations (bushes/trees) across land
function scatterDecorationsAcrossWorld(options = {}) {
    const {
        count = 80,
        minSpacing = 18
    } = options;

    const spriteNames = ['bush1','bush2','bush3','bush4','tree1','tree2','tree3'];
    const placed = [];

    const DECOR_SCALE = 3; // make all decorations 3x bigger
    const sizeFor = (name) => {
        // heuristic base sizes; trees a bit larger, then scaled up
        const base = name.startsWith('tree') ? { w: 40, h: 56 } : { w: 28, h: 24 };
        return { w: Math.floor(base.w * DECOR_SCALE), h: Math.floor(base.h * DECOR_SCALE) };
    };

    let attempts = 0;
    const maxAttempts = count * 50;
    while (placed.length < count && attempts < maxAttempts) {
        attempts++;
        const sprite = spriteNames[Math.floor(Math.random() * spriteNames.length)];
        const { w, h } = sizeFor(sprite);
        const x = Math.floor(Math.random() * Math.max(1, (GAME_CONFIG.world.width - w)));
        const y = Math.floor(Math.random() * Math.max(1, (GAME_CONFIG.world.height - h)));

    // Avoid water (reject if any sampled point is in water)
    if (!isRectOnLand(x, y, w, h)) continue;
        // Avoid buildings
        const overlapsBuilding = [...gameState.buildings, ...gameState.enemyBuildings].some(b => (
            x + w > b.x && x < b.x + b.width && y + h > b.y && y < b.y + b.height
        ));
        if (overlapsBuilding) continue;
        // Avoid units (with a small buffer)
        const overlapsUnit = [...gameState.units, ...gameState.enemyUnits].some(u => (
            Math.hypot((x + w/2) - u.x, (y + h/2) - u.y) < minSpacing
        ));
        if (overlapsUnit) continue;
        // Avoid tight overlap with other decorations/resources
        const overlapsOther = gameState.worldObjects.some(o => (
            (o.type === 'resource' || o.type === 'decoration') &&
            x + w > o.x && x < o.x + o.width && y + h > o.y && y < o.y + o.height
        ));
        if (overlapsOther) continue;

        const obj = {
            type: 'decoration',
            width: w,
            height: h,
            x,
            y,
            color: '#3b6b2a',
            spriteName: sprite // resources/<sprite>.png or decorations/<sprite>.png
        };
        gameState.worldObjects.push(obj);
        placed.push(obj);
    }
}

// Ensure resources and decorations never end up in water; relocate if possible, remove otherwise
function enforceLandForWorldObjects(options = {}) {
    const {
        maxRelocateTries = 60,
        stepRadius = 16,
        angleSamples = 24,
        types = ['resource', 'decoration']
    } = options;

    const objs = gameState.worldObjects.filter(o => types.includes(o.type));
    const others = (target) => gameState.worldObjects.filter(o => o !== target && (o.type === 'resource' || o.type === 'decoration'));

    const overlapsRect = (ax, ay, aw, ah, b) => (
        ax + aw > b.x && ax < b.x + b.width && ay + ah > b.y && ay < b.y + b.height
    );

    for (const o of objs) {
        if (isRectOnLand(o.x, o.y, o.width, o.height)) continue;
        // Try to relocate near current position toward nearest land
        let relocated = false;
        // Seed: try small inward nudges first
        for (let rTry = 0; rTry < maxRelocateTries && !relocated; rTry++) {
            const radius = stepRadius * (1 + Math.floor(rTry / angleSamples));
            const k = rTry % angleSamples;
            const theta = (k / angleSamples) * Math.PI * 2;
            const nx = Math.max(0, Math.min(GAME_CONFIG.world.width - o.width, Math.floor(o.x + Math.cos(theta) * radius)));
            const ny = Math.max(0, Math.min(GAME_CONFIG.world.height - o.height, Math.floor(o.y + Math.sin(theta) * radius)));
            if (!isRectOnLand(nx, ny, o.width, o.height)) continue;
            // Avoid buildings
            const collidesBuilding = [...gameState.buildings, ...gameState.enemyBuildings].some(b => overlapsRect(nx, ny, o.width, o.height, b));
            if (collidesBuilding) continue;
            // Avoid units (approx via center distance)
            const centerX = nx + o.width / 2, centerY = ny + o.height / 2;
            const nearUnit = [...gameState.units, ...gameState.enemyUnits].some(u => Math.hypot(centerX - u.x, centerY - u.y) < 16);
            if (nearUnit) continue;
            // Avoid overlap with other resources/decorations
            const collidesOther = others(o).some(b => overlapsRect(nx, ny, o.width, o.height, b));
            if (collidesOther) continue;
            // Place here
            o.x = nx; o.y = ny;
            relocated = true;
        }
        if (!relocated) {
            // Remove object if we cannot safely relocate
            const idx = gameState.worldObjects.indexOf(o);
            if (idx >= 0) gameState.worldObjects.splice(idx, 1);
        }
    }
}