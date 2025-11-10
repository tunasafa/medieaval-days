// Game Initialization
async function initGame() {
    // Preload all game assets (units as GIF, buildings/resources as PNG)
    console.log('Loading game assets...');
    await assetManager.preloadGameAssets();
    console.log('All assets loaded successfully!');
    
    await drawUIIcons();
    const canvas = document.getElementById('gameCanvas');
    const ctx = canvas.getContext('2d');
    resizeCanvas();
    
    // Create player buildings first so water can avoid overlapping them
    createInitialBuildings();
    
    // Now create world objects (water/resources) with knowledge of existing buildings
    createWorldObjects();
    
    // Initialize tilemap system after world objects are created
    console.log('Initializing tilemap system...');
    await initTilemap();
    console.log('Tilemap system initialized!');
    // Re-mark water areas with new shapes
    if (tilemap && gameState && gameState.worldObjects) {
        tilemap.markWaterAreas(gameState.worldObjects);
    }
    // Ensure resources/decorations never remain in water after water is finalized
    if (typeof enforceLandForWorldObjects === 'function') {
        enforceLandForWorldObjects();
    }
    
    // Create enemy base after water, so it can adapt to river placement
    createEnemyBase();
    createInitialUnits();
    // Ensure water does not overlap buildings or units by re-marking after spawns
    if (tilemap && gameState && gameState.worldObjects) {
        tilemap.markWaterAreas(gameState.worldObjects);
    }
    // Re-enforce land-only for resources/decorations after any late changes
    if (typeof enforceLandForWorldObjects === 'function') {
        enforceLandForWorldObjects();
    }
    initializePathfinding(); // Initialize the pathfinding system
    setupEventListeners();
    const playerTC = gameState.buildings.find(b => b.type === 'town-center' && b.player === 'player');
    if (playerTC) {
        gameState.camera.x = playerTC.x + playerTC.width/2 - GAME_CONFIG.canvas.width/2;
        gameState.camera.y = playerTC.y + playerTC.height/2 - GAME_CONFIG.canvas.height/2;
    }
    gameLoop();
    showNotification('Welcome to MEDIEVAL DAYS! Gather resources, build an army, and destroy the enemy Town Center!');
}

async function drawUIIcons() {
    // Ensure resource assets are loaded
    await Promise.all([
        ensureAssetLoaded('resources', 'food1'),
        ensureAssetLoaded('resources', 'wood1'),
        ensureAssetLoaded('resources', 'stone1'),
        ensureAssetLoaded('resources', 'gold1')
    ]);
    // Resource icons - fit exactly to 28x28 canvases
    const foodCv = document.querySelector('.resource-icon.food');
    const woodCv = document.querySelector('.resource-icon.wood');
    const stoneCv = document.querySelector('.resource-icon.stone');
    const goldCv = document.querySelector('.resource-icon.gold');
    const dpr = window.devicePixelRatio || 1;
    const fit = (cv, name) => {
        if (!cv) return;
        // Match internal resolution to CSS size for crisp scaling
        const cssW = parseInt(getComputedStyle(cv).width, 10) || cv.width;
        const cssH = parseInt(getComputedStyle(cv).height, 10) || cv.height;
        cv.width = Math.max(1, Math.floor(cssW * dpr));
        cv.height = Math.max(1, Math.floor(cssH * dpr));
        const ctx = cv.getContext('2d');
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        drawAssetFitted(ctx, 'resources', name, 0, 0, cssW, cssH);
    };
    fit(foodCv, 'food1');
    fit(woodCv, 'wood1');
    fit(stoneCv, 'stone1');
    fit(goldCv, 'gold1');

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
        // Curvy river using exponential-based path x(t) with varying width w(t)
        const H = GAME_CONFIG.world.height;
        const W = GAME_CONFIG.world.width;
        const centerXBase = W / 2;
        const steps = Math.max(60, Math.floor(H / 24));
        const stepH = Math.max(8, Math.floor(H / steps));
        const amp = Math.min(260, W * 0.22); // lateral amplitude
        const k = 3.2; // steepness for exponential curve
        const norm = Math.sinh(k / 2) || 1; // normalize [-0.5,0.5] domain
    const thickness = 400; // base thickness (2x wider)
        const kW = 4.0; // width emphasis toward center
        for (let i = 0; i < steps; i++) {
            const t = i / (steps - 1); // 0..1 along vertical axis
            const s = t - 0.5; // centered -0.5..0.5
            // Exponential-shaped lateral offset plus a gentle sine ripple
            const expCurve = Math.sinh(k * s) / norm; // -1..1 with exponential growth toward ends
            const ripple = Math.sin(Math.PI * 2.5 * t) * 0.15; // subtle oscillation
            const cx = centerXBase + amp * (0.7 * expCurve + 0.3 * ripple);
            // Width varies exponentially toward middle for a natural taper
            const w = thickness * (0.65 + 0.35 * Math.exp(-kW * Math.abs(s)));
            const x = Math.max(0, Math.floor(cx - w / 2));
            const y = Math.max(0, Math.floor(t * H - stepH * 0.6));
            const h = Math.min(H - y, Math.floor(stepH * 1.3));
            gameState.worldObjects.push({
                ...GAME_CONFIG.worldObjects.water,
                x,
                y,
                width: Math.floor(Math.min(w, W - x)),
                height: h
            });
        }
    } else {
        // Single, natural-shaped central lake without islands
        const W = GAME_CONFIG.world.width;
        const H = GAME_CONFIG.world.height;
        const cx = W / 2;
        const cy = H / 2;
        // Base radii for an ellipse, sized to be a big central lake
        const baseRx = Math.min(W, H) * 0.24;
        const baseRy = Math.min(W, H) * 0.18;
        // Scanline step for y; smaller values = smoother outline
        const stepY = 12;
        for (let y = Math.max(0, Math.floor(cy - baseRy)); y <= Math.min(H - 1, Math.ceil(cy + baseRy)); y += stepY) {
            const dy = (y - cy) / baseRy; // -1..1
            const bandFactor = Math.max(0, 1 - dy * dy); // 0..1
            // Gentle width modulation for organic edges
            const mod = 1 + 0.08 * Math.sin((y / H) * Math.PI * 4) + 0.05 * Math.cos((y / H) * Math.PI * 3.2);
            const rx = baseRx * mod;
            const halfWidth = Math.sqrt(Math.max(0, bandFactor)) * rx;
            if (halfWidth <= 2) continue;
            const x0 = Math.max(0, Math.floor(cx - halfWidth));
            const x1 = Math.min(W - 1, Math.ceil(cx + halfWidth));
            const w = Math.max(1, x1 - x0);
            gameState.worldObjects.push({
                ...GAME_CONFIG.worldObjects.lake,
                x: x0,
                y: Math.max(0, Math.floor(y - stepY * 0.5)),
                width: w,
                height: Math.min(H - Math.max(0, Math.floor(y - stepY * 0.5)), Math.ceil(stepY * 1.1))
            });
        }
        // Add a continuous channel connecting the lake to the bottom edge near the center
        const channelStartY = Math.min(H - 1, Math.ceil(cy + baseRy * 0.4));
        let y = channelStartY;
        const segH = 18; // vertical segment height
        while (y < H) {
            const t = (y - channelStartY) / Math.max(1, H - channelStartY);
            // Slight taper/wobble for more natural look
            const wobble = Math.sin(t * Math.PI * 2.2) * 0.06 + Math.cos(t * Math.PI * 1.7) * 0.04;
            const channelHalf = Math.max(50, Math.floor(baseRx * (0.25 + 0.15 * (1 - t) + wobble)));
            const x0 = Math.max(0, Math.floor(cx - channelHalf));
            const w = Math.min(W - x0, channelHalf * 2);
            gameState.worldObjects.push({
                ...GAME_CONFIG.worldObjects.lake,
                x: x0,
                y: y,
                width: w,
                height: Math.min(segH, H - y)
            });
            y += segH;
        }
    }
    // Scatter resources globally across valid land (avoids water/buildings/units)
    scatterResourcesAcrossWorld();
    // Scatter environmental decorations (bushes/trees) with similar rules
    if (typeof scatterDecorationsAcrossWorld === 'function') {
        scatterDecorationsAcrossWorld({ count: 90 });
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
            isSelected: false,
            // Initialize animation state for immediate rendering
            anim: { action: 'idle', direction: 'down', frame: 0, elapsed: 0 },
            prevX: spawnPosition.x,
            prevY: spawnPosition.y
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
            isSelected: false,
            anim: { action: 'idle', direction: 'down', frame: 0, elapsed: 0 },
            prevX: centerX + 50,
            prevY: centerY + 50
        });
    }
}

function clampCameraToBounds() {
    gameState.camera.x = Math.max(0, Math.min(GAME_CONFIG.world.width - GAME_CONFIG.canvas.width, gameState.camera.x || 0));
    gameState.camera.y = Math.max(0, Math.min(GAME_CONFIG.world.height - GAME_CONFIG.canvas.height, gameState.camera.y || 0));
}
