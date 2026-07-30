const gameState = {
    resources: { food: 999999, wood: 999999, stone: 999999, gold: 999999 },
    resourceRates: { food: 0, wood: 0, stone: 0, gold: 0 },
    population: { current: 1, max: 5 },
    selectedUnits: [],
    selectedBuilding: null,
    units: [],
    buildings: [],
    enemyUnits: [],
    enemyBuildings: [],
    worldObjects: [],
    waterField: null,
    waterLayout: null,
    upgrades: {
        researched: [],
        activeResearch: []
    },
    modifiers: {
        meleeAttack: 0,
        rangedAttack: 0,
        rangedRange: 0,
        villagerSpeed: 0,
        villagerCarry: 0,
        buildingHpMult: 0
    },
    settings: {
        edgeScrolling: true
    },
    input: {
        mouseX: 0,
        mouseY: 0,
        mouseInsideWindow: false
    },
    ui: {
        idleVillagers: [],
        idleVillagerIndex: -1,
        resourceValues: {},
        secondTick: 0,
        modalOpen: 'main-menu',
        hasStarted: false,
        gameLoading: false,
        selectedEnemyCount: 2
    },
    camera: { x: 0, y: 0 },
    zoomLevel: 1.0,
    isSelecting: false,
    selectionStart: { x: 0, y: 0 },
    gameTime: 0,
    lastUpdate: Date.now(),
    gameOver: false,
    keys: {},
    currentAge: 'Dark Age',
    placingBuilding: null,
    placingBuildingPosition: { x: 0, y: 0 }
};
