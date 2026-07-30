// ============================================================
// Fog of War System
// ============================================================

const FogOfWar = (function () {
    const STATE_UNEXPLORED = 0, STATE_EXPLORED = 1, STATE_VISIBLE = 2;
    let grid = null, cols = 0, rows = 0, cellSize = 64, enabled = true;
    let visibleCells = [];
    let fogCanvas = null, fogCtx = null;

    const SIGHT_RANGES = { villager: 7, militia: 6, warrior: 6, axeman: 6, archer: 9, crossbowman: 9, catapult: 7, ballista: 8, fishingBoat: 6, transportLarge: 6, warship: 8 };
    const BUILDING_SIGHT = { 'town-center': 12, 'house': 4, 'barracks': 6, 'archeryRange': 6, 'craftery': 6, 'navy': 6 };

    function init(worldWidth, worldHeight) {
        cols = Math.ceil(worldWidth / cellSize); rows = Math.ceil(worldHeight / cellSize);
        grid = Array(rows).fill().map(() => new Uint8Array(cols));
        visibleCells = [];
        fogCanvas = null; fogCtx = null;
    }

    function ensureFogCanvas(viewWidth, viewHeight) {
        if (!fogCanvas || fogCanvas.width !== viewWidth || fogCanvas.height !== viewHeight) {
            fogCanvas = document.createElement('canvas'); fogCanvas.width = viewWidth; fogCanvas.height = viewHeight;
            fogCtx = fogCanvas.getContext('2d');
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

        const startCol = Math.max(0, Math.floor(camera.x / cellSize) - 1), endCol = Math.min(cols - 1, Math.ceil((camera.x + viewW) / cellSize) + 1);
        const startRow = Math.max(0, Math.floor(camera.y / cellSize) - 1), endRow = Math.min(rows - 1, Math.ceil((camera.y + viewH) / cellSize) + 1);

        for (let r = startRow; r <= endRow; r++) {
            for (let c = startCol; c <= endCol; c++) {
                const state = grid[r][c];
                if (state === STATE_VISIBLE) continue;
                fogCtx.fillStyle = state === STATE_UNEXPLORED ? 'rgba(0, 0, 0, 1.0)' : 'rgba(0, 0, 0, 0.7)';
                fogCtx.fillRect(c * cellSize - camera.x - 1, r * cellSize - camera.y - 1, cellSize + 2, cellSize + 2);
            }
        }
        ctx.save(); ctx.globalAlpha = 1; ctx.drawImage(fogCanvas, 0, 0); ctx.restore();
    }

    return { init, update, draw, getState, isVisible: (x, y) => getState(x, y) === STATE_VISIBLE, isExplored: (x, y) => getState(x, y) >= STATE_EXPLORED, setEnabled: (v) => enabled = !!v, isEnabled: () => enabled };
})();
