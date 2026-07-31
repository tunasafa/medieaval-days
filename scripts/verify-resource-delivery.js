/**
 * Regression checks for villagers carrying resources back to a town center.
 * The important invariant is that a carrier either deposits or makes progress;
 * it must not orbit an invalid clearance-band drop point forever.
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

function makeContext() {
    const sandbox = {
        console: { log: () => {}, warn: () => {}, error: () => {} },
        Math, Date, Number, Set, Map, Infinity, NaN, JSON, Array, Object,
        tilemap: null, Multiplayer: undefined, showNotification: () => {},
        SFX: undefined, ParticleSystem: undefined, updateSelectionInfo: () => {},
        updateResourceRates: () => {}, updateEnemyAI: () => {},
        updateConstructionSites: undefined, handleBuildingDestruction: () => {},
        findNearestResource: () => null, displayName: value => value,
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
            resources: { food: 0, wood: 0, stone: 0, gold: 0 },
            population: { current: 0, max: 500 },
            units: [], buildings: [], enemyUnits: [], enemyBuildings: [],
            worldObjects: [], selectedUnits: [], selectedBuilding: null, waterField: null
        };
        gameState.buildings.push({
            id: 'tc', type: 'town-center', player: 'player',
            x: 1700, y: 1700, width: 600, height: 600,
            health: 1000, maxHealth: 1000, underConstruction: false
        });
        initializePathfinding();
    `, sandbox);
    return sandbox;
}

function run(ctx, code) {
    return vm.runInContext(code, ctx);
}

console.log('\n[1] Carrier at the old stuck corner deposits successfully');
{
    const ctx = makeContext();
    run(ctx, `gameState.units.push({
        id: 'corner-carrier', type: 'villager', player: 'player',
        x: 3050, y: 2000, prevX: 3050, prevY: 2000,
        health: 25, state: 'returning', target: null,
        gatheredAmount: 25, gatherType: 'wood',
        returnPath: null, returnPathTimer: 0,
        returnPathFailed: false, returnPathFailCount: 0,
        returnPathRetryDelay: 0,
        anim: { action: 'idle', direction: 'west', frame: 0, elapsed: 0 }
    });`);
    run(ctx, `for (let t = 0; t < 1800; t++) updateUnits(16);`);
    const carrier = ctx.gameState.units[0];
    ok(carrier.state === 'idle', 'carrier leaves returning state', `state=${carrier.state}`);
    ok(ctx.gameState.resources.wood === 25, 'full load reaches the player stockpile', `wood=${ctx.gameState.resources.wood}`);
}

console.log('\n[2] A batch of carriers all completes delivery');
{
    const ctx = makeContext();
    run(ctx, `for (let i = 0; i < 8; i++) {
        const x = 2800 + (i % 4) * 80;
        const y = 1500 + Math.floor(i / 4) * 100;
        gameState.units.push({
            id: 'batch-' + i, type: 'villager', player: 'player',
            x, y, prevX: x, prevY: y,
            health: 25, state: 'returning', target: null,
            gatheredAmount: 10, gatherType: 'food',
            returnPath: null, returnPathTimer: 0,
            returnPathFailed: false, returnPathFailCount: 0,
            returnPathRetryDelay: 0,
            anim: { action: 'idle', direction: 'west', frame: 0, elapsed: 0 }
        });
    }
    for (let t = 0; t < 2400; t++) updateUnits(16);`);
    const carriers = ctx.gameState.units;
    const activeReturns = carriers.filter(unit => unit.state === 'returning').length;
    const invalid = carriers.filter(unit => !run(ctx,
        `validateTerrainMovement(gameState.units[${carriers.indexOf(unit)}], ${unit.x}, ${unit.y})`)).length;
    ok(activeReturns === 0, 'no carrier remains stuck returning', `stuck=${activeReturns}`);
    ok(ctx.gameState.resources.food === 80, 'every carrier deposits exactly once', `food=${ctx.gameState.resources.food}`);
    ok(invalid === 0, 'delivery recovery never violates terrain', `invalid=${invalid}`);
}

console.log('\n============================================================');
console.log(`  ${pass} passed, ${fail} failed`);
console.log('============================================================');
if (fail > 0) process.exit(1);
