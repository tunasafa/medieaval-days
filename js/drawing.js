// Drawing Functions
function drawWorldObjects(ctx) {
    gameState.worldObjects.forEach(obj => {
        const drawX = obj.x - gameState.camera.x;
        const drawY = obj.y - gameState.camera.y;
        if (drawX + obj.width < 0 || drawX > GAME_CONFIG.canvas.width ||
            drawY + obj.height < 0 || drawY > GAME_CONFIG.canvas.height) return;

        if (obj.type === 'resource') {
            ctx.save();
            ctx.translate(drawX, drawY);
            if (obj.resourceType === 'food') {
                drawFoodIcon(ctx, obj.width / 8);
            } else if (obj.resourceType === 'wood') {
                drawWoodIcon(ctx, obj.width / 8);
            } else if (obj.resourceType === 'stone') {
                drawStoneIcon(ctx, obj.width / 8);
            } else if (obj.resourceType === 'gold') {
                drawGoldIcon(ctx, obj.width / 8);
            }
            ctx.restore();

            if (obj.amount > 0) {
                ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
                ctx.font = '10px Arial';
                ctx.textAlign = 'center';
                ctx.fillText(Math.floor(obj.amount), drawX + obj.width/2, drawY + obj.height/2 + 3);
            }
        } else if (obj.type === 'water') {
            ctx.fillStyle = obj.color;
            ctx.globalAlpha = 0.85;
            ctx.fillRect(drawX, drawY, obj.width, obj.height);
            ctx.globalAlpha = 1;
        } else if (obj.type === 'bridge') {
            ctx.fillStyle = obj.color;
            ctx.fillRect(drawX, drawY, obj.width, obj.height);
        } else {
            ctx.fillStyle = obj.color;
            ctx.fillRect(drawX, drawY, obj.width, obj.height);
        }
    });
}

function drawUnits(ctx) {
    gameState.units.forEach(unit => drawUnit(ctx, unit));
    gameState.enemyUnits.forEach(unit => drawUnit(ctx, unit));
}

function drawUnit(ctx, unit) {
    const drawX = unit.x - gameState.camera.x;
    const drawY = unit.y - gameState.camera.y;
    if (drawX < -30 || drawX > GAME_CONFIG.canvas.width + 30 ||
        drawY < -30 || drawY > GAME_CONFIG.canvas.height + 30) return;

    ctx.save();
    ctx.shadowColor = 'rgba(0, 0, 0, 0.3)';
    ctx.shadowBlur = 3;
    ctx.shadowOffsetY = 2;

    ctx.translate(drawX, drawY);
    const unitSize = 24; // Standard unit size in pixels
    if (unit.type === 'villager' && GAME_CONFIG.units.villager.sprite) {
        const spr = GAME_CONFIG.units.villager.sprite;
        const anim = unit.anim || { action: 'idle', frame: 0 };
        const def = spr.animations[anim.action] || spr.animations.idle || { row: 0, frames: 4, fps: 8 };
        const img = assetManager.getAsset('units', spr.sheet);
        const spacing = spr.spacing || 0;
        const margin = spr.margin || 0;
        // Determine frame width/height. If not set, infer for 1 row x 4 columns from image.
        let fw = spr.frameWidth;
        let fh = spr.frameHeight;
        if ((!fw || !fh) && img && img.width && img.height) {
            const cols = Math.max(1, spr.columns || def.frames || 4);
            const rows = Math.max(1, spr.rows || (def.row || 0) + 1);
            fw = Math.floor((img.width - margin * 2 - spacing * (cols - 1)) / cols) || img.width;
            fh = Math.floor((img.height - margin * 2 - spacing * (rows - 1)) / rows) || img.height;
        }
        // Safety: if frame size still equals whole sheet (bad), force per-column/row split
        if (img && img.width && img.height) {
            const cols = Math.max(1, spr.columns || def.frames || 4);
            const rows = Math.max(1, spr.rows || (def.row || 0) + 1);
            const idealFW = Math.floor(img.width / cols);
            const idealFH = Math.floor(img.height / rows);
            if (!fw || fw <= 0 || fw >= img.width) fw = idealFW;
            if (!fh || fh <= 0 || fh >= img.height) fh = idealFH;
        }
        let col = anim.frame % (def.frames || 4);
        let row = def.row || 0;
        if (spr.columns && col >= spr.columns) col = spr.columns - 1;
        if (spr.rows && row >= spr.rows) row = spr.rows - 1;
        let sx = margin + col * (fw + spacing);
        let sy = margin + row * (fh + spacing);
        if (img && img.width && img.height) {
            if (sx < 0) sx = 0;
            if (sy < 0) sy = 0;
            if (sx + fw > img.width) sx = Math.max(0, img.width - fw);
            if (sy + fh > img.height) sy = Math.max(0, img.height - fh);
        }
        if (fw <= 0 || fh <= 0) { ctx.restore(); return; }
        // Fit inside selection circle
        const circleRadius = 18;
        const maxD = circleRadius * 2 - 4;
    const scale = Math.min(maxD / fw, maxD / fh);
    const renderScale = (spr.renderScale || 1);
    const dw = Math.floor(fw * scale * renderScale);
    const dh = Math.floor(fh * scale * renderScale);
        const dx = -Math.floor(dw / 2);
        const dy = -Math.floor(dh / 2);
        drawAssetSprite(ctx, 'units', spr.sheet, sx, sy, fw, fh, dx, dy, dw, dh);
    } else if (unit.type === 'militia') {
        drawMilitiaIcon(ctx, unitSize, unitSize);
    } else if (unit.type === 'archer') {
        drawArcherIcon(ctx, unitSize, unitSize);
    } else if (unit.type === 'crossbowman') {
        drawCrossbowmanIcon(ctx, unitSize, unitSize);
    } else if (unit.type === 'scout') {
        drawScoutIcon(ctx, unitSize, unitSize);
    } else if (unit.type === 'knight') {
        drawKnightIcon(ctx, unitSize, unitSize);
    } else if (unit.type === 'warrior') {
        drawWarriorIcon(ctx, unitSize, unitSize);
    } else if (unit.type === 'soldier') {
        drawSoldierIcon(ctx, unitSize, unitSize);
    } else if (unit.type === 'catapult') {
        drawCatapultIcon(ctx, unitSize * 1.5, unitSize * 1.5); // Siege units slightly larger
    } else if (unit.type === 'ballista') {
        drawBallistaIcon(ctx, unitSize * 1.5, unitSize * 1.5);
    } else if (unit.type === 'mangonel') {
        drawMangonelIcon(ctx, unitSize * 1.5, unitSize * 1.5);
    } else if (unit.type === 'trebuchet') {
        drawTrebuchetIcon(ctx, unitSize * 1.5, unitSize * 1.5);
    } else if (unit.type === 'fishingBoat' || unit.type === 'transportSmall' || unit.type === 'transportLarge' || unit.type === 'galley' || unit.type === 'warship') {
        drawShipIcon(ctx, unitSize * 1.2, unitSize * 1.2); // Naval units slightly larger
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
            ctx.strokeRect(0, 0, building.width, building.height);
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
        const config = getBuildingConfig(gameState.placingBuilding);
        const drawX = gameState.placingBuildingPosition.x - gameState.camera.x - config.width / 2;
        const drawY = gameState.placingBuildingPosition.y - gameState.camera.y - config.height / 2;
        const isValidPlacement = canPlaceBuilding(gameState.placingBuilding, gameState.placingBuildingPosition.x, gameState.placingBuildingPosition.y);
        
        ctx.save();
        ctx.translate(drawX, drawY);
        
        // Draw the building asset with ghost effect
        if (gameState.placingBuilding === 'house') {
            drawSpriteGhost(ctx, 'buildings', 'house', config.width, config.height, isValidPlacement);
        } else if (gameState.placingBuilding === 'barracks') {
            drawSpriteGhost(ctx, 'buildings', 'barracks', config.width, config.height, isValidPlacement);
        } else if (gameState.placingBuilding === 'archeryRange') {
            drawSpriteGhost(ctx, 'buildings', 'archeryRange', config.width, config.height, isValidPlacement);
        } else if (gameState.placingBuilding === 'craftery') {
            drawSpriteGhost(ctx, 'buildings', 'craftery', config.width, config.height, isValidPlacement);
        } else if (gameState.placingBuilding === 'town-center') {
            drawSpriteGhost(ctx, 'buildings', 'townCenter', config.width, config.height, isValidPlacement);
        } else if (gameState.placingBuilding === 'navy') {
            drawSpriteGhost(ctx, 'buildings', 'navy', config.width, config.height, isValidPlacement);
        } else if (gameState.placingBuilding === 'bridge') {
            ctx.save();
            ctx.globalAlpha = 0.7;
            ctx.fillStyle = isValidPlacement ? 'rgba(139, 69, 19, 0.7)' : 'rgba(255, 0, 0, 0.7)';
            ctx.fillRect(0, 0, config.width, config.height);
            ctx.restore();
        }
        
        // Draw placement validity outline
        ctx.strokeStyle = isValidPlacement ? '#00ff00' : '#ff0000';
        ctx.lineWidth = 2;
        ctx.strokeRect(0, 0, config.width, config.height);
        
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
         if (obj.type === 'resource' || obj.type === 'water' || obj.type === 'bridge') {
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
        case 'scout': drawScoutIcon(ctx, scale); break;
        case 'knight': drawKnightIcon(ctx, scale); break;
        case 'warrior': drawWarriorIcon(ctx, scale); break;
        case 'soldier': drawSoldierIcon(ctx, scale); break;
        case 'catapult': drawCatapultIcon(ctx, scale); break;
        case 'ballista': drawBallistaIcon(ctx, scale); break;
        case 'mangonel': drawMangonelIcon(ctx, scale); break;
        case 'trebuchet': drawTrebuchetIcon(ctx, scale); break;
        case 'fishingBoat':
        case 'transportSmall':
        case 'transportLarge':
        case 'galley':
        case 'warship':
            drawShipIcon(ctx, scale); break;
    }
}