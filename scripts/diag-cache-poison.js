/** Verify that a single failed path poisons the shared path cache for nearby units. */
const fs = require('fs'), path = require('path'), vm = require('vm');
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
for (const f of ['js/config.js', 'js/utilities.js', 'js/pathfinding.js', 'js/units.js'])
    vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), sandbox, { filename: f });
vm.runInContext(`
    GAME_CONFIG.world.width=4000; GAME_CONFIG.world.height=4000; GAME_CONFIG.world.radius=2000;
    globalThis.gameState={resources:{food:9e9,wood:9e9,stone:9e9,gold:9e9},population:{current:0,max:200},
      units:[],buildings:[],enemyUnits:[],enemyBuildings:[],worldObjects:[],selectedUnits:[],
      selectedBuilding:null,waterField:null};
    var cfg=getBuildingConfig('craftery');
    gameState.buildings.push({id:'b',type:'craftery',player:'player',x:2000-cfg.width/2,y:2000-cfg.height/2,
      width:cfg.width,height:cfg.height,health:cfg.maxHealth,maxHealth:cfg.maxHealth,
      underConstruction:false,trainingQueue:[]});
    initializePathfinding();
`, sandbox);
const run = c => vm.runInContext(c, sandbox);

console.log('--- cache poisoning ---');
console.log('cacheClusterCells =', run('GAME_CONFIG.pathfinding.cacheClusterCells'),
            ' cellSize =', run('pathfindingGrid.cellSize'),
            ' => cluster =', run('GAME_CONFIG.pathfinding.cacheClusterCells * pathfindingGrid.cellSize'), 'px');

// A pinned start (18px above building) fails.
const pinned = run('findPath(1848.5, 1824.5, 2900, 2900, "catapult")');
console.log('pinned start (1848.5,1824.5) -> path:', pinned ? 'len ' + pinned.length : 'NULL');
console.log('cache size after failure:', run('__pathCache.size'));

// A healthy start 120px clear of the building, in the SAME 256px cache cluster.
const healthyRaw = run(`(function(){
    var saved = new Map(__pathCache); __pathCache.clear();
    var p = findPath(1790, 1700, 2900, 2900, "catapult");
    __pathCache.clear(); for (var e of saved) __pathCache.set(e[0], e[1]);
    return p ? p.length : null;
})()`);
console.log('healthy start (1790,1700) on its own -> path:', healthyRaw ? 'len ' + healthyRaw : 'NULL');

const healthyPoisoned = run('findPath(1790, 1700, 2900, 2900, "catapult")');
console.log('same healthy start WITH poisoned cache present -> path:',
            healthyPoisoned ? 'len ' + healthyPoisoned.length : 'NULL');
console.log(healthyRaw && !healthyPoisoned
    ? '  >>> CONFIRMED: a null path from one unit blocks a perfectly movable unit nearby.'
    : '  >>> not reproduced here');

console.log('\n--- sprite size vs collision radius ---');
console.log('collision/terrain clearance radius:', run('getTerrainClearanceRadius("militia")'), 'px');
console.log('spawn ring first offset in findSpawnPointNearBuilding: 18 px');
console.log('drawn sprite: (18*2-4)=32px base, x3 for infantry = 96px wide, x6 axeman/crossbow = 192px');
console.log('=> sprite half-width 48..96px vs 18px spawn gap: sprite visually covers the building.');

console.log('\n--- same-cluster poisoning test ---');
run('__pathCache.clear()');
const cl = (v) => Math.floor(v / 256);
// find a healthy start inside the SAME 256px cluster as the pinned spawn
for (const [sx, sy] of [[1900,1800],[1850,1790],[1800,1810],[1790,1790],[1810,1780]]) {
    if (cl(sx) !== cl(1848.5) || cl(sy) !== cl(1824.5)) { console.log(`  (${sx},${sy}) different cluster, skip`); continue; }
    run('__pathCache.clear()');
    const alone = run(`findPath(${sx}, ${sy}, 2900, 2900, "catapult")`);
    run('__pathCache.clear()');
    run('findPath(1848.5, 1824.5, 2900, 2900, "catapult")');   // poison first
    const after = run(`findPath(${sx}, ${sy}, 2900, 2900, "catapult")`);
    console.log(`  (${sx},${sy}) same cluster: alone=${alone ? 'len'+alone.length : 'NULL'} afterPoison=${after ? 'len'+after.length : 'NULL'}` +
                (alone && !after ? '  <<< POISONED' : ''));
}
