/** Check vessel spawning: isPositionOccupied(x,y,null,...) treats ALL water as occupied. */
const fs = require('fs'), path = require('path'), vm = require('vm');
const ROOT = path.join(__dirname, '..');
const sandbox = {
    console, Math, Date, Number, Set, Map, Infinity, NaN, JSON, Array, Object,
    tilemap: null, Multiplayer: undefined, showNotification: (m) => console.log('    [notify]', m),
    SFX: undefined, ParticleSystem: undefined, updateSelectionInfo: () => {},
    updateResourceRates: () => {}, updateEnemyAI: () => {}, handleBuildingDestruction: () => {},
    findNearestResource: () => null, displayName: s => s, canAfford: () => true,
    deductResources: () => {}, isEnemyFaction: () => false,
};
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
for (const f of ['js/config.js', 'js/utilities.js', 'js/pathfinding.js', 'js/units.js'])
    vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), sandbox, { filename: f });

// World: land, with a big lake to the north of a navy building.
vm.runInContext(`
    GAME_CONFIG.world.width=4000; GAME_CONFIG.world.height=4000; GAME_CONFIG.world.radius=2000;
    globalThis.gameState={resources:{food:9e9,wood:9e9,stone:9e9,gold:9e9},population:{current:0,max:200},
      units:[],buildings:[],enemyUnits:[],enemyBuildings:[],worldObjects:[],selectedUnits:[],
      selectedBuilding:null,waterField:null};
    gameState.worldObjects.push({ type:'water', x: 1400, y: 1200, width: 1200, height: 500, color:'#47ABA9' });
    var cfg=getBuildingConfig('navy');
    gameState.buildings.push({id:'navy',type:'navy',player:'player',x:2000-cfg.width/2,y:1800-cfg.height/2,
      width:cfg.width,height:cfg.height,health:cfg.maxHealth,maxHealth:cfg.maxHealth,
      underConstruction:false,trainingQueue:[]});
    initializePathfinding();
`, sandbox);
const run = c => vm.runInContext(c, sandbox);

console.log('water rect: x[1400..2600] y[1200..1700]; navy building y[1692..1908]');
console.log('isPointInWater(2000,1450) =', run('isPointInWater(2000,1450)'));
console.log('isPositionOccupied(2000,1450, null, 15) =', run('isPositionOccupied(2000,1450,null,15)'),
            '   <-- null excludeUnit => any water counts as OCCUPIED');
console.log('isPositionOccupied(2000,1450, {type:"warship"}, 15) =',
            run('isPositionOccupied(2000,1450,{type:"warship"},15)'), '  <-- correct for a vessel');
console.log('findWaterSpawnPoint(navy) =', JSON.stringify(run('findWaterSpawnPoint(gameState.buildings[0])')));
console.log('isValidSpawnPosition(2000,1450,"warship") =', run('isValidSpawnPosition(2000,1450,"warship",null)'));
console.log('findSpawnPointNearBuilding(navy,"warship") =',
            JSON.stringify(run('findSpawnPointNearBuilding(gameState.buildings[0], "warship")')));

console.log('\n-- actual spawn --');
const ship = run('spawnUnit("warship", gameState.buildings[0])');
console.log('warship spawned at', JSON.stringify({ x: ship.x, y: ship.y }));
console.log('  in water?', run(`isPointInWater(${ship.x}, ${ship.y})`));
console.log('  terrain-legal for a vessel?', run(`validateTerrainMovement({type:"warship"}, ${ship.x}, ${ship.y})`));
const b = sandbox.gameState.buildings[0];
const inside = ship.x >= b.x && ship.x <= b.x + b.width && ship.y >= b.y && ship.y <= b.y + b.height;
console.log('  inside the navy building footprint?', inside);
console.log('  can it accept a move order to open water?',
            run(`setUnitDestination(gameState.units[0], 2000, 1450)`));
console.log('  state after move order:', sandbox.gameState.units[0].state);
