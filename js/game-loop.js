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
    updateUnitAnimations();
    checkWinConditions();
    const canvas = document.getElementById('gameCanvas');
    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, GAME_CONFIG.canvas.width, GAME_CONFIG.canvas.height);

    if (tilemap) {
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
    if (gameState.keys['w']) {
        gameState.camera.y = Math.max(0, gameState.camera.y - cameraSpeed);
    }
    if (gameState.keys['s']) {
        gameState.camera.y = Math.min(GAME_CONFIG.world.height - GAME_CONFIG.canvas.height,
                                     gameState.camera.y + cameraSpeed);
    }
    if (gameState.keys['a']) {
        gameState.camera.x = Math.max(0, gameState.camera.x - cameraSpeed);
    }
    if (gameState.keys['d']) {
        gameState.camera.x = Math.min(GAME_CONFIG.world.width - GAME_CONFIG.canvas.width,
                                     gameState.camera.x + cameraSpeed);
    }
}
