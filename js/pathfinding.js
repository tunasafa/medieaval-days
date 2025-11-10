// Advanced Pathfinding System using A* Algorithm

class PathfindingGrid {
    constructor(worldWidth, worldHeight, cellSize = 16) {
        this.cellSize = cellSize;
        this.width = Math.ceil(worldWidth / cellSize);
        this.height = Math.ceil(worldHeight / cellSize);
        this.grid = [];
        this.worldWidth = worldWidth;
        this.worldHeight = worldHeight;
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
                    cost: 1
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

    updateObstacles() {
        // Reset grid
        for (let y = 0; y < this.height; y++) {
            for (let x = 0; x < this.width; x++) {
                this.grid[y][x].walkable = true;
                this.grid[y][x].cost = 1;
                this.grid[y][x].isWater = false; // Reset water flag
                this.grid[y][x].clearance = Infinity; // distance in cells to nearest obstacle
            }
        }

        // Mark water tiles
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
                            // Water is walkable only for ships, unwalkable for land units by default
                            this.grid[y][x].walkable = false;
                        }
                    }
                }
            }
        });

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
                            this.grid[y][x].cost = Math.max(1, this.grid[y][x].cost); // ensure reasonable cost
                        }
                    }
                }
            }
        });

        // Mark large buildings as obstacles with extra padding to avoid hugging walls
        gameState.buildings.forEach(building => {
            const margin = Math.max(16, this.cellSize); // at least one whole cell around buildings
            const startX = Math.floor((building.x - margin) / this.cellSize);
            const startY = Math.floor((building.y - margin) / this.cellSize);
            const endX = Math.ceil((building.x + building.width + margin) / this.cellSize);
            const endY = Math.ceil((building.y + building.height + margin) / this.cellSize);

            for (let y = startY; y < endY; y++) {
                for (let x = startX; x < endX; x++) {
                    if (this.isValidCell(x, y)) {
                        this.grid[y][x].walkable = false;
                        this.grid[y][x].clearance = 0;
                    }
                }
            }
        });

        // Mark areas with too many units as higher cost (but still walkable)
        const unitDensity = {};
        gameState.units.concat(gameState.enemyUnits).forEach(unit => {
            const gridPos = this.worldToGrid(unit.x, unit.y);
            if (this.isValidCell(gridPos.x, gridPos.y)) {
                const key = `${gridPos.x},${gridPos.y}`;
                unitDensity[key] = (unitDensity[key] || 0) + 1;
            }
        });

        // Apply unit density costs
        Object.keys(unitDensity).forEach(key => {
            const [x, y] = key.split(',').map(Number);
            if (unitDensity[key] > 1 && this.grid[y][x].walkable) {
                this.grid[y][x].cost = Math.min(10, 1 + unitDensity[key]);
            }
        });

        // Compute clearance distance (in cells) from obstacles via BFS
        const q = [];
        for (let y = 0; y < this.height; y++) {
            for (let x = 0; x < this.width; x++) {
                if (!this.grid[y][x].walkable) {
                    this.grid[y][x].clearance = 0;
                    q.push({ x, y });
                }
            }
        }
        const dirs = [ [1,0], [-1,0], [0,1], [0,-1] ];
        while (q.length > 0) {
            const { x, y } = q.shift();
            const base = this.grid[y][x];
            for (const [dx, dy] of dirs) {
                const nx = x + dx, ny = y + dy;
                if (!this.isValidCell(nx, ny)) continue;
                const ncell = this.grid[ny][nx];
                const cand = base.clearance + 1;
                if (cand < ncell.clearance) {
                    ncell.clearance = cand;
                    q.push({ x: nx, y: ny });
                }
            }
        }

    // Increase cost near obstacles to prefer the middle of corridors
    const influenceRadius = 5; // cells (broader influence)
    const proximityWeight = 5.0; // stronger penalty near walls/corners
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
    }
}

class AStarPathfinder {
    constructor(grid) {
        this.grid = grid;
    }

    findPath(startX, startY, endX, endY, unitType = 'villager') {
        const start = this.grid.worldToGrid(startX, startY);
        const end = this.grid.worldToGrid(endX, endY);

        if (!this.grid.isValidCell(start.x, start.y) || !this.grid.isValidCell(end.x, end.y)) {
            return null;
        }

        const isShip = GAME_CONFIG.units[unitType]?.vessel;
        
        // If end position is not walkable, find nearest walkable position
        if (!this.isWalkable(end.x, end.y, isShip)) {
            const nearestWalkable = this.findNearestWalkableCell(end.x, end.y, isShip);
            if (nearestWalkable) {
                end.x = nearestWalkable.x;
                end.y = nearestWalkable.y;
            } else {
                return null; // No walkable path exists
            }
        }

        const openList = [];
        const closedList = new Set();
        const cameFrom = new Map();
        const gScore = new Map();
        const fScore = new Map();

        const startKey = `${start.x},${start.y}`;
        const endKey = `${end.x},${end.y}`;

        gScore.set(startKey, 0);
        fScore.set(startKey, this.heuristic(start, end));
        openList.push(start);

    while (openList.length > 0) {
            // Find node with lowest fScore
            let currentIndex = 0;
            for (let i = 1; i < openList.length; i++) {
                const currentKey = `${openList[i].x},${openList[i].y}`;
                const bestKey = `${openList[currentIndex].x},${openList[currentIndex].y}`;
                if (fScore.get(currentKey) < fScore.get(bestKey)) {
                    currentIndex = i;
                }
            }

            const current = openList[currentIndex];
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
                // Post-process for smoother paths
                const simplified = this.simplifyPathLOS(path, isShip);
                const rounded = this.roundCorners(simplified, isShip);
                const curved = this.splineSmooth(rounded, isShip);
                return curved;
            }

            openList.splice(currentIndex, 1);
            closedList.add(currentKey);

            // Check neighbors
            const neighbors = this.getNeighbors(current.x, current.y);
            for (const neighbor of neighbors) {
                const neighborKey = `${neighbor.x},${neighbor.y}`;
                // Prevent diagonal corner-cutting through tight gaps
                const isDiag = (neighbor.x !== current.x) && (neighbor.y !== current.y);
                if (isDiag) {
                    const nx = neighbor.x, ny = neighbor.y;
                    const b1 = this.isWalkable(current.x, ny, isShip);
                    const b2 = this.isWalkable(nx, current.y, isShip);
                    if (!b1 || !b2) {
                        continue; // skip diagonals that pass between two blocked orthogonals
                    }
                }
                if (closedList.has(neighborKey) || !this.isWalkable(neighbor.x, neighbor.y, isShip)) {
                    continue;
                }

                const moveCost = this.getMoveCost(current, neighbor, isShip);
                const parent = cameFrom.get(currentKey) || null;
                const turnCost = this.getTurnPenalty(parent, current, neighbor, isShip);
                const tentativeGScore = gScore.get(currentKey) + moveCost + turnCost;

                if (!gScore.has(neighborKey) || tentativeGScore < gScore.get(neighborKey)) {
                    cameFrom.set(neighborKey, current);
                    gScore.set(neighborKey, tentativeGScore);
                    fScore.set(neighborKey, tentativeGScore + this.heuristic(neighbor, end));

                    if (!openList.find(n => n.x === neighbor.x && n.y === neighbor.y)) {
                        openList.push(neighbor);
                    }
                }
            }
        }

        return null; // No path found
    }

    // Check line of sight between two world points using grid walkability
    hasLineOfSight(x0, y0, x1, y1, isShip = false) {
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
            if (!this.isWalkable(cell.x, cell.y, isShip)) return false;
        }
        return true;
    }

    // Simplify path by removing unnecessary waypoints using LOS
    simplifyPathLOS(path, isShip = false) {
        if (!path || path.length <= 2) return path || [];
        const result = [];
        let i = 0;
        result.push(path[0]);
        while (i < path.length - 1) {
            let j = path.length - 1;
            // Find farthest j visible from i
            for (; j > i + 1; j--) {
                if (this.hasLineOfSight(path[i].x, path[i].y, path[j].x, path[j].y, isShip)) {
                    break;
                }
            }
            result.push(path[j]);
            i = j;
        }
        return result;
    }

    // Round corners by inserting short in/out points at turns
    roundCorners(path, isShip = false) {
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
            }
            // If the corner lies on a bridge footprint, prefer an even larger arc for smooth transition
            const onBridge = (typeof isPointOnBridge === 'function') && isPointOnBridge(p1.x, p1.y);
            if (!isShip && onBridge) {
                localRadius = Math.max(localRadius, this.grid.cellSize * 2.0);
            }
            const r = Math.min(localRadius, len1 * 0.45, len2 * 0.45);
            const inPt = { x: p1.x - n1x * r, y: p1.y - n1y * r };
            const outPt = { x: p1.x + n2x * r, y: p1.y + n2y * r };
            // Ensure the rounded segment has LOS
            if (this.hasLineOfSight(inPt.x, inPt.y, outPt.x, outPt.y, isShip)) {
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
    splineSmooth(path, isShip = false) {
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
                if (dist >= this.grid.cellSize * 0.5 && this.hasLineOfSight(prev.x, prev.y, x, y, isShip)) {
                    result.push({ x, y });
                }
            }
        }
        // Ensure exact final point
        const last = pts[pts.length - 1];
        const prev = result[result.length - 1];
        if (!prev || this.hasLineOfSight(prev.x, prev.y, last.x, last.y, isShip)) {
            result.push(last);
        } else {
            result.push(last);
        }
        return result;
    }

    isWalkable(x, y, isShip = false) {
        if (!this.grid.isValidCell(x, y)) return false;
        
        const cell = this.grid.grid[y][x];
        
        if (isShip) {
            // Ships can ONLY move in water - strictly enforce this
            return cell.isWater === true;
        } else {
            // Land units CANNOT walk on water - strictly enforce this
            if (cell.isWater) {
                // Check for bridges as the only exception
                const worldPos = this.grid.gridToWorld(x, y);
                return isPointOnBridge && isPointOnBridge(worldPos.x, worldPos.y);
            }
            // Land units can walk on land if it's not blocked by buildings/other obstacles
            return cell.walkable;
        }
    }

    getMoveCost(from, to, isShip = false) {
        const cell = this.grid.grid[to.y][to.x];
        let cost = cell.cost;

        // Diagonal movement costs more
        if (from.x !== to.x && from.y !== to.y) {
            cost *= 1.414; // sqrt(2)
        }

        return cost;
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
        const baseWeight = isShip ? 0.6 : 1.0;
        return baseWeight * (angle / Math.PI) ** 2 * 2.0; // tweak factor
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

    findNearestWalkableCell(x, y, isShip = false, maxRadius = 10) {
        for (let radius = 1; radius <= maxRadius; radius++) {
            for (let dx = -radius; dx <= radius; dx++) {
                for (let dy = -radius; dy <= radius; dy++) {
                    if (Math.abs(dx) === radius || Math.abs(dy) === radius) {
                        const nx = x + dx;
                        const ny = y + dy;
                        if (this.isWalkable(nx, ny, isShip)) {
                            return { x: nx, y: ny };
                        }
                    }
                }
            }
        }
        return null;
    }
}

// Global pathfinding system
let pathfindingGrid = null;
let pathfinder = null;

function initializePathfinding() {
    pathfindingGrid = new PathfindingGrid(GAME_CONFIG.world.width, GAME_CONFIG.world.height, 16);
    pathfinder = new AStarPathfinder(pathfindingGrid);
}

function updatePathfindingGrid() {
    if (pathfindingGrid) {
        pathfindingGrid.updateObstacles();
    }
}

function findPath(startX, startY, endX, endY, unitType = 'villager') {
    if (!pathfinder) {
        initializePathfinding();
    }
    
    updatePathfindingGrid();
    return pathfinder.findPath(startX, startY, endX, endY, unitType);
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
        if (!targetInWater) {
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
        unit.path = path.slice(1); // Remove starting position
        unit.state = 'moving';
        unit.targetX = targetX;
        unit.targetY = targetY;
        unit.pathfindingFailed = false;
        return true;
    } else {
        // Do NOT fallback to direct movement if pathfinding fails
        // This prevents units from moving through invalid terrain
        console.warn(`No valid path found for ${unit.type} to destination`);
        unit.path = null;
        unit.state = 'idle'; // Stop the unit instead of allowing illegal movement
        unit.pathfindingFailed = true;
        return false;
    }
}
