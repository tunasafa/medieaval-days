/**
 * Verification suite for the "newborn units spawn inside their building and then
 * ignore Move orders" bug. Exercises the real game sources headlessly.
 */
const fs = require('fs'), path = require('path'), vm = require('vm');
const ROOT = path.join(__dirname, '..');

let pass = 0, fail = 0;
const ok = (cond, label, extra = '') => {
    if (cond) { pass++; console.log(`  PASS  ${label}`); }
    else { fail++; console.log(`  FAIL  ${label}${extra ? '  -- ' + extra : ''}`); }
};

function makeCtx(worldObjects = []) {
    const sandbox = {
        console: { log: () => {}, warn: () => {}, error: () => {} },
        Math, Date, Number, Set, Map, Infinity, NaN, JSON, Array, Object,
        tilemap: null, Multiplayer: undefined, showNotification: () => {},
        SFX: undefined, ParticleSystem: undefined, updateSelectionInfo: () => {},
        updateResourceRates: () => {}, updateEnemyAI: () => {},
        handleBuildingDestruction: () => {}, findNearestResource: () => null,
        displayName: s => s, canAfford: () => true, deductResources: () => {},
        isEnemyFaction: () => false,
    };
    sandbox.globalThis = sandbox;
    vm.createContext(sandbox);
    for (const f of ['js/config.js', 'js/utilities.js', 'js/pathfinding.js', 'js/units.js'])
        vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), sandbox, { filename: f });
    vm.runInContext(`
        GAME_CONFIG.world.width=4000; GAME_CONFIG.world.height=4000; GAME_CONFIG.world.radius=2000;
        globalThis.gameState={resources:{food:9e9,wood:9e9,stone:9e9,gold:9e9},
          population:{current:0,max:500}, units:[], buildings:[], enemyUnits:[],
          enemyBuildings:[], worldObjects:${JSON.stringify(worldObjects)},
          selectedUnits:[], selectedBuilding:null, waterField:null};
    `, sandbox);
    return sandbox;
}
const R = (ctx, code) => vm.runInContext(code, ctx);

function addBuilding(ctx, type, cx, cy) {
    R(ctx, `
        (function(){
            var cfg = getBuildingConfig(${JSON.stringify(type)});
            gameState.buildings.push({id:'b_'+${JSON.stringify(type)}+Math.random(),
                type:${JSON.stringify(type)}, player:'player',
                x:${cx}-cfg.width/2, y:${cy}-cfg.height/2, width:cfg.width, height:cfg.height,
                health:cfg.maxHealth, maxHealth:cfg.maxHealth, underConstruction:false, trainingQueue:[]});
        })();
        initializePathfinding();
    `);
    return ctx.gameState.buildings[ctx.gameState.buildings.length - 1];
}

// =====================================================================
console.log('\n[1] Every land unit type spawns pathable and accepts a Move order');
{
    const cases = [
        ['barracks', 'militia'], ['barracks', 'warrior'], ['barracks', 'axeman'],
        ['archeryRange', 'archer'], ['archeryRange', 'crossbowman'],
        ['craftery', 'catapult'], ['craftery', 'ballista'],
        ['town-center', 'villager'], ['house', 'militia'], ['navy', 'militia'],
    ];
    for (const [bType, uType] of cases) {
        const ctx = makeCtx();
        const b = addBuilding(ctx, bType, 2000, 2000);
        let stuck = 0, unpathable = 0, insideBuffer = 0;
        const N = 10;
        for (let i = 0; i < N; i++) {
            const u = R(ctx, `spawnUnit(${JSON.stringify(uType)}, gameState.buildings[0])`);
            if (!u) { stuck++; continue; }
            if (!R(ctx, `isSpawnPathable(${u.x}, ${u.y}, ${JSON.stringify(uType)})`)) unpathable++;
            if (R(ctx, `isPointInRoundedRectangle(${u.x}, ${u.y}, gameState.buildings[0], 17)`)) insideBuffer++;
            const moved = R(ctx, `setUnitDestination(gameState.units[${i}], 2900, 2900)`);
            if (!moved) stuck++;
        }
        ok(stuck === 0 && unpathable === 0 && insideBuffer === 0,
           `${bType} -> ${uType}: ${N} spawns all pathable + movable`,
           `stuckOrders=${stuck} unpathableSpawns=${unpathable} insideBuildingBuffer=${insideBuffer}`);
    }
}

// =====================================================================
console.log('\n[2] Move orders actually carry the unit to its destination (simulated)');
{
    const ctx = makeCtx();
    addBuilding(ctx, 'craftery', 2000, 2000);
    const u = R(ctx, `spawnUnit("catapult", gameState.buildings[0])`);
    const start = { x: u.x, y: u.y };
    R(ctx, `setUnitDestination(gameState.units[0], 2900, 2900)`);
    R(ctx, `for (var t=0; t<4000; t++) updateUnit(gameState.units[0], 16);`);
    const end = ctx.gameState.units[0];
    const distToGoal = Math.hypot(end.x - 2900, end.y - 2900);
    ok(distToGoal < 120,
       `catapult travelled from (${start.x.toFixed(0)},${start.y.toFixed(0)}) to (${end.x.toFixed(0)},${end.y.toFixed(0)})`,
       `still ${distToGoal.toFixed(0)}px from goal, state=${end.state}`);
}

// =====================================================================
console.log('\n[3] A unit force-wedged into the building buffer frees itself');
{
    const ctx = makeCtx();
    const b = addBuilding(ctx, 'barracks', 2000, 2000);
    const u = R(ctx, `spawnUnit("militia", gameState.buildings[0])`);
    // Hard-teleport it into the tight band that used to trap units for good.
    R(ctx, `gameState.units[0].x = ${b.x + b.width / 2}; gameState.units[0].y = ${b.y - 18};`);
    const wedged = R(ctx, `isSpawnPathable(gameState.units[0].x, gameState.units[0].y, "militia")`);
    ok(wedged === false, 'precondition: unit is genuinely in an unpathable pocket');

    const accepted = R(ctx, `setUnitDestination(gameState.units[0], 2900, 2900)`);
    ok(accepted === true, 'Move order is accepted even from inside the pocket');

    R(ctx, `for (var t=0; t<4000; t++) updateUnit(gameState.units[0], 16);`);
    const end = ctx.gameState.units[0];
    ok(Math.hypot(end.x - 2900, end.y - 2900) < 120,
       'wedged unit escaped and reached its destination',
       `ended at (${end.x.toFixed(0)},${end.y.toFixed(0)}) state=${end.state}`);
}

// =====================================================================
console.log('\n[4] Order never silently vanishes: state is never left idle-with-no-order');
{
    const ctx = makeCtx();
    const b = addBuilding(ctx, 'town-center', 2000, 2000);
    const u = R(ctx, `spawnUnit("villager", gameState.buildings[0])`);
    R(ctx, `gameState.units[0].x = ${b.x + 10}; gameState.units[0].y = ${b.y - 18};`);
    R(ctx, `setUnitDestination(gameState.units[0], 2900, 2900)`);
    ok(ctx.gameState.units[0].state === 'moving',
       'unit stays in "moving" so its retry logic keeps running',
       `state=${ctx.gameState.units[0].state}`);
}

// =====================================================================
console.log('\n[5] Failed/escape paths no longer poison the shared path cache');
{
    const ctx = makeCtx();
    addBuilding(ctx, 'craftery', 2000, 2000);
    R(ctx, '__pathCache.clear()');
    // Force a hopeless request, then confirm a nearby healthy start still works.
    R(ctx, `findPath(1848.5, 1824.5, 2900, 2900, "catapult")`);
    const poisonedEntries = R(ctx, `
        (function(){ var n=0; for (var v of __pathCache.values()) if (!v || v.length<2) n++; return n; })()
    `);
    ok(poisonedEntries === 0, 'no null/degenerate entries stored in the cache',
       `found ${poisonedEntries}`);

    const healthyStart = R(ctx, `({
        x: Math.floor(gameState.buildings[0].x / 16) * 16 - 48,
        y: Math.floor(gameState.buildings[0].y / 16) * 16 - 48
    })`);
    const after = R(ctx, `findPath(${healthyStart.x}, ${healthyStart.y}, 2900, 2900, "catapult")`);
    ok(!!(after && after.length > 1),
       'a healthy unit outside the enlarged building still gets a path',
       after ? '' : 'got NULL');
}

// =====================================================================
console.log('\n[6] Vessels spawn in water, not on land');
{
    const water = [{ type: 'water', x: 1400, y: 1150, width: 1200, height: 520, color: '#47ABA9' }];
    for (const shipType of ['warship', 'transportLarge', 'fishingBoat']) {
        const ctx = makeCtx(water);
        addBuilding(ctx, 'navy', 2000, 1800);
        const s = R(ctx, `spawnUnit(${JSON.stringify(shipType)}, gameState.buildings[0])`);
        const inWater = R(ctx, `isPointInWater(${s.x}, ${s.y})`);
        const legal = R(ctx, `validateTerrainMovement({type:${JSON.stringify(shipType)}}, ${s.x}, ${s.y})`);
        const canMove = R(ctx, `setUnitDestination(gameState.units[0], 2000, 1400)`);
        ok(inWater && legal && canMove,
           `${shipType} spawned in water and accepts a move order`,
           `inWater=${inWater} terrainLegal=${legal} moveAccepted=${canMove} at (${s.x.toFixed(0)},${s.y.toFixed(0)})`);
    }
}

// =====================================================================
console.log('\n[7] Crowded spawning: 40 units from one building all remain mobile');
{
    const ctx = makeCtx();
    addBuilding(ctx, 'barracks', 2000, 2000);
    let immobile = 0, born = 0;
    for (let i = 0; i < 40; i++) {
        const u = R(ctx, `spawnUnit("militia", gameState.buildings[0])`);
        if (!u) continue;
        born++;
        if (!R(ctx, `setUnitDestination(gameState.units[${born - 1}], 2900, 2900)`)) immobile++;
    }
    ok(born === 40 && immobile === 0, `all ${born} crowded spawns accept Move orders`,
       `immobile=${immobile}`);

    // Run the real sim so separation forces apply, then confirm none got wedged.
    R(ctx, `for (var t=0; t<600; t++) updateUnits(16);`);
    const wedged = R(ctx, `
        gameState.units.filter(u => !isSpawnPathable(u.x, u.y, u.type)).length
    `);
    ok(wedged === 0, 'after 600 ticks of separation, no unit sits in an unpathable pocket',
       `wedged=${wedged}`);
}

// =====================================================================
console.log('\n[8] Rally point still works for newly trained units');
{
    const ctx = makeCtx();
    R(ctx, `
        var cfg = getBuildingConfig('barracks');
        gameState.buildings.push({id:'rb', type:'barracks', player:'player',
            x:2000-cfg.width/2, y:2000-cfg.height/2, width:cfg.width, height:cfg.height,
            health:cfg.maxHealth, maxHealth:cfg.maxHealth, underConstruction:false,
            rallyPoint:{x:2800, y:2800},
            trainingQueue:[{type:'militia', timeRemaining:1, totalTime:1000}]});
        initializePathfinding();
        updateTrainingQueue(16);
    `);
    const u = ctx.gameState.units[0];
    ok(!!u, 'unit was produced by the training queue');
    if (u) {
        ok(u.state === 'moving', 'newly trained unit accepted its rally-point order', `state=${u.state}`);
        R(ctx, `for (var t=0; t<4000; t++) updateUnit(gameState.units[0], 16);`);
        const e = ctx.gameState.units[0];
        ok(Math.hypot(e.x - 2800, e.y - 2800) < 140, 'unit walked to the rally point',
           `ended (${e.x.toFixed(0)},${e.y.toFixed(0)})`);
    }
}

// =====================================================================
console.log('\n[9] Units still cannot cheat terrain (regression guard)');
{
    const water = [{ type: 'water', x: 1000, y: 1900, width: 2000, height: 300, color: '#47ABA9' }];
    const ctx = makeCtx(water);
    addBuilding(ctx, 'barracks', 2000, 1500);
    const u = R(ctx, `spawnUnit("militia", gameState.buildings[0])`);
    // Order it across the river to the far bank.
    R(ctx, `setUnitDestination(gameState.units[0], 2000, 2600)`);
    R(ctx, `for (var t=0; t<3000; t++) updateUnit(gameState.units[0], 16);`);
    const e = ctx.gameState.units[0];
    ok(R(ctx, `!isPointInWater(${e.x}, ${e.y})`),
       'land unit never ends up standing in water', `at (${e.x.toFixed(0)},${e.y.toFixed(0)})`);
    ok(R(ctx, `validateTerrainMovement(gameState.units[0], ${e.x}, ${e.y})`),
       'land unit position stays terrain-legal throughout');
}

// =====================================================================
console.log('\n[10] Fully blocked deployment waits instead of unsafe-spawning');
{
    const blocked = [{ type: 'no-go', x: 0, y: 0, width: 4000, height: 4000 }];
    const ctx = makeCtx(blocked);
    R(ctx, `
        var cfg = getBuildingConfig('barracks');
        gameState.buildings.push({id:'blocked-barracks', type:'barracks', player:'player',
            x:2000-cfg.width/2, y:2000-cfg.height/2, width:cfg.width, height:cfg.height,
            health:cfg.maxHealth, maxHealth:cfg.maxHealth, underConstruction:false,
            trainingQueue:[{type:'militia', timeRemaining:1, totalTime:1000}]});
        initializePathfinding();
        updateTrainingQueue(16);
    `);
    ok(ctx.gameState.units.length === 0,
       'no unit is created when every deployment point is unsafe',
       `units=${ctx.gameState.units.length}`);
    ok(ctx.gameState.buildings[0].trainingQueue.length === 1,
       'completed training stays queued until clear space opens',
       `queue=${ctx.gameState.buildings[0].trainingQueue.length}`);
}

// =====================================================================
console.log('\n[11] Solid-footprint recovery relocates impossible stuck states');
{
    const ctx = makeCtx();
    const b = addBuilding(ctx, 'barracks', 2000, 2000);
    R(ctx, `
        gameState.units.push({id:'inside', type:'militia', player:'player',
            x:${b.x + b.width / 2}, y:${b.y + b.height / 2},
            health: GAME_CONFIG.units.militia.maxHealth, state:'idle',
            target:null, isSelected:false, prevX:${b.x + b.width / 2}, prevY:${b.y + b.height / 2}});
        setUnitDestination(gameState.units[0], 2900, 2900);
        for (var t=0; t<240; t++) updateUnit(gameState.units[0], 16);
    `);
    const unit = ctx.gameState.units[0];
    const pathable = R(ctx, `isSpawnPathable(gameState.units[0].x, gameState.units[0].y, gameState.units[0].type)`);
    const outside = !R(ctx, `isPointInRoundedRectangle(gameState.units[0].x, gameState.units[0].y, gameState.buildings[0], 17)`);
    ok(pathable && outside,
       'unit forced inside a building is recovered to a pathable non-overlapping spot',
       `pathable=${pathable} outside=${outside} at (${unit.x.toFixed(0)},${unit.y.toFixed(0)})`);
}

// =====================================================================
console.log(`\n${'='.repeat(60)}\n  ${pass} passed, ${fail} failed\n${'='.repeat(60)}`);
process.exit(fail === 0 ? 0 : 1);
