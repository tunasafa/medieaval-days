// ============================================================
// Fog of War System
// ============================================================

const FogOfWar = (function () {
    const STATE_UNEXPLORED = 0, STATE_EXPLORED = 1, STATE_VISIBLE = 2;
    let grid = null, cols = 0, rows = 0, cellSize = 64, enabled = true;
    let worldWidth = 0, worldHeight = 0;
    let visibleCells = [];
    let fogCanvas = null, fogCtx = null;
    let exploredWorldCanvas = null, exploredWorldCtx = null;

    const SIGHT_RANGES = { villager: 7, militia: 6, warrior: 6, axeman: 6, archer: 9, crossbowman: 9, catapult: 7, ballista: 8, fishingBoat: 6, transportLarge: 6, warship: 8 };
    const BUILDING_SIGHT = { 'town-center': 12, 'house': 4, 'barracks': 6, 'archeryRange': 6, 'craftery': 6, 'navy': 6 };
    const VISIBLE_EDGE_BLUR = 34;
    const VISIBLE_CORE_INSET = 82;
    const EXPLORED_EDGE_BLUR = 28;
    const EXPLORED_FOG_ALPHA = 0.5;
    const EXPLORED_CLEAR_ALPHA = 1 - EXPLORED_FOG_ALPHA;
    const EXPLORED_MASK_SCALE = 1 / 16;
    const FOG_EDGE_POINTS = 52;

    function init(mapWidth, mapHeight) {
        worldWidth = mapWidth;
        worldHeight = mapHeight;
        cols = Math.ceil(worldWidth / cellSize); rows = Math.ceil(worldHeight / cellSize);
        grid = Array(rows).fill().map(() => new Uint8Array(cols));
        visibleCells = [];
        fogCanvas = null; fogCtx = null;
        exploredWorldCanvas = null; exploredWorldCtx = null;
        ensureExploredWorldCanvas();
    }

    function ensureFogCanvas(viewWidth, viewHeight) {
        if (!fogCanvas || fogCanvas.width !== viewWidth || fogCanvas.height !== viewHeight) {
            fogCanvas = document.createElement('canvas'); fogCanvas.width = viewWidth; fogCanvas.height = viewHeight;
            fogCtx = fogCanvas.getContext('2d');
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

    function hashString(value) {
        const text = String(value);
        let hash = 2166136261;
        for (let i = 0; i < text.length; i++) {
            hash ^= text.charCodeAt(i);
            hash = Math.imul(hash, 16777619);
        }
        return hash >>> 0;
    }

    function seededNoise(seed, index) {
        let value = (seed + Math.imul(index + 1, 0x9E3779B9)) >>> 0;
        value = Math.imul(value ^ (value >>> 15), value | 1);
        value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
        return ((value ^ (value >>> 14)) >>> 0) / 4294967295;
    }

    function sourceSeed(entity, prefix, x, y) {
        if (entity.id) return hashString(`${prefix}:${entity.id}`);
        return hashString(`${prefix}:${entity.type}:${Math.round(x / cellSize)}:${Math.round(y / cellSize)}`);
    }

    function buildIrregularBlobPath(context, x, y, radius, seed, jitter) {
        const points = [];
        const seedPhaseA = (seed % 1000) * 0.0063;
        const seedPhaseB = (seed % 791) * 0.0091;
        for (let i = 0; i < FOG_EDGE_POINTS; i++) {
            const angle = (i / FOG_EDGE_POINTS) * Math.PI * 2;
            const longWave = Math.sin(angle * 3 + seedPhaseA) * jitter * 0.46;
            const midWave = Math.sin(angle * 7 + seedPhaseB) * jitter * 0.28;
            const speckle = (seededNoise(seed, i) - 0.5) * jitter * 0.68;
            const multiplier = Math.max(0.78, Math.min(1.22, 1 + longWave + midWave + speckle));
            const localRadius = radius * multiplier;
            points.push({
                x: x + Math.cos(angle) * localRadius,
                y: y + Math.sin(angle) * localRadius
            });
        }

        const first = points[0];
        const last = points[points.length - 1];
        context.beginPath();
        context.moveTo((first.x + last.x) / 2, (first.y + last.y) / 2);
        for (let i = 0; i < points.length; i++) {
            const current = points[i];
            const next = points[(i + 1) % points.length];
            context.quadraticCurveTo(current.x, current.y, (current.x + next.x) / 2, (current.y + next.y) / 2);
        }
        context.closePath();
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
        buildIrregularBlobPath(exploredWorldCtx, source.x * scale, source.y * scale, radius, source.seed, 0.16);
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
                range: SIGHT_RANGES[unit.type] || 6,
                seed: sourceSeed(unit, 'unit', unit.x, unit.y)
            });
        }
        for (const building of gameState.buildings || []) {
            if (building.player !== 'player') continue;
            const x = building.x + building.width / 2;
            const y = building.y + building.height / 2;
            sources.push({
                x,
                y,
                range: BUILDING_SIGHT[building.type] || 5,
                seed: sourceSeed(building, 'building', x, y)
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
        fogCtx.save();
        fogCtx.globalCompositeOperation = 'destination-out';
        fogCtx.filter = `blur(${VISIBLE_EDGE_BLUR}px)`;
        fogCtx.fillStyle = 'rgba(0, 0, 0, 1)';
        for (const source of sources) {
            const radius = source.range * cellSize + cellSize * 0.5;
            const sx = source.x - camera.x;
            const sy = source.y - camera.y;
            if (sx < -radius || sy < -radius || sx > viewW + radius || sy > viewH + radius) continue;
            buildIrregularBlobPath(fogCtx, sx, sy, Math.max(0, radius - VISIBLE_EDGE_BLUR), source.seed, 0.23);
            fogCtx.fill();
        }
        fogCtx.restore();

        fogCtx.save();
        fogCtx.globalCompositeOperation = 'destination-out';
        fogCtx.fillStyle = 'rgba(0, 0, 0, 1)';
        for (const source of sources) {
            const radius = source.range * cellSize + cellSize * 0.5;
            const sx = source.x - camera.x;
            const sy = source.y - camera.y;
            if (sx < -radius || sy < -radius || sx > viewW + radius || sy > viewH + radius) continue;
            buildIrregularBlobPath(fogCtx, sx, sy, Math.max(0, radius - VISIBLE_CORE_INSET), source.seed + 97, 0.16);
            fogCtx.fill();
        }
        fogCtx.restore();
    }

    return { init, update, draw, getState, isVisible: (x, y) => getState(x, y) === STATE_VISIBLE, isExplored: (x, y) => getState(x, y) >= STATE_EXPLORED, setEnabled: (v) => enabled = !!v, isEnabled: () => enabled };
})();
