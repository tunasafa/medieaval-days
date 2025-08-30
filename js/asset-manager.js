// Asset Manager - Simple GIF support
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
    const loadPromise = new Promise((resolve) => {
            const tryLoad = (exts) => {
                if (!exts || exts.length === 0) {
                    // All attempts failed, use fallback
                    console.warn(`Failed to load asset: ${assetKey} (tried multiple extensions)`);
                    const fallback = this.createFallbackAsset();
                    this.assets.set(assetKey, fallback);
                    this.loadPromises.delete(assetKey);
                    resolve(fallback);
                    return;
                }

                const ext = exts[0];
                const img = new Image();
                
        img.onload = () => {
                    // For units (especially GIFs), append to a hidden container to enable animation
                    if (category === 'units') {
                        const container = this._getOrCreateGifContainer();
            // Keep the image "rendered" so browsers advance GIF frames
            // Use natural size, opacity 0, and place absolutely on the page
            img.style.position = 'absolute';
            img.style.left = '0px';
            img.style.top = '0px';
            img.style.opacity = '0';
            img.style.pointerEvents = 'none';
                        container.appendChild(img);
            try { console.debug('Unit GIF attached to DOM for animation:', `${category}/${name}`); } catch {}
                    }
                    
                    this.assets.set(assetKey, img);
                    this.loadPromises.delete(assetKey);
                    resolve(img);
                };
                
                img.onerror = () => {
                    // Try next extension
                    tryLoad(exts.slice(1));
                };
                
                img.src = `${this.basePath}${category}/${name}.${ext}`;
            };

        // Units are GIF-only (animated). Buildings/resources remain PNG.
        const extsToTry = category === 'units' ? ['gif'] : ['png'];
            tryLoad(extsToTry);
        });
        this.loadPromises.set(assetKey, loadPromise);
        return loadPromise;
    }

    _getOrCreateGifContainer() {
        let container = document.getElementById('unit-gif-container');
        if (!container) {
            container = document.createElement('div');
            container.id = 'unit-gif-container';
            // Fullscreen invisible layer to ensure child GIFs are rendered
            container.style.position = 'fixed';
            container.style.left = '0px';
            container.style.top = '0px';
            container.style.width = '100%';
            container.style.height = '100%';
            container.style.overflow = 'hidden';
            container.style.pointerEvents = 'none';
            container.style.zIndex = '0';
            document.body.appendChild(container);
        }
        return container;
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

    // Check if a unit asset is a GIF
    isGifAsset(category, name) {
        const assetKey = `${category}/${name}`;
        const img = this.assets.get(assetKey);
        const result = !!img && img.src && (
            img.src.toLowerCase().includes('.gif') ||
            img.src.toLowerCase().endsWith('.gif')
        );
        return result;
    }

    // Preload all game assets
    async preloadGameAssets() {
        const assetList = [
            // Units
            // Villager directional walk GIFs
            { category: 'units', name: 'villager/walk/villager_walk_east' },
            { category: 'units', name: 'villager/walk/villager_walk_southeast' },
            { category: 'units', name: 'villager/walk/villager_walk_south' },
            { category: 'units', name: 'villager/walk/villager_walk_southwest' },
            { category: 'units', name: 'villager/walk/villager_walk_west' },
            { category: 'units', name: 'villager/walk/villager_walk_northwest' },
            // Typo-safe: current file appears as 'noth'; also try 'north'
            { category: 'units', name: 'villager/walk/villager_walk_noth' },
            { category: 'units', name: 'villager/walk/villager_walk_northeast' },
            // Villager idle GIFs (hyphenated diagonals)
            { category: 'units', name: 'villager/idle/villager-idle_east' },
            { category: 'units', name: 'villager/idle/villager-idle_south-east' },
            { category: 'units', name: 'villager/idle/villager-idle_south' },
            { category: 'units', name: 'villager/idle/villager-idle_south-west' },
            { category: 'units', name: 'villager/idle/villager-idle_west' },
            { category: 'units', name: 'villager/idle/villager-idle_north-west' },
            { category: 'units', name: 'villager/idle/villager-idle_north' },
            { category: 'units', name: 'villager/idle/villager-idle_north-east' },
            // Villager directional gather GIFs (hyphenated diagonals)
            { category: 'units', name: 'villager/gather/villager_gathering_east' },
            { category: 'units', name: 'villager/gather/villager_gathering_south-east' },
            { category: 'units', name: 'villager/gather/villager_gathering_south' },
            { category: 'units', name: 'villager/gather/villager_gathering_south-west' },
            { category: 'units', name: 'villager/gather/villager_gathering_west' },
            { category: 'units', name: 'villager/gather/villager_gathering_north-west' },
            { category: 'units', name: 'villager/gather/villager_gathering_north' },
            { category: 'units', name: 'villager/gather/villager_gathering_north-east' },
            // Keep base villager as fallback if present
            { category: 'units', name: 'villager' },
            // Archer directional walk GIFs
            { category: 'units', name: 'archer/walk/archer_walk_east' },
            { category: 'units', name: 'archer/walk/archer_walk_southeast' },
            { category: 'units', name: 'archer/walk/archer_walk_south' },
            { category: 'units', name: 'archer/walk/archer_walk_southwest' },
            { category: 'units', name: 'archer/walk/archer_walk_west' },
            { category: 'units', name: 'archer/walk/archer_walk_northwest' },
            { category: 'units', name: 'archer/walk/archer_walk_north' },
            { category: 'units', name: 'archer/walk/archer_walk_northeast' },
            // Archer south walking has a non-standard filename; preload it explicitly to avoid flicker
            { category: 'units', name: 'archer/walk/cfb79a2e-dcbb-41cb-a46c-91002f2414d5_walking-10_south' },
            // Archer attack GIFs (8 directions; support both hyphenated and non-hyphenated diagonals)
            { category: 'units', name: 'archer/attack/archer_attack_east' },
            { category: 'units', name: 'archer/attack/archer_attack_southeast' },
            { category: 'units', name: 'archer/attack/archer_attack_south' },
            { category: 'units', name: 'archer/attack/archer_attack_southwest' },
            { category: 'units', name: 'archer/attack/archer_attack_west' },
            { category: 'units', name: 'archer/attack/archer_attack_northwest' },
            { category: 'units', name: 'archer/attack/archer_attack_north' },
            { category: 'units', name: 'archer/attack/archer_attack_northeast' },
            { category: 'units', name: 'archer/attack/archer_attack_south-east' },
            { category: 'units', name: 'archer/attack/archer_attack_south-west' },
            { category: 'units', name: 'archer/attack/archer_attack_north-west' },
            { category: 'units', name: 'archer/attack/archer_attack_north-east' },
            // Archer idle GIFs (8 directions; prefer non-hyphen names, also try hyphenated)
            { category: 'units', name: 'archer/idle/archer_idle_east' },
            { category: 'units', name: 'archer/idle/archer_idle_southeast' },
            { category: 'units', name: 'archer/idle/archer_idle_south' },
            { category: 'units', name: 'archer/idle/archer_idle_southwest' },
            { category: 'units', name: 'archer/idle/archer_idle_west' },
            { category: 'units', name: 'archer/idle/archer_idle_northwest' },
            { category: 'units', name: 'archer/idle/archer_idle_north' },
            { category: 'units', name: 'archer/idle/archer_idle_northeast' },
            { category: 'units', name: 'archer/idle/archer_idle_south-east' },
            { category: 'units', name: 'archer/idle/archer_idle_south-west' },
            { category: 'units', name: 'archer/idle/archer_idle_north-west' },
            { category: 'units', name: 'archer/idle/archer_idle_north-east' },
            // Keep base archer as fallback if present
            { category: 'units', name: 'archer' },
            // Militia 8-direction idle/walk/attack
            { category: 'units', name: 'militia/idle/militia_idle-idle_east' },
            { category: 'units', name: 'militia/idle/militia_idle-idle_south-east' },
            { category: 'units', name: 'militia/idle/militia_idle-idle_south' },
            { category: 'units', name: 'militia/idle/militia_idle-idle_south-west' },
            { category: 'units', name: 'militia/idle/militia_idle-idle_west' },
            { category: 'units', name: 'militia/idle/militia_idle-idle_north-west' },
            { category: 'units', name: 'militia/idle/militia_idle-idle_north' },
            { category: 'units', name: 'militia/idle/militia_idle-idle_north-east' },
            { category: 'units', name: 'militia/walking/militia_walking_east' },
            { category: 'units', name: 'militia/walking/militia_walking_south-east' },
            { category: 'units', name: 'militia/walking/militia_walking_south' },
            { category: 'units', name: 'militia/walking/militia_walking_south-west' },
            { category: 'units', name: 'militia/walking/militia_walking_west' },
            { category: 'units', name: 'militia/walking/militia_walking_north-west' },
            { category: 'units', name: 'militia/walking/militia_walking_north' },
            { category: 'units', name: 'militia/walking/militia_walking_north-east' },
            { category: 'units', name: 'militia/attack/militia_attack_east' },
            { category: 'units', name: 'militia/attack/militia_attack_south-east' },
            { category: 'units', name: 'militia/attack/militia_attack_south' },
            { category: 'units', name: 'militia/attack/militia_attack_south-west' },
            { category: 'units', name: 'militia/attack/militia_attack_west' },
            { category: 'units', name: 'militia/attack/militia_attack_north-west' },
            { category: 'units', name: 'militia/attack/militia_attack_north' },
            { category: 'units', name: 'militia/attack/militia_attack_north-east' },
            { category: 'units', name: 'militia' },
            { category: 'units', name: 'archer' },
            { category: 'units', name: 'axeman' },
            { category: 'units', name: 'crossbowman' },
            // Crossbowman 8-direction idle/walk/attack
            { category: 'units', name: 'crossbowman/idle/crossbowman_east' },
            { category: 'units', name: 'crossbowman/idle/crossbowman_southeast' },
            { category: 'units', name: 'crossbowman/idle/crossbowman_south' },
            { category: 'units', name: 'crossbowman/idle/crossbowman_southwest' },
            { category: 'units', name: 'crossbowman/idle/crossbowman_west' },
            { category: 'units', name: 'crossbowman/idle/crossbowman_northwest' },
            { category: 'units', name: 'crossbowman/idle/crossbowman_north' },
            { category: 'units', name: 'crossbowman/idle/crossbowman_northeast' },
            { category: 'units', name: 'crossbowman/walk/crossbowman_east' },
            { category: 'units', name: 'crossbowman/walk/crossbowman_southeast' },
            { category: 'units', name: 'crossbowman/walk/crossbowman_south' },
            { category: 'units', name: 'crossbowman/walk/crossbowman_southwest' },
            { category: 'units', name: 'crossbowman/walk/crossbowman_west' },
            { category: 'units', name: 'crossbowman/walk/crossbowman_northwest' },
            { category: 'units', name: 'crossbowman/walk/crossbowman_north' },
            { category: 'units', name: 'crossbowman/walk/crossbowman_northeast' },
            { category: 'units', name: 'crossbowman/attack/crossbowman_east' },
            { category: 'units', name: 'crossbowman/attack/crossbowman_southeast' },
            { category: 'units', name: 'crossbowman/attack/crossbowman_south' },
            { category: 'units', name: 'crossbowman/attack/crossbowman_southwest' },
            { category: 'units', name: 'crossbowman/attack/crossbowman_west' },
            { category: 'units', name: 'crossbowman/attack/crossbowman_northwest' },
            { category: 'units', name: 'crossbowman/attack/crossbowman_north' },
            { category: 'units', name: 'crossbowman/attack/crossbowman_northeast' },
            // Warrior 8-direction idle (matches actual files)
            { category: 'units', name: 'warrior/idle/warrior_idle_east' },
            { category: 'units', name: 'warrior/idle/warrior_idle_south-east' },
            { category: 'units', name: 'warrior/idle/warrior_idle_south' },
            { category: 'units', name: 'warrior/idle/warrior_idle_south-west' },
            { category: 'units', name: 'warrior/idle/warrior_idle_west' },
            { category: 'units', name: 'warrior/idle/warrior_idle_north-west' },
            { category: 'units', name: 'warrior/idle/warrior_idle_north' },
            { category: 'units', name: 'warrior/idle/warrior_idle_north-east' },
            // Warrior 8-direction walking
            { category: 'units', name: 'warrior/walking/warrior_walking_east' },
            { category: 'units', name: 'warrior/walking/warrior_walking_south-east' },
            { category: 'units', name: 'warrior/walking/warrior_walking_south' },
            { category: 'units', name: 'warrior/walking/warrior_walking_south-west' },
            { category: 'units', name: 'warrior/walking/warrior_walking_west' },
            { category: 'units', name: 'warrior/walking/warrior_walking_north-west' },
            { category: 'units', name: 'warrior/walking/warrior_walking_north' },
            { category: 'units', name: 'warrior/walking/warrior_walking_north-east' },
            // Warrior 8-direction attack
            { category: 'units', name: 'warrior/attack/warrior_attack_east' },
            { category: 'units', name: 'warrior/attack/warrior_attack_south-east' },
            { category: 'units', name: 'warrior/attack/warrior_attack_south' },
            { category: 'units', name: 'warrior/attack/warrior_attack_south-west' },
            { category: 'units', name: 'warrior/attack/warrior_attack_west' },
            { category: 'units', name: 'warrior/attack/warrior_attack_north-west' },
            { category: 'units', name: 'warrior/attack/warrior_attack_north' },
            { category: 'units', name: 'warrior/attack/warrior_attack_north-east' },
            // Keep base warrior as fallback reference
            { category: 'units', name: 'warrior' },
            // Ballista 8-direction (idle/walk/attack). Match actual filenames in assets.
            { category: 'units', name: 'ballista/idle/ballista_east' },
            { category: 'units', name: 'ballista/idle/ballista_southeast' },
            { category: 'units', name: 'ballista/idle/ballista_south' },
            { category: 'units', name: 'ballista/idle/ballista_southwest' },
            { category: 'units', name: 'ballista/idle/ballista_west' },
            { category: 'units', name: 'ballista/idle/ballista_northwest' },
            { category: 'units', name: 'ballista/idle/ballista_north' },
            { category: 'units', name: 'ballista/idle/ballista_northeast' },
            { category: 'units', name: 'ballista/walk/ballista_east' },
            { category: 'units', name: 'ballista/walk/ballista_southeast' },
            { category: 'units', name: 'ballista/walk/ballista_south' },
            { category: 'units', name: 'ballista/walk/ballista_southwest' },
            { category: 'units', name: 'ballista/walk/ballista_west' },
            { category: 'units', name: 'ballista/walk/ballista_northwest' },
            { category: 'units', name: 'ballista/walk/ballista_north' },
            { category: 'units', name: 'ballista/walk/ballista_northeast' },
            { category: 'units', name: 'ballista/attack/ballista_attack_east' },
            { category: 'units', name: 'ballista/attack/ballista_attack_southeast' },
            { category: 'units', name: 'ballista/attack/ballista_attack_south' },
            { category: 'units', name: 'ballista/attack/ballista_attack_southwest' },
            { category: 'units', name: 'ballista/attack/ballista_attack_west' },
            { category: 'units', name: 'ballista/attack/ballista_attack_northwest' },
            { category: 'units', name: 'ballista/attack/ballista_attack_north' },
            { category: 'units', name: 'ballista/attack/ballista_attack_northeast' },
            { category: 'units', name: 'ballista/attack/ballista_attack_south-east' },
            { category: 'units', name: 'ballista/attack/ballista_attack_south-west' },
            { category: 'units', name: 'ballista/attack/ballista_attack_north-west' },
            { category: 'units', name: 'ballista/attack/ballista_attack_north-east' },
            // Axeman 8-direction idle/walking/attack (try both hyphenated and non-hyphenated diagonals)
            { category: 'units', name: 'axeman/idle/axeman_idle_east' },
            { category: 'units', name: 'axeman/idle/axeman_idle_southeast' },
            { category: 'units', name: 'axeman/idle/axeman_idle_south' },
            { category: 'units', name: 'axeman/idle/axeman_idle_southwest' },
            { category: 'units', name: 'axeman/idle/axeman_idle_west' },
            { category: 'units', name: 'axeman/idle/axeman_idle_northwest' },
            { category: 'units', name: 'axeman/idle/axeman_idle_north' },
            { category: 'units', name: 'axeman/idle/axeman_idle_northeast' },
            { category: 'units', name: 'axeman/idle/axeman_idle_south-east' },
            { category: 'units', name: 'axeman/idle/axeman_idle_south-west' },
            { category: 'units', name: 'axeman/idle/axeman_idle_north-west' },
            { category: 'units', name: 'axeman/idle/axeman_idle_north-east' },
            { category: 'units', name: 'axeman/walking/axeman_walking_east' },
            { category: 'units', name: 'axeman/walking/axeman_walking_southeast' },
            { category: 'units', name: 'axeman/walking/axeman_walking_south' },
            { category: 'units', name: 'axeman/walking/axeman_walking_southwest' },
            { category: 'units', name: 'axeman/walking/axeman_walking_west' },
            { category: 'units', name: 'axeman/walking/axeman_walking_northwest' },
            { category: 'units', name: 'axeman/walking/axeman_walking_north' },
            { category: 'units', name: 'axeman/walking/axeman_walking_northeast' },
            { category: 'units', name: 'axeman/walking/axeman_walking_south-east' },
            { category: 'units', name: 'axeman/walking/axeman_walking_south-west' },
            { category: 'units', name: 'axeman/walking/axeman_walking_north-west' },
            { category: 'units', name: 'axeman/walking/axeman_walking_north-east' },
            { category: 'units', name: 'axeman/attack/axeman_attack_east' },
            { category: 'units', name: 'axeman/attack/axeman_attack_southeast' },
            { category: 'units', name: 'axeman/attack/axeman_attack_south' },
            { category: 'units', name: 'axeman/attack/axeman_attack_southwest' },
            { category: 'units', name: 'axeman/attack/axeman_attack_west' },
            { category: 'units', name: 'axeman/attack/axeman_attack_northwest' },
            { category: 'units', name: 'axeman/attack/axeman_attack_north' },
            { category: 'units', name: 'axeman/attack/axeman_attack_northeast' },
            { category: 'units', name: 'axeman/attack/axeman_attack_south-east' },
            { category: 'units', name: 'axeman/attack/axeman_attack_south-west' },
            { category: 'units', name: 'axeman/attack/axeman_attack_north-west' },
            { category: 'units', name: 'axeman/attack/axeman_attack_north-east' },
            { category: 'units', name: 'axeman' },
            { category: 'units', name: 'ballista' },
            { category: 'units', name: 'catapult' },
            // Catapult 8-direction (idle/move/attack)
            { category: 'units', name: 'catapult/idle/catapult_idle_east' },
            { category: 'units', name: 'catapult/idle/catapult_idle_southeast' },
            { category: 'units', name: 'catapult/idle/catapult_idle_south' },
            { category: 'units', name: 'catapult/idle/catapult_idle_southwest' },
            { category: 'units', name: 'catapult/idle/catapult_idle_west' },
            { category: 'units', name: 'catapult/idle/catapult_idle_northwest' },
            { category: 'units', name: 'catapult/idle/catapult_idle_north' },
            { category: 'units', name: 'catapult/idle/catapult_idle_northeast' },
            { category: 'units', name: 'catapult/move/catapult_move_east' },
            { category: 'units', name: 'catapult/move/catapult_move_southeast' },
            { category: 'units', name: 'catapult/move/catapult_move_south' },
            { category: 'units', name: 'catapult/move/catapult_move_southwest' },
            { category: 'units', name: 'catapult/move/catapult_move_west' },
            { category: 'units', name: 'catapult/move/catapult_move_northwest' },
            { category: 'units', name: 'catapult/move/catapult_move_north' },
            { category: 'units', name: 'catapult/move/catapult_move_northeast' },
            { category: 'units', name: 'catapult/attack/catapult_attack_east' },
            { category: 'units', name: 'catapult/attack/catapult_attack_southeast' },
            { category: 'units', name: 'catapult/attack/catapult_attack_south' },
            { category: 'units', name: 'catapult/attack/catapult_attack_southwest' },
            { category: 'units', name: 'catapult/attack/catapult_attack_west' },
            { category: 'units', name: 'catapult/attack/catapult_attack_northwest' },
            { category: 'units', name: 'catapult/attack/catapult_attack_north' },
            { category: 'units', name: 'catapult/attack/catapult_attack_northeast' },
            { category: 'units', name: 'fishingBoat' },
            { category: 'units', name: 'transportLarge' },
            { category: 'units', name: 'warship' },
            // Navy directional sprites (same asset used for idle/move/attack states)
            { category: 'units', name: 'FishingBoat/fishingboat_east' },
            { category: 'units', name: 'FishingBoat/fishingboat_southeast' },
            { category: 'units', name: 'FishingBoat/fishingboat_south' },
            { category: 'units', name: 'FishingBoat/fishingboat_southwest' },
            { category: 'units', name: 'FishingBoat/fishingboat_west' },
            { category: 'units', name: 'FishingBoat/fishingboat_northwest' },
            { category: 'units', name: 'FishingBoat/fishingboat_north' },
            { category: 'units', name: 'FishingBoat/fishingboat_northeast' },
            { category: 'units', name: 'TransportLarge/transport_east' },
            { category: 'units', name: 'TransportLarge/transport_southeast' },
            { category: 'units', name: 'TransportLarge/transport_south' },
            { category: 'units', name: 'TransportLarge/transport_southwest' },
            { category: 'units', name: 'TransportLarge/transport_west' },
            { category: 'units', name: 'TransportLarge/transport_northwest' },
            { category: 'units', name: 'TransportLarge/transport_north' },
            { category: 'units', name: 'TransportLarge/transport_northeast' },
            { category: 'units', name: 'warship/warship_east' },
            { category: 'units', name: 'warship/warship_southeast' },
            { category: 'units', name: 'warship/warship_south' },
            { category: 'units', name: 'warship/warship_southwest' },
            { category: 'units', name: 'warship/warship_west' },
            { category: 'units', name: 'warship/warship_northwest' },
            { category: 'units', name: 'warship/warship_north' },
            { category: 'units', name: 'warship/warship_northeast' },
            // Decorations (environmental) from textures/
            { category: 'textures', name: 'bush1' },
            { category: 'textures', name: 'bush2' },
            { category: 'textures', name: 'bush3' },
            { category: 'textures', name: 'bush4' },
            { category: 'textures', name: 'tree1' },
            { category: 'textures', name: 'tree2' },
            { category: 'textures', name: 'tree3' },

            // Buildings
            { category: 'buildings', name: 'house' },
            { category: 'buildings', name: 'townCenter' },
            { category: 'buildings', name: 'barracks' },
            { category: 'buildings', name: 'archeryRange' },
            { category: 'buildings', name: 'craftery' },
            { category: 'buildings', name: 'navy' },

            // Resources (numbered variants for in-world variety; header uses *1 versions)
            { category: 'resources', name: 'food1' },
            { category: 'resources', name: 'food2' },
            { category: 'resources', name: 'food3' },
            { category: 'resources', name: 'food4' },
            { category: 'resources', name: 'food5' },
            { category: 'resources', name: 'wood1' },
            { category: 'resources', name: 'wood2' },
            { category: 'resources', name: 'wood3' },
            { category: 'resources', name: 'wood4' },
            { category: 'resources', name: 'stone1' },
            { category: 'resources', name: 'stone2' },
            { category: 'resources', name: 'gold1' },
            { category: 'resources', name: 'gold2' }
        ];

        console.log('Loading game assets...');
        await this.loadAssets(assetList);
        console.log('All game assets loaded!');
    }

    // Clean up DOM elements when no longer needed
    cleanup() {
        const container = document.getElementById('unit-gif-container');
        if (container && container.parentNode) {
            container.parentNode.removeChild(container);
        }
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
