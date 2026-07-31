const GAME_CONFIG = {
    canvas: { width: 5000, height: 2500 },
    minimap: { width: 200, height: 200 },
    world: { width: 16000, height: 16000, radius: 8000, numPlayers: 3, enemyCount: 2 },
    multiplayer: {
        signalUrl: 'wss://medieaval-days-signal.onrender.com'
    },
    pathfinding: {
        cellSize: 32,
        maxSearchCells: 30000,
        cacheClusterCells: 8,
        cacheMaxEntries: 300,
        shorelineHardClearanceCells: 4,
        shorelinePreferredClearanceCells: 9,
        shorelineCostWeight: 34,
        obstaclePreferredClearanceCells: 6,
        obstacleCostWeight: 8,
        cornerTrapCostWeight: 18,
        pathRelaxRadiusCells: 5,
        maxPathTurnDegrees: 135,
        allowShorelineFallback: false,
        shipShorelinePreferredClearanceCells: 4,
        shipShorelineCostWeight: 3
    },
    construction: {
        minWorkers: 1,
        maxWorkers: 4,
        workRange: 30
    },
    enemyFactions: [
        { id: 'enemy-1', name: 'Iron Host', assetFolder: 'enemy', color: '#e35f44' },
        { id: 'enemy-2', name: 'Sun Emirate', assetFolder: 'desert', color: '#f2b84b' },
        { id: 'enemy-3', name: 'Night Court', assetFolder: 'gothic_vampiric', color: '#b45cff' },
        { id: 'enemy-4', name: 'Warlike Clan', assetFolder: 'jagged_warlike', color: '#4cc7d9' }
    ],
    // Terrain/water tuning. terrain.tileSize is the logical water-mask resolution
    // that all gameplay reads; bridgeBlockSize is kept independent so bridge
    // footprints stay the same size regardless of how fine the mask gets.
    terrain: {
        tileSize: 32,          // logical water-mask resolution in world units
        bridgeBlockSize: 128,  // bridge lane width, decoupled from tileSize
        bridgeBankApron: 64,   // land overlap on each bank so paths connect cleanly
        bridgeMaxSpan: 960,    // maximum river width one bridge placement can cross
        contourStep: 32,       // marching-squares sampling step for the drawn coast
        maxWaterDepth: 3       // number of depth bands for shading
    },
    units: {
        villager: {
            cost: { food: 50 },
            health: 25,
            maxHealth: 25,
            speed: 1.5,
            attackRange: 0,
            attack: 2,
            gatherRate: 3,
            buildTime: 25
        },
        militia: {
            cost: { food: 60, gold: 20 },
            health: 40,
            maxHealth: 40,
            attack: 6,
            speed: 1.2,
            attackRange: 30,
            buildTime: 21
        },
    archer: {
            cost: { wood: 25, gold: 45 },
            health: 30,
            maxHealth: 30,
            attack: 4,
            speed: 1.0,
            attackRange: 480,
            buildTime: 35
        },
        crossbowman: {
            cost: { wood: 35, gold: 65 },
            health: 35,
            maxHealth: 35,
            attack: 5,
            speed: 1.0,
            attackRange: 600,
            buildTime: 40
        },
        axeman: {
            cost: { food: 60, gold: 75 },
            health: 100,
            maxHealth: 100,
            attack: 10,
            speed: 1.8,
            attackRange: 25,
            buildTime: 45
        },
        warrior: {
            cost: { food: 80, gold: 40 },
            health: 60,
            maxHealth: 60,
            attack: 8,
            speed: 1.3,
            attackRange: 30,
            buildTime: 35
        },
    catapult: {
            cost: { wood: 200, gold: 200 },
            health: 150,
            maxHealth: 150,
            attack: 40,
            speed: 0.8,
            attackRange: 960,
            buildTime: 60
        },
        ballista: {
            cost: { wood: 120, gold: 150 },
            health: 80,
            maxHealth: 80,
            attack: 25,
            speed: 0.9,
            attackRange: 780,
            buildTime: 50
        },
        transportSmall: {
            cost: { wood: 120 },
            health: 120,
            maxHealth: 120,
            attack: 0,
            speed: 1.2,
            attackRange: 0,
            buildTime: 35,
            vessel: true,
            capacity: 4
        },
        transportLarge: {
            cost: { wood: 220 },
            health: 200,
            maxHealth: 200,
            attack: 0,
            speed: 1.5,
            attackRange: 0,
            buildTime: 50,
            vessel: true,
            capacity: 8
        },
    warship: {
            cost: { wood: 220, gold: 120 },
            health: 220,
            maxHealth: 220,
            attack: 18,
            speed: 1.4,
            attackRange: 180,
            buildTime: 55,
            vessel: true
        },
    fishingBoat: {
            cost: { wood: 90 },
            health: 110,
            maxHealth: 110,
            attack: 0,
            speed: 1.5,
            attackRange: 0,
            buildTime: 30,
            vessel: true,
            gatherRate: 2.5
        }
    },
    buildings: {
        townCenter: {
            cost: { wood: 400, stone: 300 },
            health: 2400,
            maxHealth: 2400,
            buildTime: 120,
            width: 600,
            height: 600
        },
        house: {
            cost: { wood: 25 },
            health: 550,
            maxHealth: 550,
            buildTime: 18,
            population: 5,
            width: 180,
            height: 180
        },
        barracks: {
            cost: { wood: 175 },
            health: 1200,
            maxHealth: 1200,
            buildTime: 45,
            width: 270,
            height: 270
        },
        archeryRange: {
            cost: { wood: 150 },
            health: 1000,
            maxHealth: 1000,
            buildTime: 40,
            width: 270,
            height: 270
        },
        craftery: {
            cost: { wood: 200, stone: 100 },
            health: 1500,
            maxHealth: 1500,
            buildTime: 50,
            width: 315,
            height: 315
        },
        blacksmith: {
            cost: { wood: 150, gold: 100 },
            health: 1200,
            maxHealth: 1200,
            buildTime: 45,
            width: 270,
            height: 270
        },
        university: {
            cost: { wood: 200, stone: 150 },
            health: 1400,
            maxHealth: 1400,
            buildTime: 55,
            width: 315,
            height: 315
        },
        navy: {
            cost: { wood: 200, stone: 50 },
            health: 1000,
            maxHealth: 1000,
            buildTime: 45,
            width: 252,
            height: 216
        },
        bridge: {
            cost: { wood: 15, stone: 5 },
            health: 200,
            maxHealth: 200,
            width: 32,
            height: 32
        }
    },
    worldObjects: {
        berryBush: { type: 'resource', resourceType: 'food', amount: 100, width: 30, height: 30, color: '#8B0000' },
        tree: { type: 'resource', resourceType: 'wood', amount: 150, width: 40, height: 40, color: '#228B22' },
        stoneMine: { type: 'resource', resourceType: 'stone', amount: 100, width: 50, height: 50, color: '#A9A9A9' },
        goldMine: { type: 'resource', resourceType: 'gold', amount: 100, width: 50, height: 50, color: '#FFD700' },
        rock: { type: 'obstacle', width: 30, height: 30, color: '#696969' },
        water: { type: 'water', width: 1200, height: 100, color: '#47ABA9' },
        lake: { type: 'water', width: 1000, height: 800, color: '#3A9391' },
    }
};

// Natural water palette. Index 0 is shallow shore water through 3 deep water.
// The renderer uses broad animated bands, not high-frequency dither.
const WATER_PALETTE = [
    { primary: [82, 163, 156], secondary: [92, 177, 168], specular: [164, 218, 211] },
    { primary: [54, 135, 145], secondary: [62, 150, 156], specular: [137, 195, 199] },
    { primary: [38, 108, 126], secondary: [33, 121, 137], specular: [104, 166, 180] },
    { primary: [26, 82, 105],  secondary: [23, 94, 116],  specular: [78, 135, 156] }
];

// Shore band colours: foam and sand tones used along the smoothed coastline.
const SHORE_PALETTE = {
    foam: [210, 234, 228],
    wetSand: [133, 139, 102],
    drySand: [163, 160, 109]
};
