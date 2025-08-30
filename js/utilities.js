// Utility Functions
// Minimum clearance from building edges for edge placements (must exceed movement/building buffer)
const EDGE_CLEARANCE = 20;
function generateId() {
    return Date.now() + Math.random();
}

function getDistance(obj1, obj2) {
    const dx = (obj1.x || obj1.x + (obj1.width||0)/2) - (obj2.x || obj2.x + (obj2.width||0)/2);
    const dy = (obj1.y || obj1.y + (obj1.height||0)/2) - (obj2.y || obj2.y + (obj2.height||0)/2);
    return Math.sqrt(dx * dx + dy * dy);
}

function canAfford(cost) {
    for (const [resource, amount] of Object.entries(cost)) {
        if (gameState.resources[resource] < amount) return false;
    }
    return true;
}

function deductResources(cost) {
    for (const [resource, amount] of Object.entries(cost)) {
        gameState.resources[resource] -= amount;
    }
}

function getBuildingConfig(type) {
    if (type === 'town-center') return GAME_CONFIG.buildings.townCenter;
    return GAME_CONFIG.buildings[type];
}

function clamp(val, min, max) { 
    return Math.max(min, Math.min(max, val)); 
}

function isPointInWater(x, y) {
    // Use tilemap if available, otherwise fallback to world objects
    if (tilemap && tilemap.isLoaded) {
        return tilemap.isWater(x, y);
    }
    // Fallback to old method
    return gameState.worldObjects.some(o => (o.type === 'water' || o.type === 'lake') &&
        x >= o.x && x <= o.x + o.width && y >= o.y && y <= o.y + o.height);
}

// Check that an entire rectangle is on land (no water) by sampling corners and edges
function isRectOnLand(x, y, w, h) {
    // Sample corners
    const pts = [
        [x, y], [x + w, y], [x, y + h], [x + w, y + h],
        // Mid-edges
        [x + w / 2, y], [x + w / 2, y + h], [x, y + h / 2], [x + w, y + h / 2],
        // Center
        [x + w / 2, y + h / 2]
    ];
    for (const [px, py] of pts) {
        if (isPointInWater(px, py)) return false;
    }
    return true;
}

function isPointOnBridge(x, y) {
    return gameState.worldObjects.some(o => o.type === 'bridge' && x >= o.x && x <= o.x + o.width && y >= o.y && y <= o.y + o.height);
}

function isOnLandShoreBand(x, y, pad = 1) {
    if (isPointInWater(x, y)) return false;
    for (const w of gameState.worldObjects) {
        if (w.type !== 'water') continue;
        const withinX = x >= w.x - pad && x <= w.x + w.width + pad;
        const withinY = y >= w.y - pad && y <= w.y + w.height + pad;
        if (!withinX || !withinY) continue;
        const nearLeft = x >= w.x - pad && x < w.x;
        const nearRight = x > w.x + w.width && x <= w.x + w.width + pad;
        const nearTop = y >= w.y - pad && y < w.y;
        const nearBottom = y > w.y + w.height && y <= w.y + w.height + pad;
        if ((nearLeft || nearRight) && y >= w.y - pad && y <= w.y + w.height + pad) return true;
        if ((nearTop || nearBottom) && x >= w.x - pad && x <= w.x + w.width + pad) return true;
    }
    return false;
}

function isInWaterInnerBand(x, y, pad = 1) {
    for (const w of gameState.worldObjects) {
        if (w.type !== 'water') continue;
        if (x >= w.x && x <= w.x + w.width && y >= w.y && y <= w.y + w.height) {
            const dLeft = x - w.x;
            const dRight = (w.x + w.width) - x;
            const dTop = y - w.y;
            const dBottom = (w.y + w.height) - y;
            if (dLeft <= pad || dRight <= pad || dTop <= pad || dBottom <= pad) return true;
        }
    }
    return false;
}

// Selection ring radius used in drawing (currently constant 18px)
function getSelectionRadius(unitOrType) {
    // If called with a string type, keep consistent behavior
    const type = typeof unitOrType === 'string' ? unitOrType : unitOrType?.type;
    // Could be customized per type; for now all units share the same radius as drawUnits()
    return 18;
}

// Compute edge-to-edge distance between selection rings of two units
function selectionEdgeDistance(a, b) {
    const ra = getSelectionRadius(a);
    const rb = getSelectionRadius(b);
    const dx = (a.x || 0) - (b.x || 0);
    const dy = (a.y || 0) - (b.y || 0);
    return Math.hypot(dx, dy) - (ra + rb);
}

// Simplified approach: we’ll rely on clampTargetToAllowed() for embark target clamping

function clampTargetToAllowed(unit, tx, ty) {
    const isVessel = !!GAME_CONFIG.units[unit.type]?.vessel;
    // If target is inside any building footprint, clamp to a safe point outside
    if (!isVessel) {
        const bld = [...gameState.buildings, ...gameState.enemyBuildings].find(b => tx >= b.x && tx <= b.x + b.width && ty >= b.y && ty <= b.y + b.height);
        if (bld) {
            return getDropOffPointOutside(unit, bld, EDGE_CLEARANCE);
        }
    }
    if (isVessel) {
        if (isPointInWater(tx, ty)) return { x: tx, y: ty };
        let best = null;
        let bestDist = Infinity;
        for (const w of gameState.worldObjects) {
            if (w.type !== 'water') continue;
            const cx = Math.max(w.x + 2, Math.min(tx, w.x + w.width - 2));
            const cy = Math.max(w.y + 2, Math.min(ty, w.y + w.height - 2));
            const dx = cx - tx;
            const dy = cy - ty;
            const d = dx*dx + dy*dy;
            if (d < bestDist) { bestDist = d; best = { x: cx, y: cy }; }
        }
        return best || { x: tx, y: ty };
    } else {
        if (!isPointInWater(tx, ty) || isPointOnBridge(tx, ty)) return { x: tx, y: ty };
        const w = gameState.worldObjects.find(o => o.type === 'water' && tx >= o.x && tx <= o.x + o.width && ty >= o.y && ty <= o.y + o.height);
        if (!w) return { x: tx, y: ty };
        const leftDist = Math.abs(tx - w.x);
        const rightDist = Math.abs((w.x + w.width) - tx);
        const topDist = Math.abs(ty - w.y);
        const bottomDist = Math.abs((w.y + w.height) - ty);
        const minDist = Math.min(leftDist, rightDist, topDist, bottomDist);
        if (minDist === leftDist) return { x: w.x - 3, y: clamp(unit.y, w.y, w.y + w.height) };
        if (minDist === rightDist) return { x: w.x + w.width + 3, y: clamp(unit.y, w.y, w.y + w.height) };
        if (minDist === topDist) return { x: clamp(unit.x, w.x, w.x + w.width), y: w.y - 3 };
        return { x: clamp(unit.x, w.x, w.x + w.width), y: w.y + w.height + 3 };
    }
}

function getDropOffPointOutside(unit, building, margin = EDGE_CLEARANCE) {
    const leftDist = Math.abs(unit.x - building.x);
    const rightDist = Math.abs((building.x + building.width) - unit.x);
    const topDist = Math.abs(unit.y - building.y);
    const bottomDist = Math.abs((building.y + building.height) - unit.y);
    const minDist = Math.min(leftDist, rightDist, topDist, bottomDist);
    if (minDist === leftDist) return { x: building.x - margin, y: clamp(unit.y, building.y, building.y + building.height) };
    if (minDist === rightDist) return { x: building.x + building.width + margin, y: clamp(unit.y, building.y, building.y + building.height) };
    if (minDist === topDist) return { x: clamp(unit.x, building.x, building.x + building.width), y: building.y - margin };
    return { x: clamp(unit.x, building.x, building.x + building.width), y: building.y + building.height + margin };
}

function computeFormationOffsets(count, spacing = 24) {
    const offsets = [];
    const goldenAngle = 2.399963229728653;
    for (let i = 0; i < count; i++) {
        const r = spacing * Math.sqrt(i);
        const theta = i * goldenAngle;
        const dx = Math.cos(theta) * r;
        const dy = Math.sin(theta) * r;
        offsets.push({ dx, dy });
    }
    return offsets;
}

function isTransport(unit) { 
    return unit && (unit.type === 'transportLarge' || unit.type === 'transportSmall'); 
}

function canEmbark(unit) { 
    return !GAME_CONFIG.units[unit.type]?.vessel; 
}


// Compute a single bridge block aligned to the tile grid
// Returns { ok, isLake, x, y, width, height }
function computeBridgeBlockAt(cx, cy) {
    const tileSize = (tilemap && tilemap.tileSize) ? tilemap.tileSize : 32;
    const tx = Math.floor(cx / tileSize);
    const ty = Math.floor(cy / tileSize);
    const x = tx * tileSize;
    const y = ty * tileSize;
    const centerX = x + tileSize / 2;
    const centerY = y + tileSize / 2;
    const onWater = isPointInWater(centerX, centerY);
    let isLake = false;
    if (tilemap && tilemap.isLoaded && tilemap.waterKinds) {
        const kind = tilemap.waterKinds?.[ty]?.[tx] || null;
        if (kind === 'lake') isLake = true;
    }
    // Cannot place on existing building footprints
    const collidesBuilding = [...gameState.buildings, ...gameState.enemyBuildings].some(b =>
        !(x + tileSize <= b.x || x >= b.x + b.width || y + tileSize <= b.y || y >= b.y + b.height)
    );
    // Avoid placing twice on same bridge tile
    const collidesBridge = gameState.worldObjects.some(o => o.type === 'bridge' &&
        !(x + tileSize <= o.x || x >= o.x + o.width || y + tileSize <= o.y || y >= o.y + o.height)
    );
    const withinWorld = x >= 0 && y >= 0 && (x + tileSize) <= GAME_CONFIG.world.width && (y + tileSize) <= GAME_CONFIG.world.height;
    const ok = withinWorld && onWater && !isLake && !collidesBuilding && !collidesBridge;
    return { ok, isLake, x, y, width: tileSize, height: tileSize };
}