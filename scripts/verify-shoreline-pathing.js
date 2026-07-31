/**
 * Regression checks for shoreline/corner pathing. These scenarios use stair-step
 * water masks because that is where grid A* most easily chooses a technically
 * legal route that still hugs corners and traps moving units.
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
let pass = 0;
let fail = 0;

function ok(condition, label, extra = '') {
    if (condition) {
        pass++;
        console.log(`  PASS  ${label}`);
    } else {
        fail++;
        console.log(`  FAIL  ${label}${extra ? ' -- ' + extra : ''}`);
    }
}

function makeCtx(worldObjects = []) {
    const sandbox = {
        console: { log: () => {}, warn: () => {}, error: () => {} },
        Math, Date, Number, Set, Map, Infinity, NaN, JSON, Array, Object,
        tilemap: null, Multiplayer: undefined, showNotification: () => {},
        SFX: undefined, ParticleSystem: undefined, updateSelectionInfo: () => {},
        updateResourceRates: () => {}, updateEnemyAI: () => {},
        updateConstructionSites: undefined, handleBuildingDestruction: () => {},
        findNearestResource: () => null, displayName: s => s,
        canAfford: () => true, deductResources: () => {},
        isEnemyFaction: unit => unit?.player && unit.player !== 'player',
    };
    sandbox.globalThis = sandbox;
    vm.createContext(sandbox);
    for (const file of ['js/config.js', 'js/utilities.js', 'js/pathfinding.js', 'js/units.js']) {
        vm.runInContext(fs.readFileSync(path.join(ROOT, file), 'utf8'), sandbox, { filename: file });
    }
    vm.runInContext(`
        GAME_CONFIG.world.width = 4000;
        GAME_CONFIG.world.height = 4000;
        GAME_CONFIG.world.radius = 2000;
        globalThis.gameState = {
            resources: { food: 9e9, wood: 9e9, stone: 9e9, gold: 9e9 },
            population: { current: 0, max: 500 },
            units: [], buildings: [], enemyUnits: [], enemyBuildings: [],
            worldObjects: ${JSON.stringify(worldObjects)},
            selectedUnits: [], selectedBuilding: null, waterField: null
        };
        initializePathfinding();

        function __pathMetrics(path, unitType) {
            if (!path || path.length < 2) return null;
            const isShip = !!GAME_CONFIG.units[unitType]?.vessel;
            const clearanceCells = pathfinder.getClearanceCellsForUnit(unitType);
            const comfort = Math.max(
                pathfinder.getPreferredShoreClearanceCells(isShip),
                pathfinder.getPreferredObstacleClearanceCells(isShip, clearanceCells)
            );
            let minLane = Infinity;
            let badSamples = 0;
            let tightSamples = 0;
            let samples = 0;
            for (let i = 1; i < path.length; i++) {
                const a = path[i - 1];
                const b = path[i];
                const dist = Math.hypot(b.x - a.x, b.y - a.y);
                const steps = Math.max(2, Math.ceil(dist / 16));
                for (let s = 0; s <= steps; s++) {
                    const t = s / steps;
                    const x = a.x + (b.x - a.x) * t;
                    const y = a.y + (b.y - a.y) * t;
                    const cellPos = pathfindingGrid.worldToGrid(x, y);
                    samples++;
                    if (!pathfindingGrid.isValidCell(cellPos.x, cellPos.y) ||
                        !pathfinder.isWalkable(cellPos.x, cellPos.y, isShip, clearanceCells) ||
                        !validateTerrainMovement({ type: unitType }, x, y)) {
                        badSamples++;
                        continue;
                    }
                    const cell = pathfindingGrid.grid[cellPos.y][cellPos.x];
                    const lane = isShip
                        ? cell.waterClearance
                        : (cell.isBridge ? cell.clearance : Math.min(cell.clearance, cell.shoreClearance ?? cell.clearance));
                    if (Number.isFinite(lane)) {
                        minLane = Math.min(minLane, lane);
                        if (lane < comfort) tightSamples++;
                    }
                }
            }

            let maxTurn = 0;
            for (let i = 1; i < path.length - 1; i++) {
                const a = path[i - 1], b = path[i], c = path[i + 1];
                const v1x = b.x - a.x, v1y = b.y - a.y;
                const v2x = c.x - b.x, v2y = c.y - b.y;
                const l1 = Math.hypot(v1x, v1y);
                const l2 = Math.hypot(v2x, v2y);
                if (l1 === 0 || l2 === 0) continue;
                const dot = (v1x * v2x + v1y * v2y) / (l1 * l2);
                const angle = Math.acos(Math.max(-1, Math.min(1, dot))) * 180 / Math.PI;
                maxTurn = Math.max(maxTurn, angle);
            }
            return {
                length: path.length,
                samples,
                badSamples,
                tightSamples,
                minLane,
                tightRatio: tightSamples / Math.max(1, samples),
                maxTurn: Math.round(maxTurn)
            };
        }
    `, sandbox);
    return sandbox;
}

function R(ctx, code) {
    return vm.runInContext(code, ctx);
}

function jaggedLakeObjects() {
    const objects = [{ type: 'water', x: 650, y: 2100, width: 2700, height: 820 }];
    for (let i = 0; i < 11; i++) {
        objects.push({
            type: 'water',
            x: 760 + i * 215,
            y: i % 2 === 0 ? 1760 : 1840,
            width: 132,
            height: i % 2 === 0 ? 360 : 280
        });
    }
    return objects;
}

console.log('\n[1] Long routes around toothy shores stay in the open lane');
{
    const ctx = makeCtx(jaggedLakeObjects());
    const path = R(ctx, `findPath(820, 1640, 3180, 1640, 'militia')`);
    const metrics = R(ctx, `__pathMetrics(${JSON.stringify(path)}, 'militia')`);
    ok(!!path && path.length > 2, 'route exists across jagged shoreline');
    ok(metrics.badSamples === 0, 'route never samples water or blocked terrain', JSON.stringify(metrics));
    const hardClearance = R(ctx, `GAME_CONFIG.pathfinding.shorelineHardClearanceCells`);
    ok(metrics.minLane >= hardClearance,
        'route stays outside the hard shoreline danger band', JSON.stringify(metrics));
    ok(metrics.tightRatio < 0.22,
        'route spends little time in the soft shoreline band', JSON.stringify(metrics));
    ok(metrics.maxTurn <= 115,
        'route has no extreme corner snap', JSON.stringify(metrics));
}

console.log('\n[2] Groups following shoreline routes keep moving instead of piling up');
{
    const ctx = makeCtx(jaggedLakeObjects());
    R(ctx, `
        for (let i = 0; i < 10; i++) {
            const x = 820 + (i % 5) * 22;
            const y = 1510 + Math.floor(i / 5) * 28;
            gameState.units.push({
                id: 1000 + i,
                type: 'militia',
                player: 'player',
                faction: 'player',
                factionName: 'Player',
                factionColor: '#4f8cff',
                x, y,
                prevX: x,
                prevY: y,
                health: GAME_CONFIG.units.militia.maxHealth,
                state: 'idle',
                target: null,
                anim: { action: 'idle', direction: 'south', frame: 0, elapsed: 0 }
            });
            setUnitDestination(gameState.units[i], 3180, 1640 + (i % 3) * 24);
        }
        for (let t = 0; t < 3600; t++) updateUnits(16);
    `);
    const result = R(ctx, `(() => {
        let stuck = 0;
        let illegal = 0;
        let movedFar = 0;
        for (const u of gameState.units) {
            if (!validateTerrainMovement(u, u.x, u.y)) illegal++;
            if (Math.hypot(u.x - 3180, u.y - (1640 + (u.id % 3) * 24)) < 180) movedFar++;
            if (u.state === 'moving' && Math.hypot(u.x - (u._moveProg?.x ?? u.x), u.y - (u._moveProg?.y ?? u.y)) < 3) stuck++;
        }
        return { stuck, illegal, movedFar, total: gameState.units.length };
    })()`);
    ok(result.illegal === 0, 'group units never enter invalid shoreline terrain', JSON.stringify(result));
    ok(result.movedFar >= 8, 'most group units cross the jagged shore route', JSON.stringify(result));
    ok(result.stuck <= 1, 'group does not pile up in a shoreline corner', JSON.stringify(result));
}

console.log('\n============================================================');
console.log(`  ${pass} passed, ${fail} failed`);
console.log('============================================================');
if (fail > 0) process.exit(1);
