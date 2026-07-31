/**
 * Headless repro for: "units spawn overlapping their building and then ignore Move
 * orders, but still respond to Gather/Attack orders".
 *
 * Loads the real config/utilities/pathfinding/units sources into one VM context with
 * minimal stubs, then exercises spawnUnit() + setUnitDestination().
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');

function makeWorld() {
    const sandbox = {
        console,
        Math,
        Date,
        Number,
        Set,
        Map,
        Infinity,
        NaN,
        JSON,
        Array,
        Object,
        // ---- stubs -------------------------------------------------------
        tilemap: null,          // no tilemap -> isPointInWater falls back
        Multiplayer: undefined,
        showNotification: () => {},
        SFX: undefined,
        ParticleSystem: undefined,
        updateSelectionInfo: () => {},
        updateResourceRates: () => {},
        getEffectiveUnitConfig: undefined,
        getUnitCarryCapacity: undefined,
        updateEnemyAI: () => {},
        updateConstructionSites: undefined,
        handleBuildingDestruction: () => {},
        findNearestResource: () => null,
        getProductionTimeMs: undefined,
        displayName: (s) => s,
        canAfford: () => true,
        deductResources: () => {},
        isEnemyFaction: () => false,
    };
    sandbox.globalThis = sandbox;
    vm.createContext(sandbox);

    for (const f of ['js/config.js', 'js/utilities.js', 'js/pathfinding.js', 'js/units.js']) {
        vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), sandbox, { filename: f });
    }

    // Small flat land world, no water at all.
    vm.runInContext(`
        GAME_CONFIG.world.width = 4000;
        GAME_CONFIG.world.height = 4000;
        GAME_CONFIG.world.radius = 2000;
        var gameState = {
            resources: { food: 9e9, wood: 9e9, stone: 9e9, gold: 9e9 },
            population: { current: 0, max: 200 },
            units: [], buildings: [], enemyUnits: [], enemyBuildings: [],
            worldObjects: [], selectedUnits: [], selectedBuilding: null,
            waterField: null
        };
        globalThis.gameState = gameState;
    `, sandbox);

    return sandbox;
}

function addBuilding(ctx, type, cx, cy) {
    const cfg = vm.runInContext(`getBuildingConfig(${JSON.stringify(type)})`, ctx);
    const b = {
        id: 'b_' + type,
        type,
        player: 'player',
        x: cx - cfg.width / 2,
        y: cy - cfg.height / 2,
        width: cfg.width,
        height: cfg.height,
        health: cfg.maxHealth,
        maxHealth: cfg.maxHealth,
        underConstruction: false,
        trainingQueue: []
    };
    ctx.gameState.buildings.push(b);
    vm.runInContext('markPathfindingDirty && markPathfindingDirty(); initializePathfinding();', ctx);
    return b;
}

function edgeDistance(u, b) {
    const dx = Math.max(b.x - u.x, 0, u.x - (b.x + b.width));
    const dy = Math.max(b.y - u.y, 0, u.y - (b.y + b.height));
    return Math.hypot(dx, dy);
}

function report(title, rows) {
    console.log('\n=== ' + title + ' ===');
    for (const r of rows) console.log('  ' + r);
}

// ---------------------------------------------------------------------------
const ctx = makeWorld();
const CX = 2000, CY = 2000;

const cases = [
    ['barracks', 'militia'],
    ['archeryRange', 'archer'],
    ['town-center', 'villager'],
    ['craftery', 'catapult'],
];

for (const [bType, uType] of cases) {
    // fresh state per case
    ctx.gameState.units.length = 0;
    ctx.gameState.buildings.length = 0;
    ctx.gameState.population.current = 0;
    const b = addBuilding(ctx, bType, CX, CY);

    const rows = [];
    const clearCells = vm.runInContext(`pathfinder.getClearanceCellsForUnit(${JSON.stringify(uType)})`, ctx);
    rows.push(`pathfinder clearanceCells for ${uType} = ${clearCells} (cellSize ${vm.runInContext('pathfindingGrid.cellSize', ctx)} => needs ~${clearCells * vm.runInContext('pathfindingGrid.cellSize', ctx)}px from footprint cells)`);

    let stuckCount = 0;
    const spawned = [];
    for (let i = 0; i < 12; i++) {
        const u = vm.runInContext(`spawnUnit(${JSON.stringify(uType)}, gameState.buildings[0])`, ctx);
        if (!u) { rows.push(`spawn #${i} returned nothing`); break; }
        spawned.push(u);

        const ed = edgeDistance(u, b);
        // Is the unit's own grid cell considered walkable by A*?
        const cell = vm.runInContext(`pathfindingGrid.worldToGrid(${u.x}, ${u.y})`, ctx);
        const startWalkable = vm.runInContext(
            `pathfinder.isWalkable(${cell.x}, ${cell.y}, false, ${clearCells})`, ctx);
        const cellClearance = vm.runInContext(`pathfindingGrid.grid[${cell.y}][${cell.x}].clearance`, ctx);

        // Now issue a plain MOVE order far away on open land.
        const ok = vm.runInContext(
            `setUnitDestination(gameState.units[${i}], ${CX + 900}, ${CY + 900})`, ctx);
        if (!ok) stuckCount++;

        rows.push(
            `#${String(i).padStart(2)} spawn @(${u.x.toFixed(0)},${u.y.toFixed(0)}) ` +
            `edgeDist=${ed.toFixed(1)}px  cellClearance=${cellClearance}  ` +
            `startCellWalkable=${startWalkable}  MOVE_ORDER=${ok ? 'ok' : 'FAILED -> state=' + ctx.gameState.units[i].state}`
        );
    }
    rows.push(`>>> ${stuckCount}/${spawned.length} spawned units could NOT accept a Move order`);

    // Cross-check: does a gather-style direct-move fallback still work for a stuck unit?
    const stuck = ctx.gameState.units.find(u => u.state === 'idle');
    if (stuck) {
        const before = { x: stuck.x, y: stuck.y };
        vm.runInContext(`
            var u = gameState.units.find(u => u.x === ${stuck.x} && u.y === ${stuck.y});
            u.state = 'gathering';
            u.targetResource = { x: ${CX + 900}, y: ${CY + 900}, width: 40, height: 40, amount: 100, resourceType: 'wood' };
            u.gatherPath = null; u.gatherPathTimer = 0;
            for (var t = 0; t < 30; t++) updateUnit(u, 16);
        `, ctx);
        const after = ctx.gameState.units.find(u => u.targetResource);
        rows.push(`gather fallback moved the stuck unit by ${Math.hypot(after.x - before.x, after.y - before.y).toFixed(1)}px (proves direct-move fallback exists for gather but not for move)`);
    }

    report(`${bType} -> ${uType}`, rows);
}
