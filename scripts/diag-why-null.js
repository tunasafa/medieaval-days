/** Pinpoint which post-processing stage makes findPath() return null. */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const ROOT = path.join(__dirname, '..');

const sandbox = {
    console, Math, Date, Number, Set, Map, Infinity, NaN, JSON, Array, Object,
    tilemap: null, Multiplayer: undefined, showNotification: () => {}, SFX: undefined,
    ParticleSystem: undefined, updateSelectionInfo: () => {}, updateResourceRates: () => {},
    updateEnemyAI: () => {}, handleBuildingDestruction: () => {}, findNearestResource: () => null,
    displayName: s => s, canAfford: () => true, deductResources: () => {}, isEnemyFaction: () => false,
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
    const cfg = getBuildingConfig('town-center');
    gameState.buildings.push({ id:'tc', type:'town-center', player:'player',
        x: 2000 - cfg.width/2, y: 2000 - cfg.height/2, width: cfg.width, height: cfg.height,
        health: cfg.maxHealth, maxHealth: cfg.maxHealth, underConstruction:false, trainingQueue:[] });
    initializePathfinding();
    globalThis.__tc = gameState.buildings[0];
`, sandbox);
const R = c => vm.runInContext(c, sandbox);

console.log(`town-center rect: x[${R('__tc.x')}..${R('__tc.x+__tc.width')}] y[${R('__tc.y')}..${R('__tc.y+__tc.height')}]`);
console.log(`start (2000,2250) walkable cell? ${R(`(function(){const c=pathfindingGrid.worldToGrid(2000,2250);return pathfinder.isWalkable(c.x,c.y,false,2);})()`)}`);
console.log(`end   (2600,2250) walkable cell? ${R(`(function(){const c=pathfindingGrid.worldToGrid(2600,2250);return pathfinder.isWalkable(c.x,c.y,false,2);})()`)}`);
console.log(`findPath(...) => ${JSON.stringify(R(`findPath(2000,2250,2600,2250,'villager')`))}`);

// Re-run A* manually and inspect each post-processing candidate.
const report = R(`(function(){
    const isShip = false, cc = pathfinder.getClearanceCellsForUnit('villager');
    const start = pathfindingGrid.worldToGrid(2000,2250);
    const end   = pathfindingGrid.worldToGrid(2600,2250);
    // Raw BFS-ish A* replication is overkill; instead call the internal and hook
    // validatePath to log which candidate fails and why.
    const origValidate = pathfinder.validatePath.bind(pathfinder);
    const attempts = [];
    pathfinder.validatePath = function(p, s, c, ut) {
        const res = origValidate(p, s, c, ut);
        attempts.push({ inLen: p ? p.length : 0, ok: !!(res && res.length > 1) });
        return res;
    };
    const out = pathfinder.findPath(2000,2250,2600,2250,'villager',{allowUnsafeShoreline:false});
    pathfinder.validatePath = origValidate;
    return { attempts, outLen: out ? out.length : null };
})()`);
console.log('validatePath attempts (candidate order: curved, rounded, simplified, relaxed, raw):');
console.log('  ' + JSON.stringify(report));

// Now find which waypoint of the RAW path validatePath rejects.
const raw = R(`(function(){
    // reconstruct raw grid path with a tiny dedicated A* (no smoothing)
    const cc = pathfinder.getClearanceCellsForUnit('villager');
    const s = pathfindingGrid.worldToGrid(2000,2250), e = pathfindingGrid.worldToGrid(2600,2250);
    const key = c => c.x+','+c.y;
    const prev = new Map(), seen = new Set([key(s)]), q=[s]; let h=0, found=null;
    while(h<q.length){ const c=q[h++]; if(c.x===e.x&&c.y===e.y){found=c;break;}
      for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1],[1,1],[-1,1],[1,-1],[-1,-1]]){
        const n={x:c.x+dx,y:c.y+dy}; const k=key(n);
        if(seen.has(k)||!pathfinder.isWalkable(n.x,n.y,false,cc)) continue;
        seen.add(k); prev.set(k,c); q.push(n);} }
    if(!found) return {reachable:false};
    const cells=[]; for(let c=found;c;c=prev.get(key(c))) cells.unshift(c);
    const pts = cells.map(c => pathfindingGrid.gridToWorld(c.x,c.y));
    // check each point
    const bad = [];
    for(let i=0;i<pts.length;i++){
      const p=pts[i];
      const okTerrain = validateTerrainMovement({type:'villager'}, p.x, p.y);
      if(!okTerrain) bad.push({i, x:+p.x.toFixed(0), y:+p.y.toFixed(0), reason:'validateTerrainMovement'});
    }
    return { reachable:true, len:pts.length, bad, first:pts[0], last:pts[pts.length-1] };
})()`);
console.log('raw BFS grid path:', JSON.stringify(raw));
