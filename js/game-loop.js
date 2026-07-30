/**
 * Main game loop that runs at 60fps using requestAnimationFrame. Handles delta time
 * calculation, input processing, game state updates, and rendering pipeline. Manages
 * camera position snapping, unit animation updates, and conditional tilemap rendering.
 */
function gameLoop() {
    const now = Date.now();
    const rawDeltaTime = now - gameState.lastUpdate;
    gameState.lastUpdate = now;
    const uiPaused = !!gameState.ui?.modalOpen;
    // Multiplayer client skips all simulation — state comes from host snapshots
    const isClientMP = typeof Multiplayer !== 'undefined' && Multiplayer.isClient;
    const deltaTime = (uiPaused || isClientMP) ? 0 : rawDeltaTime;
    if (!uiPaused) {
        if (!isClientMP) {
            gameState.gameTime = (gameState.gameTime || 0) + deltaTime;
        }
        handleInput(); // Camera movement still runs on client
    }
    gameState.camera.x = Math.round(gameState.camera.x || 0);
    gameState.camera.y = Math.round(gameState.camera.y || 0);
    if (!uiPaused && !isClientMP && typeof updateResearchQueues === 'function') {
        updateResearchQueues(deltaTime);
    }
    if (!uiPaused && !isClientMP) updateUnits(deltaTime);
    if (!uiPaused && !isClientMP && typeof ProjectileSystem !== 'undefined') {
        ProjectileSystem.update(deltaTime);
    }
    if (!uiPaused && !isClientMP && typeof ParticleSystem !== 'undefined') {
        ParticleSystem.update(deltaTime);
    }
    if (!uiPaused && !isClientMP && typeof FogOfWar !== 'undefined') {
        FogOfWar.update();
    }
    if (!uiPaused && !isClientMP && typeof AIManager !== 'undefined') {
        AIManager.tick(deltaTime);
    }
    if (!uiPaused && tilemap && typeof tilemap.tickWaterAnimation === 'function') {
        tilemap.tickWaterAnimation(deltaTime);
    }
    if (!uiPaused && !isClientMP) checkWinConditions();
    const canvas = document.getElementById('gameCanvas');
    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, GAME_CONFIG.canvas.width, GAME_CONFIG.canvas.height);

    // Apply camera zoom
    const zoom = gameState.zoomLevel || 1.0;
    ctx.scale(zoom, zoom);

    // Apply screen shake
    if (gameState.camera.shakeTime > 0) {
        const shake = gameState.camera.shakeIntensity || 5;
        ctx.translate((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake);
        gameState.camera.shakeTime -= deltaTime;
    }

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
    if (typeof updateTimedUI === 'function') {
        updateTimedUI(deltaTime);
    }
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
    const edgeSpeed = 12;
    const edgeSize = 20;
    const zoom = gameState.zoomLevel || 1;
    const visibleWidth = GAME_CONFIG.canvas.width / zoom;
    const visibleHeight = GAME_CONFIG.canvas.height / zoom;
    const maxX = Math.max(0, GAME_CONFIG.world.width - visibleWidth);
    const maxY = Math.max(0, GAME_CONFIG.world.height - visibleHeight);
    let moveX = 0;
    let moveY = 0;

    if (gameState.keys['w']) {
        moveY -= cameraSpeed;
    }
    if (gameState.keys['s']) {
        moveY += cameraSpeed;
    }
    if (gameState.keys['a']) {
        moveX -= cameraSpeed;
    }
    if (gameState.keys['d']) {
        moveX += cameraSpeed;
    }

    const edgeEnabled = gameState.settings?.edgeScrolling &&
        gameState.input?.mouseInsideWindow &&
        !gameState.ui?.modalOpen;
    if (edgeEnabled) {
        if (gameState.input.mouseX < edgeSize) moveX -= edgeSpeed;
        else if (gameState.input.mouseX > window.innerWidth - edgeSize) moveX += edgeSpeed;
        if (gameState.input.mouseY < edgeSize) moveY -= edgeSpeed;
        else if (gameState.input.mouseY > window.innerHeight - edgeSize) moveY += edgeSpeed;
    }

    if (moveX || moveY) {
        gameState.camera.x = Math.max(0, Math.min(maxX, gameState.camera.x + moveX));
        gameState.camera.y = Math.max(0, Math.min(maxY, gameState.camera.y + moveY));
    }
}
