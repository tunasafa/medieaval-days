// Utility Functions
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
    return gameState.worldObjects.some(o => o.type === 'water' && x >= o.x && x <= o.x + o.width && y >= o.y && y <= o.y + o.height);
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

function clampTargetToAllowed(unit, tx, ty) {
    const isVessel = !!GAME_CONFIG.units[unit.type]?.vessel;
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

function getDropOffPointOutside(unit, building, margin = 6) {
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
    return unit && (unit.type === 'transportSmall' || unit.type === 'transportLarge'); 
}

function canEmbark(unit) { 
    return !GAME_CONFIG.units[unit.type]?.vessel; 
}