/**
 * Main game loop that runs at 60fps using requestAnimationFrame. Handles delta time
 * calculation, input processing, game state updates, and rendering pipeline. Manages
 * camera position snapping, unit animation updates, and conditional tilemap rendering.
 */
function gameLoop() {
    const now = Date.now();
    const deltaTime = now - gameState.lastUpdate;
    gameState.lastUpdate = now;
    handleInput();
    gameState.camera.x = Math.round(gameState.camera.x || 0);
    gameState.camera.y = Math.round(gameState.camera.y || 0);
    updateUnits(deltaTime);
    if (typeof ProjectileSystem !== 'undefined') {
        ProjectileSystem.update(deltaTime);
    }
    if (typeof ParticleSystem !== 'undefined') {
        ParticleSystem.update(deltaTime);
    }
    if (typeof FogOfWar !== 'undefined') {
        FogOfWar.update();
    }
    if (typeof AIManager !== 'undefined') {
        AIManager.tick(deltaTime);
    }
    if (tilemap && typeof tilemap.tickWaterAnimation === 'function') {
        tilemap.tickWaterAnimation(deltaTime);
    }
    updateUnitAnimations();
    checkWinConditions();
    const canvas = document.getElementById('gameCanvas');
    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, GAME_CONFIG.canvas.width, GAME_CONFIG.canvas.height);

    // Apply camera zoom
    const zoom = gameState.zoomLevel || 1.0;
    ctx.scale(zoom, zoom);

    if (tilemap) {
        tilemap.tickWaterAnimation(deltaTime);
        tilemap.draw(ctx, gameState.camera);
    } else {
        const gradient = ctx.createLinearGradient(0, 0, GAME_CONFIG.canvas.width, GAME_CONFIG.canvas.height);
        gradient.addColorStop(0, '#2a8f52');
        gradient.addColorStop(1, '#1e6b3d');
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, GAME_CONFIG.canvas.width, GAME_CONFIG.canvas.height);
    }
    drawWorldObjects(ctx);
    drawBuildings(ctx);
    drawUnits(ctx);
    if (typeof ProjectileSystem !== 'undefined') {
        ProjectileSystem.draw(ctx, gameState.camera);
    }
    if (typeof ParticleSystem !== 'undefined') {
        ParticleSystem.draw(ctx, gameState.camera);
    }
    if (typeof FogOfWar !== 'undefined') {
        FogOfWar.draw(ctx, gameState.camera);
    }
    drawPlacingBuilding(ctx);
    drawMinimap();
    updateUI();
    updateTrainingQueueUI();
    if (!gameState.gameOver) {
        requestAnimationFrame(gameLoop);
    }
}

/**
 * Processes WASD camera movement input with bounds checking. Updates camera position
 * based on currently pressed keys, enforcing world boundaries to prevent camera from
 * moving outside the playable area. Uses configurable camera speed for smooth movement.
 */
function handleInput() {
    const cameraSpeed = 10;
    const zoom = gameState.zoomLevel || 1;
    const visibleWidth = GAME_CONFIG.canvas.width / zoom;
    const visibleHeight = GAME_CONFIG.canvas.height / zoom;
    const maxX = Math.max(0, GAME_CONFIG.world.width - visibleWidth);
    const maxY = Math.max(0, GAME_CONFIG.world.height - visibleHeight);

    if (gameState.keys['w']) {
        gameState.camera.y = Math.max(0, gameState.camera.y - cameraSpeed);
    }
    if (gameState.keys['s']) {
        gameState.camera.y = Math.min(maxY, gameState.camera.y + cameraSpeed);
    }
    if (gameState.keys['a']) {
        gameState.camera.x = Math.max(0, gameState.camera.x - cameraSpeed);
    }
    if (gameState.keys['d']) {
        gameState.camera.x = Math.min(maxX, gameState.camera.x + cameraSpeed);
    }
}
