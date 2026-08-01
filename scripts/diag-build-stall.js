/**
 * Reproduces "villager wanders and never builds": a foundation whose work spots
 * are legal to stand on but not A*-pathable under the new clearance budget.
 * Also counts findPath() calls per frame to expose the per-frame A* storm.
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const ROOT = path.join(__dirname, '..');

function makeCtx(worldObjects = []) {
    const sandbox = {
        console, Math, Date, Number, Set, Map, Infinity, NaN, JSON, Array, Object,
        tilemap: null, Multiplayer: undefined, showNotification: () => {}, SFX: undefined,
        ParticleSystem: undefined, updateSelectionInfo: () => {}, updateResourceRates: () => {},
        updateEnemyAI: () => {}, handleBuildingDestruction: () => {}, findNearestResource: () => null,
        displayName: s => s, canAfford: () => true, deductResources: () => {},
        isEnemyFaction: u => u?.player && u.player !== 'player',
        showBuildingActions: () => {}, getFactionName: () => 'P', getFactionColor: () => '#fff',
    };
    sandbox.globalThis = sandbox;
    vm.createContext(sandbox);
    for (const f of ['js/config.js', 'js/utilities.js', 'js/pathfinding.js', 'js/units.js', 'js/buildings.js']) {
        vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), sandbox, { filename: f });
    }
    vm.runInContext(`
        GAME_CONFIG.world.width = 4000; GAME_CONFIG.world.height = 4000; GAME_CONFIG.world.radius = 2000;
        globalThis.gameState = {
            resources:{food:9e9,wood:9e9,stone:9e9,gold:9e9}, population:{current:0,max:500},
            units:[], buildings:[], enemyUnits:[], enemyBuildings:[],
            worldObjects: ${JSON.stringify(worldObjects)},
            selectedUnits:[], selectedBuilding:null, waterField:null, placingWorkerIds:[]
        };
        globalThis.getAllUnits = () => [...gameState.units, ...gameState.enemyUnits];
        globalThis.getAllBuildings = () => [...gameState.buildings, ...gameState.enemyBuildings];
        globalThis.findUnitById = id => getAllUnits().find(u => u.id === id);
        globalThis.findBuildingById = id => getAllBuildings().find(b => b.id === id);
        initializePathfinding();
        // instrument findPath
        globalThis.__pathCalls = 0;
        const __origFindPath = findPath;
        globalThis.findPath = function(...a) { globalThis.__pathCalls++; return __origFindPath.apply(null, a); };
    `, sandbox);
    return sandbox;
}
const R = (ctx, c) => vm.runInContext(c, ctx);

function scenario(label, worldObjects, tcAt, houseAt, villagerAt) {
    console.log('\n' + '='.repeat(70));
    console.log(label);
    console.log('='.repeat(70));
    const ctx = makeCtx(worldObjects);
    R(ctx, `
        (function(){
            const tcCfg = getBuildingConfig('town-center');
            gameState.buildings.push({ id:'tc', type:'town-center', player:'player',
                x: ${tcAt[0]} - tcCfg.width/2, y: ${tcAt[1]} - tcCfg.height/2,
                width: tcCfg.width, height: tcCfg.height,
                health: tcCfg.maxHealth, maxHealth: tcCfg.maxHealth,
                underConstruction:false, trainingQueue:[] });
            const cfg = getBuildingConfig('house');
            const b = { id:'h1', type:'house', player:'player',
                x: ${houseAt[0]} - cfg.width/2, y: ${houseAt[1]} - cfg.height/2,
                width: cfg.width, height: cfg.height,
                health:1, maxHealth: cfg.maxHealth, underConstruction:true,
                construction:{ timeRemaining:5000, totalTime:5000, workerIds:[] }, trainingQueue:[] };
            gameState.buildings.push(b);
            updatePathfindingGrid();
            globalThis.__b = b;
            const u = { id:'w1', type:'villager', player:'player',
                x:${villagerAt[0]}, y:${villagerAt[1]}, prevX:${villagerAt[0]}, prevY:${villagerAt[1]},
                health:25, state:'idle', target:null,
                anim:{action:'idle',direction:'south',frame:0,elapsed:0} };
            gameState.units.push(u);
            assignWorkersToConstruction(b, [u]);
        })()
    `);
    const spot = R(ctx, `gameState.units[0].buildSpot`);
    console.log(`  work spot (${spot.x.toFixed(0)}, ${spot.y.toFixed(0)})  terrainLegal=${R(ctx, `validateTerrainMovement({type:'villager'},${spot.x},${spot.y})`)}  aStarPathable=${R(ctx, `isSpawnPathable(${spot.x},${spot.y},'villager')`)}`);
    R(ctx, `globalThis.__pathCalls = 0`);
    const res = R(ctx, `(function(){
        const u = gameState.units[0];
        const start = { x:u.x, y:u.y };
        let wander = 0, buildingFrames = 0;
        const trace = [];
        for (let t = 0; t < 1800; t++) {           // 30 simulated seconds
            const px = u.x, py = u.y;
            updateUnits(16);
            wander += Math.hypot(u.x - px, u.y - py);
            if (u.state === 'building') buildingFrames++;
            if (t % 300 === 0) trace.push({ t, x:+u.x.toFixed(0), y:+u.y.toFixed(0), st:u.state,
                                            pf:!!u.pathfindingFailed, plen: u.path ? u.path.length : null });
        }
        const s = u.buildSpot;
        return { trace, wander:+wander.toFixed(0), buildingFrames,
                 distToSpot: s ? +Math.hypot(u.x-s.x, u.y-s.y).toFixed(0) : -1,
                 driftFromStart: +Math.hypot(u.x-start.x, u.y-start.y).toFixed(0),
                 remaining: __b.construction ? __b.construction.timeRemaining : 'COMPLETE',
                 pathCalls: __pathCalls };
    })()`);
    console.log('  trace:', JSON.stringify(res.trace));
    console.log(`  frames spent in 'building' state = ${res.buildingFrames} / 1800`);
    console.log(`  final dist to work spot         = ${res.distToSpot}px`);
    console.log(`  net drift from start            = ${res.driftFromStart}px`);
    console.log(`  TOTAL distance walked           = ${res.wander}px  <-- wander budget`);
    console.log(`  construction remaining          = ${res.remaining} (started at 5000)`);
    console.log(`  findPath() calls in 30s         = ${res.pathCalls}  (${(res.pathCalls / 1800).toFixed(2)} per frame)`);
}

// 1) Foundation snug beside the town center — a very ordinary player action.
scenario('SCENARIO 1: house placed close beside the town center',
    [], [2000, 2000], [2440, 2000], [2000, 2500]);

// 2) Foundation on a coastal strip: land south of a big lake.
scenario('SCENARIO 2: house on a coastal strip (lake to the north)',
    [{ type: 'water', x: 1000, y: 800, width: 2000, height: 900 }],
    [2000, 2400], [2000, 1850], [2000, 2600]);
