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

        // Mark large buildings as obstacles
        gameState.buildings.forEach(building => {
            const startX = Math.floor((building.x - 8) / this.cellSize);
            const startY = Math.floor((building.y - 8) / this.cellSize);
            const endX = Math.ceil((building.x + building.width + 8) / this.cellSize);
            const endY = Math.ceil((building.y + building.height + 8) / this.cellSize);

            for (let y = startY; y < endY; y++) {
                for (let x = startX; x < endX; x++) {
                    if (this.isValidCell(x, y)) {
                        this.grid[y][x].walkable = false;
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
                return path;
            }

            openList.splice(currentIndex, 1);
            closedList.add(currentKey);

            // Check neighbors
            const neighbors = this.getNeighbors(current.x, current.y);
            for (const neighbor of neighbors) {
                const neighborKey = `${neighbor.x},${neighbor.y}`;

                if (closedList.has(neighborKey) || !this.isWalkable(neighbor.x, neighbor.y, isShip)) {
                    continue;
                }

                const tentativeGScore = gScore.get(currentKey) + this.getMoveCost(current, neighbor, isShip);

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
    
    if (distance < 10) {
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
