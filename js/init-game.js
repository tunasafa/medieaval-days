// Game Initialization
async function initGame() {
    // First, preload all PNG assets
    console.log('Loading game assets...');
    await assetManager.preloadGameAssets();
    console.log('All assets loaded successfully!');
    
    drawUIIcons();
    const canvas = document.getElementById('gameCanvas');
    const ctx = canvas.getContext('2d');
    resizeCanvas();
    createWorldObjects();
    createInitialBuildings();
    createEnemyBase();
    createInitialUnits();
    initializePathfinding(); // Initialize the pathfinding system
    setupEventListeners();
    const playerTC = gameState.buildings.find(b => b.type === 'town-center' && b.player === 'player');
    if (playerTC) {
        gameState.camera.x = playerTC.x + playerTC.width/2 - GAME_CONFIG.canvas.width/2;
        gameState.camera.y = playerTC.y + playerTC.height/2 - GAME_CONFIG.canvas.height/2;
    }
    gameLoop();
    showNotification('Welcome to Medieval Empire Builder - Pixel Edition! Gather resources (3x faster!), build an army, and destroy the enemy Town Center!');
}

function drawUIIcons() {
    // Resource icons - use scale for UI
    drawFoodIcon(document.querySelector('.resource-icon.food').getContext('2d'), 4);
    drawWoodIcon(document.querySelector('.resource-icon.wood').getContext('2d'), 4);
    drawStoneIcon(document.querySelector('.resource-icon.stone').getContext('2d'), 4);
    drawGoldIcon(document.querySelector('.resource-icon.gold').getContext('2d'), 4);

    // Building icons - use fitted dimensions for UI (48x48 pixels)
    const iconSize = 48;
    drawHouseIcon(document.querySelector('.building-icon.house').getContext('2d'), iconSize, iconSize);
    drawBarracksIcon(document.querySelector('.building-icon.barracks').getContext('2d'), iconSize, iconSize);
    drawArcheryRangeIcon(document.querySelector('.building-icon.archeryRange').getContext('2d'), iconSize, iconSize);
    drawCrafteryIcon(document.querySelector('.building-icon.craftery').getContext('2d'), iconSize, iconSize);
    const navyIcon = document.querySelector('.building-icon.navy');
    if (navyIcon) drawNavyIcon(navyIcon.getContext('2d'), iconSize, iconSize);
}

function createWorldObjects() {
     const centerX = GAME_CONFIG.world.width / 4;
    const centerY = GAME_CONFIG.world.height / 2;
    const enemyCenterX = GAME_CONFIG.world.width * 3/4;
    const enemyCenterY = GAME_CONFIG.world.height / 2;
    const waterRoll = Math.random() < 0.5 ? 'river' : 'lake';
    if (waterRoll === 'river') {
        const thickness = 120;
        const x = (GAME_CONFIG.world.width / 2) - (thickness / 2);
        gameState.worldObjects.push({
            ...GAME_CONFIG.worldObjects.water,
            x,
            y: 0,
            width: thickness,
            height: GAME_CONFIG.world.height
        });
    } else {
        const x = centerX + 200 + Math.random() * 400;
        const y = centerY - 200 + Math.random() * 400;
        gameState.worldObjects.push({
            ...GAME_CONFIG.worldObjects.lake,
            x,
            y
        });
    }
    for (let i = 0; i < 15; i++) {
        gameState.worldObjects.push({
            ...GAME_CONFIG.worldObjects.berryBush,
            x: centerX - 200 + Math.random() * 200,
            y: centerY - 100 + Math.random() * 200
        });
    }
    for (let i = 0; i < 20; i++) {
        gameState.worldObjects.push({
            ...GAME_CONFIG.worldObjects.tree,
            x: centerX - 300 + Math.random() * 200,
            y: centerY - 200 + Math.random() * 400
        });
    }
    gameState.worldObjects.push({
        ...GAME_CONFIG.worldObjects.stoneMine,
        x: centerX - 400,
        y: centerY - 100
    });
    gameState.worldObjects.push({
        ...GAME_CONFIG.worldObjects.goldMine,
        x: centerX - 400,
        y: centerY + 50
    });

     for (let i = 0; i < 10; i++) {
        gameState.worldObjects.push({
            ...GAME_CONFIG.worldObjects.berryBush,
            x: enemyCenterX + 100 + Math.random() * 200,
            y: enemyCenterY - 100 + Math.random() * 200
        });
    }
    for (let i = 0; i < 15; i++) {
        gameState.worldObjects.push({
            ...GAME_CONFIG.worldObjects.tree,
            x: enemyCenterX + 200 + Math.random() * 200,
            y: enemyCenterY - 200 + Math.random() * 400
        });
    }
    gameState.worldObjects.push({
        ...GAME_CONFIG.worldObjects.stoneMine,
        x: enemyCenterX + 400,
        y: enemyCenterY - 100
    });
    gameState.worldObjects.push({
        ...GAME_CONFIG.worldObjects.goldMine,
        x: enemyCenterX + 400,
        y: enemyCenterY + 50
    });

    for (let i = 0; i < 30; i++) {
        const obj = { ...GAME_CONFIG.worldObjects.rock };
        let placed = false;
        let attempts = 0;
        while (!placed && attempts++ < 50) {
            obj.x = Math.random() * GAME_CONFIG.world.width;
            obj.y = Math.random() * GAME_CONFIG.world.height;
            const overlapsWater = gameState.worldObjects.some(o => o.type === 'water' &&
                !(obj.x + obj.width < o.x || obj.x > o.x + o.width || obj.y + obj.height < o.y || obj.y > o.y + o.height));
            if (!overlapsWater) placed = true;
        }
        if (placed) gameState.worldObjects.push(obj);
    }
}

function createInitialUnits() {
    // Find the player's town center to spawn the initial villager around it
    const playerTC = gameState.buildings.find(b => b.type === 'town-center' && b.player === 'player');
    
    if (playerTC) {
        // Use the same spawning logic as spawnUnit to place villager around the building
        const centerX = playerTC.x + playerTC.width / 2;
        const centerY = playerTC.y + playerTC.height / 2;
        const ringRadius = Math.max(playerTC.width, playerTC.height) / 2 + 25; // Slightly further out
        
        // Try multiple positions around the town center
        let spawnPosition = null;
        const tries = 16;
        
        for (let i = 0; i < tries; i++) {
            const theta = (i / tries) * Math.PI * 2;
            const tx = centerX + Math.cos(theta) * ringRadius;
            const ty = centerY + Math.sin(theta) * ringRadius;
            
            // Check if this position is available
            if (!isPositionOccupied(tx, ty, null, 15)) {
                spawnPosition = { x: tx, y: ty };
                break;
            }
        }
        
        // Fallback position if no good spot found
        if (!spawnPosition) {
            spawnPosition = { x: centerX, y: centerY + ringRadius };
        }
        
        gameState.units.push({
            id: generateId(),
            type: 'villager',
            player: 'player',
            x: spawnPosition.x,
            y: spawnPosition.y,
            health: GAME_CONFIG.units.villager.maxHealth,
            state: 'idle',
            target: null,
            gatherType: null,
            isSelected: false
        });
    } else {
        // Fallback to old method if no town center found
        const centerX = GAME_CONFIG.world.width / 4;
        const centerY = GAME_CONFIG.world.height / 2;
        gameState.units.push({
            id: generateId(),
            type: 'villager',
            player: 'player',
            x: centerX + 50,
            y: centerY + 50,
            health: GAME_CONFIG.units.villager.maxHealth,
            state: 'idle',
            target: null,
            gatherType: null,
            isSelected: false
        });
    }
}

function clampCameraToBounds() {
    gameState.camera.x = Math.max(0, Math.min(GAME_CONFIG.world.width - GAME_CONFIG.canvas.width, gameState.camera.x || 0));
    gameState.camera.y = Math.max(0, Math.min(GAME_CONFIG.world.height - GAME_CONFIG.canvas.height, gameState.camera.y || 0));
}