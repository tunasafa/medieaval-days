/**
 * Collection of utility functions for game mechanics including distance calculations,
 * resource management, terrain validation, collision detection, and coordinate transformations.
 * Provides core mathematical and validation operations used throughout the game engine.
 */

const EDGE_CLEARANCE = 20;

/**
 * Generates a unique identifier combining current timestamp with random number.
 * Used for creating unique IDs for game entities like units and buildings.
 * @returns {number} Unique identifier with high collision resistance
 */
function generateId() {
    return Date.now() + Math.random();
}

function getFactionId(entityOrFaction) {
    if (!entityOrFaction) return 'neutral';
    if (typeof entityOrFaction === 'string') return entityOrFaction;
    return entityOrFaction.faction || entityOrFaction.player || 'neutral';
}

function getFactionConfig(entityOrFaction) {
    const factionId = getFactionId(entityOrFaction);
    if (factionId === 'player') {
        return { id: 'player', name: 'Player One', color: '#4f8cff', assetFolder: '' };
    }
    const factions = GAME_CONFIG.enemyFactions || [];
    return factions.find(faction => faction.id === factionId) ||
        (factionId === 'enemy' ? factions[0] : null) ||
        { id: factionId, name: factionId, color: '#e35f44', assetFolder: 'enemy' };
}

function getFactionName(entityOrFaction) {
    return getFactionConfig(entityOrFaction).name;
}

function getFactionColor(entityOrFaction) {
    return getFactionConfig(entityOrFaction).color;
}

function isEnemyFaction(entityOrFaction) {
    const factionId = getFactionId(entityOrFaction);
    return factionId !== 'player' && factionId !== 'neutral';
}

function areHostile(a, b) {
    const factionA = getFactionId(a);
    const factionB = getFactionId(b);
    if (!factionA || !factionB || factionA === factionB) return false;
    if (factionA === 'neutral' || factionB === 'neutral') return false;
    return factionA === 'player' || factionB === 'player' ||
        (isEnemyFaction(factionA) && isEnemyFaction(factionB));
}

function getHostileUnits(entity) {
    return [...gameState.units, ...gameState.enemyUnits].filter(unit =>
        unit !== entity &&
        unit.state !== 'embarked' &&
        areHostile(entity, unit)
    );
}

function getHostileBuildings(entity) {
    return [...gameState.buildings, ...gameState.enemyBuildings].filter(building =>
        areHostile(entity, building)
    );
}

/**
 * Calculates Euclidean distance between two game objects or points.
 * Handles objects with position properties (x,y) and optional dimensions (width,height).
 * Uses center-to-center calculation for objects with dimensions.
 * @param {Object} obj1 - First object with x,y coordinates
 * @param {Object} obj2 - Second object with x,y coordinates
 * @returns {number} Distance in pixels between the two objects
 */
function getDistance(obj1, obj2) {
    const dx = (obj1.x || obj1.x + (obj1.width||0)/2) - (obj2.x || obj2.x + (obj2.width||0)/2);
    const dy = (obj1.y || obj1.y + (obj1.height||0)/2) - (obj2.y || obj2.y + (obj2.height||0)/2);
    return Math.sqrt(dx * dx + dy * dy);
}

/**
 * Validates if player has sufficient resources to afford a given cost.
 * Checks all resource types in the cost object against current player resources.
 * @param {Object} cost - Resource cost object with keys like {food: 50, wood: 100}
 * @returns {boolean} True if player can afford the cost, false otherwise
 */
function canAfford(cost) {
    for (const [resource, amount] of Object.entries(cost)) {
        if (gameState.resources[resource] < amount) return false;
    }
    return true;
}

/**
 * Deducts specified resource costs from player's current resources.
 * Should only be called after canAfford() validation to prevent negative resources.
 * @param {Object} cost - Resource cost object to deduct from player resources
 */
function deductResources(cost) {
    for (const [resource, amount] of Object.entries(cost)) {
        gameState.resources[resource] -= amount;
    }
}

/**
 * Retrieves building configuration data from GAME_CONFIG for a given building type.
 * Handles special case mapping for 'town-center' to 'townCenter' key.
 * @param {string} type - Building type identifier
 * @returns {Object} Building configuration with stats, dimensions, and costs
 */
function getBuildingConfig(type) {
    if (type === 'town-center') return GAME_CONFIG.buildings.townCenter;
    return GAME_CONFIG.buildings[type];
}

/**
 * Constrains a value within specified minimum and maximum bounds.
 * Standard mathematical clamp function for value range enforcement.
 * @param {number} val - Value to constrain
 * @param {number} min - Minimum allowed value
 * @param {number} max - Maximum allowed value
 * @returns {number} Clamped value within [min, max] range
 */
function clamp(val, min, max) {
    return Math.max(min, Math.min(max, val));
}

/**
 * Determines if a point is located in water terrain using tilemap or fallback method.
 * Prioritizes tilemap water detection when available, otherwise checks world objects.
 * Used for vessel movement validation and building placement restrictions.
 * @param {number} x - X coordinate to check
 * @param {number} y - Y coordinate to check
 * @returns {boolean} True if point is in water, false if on land
 */
function isPointInWater(x, y) {
    if (tilemap && tilemap.isLoaded) {
        return tilemap.isWater(x, y);
    }
    if (gameState.waterField && typeof gameState.waterField.contains === 'function') {
        return gameState.waterField.contains(x, y);
    }
    return gameState.worldObjects.some(o => (o.type === 'water' || o.type === 'lake') &&
        x >= o.x && x <= o.x + o.width && y >= o.y && y <= o.y + o.height);
}

function hasWaterTerrain() {
    return !!((tilemap && tilemap.hasWater) ||
        (gameState.waterField && typeof gameState.waterField.contains === 'function') ||
        gameState.worldObjects.some(o => o.type === 'water' || o.type === 'lake'));
}

const __bridgeWorldObjectsCache = {
    source: null,
    length: -1,
    objects: []
};

function getBridgeWorldObjects() {
    const worldObjects = gameState.worldObjects || [];
    if (__bridgeWorldObjectsCache.source === worldObjects &&
        __bridgeWorldObjectsCache.length === worldObjects.length) {
        return __bridgeWorldObjectsCache.objects;
    }
    __bridgeWorldObjectsCache.source = worldObjects;
    __bridgeWorldObjectsCache.length = worldObjects.length;
    __bridgeWorldObjectsCache.objects = worldObjects.filter(o => o.type === 'bridge');
    return __bridgeWorldObjectsCache.objects;
}

/**
 * Validates that an entire rectangular area is on land by sampling multiple points.
 * Checks corners, edge midpoints, and center to ensure no water intersects the rectangle.
 * Used for building placement validation to prevent structures spanning water boundaries.
 * @param {number} x - Left edge of rectangle
 * @param {number} y - Top edge of rectangle
 * @param {number} w - Width of rectangle
 * @param {number} h - Height of rectangle
 * @returns {boolean} True if entire rectangle is on land, false if any part touches water
 */
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
    for (const bridge of getBridgeWorldObjects()) {
        if (x >= bridge.x && x <= bridge.x + bridge.width &&
            y >= bridge.y && y <= bridge.y + bridge.height) {
            return true;
        }
    }
    return false;
}

// Shoreline border/inner-band helpers removed: only land vs water checks remain

// Selection ring radius used in drawing (currently constant 18px)
function getSelectionRadius(unitOrType) {
    // If called with a string type, keep consistent behavior
    const type = typeof unitOrType === 'string' ? unitOrType : unitOrType?.type;
    // Could be customized per type; for now all units share the same radius as drawUnits()
    return 18;
}

function getTerrainClearanceRadius(unitOrType) {
    const type = typeof unitOrType === 'string' ? unitOrType : unitOrType?.type;
    const isVessel = !!GAME_CONFIG.units[type]?.vessel;
    const visualRadius = getSelectionRadius(unitOrType);
    return Math.max(isVessel ? 18 : 16, visualRadius - 1);
}

function getTerrainFootprintSamples(x, y, radius = 0) {
    const samples = [{ x, y }];
    if (radius <= 0) return samples;

    const inner = radius * 0.55;
    const angles = [
        0, Math.PI / 4, Math.PI / 2, Math.PI * 3 / 4,
        Math.PI, Math.PI * 5 / 4, Math.PI * 3 / 2, Math.PI * 7 / 4
    ];

    for (const angle of angles) {
        samples.push({ x: x + Math.cos(angle) * radius, y: y + Math.sin(angle) * radius });
    }
    for (let i = 0; i < angles.length; i += 2) {
        const angle = angles[i];
        samples.push({ x: x + Math.cos(angle) * inner, y: y + Math.sin(angle) * inner });
    }
    return samples;
}

function isTerrainPointAllowedForUnit(unitOrType, x, y) {
    const type = typeof unitOrType === 'string' ? unitOrType : unitOrType?.type;
    const isVessel = !!GAME_CONFIG.units[type]?.vessel;
    const inWater = isPointInWater(x, y);
    const onBridge = isPointOnBridge(x, y);

    if (isVessel) {
        return inWater && !onBridge;
    }
    return !inWater || onBridge;
}

function isTerrainFootprintAllowedForUnit(unitOrType, x, y, radius = getTerrainClearanceRadius(unitOrType)) {
    const samples = getTerrainFootprintSamples(x, y, radius);
    for (const sample of samples) {
        if (sample.x < 0 || sample.y < 0 ||
            sample.x >= GAME_CONFIG.world.width || sample.y >= GAME_CONFIG.world.height) {
            return false;
        }
        if (!isTerrainPointAllowedForUnit(unitOrType, sample.x, sample.y)) {
            return false;
        }
    }
    return true;
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
        // Grid-based BFS to find nearest water cell
        if (pathfindingGrid) {
            const startCell = pathfindingGrid.worldToGrid(tx, ty);
            const visited = new Set();
            const bfsQ = [startCell];
            let bfsHead = 0;
            visited.add(`${startCell.x},${startCell.y}`);
            const bfsDirs = [[1,0],[-1,0],[0,1],[0,-1]];
            while (bfsHead < bfsQ.length && bfsHead < 5000) {
                const c = bfsQ[bfsHead++];
                if (pathfindingGrid.isValidCell(c.x, c.y) && pathfindingGrid.grid[c.y][c.x].isWater) {
                    return pathfindingGrid.gridToWorld(c.x, c.y);
                }
                for (const [ddx, ddy] of bfsDirs) {
                    const nx = c.x + ddx, ny = c.y + ddy;
                    const nk = `${nx},${ny}`;
                    if (!visited.has(nk) && pathfindingGrid.isValidCell(nx, ny)) {
                        visited.add(nk);
                        bfsQ.push({x: nx, y: ny});
                    }
                }
            }
        }
        // Fallback: scan worldObjects
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
        return best || findNearestWaterPoint(tx, ty) || { x: tx, y: ty };
    } else {
        if (!isPointInWater(tx, ty) || isPointOnBridge(tx, ty)) return { x: tx, y: ty };
        const w = gameState.worldObjects.find(o => o.type === 'water' && tx >= o.x && tx <= o.x + o.width && ty >= o.y && ty <= o.y + o.height);
        if (!w) return findNearestLandPoint(unit, tx, ty);
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

function findNearestWaterPoint(x, y, maxRadius = 640, step = 32) {
    if (isPointInWater(x, y)) return { x, y };
    const samples = 24;
    for (let radius = step; radius <= maxRadius; radius += step) {
        for (let i = 0; i < samples; i++) {
            const theta = (i / samples) * Math.PI * 2;
            const px = clamp(x + Math.cos(theta) * radius, 4, GAME_CONFIG.world.width - 4);
            const py = clamp(y + Math.sin(theta) * radius, 4, GAME_CONFIG.world.height - 4);
            if (isPointInWater(px, py)) return { x: px, y: py };
        }
    }
    return null;
}

function findNearestLandPoint(unit, x, y, maxRadius = 640, step = 24) {
    const isAllowedLand = (px, py) => (!isPointInWater(px, py) || isPointOnBridge(px, py)) &&
        (typeof validateTerrainMovement !== 'function' || validateTerrainMovement(unit, px, py));

    if (isAllowedLand(x, y)) return { x, y };

    const samples = 32;
    for (let radius = step; radius <= maxRadius; radius += step) {
        for (let i = 0; i < samples; i++) {
            const theta = (i / samples) * Math.PI * 2;
            const px = clamp(x + Math.cos(theta) * radius, 4, GAME_CONFIG.world.width - 4);
            const py = clamp(y + Math.sin(theta) * radius, 4, GAME_CONFIG.world.height - 4);
            if (isAllowedLand(px, py)) return { x: px, y: py };
        }
    }

    return { x: unit.x, y: unit.y };
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


function scaleCost(cost, multiplier = 1) {
    const scaled = {};
    for (const [resource, amount] of Object.entries(cost || {})) {
        scaled[resource] = Math.max(0, Math.ceil(amount * multiplier));
    }
    return scaled;
}

function formatCost(cost) {
    return Object.entries(cost || {})
        .map(([resource, amount]) => `${amount} ${resource}`)
        .join(', ');
}

function rectsOverlap(a, b) {
    return !(a.x + a.width <= b.x || a.x >= b.x + b.width ||
        a.y + a.height <= b.y || a.y >= b.y + b.height);
}

function getBridgeTerrainKind(x, y) {
    if (tilemap && tilemap.isLoaded && typeof tilemap.waterKindAt === 'function') {
        return tilemap.waterKindAt(x, y);
    }
    return isPointInWater(x, y) ? 'river' : null;
}

function scanBridgeBank(centerX, centerY, axis, sign, step, maxSpan) {
    let waterDistance = 0;
    let sawLake = false;
    for (let d = step; d <= maxSpan + step; d += step) {
        const x = centerX + axis.dx * sign * d;
        const y = centerY + axis.dy * sign * d;
        if (x < 0 || y < 0 || x >= GAME_CONFIG.world.width || y >= GAME_CONFIG.world.height) {
            return { ok: false, sawLake };
        }

        const inWater = isPointInWater(x, y);
        const onBridge = isPointOnBridge(x, y);
        const kind = getBridgeTerrainKind(x, y);
        if (kind === 'lake') sawLake = true;

        if (inWater && !onBridge) {
            waterDistance = d;
            continue;
        }

        return {
            ok: waterDistance > 0,
            sawLake,
            waterDistance,
            landDistance: d
        };
    }
    return { ok: false, sawLake };
}

function buildBridgeCandidate(centerX, centerY, axis, deckWidth, bankApron, step, maxSpan) {
    const centerKind = getBridgeTerrainKind(centerX, centerY);
    if (!isPointInWater(centerX, centerY) || centerKind === 'lake' || isPointOnBridge(centerX, centerY)) {
        return { ok: false, isLake: centerKind === 'lake' };
    }

    const neg = scanBridgeBank(centerX, centerY, axis, -1, step, maxSpan);
    const pos = scanBridgeBank(centerX, centerY, axis, 1, step, maxSpan);
    const isLake = centerKind === 'lake' || neg.sawLake || pos.sawLake;
    if (!neg.ok || !pos.ok || isLake) return { ok: false, isLake };

    const waterSpan = neg.waterDistance + pos.waterDistance + step;
    if (waterSpan > maxSpan) return { ok: false, isLake: false };

    const halfDeck = deckWidth / 2;
    const startLong = axis.name === 'horizontal' ? centerX - neg.landDistance - bankApron : centerY - neg.landDistance - bankApron;
    const endLong = axis.name === 'horizontal' ? centerX + pos.landDistance + bankApron : centerY + pos.landDistance + bankApron;
    const startWide = axis.name === 'horizontal' ? centerY - halfDeck : centerX - halfDeck;
    const minLong = Math.floor(startLong / step) * step;
    const maxLong = Math.ceil(endLong / step) * step;
    const wideCells = Math.max(3, Math.ceil(deckWidth / step));
    const minWide = Math.max(0, Math.round(startWide / step) * step);
    const maxWide = minWide + wideCells * step;
    const x = axis.name === 'horizontal' ? minLong : minWide;
    const y = axis.name === 'horizontal' ? minWide : minLong;
    const width = axis.name === 'horizontal' ? maxLong - minLong : maxWide - minWide;
    const height = axis.name === 'horizontal' ? maxWide - minWide : maxLong - minLong;
    const length = axis.name === 'horizontal' ? width : height;
    const candidate = {
        ok: true,
        isLake: false,
        x,
        y,
        width,
        height,
        orientation: axis.name,
        waterSpan,
        costMultiplier: Math.max(1, Math.ceil(length / Math.max(deckWidth, step)))
    };

    return candidate;
}

// Compute an auto-sized bridge span aligned to the terrain grid.
// Returns { ok, isLake, x, y, width, height, orientation, costMultiplier }
function computeBridgeBlockAt(cx, cy) {
    const terrain = GAME_CONFIG.terrain || {};
    const step = terrain.tileSize || 32;
    const deckWidth = Math.max(step * 3, terrain.bridgeBlockSize || 160);
    const bankApron = Math.max(step, terrain.bridgeBankApron || step * 2);
    const maxSpan = Math.max(deckWidth, terrain.bridgeMaxSpan || 640);
    const centerX = Math.floor(cx / step) * step + step / 2;
    const centerY = Math.floor(cy / step) * step + step / 2;
    const axes = [
        { name: 'horizontal', dx: 1, dy: 0 },
        { name: 'vertical', dx: 0, dy: 1 }
    ];

    const scanned = axes.map(axis => buildBridgeCandidate(centerX, centerY, axis, deckWidth, bankApron, step, maxSpan));
    const candidates = scanned.filter(c => c.ok);
    const sawLake = scanned.some(c => c.isLake);

    if (candidates.length === 0) {
        return { ok: false, isLake: sawLake, x: centerX - deckWidth / 2, y: centerY - deckWidth / 2, width: deckWidth, height: deckWidth };
    }

    candidates.sort((a, b) => (a.waterSpan - b.waterSpan) || (a.width * a.height - b.width * b.height));
    const bridge = candidates[0];

    const collidesBuilding = [...gameState.buildings, ...gameState.enemyBuildings].some(b =>
        rectsOverlap(bridge, b)
    );
    const collidesObject = gameState.worldObjects.some(o =>
        (o.type === 'resource' || o.type === 'obstacle' || o.type === 'no-go' || o.type === 'noZone') &&
        rectsOverlap(bridge, o)
    );
    const collidesBridge = getBridgeWorldObjects().some(o => rectsOverlap(bridge, o));
    const withinWorld = bridge.x >= 0 && bridge.y >= 0 &&
        bridge.x + bridge.width <= GAME_CONFIG.world.width &&
        bridge.y + bridge.height <= GAME_CONFIG.world.height;

    bridge.ok = withinWorld && !collidesBuilding && !collidesObject && !collidesBridge;
    return bridge;
}
