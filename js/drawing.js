// Drawing Functions
// Simple DOM overlay for animated GIF units so they animate like regular images
let __unitOverlayDiv = null;
function getUnitOverlay() {
    if (!__unitOverlayDiv) {
        __unitOverlayDiv = document.createElement('div');
        __unitOverlayDiv.id = 'unit-overlay';
        __unitOverlayDiv.style.position = 'absolute';
        __unitOverlayDiv.style.left = '0px';
        __unitOverlayDiv.style.top = '0px';
        __unitOverlayDiv.style.width = '0px';
        __unitOverlayDiv.style.height = '0px';
        __unitOverlayDiv.style.pointerEvents = 'none';
        __unitOverlayDiv.style.zIndex = '2'; // above canvas
        document.body.appendChild(__unitOverlayDiv);
    }
    return __unitOverlayDiv;
}

function syncOverlayToCanvas() {
    const canvas = document.getElementById('gameCanvas');
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const overlay = getUnitOverlay();
    overlay.style.left = `${rect.left + window.scrollX}px`;
    overlay.style.top = `${rect.top + window.scrollY}px`;
    overlay.style.width = `${rect.width}px`;
    overlay.style.height = `${rect.height}px`;
}

// Compute the aim point for attack direction/range checks.
// If targetPoint is provided, use it. If target has width/height (e.g., a building),
// aim at the nearest point on its rectangle to the unit. Otherwise, aim at target center.
function computeAttackAim(unit, target, targetPoint) {
    // If target is a building (has width/height), always aim at the nearest point
    // on its rectangle to the unit, regardless of a provided targetPoint.
    if (target && typeof target.x === 'number' && typeof target.y === 'number') {
        const hasBox = target.width != null && target.height != null;
        if (hasBox) {
            const left = target.x;
            const top = target.y;
            const right = target.x + target.width;
            const bottom = target.y + target.height;
            const tx = Math.max(left, Math.min(unit.x, right));
            const ty = Math.max(top, Math.min(unit.y, bottom));
            return { tx, ty };
        }
    }
    // For point/unit targets without a bounding box, prefer explicit targetPoint
    if (targetPoint && typeof targetPoint.x === 'number' && typeof targetPoint.y === 'number') {
        return { tx: targetPoint.x, ty: targetPoint.y };
    }
    if (target && typeof target.x === 'number' && typeof target.y === 'number') {
        const cx = target.x + (target.width ? target.width / 2 : 0);
        const cy = target.y + (target.height ? target.height / 2 : 0);
        return { tx: cx, ty: cy };
    }
    return { tx: unit.x, ty: unit.y };
}


function mapDirForAssets(dir) {
    switch (dir) {
        case 'southeast': return 'southwest';
        case 'southwest': return 'southeast';
        case 'northeast': return 'northwest';
        case 'northwest': return 'northeast';
        case 'east': return 'west';
        case 'west': return 'east';
        default: return dir;
    }
}
function drawWorldObjects(ctx) {
    gameState.worldObjects.forEach(obj => {
        if (obj.type === 'resource' && (obj.amount === 0 || obj.amount <= 0)) {
            return;
        }
        const drawX = obj.x - gameState.camera.x;
        const drawY = obj.y - gameState.camera.y;
        if (drawX + obj.width < 0 || drawX > GAME_CONFIG.canvas.width ||
            drawY + obj.height < 0 || drawY > GAME_CONFIG.canvas.height) return;

    if (obj.type === 'resource') {
            ctx.save();
            ctx.translate(drawX, drawY);
            const isGold = obj.resourceType === 'gold';
            const isBigFoodVariant = obj.resourceType === 'food' && (obj.spriteName === 'food4' || obj.spriteName === 'food5');
            let scaleW = obj.width;
            let scaleH = obj.height;
            if (isGold) {
                scaleW *= 0.5;
                scaleH *= 0.5;
            }
            if (isBigFoodVariant) {
                scaleW *= 2;
                scaleH *= 2;
            }
            const offsetX = (obj.width - scaleW) / 2;
            const offsetY = (obj.height - scaleH) / 2;
            if (obj.spriteName) {
                drawAssetFitted(ctx, 'resources', obj.spriteName, offsetX, offsetY, scaleW, scaleH);
            } else {
                if (obj.resourceType === 'food') {
                    const scale = isBigFoodVariant ? (obj.width / 8) * 2 : (obj.width / 8);
                    drawFoodIcon(ctx, scale);
                } else if (obj.resourceType === 'wood') {
                    drawWoodIcon(ctx, obj.width / 8);
                } else if (obj.resourceType === 'stone') {
                    drawStoneIcon(ctx, obj.width / 8);
                } else if (obj.resourceType === 'gold') {
                    drawGoldIcon(ctx, (obj.width / 8) * 0.5);
                }
            }
            ctx.restore();
        } else if (obj.type === 'decoration') {
            const offsetX = 0;
            const offsetY = 0;

            if (obj.spriteName) {
                drawAssetFitted(ctx, 'textures', obj.spriteName, drawX + offsetX, drawY + offsetY, obj.width, obj.height);
            }
        } else if (obj.type === 'water') {
            // Water is drawn by the tilemap system. Skip rectangle overlay.
            return;
        } else if (obj.type === 'bridge') {
            // Draw a lighter wood bridge with subtle texture planks
            const w = obj.width, h = obj.height;
            const x = drawX, y = drawY;
            const cornerRadius = Math.min(24, Math.min(w, h) * 0.3);
            // Base
            ctx.fillStyle = obj.color || '#C8A165';
            drawRoundedRect(ctx, x, y, w, h, cornerRadius, true, false);
            // Grain lines
            ctx.strokeStyle = 'rgba(94, 62, 26, 0.25)';
            ctx.lineWidth = 1;
            for (let i = 0; i < 6; i++) {
                const gx = x + (i + 1) * (w / 7);
                ctx.beginPath();
                ctx.moveTo(gx, y + 4);
                ctx.lineTo(gx, y + h - 4);
                ctx.stroke();
            }
            // Plank seams
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
            for (let j = 0; j < Math.max(2, Math.floor(h / 10)); j++) {
                const gy = y + (j + 1) * (h / (Math.max(2, Math.floor(h / 10)) + 1));
                ctx.beginPath();
                ctx.moveTo(x + 6, gy);
                ctx.lineTo(x + w - 6, gy);
                ctx.stroke();
            }
        } else {
            ctx.fillStyle = obj.color;
            ctx.fillRect(drawX, drawY, obj.width, obj.height);
        }
    });
}


function getUnitDomId(unit) {
    if (!unit.__uid) {
        unit.__uid = unit.id != null ? String(unit.id) : `${unit.type}-${Math.random().toString(36).slice(2)}`;
    }
    return unit.__uid;
}

function drawUnits(ctx) {

    syncOverlayToCanvas();
    gameState.units.forEach(unit => drawUnit(ctx, unit));
    gameState.enemyUnits.forEach(unit => drawUnit(ctx, unit));

    const overlay = getUnitOverlay();
    const validIds = new Set([
        ...gameState.units.map(u => getUnitDomId(u)),
        ...gameState.enemyUnits.map(u => getUnitDomId(u))
    ]);
    overlay.querySelectorAll('img[data-unit-id]').forEach(img => {
        if (!validIds.has(img.dataset.unitId)) {
            if (img.parentNode) img.parentNode.removeChild(img);
        }
    });
}

function drawUnit(ctx, unit) {
    const drawX = unit.x - gameState.camera.x;
    const drawY = unit.y - gameState.camera.y;
    const inView = !(drawX < -30 || drawX > GAME_CONFIG.canvas.width + 30 ||
        drawY < -30 || drawY > GAME_CONFIG.canvas.height + 30);
    if (!inView) {
        if (unit._domGif) unit._domGif.style.display = 'none';
        return;
    }

    ctx.save();
    ctx.shadowColor = 'rgba(0, 0, 0, 0.3)';
    ctx.shadowBlur = 3;
    ctx.shadowOffsetY = 2;

    ctx.translate(drawX, drawY);
    const unitSize = 24; 

    let baseImg = assetManager.getAsset('units', unit.type);
    let hasGif = baseImg && (baseImg.src || '').toLowerCase().endsWith('.gif');

    let img = baseImg;
    if (unit.type === 'villager' || unit.type === 'militia' || unit.type === 'warrior' || unit.type === 'axeman' || unit.type === 'archer') {
        const prevX = unit.__drawPrevX ?? unit.x;
        const prevY = unit.__drawPrevY ?? unit.y;
        const dx = unit.x - prevX;
        const dy = unit.y - prevY;
        unit.__drawPrevX = unit.x;
        unit.__drawPrevY = unit.y;
        const moving = Math.hypot(dx, dy) > 0.15;
        const dirs = ['east','northeast','north','northwest','west','southwest','south','southeast'];
        if (!unit._faceDir) unit._faceDir = 'south';
        if (moving) {
            const angle = Math.atan2(dy, dx);
            const idx = (Math.round(((angle + Math.PI) / (Math.PI / 4))) % 8 + 8) % 8;
            unit._faceDir = dirs[idx];
        }

    let dir = unit._faceDir;

    unit._lastFaceNatural = unit._faceDir;


        let useGather = false;
        if (unit.type === 'villager' && unit.state === 'gathering' && unit.targetResource) {
            const rx = unit.targetResource.x + unit.targetResource.width / 2 + (unit.gatherOffset?.dx || 0);
            const ry = unit.targetResource.y + unit.targetResource.height / 2 + (unit.gatherOffset?.dy || 0);
            const gdx = rx - unit.x;
            const gdy = ry - unit.y;
            const dist = Math.hypot(gdx, gdy);
            if (dist <= 20) {
                const gAngle = Math.atan2(gdy, gdx);
                const gIdx = (Math.round(((gAngle + Math.PI) / (Math.PI / 4))) % 8 + 8) % 8;
                const faceToward = dirs[gIdx];
                dir = faceToward;
                useGather = true;
            }
        }

        const prefix = unit.type;
    let fileBase;
    let altBase;
    let fileCandidates = null; 
    let useAttack = false;
    let attackDir = dir;
    if ((unit.type === 'archer' || unit.type === 'militia' || unit.type === 'warrior' || unit.type === 'axeman' || unit.type === 'crossbowman') && unit.state === 'attacking' && unit.target) {
        const cfg = GAME_CONFIG.units[unit.type] || {};
        const range = cfg.attackRange || 40;
        const { tx, ty } = computeAttackAim(unit, unit.target, unit.targetPoint);
        const adx = tx - unit.x;
        const ady = ty - unit.y;
        const dist = Math.hypot(adx, ady);
            if (dist <= range + 5) {
               
                const aAngle = Math.atan2(ady, adx);
                const aIdx = (Math.round(((aAngle + Math.PI) / (Math.PI / 4))) % 8 + 8) % 8;
                const rawAttackDir = dirs[aIdx];
              
                attackDir = rawAttackDir;
                useAttack = true;
            }
           
            const justAttacked = unit.lastAttack && (Date.now() - unit.lastAttack < 800);
            if (!useAttack && justAttacked) {
                const aAngle = Math.atan2(ady, adx);
                const aIdx = (Math.round(((aAngle + Math.PI) / (Math.PI / 4))) % 8 + 8) % 8;
                const rawAttackDir = dirs[aIdx];
                attackDir = rawAttackDir;
                useAttack = true;
            }
        }
        if (unit.type === 'villager' && useGather) {

            const hyphenDir = mapDirForAssets(dir).replace('northeast','north-east')
                                 .replace('northwest','north-west')
                                 .replace('southeast','south-east')
                                 .replace('southwest','south-west');
            fileBase = `villager/gather/villager_gathering_${hyphenDir}`;
            altBase = fileBase;
        } else if (useAttack) {
       
            if (unit.type === 'militia') {
                const finalAttackDir = mapDirForAssets(attackDir);
                const hyphenDir = finalAttackDir.replace('northeast','north-east')
                                     .replace('northwest','north-west')
                                     .replace('southeast','south-east')
                                     .replace('southwest','south-west');
                fileBase = `militia/attack/militia_attack_${hyphenDir}`;
            } else if (unit.type === 'warrior') {
                const finalAttackDir = mapDirForAssets(attackDir);
                const hyphenDir = finalAttackDir.replace('northeast','north-east')
                                     .replace('northwest','north-west')
                                     .replace('southeast','south-east')
                                     .replace('southwest','south-west');
                fileCandidates = [
                    `warrior/attack/warrior_attack_${hyphenDir}`,
                    `warrior/attack/warrior_attack_${finalAttackDir}`
                ];
            } else if (unit.type === 'axeman') {
                const finalAttackDir = mapDirForAssets(attackDir);
                const hyphenDir = finalAttackDir.replace('northeast','north-east')
                                     .replace('northwest','north-west')
                                     .replace('southeast','south-east')
                                     .replace('southwest','south-west');
                fileCandidates = [
                    `axeman/attack/axeman_attack_${hyphenDir}`,
                    `axeman/attack/axeman_attack_${finalAttackDir}`
                ];
            } else {

                const finalAttackDir = mapDirForAssets(attackDir);
                const hyphenDir = finalAttackDir.replace('northeast','north-east')
                                     .replace('northwest','north-west')
                                     .replace('southeast','south-east')
                                     .replace('southwest','south-west');
                fileCandidates = [
                    `archer/attack/archer_attack_${finalAttackDir}`,
                    `archer/attack/archer_attack_${hyphenDir}`
                ];
            }
            altBase = fileBase;
        } else if (unit.type === 'villager' && unit.state === 'idle') {
            const idleFaceRaw = unit._lastFaceNatural || 'south';
            const idleDir = mapDirForAssets(idleFaceRaw)
                .replace('northeast','north-east')
                .replace('northwest','north-west')
                .replace('southeast','south-east')
                .replace('southwest','south-west');
            fileBase = `villager/idle/villager-idle_${idleDir}`;
            altBase = fileBase;
    } else if (unit.type === 'militia' && unit.state === 'idle') {

            const idleFaceRaw = unit._lastFaceNatural || 'south';
            const idleDir = mapDirForAssets(idleFaceRaw)
                .replace('northeast','north-east')
                .replace('northwest','north-west')
                .replace('southeast','south-east')
                .replace('southwest','south-west');
            fileBase = `militia/idle/militia_idle-idle_${idleDir}`;
            altBase = fileBase;
    } else if (unit.type === 'warrior' && unit.state === 'idle') {
            // Warrior idle: use last natural facing
            const idleFaceRaw = unit._lastFaceNatural || 'south';
            const hyphenDir = mapDirForAssets(idleFaceRaw)
                .replace('northeast','north-east')
                .replace('northwest','north-west')
                .replace('southeast','south-east')
                .replace('southwest','south-west');
            fileCandidates = [
                `warrior/idle/warrior_idle_${hyphenDir}`
            ];
    } else if (unit.type === 'axeman' && unit.state === 'idle') {
            // Axeman idle: use last natural facing
            const idleFaceRaw = unit._lastFaceNatural || 'south';
            const hyphenDir = mapDirForAssets(idleFaceRaw)
                .replace('northeast','north-east')
                .replace('northwest','north-west')
                .replace('southeast','south-east')
                .replace('southwest','south-west');
            fileCandidates = [
                `axeman/idle/axeman_idle_${hyphenDir}`,
                `axeman/idle/axeman_idle_${idleFaceRaw}`
            ];
        } else if (unit.type === 'archer' && unit.state === 'idle') {
            // Archer idle: use last natural facing
            const idleFaceRaw = unit._lastFaceNatural || 'south';
            const hyphenDir = mapDirForAssets(idleFaceRaw)
                .replace('northeast','north-east')
                .replace('northwest','north-west')
                .replace('southeast','south-east')
                .replace('southwest','south-west');
            fileCandidates = [
                `archer/idle/archer_idle_${hyphenDir}`,
                `archer/idle/archer_idle_${idleFaceRaw}`
            ];
        } else {
            // Walking animations
            if (prefix === 'militia') {
                const hyphenDir = mapDirForAssets(dir).replace('northeast','north-east')
                                     .replace('northwest','north-west')
                                     .replace('southeast','south-east')
                                     .replace('southwest','south-west');
                fileBase = `militia/walking/militia_walking_${hyphenDir}`;
                altBase = fileBase;
            } else if (prefix === 'warrior') {
                const hyphenDir = mapDirForAssets(dir).replace('northeast','north-east')
                                     .replace('northwest','north-west')
                                     .replace('southeast','south-east')
                                     .replace('southwest','south-west');
               
                fileCandidates = [
                    `warrior/walking/warrior_walking_${hyphenDir}`,
                    `warrior/walking/warrior_walking_${mapDirForAssets(dir)}`
                ];
            } else if (prefix === 'axeman') {
                const hyphenDir = mapDirForAssets(dir).replace('northeast','north-east')
                                     .replace('northwest','north-west')
                                     .replace('southeast','south-east')
                                     .replace('southwest','south-west');
                fileCandidates = [
                    `axeman/walking/axeman_walking_${hyphenDir}`,
                    `axeman/walking/axeman_walking_${mapDirForAssets(dir)}`
                ];
        } else {
                const md = mapDirForAssets(dir);
                fileBase = `${prefix}/walk/${prefix}_walk_${md}`;
                altBase = (prefix === 'villager' && md === 'north') ? `${prefix}/walk/${prefix}_walk_noth` : fileBase;
            }
        }
        const isRealGif = (name) => name && assetManager.isLoaded('units', name) && assetManager.isGifAsset('units', name);
        // Build a unified candidate list (supports warrior arrays + fileBase/altBase strings)
        const candidates = [];
        if (fileCandidates && Array.isArray(fileCandidates)) candidates.push(...fileCandidates);
        if (fileBase) candidates.push(fileBase);
        if (altBase) candidates.push(altBase);
        let chosen = null;
        for (const name of candidates) {
            if (isRealGif(name)) { chosen = name; break; }
        }
        if (chosen) {
            img = assetManager.getAsset('units', chosen);
            hasGif = true;
        } else {
            // Begin loading all candidates; whichever resolves first will be used next frame
            candidates.forEach(name => {
                if (name) assetManager.loadAsset('units', name).catch(() => {});
            });
        }
    } else if (unit.type === 'crossbowman') {
        // Crossbowman: 8-direction idle/walk/attack using files crossbowman/{state}/crossbowman_{dir}.gif
        const prevX = unit.__drawPrevX ?? unit.x;
        const prevY = unit.__drawPrevY ?? unit.y;
        const dx = unit.x - prevX;
        const dy = unit.y - prevY;
        unit.__drawPrevX = unit.x;
        unit.__drawPrevY = unit.y;
        const moving = Math.hypot(dx, dy) > 0.15;
        const dirs = ['east','northeast','north','northwest','west','southwest','south','southeast'];
        if (!unit._faceDir) unit._faceDir = 'south';
        if (moving) {
            const angle = Math.atan2(dy, dx);
            const idx = (Math.round(((angle + Math.PI) / (Math.PI / 4))) % 8 + 8) % 8;
            unit._faceDir = dirs[idx];
            unit._lastFaceNatural = unit._faceDir;
        }
        // Attack direction when in range
        const cfg = GAME_CONFIG.units[unit.type] || {};
        let useAttack = false;
        let dir = unit._faceDir;
        if (unit.state === 'attacking' && unit.target) {
            const range = cfg.attackRange || 60;
            const { tx, ty } = computeAttackAim(unit, unit.target, unit.targetPoint);
            const adx = tx - unit.x;
            const ady = ty - unit.y;
            const dist = Math.hypot(adx, ady);
            if (dist <= range + 2) {
                const aAngle = Math.atan2(ady, adx);
                const aIdx = (Math.round(((aAngle + Math.PI) / (Math.PI / 4))) % 8 + 8) % 8;
                dir = dirs[aIdx];
                useAttack = true;
            }
            const justAttacked = unit.lastAttack && (Date.now() - unit.lastAttack < 800);
            if (!useAttack && justAttacked) {
                const aAngle = Math.atan2(ady, adx);
                const aIdx = (Math.round(((aAngle + Math.PI) / (Math.PI / 4))) % 8 + 8) % 8;
                dir = dirs[aIdx];
                useAttack = true;
            }
        }
    // Apply filename direction mapping for all states
    const renderDir = mapDirForAssets(dir);
        const hyphenDir = (d) => d.replace('northeast','north-east')
                                   .replace('northwest','north-west')
                                   .replace('southeast','south-east')
                                   .replace('southwest','south-west');
        let candidates = [];
        if (useAttack) {
            candidates = [
                `crossbowman/attack/crossbowman_${renderDir}`,
                `crossbowman/attack/crossbowman_${hyphenDir(renderDir)}`
            ];
        } else if (unit.state === 'idle') {
            const idleDir = mapDirForAssets(unit._lastFaceNatural || 'south');
            candidates = [
                `crossbowman/idle/crossbowman_${idleDir}`,
                `crossbowman/idle/crossbowman_${hyphenDir(idleDir)}`
            ];
        } else {
            const moveDir = mapDirForAssets(unit._faceDir);
            candidates = [
                `crossbowman/walk/crossbowman_${moveDir}`,
                `crossbowman/walk/crossbowman_${hyphenDir(moveDir)}`
            ];
        }
        const isRealGif = (name) => name && assetManager.isLoaded('units', name) && assetManager.isGifAsset('units', name);
        let chosen = null;
        for (const name of candidates) { if (isRealGif(name)) { chosen = name; break; } }
        if (chosen) {
            img = assetManager.getAsset('units', chosen);
            hasGif = true;
        } else {
            candidates.forEach(name => { if (name) assetManager.loadAsset('units', name).catch(() => {}); });
        }
    } else if (unit.type === 'ballista') {
        // Directional GIF selection for Ballista (8-way idle/move/attack). No left/right inversion.
        const prevX = unit.__drawPrevX ?? unit.x;
        const prevY = unit.__drawPrevY ?? unit.y;
        const dx = unit.x - prevX;
        const dy = unit.y - prevY;
        unit.__drawPrevX = unit.x;
        unit.__drawPrevY = unit.y;
        const moving = Math.hypot(dx, dy) > 0.15;
        const dirs = ['east','northeast','north','northwest','west','southwest','south','southeast'];
        if (!unit._faceDir) unit._faceDir = 'south';
        if (moving) {
            const angle = Math.atan2(dy, dx);
            const idx = (Math.round(((angle + Math.PI) / (Math.PI / 4))) % 8 + 8) % 8;
            unit._faceDir = dirs[idx];
        }
    let dir = unit._faceDir;
        // Attack direction when in range
        let useAttack = false;
        if (unit.state === 'attacking' && unit.target) {
            const cfg = GAME_CONFIG.units[unit.type] || {};
            const range = cfg.attackRange || 40;
            const { tx, ty } = computeAttackAim(unit, unit.target, unit.targetPoint);
            const adx = tx - unit.x;
            const ady = ty - unit.y;
            const dist = Math.hypot(adx, ady);
            if (dist <= range + 2) {
                const aAngle = Math.atan2(ady, adx);
                const aIdx = (Math.round(((aAngle + Math.PI) / (Math.PI / 4))) % 8 + 8) % 8;
                dir = dirs[aIdx];
                useAttack = true;
            }
            const justAttacked = unit.lastAttack && (Date.now() - unit.lastAttack < 800);
            if (!useAttack && justAttacked) {
                const aAngle = Math.atan2(ady, adx);
                const aIdx = (Math.round(((aAngle + Math.PI) / (Math.PI / 4))) % 8 + 8) % 8;
                dir = dirs[aIdx];
                useAttack = true;
            }
        }
    // No inversions for ballista; apply mapping for filenames
    let renderDir = mapDirForAssets(dir);

        const hyphenDir = renderDir.replace('northeast','north-east')
                                   .replace('northwest','north-west')
                                   .replace('southeast','south-east')
                                   .replace('southwest','south-west');
        let candidates = [];
        if (useAttack) {
            candidates = [
                `ballista/attack/ballista_attack_${hyphenDir}`,
                `ballista/attack/ballista_attack_${renderDir}`
            ];
        } else if (unit.state === 'idle') {
            // Actual files are ballista/idle/ballista_{dir}.gif (no "idle" in filename)
            candidates = [
                `ballista/idle/ballista_${renderDir}`,
                `ballista/idle/ballista_${hyphenDir}`,
                // Fall back to previously assumed naming just in case
                `ballista/idle/ballista_idle_${renderDir}`,
                `ballista/idle/ballista_idle_${hyphenDir}`
            ];
        } else {
            // Movement: actual files are ballista/walk/ballista_{dir}.gif
            candidates = [
                `ballista/walk/ballista_${renderDir}`,
                `ballista/walk/ballista_${hyphenDir}`
            ];
        }
        const isRealGif = (name) => name && assetManager.isLoaded('units', name) && assetManager.isGifAsset('units', name);
        let chosen = null;
        for (const name of candidates) {
            if (isRealGif(name)) { chosen = name; break; }
        }
        if (chosen) {
            img = assetManager.getAsset('units', chosen);
            hasGif = true;
        } else {
            candidates.forEach(name => { if (name) assetManager.loadAsset('units', name).catch(() => {}); });
        }
    } else if (unit.type === 'catapult') {
        // Catapult directional selection (8-way idle/move/attack).
        const prevX = unit.__drawPrevX ?? unit.x;
        const prevY = unit.__drawPrevY ?? unit.y;
        const dx = unit.x - prevX;
        const dy = unit.y - prevY;
        unit.__drawPrevX = unit.x;
        unit.__drawPrevY = unit.y;
        const moving = Math.hypot(dx, dy) > 0.15;
        const dirs = ['east','northeast','north','northwest','west','southwest','south','southeast'];
        if (!unit._faceDir) unit._faceDir = 'south';
        if (moving) {
            const angle = Math.atan2(dy, dx);
            const idx = (Math.round(((angle + Math.PI) / (Math.PI / 4))) % 8 + 8) % 8;
            unit._faceDir = dirs[idx];
        }
    let dir = unit._faceDir;
        let renderDir = mapDirForAssets(dir);
        let candidates = [];
        const cfg = GAME_CONFIG.units[unit.type] || {};
        let useAttack = false;
        if (unit.state === 'attacking' && unit.target) {
            const range = cfg.attackRange || 40;
            const { tx, ty } = computeAttackAim(unit, unit.target, unit.targetPoint);
            const adx = tx - unit.x;
            const ady = ty - unit.y;
            const dist = Math.hypot(adx, ady);
            if (dist <= range + 2) {
                const aAngle = Math.atan2(ady, adx);
                const aIdx = (Math.round(((aAngle + Math.PI) / (Math.PI / 4))) % 8 + 8) % 8;
        dir = dirs[aIdx];
                useAttack = true;
            }
            const justAttacked = unit.lastAttack && (Date.now() - unit.lastAttack < 800);
            if (!useAttack && justAttacked) {
                const aAngle = Math.atan2(ady, adx);
                const aIdx = (Math.round(((aAngle + Math.PI) / (Math.PI / 4))) % 8 + 8) % 8;
                dir = dirs[aIdx];
                useAttack = true;
            }
        }
        // Refresh renderDir after any potential attack-direction change
        renderDir = mapDirForAssets(dir);
    const hyphenDir = renderDir.replace('northeast','north-east')
                   .replace('northwest','north-west')
                   .replace('southeast','south-east')
                   .replace('southwest','south-west');
    if (useAttack) {
            // Use raw direction for attack animations
            candidates = [
        `catapult/attack/catapult_attack_${renderDir}`,
                `catapult/attack/catapult_attack_${hyphenDir}`
            ];
        } else if (unit.state === 'idle') {
            candidates = [
        `catapult/idle/catapult_idle_${renderDir}`,
                `catapult/idle/catapult_idle_${hyphenDir}`
            ];
        } else {
            candidates = [
        `catapult/move/catapult_move_${renderDir}`,
                `catapult/move/catapult_move_${hyphenDir}`
            ];
        }
        const isRealGif = (name) => name && assetManager.isLoaded('units', name) && assetManager.isGifAsset('units', name);
        let chosen = null;
        for (const name of candidates) {
            if (isRealGif(name)) { chosen = name; break; }
        }
        if (chosen) {
            img = assetManager.getAsset('units', chosen);
            hasGif = true;
        } else {
            candidates.forEach(name => { if (name) assetManager.loadAsset('units', name).catch(() => {}); });
        }
    } else if (unit.type === 'fishingBoat' || unit.type === 'transportLarge' || unit.type === 'warship') {
    // Navy units: use the same directional GIFs for all states (idle/move/attack/fishing), no inversions
        const prevX = unit.__drawPrevX ?? unit.x;
        const prevY = unit.__drawPrevY ?? unit.y;
        const dx = unit.x - prevX;
        const dy = unit.y - prevY;
        unit.__drawPrevX = unit.x;
        unit.__drawPrevY = unit.y;
        const moving = Math.hypot(dx, dy) > 0.15;
        const dirs = ['east','northeast','north','northwest','west','southwest','south','southeast'];
        if (!unit._faceDir) unit._faceDir = 'south';
        if (moving) {
            const angle = Math.atan2(dy, dx);
            const idx = (Math.round(((angle + Math.PI) / (Math.PI / 4))) % 8 + 8) % 8;
            unit._faceDir = dirs[idx];
        }
        let dir = unit._faceDir;
    const renderDir = mapDirForAssets(dir);
        const hyphenDir = renderDir.replace('northeast','north-east')
                             .replace('northwest','north-west')
                             .replace('southeast','south-east')
                             .replace('southwest','south-west');
        // Folder and filename base per unit type
        let folder, base;
        if (unit.type === 'fishingBoat') { folder = 'FishingBoat'; base = 'fishingboat_'; }
        else if (unit.type === 'transportLarge') { folder = 'TransportLarge'; base = 'transport_'; }
        else { folder = 'warship'; base = 'warship_'; }
        const candidates = [
            `${folder}/${base}${renderDir}`,
            `${folder}/${base}${hyphenDir}`
        ];
        const isRealGif = (name) => name && assetManager.isLoaded('units', name) && assetManager.isGifAsset('units', name);
        let chosen = null;
        for (const name of candidates) { if (isRealGif(name)) { chosen = name; break; } }
        if (chosen) {
            img = assetManager.getAsset('units', chosen);
            hasGif = true;
        } else {
            candidates.forEach(name => { if (name) assetManager.loadAsset('units', name).catch(() => {}); });
        }
    }
    if (hasGif) {
        const nW = img.naturalWidth || img.width || 2;
        const nH = img.naturalHeight || img.height || 2;
        const circleRadius = 18;
        const maxD = circleRadius * 2 - 4;
        const scale = Math.min(maxD / nW, maxD / nH);
        let dw = Math.max(1, Math.floor(nW * scale));
        let dh = Math.max(1, Math.floor(nH * scale));
    // Scale units: Axeman 6x (2x bigger than current 3x), other infantry 3x
    if (unit.type === 'axeman') {
            dw = Math.max(1, Math.floor(dw * 6));
            dh = Math.max(1, Math.floor(dh * 6));
    } else if (unit.type === 'crossbowman') {
            dw = Math.max(1, Math.floor(dw * 6));
            dh = Math.max(1, Math.floor(dh * 6));
    } else if (unit.type === 'villager' || unit.type === 'archer' || unit.type === 'militia' || unit.type === 'warrior') {
            dw = Math.max(1, Math.floor(dw * 3));
            dh = Math.max(1, Math.floor(dh * 3));
        } else if (unit.type === 'ballista') {
            // Make ballista 3x bigger
            dw = Math.max(1, Math.floor(dw * 3));
            dh = Math.max(1, Math.floor(dh * 3));
        } else if (unit.type === 'catapult') {
            // Make catapult 3x bigger
            dw = Math.max(1, Math.floor(dw * 3));
            dh = Math.max(1, Math.floor(dh * 3));
        } else if (unit.type === 'fishingBoat' || unit.type === 'transportLarge' || unit.type === 'warship') {
            // Navy per-unit scaling
            if (unit.type === 'fishingBoat') {
                dw = Math.max(1, Math.floor(dw * 2));
                dh = Math.max(1, Math.floor(dh * 2));
            } else if (unit.type === 'transportLarge') {
                dw = Math.max(1, Math.floor(dw * 4));
                dh = Math.max(1, Math.floor(dh * 4));
            } else {
                dw = Math.max(1, Math.floor(dw * 7));
                dh = Math.max(1, Math.floor(dh * 7));
            }
        }
        const screenX = drawX; // overlay is aligned to canvas CSS pixels
        const screenY = drawY;
        // Create/update a DOM <img> for this unit
        if (!unit._domGif) {
            const el = document.createElement('img');
            el.src = img.src;
            el.style.position = 'absolute';
            el.style.pointerEvents = 'none';
            el.style.willChange = 'transform';
            el.dataset.unitId = getUnitDomId(unit);
            unit._domGif = el;
            getUnitOverlay().appendChild(el);
        }
        const el = unit._domGif;
        // Swap source when direction changes
        if (el.src !== img.src) el.src = img.src;
        el.style.display = 'block';
        el.style.width = `${dw}px`;
        el.style.height = `${dh}px`;
        el.style.transform = `translate(${Math.round(screenX - dw/2)}px, ${Math.round(screenY - dh/2)}px)`;
        // Skip canvas image draw; we still draw selection/health below
    } else {
        // No GIF: hide any existing overlay for this unit and draw fallback icons
        if (unit.type === 'militia') {
            // Show militia using a safe idle GIF directly, even if not preloaded
            const idleFaceRaw = unit._lastFaceNatural || 'south';
            const idleFace = mapDirForAssets(idleFaceRaw);
            const idleDir = idleFace.replace('northeast','north-east').replace('northwest','north-west').replace('southeast','south-east').replace('southwest','south-west');
            const src = `${assetManager.basePath}units/militia/idle/militia_idle-idle_${idleDir}.gif`;
            if (!unit._domGif) {
                const el = document.createElement('img');
                el.style.position = 'absolute';
                el.style.pointerEvents = 'none';
                el.style.willChange = 'transform';
                el.dataset.unitId = getUnitDomId(unit);
                unit._domGif = el;
                getUnitOverlay().appendChild(el);
            }
            const el = unit._domGif;
            if (el.src !== src) el.src = src;
            el.style.display = 'block';
            const dw = 24 * 3; // default 3x size
            const dh = 24 * 3;
            const screenX = drawX;
            const screenY = drawY;
            el.style.width = `${dw}px`;
            el.style.height = `${dh}px`;
            el.style.transform = `translate(${Math.round(screenX - dw/2)}px, ${Math.round(screenY - dh/2)}px)`;
            // Also queue the asset in manager for cache
            assetManager.loadAsset('units', `militia/idle/militia_idle-idle_${idleDir}`).catch(() => {});
        } else {
            // Hide overlay for this unit and draw fallback icons
            if (unit._domGif) unit._domGif.style.display = 'none';
            if (unit.type === 'archer') {
                drawArcherIcon(ctx, unitSize, unitSize);
            } else if (unit.type === 'crossbowman') {
        drawCrossbowmanIcon(ctx, unitSize, unitSize);
    } else if (unit.type === 'axeman') {
        drawAxemanIcon(ctx, unitSize, unitSize);
    } else if (unit.type === 'warrior') {
        drawWarriorIcon(ctx, unitSize, unitSize);
    } else if (unit.type === 'catapult') {
        drawCatapultIcon(ctx, unitSize * 1.5, unitSize * 1.5); // Siege units slightly larger
    } else if (unit.type === 'ballista') {
        drawBallistaIcon(ctx, unitSize * 1.5, unitSize * 1.5);
    } else if (unit.type === 'fishingBoat' || unit.type === 'transportLarge' || unit.type === 'warship') {
        drawShipIcon(ctx, unit.type, 1.2); // Use specific navy sprite as fallback
    }
        }
    }

    if (unit.isSelected) {
        ctx.strokeStyle = '#00ff00';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(0, 0, 18, 0, Math.PI * 2);
        ctx.stroke();
    }

    const maxHealth = GAME_CONFIG.units[unit.type].maxHealth;
    const healthPercent = unit.health / maxHealth;
    if (healthPercent < 1) {
        ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
        ctx.fillRect(-15, -35, 30, 4);
        ctx.fillStyle = healthPercent > 0.6 ? '#4CAF50' : healthPercent > 0.3 ? '#FF9800' : '#F44336';
        ctx.fillRect(-15, -35, 30 * healthPercent, 4);
    }

    ctx.restore();
}

function drawBuildings(ctx) {
    [...gameState.buildings, ...gameState.enemyBuildings].forEach(building => {
        if (building.health <= 0) return;
        const drawX = building.x - gameState.camera.x;
        const drawY = building.y - gameState.camera.y;
        if (drawX + building.width < 0 || drawX > GAME_CONFIG.canvas.width ||
            drawY + building.height < 0 || drawY > GAME_CONFIG.canvas.height) return;

        ctx.save();
        ctx.shadowColor = 'rgba(0, 0, 0, 0.4)';
        ctx.shadowBlur = 6;
        ctx.shadowOffsetY = 3;

        ctx.translate(drawX, drawY);
        if (building.type === 'town-center') {
            drawTownCenterIcon(ctx, building.width, building.height);
        } else if (building.type === 'house') {
            drawHouseIcon(ctx, building.width, building.height);
        } else if (building.type === 'barracks') {
            drawBarracksIcon(ctx, building.width, building.height);
        } else if (building.type === 'archeryRange') {
            drawArcheryRangeIcon(ctx, building.width, building.height);
        } else if (building.type === 'craftery') {
            drawCrafteryIcon(ctx, building.width, building.height);
        } else if (building.type === 'navy') {
            drawNavyIcon(ctx, building.width, building.height);
        }

        if (building.isSelected) {
            ctx.strokeStyle = '#00ff00';
            ctx.lineWidth = 3;
            // Draw rounded selection rectangle with much more rounded corners
            const cornerRadius = Math.min(32, Math.min(building.width, building.height) * 0.4);
            drawRoundedRect(ctx, 0, 0, building.width, building.height, cornerRadius, false, true);
        }

        // Draw collision border for debugging (optional)
        if (gameState.showBuildingCollision) {
            ctx.strokeStyle = 'rgba(255, 0, 0, 0.3)';
            ctx.lineWidth = 1;
            const buffer = 12;
            const cornerRadius = Math.min(32, Math.min(building.width, building.height) * 0.4);
            drawRoundedRect(ctx, -buffer, -buffer, building.width + 2*buffer, building.height + 2*buffer, cornerRadius, false, true);
        }

        const bcfg = getBuildingConfig(building.type);
        if (bcfg && bcfg.maxHealth) {
            const healthPercent = Math.max(0, building.health / bcfg.maxHealth);
            const barWidth = building.width * 0.5; // Half the building width
            const barHeight = 3; // Half the original height (was 6)
            const barY = -8; // Adjusted position
            const barX = building.width * 0.25; // Center the smaller health bar
            ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
            ctx.fillRect(barX, barY, barWidth, barHeight);
            ctx.fillStyle = healthPercent > 0.6 ? '#4CAF50' : healthPercent > 0.3 ? '#FF9800' : '#F44336';
            ctx.fillRect(barX, barY, barWidth * healthPercent, barHeight);
            ctx.strokeStyle = 'rgba(255,255,255,0.4)';
            ctx.lineWidth = 1;
            ctx.strokeRect(barX, barY, barWidth, barHeight);
        }

        ctx.restore();
    });
}

function drawPlacingBuilding(ctx) {
    if (gameState.placingBuilding) {
        const type = gameState.placingBuilding;
        const config = getBuildingConfig(type);
        let ghostX = gameState.placingBuildingPosition.x;
        let ghostY = gameState.placingBuildingPosition.y;
        let ghostW = config.width;
        let ghostH = config.height;
        let isValidPlacement = canPlaceBuilding(type, ghostX, ghostY);
        if (type === 'bridge') {
            // Preview is exactly one tile; snap to tile center
            const tileSize = (tilemap && tilemap.tileSize) ? tilemap.tileSize : 32;
            const tx = Math.floor(ghostX / tileSize);
            const ty = Math.floor(ghostY / tileSize);
            ghostW = tileSize;
            ghostH = tileSize;
            ghostX = tx * tileSize + tileSize / 2;
            ghostY = ty * tileSize + tileSize / 2;
            const blk = computeBridgeBlockAt(ghostX, ghostY);
            isValidPlacement = blk.ok;
        }
        const drawX = ghostX - gameState.camera.x - ghostW / 2;
        const drawY = ghostY - gameState.camera.y - ghostH / 2;

        ctx.save();
        ctx.translate(drawX, drawY);

        // Draw the building asset with ghost effect
        if (type === 'house') {
            drawSpriteGhost(ctx, 'buildings', 'house', config.width, config.height, isValidPlacement);
        } else if (type === 'barracks') {
            drawSpriteGhost(ctx, 'buildings', 'barracks', config.width, config.height, isValidPlacement);
        } else if (type === 'archeryRange') {
            drawSpriteGhost(ctx, 'buildings', 'archeryRange', config.width, config.height, isValidPlacement);
        } else if (type === 'craftery') {
            drawSpriteGhost(ctx, 'buildings', 'craftery', config.width, config.height, isValidPlacement);
        } else if (type === 'town-center') {
            drawSpriteGhost(ctx, 'buildings', 'townCenter', config.width, config.height, isValidPlacement);
        } else if (type === 'navy') {
            drawSpriteGhost(ctx, 'buildings', 'navy', config.width, config.height, isValidPlacement);
        } else if (type === 'bridge') {
            ctx.save();
            ctx.globalAlpha = 0.75;
            const w = ghostW, h = ghostH;
            const cornerRadius = Math.min(24, Math.min(w, h) * 0.3);
            // Base ghost
            ctx.fillStyle = isValidPlacement ? '#C8A165' : 'rgba(255,0,0,0.6)';
            drawRoundedRect(ctx, 0, 0, w, h, cornerRadius, true, false);
            if (isValidPlacement) {
                // Wood grain preview
                ctx.strokeStyle = 'rgba(94, 62, 26, 0.25)';
                ctx.lineWidth = 1;
                for (let i = 0; i < 4; i++) {
                    const gx = (i + 1) * (w / 5);
                    ctx.beginPath();
                    ctx.moveTo(gx, 4);
                    ctx.lineTo(gx, h - 4);
                    ctx.stroke();
                }
                ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
                for (let j = 0; j < Math.max(1, Math.floor(h / 12)); j++) {
                    const gy = (j + 1) * (h / (Math.max(1, Math.floor(h / 12)) + 1));
                    ctx.beginPath();
                    ctx.moveTo(6, gy);
                    ctx.lineTo(w - 6, gy);
                    ctx.stroke();
                }
            }
            ctx.restore();
        }
        
        // Draw placement validity outline with rounded corners
        ctx.strokeStyle = isValidPlacement ? '#00ff00' : '#ff0000';
        ctx.lineWidth = 2;
        const cornerRadius = Math.min(32, Math.min(ghostW, ghostH) * 0.4);
        drawRoundedRect(ctx, 0, 0, ghostW, ghostH, cornerRadius, false, true);

        ctx.restore();
    }
}

function drawMinimap() {
    const minimapCanvas = document.getElementById('minimapCanvas');
    const ctx = minimapCanvas.getContext('2d');
    ctx.clearRect(0, 0, minimapCanvas.width, minimapCanvas.height);
    const scaleX = minimapCanvas.width / GAME_CONFIG.world.width;
    const scaleY = minimapCanvas.height / GAME_CONFIG.world.height;
    ctx.fillStyle = '#2a8f52';
    ctx.fillRect(0, 0, minimapCanvas.width, minimapCanvas.height);

    gameState.worldObjects.forEach(obj => {
    // Do not mark resources or decorations on the minimap
    if (obj.type === 'resource' || obj.type === 'decoration') return;
        if (obj.type === 'water' || obj.type === 'bridge') {
            ctx.fillStyle = obj.color;
        } else {
            ctx.fillStyle = '#696969';
        }
        ctx.fillRect(obj.x * scaleX, obj.y * scaleY,
            Math.max(1, obj.width * scaleX), Math.max(1, obj.height * scaleY));
    });
    gameState.units.forEach(unit => {
        ctx.fillStyle = '#00ff00';
        ctx.fillRect(unit.x * scaleX - 1, unit.y * scaleY - 1, 2, 2);
    });
    gameState.enemyUnits.forEach(unit => {
        ctx.fillStyle = '#ff0000';
        ctx.fillRect(unit.x * scaleX - 1, unit.y * scaleY - 1, 2, 2);
    });
    [...gameState.buildings, ...gameState.enemyBuildings].forEach(building => {
        ctx.fillStyle = building.player === 'player' ? '#0066ff' : '#ff6600';
        ctx.fillRect(building.x * scaleX, building.y * scaleY,
                   Math.max(2, building.width * scaleX), Math.max(2, building.height * scaleY));
    });
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1;
    ctx.strokeRect(gameState.camera.x * scaleX, gameState.camera.y * scaleY,
                  GAME_CONFIG.canvas.width * scaleX, GAME_CONFIG.canvas.height * scaleY);
}

function drawUnitIcon(ctx, unitType, scale) {
    switch(unitType) {
        case 'villager': drawVillagerIcon(ctx, scale); break;
        case 'militia': drawMilitiaIcon(ctx, scale); break;
        case 'archer': drawArcherIcon(ctx, scale); break;
        case 'crossbowman': drawCrossbowmanIcon(ctx, scale); break;
    case 'axeman': drawAxemanIcon(ctx, scale); break;
        case 'warrior': drawWarriorIcon(ctx, scale); break;
        case 'catapult': drawCatapultIcon(ctx, scale); break;
        case 'ballista': drawBallistaIcon(ctx, scale); break;
        case 'fishingBoat':
        case 'transportLarge':
        case 'warship':
            drawShipIcon(ctx, scale); break;
    }
}

// --- Unit Menu Icon Drawing Helpers ---
function __iconSetup(ctx) {
    const c = ctx.canvas;
    const w = c.width, h = c.height;
    ctx.save();
    ctx.clearRect(0, 0, w, h);
    ctx.imageSmoothingEnabled = false;
    return { w, h };
}

function drawVillagerIcon(ctx, scale = 6) {
    const { w, h } = __iconSetup(ctx);
    const cx = w / 2, cy = h / 2;
    // Head
    ctx.fillStyle = '#f2d2b6';
    ctx.beginPath(); ctx.arc(cx, cy - 6, 5, 0, Math.PI * 2); ctx.fill();
    // Body
    ctx.fillStyle = '#3a7bd5';
    ctx.fillRect(cx - 5, cy - 2, 10, 12);
    // Tool
    ctx.strokeStyle = '#8b5a2b'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(cx + 6, cy - 2); ctx.lineTo(cx + 12, cy - 10); ctx.stroke();
    ctx.restore();
}

function drawMilitiaIcon(ctx, scale = 6) {
    const { w, h } = __iconSetup(ctx); const cx = w/2, cy = h/2;
    ctx.fillStyle = '#f2d2b6'; ctx.beginPath(); ctx.arc(cx, cy - 7, 4.5, 0, Math.PI*2); ctx.fill();
    ctx.fillStyle = '#5c6bc0'; ctx.fillRect(cx - 6, cy - 2, 12, 13);
    // Sword
    ctx.strokeStyle = '#cfd8dc'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(cx + 6, cy + 1); ctx.lineTo(cx + 12, cy - 8); ctx.stroke();
    ctx.restore();
}

function drawWarriorIcon(ctx, scale = 6) {
    const { w, h } = __iconSetup(ctx); const cx = w/2, cy = h/2;
    ctx.fillStyle = '#f2d2b6'; ctx.beginPath(); ctx.arc(cx, cy - 7, 4.5, 0, Math.PI*2); ctx.fill();
    ctx.fillStyle = '#8d6e63'; ctx.fillRect(cx - 6, cy - 2, 12, 13);
    // Shield
    ctx.fillStyle = '#b0bec5'; ctx.beginPath(); ctx.arc(cx - 10, cy + 3, 5, Math.PI*0.5, Math.PI*1.5); ctx.fill();
    // Spear
    ctx.strokeStyle = '#cfd8dc'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(cx + 5, cy + 4); ctx.lineTo(cx + 13, cy - 8); ctx.stroke();
    ctx.restore();
}

function drawAxemanIcon(ctx, scale = 6) {
    const { w, h } = __iconSetup(ctx); const cx = w/2, cy = h/2;
    ctx.fillStyle = '#f2d2b6'; ctx.beginPath(); ctx.arc(cx, cy - 7, 4.5, 0, Math.PI*2); ctx.fill();
    ctx.fillStyle = '#6d4c41'; ctx.fillRect(cx - 6, cy - 2, 12, 13);
    // Axe
    ctx.strokeStyle = '#8b5a2b'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(cx + 4, cy + 4); ctx.lineTo(cx + 12, cy - 6); ctx.stroke();
    ctx.fillStyle = '#cfd8dc'; ctx.fillRect(cx + 10, cy - 9, 5, 6);
    ctx.restore();
}

function drawArcherIcon(ctx, scale = 6) {
    const { w, h } = __iconSetup(ctx); const cx = w/2, cy = h/2;
    ctx.fillStyle = '#f2d2b6'; ctx.beginPath(); ctx.arc(cx, cy - 7, 4.5, 0, Math.PI*2); ctx.fill();
    ctx.fillStyle = '#388e3c'; ctx.fillRect(cx - 6, cy - 2, 12, 13);
    // Bow
    ctx.strokeStyle = '#8b5a2b'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(cx + 7, cy + 1, 8, -Math.PI/3, Math.PI/3); ctx.stroke();
    // Arrow string
    ctx.beginPath(); ctx.moveTo(cx + 7, cy - 6); ctx.lineTo(cx + 7, cy + 8); ctx.stroke();
    ctx.restore();
}

function drawCrossbowmanIcon(ctx, scale = 6) {
    const { w, h } = __iconSetup(ctx); const cx = w/2, cy = h/2;
    ctx.fillStyle = '#f2d2b6'; ctx.beginPath(); ctx.arc(cx, cy - 7, 4.5, 0, Math.PI*2); ctx.fill();
    ctx.fillStyle = '#00796b'; ctx.fillRect(cx - 6, cy - 2, 12, 13);
    // Crossbow
    ctx.strokeStyle = '#8b5a2b'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(cx + 6, cy + 1); ctx.lineTo(cx + 12, cy + 1); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(cx + 9, cy - 5); ctx.lineTo(cx + 9, cy + 7); ctx.stroke();
    ctx.restore();
}

function drawCatapultIcon(ctx, scale = 6) {
    const { w, h } = __iconSetup(ctx);
    // Base
    ctx.fillStyle = '#8b5a2b'; ctx.fillRect(6, h - 14, w - 12, 10);
    // Arm
    ctx.strokeStyle = '#a1887f'; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(10, h - 14); ctx.lineTo(w - 8, 10); ctx.stroke();
    // Sling
    ctx.fillStyle = '#cfd8dc'; ctx.beginPath(); ctx.arc(w - 8, 10, 4, 0, Math.PI*2); ctx.fill();
    ctx.restore();
}

function drawBallistaIcon(ctx, scale = 6) {
    const { w, h } = __iconSetup(ctx);
    // Base
    ctx.fillStyle = '#795548'; ctx.fillRect(8, h - 16, w - 16, 12);
    // Bow arms
    ctx.strokeStyle = '#a1887f'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(10, h - 16); ctx.lineTo(w/2, 10); ctx.lineTo(w - 10, h - 16); ctx.stroke();
    // Bolt
    ctx.strokeStyle = '#cfd8dc'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(w/2, 10); ctx.lineTo(w/2, h - 16); ctx.stroke();
    ctx.restore();
}

function drawShipIcon(ctx, arg1 = 6, arg2) {
    const scale = (typeof arg1 === 'number') ? arg1 : (arg2 || 6);
    const { w, h } = __iconSetup(ctx);
    // Water base
    ctx.fillStyle = '#1976d2'; ctx.fillRect(0, h - 8, w, 8);
    // Hull
    ctx.fillStyle = '#6d4c41'; ctx.beginPath();
    ctx.moveTo(6, h - 10); ctx.lineTo(w - 6, h - 10); ctx.lineTo(w - 12, h - 4); ctx.lineTo(12, h - 4); ctx.closePath(); ctx.fill();
    // Mast & sail
    ctx.strokeStyle = '#795548'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(w/2, h - 10); ctx.lineTo(w/2, 8); ctx.stroke();
    ctx.fillStyle = '#fafafa'; ctx.beginPath(); ctx.moveTo(w/2, 10); ctx.lineTo(w/2 + 10, 18); ctx.lineTo(w/2, 26); ctx.closePath(); ctx.fill();
    ctx.restore();
}

// Helper function to draw rounded rectangles
function drawRoundedRect(ctx, x, y, width, height, radius, fill = false, stroke = false) {
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.lineTo(x + width - radius, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
    ctx.lineTo(x + width, y + height - radius);
    ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
    ctx.lineTo(x + radius, y + height);
    ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
    ctx.lineTo(x, y + radius);
    ctx.quadraticCurveTo(x, y, x + radius, y);
    ctx.closePath();
    
    if (fill) {
        ctx.fill();
    }
    if (stroke) {
        ctx.stroke();
    }
}
