// Simplified Tilemap System for RTS Game (orthographic only)
// Tile Types Configuration (flat ground + water only)
const TILE_TYPES = {
    FLAT_GROUND: 0,
    WATER: 2
};

// Single-tile textures configuration
const TILE_CONFIG = {
    FALLBACK_TILE_SIZE: 64, // used before images load
    WATER_BORDER_THICKNESS: 0.15 // fraction of tile size for border thickness
};

// Tilemap Class
class Tilemap {
    constructor(width, height, tileSize = TILE_CONFIG.FALLBACK_TILE_SIZE) {
        this.width = width;
        this.height = height;
    this.tileSize = tileSize;
        this.tiles = this.generateEmptyMap();
    this.waterKinds = this.generateEmptyKindMap(); // 'river' | 'lake' | null
        this.landTile = null; // single land tile image
        this.waterTile = null; // single water tile image
    // Optional water border overlays (per side)
    this.waterBorders = { up: null, down: null, left: null, right: null };
        this.isLoaded = false;
    this.tileMeta = null; // { tileW, tileH }
    }

    generateEmptyMap() {
        const map = [];
        for (let y = 0; y < this.height; y++) {
            const row = [];
            for (let x = 0; x < this.width; x++) {
                // Default to flat ground
                row.push(TILE_TYPES.FLAT_GROUND);
            }
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

    // Load the land and water tile images
    async loadTileset() {
        try {
            console.log('Loading land and water tiles...');
            const loadImage = (src) => new Promise((resolve, reject) => {
                const img = new Image();
                img.onload = () => resolve(img);
                img.onerror = () => reject(new Error('Failed to load ' + src));
                // Add cache-busting query to ensure latest asset is used when replaced
                const cacheBuster = (TILE_CONFIG.CACHE_BUSTER != null) ? TILE_CONFIG.CACHE_BUSTER : Date.now();
                const sep = src.includes('?') ? '&' : '?';
                img.src = `${src}${sep}v=${cacheBuster}`;
            });
            const [land, water, upB, downB, leftB, rightB] = await Promise.all([
                loadImage('assets/textures/flatground_tile.png'),
                loadImage('assets/textures/Water Background color.png'),
                loadImage('assets/textures/up_water_border.png').catch(() => null),
                loadImage('assets/textures/down_water_border.png').catch(() => null),
                loadImage('assets/textures/left_water_border.png').catch(() => null),
                loadImage('assets/textures/right_water_border.png').catch(() => null)
            ]);
            this.landTile = land;
            this.waterTile = water;
            this.waterBorders = { up: upB, down: downB, left: leftB, right: rightB };
            const tileW = land.naturalWidth || land.width || TILE_CONFIG.FALLBACK_TILE_SIZE;
            const tileH = land.naturalHeight || land.height || TILE_CONFIG.FALLBACK_TILE_SIZE;
            this.tileMeta = { tileW, tileH };
            // Orthographic: use a fixed grid size for consistent performance
            this.tileSize = TILE_CONFIG.FALLBACK_TILE_SIZE;
            this.isLoaded = true;
            console.log('Tilemap assets loaded successfully:', { tileW, tileH, tileSize: this.tileSize });
            return true;
        } catch (error) {
            console.error('Failed to load tilemap assets:', error);
            this.isLoaded = false;
            return false;
        }
    }

    // Get the tile value at a specific position
    getTile(x, y) {
        if (x >= 0 && x < this.width && y >= 0 && y < this.height) {
            return this.tiles[y][x];
        }
        return TILE_TYPES.FLAT_GROUND; // Default to flat ground if out of bounds
    }

    // Set the tile value at a specific position
    setTile(x, y, tileType) {
        if (x >= 0 && x < this.width && y >= 0 && y < this.height) {
            this.tiles[y][x] = tileType;
        }
    }

    // Convert world coordinates to tile coordinates
    worldToTile(x, y) {
        return { tileX: Math.floor(x / this.tileSize), tileY: Math.floor(y / this.tileSize) };
    }

    // Convert tile coordinates to world coordinates
    tileToWorld(tileX, tileY) {
        return { x: tileX * this.tileSize, y: tileY * this.tileSize };
    }

    // Check if a world position is water
    isWater(x, y) {
        const { tileX, tileY } = this.worldToTile(x, y);
        const tileType = this.getTile(tileX, tileY);
        return tileType === TILE_TYPES.WATER;
    }

    // Check if a world position is passable for land units
    isPassableForLandUnits(x, y) {
        return !this.isWater(x, y);
    }

    // Check if a world position is passable for water units (kept for compatibility)
    isPassableForWaterUnits(x, y) { return this.isWater(x, y); }

    // Draw the tilemap using land/water tiles across the map (orthographic)
    draw(ctx, camera) {
        if (!this.isLoaded || !this.landTile) {
            this.drawFallbackBackground(ctx);
            return;
        }
        // Orthographic draw
        const startTileX = Math.max(0, Math.floor(camera.x / this.tileSize));
        const startTileY = Math.max(0, Math.floor(camera.y / this.tileSize));
        const endTileX = Math.min(this.width, Math.ceil((camera.x + GAME_CONFIG.canvas.width) / this.tileSize));
        const endTileY = Math.min(this.height, Math.ceil((camera.y + GAME_CONFIG.canvas.height) / this.tileSize));
        for (let ty = startTileY; ty < endTileY; ty++) {
            for (let tx = startTileX; tx < endTileX; tx++) {
                const worldX = (tx * this.tileSize - camera.x) | 0;
                const worldY = (ty * this.tileSize - camera.y) | 0;
                const isWater = this.getTile(tx, ty) === TILE_TYPES.WATER;
                this.drawSingleTile(ctx, worldX, worldY, isWater ? this.waterTile : this.landTile);
                if (isWater) this.drawWaterBorders(ctx, tx, ty, worldX, worldY);
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
        ctx.drawImage(img, x, y, this.tileSize, this.tileSize);
    }

    // // Draw with explicit destination size
    drawSingleTileScaled(ctx, x, y, img, w, h) {
        if (!img) return;
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(img, x, y, w, h);
    }

    // Compute transparent margins (alpha=0) around an image
    async computeImageTrim(img) {
        try {
            const iw = img.naturalWidth || img.width;
            const ih = img.naturalHeight || img.height;
            const c = document.createElement('canvas');
            c.width = iw; c.height = ih;
            const cx = c.getContext('2d');
            cx.drawImage(img, 0, 0);
            const data = cx.getImageData(0, 0, iw, ih).data;
            let top = 0, left = 0, right = 0, bottom = 0;
            // top
            scanTop: for (let y = 0; y < ih; y++) {
                for (let x = 0; x < iw; x++) { if (data[(y*iw + x)*4 + 3] !== 0) { top = y; break scanTop; } }
            }
            // bottom
            scanBottom: for (let y = ih - 1; y >= 0; y--) {
                for (let x = 0; x < iw; x++) { if (data[(y*iw + x)*4 + 3] !== 0) { bottom = ih - 1 - y; break scanBottom; } }
            }
            // left
            scanLeft: for (let x = 0; x < iw; x++) {
                for (let y = 0; y < ih; y++) { if (data[(y*iw + x)*4 + 3] !== 0) { left = x; break scanLeft; } }
            }
            // right
            scanRight: for (let x = iw - 1; x >= 0; x--) {
                for (let y = 0; y < ih; y++) { if (data[(y*iw + x)*4 + 3] !== 0) { right = iw - 1 - x; break scanRight; } }
            }
            return { left, right, top, bottom };
        } catch (e) {
            return { left: 0, right: 0, top: 0, bottom: 0 };
        }
    }


    // Draw side-specific border overlays for a water tile
    drawWaterBorders(ctx, tx, ty, x, y) {
        const { up, down, left, right } = this.waterBorders || {};
        if (!up && !down && !left && !right) return;
        const waterHere = this.getTile(tx, ty) === TILE_TYPES.WATER;
        if (!waterHere) return;
        const kind = this.waterKinds?.[ty]?.[tx] || null; // 'river' or 'lake'
        const isLandOrOut = (nx, ny) => {
            if (nx < 0 || ny < 0 || nx >= this.width || ny >= this.height) return true; // treat out-of-bounds as land edge
            return this.getTile(nx, ny) !== TILE_TYPES.WATER;
        };
    const s = this.tileSize;
        const t = Math.max(1, Math.floor(s * (TILE_CONFIG.WATER_BORDER_THICKNESS ?? 0.25)));
    ctx.imageSmoothingEnabled = false;
    // Borders are used in orthographic mode
        // For rivers, suppress top/bottom borders entirely
        const upEdge = (kind === 'river') ? false : isLandOrOut(tx, ty - 1);
        const downEdge = (kind === 'river') ? false : isLandOrOut(tx, ty + 1);
        const leftEdge = isLandOrOut(tx - 1, ty);
        const rightEdge = isLandOrOut(tx + 1, ty);

        // Vertical borders own the corner pixels; horizontal borders are trimmed to avoid overlap
        if (left && leftEdge) ctx.drawImage(left, x, y, t, s);
        if (right && rightEdge) ctx.drawImage(right, x + (s - t), y, t, s);

        if (up && upEdge) {
            const startX = x + (leftEdge ? t : 0);
            const width = s - (leftEdge ? t : 0) - (rightEdge ? t : 0);
            if (width > 0) ctx.drawImage(up, startX, y, width, t);
        }
        if (down && downEdge) {
            const startX = x + (leftEdge ? t : 0);
            const width = s - (leftEdge ? t : 0) - (rightEdge ? t : 0);
            if (width > 0) ctx.drawImage(down, startX, y + (s - t), width, t);
        }
    }

    // Determine which of the 4 land tiles to use based on neighbors
    pickLandTileIndex(tx, ty) {
        // Neighbor water checks
        const waterUp = ty > 0 && this.getTile(tx, ty - 1) === TILE_TYPES.WATER;
        const waterDown = ty < this.height - 1 && this.getTile(tx, ty + 1) === TILE_TYPES.WATER;
        const waterLeft = tx > 0 && this.getTile(tx - 1, ty) === TILE_TYPES.WATER;
        const waterRight = tx < this.width - 1 && this.getTile(tx + 1, ty) === TILE_TYPES.WATER;
        const isEdge = waterUp || waterDown || waterLeft || waterRight;
        const isCornerInner = (waterUp && waterLeft) || (waterUp && waterRight) || (waterDown && waterLeft) || (waterDown && waterRight);
        const nearWorldCorner = (tx === 0 || tx === this.width - 1) && (ty === 0 || ty === this.height - 1);
        const meta = this.tileMeta || { cols: 4, rows: 1 };
        // If single row with 4 tiles: map to ix 0..3 on row 0
        if ((meta.rows || 1) === 1 && (meta.cols || 4) >= 4) {
            if (isCornerInner) return { ix: 2, iy: 0 }; // inner corners
            if (isEdge) return { ix: 1, iy: 0 };        // edges
            if (nearWorldCorner) return { ix: 3, iy: 0 }; // outer corners/world corners
            return { ix: 0, iy: 0 };                    // main
        }
        // Else assume 2x2 grid: map to (0,0),(1,0),(0,1),(1,1)
        if (isCornerInner) return { ix: 0, iy: 1 };
        if (isEdge) return { ix: 1, iy: 0 };
        if (nearWorldCorner) return { ix: 1, iy: 1 };
        return { ix: 0, iy: 0 };
    }

    // Mark water areas from existing world objects (land is default everywhere)
    markWaterAreas(worldObjects) {
        // Reset grids
        for (let y = 0; y < this.height; y++) {
            for (let x = 0; x < this.width; x++) {
                this.setTile(x, y, TILE_TYPES.FLAT_GROUND);
                this.waterKinds[y][x] = null;
            }
        }

        const waterRects = worldObjects.filter(o => o.type === 'water' || o.type === 'lake');
        // Orthographic marking
        waterRects.forEach(obj => {
                const start = this.worldToTile(obj.x, obj.y);
                const end = this.worldToTile(obj.x + obj.width, obj.y + obj.height);
                let kind = 'lake';
                if (obj.type !== 'lake') {
                    const w = Math.max(1, obj.width);
                    const h = Math.max(1, obj.height);
                    const ratio = w / h;
                    if (ratio >= 2 || (1 / ratio) >= 2) kind = 'river';
                }
                for (let ty = start.tileY; ty <= end.tileY; ty++) {
                    for (let tx = start.tileX; tx <= end.tileX; tx++) {
                        if (tx >= 0 && tx < this.width && ty >= 0 && ty < this.height) {
                            const wx = tx * this.tileSize;
                            const wy = ty * this.tileSize;
                            const wbx = wx + this.tileSize;
                            const wby = wy + this.tileSize;
                            const gap = 4;
                            const overlapsBuilding = [...gameState.buildings, ...gameState.enemyBuildings].some(b => {
                                const bx1 = b.x - gap, by1 = b.y - gap;
                                const bx2 = b.x + b.width + gap, by2 = b.y + b.height + gap;
                                return !(wbx <= bx1 || wx >= bx2 || wby <= by1 || wy >= by2);
                            });
                            const overlapsUnit = [...gameState.units, ...gameState.enemyUnits].some(u =>
                                u.x >= wx && u.x < wbx && u.y >= wy && u.y < wby
                            );
                            if (!overlapsBuilding && !overlapsUnit) {
                                this.setTile(tx, ty, TILE_TYPES.WATER);
                                this.waterKinds[ty][tx] = kind;
                            }
                        }
                    }
                }
            });
    }

    // Create water areas for collision detection (backwards compatibility)
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
                        color: '#1e90ff'
                    });
                }
            }
        }
        
        return waterObjects;
    }
}

// Global tilemap instance
let tilemap = null;

// Initialize tilemap
async function initTilemap() {
    // Start with a small placeholder grid; will resize after images load
    const placeholderSize = TILE_CONFIG.FALLBACK_TILE_SIZE;
    const initialW = Math.ceil(GAME_CONFIG.world.width / placeholderSize);
    const initialH = Math.ceil(GAME_CONFIG.world.height / placeholderSize);
    tilemap = new Tilemap(initialW, initialH, placeholderSize);

    // Load tile images
    await tilemap.loadTileset();

    // Resize the grid to match actual tile size from the land tile
    const tileSize = tilemap.tileSize || placeholderSize;
    const mapWidth = Math.ceil(GAME_CONFIG.world.width / tileSize);
    const mapHeight = Math.ceil(GAME_CONFIG.world.height / tileSize);
    tilemap.width = mapWidth;
    tilemap.height = mapHeight;
    tilemap.tiles = tilemap.generateEmptyMap();
    tilemap.waterKinds = tilemap.generateEmptyKindMap();

    // Mark water areas from existing world objects
    if (gameState && gameState.worldObjects) {
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
