// ============================================================
// Fog of War System
// ============================================================

const FogOfWar = (function () {
    const STATE_UNEXPLORED = 0, STATE_EXPLORED = 1, STATE_VISIBLE = 2;
    let grid = null, cols = 0, rows = 0, cellSize = 64, enabled = true;
    let worldWidth = 0, worldHeight = 0;
    let visibleCells = [];
    let fogCanvas = null, fogCtx = null;
    let visibleMaskCanvas = null, visibleMaskCtx = null;
    let exploredWorldCanvas = null, exploredWorldCtx = null;

    const SIGHT_RANGES = { villager: 7, militia: 6, warrior: 6, axeman: 6, archer: 9, crossbowman: 9, catapult: 7, ballista: 8, fishingBoat: 6, transportLarge: 6, warship: 8 };
    const BUILDING_SIGHT = { 'town-center': 12, 'house': 4, 'barracks': 6, 'archeryRange': 6, 'craftery': 6, 'navy': 6 };
    const VISIBLE_EDGE_FEATHER = 210;
    const VISIBLE_EDGE_NOISE = 190;
    const VISIBLE_MASK_SCALE = 1 / 5;
    const EXPLORED_EDGE_BLUR = 28;
    const EXPLORED_FOG_ALPHA = 0.5;
    const EXPLORED_CLEAR_ALPHA = 1 - EXPLORED_FOG_ALPHA;
    const EXPLORED_MASK_SCALE = 1 / 16;

    function init(mapWidth, mapHeight) {
        worldWidth = mapWidth;
        worldHeight = mapHeight;
        cols = Math.ceil(worldWidth / cellSize); rows = Math.ceil(worldHeight / cellSize);
        grid = Array(rows).fill().map(() => new Uint8Array(cols));
        visibleCells = [];
        fogCanvas = null; fogCtx = null;
        visibleMaskCanvas = null; visibleMaskCtx = null;
        exploredWorldCanvas = null; exploredWorldCtx = null;
        ensureExploredWorldCanvas();
    }

    function ensureFogCanvas(viewWidth, viewHeight) {
        const maskWidth = Math.max(1, Math.ceil(viewWidth * VISIBLE_MASK_SCALE));
        const maskHeight = Math.max(1, Math.ceil(viewHeight * VISIBLE_MASK_SCALE));
        if (!fogCanvas || fogCanvas.width !== viewWidth || fogCanvas.height !== viewHeight) {
            fogCanvas = document.createElement('canvas'); fogCanvas.width = viewWidth; fogCanvas.height = viewHeight;
            fogCtx = fogCanvas.getContext('2d');
        }
        if (!visibleMaskCanvas || visibleMaskCanvas.width !== maskWidth || visibleMaskCanvas.height !== maskHeight) {
            visibleMaskCanvas = document.createElement('canvas'); visibleMaskCanvas.width = maskWidth; visibleMaskCanvas.height = maskHeight;
            visibleMaskCtx = visibleMaskCanvas.getContext('2d');
        }
    }

    function ensureExploredWorldCanvas() {
        const width = Math.max(1, Math.ceil(worldWidth * EXPLORED_MASK_SCALE));
        const height = Math.max(1, Math.ceil(worldHeight * EXPLORED_MASK_SCALE));
        if (!exploredWorldCanvas || exploredWorldCanvas.width !== width || exploredWorldCanvas.height !== height) {
            exploredWorldCanvas = document.createElement('canvas');
            exploredWorldCanvas.width = width;
            exploredWorldCanvas.height = height;
            exploredWorldCtx = exploredWorldCanvas.getContext('2d');
        }
    }

    function smoothstep(value) {
        return value * value * (3 - 2 * value);
    }

    function cloudEdgeNoise(worldX, worldY, time) {
        const t = time * 0.000035;
        return (
            Math.sin(worldX * 0.0065 + worldY * 0.0032 + t * 1.4) * 0.34 +
            Math.sin(worldX * -0.0044 + worldY * 0.0105 - t * 1.1) * 0.28 +
            Math.sin(worldX * 0.014 + worldY * -0.0085 + t * 0.8) * 0.22 +
            Math.sin(worldX * -0.022 + worldY * -0.015 + t * 0.55) * 0.16
        );
    }

    function revealCircle(cx, cy, radius) {
        const cellCX = Math.floor(cx / cellSize), cellCY = Math.floor(cy / cellSize), r = Math.ceil(radius);
        for (let dy = -r; dy <= r; dy++) {
            for (let dx = -r; dx <= r; dx++) {
                if (dx * dx + dy * dy > r * r) continue;
                const gx = cellCX + dx, gy = cellCY + dy;
                if (gx >= 0 && gy >= 0 && gx < cols && gy < rows) {
                    if (grid[gy][gx] !== STATE_VISIBLE) visibleCells.push(gy * cols + gx);
                    grid[gy][gx] = STATE_VISIBLE;
                }
            }
        }
    }

    function paintExploredSource(source) {
        ensureExploredWorldCanvas();
        const scale = EXPLORED_MASK_SCALE;
        const radius = (source.range * cellSize + cellSize * 0.5) * scale;
        exploredWorldCtx.save();
        exploredWorldCtx.fillStyle = '#fff';
        exploredWorldCtx.beginPath();
        exploredWorldCtx.arc(source.x * scale, source.y * scale, radius, 0, Math.PI * 2);
        exploredWorldCtx.fill();
        exploredWorldCtx.restore();
    }

    function update() {
        if (!grid || !enabled) return;
        for (const index of visibleCells) {
            const r = (index / cols) | 0;
            const c = index % cols;
            if (grid[r] && grid[r][c] === STATE_VISIBLE) grid[r][c] = STATE_EXPLORED;
        }
        visibleCells = [];
        for (const source of getVisionSources()) {
            revealCircle(source.x, source.y, source.range);
            paintExploredSource(source);
        }
    }

    function getVisionSources() {
        const sources = [];
        for (const unit of gameState.units || []) {
            if (unit.health <= 0) continue;
            sources.push({
                x: unit.x,
                y: unit.y,
                range: SIGHT_RANGES[unit.type] || 6
            });
        }
        for (const building of gameState.buildings || []) {
            if (building.player !== 'player') continue;
            const x = building.x + building.width / 2;
            const y = building.y + building.height / 2;
            sources.push({
                x,
                y,
                range: BUILDING_SIGHT[building.type] || 5
            });
        }
        return sources;
    }

    function getState(worldX, worldY) {
        if (!grid || !enabled) return STATE_VISIBLE;
        const c = Math.floor(worldX / cellSize), r = Math.floor(worldY / cellSize);
        return (c >= 0 && r >= 0 && c < cols && r < rows) ? grid[r][c] : STATE_UNEXPLORED;
    }

    function draw(ctx, camera) {
        if (!grid || !enabled) return;
        const zoom = gameState.zoomLevel || 1;
        const viewW = Math.ceil(GAME_CONFIG.canvas.width / zoom);
        const viewH = Math.ceil(GAME_CONFIG.canvas.height / zoom);
        ensureFogCanvas(viewW, viewH);
        fogCtx.clearRect(0, 0, viewW, viewH);
        fogCtx.fillStyle = 'rgba(0, 0, 0, 1)';
        fogCtx.fillRect(0, 0, viewW, viewH);
        drawExploredShadow(camera, viewW, viewH);
        drawVisibleCutouts(camera, viewW, viewH);

        ctx.save();
        const previousSmoothing = ctx.imageSmoothingEnabled;
        ctx.globalAlpha = 1;
        ctx.imageSmoothingEnabled = true;
        ctx.drawImage(fogCanvas, 0, 0);
        ctx.imageSmoothingEnabled = previousSmoothing;
        ctx.restore();
    }

    function drawExploredShadow(camera, viewW, viewH) {
        ensureExploredWorldCanvas();
        const scale = EXPLORED_MASK_SCALE;
        const padding = Math.ceil(EXPLORED_EDGE_BLUR * scale) + 3;
        const sourceX = Math.max(0, Math.floor(camera.x * scale) - padding);
        const sourceY = Math.max(0, Math.floor(camera.y * scale) - padding);
        const sourceRight = Math.min(exploredWorldCanvas.width, Math.ceil((camera.x + viewW) * scale) + padding);
        const sourceBottom = Math.min(exploredWorldCanvas.height, Math.ceil((camera.y + viewH) * scale) + padding);
        const sourceW = sourceRight - sourceX;
        const sourceH = sourceBottom - sourceY;
        if (sourceW <= 0 || sourceH <= 0) return;

        fogCtx.save();
        fogCtx.globalCompositeOperation = 'destination-out';
        fogCtx.globalAlpha = EXPLORED_CLEAR_ALPHA;
        fogCtx.filter = `blur(${EXPLORED_EDGE_BLUR}px)`;
        fogCtx.imageSmoothingEnabled = true;
        fogCtx.drawImage(
            exploredWorldCanvas,
            sourceX,
            sourceY,
            sourceW,
            sourceH,
            sourceX / scale - camera.x,
            sourceY / scale - camera.y,
            sourceW / scale,
            sourceH / scale
        );
        fogCtx.restore();
    }

    function drawVisibleCutouts(camera, viewW, viewH) {
        const sources = getVisionSources();
        const maskW = visibleMaskCanvas.width;
        const maskH = visibleMaskCanvas.height;
        const imageData = visibleMaskCtx.createImageData(maskW, maskH);
        const data = imageData.data;
        const scale = VISIBLE_MASK_SCALE;
        const time = gameState.gameTime || 0;

        for (const source of sources) {
            const radius = source.range * cellSize + cellSize * 0.5;
            const maxRadius = radius + VISIBLE_EDGE_NOISE;
            const sx = (source.x - camera.x) * scale;
            const sy = (source.y - camera.y) * scale;
            const maxMaskRadius = maxRadius * scale;
            if (sx < -maxMaskRadius || sy < -maxMaskRadius || sx > maskW + maxMaskRadius || sy > maskH + maxMaskRadius) continue;
            const startX = Math.max(0, Math.floor(sx - maxMaskRadius));
            const endX = Math.min(maskW - 1, Math.ceil(sx + maxMaskRadius));
            const startY = Math.max(0, Math.floor(sy - maxMaskRadius));
            const endY = Math.min(maskH - 1, Math.ceil(sy + maxMaskRadius));

            for (let y = startY; y <= endY; y++) {
                const worldY = camera.y + (y + 0.5) / scale;
                const dy = worldY - source.y;
                for (let x = startX; x <= endX; x++) {
                    const worldX = camera.x + (x + 0.5) / scale;
                    const dx = worldX - source.x;
                    const distance = Math.sqrt(dx * dx + dy * dy);
                    if (distance > maxRadius) continue;
                    const noisyRadius = radius + cloudEdgeNoise(worldX, worldY, time) * VISIBLE_EDGE_NOISE;
                    const rawAlpha = (noisyRadius - distance) / VISIBLE_EDGE_FEATHER;
                    if (rawAlpha <= 0) continue;
                    const alpha = rawAlpha >= 1 ? 1 : smoothstep(rawAlpha);
                    const index = (y * maskW + x) * 4;
                    const alphaByte = Math.round(alpha * 255);
                    if (alphaByte <= data[index + 3]) continue;
                    data[index] = 255;
                    data[index + 1] = 255;
                    data[index + 2] = 255;
                    data[index + 3] = alphaByte;
                }
            }
        }

        visibleMaskCtx.putImageData(imageData, 0, 0);

        fogCtx.save();
        fogCtx.globalCompositeOperation = 'destination-out';
        fogCtx.imageSmoothingEnabled = true;
        fogCtx.drawImage(visibleMaskCanvas, 0, 0, viewW, viewH);
        fogCtx.restore();
    }

    return { init, update, draw, getState, isVisible: (x, y) => getState(x, y) === STATE_VISIBLE, isExplored: (x, y) => getState(x, y) >= STATE_EXPLORED, setEnabled: (v) => enabled = !!v, isEnabled: () => enabled };
})();
