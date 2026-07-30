// Tilemap System for RTS Game (orthographic)
//
// Architecture note: the tilemap owns a boolean water MASK at terrain.tileSize
// resolution. That mask is the single source of truth for gameplay -- pathfinding,
// unit movement restrictions, building placement and bridges all read it.
//
// The renderer never draws the mask as squares. Instead it extracts a smoothed
// contour of the same mask and fills it with static depth-toned water, so the
// visible coastline and the gameplay no-go border are always the same shape.

// Tile Types Configuration (flat ground + water only)
const TILE_TYPES = {
    FLAT_GROUND: 0,
    WATER: 2
};

// Single-tile textures configuration
const TILE_CONFIG = {
    FALLBACK_TILE_SIZE: 128 // land texture draw size; mask uses GAME_CONFIG.terrain.tileSize
};

// Tilemap Class
class Tilemap {
    constructor(width, height, tileSize) {
        const terrain = (typeof GAME_CONFIG !== 'undefined' && GAME_CONFIG.terrain) || {};
        this.width = width;
        this.height = height;
        this.tileSize = tileSize || terrain.tileSize || 32;
        this.landTileSize = TILE_CONFIG.FALLBACK_TILE_SIZE;
        this.tiles = this.generateEmptyMap();
        this.waterKinds = this.generateEmptyKindMap(); // 'river' | 'lake' | null
        this.landTile = null;  // single land tile image
        this.waterTile = null; // legacy flat water texture (fallback only)
        this.isLoaded = false;
        this.tileMeta = null;  // { tileW, tileH }

        // Shape + render state
        this.waterField = null;   // WaterField providing the authoritative SDF
        this.waterDepth = null;   // Int16Array: BFS distance from shore, in mask cells
        this.contourRings = null; // smoothed coastline rings, world coordinates
        this.waterPath = null;    // Path2D of contourRings, world coordinates
        this.hasWater = false;

        // Static water render state
        this.waterFrame = 0;
        this.waterFrameCount = 1;
        this.waterPatternSize = 192;
        this._waterPatterns = [];  // per-depth static CanvasPattern arrays [depth][0]
        this._depthStencils = null; // per-depth alpha masks at mask resolution
    }

    generateEmptyMap() {
        const map = [];
        for (let y = 0; y < this.height; y++) {
            const row = new Uint8Array(this.width);
            map.push(row);
        }
        return map;
    }

    generateEmptyKindMap() {
        const kinds = [];
        for (let y = 0; y < this.height; y++) {
            const row = [];
            for (let x = 0; x < this.width; x++) row.push(null);
            kinds.push(row);
        }
        return kinds;
    }

    // Load the land tile image (and the legacy water texture as a fallback)
    async loadTileset() {
        try {
            const loadImage = (src) => new Promise((resolve, reject) => {
                const img = new Image();
                img.onload = () => resolve(img);
                img.onerror = () => reject(new Error('Failed to load ' + src));
                const cacheBuster = (TILE_CONFIG.CACHE_BUSTER != null) ? TILE_CONFIG.CACHE_BUSTER : Date.now();
                const sep = src.includes('?') ? '&' : '?';
                img.src = `${src}${sep}v=${cacheBuster}`;
            });
            const [land, water] = await Promise.all([
                loadImage('assets/textures/flatground_tile.png'),
                loadImage('assets/textures/Water Background color.png')
            ]);
            this.landTile = land;
            this.waterTile = water;
            const tileW = land.naturalWidth || land.width || TILE_CONFIG.FALLBACK_TILE_SIZE;
            const tileH = land.naturalHeight || land.height || TILE_CONFIG.FALLBACK_TILE_SIZE;
            this.tileMeta = { tileW, tileH };
            this.isLoaded = true;
            this._buildWaterPatterns();
            console.log('Tilemap assets loaded:', { tileW, tileH, maskTileSize: this.tileSize });
            return true;
        } catch (error) {
            console.error('Failed to load tilemap assets:', error);
            this.isLoaded = false;
            return false;
        }
    }

    // ===== MASK ACCESSORS =====

    // Get the tile value at a specific mask cell
    getTile(x, y) {
        if (x >= 0 && x < this.width && y >= 0 && y < this.height) {
            return this.tiles[y][x];
        }
        return TILE_TYPES.FLAT_GROUND; // out of bounds is land
    }

    // Set the tile value at a specific mask cell
    setTile(x, y, tileType) {
        if (x >= 0 && x < this.width && y >= 0 && y < this.height) {
            this.tiles[y][x] = tileType;
        }
    }

    // Convert world coordinates to mask cell coordinates
    worldToTile(x, y) {
        return { tileX: Math.floor(x / this.tileSize), tileY: Math.floor(y / this.tileSize) };
    }

    // Convert mask cell coordinates to world coordinates
    tileToWorld(tileX, tileY) {
        return { x: tileX * this.tileSize, y: tileY * this.tileSize };
    }

    /**
     * Authoritative water test. Every gameplay rule funnels through here so the
     * drawn coastline and the movement border cannot diverge.
     */
    isWater(x, y) {
        const { tileX, tileY } = this.worldToTile(x, y);
        return this.getTile(tileX, tileY) === TILE_TYPES.WATER;
    }

    isPassableForLandUnits(x, y) {
        return !this.isWater(x, y);
    }

    isPassableForWaterUnits(x, y) { return this.isWater(x, y); }

    /**
     * Water kind ('river' | 'lake' | null) at a world position. Used by bridge
     * placement, which is only allowed over rivers.
     */
    waterKindAt(x, y) {
        const { tileX, tileY } = this.worldToTile(x, y);
        if (tileX < 0 || tileY < 0 || tileX >= this.width || tileY >= this.height) return null;
        return this.waterKinds[tileY][tileX];
    }

    /**
     * Depth band at a world position: 0 = shore-adjacent, higher = further from land.
     * @returns {number} Clamped to [0, terrain.maxWaterDepth]
     */
    depthAt(x, y) {
        if (!this.waterDepth) return 0;
        const { tileX, tileY } = this.worldToTile(x, y);
        if (tileX < 0 || tileY < 0 || tileX >= this.width || tileY >= this.height) return 0;
        const maxD = GAME_CONFIG.terrain.maxWaterDepth;
        const d = this.waterDepth[tileY * this.width + tileX] - 1;
        return Math.max(0, Math.min(maxD, d));
    }

    // ===== MASK CONSTRUCTION =====

    /**
     * Rasterize a WaterField into the logical mask.
     *
     * Each cell is supersampled 2x2 and treated as water when the majority of its
     * samples are inside the field. Supersampling matters because it decides
     * borderline cells consistently with where the drawn contour will fall.
     *
     * Cells overlapping existing buildings or units are forced to land so water
     * generation can never strand an entity inside impassable terrain.
     *
     * @param {WaterField} field - The shape source
     */
    applyWaterField(field) {
        this.waterField = field;
        this.hasWater = false;
        this._layerCache = null;

        for (let y = 0; y < this.height; y++) {
            this.tiles[y].fill(TILE_TYPES.FLAT_GROUND);
            for (let x = 0; x < this.width; x++) this.waterKinds[y][x] = null;
        }

        if (!field || field.bodies.length === 0) {
            this._applyBridgeTerrainOverrides();
            this._refreshWaterState();
            this._buildDepthField();
            this._rebuildContours();
            return;
        }

        const ts = this.tileSize;
        const b = field.bounds();
        const tx0 = Math.max(0, Math.floor(b.x0 / ts));
        const ty0 = Math.max(0, Math.floor(b.y0 / ts));
        const tx1 = Math.min(this.width - 1, Math.ceil(b.x1 / ts));
        const ty1 = Math.min(this.height - 1, Math.ceil(b.y1 / ts));

        // Blockers are gathered once; the per-cell test below is a cheap AABB check.
        const gap = 4;
        const blockers = [...(gameState.buildings || []), ...(gameState.enemyBuildings || [])]
            .map(bd => ({
                x1: bd.x - gap, y1: bd.y - gap,
                x2: bd.x + bd.width + gap, y2: bd.y + bd.height + gap
            }));
        const unitPts = [...(gameState.units || []), ...(gameState.enemyUnits || [])]
            .filter(u => u.state !== 'embarked')
            .map(u => ({ x: u.x, y: u.y }));

        const q = ts * 0.25, q3 = ts * 0.75;

        for (let ty = ty0; ty <= ty1; ty++) {
            const wy = ty * ts;
            for (let tx = tx0; tx <= tx1; tx++) {
                const wx = tx * ts;

                // 2x2 supersample of the field across the cell
                let inside = 0;
                if (field.sdf(wx + q,  wy + q)  < 0) inside++;
                if (field.sdf(wx + q3, wy + q)  < 0) inside++;
                if (field.sdf(wx + q,  wy + q3) < 0) inside++;
                if (field.sdf(wx + q3, wy + q3) < 0) inside++;
                if (inside < 2) continue; // majority rule

                const cxw = wx + ts / 2, cyw = wy + ts / 2;

                const hitsBuilding = blockers.some(r =>
                    wx + ts > r.x1 && wx < r.x2 && wy + ts > r.y1 && wy < r.y2);
                if (hitsBuilding) continue;

                const hitsUnit = unitPts.some(p =>
                    p.x >= wx && p.x < wx + ts && p.y >= wy && p.y < wy + ts);
                if (hitsUnit) continue;

                this.tiles[ty][tx] = TILE_TYPES.WATER;
                this.waterKinds[ty][tx] = this._classifyKind(field, cxw, cyw);
                this.hasWater = true;
            }
        }

        this._applyBridgeTerrainOverrides();
        this._refreshWaterState();
        this._buildDepthField();
        this._rebuildContours();
    }

    /**
     * Decide whether a point belongs to a river or a lake by asking which
     * primitive is nearest. Bridges rely on this distinction.
     */
    _classifyKind(field, x, y) {
        let bestKind = 'lake';
        let bestD = Infinity;
        for (const body of field.bodies) {
            const d = field._bodySdf(body, x, y);
            if (d < bestD) { bestD = d; bestKind = body.kind === 'river' ? 'river' : 'lake'; }
        }
        return bestKind;
    }

    /**
     * Multi-source BFS from land to compute, for each water cell, its distance to
     * the nearest land cell. Drives depth shading and keeps deep water reading as
     * deep regardless of body shape.
     */
    _buildDepthField() {
        const w = this.width, h = this.height;
        const depth = new Int16Array(w * h);
        const queue = new Int32Array(w * h);
        let head = 0, tail = 0;

        for (let y = 0; y < h; y++) {
            const row = this.tiles[y];
            for (let x = 0; x < w; x++) {
                const i = y * w + x;
                if (row[x] !== TILE_TYPES.WATER) {
                    depth[i] = 0;
                    queue[tail++] = i;
                } else {
                    depth[i] = 32767;
                }
            }
        }

        while (head < tail) {
            const i = queue[head++];
            const x = i % w, y = (i / w) | 0;
            const nd = depth[i] + 1;
            // Cardinal neighbours only; diagonal spread would round off narrow inlets.
            if (x > 0)     { const j = i - 1; if (nd < depth[j]) { depth[j] = nd; queue[tail++] = j; } }
            if (x < w - 1) { const j = i + 1; if (nd < depth[j]) { depth[j] = nd; queue[tail++] = j; } }
            if (y > 0)     { const j = i - w; if (nd < depth[j]) { depth[j] = nd; queue[tail++] = j; } }
            if (y < h - 1) { const j = i + w; if (nd < depth[j]) { depth[j] = nd; queue[tail++] = j; } }
        }

        this.waterDepth = depth;
        this._buildDepthStencils();
    }

    /**
     * Bake one alpha stencil per depth band, at mask resolution.
     *
     * Built once whenever the mask changes, never per frame. Each stencil marks
     * the cells at that depth or deeper, so the renderer can paint a band by
     * drawing the stencil and compositing the water texture over it -- no
     * per-pixel work and no readback while the camera moves.
     */
    _buildDepthStencils() {
        this._depthStencils = null;
        this._layerCache = null;
        if (!this.hasWater) return;

        const maxD = GAME_CONFIG.terrain.maxWaterDepth;
        const w = this.width, h = this.height;
        const stencils = [];

        for (let d = 0; d <= maxD; d++) {
            const cv = document.createElement('canvas');
            cv.width = w;
            cv.height = h;
            const cx = cv.getContext('2d');
            const img = cx.createImageData(w, h);
            const data = img.data;

            // Threshold: opaque where this cell's depth band reaches d.
            for (let y = 0; y < h; y++) {
                const row = this.tiles[y];
                for (let x = 0; x < w; x++) {
                    const i = y * w + x;
                    if (row[x] !== TILE_TYPES.WATER) continue; // leave transparent
                    const band = Math.max(0, Math.min(maxD, this.waterDepth[i] - 1));
                    if (band < d) continue;
                    const o = i * 4;
                    data[o] = 255; data[o + 1] = 255; data[o + 2] = 255;
                    data[o + 3] = 255;
                }
            }
            cx.putImageData(img, 0, 0);
            stencils.push(cv);
        }

        this._depthStencils = stencils;
    }

    /**
     * Extract and cache the smoothed coastline from the actual water mask.
     *
     * Rendering, minimap and gameplay all read this mask, so the player never
     * sees water in one place while pathfinding treats another place as water.
     */
    _rebuildContours() {
        this.contourRings = null;
        this.waterPath = null;
        if (!this.hasWater) return;

        const b = this._waterMaskBounds();
        const step = GAME_CONFIG.terrain.contourStep;

        try {
            const rings = extractContours({
                sample: (x, y) => this.isWater(x, y) ? -1 : 1,
                x0: b.x0, y0: b.y0, x1: b.x1, y1: b.y1,
                step,
                smoothPasses: 2
            });
            this.contourRings = rings;
            this.waterPath = ringsToPath(rings);
        } catch (e) {
            console.error('Contour extraction failed; falling back to cell fill:', e);
            this.contourRings = null;
            this.waterPath = null;
        }
    }

    _waterMaskBounds() {
        const ts = this.tileSize;
        let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;

        for (let ty = 0; ty < this.height; ty++) {
            for (let tx = 0; tx < this.width; tx++) {
                if (this.tiles[ty][tx] !== TILE_TYPES.WATER) continue;
                x0 = Math.min(x0, tx * ts);
                y0 = Math.min(y0, ty * ts);
                x1 = Math.max(x1, (tx + 1) * ts);
                y1 = Math.max(y1, (ty + 1) * ts);
            }
        }

        if (!Number.isFinite(x0)) {
            return { x0: 0, y0: 0, x1: GAME_CONFIG.world.width, y1: GAME_CONFIG.world.height };
        }

        const pad = Math.max(ts * 3, GAME_CONFIG.terrain.contourStep * 3);
        return {
            x0: Math.max(0, x0 - pad),
            y0: Math.max(0, y0 - pad),
            x1: Math.min(GAME_CONFIG.world.width, x1 + pad),
            y1: Math.min(GAME_CONFIG.world.height, y1 + pad)
        };
    }

    /**
     * Legacy entry point. Kept so callers that pass world objects still work; it
     * builds a field from any water rectangles present. New code should call
     * applyWaterField() with a WaterField instead.
     */
    markWaterAreas(worldObjects) {
        if (this.waterField) {
            // A field was already installed; just re-rasterize it so late-spawned
            // buildings and units carve themselves out of the water.
            this.applyWaterField(this.waterField);
            return;
        }
        const rects = (worldObjects || []).filter(o => o.type === 'water' || o.type === 'lake');
        if (rects.length === 0) {
            this.applyWaterField(null);
            return;
        }
        if (typeof WaterField === 'undefined') {
            this.waterField = null;
            this.hasWater = false;
            for (let y = 0; y < this.height; y++) {
                this.tiles[y].fill(TILE_TYPES.FLAT_GROUND);
                for (let x = 0; x < this.width; x++) this.waterKinds[y][x] = null;
            }

            for (const obj of rects) {
                const start = this.worldToTile(obj.x, obj.y);
                const end = this.worldToTile(obj.x + obj.width, obj.y + obj.height);
                const ratio = Math.max(obj.width, obj.height) / Math.max(1, Math.min(obj.width, obj.height));
                const kind = obj.type === 'lake' || ratio < 2 ? 'lake' : 'river';
                for (let ty = start.tileY; ty <= end.tileY; ty++) {
                    for (let tx = start.tileX; tx <= end.tileX; tx++) {
                        if (tx < 0 || ty < 0 || tx >= this.width || ty >= this.height) continue;
                        this.tiles[ty][tx] = TILE_TYPES.WATER;
                        this.waterKinds[ty][tx] = kind;
                        this.hasWater = true;
                    }
                }
            }
            this._applyBridgeTerrainOverrides();
            this._refreshWaterState();
            this._buildDepthField();
            this._rebuildContours();
            return;
        }
        // Approximate legacy rectangles with lake primitives so behaviour degrades
        // gracefully rather than losing the water entirely.
        const field = new WaterField({
            seed: 1234,
            worldWidth: GAME_CONFIG.world.width,
            worldHeight: GAME_CONFIG.world.height
        });
        for (const r of rects) {
            field.addLake({
                x: r.x + r.width / 2,
                y: r.y + r.height / 2,
                rx: Math.max(24, r.width / 2),
                ry: Math.max(24, r.height / 2)
            });
        }
        this.applyWaterField(field);
    }

    applyBridgeTerrain(bridge) {
        if (!bridge) return;
        this._carveBridgeObject(bridge);
        this._refreshWaterState();
        this._buildDepthField();
        this._rebuildContours();
    }

    _applyBridgeTerrainOverrides() {
        if (typeof gameState === 'undefined' || !gameState.worldObjects) return;
        for (const obj of gameState.worldObjects) {
            if (obj.type === 'bridge') this._carveBridgeObject(obj);
        }
    }

    _carveBridgeObject(bridge) {
        const ts = this.tileSize;
        const startX = Math.max(0, Math.floor(bridge.x / ts));
        const startY = Math.max(0, Math.floor(bridge.y / ts));
        const endX = Math.min(this.width - 1, Math.ceil((bridge.x + bridge.width) / ts) - 1);
        const endY = Math.min(this.height - 1, Math.ceil((bridge.y + bridge.height) / ts) - 1);

        for (let ty = startY; ty <= endY; ty++) {
            for (let tx = startX; tx <= endX; tx++) {
                const cellX = tx * ts;
                const cellY = ty * ts;
                const overlaps = cellX < bridge.x + bridge.width &&
                    cellX + ts > bridge.x &&
                    cellY < bridge.y + bridge.height &&
                    cellY + ts > bridge.y;
                if (!overlaps) continue;
                this.tiles[ty][tx] = TILE_TYPES.FLAT_GROUND;
                this.waterKinds[ty][tx] = null;
            }
        }
    }

    _refreshWaterState() {
        this.hasWater = false;
        for (let ty = 0; ty < this.height; ty++) {
            for (let tx = 0; tx < this.width; tx++) {
                if (this.tiles[ty][tx] === TILE_TYPES.WATER) {
                    this.hasWater = true;
                    return;
                }
            }
        }
    }

    // ===== PROCEDURAL WATER PATTERNS =====

    /**
     * Generate static water textures: one tile per depth band, registered as
     * repeating CanvasPatterns.
     *
     * The texture is intentionally quiet: broad tone changes only, no shimmer,
     * dash pattern or frame-to-frame movement.
     */
    _buildWaterPatterns() {
        const SIZE = this.waterPatternSize;
        const probe = document.createElement('canvas').getContext('2d');
        this._waterPatterns = [];

        for (let depth = 0; depth < WATER_PALETTE.length; depth++) {
            const pal = WATER_PALETTE[depth];
            const frames = [];
            const cv = document.createElement('canvas');
            cv.width = SIZE; cv.height = SIZE;
            const cx = cv.getContext('2d');
            const img = cx.createImageData(SIZE, SIZE);
            const data = img.data;

            for (let py = 0; py < SIZE; py++) {
                for (let px = 0; px < SIZE; px++) {
                    const nx = px / SIZE;
                    const ny = py / SIZE;
                    const broad = Math.sin(nx * Math.PI * 2 + ny * Math.PI * 1.15) * 0.035;
                    const cross = Math.sin((nx * 1.4 - ny * 0.65) * Math.PI * 2) * 0.018;
                    const vertical = (ny - 0.5) * 0.018;
                    const t = Math.max(0, Math.min(1, 0.50 + broad + cross + vertical));

                    let r = pal.primary[0] + (pal.secondary[0] - pal.primary[0]) * t;
                    let g = pal.primary[1] + (pal.secondary[1] - pal.primary[1]) * t;
                    let b = pal.primary[2] + (pal.secondary[2] - pal.primary[2]) * t;

                    const o = (py * SIZE + px) * 4;
                    data[o] = Math.max(0, Math.min(255, Math.round(r)));
                    data[o + 1] = Math.max(0, Math.min(255, Math.round(g)));
                    data[o + 2] = Math.max(0, Math.min(255, Math.round(b)));
                    data[o + 3] = 255;
                }
            }
            cx.putImageData(img, 0, 0);
            frames.push(probe.createPattern(cv, 'repeat'));
            this._waterPatterns.push(frames);
        }
    }

    /**
     * Compatibility hook for the game loop. Water is intentionally static.
     * @param {number} deltaTime - Milliseconds since last frame
     */
    tickWaterAnimation(deltaTime) {
        this.waterFrame = 0;
    }

    _visibleWorldSize() {
        const zoom = (typeof gameState !== 'undefined' && gameState.zoomLevel) || 1;
        return {
            width: GAME_CONFIG.canvas.width / zoom,
            height: GAME_CONFIG.canvas.height / zoom
        };
    }

    // ===== DRAWING =====

    /**
     * Draw terrain: land texture everywhere, then the water body as a single
     * smoothed, clipped shape rather than per-cell squares.
     */
    draw(ctx, camera) {
        if (!this.isLoaded || !this.landTile) {
            this.drawFallbackBackground(ctx);
            return;
        }
        this._drawLand(ctx, camera);
        this._drawWater(ctx, camera);

        // Draw the out-of-bounds void mask
        const view = this._visibleWorldSize();
        const cx = (GAME_CONFIG.world.width / 2) - camera.x;
        const cy = (GAME_CONFIG.world.height / 2) - camera.y;
        const r = GAME_CONFIG.world.radius;

        ctx.save();
        ctx.beginPath();
        // Outer rect covering the screen
        ctx.rect(0, 0, view.width, view.height);
        // Inner circle (drawn counter-clockwise to create a hole)
        ctx.arc(cx, cy, r, 0, Math.PI * 2, true);
        ctx.fillStyle = 'rgba(0, 0, 0, 0.85)';
        ctx.fill();
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.95)';
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
    }

    /** Tile the land texture across the viewport. */
    _drawLand(ctx, camera) {
        const ts = this.landTileSize;
        const view = this._visibleWorldSize();
        const startX = Math.floor(camera.x / ts) * ts;
        const startY = Math.floor(camera.y / ts) * ts;
        const endX = camera.x + view.width;
        const endY = camera.y + view.height;

        ctx.imageSmoothingEnabled = false;
        for (let wy = startY; wy < endY; wy += ts) {
            for (let wx = startX; wx < endX; wx += ts) {
                ctx.drawImage(this.landTile, (wx - camera.x) | 0, (wy - camera.y) | 0, ts, ts);
            }
        }
    }

    /**
     * Draw the water body.
     *
     * Approach: clip to the smoothed contour, fill with masked static depth
     * layers, then stroke a shoreline highlight. All of it is derived from the
     * gameplay mask, so what the player sees as water is exactly what units treat
     * as water.
     */
    _drawWater(ctx, camera) {
        if (!this.hasWater) return;

        // No contour available (extraction failed): fall back to cell fill so
        // water is still visible and still matches the mask.
        if (!this.waterPath) {
            this._drawWaterCellsFallback(ctx, camera);
            return;
        }

        const maxD = GAME_CONFIG.terrain.maxWaterDepth;

        // 1) Beach bands on the LAND side. Drawn before the water so the water
        //    fill covers the inner half of each stroke -- this is what makes the
        //    sand read as a band along the shore instead of a line through it.
        this._drawBeachBands(ctx, camera);

        // 2) Water body, clipped to the smoothed contour.
        ctx.save();
        ctx.translate(-camera.x, -camera.y);
        ctx.clip(this.waterPath);

        const viewX = camera.x, viewY = camera.y;
        const view = this._visibleWorldSize();
        const viewW = view.width, viewH = view.height;

        for (let d = 0; d <= maxD; d++) {
            const layer = this._getDepthLayerCanvas(d, camera);
            if (layer) ctx.drawImage(layer, viewX, viewY, viewW, viewH);
        }

        ctx.restore();

        // 3) Foam straddling the waterline, on top of both.
        this._drawFoam(ctx, camera);
    }

    /**
     * Create a viewport-sized water layer for a depth band, masked by the
     * prebaked stencil. This keeps compositing isolated from the main canvas and
     * prevents depth bands from bleeding into unrelated water.
     */
    _getDepthLayerCanvas(d, camera) {
        const pat = this._waterPatterns[d] && this._waterPatterns[d][this.waterFrame];
        const stencil = this._depthStencils && this._depthStencils[d];
        if (!pat || !stencil) return null;

        const view = this._visibleWorldSize();
        const viewW = Math.ceil(view.width);
        const viewH = Math.ceil(view.height);
        const cacheKey = `${d}`;
        this._layerCache = this._layerCache || {};
        let entry = this._layerCache[cacheKey];
        if (!entry || entry.w !== viewW || entry.h !== viewH) {
            const cv = document.createElement('canvas');
            cv.width = viewW;
            cv.height = viewH;
            entry = { cv, w: viewW, h: viewH, key: null };
            this._layerCache[cacheKey] = entry;
        }

        const key = `${camera.x}|${camera.y}|${this.waterFrame}`;
        if (entry.key === key) return entry.cv;
        entry.key = key;

        const cx = entry.cv.getContext('2d');
        cx.setTransform(1, 0, 0, 1, 0, 0);
        cx.clearRect(0, 0, viewW, viewH);

        const patternSize = this.waterPatternSize || 96;
        const ox = -(((camera.x % patternSize) + patternSize) % patternSize);
        const oy = -(((camera.y % patternSize) + patternSize) % patternSize);
        cx.save();
        cx.translate(ox, oy);
        cx.fillStyle = pat;
        cx.fillRect(0, 0, viewW + patternSize, viewH + patternSize);
        cx.restore();

        cx.globalCompositeOperation = 'destination-in';
        cx.imageSmoothingEnabled = true;
        const ts = this.tileSize;
        cx.drawImage(stencil, camera.x / ts, camera.y / ts, viewW / ts, viewH / ts, 0, 0, viewW, viewH);
        cx.globalCompositeOperation = 'source-over';

        return entry.cv;
    }

    /**
     * Sand bands hugging the coast, drawn BEFORE the water fill.
     *
     * Each stroke is centred on the waterline, so its inner half is subsequently
     * painted over by the water. The visible result is a soft beach on the land
     * side only, without needing a separate land-side clip region.
     */
    _drawBeachBands(ctx, camera) {
        if (!this.waterPath) return;
        const S = SHORE_PALETTE;
        const rgba = (c, a) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;

        ctx.save();
        ctx.translate(-camera.x, -camera.y);
        ctx.lineJoin = 'round';
        ctx.lineCap = 'round';

        // Widest, faintest band first, then tighter and stronger toward the water.
        ctx.strokeStyle = rgba(S.drySand, 0.24);
        ctx.lineWidth = 38;
        ctx.stroke(this.waterPath);

        ctx.strokeStyle = rgba(S.wetSand, 0.34);
        ctx.lineWidth = 18;
        ctx.stroke(this.waterPath);

        ctx.restore();
    }

    /**
     * Static shoreline highlight, drawn last so it reads on top of both the sand
     * and the water.
     */
    _drawFoam(ctx, camera) {
        if (!this.waterPath) return;
        const S = SHORE_PALETTE;
        const rgba = (c, a) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;

        ctx.save();
        ctx.translate(-camera.x, -camera.y);
        ctx.lineJoin = 'round';
        ctx.lineCap = 'round';

        ctx.strokeStyle = rgba(S.foam, 0.24);
        ctx.lineWidth = 6;
        ctx.stroke(this.waterPath);

        ctx.strokeStyle = rgba(S.foam, 0.58);
        ctx.lineWidth = 2;
        ctx.stroke(this.waterPath);

        ctx.restore();
    }

    /**
     * Cell-based water fill used only if contour extraction fails. Blocky, but
     * guarantees water is drawn where the mask says it is.
     */
    _drawWaterCellsFallback(ctx, camera) {
        const ts = this.tileSize;
        const stx = Math.max(0, Math.floor(camera.x / ts));
        const sty = Math.max(0, Math.floor(camera.y / ts));
        const view = this._visibleWorldSize();
        const etx = Math.min(this.width, Math.ceil((camera.x + view.width) / ts));
        const ety = Math.min(this.height, Math.ceil((camera.y + view.height) / ts));
        const pal = WATER_PALETTE[1];
        ctx.fillStyle = `rgb(${pal.primary[0]},${pal.primary[1]},${pal.primary[2]})`;
        for (let ty = sty; ty < ety; ty++) {
            for (let tx = stx; tx < etx; tx++) {
                if (this.tiles[ty][tx] !== TILE_TYPES.WATER) continue;
                ctx.fillRect((tx * ts - camera.x) | 0, (ty * ts - camera.y) | 0, ts, ts);
            }
        }
    }

    // Draw fallback background when tiles are not loaded
    drawFallbackBackground(ctx) {
        const gradient = ctx.createLinearGradient(0, 0, GAME_CONFIG.canvas.width, GAME_CONFIG.canvas.height);
        gradient.addColorStop(0, '#2a8f52');
        gradient.addColorStop(1, '#1e6b3d');
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, GAME_CONFIG.canvas.width, GAME_CONFIG.canvas.height);
    }

    // Draw a single tile image at x,y scaled to tileSize
    drawSingleTile(ctx, x, y, img) {
        if (!img) return;
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(img, x, y, this.landTileSize, this.landTileSize);
    }

    // Draw with explicit destination size
    drawSingleTileScaled(ctx, x, y, img, w, h) {
        if (!img) return;
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(img, x, y, w, h);
    }

    /**
     * Water cells as rectangles, for any consumer that still wants them.
     * Kept for backwards compatibility; prefer isWater()/mask queries.
     */
    getWaterObjects() {
        const waterObjects = [];
        for (let y = 0; y < this.height; y++) {
            for (let x = 0; x < this.width; x++) {
                if (this.getTile(x, y) === TILE_TYPES.WATER) {
                    const worldPos = this.tileToWorld(x, y);
                    waterObjects.push({
                        type: 'water',
                        x: worldPos.x,
                        y: worldPos.y,
                        width: this.tileSize,
                        height: this.tileSize,
                        color: '#47ABA9'
                    });
                }
            }
        }
        return waterObjects;
    }
}

// Global tilemap instance
let tilemap = null;

/**
 * Create the tilemap at mask resolution and install the world's water field.
 * @returns {Promise<Tilemap>}
 */
async function initTilemap() {
    const ts = GAME_CONFIG.terrain.tileSize;
    const w = Math.ceil(GAME_CONFIG.world.width / ts);
    const h = Math.ceil(GAME_CONFIG.world.height / ts);
    tilemap = new Tilemap(w, h, ts);

    await tilemap.loadTileset();

    // Prefer a WaterField built during world generation; otherwise derive one.
    if (gameState && gameState.waterField) {
        tilemap.applyWaterField(gameState.waterField);
    } else if (gameState && gameState.worldObjects) {
        tilemap.markWaterAreas(gameState.worldObjects);
    }
    return tilemap;
}

// Check if point is in water (using tilemap)
function isPointInWaterTile(x, y) {
    if (!tilemap) return false;
    return tilemap.isWater(x, y);
}

// Check if point is on land (using tilemap)
function isPointOnLandTile(x, y) {
    if (!tilemap) return true;
    return !tilemap.isWater(x, y);
}
