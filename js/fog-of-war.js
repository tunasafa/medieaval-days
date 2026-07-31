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
    let visibleStampCache = new Map();
    let lastVisionSignature = '';
    let lastGridUpdateAt = 0;

    const SIGHT_RANGES = { villager: 7, militia: 6, warrior: 6, axeman: 6, archer: 9, crossbowman: 9, catapult: 7, ballista: 8, fishingBoat: 6, transportLarge: 6, warship: 8 };
    const BUILDING_SIGHT = { 'town-center': 12, 'house': 4, 'barracks': 6, 'archeryRange': 6, 'craftery': 6, 'navy': 6 };
    const VISIBLE_EDGE_FEATHER = 210;
    const VISIBLE_EDGE_NOISE = 190;
    const VISIBLE_MASK_SCALE = 1 / 5;
    const EXPLORED_FOG_ALPHA = 0.5;
    const EXPLORED_CLEAR_ALPHA = 1 - EXPLORED_FOG_ALPHA;
    const EXPLORED_MASK_SCALE = 1 / 16;
    const GRID_UPDATE_MIN_MS = 110;
    const STAMP_PHASE_MS = 1600;
    const STAMP_VARIANTS = 8;

    function init(mapWidth, mapHeight) {
        worldWidth = mapWidth;
        worldHeight = mapHeight;
        cols = Math.ceil(worldWidth / cellSize); rows = Math.ceil(worldHeight / cellSize);
        grid = Array(rows).fill().map(() => new Uint8Array(cols));
        visibleCells = [];
        fogCanvas = null; fogCtx = null;
        visibleMaskCanvas = null; visibleMaskCtx = null;
        exploredWorldCanvas = null; exploredWorldCtx = null;
        visibleStampCache = new Map();
        lastVisionSignature = '';
        lastGridUpdateAt = 0;
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

    function sourceSeed(id) {
        const text = String(id ?? '0');
        let hash = 2166136261;
        for (let i = 0; i < text.length; i++) {
            hash ^= text.charCodeAt(i);
            hash = Math.imul(hash, 16777619);
        }
        return Math.abs(hash) % STAMP_VARIANTS;
    }

    function stampNoise(x, y, phase, seed) {
        const s = seed * 37.913;
        return (
            Math.sin(x * 0.0065 + y * 0.0032 + phase * 1.7 + s) * 0.34 +
            Math.sin(x * -0.0044 + y * 0.0105 - phase * 1.1 + s * 0.7) * 0.28 +
            Math.sin(x * 0.014 + y * -0.0085 + phase * 0.8 - s * 0.43) * 0.22 +
            Math.sin(x * -0.022 + y * -0.015 + phase * 0.55 + s * 0.31) * 0.16
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

    function visionSignature(sources) {
        return sources
            .map(source => {
                const cx = Math.floor(source.x / cellSize);
                const cy = Math.floor(source.y / cellSize);
                return `${source.id}:${cx},${cy},${source.range}`;
            })
            .join('|');
    }

    function update() {
        if (!grid || !enabled) return;
        const now = performance.now();
        const sources = getVisionSources();
        const signature = visionSignature(sources);
        if (signature === lastVisionSignature && now - lastGridUpdateAt < GRID_UPDATE_MIN_MS) {
            return;
        }
        lastVisionSignature = signature;
        lastGridUpdateAt = now;

        for (const index of visibleCells) {
            const r = (index / cols) | 0;
            const c = index % cols;
            if (grid[r] && grid[r][c] === STATE_VISIBLE) grid[r][c] = STATE_EXPLORED;
        }
        visibleCells = [];
        for (const source of sources) {
            revealCircle(source.x, source.y, source.range);
            paintExploredSource(source);
        }
    }

    function getVisionSources() {
        const sources = [];
        const owner = typeof getLocalPlayerId === 'function' ? getLocalPlayerId() : 'player';
        const units = typeof getAllUnits === 'function' ? getAllUnits() : (gameState.units || []);
        const buildings = typeof getAllBuildings === 'function' ? getAllBuildings() : (gameState.buildings || []);

        for (const unit of units) {
            if (unit.player !== owner) continue;
            if (unit.health <= 0) continue;
            sources.push({
                id: unit.id,
                x: unit.x,
                y: unit.y,
                range: SIGHT_RANGES[unit.type] || 6,
                seed: sourceSeed(unit.id)
            });
        }
        for (const building of buildings) {
            if (building.player !== owner) continue;
            const x = building.x + building.width / 2;
            const y = building.y + building.height / 2;
            sources.push({
                id: building.id,
                x,
                y,
                range: BUILDING_SIGHT[building.type] || 5,
                seed: sourceSeed(building.id)
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
        const padding = 3;
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

    function getVisibleStamp(range, phase, seed) {
        const radius = range * cellSize + cellSize * 0.5;
        const maxRadius = radius + VISIBLE_EDGE_NOISE;
        const maskRadius = Math.ceil(maxRadius * VISIBLE_MASK_SCALE);
        const size = maskRadius * 2 + 2;
        const key = `${range}|${phase}|${seed}|${size}`;
        if (visibleStampCache.has(key)) return visibleStampCache.get(key);

        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');
        const imageData = ctx.createImageData(size, size);
        const data = imageData.data;
        const center = size / 2;

        for (let y = 0; y < size; y++) {
            const dy = (y + 0.5 - center) / VISIBLE_MASK_SCALE;
            for (let x = 0; x < size; x++) {
                const dx = (x + 0.5 - center) / VISIBLE_MASK_SCALE;
                const distance = Math.sqrt(dx * dx + dy * dy);
                if (distance > maxRadius) continue;
                const noisyRadius = radius + stampNoise(dx, dy, phase, seed) * VISIBLE_EDGE_NOISE;
                const rawAlpha = (noisyRadius - distance) / VISIBLE_EDGE_FEATHER;
                if (rawAlpha <= 0) continue;
                const alpha = rawAlpha >= 1 ? 1 : smoothstep(rawAlpha);
                const index = (y * size + x) * 4;
                data[index] = 255;
                data[index + 1] = 255;
                data[index + 2] = 255;
                data[index + 3] = Math.round(alpha * 255);
            }
        }

        ctx.putImageData(imageData, 0, 0);
        canvas.__maxRadius = maxRadius;
        visibleStampCache.set(key, canvas);
        return canvas;
    }

    function drawVisibleCutouts(camera, viewW, viewH) {
        const sources = getVisionSources();
        const scale = VISIBLE_MASK_SCALE;
        const phase = Math.floor((gameState.gameTime || 0) / STAMP_PHASE_MS) % 4;

        visibleMaskCtx.setTransform(1, 0, 0, 1, 0, 0);
        visibleMaskCtx.clearRect(0, 0, visibleMaskCanvas.width, visibleMaskCanvas.height);
        visibleMaskCtx.globalCompositeOperation = 'lighter';
        for (const source of sources) {
            const stamp = getVisibleStamp(source.range, phase, source.seed || 0);
            const sx = (source.x - camera.x) * scale;
            const sy = (source.y - camera.y) * scale;
            const r = (stamp.__maxRadius || 0) * scale;
            if (sx < -r || sy < -r || sx > visibleMaskCanvas.width + r || sy > visibleMaskCanvas.height + r) continue;
            visibleMaskCtx.drawImage(stamp, sx - stamp.width / 2, sy - stamp.height / 2);
        }
        visibleMaskCtx.globalCompositeOperation = 'source-over';

        fogCtx.save();
        fogCtx.globalCompositeOperation = 'destination-out';
        fogCtx.imageSmoothingEnabled = true;
        fogCtx.drawImage(visibleMaskCanvas, 0, 0, viewW, viewH);
        fogCtx.restore();
    }

    return { init, update, draw, getState, isVisible: (x, y) => getState(x, y) === STATE_VISIBLE, isExplored: (x, y) => getState(x, y) >= STATE_EXPLORED, setEnabled: (v) => enabled = !!v, isEnabled: () => enabled };
})();
