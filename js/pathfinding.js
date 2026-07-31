// Advanced Pathfinding System using A* Algorithm

class PathfindingGrid {
    constructor(worldWidth, worldHeight, cellSize = 16) {
        this.cellSize = cellSize;
        this.width = Math.ceil(worldWidth / cellSize);
        this.height = Math.ceil(worldHeight / cellSize);
        this.grid = [];
        this.worldWidth = worldWidth;
        this.worldHeight = worldHeight;
        this._dirty = true; // grid needs rebuild on first use
        this.version = 0;
        this.initializeGrid();
    }

    initializeGrid() {
        this.grid = [];
        for (let y = 0; y < this.height; y++) {
            this.grid[y] = [];
            for (let x = 0; x < this.width; x++) {
                this.grid[y][x] = {
                    x: x,
                    y: y,
                    walkable: true,
                    cost: 1,
                    isWater: false,
                    isBridge: false,
                    blocksUnits: false,
                    clearance: Infinity,
                    shoreClearance: Infinity,
                    waterClearance: Infinity
                };
            }
        }
    }

    worldToGrid(worldX, worldY) {
        return {
            x: Math.floor(worldX / this.cellSize),
            y: Math.floor(worldY / this.cellSize)
        };
    }

    gridToWorld(gridX, gridY) {
        return {
            x: gridX * this.cellSize + this.cellSize / 2,
            y: gridY * this.cellSize + this.cellSize / 2
        };
    }

    isValidCell(x, y) {
        return x >= 0 && x < this.width && y >= 0 && y < this.height;
    }

    _pointInRect(x, y, rect, margin = 0) {
        return x >= rect.x - margin && x <= rect.x + rect.width + margin &&
            y >= rect.y - margin && y <= rect.y + rect.height + margin;
    }

    _pointInRoundedRect(x, y, rect, margin = 0) {
        const cornerRadius = Math.min(32, Math.min(rect.width, rect.height) * 0.4);
        const left = rect.x - margin;
        const right = rect.x + rect.width + margin;
        const top = rect.y - margin;
        const bottom = rect.y + rect.height + margin;

        if (x >= left + cornerRadius && x <= right - cornerRadius && y >= top && y <= bottom) return true;
        if (y >= top + cornerRadius && y <= bottom - cornerRadius && x >= left && x <= right) return true;

        const corners = [
            { x: left + cornerRadius, y: top + cornerRadius },
            { x: right - cornerRadius, y: top + cornerRadius },
            { x: left + cornerRadius, y: bottom - cornerRadius },
            { x: right - cornerRadius, y: bottom - cornerRadius }
        ];
        return corners.some(c => {
            const dx = x - c.x;
            const dy = y - c.y;
            return dx * dx + dy * dy <= cornerRadius * cornerRadius;
        });
    }

    _markCellsInBounds(rect, predicate, apply) {
        const startX = Math.max(0, Math.floor(rect.x / this.cellSize) - 1);
        const startY = Math.max(0, Math.floor(rect.y / this.cellSize) - 1);
        const endX = Math.min(this.width - 1, Math.ceil((rect.x + rect.width) / this.cellSize) + 1);
        const endY = Math.min(this.height - 1, Math.ceil((rect.y + rect.height) / this.cellSize) + 1);

        for (let y = startY; y <= endY; y++) {
            for (let x = startX; x <= endX; x++) {
                const pos = this.gridToWorld(x, y);
                if (!predicate(pos.x, pos.y)) continue;
                apply(this.grid[y][x]);
            }
        }
    }

    updateObstacles() {
        // Reset grid
        for (let y = 0; y < this.height; y++) {
            for (let x = 0; x < this.width; x++) {
                this.grid[y][x].walkable = true;
                this.grid[y][x].cost = 1;
                this.grid[y][x].isWater = false; // Reset water flag
                this.grid[y][x].isBridge = false;
                this.grid[y][x].blocksUnits = false;
                this.grid[y][x].clearance = Infinity; // distance in cells to nearest obstacle
                this.grid[y][x].shoreClearance = Infinity; // distance in cells to nearest water
                this.grid[y][x].waterClearance = Infinity; // distance in cells to nearest land/blocked cell
            }
        }

        // Mark water tiles — use tilemap as authoritative source when available
        if (tilemap && tilemap.isLoaded) {
            const ratio = tilemap.tileSize / this.cellSize;
            for (let ty = 0; ty < tilemap.height; ty++) {
                for (let tx = 0; tx < tilemap.width; tx++) {
                    if (tilemap.getTile(tx, ty) === TILE_TYPES.WATER) {
                        const gx0 = Math.floor(tx * ratio);
                        const gy0 = Math.floor(ty * ratio);
                        const gx1 = Math.ceil((tx + 1) * ratio);
                        const gy1 = Math.ceil((ty + 1) * ratio);
                        for (let y = gy0; y < gy1; y++) {
                            for (let x = gx0; x < gx1; x++) {
                                if (this.isValidCell(x, y)) {
                                    this.grid[y][x].isWater = true;
                                    this.grid[y][x].walkable = false;
                                }
                            }
                        }
                    }
                }
            }
        } else {
            // Fallback: scan worldObjects rectangles
            gameState.worldObjects.forEach(obj => {
                if (obj.type === 'water') {
                    const startX = Math.floor(obj.x / this.cellSize);
                    const startY = Math.floor(obj.y / this.cellSize);
                    const endX = Math.ceil((obj.x + obj.width) / this.cellSize);
                    const endY = Math.ceil((obj.y + obj.height) / this.cellSize);

                    for (let y = startY; y < endY; y++) {
                        for (let x = startX; x < endX; x++) {
                            if (this.isValidCell(x, y)) {
                                this.grid[y][x].isWater = true;
                                this.grid[y][x].walkable = false;
                            }
                        }
                    }
                }
            });
        }

        // Gap-fill pass: any non-water cell surrounded by 3+ cardinal water neighbors → mark water
        for (let y = 1; y < this.height - 1; y++) {
            for (let x = 1; x < this.width - 1; x++) {
                if (this.grid[y][x].isWater) continue;
                let waterNeighbors = 0;
                if (this.grid[y - 1][x].isWater) waterNeighbors++;
                if (this.grid[y + 1][x].isWater) waterNeighbors++;
                if (this.grid[y][x - 1].isWater) waterNeighbors++;
                if (this.grid[y][x + 1].isWater) waterNeighbors++;
                if (waterNeighbors >= 3) {
                    this.grid[y][x].isWater = true;
                    this.grid[y][x].walkable = false;
                }
            }
        }

        // Bridges convert their footprint into walkable land for land units
        gameState.worldObjects.forEach(obj => {
            if (obj.type === 'bridge') {
                const startX = Math.floor(obj.x / this.cellSize);
                const startY = Math.floor(obj.y / this.cellSize);
                const endX = Math.ceil((obj.x + obj.width) / this.cellSize);
                const endY = Math.ceil((obj.y + obj.height) / this.cellSize);
                for (let y = startY; y < endY; y++) {
                    for (let x = startX; x < endX; x++) {
                        if (this.isValidCell(x, y)) {
                            this.grid[y][x].walkable = true;
                            this.grid[y][x].isWater = false; // treat as land for grid logic
                            this.grid[y][x].isBridge = true;
                            this.grid[y][x].blocksUnits = false;
                            this.grid[y][x].cost = Math.max(1, this.grid[y][x].cost); // ensure reasonable cost
                        }
                    }
                }
            }
        });

        // Mark large buildings as obstacle seeds. Clearance expands these seeds
        // by unit radius, which keeps corridors usable when units actually fit.
        [...(gameState.buildings || []), ...(gameState.enemyBuildings || [])].forEach(building => {
            this._markCellsInBounds(
                building,
                (x, y) => this._pointInRoundedRect(x, y, building, 0),
                cell => {
                    cell.walkable = false;
                    cell.blocksUnits = true;
                    cell.clearance = 0;
                }
            );
        });

        // Mark no-go zones (obstacles, no-go, noZone) as unwalkable so A* avoids them
        // This must match validateTerrainMovement() which blocks these same types
        gameState.worldObjects.forEach(obj => {
            if (obj.type === 'obstacle' || obj.type === 'no-go' || obj.type === 'noZone') {
                this._markCellsInBounds(
                    obj,
                    (x, y) => this._pointInRect(x, y, obj, 0),
                    cell => {
                        cell.walkable = false;
                        cell.blocksUnits = true;
                        cell.clearance = 0;
                    }
                );
            }
        });

        this._computeClearance('clearance', cell => !cell.walkable);
        this._computeClearance('shoreClearance', cell => cell.isWater);
        this._computeClearance('waterClearance', cell => !cell.isWater || cell.blocksUnits);

        // Increase cost near obstacles to prefer the middle of corridors.
        const influenceRadius = 4; // cells
        const proximityWeight = 1.4; // keep some preference for open lanes without rejecting good shortcuts
        for (let y = 0; y < this.height; y++) {
            for (let x = 0; x < this.width; x++) {
                const cell = this.grid[y][x];
                if (!cell.walkable) continue;
                const d = Math.min(cell.clearance, influenceRadius);
                const proximity = 1 - (d / influenceRadius); // 0 far from walls, 1 at the wall
                const extra = proximity > 0 ? proximity * proximityWeight : 0;
                cell.cost = Math.max(1, cell.cost + extra);
            }
        }
        this._dirty = false;
        this.version++;
    }

    _computeClearance(propertyName, isBlocked) {
        const q = [];
        let head = 0;
        for (let y = 0; y < this.height; y++) {
            for (let x = 0; x < this.width; x++) {
                const cell = this.grid[y][x];
                if (isBlocked(cell)) {
                    cell[propertyName] = 0;
                    q.push({ x, y });
                } else {
                    cell[propertyName] = Infinity;
                }
            }
        }
        const dirs = [
            [1, 0], [-1, 0], [0, 1], [0, -1],
            [1, 1], [-1, 1], [1, -1], [-1, -1]
        ];
        while (head < q.length) {
            const { x, y } = q[head++];
            const base = this.grid[y][x];
            for (const [dx, dy] of dirs) {
                const nx = x + dx, ny = y + dy;
                if (!this.isValidCell(nx, ny)) continue;
                const ncell = this.grid[ny][nx];
                const cand = base[propertyName] + 1;
                if (cand < ncell[propertyName]) {
                    ncell[propertyName] = cand;
                    q.push({ x: nx, y: ny });
                }
            }
        }
    }

    markDirty() {
        this._dirty = true;
    }
}

// Binary min-heap keyed by fScore for O(log n) A* open list operations
class BinaryMinHeap {
    constructor() {
        this.data = [];       // [{key, x, y}]
        this.posMap = new Map(); // "x,y" -> index in data
    }

    get size() { return this.data.length; }

    _swap(i, j) {
        const tmp = this.data[i];
        this.data[i] = this.data[j];
        this.data[j] = tmp;
        this.posMap.set(`${this.data[i].x},${this.data[i].y}`, i);
        this.posMap.set(`${this.data[j].x},${this.data[j].y}`, j);
    }

    _bubbleUp(i) {
        while (i > 0) {
            const parent = (i - 1) >> 1;
            if (this.data[i].key < this.data[parent].key) {
                this._swap(i, parent);
                i = parent;
            } else break;
        }
    }

    _sinkDown(i) {
        const n = this.data.length;
        while (true) {
            let smallest = i;
            const l = 2 * i + 1, r = 2 * i + 2;
            if (l < n && this.data[l].key < this.data[smallest].key) smallest = l;
            if (r < n && this.data[r].key < this.data[smallest].key) smallest = r;
            if (smallest === i) break;
            this._swap(i, smallest);
            i = smallest;
        }
    }

    push(x, y, key) {
        const node = { key, x, y };
        const idx = this.data.length;
        this.data.push(node);
        this.posMap.set(`${x},${y}`, idx);
        this._bubbleUp(idx);
    }

    pop() {
        if (this.data.length === 0) return null;
        const top = this.data[0];
        this.posMap.delete(`${top.x},${top.y}`);
        const last = this.data.pop();
        if (this.data.length > 0) {
            this.data[0] = last;
            this.posMap.set(`${last.x},${last.y}`, 0);
            this._sinkDown(0);
        }
        return top;
    }

    contains(x, y) {
        return this.posMap.has(`${x},${y}`);
    }

    decreaseKey(x, y, newKey) {
        const idx = this.posMap.get(`${x},${y}`);
        if (idx === undefined) return;
        if (newKey < this.data[idx].key) {
            this.data[idx].key = newKey;
            this._bubbleUp(idx);
        }
    }
}

// Cardinals first so an escape walk prefers straight-out over diagonal.
const ESCAPE_DIRS = [
    [1, 0], [-1, 0], [0, 1], [0, -1],
    [1, 1], [-1, 1], [1, -1], [-1, -1]
];

class AStarPathfinder {
    constructor(grid) {
        this.grid = grid;
        this.lastPathUsedEscape = false;
        this.lastPathEscapeOnly = false;
        this._allowUnsafeShoreline = false;
    }

    getClearanceCellsForUnit(unitType) {
        const radius = (typeof getTerrainClearanceRadius === 'function')
            ? getTerrainClearanceRadius(unitType)
            : 16;
        return Math.max(1, Math.ceil((radius + this.grid.cellSize * 0.5) / this.grid.cellSize));
    }

    getHardShoreClearanceCells(isShip, clearanceCells) {
        if (isShip) return Math.max(0, clearanceCells || 0);
        const configured = GAME_CONFIG.pathfinding?.shorelineHardClearanceCells ?? 3;
        return Math.max(clearanceCells || 0, configured);
    }

    getPreferredShoreClearanceCells(isShip) {
        return isShip
            ? (GAME_CONFIG.pathfinding?.shipShorelinePreferredClearanceCells ?? 4)
            : (GAME_CONFIG.pathfinding?.shorelinePreferredClearanceCells ?? 7);
    }

    getPreferredObstacleClearanceCells(isShip, clearanceCells = 0) {
        if (isShip) return Math.max(clearanceCells || 0, this.getPreferredShoreClearanceCells(true));
        return Math.max(
            clearanceCells || 0,
            GAME_CONFIG.pathfinding?.obstaclePreferredClearanceCells ?? 6
        );
    }

    getLaneClearance(cell, isShip = false) {
        if (!cell) return 0;
        if (isShip) return cell.waterClearance;
        if (cell.isBridge) return cell.clearance;
        return Math.min(cell.clearance, cell.shoreClearance ?? cell.clearance);
    }

    getLaneSafetyScore(cell, isShip = false, clearanceCells = 0) {
        if (!cell) return -Infinity;
        const laneClearance = this.getLaneClearance(cell, isShip);
        if (!Number.isFinite(laneClearance)) return 999;
        const preferred = Math.max(
            this.getPreferredShoreClearanceCells(isShip),
            this.getPreferredObstacleClearanceCells(isShip, clearanceCells)
        );
        return Math.min(laneClearance, preferred + 6);
    }

    getShorelineCost(cell, isShip = false, clearanceCells = 0) {
        if (!cell || cell.isBridge) return 0;
        const clearance = isShip ? cell.waterClearance : cell.shoreClearance;
        if (!Number.isFinite(clearance)) return 0;
        const preferred = Math.max(
            this.getPreferredShoreClearanceCells(isShip),
            this.getPreferredObstacleClearanceCells(isShip, clearanceCells)
        );
        if (clearance >= preferred) return 0;
        const deficit = preferred - clearance;
        const pressure = deficit / Math.max(1, preferred);
        const weight = isShip
            ? (GAME_CONFIG.pathfinding?.shipShorelineCostWeight ?? 3)
            : (GAME_CONFIG.pathfinding?.shorelineCostWeight ?? 14);
        return pressure * pressure * weight + deficit * deficit * (isShip ? 0.25 : 0.9);
    }

    getObstacleProximityCost(cell, isShip = false, clearanceCells = 0) {
        if (!cell || isShip) return 0;
        const clearance = cell.clearance;
        if (!Number.isFinite(clearance)) return 0;
        const preferred = this.getPreferredObstacleClearanceCells(false, clearanceCells);
        if (clearance >= preferred) return 0;
        const deficit = preferred - clearance;
        const weight = GAME_CONFIG.pathfinding?.obstacleCostWeight ?? 8;
        return deficit * deficit * weight * 0.18;
    }

    getCornerTrapCost(x, y, isShip = false, clearanceCells = 0) {
        const cell = this.grid.grid[y]?.[x];
        if (!cell || cell.isBridge) return 0;
        const preferred = Math.max(
            this.getPreferredShoreClearanceCells(isShip),
            this.getPreferredObstacleClearanceCells(isShip, clearanceCells)
        );
        const laneClearance = this.getLaneClearance(cell, isShip);
        if (!Number.isFinite(laneClearance) || laneClearance >= preferred) return 0;

        let blockedCardinal = 0;
        let blockedDiagonal = 0;
        for (const [dx, dy] of ESCAPE_DIRS) {
            const nx = x + dx;
            const ny = y + dy;
            const cardinal = dx === 0 || dy === 0;
            if (!this.grid.isValidCell(nx, ny) || !this.isWalkable(nx, ny, isShip, clearanceCells)) {
                if (cardinal) blockedCardinal++;
                else blockedDiagonal++;
            }
        }
        if (blockedCardinal + blockedDiagonal < 2) return 0;
        const cornerPressure = blockedCardinal * 1.4 + blockedDiagonal * 0.45;
        const deficit = preferred - laneClearance;
        const weight = GAME_CONFIG.pathfinding?.cornerTrapCostWeight ?? 18;
        return deficit * cornerPressure * weight * 0.35;
    }

    isComfortableWalkable(x, y, isShip = false, clearanceCells = 0) {
        if (!this.isWalkable(x, y, isShip, clearanceCells)) return false;
        const cell = this.grid.grid[y][x];
        if (cell.isBridge) return true;
        const laneClearance = this.getLaneClearance(cell, isShip);
        if (!Number.isFinite(laneClearance)) return true;
        const preferred = Math.max(
            this.getPreferredShoreClearanceCells(isShip),
            this.getPreferredObstacleClearanceCells(isShip, clearanceCells)
        );
        return laneClearance >= preferred;
    }

    // A unit standing where validateTerrainMovement() allows it but the grid does
    // not (the band around every building/shore that is legal to occupy yet too
    // tight for A* clearance) has no walkable start cell, so a plain A* returns
    // null and the order is dropped. Walk such a unit back out to open ground
    // first and treat that walk as the head of the path.
    findEscapeRoute(startX, startY, unitType, isShip, clearanceCells, maxCells = 600) {
        const startCell = this.grid.worldToGrid(startX, startY);
        if (!this.grid.isValidCell(startCell.x, startCell.y)) return null;

        const probe = { type: unitType };
        const canOccupy = (cx, cy) => {
            if (!this.grid.isValidCell(cx, cy)) return false;
            if (typeof validateTerrainMovement !== 'function') return true;
            const w = this.grid.gridToWorld(cx, cy);
            return validateTerrainMovement(probe, w.x, w.y);
        };

        const keyOf = c => `${c.x},${c.y}`;
        const cameFrom = new Map();
        const visited = new Set([keyOf(startCell)]);
        const queue = [startCell];
        let head = 0;
        let goal = null;
        let firstWalkableGoal = null;

        while (head < queue.length && head < maxCells) {
            const cur = queue[head++];
            const isStart = cur.x === startCell.x && cur.y === startCell.y;
            if (!isStart && this.isWalkable(cur.x, cur.y, isShip, clearanceCells)) {
                if (!firstWalkableGoal) firstWalkableGoal = cur;
                if (this.isComfortableWalkable(cur.x, cur.y, isShip, clearanceCells)) {
                    goal = cur;
                    break;
                }
            }
            for (const [dx, dy] of ESCAPE_DIRS) {
                const nx = cur.x + dx;
                const ny = cur.y + dy;
                const nk = `${nx},${ny}`;
                if (visited.has(nk) || !this.grid.isValidCell(nx, ny)) continue;
                // Step only through cells the unit could legally stand on, or the
                // properly-clear cell we are trying to reach.
                if (!canOccupy(nx, ny) && !this.isWalkable(nx, ny, isShip, clearanceCells)) continue;
                visited.add(nk);
                cameFrom.set(nk, cur);
                queue.push({ x: nx, y: ny });
            }
        }
        if (!goal) goal = firstWalkableGoal;
        if (!goal) return null;

        const cells = [];
        for (let cur = goal; cur; cur = cameFrom.get(keyOf(cur))) {
            cells.unshift(cur);
        }
        // Index 0 is the unit's real position so callers can strip it exactly
        // like the first element of an ordinary path.
        const points = [{ x: startX, y: startY }];
        for (let i = 1; i < cells.length; i++) {
            points.push(this.grid.gridToWorld(cells[i].x, cells[i].y));
        }
        if (points.length < 2) return null;

        for (let i = 1; i < points.length; i++) {
            const prev = points[i - 1];
            const prevCell = this.grid.worldToGrid(prev.x, prev.y);
            const prevIsClear = this.isWalkable(prevCell.x, prevCell.y, isShip, clearanceCells);
            // While still inside the pocket only the hard terrain rule applies —
            // demanding full clearance there is what trapped the unit to begin
            // with. Once out, hold the segment to the normal standard.
            const ok = prevIsClear
                ? this.hasTerrainFootprintLineOfSight(prev.x, prev.y, points[i].x, points[i].y, unitType, false)
                : this.hasTerrainTypeLineOfSight(prev.x, prev.y, points[i].x, points[i].y, unitType);
            if (!ok) return null;
        }
        return { points, cell: goal };
    }

    // Water/bridge legality only — no building or clearance buffer. Used while a
    // unit is escaping a pocket, where the buffer is the very thing being left.
    hasTerrainTypeLineOfSight(x0, y0, x1, y1, unitType) {
        if (typeof isTerrainPointAllowedForUnit !== 'function') return true;
        const dx = x1 - x0;
        const dy = y1 - y0;
        const dist = Math.hypot(dx, dy);
        if (dist === 0) return true;
        const steps = Math.max(2, Math.ceil(dist / 8));
        for (let i = 0; i <= steps; i++) {
            const t = i / steps;
            if (!isTerrainPointAllowedForUnit(unitType, x0 + dx * t, y0 + dy * t)) return false;
        }
        return true;
    }

    findPath(startX, startY, endX, endY, unitType = 'villager', options = {}) {
        const previousShorelineMode = this._allowUnsafeShoreline;
        this.lastPathUsedEscape = false;
        this.lastPathEscapeOnly = false;
        this._allowUnsafeShoreline = !!options.allowUnsafeShoreline;
        try {
            return this._findPathInternal(startX, startY, endX, endY, unitType);
        } finally {
            this._allowUnsafeShoreline = previousShorelineMode;
        }
    }

    _findPathInternal(startX, startY, endX, endY, unitType = 'villager') {
        const start = this.grid.worldToGrid(startX, startY);
        const end = this.grid.worldToGrid(endX, endY);

        if (!this.grid.isValidCell(start.x, start.y) || !this.grid.isValidCell(end.x, end.y)) {
            return null;
        }

        const isShip = GAME_CONFIG.units[unitType]?.vessel;
        const clearanceCells = this.getClearanceCellsForUnit(unitType);

        // If end position is not walkable, find nearest walkable position
        if (!this.isWalkable(end.x, end.y, isShip, clearanceCells)) {
            const nearestWalkable = this.findNearestWalkableCell(end.x, end.y, isShip, clearanceCells);
            if (nearestWalkable) {
                end.x = nearestWalkable.x;
                end.y = nearestWalkable.y;
            } else {
                return null; // No walkable path exists
            }
        }

        // If the unit itself is parked in a sub-clearance pocket, prepend the walk
        // out of it and run A* from open ground instead of failing outright.
        let escapePoints = null;
        if (!this.isWalkable(start.x, start.y, isShip, clearanceCells)) {
            const escape = this.findEscapeRoute(startX, startY, unitType, isShip, clearanceCells);
            if (!escape) return null;
            escapePoints = escape.points;
            start.x = escape.cell.x;
            start.y = escape.cell.y;
            this.lastPathUsedEscape = true;
            if (start.x === end.x && start.y === end.y) {
                return escapePoints;
            }
        }

        const openHeap = new BinaryMinHeap();
        const closedList = new Set();
        const cameFrom = new Map();
        const gScore = new Map();

        const startKey = `${start.x},${start.y}`;
        const endKey = `${end.x},${end.y}`;
        const maxSearchCells = GAME_CONFIG.pathfinding?.maxSearchCells || 60000;
        let expandedCells = 0;

        const startF = this.heuristic(start, end);
        gScore.set(startKey, 0);
        openHeap.push(start.x, start.y, startF);

        while (openHeap.size > 0) {
            expandedCells++;
            if (expandedCells > maxSearchCells) {
                return null;
            }

            const current = openHeap.pop();
            const currentKey = `${current.x},${current.y}`;

            if (currentKey === endKey) {
                // Reconstruct path
                const path = [];
                let temp = current;
                while (temp) {
                    const worldPos = this.grid.gridToWorld(temp.x, temp.y);
                    path.unshift(worldPos);
                    temp = cameFrom.get(`${temp.x},${temp.y}`);
                }
                // Post-process for smoother, safer paths. The first pass moves
                // intermediate grid points toward lane centers before any LOS
                // simplification can erase that safer route.
                const relaxed = this.relaxPathAwayFromEdges(path, isShip, clearanceCells, unitType);
                const simplified = this.simplifyPathLOS(relaxed, isShip, clearanceCells, true);
                const rounded = this.pruneBacktrackingWaypoints(
                    this.roundCorners(simplified, isShip, clearanceCells),
                    isShip, clearanceCells, unitType
                );
                const curved = this.pruneBacktrackingWaypoints(
                    this.splineSmooth(rounded, isShip, clearanceCells),
                    isShip, clearanceCells, unitType
                );
                for (const candidate of [curved, rounded, simplified, relaxed, path]) {
                    const safePath = this.validatePath(candidate, isShip, clearanceCells, unitType);
                    if (safePath && safePath.length > 1) {
                        // Escape prefix ends on the A* start cell, so drop that
                        // duplicate joint before splicing.
                        return escapePoints ? escapePoints.concat(safePath.slice(1)) : safePath;
                    }
                }
                // The unit still gets to leave the pocket even if the onward leg
                // is unusable — better than standing frozen next to its barracks.
                if (escapePoints) this.lastPathEscapeOnly = true;
                return escapePoints || null;
            }

            closedList.add(currentKey);

            // Check neighbors
            const neighbors = this.getNeighbors(current.x, current.y);
            for (const neighbor of neighbors) {
                const neighborKey = `${neighbor.x},${neighbor.y}`;
                // Prevent diagonal corner-cutting through tight gaps
                const isDiag = (neighbor.x !== current.x) && (neighbor.y !== current.y);
                if (isDiag) {
                    const nx = neighbor.x, ny = neighbor.y;
                    const b1 = this.isWalkable(current.x, ny, isShip, clearanceCells);
                    const b2 = this.isWalkable(nx, current.y, isShip, clearanceCells);
                    if (!b1 || !b2) {
                        continue; // skip diagonals that pass between two blocked orthogonals
                    }
                }
                if (closedList.has(neighborKey) || !this.isWalkable(neighbor.x, neighbor.y, isShip, clearanceCells)) {
                    continue;
                }

                const moveCost = this.getMoveCost(current, neighbor, isShip, clearanceCells);
                const parent = cameFrom.get(currentKey) || null;
                const turnCost = this.getTurnPenalty(parent, current, neighbor, isShip);
                const tentativeGScore = gScore.get(currentKey) + moveCost + turnCost;

                if (!gScore.has(neighborKey) || tentativeGScore < gScore.get(neighborKey)) {
                    cameFrom.set(neighborKey, current);
                    gScore.set(neighborKey, tentativeGScore);
                    const f = tentativeGScore + this.heuristic(neighbor, end);

                    if (openHeap.contains(neighbor.x, neighbor.y)) {
                        openHeap.decreaseKey(neighbor.x, neighbor.y, f);
                    } else {
                        openHeap.push(neighbor.x, neighbor.y, f);
                    }
                }
            }
        }

        // Exhausted the open set. If we at least computed a way out of a pocket,
        // hand that back so the unit is not left permanently immobile.
        if (escapePoints) this.lastPathEscapeOnly = true;
        return escapePoints || null;
    }

    // Check line of sight between two world points using grid walkability.
    // When requireComfort is true, interior samples must stay in open-lane
    // cells; endpoints are allowed to sit closer to a clicked target/resource.
    hasLineOfSight(x0, y0, x1, y1, isShip = false, clearanceCells = 0, requireComfort = false) {
        const dx = x1 - x0;
        const dy = y1 - y0;
        const dist = Math.hypot(dx, dy);
        if (dist === 0) return true;
        // Slightly denser sampling to avoid corner clipping
        const steps = Math.max(3, Math.ceil(dist / (this.grid.cellSize * 0.4)));
        for (let i = 0; i <= steps; i++) {
            const t = i / steps;
            const sx = x0 + dx * t;
            const sy = y0 + dy * t;
            const cell = this.grid.worldToGrid(sx, sy);
            if (!this.grid.isValidCell(cell.x, cell.y)) return false;
            if (!this.isWalkable(cell.x, cell.y, isShip, clearanceCells)) return false;
            if (requireComfort && i > 0 && i < steps &&
                !this.isComfortableWalkable(cell.x, cell.y, isShip, clearanceCells)) {
                return false;
            }
        }
        return true;
    }

    hasComfortLineOfSight(x0, y0, x1, y1, isShip = false, clearanceCells = 0) {
        return this.hasLineOfSight(x0, y0, x1, y1, isShip, clearanceCells, true);
    }

    // Simplify path by removing unnecessary waypoints using LOS
    simplifyPathLOS(path, isShip = false, clearanceCells = 0, requireComfort = false) {
        if (!path || path.length <= 2) return path || [];
        const result = [];
        let i = 0;
        result.push(path[0]);
        while (i < path.length - 1) {
            let j = path.length - 1;
            // Find farthest j visible from i
            for (; j > i + 1; j--) {
                if (this.hasLineOfSight(path[i].x, path[i].y, path[j].x, path[j].y,
                    isShip, clearanceCells, requireComfort)) {
                    break;
                }
            }
            result.push(path[j]);
            i = j;
        }
        return result;
    }

    relaxPathAwayFromEdges(path, isShip = false, clearanceCells = 0, unitType = 'villager') {
        if (!path || path.length <= 2) return path || [];
        const radius = Math.max(1, GAME_CONFIG.pathfinding?.pathRelaxRadiusCells ?? 5);
        const out = [path[0]];

        for (let i = 1; i < path.length - 1; i++) {
            const point = path[i];
            const prev = out[out.length - 1];
            const next = path[i + 1];
            const prevCell = this.grid.worldToGrid(path[i - 1].x, path[i - 1].y);
            const cell = this.grid.worldToGrid(point.x, point.y);
            const nextCell = this.grid.worldToGrid(next.x, next.y);
            const isTurn = (cell.x - prevCell.x) !== (nextCell.x - cell.x) ||
                (cell.y - prevCell.y) !== (nextCell.y - cell.y);
            const isRisky = !this.grid.isValidCell(cell.x, cell.y) ||
                !this.isComfortableWalkable(cell.x, cell.y, isShip, clearanceCells);
            const safer = (isTurn || isRisky)
                ? this.findSaferWaypoint(point, prev, next, isShip, clearanceCells, unitType, radius)
                : null;
            const chosen = safer || point;
            const last = out[out.length - 1];
            if (Math.hypot(chosen.x - last.x, chosen.y - last.y) > this.grid.cellSize * 0.35) {
                out.push(chosen);
            }
        }

        const finalPoint = path[path.length - 1];
        const last = out[out.length - 1];
        if (Math.hypot(finalPoint.x - last.x, finalPoint.y - last.y) > this.grid.cellSize * 0.35) {
            out.push(finalPoint);
        } else {
            out[out.length - 1] = finalPoint;
        }
        return out;
    }

    findSaferWaypoint(point, prev, next, isShip, clearanceCells, unitType, radiusCells) {
        const origin = this.grid.worldToGrid(point.x, point.y);
        if (!this.grid.isValidCell(origin.x, origin.y)) return null;

        let best = point;
        let bestScore = -Infinity;
        const originalCell = this.grid.grid[origin.y][origin.x];
        const originalSafety = this.getLaneSafetyScore(originalCell, isShip, clearanceCells);
        const unitProbe = { type: unitType };

        for (let dy = -radiusCells; dy <= radiusCells; dy++) {
            for (let dx = -radiusCells; dx <= radiusCells; dx++) {
                const gx = origin.x + dx;
                const gy = origin.y + dy;
                if (!this.grid.isValidCell(gx, gy)) continue;
                if (!this.isWalkable(gx, gy, isShip, clearanceCells)) continue;

                const world = this.grid.gridToWorld(gx, gy);
                if (typeof validateTerrainMovement === 'function' &&
                    !validateTerrainMovement(unitProbe, world.x, world.y)) continue;
                if (!this.hasLineOfSight(prev.x, prev.y, world.x, world.y, isShip, clearanceCells)) continue;
                if (!this.hasLineOfSight(world.x, world.y, next.x, next.y, isShip, clearanceCells)) continue;

                const cell = this.grid.grid[gy][gx];
                const safety = this.getLaneSafetyScore(cell, isShip, clearanceCells);
                if (safety < originalSafety + 0.75 && (dx !== 0 || dy !== 0)) continue;
                const fromOriginal = Math.hypot(dx, dy);
                const smoothness = this.getWorldTurnCost(prev, world, next);
                const score = safety * 8 - fromOriginal * 1.7 - smoothness * 2.8;
                if (score > bestScore) {
                    bestScore = score;
                    best = world;
                }
            }
        }

        if (best === point || bestScore === -Infinity) return null;
        const bestCell = this.grid.worldToGrid(best.x, best.y);
        const bestSafety = this.getLaneSafetyScore(this.grid.grid[bestCell.y][bestCell.x], isShip, clearanceCells);
        return bestSafety >= originalSafety + 0.75 ? best : null;
    }

    // Round corners by inserting short in/out points at turns
    roundCorners(path, isShip = false, clearanceCells = 0) {
        if (!path || path.length <= 2) return path || [];
        // Adaptive rounding: bigger arcs near bridges and narrow corridors
        const baseRadius = Math.max(8, this.grid.cellSize * 1.1);
        const out = [path[0]];
        for (let i = 1; i < path.length - 1; i++) {
            const p0 = path[i - 1];
            const p1 = path[i];
            const p2 = path[i + 1];
            const v1x = p1.x - p0.x, v1y = p1.y - p0.y;
            const v2x = p2.x - p1.x, v2y = p2.y - p1.y;
            const len1 = Math.hypot(v1x, v1y) || 1;
            const len2 = Math.hypot(v2x, v2y) || 1;
            const n1x = v1x / len1, n1y = v1y / len1;
            const n2x = v2x / len2, n2y = v2y / len2;
            // Determine local environment to scale rounding
            const gridP1 = this.grid.worldToGrid(p1.x, p1.y);
            let localRadius = baseRadius;
            if (this.grid.isValidCell(gridP1.x, gridP1.y)) {
                const cell = this.grid.grid[gridP1.y][gridP1.x];
                // If close to obstacles (low clearance), increase rounding to avoid hugging corners
                if (Number.isFinite(cell.clearance)) {
                    const nearWall = Math.max(0, (4 - Math.min(4, cell.clearance)));
                    localRadius += nearWall * (this.grid.cellSize * 0.5);
                }
                if (!isShip && Number.isFinite(cell.shoreClearance)) {
                    const preferredShore = this.getPreferredShoreClearanceCells(false);
                    const nearShore = Math.max(0, preferredShore - Math.min(preferredShore, cell.shoreClearance));
                    localRadius += nearShore * (this.grid.cellSize * 0.35);
                }
            }
            // If the corner lies on a bridge footprint, prefer an even larger arc for smooth transition
            const onBridge = (typeof isPointOnBridge === 'function') && isPointOnBridge(p1.x, p1.y);
            if (!isShip && onBridge) {
                localRadius = Math.max(localRadius, this.grid.cellSize * 2.0);
            }
            const r = Math.min(localRadius, len1 * 0.45, len2 * 0.45);
            const inPt = { x: p1.x - n1x * r, y: p1.y - n1y * r };
            const outPt = { x: p1.x + n2x * r, y: p1.y + n2y * r };
            // Validate both rounded points are on walkable cells before using them
            const inCell = this.grid.worldToGrid(inPt.x, inPt.y);
            const outCell = this.grid.worldToGrid(outPt.x, outPt.y);
            const inWalkable = this.isWalkable(inCell.x, inCell.y, isShip, clearanceCells);
            const outWalkable = this.isWalkable(outCell.x, outCell.y, isShip, clearanceCells);
            if (inWalkable && outWalkable && this.hasLineOfSight(inPt.x, inPt.y, outPt.x, outPt.y, isShip, clearanceCells)) {
                out.push(inPt);
                out.push(outPt);
            } else {
                out.push(p1);
            }
        }
        out.push(path[path.length - 1]);
        return out;
    }

    // Additional smoothing using a Catmull-Rom-like spline with LOS checks
    splineSmooth(path, isShip = false, clearanceCells = 0) {
        if (!path || path.length < 3) return path || [];
        const pts = path;
        const result = [pts[0]];
        const step = 0.25; // sampling resolution
        for (let i = 0; i < pts.length - 1; i++) {
            const p0 = pts[Math.max(0, i - 1)];
            const p1 = pts[i];
            const p2 = pts[i + 1];
            const p3 = pts[Math.min(pts.length - 1, i + 2)];
            for (let t = step; t < 1 + 1e-6; t += step) {
                const t2 = t * t;
                const t3 = t2 * t;
                const x = 0.5 * ((2 * p1.x) + (-p0.x + p2.x) * t + (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 + (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3);
                const y = 0.5 * ((2 * p1.y) + (-p0.y + p2.y) * t + (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 + (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3);
                const prev = result[result.length - 1];
                const dist = Math.hypot(x - prev.x, y - prev.y);
                // Validate spline point is on a walkable cell
                const spCell = this.grid.worldToGrid(x, y);
                const spWalkable = this.grid.isValidCell(spCell.x, spCell.y) && this.isWalkable(spCell.x, spCell.y, isShip, clearanceCells);
                if (spWalkable && dist >= this.grid.cellSize * 0.5 && this.hasLineOfSight(prev.x, prev.y, x, y, isShip, clearanceCells)) {
                    result.push({ x, y });
                }
            }
        }
        // Ensure exact final point
        const last = pts[pts.length - 1];
        const prev = result[result.length - 1];
        if (!prev) {
            result.push(last);
        } else if (Math.hypot(prev.x - last.x, prev.y - last.y) > this.grid.cellSize * 0.25 &&
            this.hasLineOfSight(prev.x, prev.y, last.x, last.y, isShip, clearanceCells)) {
            result.push(last);
        } else {
            result[result.length - 1] = last;
        }
        return result;
    }

    hasTerrainFootprintLineOfSight(x0, y0, x1, y1, unitType, skipStart = false) {
        if (typeof validateTerrainMovement !== 'function') return true;
        const dx = x1 - x0;
        const dy = y1 - y0;
        const dist = Math.hypot(dx, dy);
        if (dist === 0) return true;
        const steps = Math.max(2, Math.ceil(dist / Math.max(4, this.grid.cellSize * 0.25)));
        const unit = { type: unitType };
        for (let i = skipStart ? 1 : 0; i <= steps; i++) {
            const t = i / steps;
            const sx = x0 + dx * t;
            const sy = y0 + dy * t;
            if (!validateTerrainMovement(unit, sx, sy)) return false;
        }
        return true;
    }

    pruneBacktrackingWaypoints(path, isShip = false, clearanceCells = 0, unitType = 'villager') {
        if (!path || path.length <= 2) return path || [];
        const maxTurn = GAME_CONFIG.pathfinding?.maxPathTurnDegrees ?? 135;
        const maxTurnRad = maxTurn * Math.PI / 180;
        const result = path.slice();
        let changed = true;

        while (changed && result.length > 2) {
            changed = false;
            for (let i = 1; i < result.length - 1; i++) {
                const a = result[i - 1];
                const b = result[i];
                const c = result[i + 1];
                const ab = Math.hypot(b.x - a.x, b.y - a.y);
                const bc = Math.hypot(c.x - b.x, c.y - b.y);
                if (ab < this.grid.cellSize * 0.25 || bc < this.grid.cellSize * 0.25) {
                    result.splice(i, 1);
                    changed = true;
                    break;
                }
                const turn = this.getWorldTurnCost(a, b, c) * Math.PI;
                if (turn <= maxTurnRad) continue;
                if (this.hasLineOfSight(a.x, a.y, c.x, c.y, isShip, clearanceCells) &&
                    this.hasTerrainFootprintLineOfSight(a.x, a.y, c.x, c.y, unitType, false)) {
                    result.splice(i, 1);
                    changed = true;
                    break;
                }
            }
        }
        return result;
    }

    // Final sweep: every waypoint and every segment must keep unit clearance.
    validatePath(path, isShip = false, clearanceCells = 0, unitType = 'villager') {
        if (!path || path.length <= 1) return path || [];
        const result = [];
        for (let i = 0; i < path.length; i++) {
            const point = path[i];
            if (i === 0) {
                result.push(point);
                continue;
            }

            const cell = this.grid.worldToGrid(point.x, point.y);
            if (!this.grid.isValidCell(cell.x, cell.y) || !this.isWalkable(cell.x, cell.y, isShip, clearanceCells)) {
                return null;
            }
            if (typeof validateTerrainMovement === 'function' &&
                !validateTerrainMovement({ type: unitType }, point.x, point.y)) {
                return null;
            }

            const prev = result[result.length - 1];
            const gridSafe = i === 1 || this.hasLineOfSight(prev.x, prev.y, point.x, point.y, isShip, clearanceCells);
            const footprintSafe = this.hasTerrainFootprintLineOfSight(prev.x, prev.y, point.x, point.y, unitType, i === 1);
            if (gridSafe && footprintSafe) {
                result.push(point);
            } else {
                return null;
            }
        }
        return result.length > 1 ? result : null;
    }

    isWalkable(x, y, isShip = false, clearanceCells = 0) {
        if (!this.grid.isValidCell(x, y)) return false;

        const cell = this.grid.grid[y][x];
        const requiredClearance = Math.max(0, clearanceCells || 0);

        if (isShip) {
            // Ships can only move in water and need clearance from shore/bridges.
            if (cell.isWater !== true || cell.blocksUnits) return false;
            return (cell.waterClearance || 0) >= requiredClearance;
        } else {
            // Land units can only use cells with enough clearance from water/no-go/buildings.
            if (cell.isWater || !cell.walkable) return false;
            if ((cell.clearance || 0) < requiredClearance) return false;
            if (!cell.isBridge && !this._allowUnsafeShoreline) {
                const shoreClearance = cell.shoreClearance ?? cell.clearance;
                if ((shoreClearance || 0) < this.getHardShoreClearanceCells(isShip, requiredClearance)) {
                    return false;
                }
            }
            return true;
        }
    }

    getMoveCost(from, to, isShip = false, clearanceCells = 0) {
        const cell = this.grid.grid[to.y][to.x];
        let cost = cell.cost;
        const laneClearance = this.getLaneClearance(cell, isShip);
        if (Number.isFinite(laneClearance)) {
            const preferred = Math.max(
                this.getPreferredShoreClearanceCells(isShip),
                this.getPreferredObstacleClearanceCells(isShip, clearanceCells)
            );
            const deficit = Math.max(0, preferred - laneClearance);
            cost += deficit * deficit * (isShip ? 0.35 : 1.15);
        }
        cost += this.getShorelineCost(cell, isShip, clearanceCells);
        cost += this.getObstacleProximityCost(cell, isShip, clearanceCells);
        cost += this.getCornerTrapCost(to.x, to.y, isShip, clearanceCells);

        // Diagonal movement costs more
        if (from.x !== to.x && from.y !== to.y) {
            cost *= 1.414; // sqrt(2)
        }

        return cost;
    }

    getWorldTurnCost(prev, current, next) {
        const v1x = current.x - prev.x;
        const v1y = current.y - prev.y;
        const v2x = next.x - current.x;
        const v2y = next.y - current.y;
        const len1 = Math.hypot(v1x, v1y);
        const len2 = Math.hypot(v2x, v2y);
        if (len1 === 0 || len2 === 0) return 0;
        const dot = (v1x * v2x + v1y * v2y) / (len1 * len2);
        const clamped = Math.max(-1, Math.min(1, dot));
        return Math.acos(clamped) / Math.PI;
    }

    // Penalize sharp turns to encourage smoother paths during search
    getTurnPenalty(parent, current, next, isShip = false) {
        if (!parent) return 0;
        const v1x = current.x - parent.x;
        const v1y = current.y - parent.y;
        const v2x = next.x - current.x;
        const v2y = next.y - current.y;
        const len1 = Math.hypot(v1x, v1y);
        const len2 = Math.hypot(v2x, v2y);
        if (len1 === 0 || len2 === 0) return 0;
        const dot = (v1x * v2x + v1y * v2y) / (len1 * len2);
        const clamped = Math.max(-1, Math.min(1, dot));
        const angle = Math.acos(clamped); // 0..pi
        // Favor gentle curves: scale by normalized angle squared
        const baseWeight = isShip ? 0.8 : 1.35;
        return baseWeight * (angle / Math.PI) ** 2 * 2.2;
    }

    heuristic(a, b) {
        // Manhattan distance with diagonal movement
        const dx = Math.abs(a.x - b.x);
        const dy = Math.abs(a.y - b.y);
        return Math.sqrt(dx * dx + dy * dy);
    }

    getNeighbors(x, y) {
        const neighbors = [];

        // 8-directional movement
        for (let dx = -1; dx <= 1; dx++) {
            for (let dy = -1; dy <= 1; dy++) {
                if (dx === 0 && dy === 0) continue;

                const nx = x + dx;
                const ny = y + dy;

                if (this.grid.isValidCell(nx, ny)) {
                    neighbors.push({ x: nx, y: ny });
                }
            }
        }

        return neighbors;
    }

    findNearestWalkableCell(x, y, isShip = false, clearanceCells = 0, maxRadius = 16) {
        let best = null;
        let bestScore = Infinity;
        const preferred = this.getPreferredShoreClearanceCells(isShip);
        for (let radius = 1; radius <= maxRadius; radius++) {
            for (let dx = -radius; dx <= radius; dx++) {
                for (let dy = -radius; dy <= radius; dy++) {
                    if (Math.abs(dx) === radius || Math.abs(dy) === radius) {
                        const nx = x + dx;
                        const ny = y + dy;
                        if (this.isWalkable(nx, ny, isShip, clearanceCells)) {
                            const cell = this.grid.grid[ny][nx];
                            const safety = this.getLaneSafetyScore(cell, isShip, clearanceCells);
                            const shoreDeficit = cell.isBridge || !Number.isFinite(safety)
                                ? 0
                                : Math.max(0, preferred - safety);
                            const distance = Math.hypot(dx, dy);
                            const score = distance + shoreDeficit * shoreDeficit * 3.5 - safety * 0.35 - (cell.isBridge ? 4 : 0);
                            if (score < bestScore) {
                                bestScore = score;
                                best = { x: nx, y: ny };
                            }
                        }
                    }
                }
            }
        }
        return best;
    }
}

// Global pathfinding system
let pathfindingGrid = null;
let pathfinder = null;
const __pathCache = new Map();

function clonePath(path) {
    return path ? path.map(point => ({ x: point.x, y: point.y })) : null;
}

function getPathCacheKey(startX, startY, endX, endY, unitType) {
    const clusterCells = GAME_CONFIG.pathfinding?.cacheClusterCells || 4;
    const clusterSize = (pathfindingGrid?.cellSize || 32) * clusterCells;
    const pathClass = GAME_CONFIG.units[unitType]?.vessel ? 'vessel' : 'land';
    return [
        pathfindingGrid?.version || 0,
        pathClass,
        Math.floor(startX / clusterSize),
        Math.floor(startY / clusterSize),
        Math.floor(endX / clusterSize),
        Math.floor(endY / clusterSize)
    ].join('|');
}

function setCachedPath(key, path) {
    const maxEntries = GAME_CONFIG.pathfinding?.cacheMaxEntries || 300;
    if (__pathCache.size >= maxEntries) {
        const oldestKey = __pathCache.keys().next().value;
        __pathCache.delete(oldestKey);
    }
    __pathCache.set(key, clonePath(path));
}

function initializePathfinding() {
    const cellSize = GAME_CONFIG.pathfinding?.cellSize || 32;
    pathfindingGrid = new PathfindingGrid(GAME_CONFIG.world.width, GAME_CONFIG.world.height, cellSize);
    pathfinder = new AStarPathfinder(pathfindingGrid);
    __pathCache.clear();
    pathfindingGrid.updateObstacles();
}

function updatePathfindingGrid() {
    if (pathfindingGrid) {
        pathfindingGrid.updateObstacles();
        __pathCache.clear();
    }
}

function markPathfindingDirty() {
    if (pathfindingGrid) {
        pathfindingGrid.markDirty();
        __pathCache.clear();
    }
}

function findPath(startX, startY, endX, endY, unitType = 'villager') {
    if (!pathfinder) {
        initializePathfinding();
    }

    // Only rebuild the grid if it's been marked dirty
    if (pathfindingGrid._dirty) {
        updatePathfindingGrid();
    }
    pathfinder.lastPathUsedEscape = false;
    pathfinder.lastPathEscapeOnly = false;
    const cacheKey = getPathCacheKey(startX, startY, endX, endY, unitType);
    if (__pathCache.has(cacheKey)) {
        return clonePath(__pathCache.get(cacheKey));
    }

    let path = pathfinder.findPath(startX, startY, endX, endY, unitType, { allowUnsafeShoreline: false });
    if (!path && !GAME_CONFIG.units[unitType]?.vessel &&
        GAME_CONFIG.pathfinding?.allowShorelineFallback !== false) {
        path = pathfinder.findPath(startX, startY, endX, endY, unitType, { allowUnsafeShoreline: true });
    }
    // Never cache a failure or an escape route. Cache keys are quantised to
    // ~256px clusters, so one unit wedged against a wall would otherwise hand
    // its null (or its own personal way out) to every other unit nearby.
    if (path && path.length > 1 && !pathfinder.lastPathUsedEscape && !pathfinder.lastPathEscapeOnly) {
        setCachedPath(cacheKey, path);
    }
    return clonePath(path);
}

// Helper function to get the next waypoint for a unit
function getNextWaypoint(unit) {
    if (!unit.path || unit.path.length === 0) return null;

    // Check if we're close enough to the current waypoint
    const currentWaypoint = unit.path[0];
    const distance = Math.hypot(unit.x - currentWaypoint.x, unit.y - currentWaypoint.y);

    if (distance < 14) {
        // Remove reached waypoint and get next one
        unit.path.shift();
        return unit.path.length > 0 ? unit.path[0] : null;
    }

    return currentWaypoint;
}

// Function to set unit destination with pathfinding
function setUnitDestination(unit, targetX, targetY) {
    const unitConfig = GAME_CONFIG.units[unit.type];
    const isVessel = !!unitConfig?.vessel;
    const targetInWater = isPointInWater(targetX, targetY);
    const targetOnBridge = isPointOnBridge(targetX, targetY);

    // STRICT TERRAIN VALIDATION for destination
    if (isVessel) {
        // Water units can only go to water destinations
        if (!targetInWater || targetOnBridge) {
            console.warn(`Water unit ${unit.type} cannot move to land destination`);
            return false; // Invalid destination
        }
    } else {
        // Land units cannot go to water destinations (except bridges)
        if (targetInWater && !targetOnBridge) {
            console.warn(`Land unit ${unit.type} cannot move to water destination`);
            return false; // Invalid destination
        }
    }

    const path = findPath(unit.x, unit.y, targetX, targetY, unit.type);

    if (path && path.length > 1) {
        const safeEnd = path[path.length - 1];
        const escapeOnly = !!(pathfinder && pathfinder.lastPathEscapeOnly);
        unit.path = path.slice(1); // Remove starting position
        unit.state = 'moving';
        unit.requestedTargetX = targetX;
        unit.requestedTargetY = targetY;
        unit.targetX = safeEnd.x;
        unit.targetY = safeEnd.y;
        unit._repathAfterEscape = escapeOnly ? { x: targetX, y: targetY } : null;
        unit.pathfindingFailed = false;
        unit._stuckCount = 0;
        unit._moveProg = null;
        return true;
    }

    // Pathfinding failed. Do NOT fall back to free-form direct movement — that is
    // what let units walk through water. But do keep the order alive: hold the
    // destination and stay in 'moving' so updateUnit()'s validated step-and-slide
    // can nudge the unit out and retry. Going straight to 'idle' here is what made
    // freshly trained units ignore Move clicks entirely while still accepting
    // gather/attack orders (those states carry their own retry loops).
    const reachable = findNearestReachablePoint(unit, targetX, targetY);
    if (reachable) {
        const retryPath = findPath(unit.x, unit.y, reachable.x, reachable.y, unit.type);
        if (retryPath && retryPath.length > 1) {
            const safeEnd = retryPath[retryPath.length - 1];
            const escapeOnly = !!(pathfinder && pathfinder.lastPathEscapeOnly);
            unit.path = retryPath.slice(1);
            unit.state = 'moving';
            unit.requestedTargetX = targetX;
            unit.requestedTargetY = targetY;
            unit.targetX = safeEnd.x;
            unit.targetY = safeEnd.y;
            unit._repathAfterEscape = escapeOnly ? { x: targetX, y: targetY } : null;
            unit.pathfindingFailed = false;
            unit._stuckCount = 0;
            unit._moveProg = null;
            return true;
        }
    }

    unit.path = null;
    unit.state = 'moving';
    unit.requestedTargetX = targetX;
    unit.requestedTargetY = targetY;
    unit.targetX = targetX;
    unit.targetY = targetY;
    unit._repathAfterEscape = null;
    unit.pathfindingFailed = true;
    unit._stuckCount = 0;
    unit._moveProg = null;
    return false;
}

// Walk outward from a blocked destination looking for somewhere the unit can
// actually stand and reach, so an order onto an unreachable tile becomes an
// order onto the closest sane tile rather than a dropped command.
function findNearestReachablePoint(unit, targetX, targetY, maxRadius = 256, step = 32) {
    if (!pathfindingGrid) return null;
    const isVessel = !!GAME_CONFIG.units[unit.type]?.vessel;
    for (let radius = step; radius <= maxRadius; radius += step) {
        const samples = Math.max(8, Math.round((radius / step) * 8));
        for (let i = 0; i < samples; i++) {
            const theta = (i / samples) * Math.PI * 2;
            const px = targetX + Math.cos(theta) * radius;
            const py = targetY + Math.sin(theta) * radius;
            if (px < 8 || py < 8 ||
                px > GAME_CONFIG.world.width - 8 || py > GAME_CONFIG.world.height - 8) continue;
            if (isVessel && !isPointInWater(px, py)) continue;
            if (!validateTerrainMovement(unit, px, py)) continue;
            return { x: px, y: py };
        }
    }
    return null;
}
