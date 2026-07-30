// ============================================================
// Fog of War System
// ============================================================

const FogOfWar = (function () {
    const STATE_UNEXPLORED = 0, STATE_EXPLORED = 1, STATE_VISIBLE = 2;
    let grid = null, cols = 0, rows = 0, cellSize = 64, enabled = true;
    let visibleCells = [];
    let fogCanvas = null, fogCtx = null;
    let exploredMaskCanvas = null, exploredMaskCtx = null;

    const SIGHT_RANGES = { villager: 7, militia: 6, warrior: 6, axeman: 6, archer: 9, crossbowman: 9, catapult: 7, ballista: 8, fishingBoat: 6, transportLarge: 6, warship: 8 };
    const BUILDING_SIGHT = { 'town-center': 12, 'house': 4, 'barracks': 6, 'archeryRange': 6, 'craftery': 6, 'navy': 6 };
    const VISIBLE_EDGE_FEATHER = 120;
    const EXPLORED_EDGE_BLUR = 56;
    const EXPLORED_CLEAR_ALPHA = 0.32;

    function init(worldWidth, worldHeight) {
        cols = Math.ceil(worldWidth / cellSize); rows = Math.ceil(worldHeight / cellSize);
        grid = Array(rows).fill().map(() => new Uint8Array(cols));
        visibleCells = [];
        fogCanvas = null; fogCtx = null;
        exploredMaskCanvas = null; exploredMaskCtx = null;
    }

    function ensureFogCanvas(viewWidth, viewHeight) {
        if (!fogCanvas || !exploredMaskCanvas || fogCanvas.width !== viewWidth || fogCanvas.height !== viewHeight) {
            fogCanvas = document.createElement('canvas'); fogCanvas.width = viewWidth; fogCanvas.height = viewHeight;
            fogCtx = fogCanvas.getContext('2d');
            exploredMaskCanvas = document.createElement('canvas'); exploredMaskCanvas.width = viewWidth; exploredMaskCanvas.height = viewHeight;
            exploredMaskCtx = exploredMaskCanvas.getContext('2d');
        }
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

    function update() {
        if (!grid || !enabled) return;
        for (const index of visibleCells) {
            const r = (index / cols) | 0;
            const c = index % cols;
            if (grid[r] && grid[r][c] === STATE_VISIBLE) grid[r][c] = STATE_EXPLORED;
        }
        visibleCells = [];
        for (const unit of gameState.units) revealCircle(unit.x, unit.y, SIGHT_RANGES[unit.type] || 6);
        for (const building of gameState.buildings) if (building.player === 'player') revealCircle(building.x + building.width/2, building.y + building.height/2, BUILDING_SIGHT[building.type] || 5);
    }

    function getVisionSources() {
        const sources = [];
        for (const unit of gameState.units) {
            if (unit.health <= 0) continue;
            sources.push({ x: unit.x, y: unit.y, range: SIGHT_RANGES[unit.type] || 6 });
        }
        for (const building of gameState.buildings) {
            if (building.player !== 'player') continue;
            sources.push({
                x: building.x + building.width / 2,
                y: building.y + building.height / 2,
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
        exploredMaskCtx.clearRect(0, 0, viewW, viewH);

        const startCol = Math.max(0, Math.floor(camera.x / cellSize) - 1), endCol = Math.min(cols - 1, Math.ceil((camera.x + viewW) / cellSize) + 1);
        const startRow = Math.max(0, Math.floor(camera.y / cellSize) - 1), endRow = Math.min(rows - 1, Math.ceil((camera.y + viewH) / cellSize) + 1);

        exploredMaskCtx.fillStyle = `rgba(0, 0, 0, ${EXPLORED_CLEAR_ALPHA})`;
        for (let r = startRow; r <= endRow; r++) {
            for (let c = startCol; c <= endCol; c++) {
                const state = grid[r][c];
                if (state !== STATE_EXPLORED) continue;
                exploredMaskCtx.fillRect(c * cellSize - camera.x - 3, r * cellSize - camera.y - 3, cellSize + 6, cellSize + 6);
            }
        }

        fogCtx.save();
        fogCtx.globalCompositeOperation = 'destination-out';
        fogCtx.filter = `blur(${EXPLORED_EDGE_BLUR}px)`;
        fogCtx.drawImage(exploredMaskCanvas, 0, 0);
        fogCtx.restore();

        fogCtx.save();
        fogCtx.globalCompositeOperation = 'destination-out';
        for (const source of getVisionSources()) {
            const radius = source.range * cellSize + cellSize * 0.5;
            const sx = source.x - camera.x;
            const sy = source.y - camera.y;
            if (sx < -radius || sy < -radius || sx > viewW + radius || sy > viewH + radius) continue;
            const innerRadius = Math.max(0, radius - VISIBLE_EDGE_FEATHER);
            const gradient = fogCtx.createRadialGradient(sx, sy, innerRadius, sx, sy, radius);
            gradient.addColorStop(0, 'rgba(0, 0, 0, 1)');
            gradient.addColorStop(0.72, 'rgba(0, 0, 0, 1)');
            gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
            fogCtx.fillStyle = gradient;
            fogCtx.beginPath();
            fogCtx.arc(sx, sy, radius, 0, Math.PI * 2);
            fogCtx.fill();
        }
        fogCtx.restore();

        ctx.save();
        const previousSmoothing = ctx.imageSmoothingEnabled;
        ctx.globalAlpha = 1;
        ctx.imageSmoothingEnabled = true;
        ctx.drawImage(fogCanvas, 0, 0);
        ctx.imageSmoothingEnabled = previousSmoothing;
        ctx.restore();
    }

    return { init, update, draw, getState, isVisible: (x, y) => getState(x, y) === STATE_VISIBLE, isExplored: (x, y) => getState(x, y) >= STATE_EXPLORED, setEnabled: (v) => enabled = !!v, isEnabled: () => enabled };
})();
