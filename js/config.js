// Game Configuration
const GAME_CONFIG = {
    canvas: { width: 1400, height: 700 },
    world: { width: 8400, height: 4200 }, // 2800 * 3 = 8400, 1400 * 3 = 4200
    units: {
        villager: {
            cost: { food: 50 },
            health: 25,
            maxHealth: 25,
            speed: 1.5,
            attackRange: 0,
            attack: 2,
            gatherRate: 3,
            buildTime: 25,
            sprite: {
                sheet: 'villager',   // assets/units/villager.png
                // If you know exact frame sizes, set them here. If left null, code will compute from a 1x4 sheet.
                frameWidth: null,
                frameHeight: null,
                columns: 8,
                rows: 1,
                spacing: 0,
                margin: 0,
                autoDetect: false,
                renderScale: 3,
                animations: {
                    // Idle will use the first frame of the only row
                    idle: { row: 0, frames: 1, fps: 1 },
                    // Simple walk cycle: 1 row, 8 columns
                    walk: { row: 0, frames: 8, fps: 8 }
                }
            }
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
            attackRange: 120,
            buildTime: 35
        },
        crossbowman: {
            cost: { wood: 35, gold: 65 },
            health: 35,
            maxHealth: 35,
            attack: 5,
            speed: 1.0,
            attackRange: 140,
            buildTime: 40
        },
        scout: {
            cost: { food: 80 },
            health: 45,
            maxHealth: 45,
            attack: 3,
            speed: 2.5,
            attackRange: 20,
            buildTime: 30
        },
        knight: {
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
        soldier: {
            cost: { food: 70, gold: 30 },
            health: 50,
            maxHealth: 50,
            attack: 7,
            speed: 1.2,
            attackRange: 25,
            buildTime: 30
        },
        catapult: {
            cost: { wood: 200, gold: 200 },
            health: 150,
            maxHealth: 150,
            attack: 40,
            speed: 0.8,
            attackRange: 200,
            buildTime: 60
        },
        ballista: {
            cost: { wood: 120, gold: 150 },
            health: 80,
            maxHealth: 80,
            attack: 25,
            speed: 0.9,
            attackRange: 180,
            buildTime: 50
        },
        mangonel: {
            cost: { wood: 180, gold: 180 },
            health: 120,
            maxHealth: 120,
            attack: 35,
            speed: 0.8,
            attackRange: 190,
            buildTime: 55
        },
        trebuchet: {
            cost: { wood: 300, gold: 250 },
            health: 200,
            maxHealth: 200,
            attack: 50,
            speed: 0.6,
            attackRange: 250,
            buildTime: 80
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
            speed: 1.0,
            attackRange: 0,
            buildTime: 50,
            vessel: true,
            capacity: 8
        },
        galley: {
            cost: { wood: 150, gold: 50 },
            health: 150,
            maxHealth: 150,
            attack: 10,
            speed: 1.0,
            attackRange: 160,
            buildTime: 45,
            vessel: true
        },
        warship: {
            cost: { wood: 220, gold: 120 },
            health: 220,
            maxHealth: 220,
            attack: 18,
            speed: 0.9,
            attackRange: 180,
            buildTime: 55,
            vessel: true
        },
        fishingBoat: {
            cost: { wood: 90 },
            health: 110,
            maxHealth: 110,
            attack: 0,
            speed: 1.0,
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
            width: 600,  // 400 * 1.5 = 600
            height: 600  // 400 * 1.5 = 600
        },
        house: {
            cost: { wood: 25 },
            health: 550,
            maxHealth: 550,
            population: 5,
            width: 180,  // 120 * 1.5 = 180
            height: 180  // 120 * 1.5 = 180
        },
        barracks: {
            cost: { wood: 175 },
            health: 1200,
            maxHealth: 1200,
            width: 270,  // 180 * 1.5 = 270
            height: 270  // 180 * 1.5 = 270
        },
        archeryRange: {
            cost: { wood: 150 },
            health: 1000,
            maxHealth: 1000,
            width: 270,  // 180 * 1.5 = 270
            height: 270  // 180 * 1.5 = 270
        },
        craftery: {
            cost: { wood: 200, stone: 100 },
            health: 1500,
            maxHealth: 1500,
            width: 315,  // 210 * 1.5 = 315
            height: 315  // 210 * 1.5 = 315
        },
        navy: {
            cost: { wood: 200, stone: 50 },
            health: 1000,
            maxHealth: 1000,
            width: 315,  // 210 * 1.5 = 315
            height: 270  // 180 * 1.5 = 270
        },
        bridge: {
            cost: { wood: 150, stone: 50 },
            health: 800,
            maxHealth: 800,
            width: 360,  // 240 * 1.5 = 360
            height: 54   // 36 * 1.5 = 54
        }
    },
    worldObjects: {
        berryBush: { type: 'resource', resourceType: 'food', amount: 100, width: 30, height: 30, color: '#8B0000' },
        tree: { type: 'resource', resourceType: 'wood', amount: 150, width: 40, height: 40, color: '#228B22' },
        stoneMine: { type: 'resource', resourceType: 'stone', amount: 100, width: 50, height: 50, color: '#A9A9A9' },
        goldMine: { type: 'resource', resourceType: 'gold', amount: 100, width: 50, height: 50, color: '#FFD700' },
        rock: { type: 'obstacle', width: 30, height: 30, color: '#696969' },
        water: { type: 'water', width: 1200, height: 100, color: '#1e90ff' },
        lake: { type: 'water', width: 500, height: 400, color: '#1c86ee' },
        bridgeSpan: { type: 'bridge', width: 160, height: 24, color: '#8B4513' }
    }
};