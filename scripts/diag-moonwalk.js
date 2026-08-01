/**
 * Measures the two remaining reported symptoms:
 *   (1) path zigzag: how much longer the produced route is than the straight line,
 *       and how much of the soft-cost terms dominate real distance in getMoveCost.
 *   (2) moonwalk: angle between the direction a unit is *steering* and the net
 *       per-frame displacement that the animation/facing code actually reads.
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
    };
    sandbox.globalThis = sandbox;
    vm.createContext(sandbox);
    for (const f of ['js/config.js', 'js/utilities.js', 'js/pathfinding.js', 'js/units.js']) {
        vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), sandbox, { filename: f });
    }
    vm.runInContext(`
        GAME_CONFIG.world.width = 4000; GAME_CONFIG.world.height = 4000; GAME_CONFIG.world.radius = 2000;
        globalThis.gameState = {
            resources:{food:9e9,wood:9e9,stone:9e9,gold:9e9}, population:{current:0,max:500},
            units:[], buildings:[], enemyUnits:[], enemyBuildings:[],
            worldObjects: ${JSON.stringify(worldObjects)},
            selectedUnits:[], selectedBuilding:null, waterField:null
        };
        globalThis.getAllUnits = () => [...gameState.units, ...gameState.enemyUnits];
        initializePathfinding();
    `, sandbox);
    return sandbox;
}
const R = (ctx, c) => vm.runInContext(c, ctx);

console.log('='.repeat(72));
console.log('(1a) How badly do the soft-cost terms outweigh actual distance?');
console.log('='.repeat(72));
{
    const ctx = makeCtx([{ type: 'water', x: 1000, y: 900, width: 2000, height: 700 }]);
    const out = R(ctx, `(function(){
        const cc = pathfinder.getClearanceCellsForUnit('villager');
        const rows = [];
        // sample cells at increasing distance south of the lake's bottom edge (y=1600)
        for (const y of [1700, 1800, 1900, 2000, 2200, 2400]) {
            const c = pathfindingGrid.worldToGrid(2000, y);
            const cell = pathfindingGrid.grid[c.y][c.x];
            const from = { x: c.x - 1, y: c.y };
            const to = { x: c.x, y: c.y };
            const lane = pathfinder.getLaneClearance(cell, false);
            rows.push({
                y,
                laneCells: Number.isFinite(lane) ? lane : 'inf',
                baseCost: +cell.cost.toFixed(2),
                shoreline: +pathfinder.getShorelineCost(cell, false, cc).toFixed(1),
                obstacle: +pathfinder.getObstacleProximityCost(cell, false, cc).toFixed(1),
                cornerTrap: +pathfinder.getCornerTrapCost(c.x, c.y, false, cc).toFixed(1),
                totalMoveCost: +pathfinder.getMoveCost(from, to, false, cc).toFixed(1)
            });
        }
        return rows;
    })()`);
    console.log('  a straight step costs ~1.0 of "distance". Compare:');
    for (const r of out) {
        console.log(`   y=${r.y}  lane=${String(r.laneCells).padStart(4)} cells  base=${String(r.baseCost).padStart(5)}  ` +
            `shore=${String(r.shoreline).padStart(6)}  obst=${String(r.obstacle).padStart(6)}  ` +
            `corner=${String(r.cornerTrap).padStart(7)}  => moveCost=${r.totalMoveCost}`);
    }
    console.log('  A move cost >> 1 means A* will happily walk many extra tiles to');
    console.log('  dodge a cell, producing long detours ("irrelevant directions").');
}

console.log('\n' + '='.repeat(72));
console.log('(1b) Route straightness on open ground with one lake off to the side');
console.log('='.repeat(72));
{
    const ctx = makeCtx([{ type: 'water', x: 1000, y: 900, width: 2000, height: 700 }]);
    const res = R(ctx, `(function(){
        const p = findPath(1200, 2000, 2800, 2000, 'villager');
        if (!p) return { path:null };
        let len = 0, maxTurn = 0, maxLateral = 0;
        for (let i = 1; i < p.length; i++) len += Math.hypot(p[i].x-p[i-1].x, p[i].y-p[i-1].y);
        for (let i = 1; i < p.length-1; i++) {
            const a=p[i-1], b=p[i], c=p[i+1];
            const v1x=b.x-a.x, v1y=b.y-a.y, v2x=c.x-b.x, v2y=c.y-b.y;
            const l1=Math.hypot(v1x,v1y), l2=Math.hypot(v2x,v2y);
            if(!l1||!l2) continue;
            const ang = Math.acos(Math.max(-1,Math.min(1,(v1x*v2x+v1y*v2y)/(l1*l2))))*180/Math.PI;
            maxTurn = Math.max(maxTurn, ang);
        }
        for (const q of p) maxLateral = Math.max(maxLateral, Math.abs(q.y - 2000));
        return { waypoints:p.length, len:+len.toFixed(0), maxTurn:Math.round(maxTurn),
                 maxLateral:+maxLateral.toFixed(0),
                 detourPct: +(((len/1600)-1)*100).toFixed(1) };
    })()`);
    console.log(`  straight-line need = 1600px, lake is 400px north of the line`);
    console.log(`  produced route     = ${res.len}px over ${res.waypoints} waypoints`);
    console.log(`  detour             = +${res.detourPct}%`);
    console.log(`  max lateral swing off the straight line = ${res.maxLateral}px`);
    console.log(`  sharpest turn in the route = ${res.maxTurn} deg`);
}

console.log('\n' + '='.repeat(72));
console.log('(2) Moonwalk: steering direction vs. the displacement the anim reads');
console.log('='.repeat(72));
{
    const ctx = makeCtx();
    R(ctx, `
        for (let i = 0; i < 12; i++) {
            const x = 1500 + (i % 4) * 20, y = 2000 + Math.floor(i/4) * 20;
            gameState.units.push({ id:'u'+i, type:'villager', player:'player',
                x, y, prevX:x, prevY:y, health:25, state:'idle', target:null,
                anim:{action:'idle',direction:'south',frame:0,elapsed:0} });
        }
        for (const u of gameState.units) setUnitDestination(u, 2800, 2000);
    `);
    const res = R(ctx, `(function(){
        let frames = 0, backwards = 0, sideways = 0, sumAngle = 0, sepExceeds = 0;
        const worst = [];
        for (let t = 0; t < 600; t++) {
            // snapshot, then hand-run the same order updateUnits() uses so we can
            // separate "intended steering" from "net displacement".
            updateResourceRates(); buildUnitSpatialIndex();
            for (const u of gameState.units) {
                if (u.state !== 'moving' || !u.path || !u.path.length) continue;
                const wp = u.path[0];
                const ix = wp.x - u.x, iy = wp.y - u.y;
                const il = Math.hypot(ix, iy);
                if (il < 1) continue;
                const beforeX = u.x, beforeY = u.y;
                updateUnit(u, 16);
                updateUnitAnimation(u, 16);
                applyUnitSeparation(u);      // the second, post-anim call
                const dx = u.x - beforeX, dy = u.y - beforeY;
                const dl = Math.hypot(dx, dy);
                if (dl < 0.05) continue;
                frames++;
                const cos = (ix/il)*(dx/dl) + (iy/il)*(dy/dl);
                const ang = Math.acos(Math.max(-1,Math.min(1,cos)))*180/Math.PI;
                sumAngle += ang;
                if (ang > 90) { backwards++; if (worst.length < 5) worst.push({t, ang:Math.round(ang), dl:+dl.toFixed(2)}); }
                else if (ang > 45) sideways++;
                if (dl > GAME_CONFIG.units.villager.speed + 0.01) sepExceeds++;
            }
        }
        return { frames, backwards, sideways, meanAngle:+(sumAngle/Math.max(1,frames)).toFixed(1),
                 sepExceeds, worst };
    })()`);
    console.log(`  moving-unit frames sampled              = ${res.frames}`);
    console.log(`  mean angle(steer, net displacement)     = ${res.meanAngle} deg`);
    console.log(`  frames displaced >45 deg off steering   = ${res.sideways}  (${(100*res.sideways/res.frames).toFixed(1)}%)`);
    console.log(`  frames displaced >90 deg off steering   = ${res.backwards}  (${(100*res.backwards/res.frames).toFixed(1)}%)  <-- MOONWALK`);
    console.log(`  frames where net move exceeded unit speed = ${res.sepExceeds}  (separation outrunning walk speed)`);
    if (res.worst.length) console.log(`  samples:`, JSON.stringify(res.worst));
    console.log(`\n  villager speed = ${R(ctx, `GAME_CONFIG.units.villager.speed`)}px/frame;`);
    console.log(`  applyUnitSeparation() max step = 0.9px and it runs TWICE per frame`);
    console.log(`  (once inside updateUnit's move step, once after updateUnitAnimation).`);
}
console.log();
