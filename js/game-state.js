// Game State
const gameState = {
    resources: { food: 1200, wood: 1200, stone: 1100, gold: 1100 },
    resourceRates: { food: 0, wood: 0, stone: 0, gold: 0 },
    population: { current: 1, max: 5 },
    selectedUnits: [],
    selectedBuilding: null,
    units: [],
    buildings: [],
    enemyUnits: [],
    enemyBuildings: [],
    worldObjects: [],
    camera: { x: 0, y: 0 },
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