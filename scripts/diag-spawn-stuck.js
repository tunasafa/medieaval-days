/** Pinpoint which stage rejects the move order for a freshly spawned unit. */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const ROOT = path.join(__dirname, '..');

const sandbox = {
    console, Math, Date, Number, Set, Map, Infinity, NaN, JSON, Array, Object,
    tilemap: null, Multiplayer: undefined,
    showNotification: () => {}, SFX: undefined, ParticleSystem: undefined,
    updateSelectionInfo: () => {}, updateResourceRates: () => {},
    updateEnemyAI: () => {}, handleBuildingDestruction: () => {},
    findNearestResource: () => null, displayName: (s) => s,
    canAfford: () => true, deductResources: () => {}, isEnemyFaction: () => false,
};
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
for (const f of ['js/config.js', 'js/utilities.js', 'js/pathfinding.js', 'js/units.js']) {
    vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), sandbox, { filename: f });
}
vm.runInContext(`
    GAME_CONFIG.world.width = 4000; GAME_CONFIG.world.height = 4000; GAME_CONFIG.world.radius = 2000;
    globalThis.gameState = {
        resources:{food:9e9,wood:9e9,stone:9e9,gold:9e9}, population:{current:0,max:200},
        units:[], buildings:[], enemyUnits:[], enemyBuildings:[], worldObjects:[],
        selectedUnits:[], selectedBuilding:null, waterField:null
    };
`, sandbox);

const run = (code) => vm.runInContext(code, sandbox);

function scenario(bType, uType) {
    run(`
        gameState.units.length = 0; gameState.buildings.length = 0; gameState.population.current = 0;
        var cfg = getBuildingConfig(${JSON.stringify(bType)});
        gameState.buildings.push({ id:'b', type:${JSON.stringify(bType)}, player:'player',
            x: 2000 - cfg.width/2, y: 2000 - cfg.height/2, width: cfg.width, height: cfg.height,
            health: cfg.maxHealth, maxHealth: cfg.maxHealth, underConstruction:false, trainingQueue:[] });
        initializePathfinding();
    `);

    const b = sandbox.gameState.buildings[0];
    const u = run(`spawnUnit(${JSON.stringify(uType)}, gameState.buildings[0])`);
    const R = run(`getTerrainClearanceRadius(${JSON.stringify(uType)})`);

    const dyTop = b.y - u.y, dxLeft = b.x - u.x;
    console.log(`\n### ${bType} -> ${uType}`);
    console.log(`  building rect: x[${b.x}..${b.x + b.width}] y[${b.y}..${b.y + b.height}]`);
    console.log(`  spawn: (${u.x.toFixed(1)}, ${u.y.toFixed(1)})  gap above top edge = ${dyTop.toFixed(2)}px`);
    console.log(`  terrain clearanceRadius for ${uType} = ${R}px  ->  legal gap must exceed ${R}px`);
    console.log(`  spawn passes validateTerrainMovement? ${run(`validateTerrainMovement({type:${JSON.stringify(uType)}}, ${u.x}, ${u.y})`)}`);
    console.log(`  slack = ${(dyTop - R).toFixed(2)}px  <-- how much room before the unit is illegally inside the building buffer`);

    // Walk the findPath internals
    const isShip = false;
    const cc = run(`pathfinder.getClearanceCellsForUnit(${JSON.stringify(uType)})`);
    const raw = run(`
        (function(){
            var s = pathfindingGrid.worldToGrid(${u.x}, ${u.y});
            var e = pathfindingGrid.worldToGrid(2900, 2900);
            return { s: s, e: e,
                     startWalkable: pathfinder.isWalkable(s.x, s.y, false, ${cc}),
                     startClearance: pathfindingGrid.grid[s.y][s.x].clearance };
        })()
    `);
    console.log(`  A* start cell ${JSON.stringify(raw.s)} walkable=${raw.startWalkable} clearance=${raw.startClearance} (needs >= ${cc})`);

    // Reproduce findPath but capture each post-process candidate's validatePath verdict
    const stages = run(`
        (function(){
            var out = {};
            var orig = pathfinder.validatePath.bind(pathfinder);
            var idx = 0;
            var names = ['curved','rounded','simplified','raw'];
            pathfinder.validatePath = function(c, s, cl, ut) {
                var r = orig(c, s, cl, ut);
                out[names[idx++] || ('extra' + idx)] = (r && r.length > 1) ? ('OK len=' + r.length) : 'REJECTED';
                return r;
            };
            __pathCache.clear();
            var p = pathfinder.findPath(${u.x}, ${u.y}, 2900, 2900, ${JSON.stringify(uType)});
            pathfinder.validatePath = orig;
            out.__final = p ? ('path len ' + p.length) : 'NULL';
            return out;
        })()
    `);
    console.log(`  validatePath verdicts: ${JSON.stringify(stages)}`);

    // Why did validatePath reject? Test the very first hop's footprint LOS.
    const detail = run(`
        (function(){
            __pathCache.clear();
            var s = pathfindingGrid.worldToGrid(${u.x}, ${u.y});
            var e = pathfindingGrid.worldToGrid(2900, 2900);
            // rebuild the unsmoothed A* path by temporarily disabling smoothing
            var sp = pathfinder.simplifyPathLOS, rc = pathfinder.roundCorners, ss = pathfinder.splineSmooth;
            pathfinder.simplifyPathLOS = function(p){return p;};
            pathfinder.roundCorners = function(p){return p;};
            pathfinder.splineSmooth = function(p){return p;};
            var captured = null;
            var ov = pathfinder.validatePath.bind(pathfinder);
            pathfinder.validatePath = function(c, sh, cl, ut){ if(!captured) captured = c; return ov(c, sh, cl, ut); };
            pathfinder.findPath(${u.x}, ${u.y}, 2900, 2900, ${JSON.stringify(uType)});
            pathfinder.simplifyPathLOS = sp; pathfinder.roundCorners = rc; pathfinder.splineSmooth = ss;
            pathfinder.validatePath = ov;
            if (!captured || captured.length < 2) return { note: 'A* produced no raw path' };
            var p0 = captured[0], p1 = captured[1];
            return {
                firstWaypoint: p1,
                p1_terrainOK: validateTerrainMovement({type:${JSON.stringify(uType)}}, p1.x, p1.y),
                hop_footprintLOS_skipStart: pathfinder.hasTerrainFootprintLineOfSight(p0.x,p0.y,p1.x,p1.y,${JSON.stringify(uType)},true),
                secondWaypoint: captured[2] || null,
                p2_terrainOK: captured[2] ? validateTerrainMovement({type:${JSON.stringify(uType)}}, captured[2].x, captured[2].y) : null,
                hop2_footprintLOS: captured[2] ? pathfinder.hasTerrainFootprintLineOfSight(p1.x,p1.y,captured[2].x,captured[2].y,${JSON.stringify(uType)},false) : null
            };
        })()
    `);
    console.log(`  first-hop detail: ${JSON.stringify(detail)}`);
}

scenario('barracks', 'militia');
scenario('craftery', 'catapult');
scenario('town-center', 'villager');
scenario('navy', 'militia');
scenario('house', 'militia');
