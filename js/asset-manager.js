// Asset Manager - Handles loading and caching of PNG assets
class AssetManager {
    constructor() {
        this.assets = new Map();
        this.loadPromises = new Map();
        this.basePath = 'assets/';
    }

    // Load a single asset
    async loadAsset(category, name) {
        const assetKey = `${category}/${name}`;
        
        // Return cached asset if already loaded
        if (this.assets.has(assetKey)) {
            return this.assets.get(assetKey);
        }

        // Return existing promise if already loading
        if (this.loadPromises.has(assetKey)) {
            return this.loadPromises.get(assetKey);
        }

        // Create new load promise
        const loadPromise = new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = () => {
                this.assets.set(assetKey, img);
                this.loadPromises.delete(assetKey);
                resolve(img);
            };
            img.onerror = () => {
                console.warn(`Failed to load asset: ${assetKey}.png`);
                this.loadPromises.delete(assetKey);
                // Create a fallback colored canvas
                const fallback = this.createFallbackAsset();
                this.assets.set(assetKey, fallback);
                resolve(fallback);
            };
            img.src = `${this.basePath}${category}/${name}.png`;
        });

        this.loadPromises.set(assetKey, loadPromise);
        return loadPromise;
    }

    // Create a fallback asset for missing files
    createFallbackAsset() {
        const canvas = document.createElement('canvas');
        canvas.width = 32;
        canvas.height = 32;
        const ctx = canvas.getContext('2d');
        
        // Draw a magenta square with black border to indicate missing asset
        ctx.fillStyle = '#FF00FF';
        ctx.fillRect(0, 0, 32, 32);
        ctx.strokeStyle = '#000000';
        ctx.lineWidth = 2;
        ctx.strokeRect(1, 1, 30, 30);
        
        // Add "?" text
        ctx.fillStyle = '#000000';
        ctx.font = '20px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('?', 16, 22);
        
        return canvas;
    }

    // Load multiple assets at once
    async loadAssets(assetList) {
        const promises = assetList.map(asset => 
            this.loadAsset(asset.category, asset.name)
        );
        return Promise.all(promises);
    }

    // Get a loaded asset
    getAsset(category, name) {
        const assetKey = `${category}/${name}`;
        return this.assets.get(assetKey) || this.createFallbackAsset();
    }

    // Check if asset is loaded
    isLoaded(category, name) {
        const assetKey = `${category}/${name}`;
        return this.assets.has(assetKey);
    }

    // Preload all game assets
    async preloadGameAssets() {
        const assetList = [
            // Units
            { category: 'units', name: 'villager' },
            { category: 'units', name: 'militia' },
            { category: 'units', name: 'archer' },
            { category: 'units', name: 'scout' },
            { category: 'units', name: 'knight' },
            { category: 'units', name: 'crossbowman' },
            { category: 'units', name: 'warrior' },
            { category: 'units', name: 'soldier' },
            { category: 'units', name: 'ballista' },
            { category: 'units', name: 'catapult' },
            { category: 'units', name: 'mangonel' },
            { category: 'units', name: 'trebuchet' },
            { category: 'units', name: 'fishingBoat' },
            { category: 'units', name: 'transportSmall' },
            { category: 'units', name: 'transportLarge' },
            { category: 'units', name: 'galley' },
            { category: 'units', name: 'warship' },

            // Buildings
            { category: 'buildings', name: 'house' },
            { category: 'buildings', name: 'townCenter' },
            { category: 'buildings', name: 'barracks' },
            { category: 'buildings', name: 'archeryRange' },
            { category: 'buildings', name: 'craftery' },
            { category: 'buildings', name: 'navy' },

            // Resources
            { category: 'resources', name: 'food' },
            { category: 'resources', name: 'wood' },
            { category: 'resources', name: 'stone' },
            { category: 'resources', name: 'gold' }
        ];

        console.log('Loading game assets...');
        await this.loadAssets(assetList);
        console.log('All game assets loaded!');
    }
}

// Global asset manager instance
const assetManager = new AssetManager();

// Asset loading utility functions
async function ensureAssetLoaded(category, name) {
    if (!assetManager.isLoaded(category, name)) {
        await assetManager.loadAsset(category, name);
    }
    return assetManager.getAsset(category, name);
}

// Draw asset to canvas with scaling
function drawAsset(ctx, category, name, x = 0, y = 0, scale = 1) {
    const asset = assetManager.getAsset(category, name);
    
    if (asset) {
        const width = asset.width * scale;
        const height = asset.height * scale;
        
        // Use image smoothing for better scaling
        ctx.imageSmoothingEnabled = false; // Keep pixel art crisp
        ctx.drawImage(asset, x, y, width, height);
    } else {
        console.warn(`Asset not found: ${category}/${name}`);
    }
}

// Draw asset fitted to specific dimensions
function drawAssetFitted(ctx, category, name, x, y, targetWidth, targetHeight) {
    const asset = assetManager.getAsset(category, name);
    
    if (asset) {
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(asset, x, y, targetWidth, targetHeight);
    } else {
        console.warn(`Asset not found: ${category}/${name} - drawing fallback`);
        // Draw fallback rectangle
        ctx.fillStyle = '#FF00FF';
        ctx.fillRect(x, y, targetWidth, targetHeight);
        ctx.fillStyle = '#FFFFFF';
        ctx.font = '12px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('?', x + targetWidth/2, y + targetHeight/2);
    }
}

// Draw asset centered on given coordinates
function drawAssetCentered(ctx, category, name, centerX, centerY, scale = 1) {
    const asset = assetManager.getAsset(category, name);
    
    if (asset) {
        const width = asset.width * scale;
        const height = asset.height * scale;
        const x = centerX - width / 2;
        const y = centerY - height / 2;
        
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(asset, x, y, width, height);
    }
}

// Draw asset with tint/transparency effect (for building placement preview)
function drawAssetTinted(ctx, category, name, x, y, targetWidth, targetHeight, alpha = 0.7, tintColor = null) {
    const asset = assetManager.getAsset(category, name);
    
    if (asset) {
        ctx.save();
        ctx.globalAlpha = alpha;
        
        // Draw the asset
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(asset, x, y, targetWidth, targetHeight);
        
        // Apply tint if specified
        if (tintColor) {
            ctx.globalCompositeOperation = 'multiply';
            ctx.fillStyle = tintColor;
            ctx.fillRect(x, y, targetWidth, targetHeight);
        }
        
        ctx.restore();
    } else {
        console.warn(`Asset not found: ${category}/${name} - drawing fallback`);
        // Draw fallback rectangle with transparency
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.fillStyle = '#FF00FF';
        ctx.fillRect(x, y, targetWidth, targetHeight);
        ctx.fillStyle = '#FFFFFF';
        ctx.font = '12px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('?', x + targetWidth/2, y + targetHeight/2);
        ctx.restore();
    }
}

// Draw a sub-rectangle from an asset (spritesheet frame)
function drawAssetSprite(ctx, category, name, sx, sy, sWidth, sHeight, dx, dy, dWidth, dHeight) {
    const asset = assetManager.getAsset(category, name);
    if (!asset) {
        console.warn(`Asset not found: ${category}/${name}`);
        return;
    }
    ctx.imageSmoothingEnabled = false;
    try {
        ctx.drawImage(asset, sx, sy, sWidth, sHeight, dx, dy, dWidth, dHeight);
    } catch (e) {
        console.warn('drawAssetSprite failed with params:', { sx, sy, sWidth, sHeight, dx, dy, dWidth, dHeight }, e);
    }
}
