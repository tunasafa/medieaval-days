class AssetManager {
    constructor() {
        this.assets = new Map();
        this.loadPromises = new Map();
        this.basePath = 'assets/';
    }

    async loadAsset(category, name) {
        const assetKey = `${category}/${name}`;
        
        if (this.assets.has(assetKey)) {
            return this.assets.get(assetKey);
        }

        if (this.loadPromises.has(assetKey)) {
            return this.loadPromises.get(assetKey);
        }

    const loadPromise = new Promise((resolve) => {
            const tryLoad = (exts) => {
                if (!exts || exts.length === 0) {
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
                    if (category === 'units') {
                        const container = this._getOrCreateGifContainer();
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
                    tryLoad(exts.slice(1));
                };
                
                img.src = `${this.basePath}${category}/${name}.${ext}`;
            };
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

    createFallbackAsset() {
        const canvas = document.createElement('canvas');
        canvas.width = 32;
        canvas.height = 32;
        const ctx = canvas.getContext('2d');
        
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

    async loadAssets(assetList) {
        const promises = assetList.map(asset => 
            this.loadAsset(asset.category, asset.name)
        );
        return Promise.all(promises);
    }

    getAsset(category, name) {
        const assetKey = `${category}/${name}`;
        return this.assets.get(assetKey) || this.createFallbackAsset();
    }

    isLoaded(category, name) {
        const assetKey = `${category}/${name}`;
        return this.assets.has(assetKey);
    }

    isGifAsset(category, name) {
        const assetKey = `${category}/${name}`;
        const img = this.assets.get(assetKey);
        const result = !!img && img.src && (
            img.src.toLowerCase().includes('.gif') ||
            img.src.toLowerCase().endsWith('.gif')
        );
        return result;
    }

    async preloadGameAssets() {
        const assetList = [
            { category: 'units', name: 'villager/walk/villager_walk_east' },
            { category: 'units', name: 'villager/walk/villager_walk_southeast' },
            { category: 'units', name: 'villager/walk/villager_walk_south' },
            { category: 'units', name: 'villager/walk/villager_walk_southwest' },
            { category: 'units', name: 'villager/walk/villager_walk_west' },
            { category: 'units', name: 'villager/walk/villager_walk_northwest' },
            { category: 'units', name: 'villager/walk/villager_walk_noth' },
            { category: 'units', name: 'villager/walk/villager_walk_northeast' },
            { category: 'units', name: 'villager/idle/villager-idle_east' },
            { category: 'units', name: 'villager/idle/villager-idle_south-east' },
            { category: 'units', name: 'villager/idle/villager-idle_south' },
            { category: 'units', name: 'villager/idle/villager-idle_south-west' },
            { category: 'units', name: 'villager/idle/villager-idle_west' },
            { category: 'units', name: 'villager/idle/villager-idle_north-west' },
            { category: 'units', name: 'villager/idle/villager-idle_north' },
            { category: 'units', name: 'villager/idle/villager-idle_north-east' },
            { category: 'units', name: 'villager/gather/villager_gathering_east' },
            { category: 'units', name: 'villager/gather/villager_gathering_south-east' },
            { category: 'units', name: 'villager/gather/villager_gathering_south' },
            { category: 'units', name: 'villager/gather/villager_gathering_south-west' },
            { category: 'units', name: 'villager/gather/villager_gathering_west' },
            { category: 'units', name: 'villager/gather/villager_gathering_north-west' },
            { category: 'units', name: 'villager/gather/villager_gathering_north' },
            { category: 'units', name: 'villager/gather/villager_gathering_north-east' },
            { category: 'units', name: 'villager' },
            { category: 'units', name: 'archer/walk/archer_walk_east' },
            { category: 'units', name: 'archer/walk/archer_walk_southeast' },
            { category: 'units', name: 'archer/walk/archer_walk_south' },
            { category: 'units', name: 'archer/walk/archer_walk_southwest' },
            { category: 'units', name: 'archer/walk/archer_walk_west' },
            { category: 'units', name: 'archer/walk/archer_walk_northwest' },
            { category: 'units', name: 'archer/walk/archer_walk_north' },
            { category: 'units', name: 'archer/walk/archer_walk_northeast' },
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
            { category: 'units', name: 'archer' },
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
            { category: 'units', name: 'warrior/idle/warrior_idle_east' },
            { category: 'units', name: 'warrior/idle/warrior_idle_south-east' },
            { category: 'units', name: 'warrior/idle/warrior_idle_south' },
            { category: 'units', name: 'warrior/idle/warrior_idle_south-west' },
            { category: 'units', name: 'warrior/idle/warrior_idle_west' },
            { category: 'units', name: 'warrior/idle/warrior_idle_north-west' },
            { category: 'units', name: 'warrior/idle/warrior_idle_north' },
            { category: 'units', name: 'warrior/idle/warrior_idle_north-east' },
            { category: 'units', name: 'warrior/walking/warrior_walking_east' },
            { category: 'units', name: 'warrior/walking/warrior_walking_south-east' },
            { category: 'units', name: 'warrior/walking/warrior_walking_south' },
            { category: 'units', name: 'warrior/walking/warrior_walking_south-west' },
            { category: 'units', name: 'warrior/walking/warrior_walking_west' },
            { category: 'units', name: 'warrior/walking/warrior_walking_north-west' },
            { category: 'units', name: 'warrior/walking/warrior_walking_north' },
            { category: 'units', name: 'warrior/walking/warrior_walking_north-east' },
            { category: 'units', name: 'warrior/attack/warrior_attack_east' },
            { category: 'units', name: 'warrior/attack/warrior_attack_south-east' },
            { category: 'units', name: 'warrior/attack/warrior_attack_south' },
            { category: 'units', name: 'warrior/attack/warrior_attack_south-west' },
            { category: 'units', name: 'warrior/attack/warrior_attack_west' },
            { category: 'units', name: 'warrior/attack/warrior_attack_north-west' },
            { category: 'units', name: 'warrior/attack/warrior_attack_north' },
            { category: 'units', name: 'warrior/attack/warrior_attack_north-east' },
            { category: 'units', name: 'warrior' },
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
            { category: 'textures', name: 'bush1' },
            { category: 'textures', name: 'bush2' },
            { category: 'textures', name: 'bush3' },
            { category: 'textures', name: 'bush4' },
            { category: 'textures', name: 'tree1' },
            { category: 'textures', name: 'tree2' },
            { category: 'textures', name: 'tree3' },
            { category: 'buildings', name: 'house' },
            { category: 'buildings', name: 'townCenter' },
            { category: 'buildings', name: 'barracks' },
            { category: 'buildings', name: 'archeryRange' },
            { category: 'buildings', name: 'craftery' },
            { category: 'buildings', name: 'navy' },
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

    cleanup() {
        const container = document.getElementById('unit-gif-container');
        if (container && container.parentNode) {
            container.parentNode.removeChild(container);
        }
    }
}

const assetManager = new AssetManager();

async function ensureAssetLoaded(category, name) {
    if (!assetManager.isLoaded(category, name)) {
        await assetManager.loadAsset(category, name);
    }
    return assetManager.getAsset(category, name);
}

function drawAsset(ctx, category, name, x = 0, y = 0, scale = 1) {
    const asset = assetManager.getAsset(category, name);
    
    if (asset) {
        const width = asset.width * scale;
        const height = asset.height * scale;
        
        ctx.imageSmoothingEnabled = true;
        ctx.drawImage(asset, x, y, width, height);
    } else {
        console.warn(`Asset not found: ${category}/${name}`);
    }
}

function drawAssetFitted(ctx, category, name, x, y, targetWidth, targetHeight) {
    const asset = assetManager.getAsset(category, name);
    
    if (asset) {
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(asset, x, y, targetWidth, targetHeight);
    } else {
        console.warn(`Asset not found: ${category}/${name} - drawing fallback`);
        ctx.fillStyle = '#FF00FF';
        ctx.fillRect(x, y, targetWidth, targetHeight);
        ctx.fillStyle = '#FFFFFF';
        ctx.font = '12px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('?', x + targetWidth/2, y + targetHeight/2);
    }
}


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
function drawAssetTinted(ctx, category, name, x, y, targetWidth, targetHeight, alpha = 0.7, tintColor = null) {
    const asset = assetManager.getAsset(category, name);
    
    if (asset) {
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(asset, x, y, targetWidth, targetHeight);
        
        if (tintColor) {
            ctx.globalCompositeOperation = 'multiply';
            ctx.fillStyle = tintColor;
            ctx.fillRect(x, y, targetWidth, targetHeight);
        }
        
        ctx.restore();
    } else {
        console.warn(`Asset not found: ${category}/${name} - drawing fallback`);
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
