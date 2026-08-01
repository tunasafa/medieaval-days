/**
 * Diagnostic for the post-"shoreline pathfinding" regressions:
 *   (a) villagers walk off in irrelevant directions / oscillate,
 *   (b) villagers never actually build a placed foundation.
 *
 * Loads the real sources headlessly so the numbers below are the game's own.
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');

function makeCtx(worldObjects = []) {
    const sandbox = {
        console,
        Math, Date, Number, Set, Map, Infinity, NaN, JSON, Array, Object,
        tilemap: null, Multiplayer: undefined,
        showNotification: () => {}, SFX: undefined, ParticleSystem: undefined,
        updateSelectionInfo: () => {}, updateResourceRates: () => {},
        updateEnemyAI: () => {}, handleBuildingDestruction: () => {},
        findNearestResource: () => null, displayName: s => s,
        canAfford: () => true, deductResources: () => {},
        isEnemyFaction: u => u?.player && u.player !== 'player',
        showBuildingActions: () => {}, getFactionName: () => 'Player',
        getFactionColor: () => '#fff', computeBridgeBlockAt: () => ({ ok: false }),
        document: { getElementById: () => ({ classList: { add() {}, remove() {} } }) },
    };
    sandbox.globalThis = sandbox;
    vm.createContext(sandbox);
    for (const f of ['js/config.js', 'js/utilities.js', 'js/pathfinding.js', 'js/units.js', 'js/buildings.js']) {
        vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), sandbox, { filename: f });
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
            selectedUnits: [], selectedBuilding: null, waterField: null,
            placingWorkerIds: []
        };
        globalThis.getAllUnits = () => [...gameState.units, ...gameState.enemyUnits];
        globalThis.getAllBuildings = () => [...gameState.buildings, ...gameState.enemyBuildings];
        globalThis.findUnitById = id => getAllUnits().find(u => u.id === id);
        globalThis.findBuildingById = id => getAllBuildings().find(b => b.id === id);
        initializePathfinding();
    `, sandbox);
    return sandbox;
}

const R = (ctx, code) => vm.runInContext(code, ctx);

function addTownCenter(ctx, cx, cy) {
    R(ctx, `
        (function(){
            const cfg = getBuildingConfig('town-center');
            gameState.buildings.push({ id:'tc', type:'town-center', player:'player',
                x: ${cx} - cfg.width/2, y: ${cy} - cfg.height/2,
                width: cfg.width, height: cfg.height,
                health: cfg.maxHealth, maxHealth: cfg.maxHealth,
                underConstruction:false, trainingQueue:[] });
            updatePathfindingGrid();
        })()
    `);
}

function mkVillager(ctx, id, x, y) {
    return R(ctx, `
        (function(){
            const u = { id: ${JSON.stringify(id)}, type:'villager', player:'player',
                x:${x}, y:${y}, prevX:${x}, prevY:${y},
                health: GAME_CONFIG.units.villager.maxHealth, state:'idle', target:null,
                anim:{action:'idle',direction:'south',frame:0,elapsed:0} };
            gameState.units.push(u);
            return u;
        })()
    `);
}

console.log('='.repeat(70));
console.log('DIAG A: clearance budgets implied by current config');
console.log('='.repeat(70));
{
    const ctx = makeCtx();
    const cell = R(ctx, `pathfindingGrid.cellSize`);
    const cc = R(ctx, `pathfinder.getClearanceCellsForUnit('villager')`);
    const hardShore = R(ctx, `pathfinder.getHardShoreClearanceCells(false, ${cc})`);
    const prefShore = R(ctx, `pathfinder.getPreferredShoreClearanceCells(false)`);
    const prefObs = R(ctx, `pathfinder.getPreferredObstacleClearanceCells(false, ${cc})`);
    const comfort = Math.max(prefShore, prefObs);
    console.log(`  cellSize                 = ${cell}px`);
    console.log(`  villager clearanceCells  = ${cc}  (${cc * cell}px hard from buildings/no-go)`);
    console.log(`  hard shore clearance     = ${hardShore} cells (${hardShore * cell}px from water — HARD, blocks pathing)`);
    console.log(`  preferred shore          = ${prefShore} cells (${prefShore * cell}px)`);
    console.log(`  preferred obstacle       = ${prefObs} cells (${prefObs * cell}px)`);
    console.log(`  => "comfort" band        = ${comfort} cells (${comfort * cell}px from ANY water AND ANY building)`);
    console.log(`  allowShorelineFallback   = ${R(ctx, `GAME_CONFIG.pathfinding.allowShorelineFallback`)}`);
    console.log(`\n  NOTE: hasLOSForUnit() now demands the comfort band, i.e. every`);
    console.log(`  waypoint-skip test needs ${comfort * cell}px of open ground on both sides.`);
}

console.log('\n' + '='.repeat(70));
console.log('DIAG B: does a construction work spot lie on pathable ground?');
console.log('='.repeat(70));
{
    const ctx = makeCtx();
    addTownCenter(ctx, 2000, 2000);
    // Place a house foundation 400px away, like a player would.
    R(ctx, `
        (function(){
            const cfg = getBuildingConfig('house');
            const b = { id:'h1', type:'house', player:'player',
                x: 2900 - cfg.width/2, y: 2000 - cfg.height/2,
                width: cfg.width, height: cfg.height,
                health: 1, maxHealth: cfg.maxHealth, underConstruction: true,
                construction: { timeRemaining: 5000, totalTime: 5000, workerIds: [] },
                trainingQueue: [] };
            gameState.buildings.push(b);
            updatePathfindingGrid();
            globalThis.__b = b;
        })()
    `);
    const worker = mkVillager(ctx, 'w1', 2600, 2500);
    const spot = R(ctx, `findConstructionWorkSpot(__b, gameState.units[0], 0, [])`);
    const pathable = R(ctx, `isSpawnPathable(${spot.x}, ${spot.y}, 'villager')`);
    const terrainOk = R(ctx, `validateTerrainMovement({type:'villager'}, ${spot.x}, ${spot.y})`);
    const workRange = R(ctx, `getConstructionSettings().workRange`);
    console.log(`  foundation rect: x[${R(ctx, `__b.x`)}..${R(ctx, `__b.x + __b.width`)}] y[${R(ctx, `__b.y`)}..${R(ctx, `__b.y + __b.height`)}]`);
    console.log(`  chosen work spot        = (${spot.x.toFixed(1)}, ${spot.y.toFixed(1)})`);
    console.log(`  validateTerrainMovement = ${terrainOk}`);
    console.log(`  isSpawnPathable         = ${pathable}   <-- must be true or A* relocates the goal`);
    console.log(`  construction workRange  = ${workRange}px`);

    R(ctx, `assignWorkersToConstruction(__b, [gameState.units[0]])`);
    const before = R(ctx, `__b.construction ? __b.construction.timeRemaining : 0`);
    R(ctx, `for (let t = 0; t < 1200; t++) updateUnits(16);`); // ~19 simulated seconds
    const after = R(ctx, `__b.construction ? __b.construction.timeRemaining : -1`);
    const u = R(ctx, `gameState.units[0]`);
    const finalDist = R(ctx, `(function(){const u=gameState.units[0]; const s=u.buildSpot; return s ? Math.hypot(u.x-s.x, u.y-s.y) : -1;})()`);
    console.log(`\n  after 19s of simulation:`);
    console.log(`    worker state          = ${u.state}`);
    console.log(`    dist to work spot     = ${finalDist.toFixed(1)}px (needs <= ${workRange})`);
    console.log(`    construction time     = ${before} -> ${after}  ${after < before ? 'PROGRESSING/DONE' : '*** STALLED ***'}`);
}

console.log('\n' + '='.repeat(70));
console.log('DIAG C: does a villager actually reach a plain move order?');
console.log('='.repeat(70));
{
    const ctx = makeCtx();
    addTownCenter(ctx, 2000, 2000);
    const u = mkVillager(ctx, 'm1', 2000, 2450);
    const tx = 2600, ty = 2450;
    const ok = R(ctx, `setUnitDestination(gameState.units[0], ${tx}, ${ty})`);
    console.log(`  setUnitDestination returned ${ok}, pathfindingFailed=${R(ctx, `gameState.units[0].pathfindingFailed`)}`);
    const trace = R(ctx, `(function(){
        const u = gameState.units[0];
        const samples = [];
        let reversals = 0, prevDx = 0, prevDy = 0, pathLen = 0;
        for (let t = 0; t < 900; t++) {
            const px = u.x, py = u.y;
            updateUnits(16);
            const dx = u.x - px, dy = u.y - py;
            pathLen += Math.hypot(dx, dy);
            if (Math.hypot(dx,dy) > 0.05 && (dx*prevDx + dy*prevDy) < 0) reversals++;
            if (Math.hypot(dx,dy) > 0.05) { prevDx = dx; prevDy = dy; }
            if (t % 150 === 0) samples.push({t, x:+u.x.toFixed(1), y:+u.y.toFixed(1), state:u.state});
        }
        return { samples, reversals, pathLen:+pathLen.toFixed(1),
                 finalDist:+Math.hypot(u.x-${tx}, u.y-${ty}).toFixed(1), state:u.state };
    })()`);
    console.log('  position trace:', JSON.stringify(trace.samples));
    console.log(`  straight-line distance to target = 600px`);
    console.log(`  distance actually walked         = ${trace.pathLen}px`);
    console.log(`  per-frame direction reversals    = ${trace.reversals}  <-- moonwalk / jitter indicator`);
    console.log(`  final distance to target        = ${trace.finalDist}px, state=${trace.state}`);
}

console.log('\n' + '='.repeat(70));
console.log('DIAG D: move order that requires passing a shoreline (fallback disabled)');
console.log('='.repeat(70));
{
    // A river with a gap: the only crossing is a narrow land isthmus.
    const water = [
        { type: 'water', x: 1600, y: 800, width: 240, height: 900 },
        { type: 'water', x: 1600, y: 1900, width: 240, height: 900 }
    ];
    const ctx = makeCtx(water);
    R(ctx, `updatePathfindingGrid()`);
    const u = mkVillager(ctx, 's1', 1200, 1800);
    const ok = R(ctx, `setUnitDestination(gameState.units[0], 2400, 1800)`);
    console.log(`  isthmus gap between water bodies = 200px tall`);
    console.log(`  setUnitDestination returned ${ok}, pathfindingFailed=${R(ctx, `gameState.units[0].pathfindingFailed`)}`);
    const res = R(ctx, `(function(){
        const u = gameState.units[0];
        const start = {x:u.x, y:u.y};
        for (let t = 0; t < 900; t++) updateUnits(16);
        return { x:+u.x.toFixed(1), y:+u.y.toFixed(1), state:u.state,
                 drift:+Math.hypot(u.x-start.x, u.y-start.y).toFixed(1),
                 towardTarget:+(1200 - Math.hypot(u.x-2400, u.y-1800)).toFixed(1) };
    })()`);
    console.log(`  after 14s: pos=(${res.x}, ${res.y}) state=${res.state}`);
    console.log(`  total drift from start = ${res.drift}px`);
    console.log(`  progress toward target = ${res.towardTarget}px (negative = moved AWAY from the order)`);
}
console.log();
