// --- PNG Asset-Based Drawing System ---
// All sprites are now loaded from PNG files in the assets folder

// Generic function to draw any sprite from PNG assets fitted to target dimensions
function drawSprite(ctx, category, name, targetWidth, targetHeight) {
    drawAssetFitted(ctx, category, name, 0, 0, targetWidth, targetHeight);
}

// Generic function to draw any sprite with scaling (for backward compatibility)
function drawSpriteScaled(ctx, category, name, scale = 1) {
    drawAsset(ctx, category, name, 0, 0, scale);
}

// Generic function to draw sprite with transparency/tint for building placement preview
function drawSpriteGhost(ctx, category, name, targetWidth, targetHeight, isValidPlacement = true) {
    const tintColor = isValidPlacement ? 'rgba(0, 255, 0, 0.3)' : 'rgba(255, 0, 0, 0.3)';
    drawAssetTinted(ctx, category, name, 0, 0, targetWidth, targetHeight, 0.7, tintColor);
}

// Unit drawing functions - now load from assets/units/
function drawVillagerIcon(ctx, targetWidth, targetHeight) {
    if (arguments.length === 2 && typeof targetHeight === 'undefined') {
        // Legacy scale parameter
        drawSpriteScaled(ctx, 'units', 'villager', targetWidth);
    } else if (arguments.length >= 2) {
        // New fitted dimensions
        drawSprite(ctx, 'units', 'villager', targetWidth, targetHeight);
    } else {
        // Default scale
        drawSpriteScaled(ctx, 'units', 'villager', 1);
    }
}

function drawMilitiaIcon(ctx, targetWidth, targetHeight) {
    if (arguments.length === 2 && typeof targetHeight === 'undefined') {
        // Legacy scale parameter
        drawSpriteScaled(ctx, 'units', 'militia', targetWidth);
    } else if (arguments.length >= 2) {
        // New fitted dimensions
        drawSprite(ctx, 'units', 'militia', targetWidth, targetHeight);
    } else {
        // Default scale
        drawSpriteScaled(ctx, 'units', 'militia', 1);
    }
}

function drawArcherIcon(ctx, targetWidth, targetHeight) {
    if (arguments.length === 2 && typeof targetHeight === 'undefined') {
        drawSpriteScaled(ctx, 'units', 'archer', targetWidth);
    } else if (arguments.length >= 2) {
        drawSprite(ctx, 'units', 'archer', targetWidth, targetHeight);
    } else {
        drawSpriteScaled(ctx, 'units', 'archer', 1);
    }
}

function drawScoutIcon(ctx, targetWidth, targetHeight) {
    if (arguments.length === 2 && typeof targetHeight === 'undefined') {
        drawSpriteScaled(ctx, 'units', 'scout', targetWidth);
    } else if (arguments.length >= 2) {
        drawSprite(ctx, 'units', 'scout', targetWidth, targetHeight);
    } else {
        drawSpriteScaled(ctx, 'units', 'scout', 1);
    }
}

function drawKnightIcon(ctx, targetWidth, targetHeight) {
    if (arguments.length === 2 && typeof targetHeight === 'undefined') {
        drawSpriteScaled(ctx, 'units', 'knight', targetWidth);
    } else if (arguments.length >= 2) {
        drawSprite(ctx, 'units', 'knight', targetWidth, targetHeight);
    } else {
        drawSpriteScaled(ctx, 'units', 'knight', 1);
    }
}

function drawCrossbowmanIcon(ctx, targetWidth, targetHeight) {
    if (arguments.length === 2 && typeof targetHeight === 'undefined') {
        drawSpriteScaled(ctx, 'units', 'crossbowman', targetWidth);
    } else if (arguments.length >= 2) {
        drawSprite(ctx, 'units', 'crossbowman', targetWidth, targetHeight);
    } else {
        drawSpriteScaled(ctx, 'units', 'crossbowman', 1);
    }
}

function drawWarriorIcon(ctx, targetWidth, targetHeight) {
    if (arguments.length === 2 && typeof targetHeight === 'undefined') {
        drawSpriteScaled(ctx, 'units', 'warrior', targetWidth);
    } else if (arguments.length >= 2) {
        drawSprite(ctx, 'units', 'warrior', targetWidth, targetHeight);
    } else {
        drawSpriteScaled(ctx, 'units', 'warrior', 1);
    }
}

function drawSoldierIcon(ctx, targetWidth, targetHeight) {
    if (arguments.length === 2 && typeof targetHeight === 'undefined') {
        drawSpriteScaled(ctx, 'units', 'soldier', targetWidth);
    } else if (arguments.length >= 2) {
        drawSprite(ctx, 'units', 'soldier', targetWidth, targetHeight);
    } else {
        drawSpriteScaled(ctx, 'units', 'soldier', 1);
    }
}

function drawBallistaIcon(ctx, targetWidth, targetHeight) {
    if (arguments.length === 2 && typeof targetHeight === 'undefined') {
        drawSpriteScaled(ctx, 'units', 'ballista', targetWidth);
    } else if (arguments.length >= 2) {
        drawSprite(ctx, 'units', 'ballista', targetWidth, targetHeight);
    } else {
        drawSpriteScaled(ctx, 'units', 'ballista', 1);
    }
}

function drawCatapultIcon(ctx, targetWidth, targetHeight) {
    if (arguments.length === 2 && typeof targetHeight === 'undefined') {
        drawSpriteScaled(ctx, 'units', 'catapult', targetWidth);
    } else if (arguments.length >= 2) {
        drawSprite(ctx, 'units', 'catapult', targetWidth, targetHeight);
    } else {
        drawSpriteScaled(ctx, 'units', 'catapult', 1);
    }
}

function drawMangonelIcon(ctx, targetWidth, targetHeight) {
    if (arguments.length === 2 && typeof targetHeight === 'undefined') {
        drawSpriteScaled(ctx, 'units', 'mangonel', targetWidth);
    } else if (arguments.length >= 2) {
        drawSprite(ctx, 'units', 'mangonel', targetWidth, targetHeight);
    } else {
        drawSpriteScaled(ctx, 'units', 'mangonel', 1);
    }
}

function drawTrebuchetIcon(ctx, targetWidth, targetHeight) {
    if (arguments.length === 2 && typeof targetHeight === 'undefined') {
        drawSpriteScaled(ctx, 'units', 'trebuchet', targetWidth);
    } else if (arguments.length >= 2) {
        drawSprite(ctx, 'units', 'trebuchet', targetWidth, targetHeight);
    } else {
        drawSpriteScaled(ctx, 'units', 'trebuchet', 1);
    }
}

// Naval units
function drawFishingBoatIcon(ctx, scale = 1) {
    drawSprite(ctx, 'units', 'fishingBoat', scale);
}

function drawTransportSmallIcon(ctx, scale = 1) {
    drawSprite(ctx, 'units', 'transportSmall', scale);
}

function drawTransportLargeIcon(ctx, scale = 1) {
    drawSprite(ctx, 'units', 'transportLarge', scale);
}

function drawGalleyIcon(ctx, scale = 1) {
    drawSprite(ctx, 'units', 'galley', scale);
}

function drawWarshipIcon(ctx, scale = 1) {
    drawSprite(ctx, 'units', 'warship', scale);
}

// Building drawing functions - now load from assets/buildings/
function drawHouseIcon(ctx, widthOrScale, height) {
    if (typeof height !== 'undefined') {
        // New fitted dimensions (width, height)
        drawSprite(ctx, 'buildings', 'house', widthOrScale, height);
    } else {
        // Legacy scale parameter
        drawSpriteScaled(ctx, 'buildings', 'house', widthOrScale || 1);
    }
}

function drawTownCenterIcon(ctx, widthOrScale, height) {
    if (typeof height !== 'undefined') {
        // New fitted dimensions (width, height)
        drawSprite(ctx, 'buildings', 'townCenter', widthOrScale, height);
    } else {
        // Legacy scale parameter
        drawSpriteScaled(ctx, 'buildings', 'townCenter', widthOrScale || 1);
    }
}

function drawBarracksIcon(ctx, widthOrScale, height) {
    if (typeof height !== 'undefined') {
        // New fitted dimensions (width, height)
        drawSprite(ctx, 'buildings', 'barracks', widthOrScale, height);
    } else {
        // Legacy scale parameter
        drawSpriteScaled(ctx, 'buildings', 'barracks', widthOrScale || 1);
    }
}

function drawArcheryRangeIcon(ctx, widthOrScale, height) {
    if (typeof height !== 'undefined') {
        // New fitted dimensions (width, height)
        drawSprite(ctx, 'buildings', 'archeryRange', widthOrScale, height);
    } else {
        // Legacy scale parameter
        drawSpriteScaled(ctx, 'buildings', 'archeryRange', widthOrScale || 1);
    }
}

function drawCrafteryIcon(ctx, widthOrScale, height) {
    if (typeof height !== 'undefined') {
        // New fitted dimensions (width, height)
        drawSprite(ctx, 'buildings', 'craftery', widthOrScale, height);
    } else {
        // Legacy scale parameter
        drawSpriteScaled(ctx, 'buildings', 'craftery', widthOrScale || 1);
    }
}

function drawNavyIcon(ctx, widthOrScale, height) {
    if (typeof height !== 'undefined') {
        // New fitted dimensions (width, height)
        drawSprite(ctx, 'buildings', 'navy', widthOrScale, height);
    } else {
        // Legacy scale parameter
        drawSpriteScaled(ctx, 'buildings', 'navy', widthOrScale || 1);
    }
}

function drawShipIcon(ctx, scale = 1) {
    drawSprite(ctx, 'units', 'ship', scale);
}

// Resource drawing functions - now load from assets/resources/
function drawFoodIcon(ctx, widthOrScale, height) {
    if (typeof height !== 'undefined') {
        drawSprite(ctx, 'resources', 'food', widthOrScale, height);
    } else {
        drawSpriteScaled(ctx, 'resources', 'food', widthOrScale || 1);
    }
}

function drawWoodIcon(ctx, widthOrScale, height) {
    if (typeof height !== 'undefined') {
        drawSprite(ctx, 'resources', 'wood', widthOrScale, height);
    } else {
        drawSpriteScaled(ctx, 'resources', 'wood', widthOrScale || 1);
    }
}

function drawStoneIcon(ctx, widthOrScale, height) {
    if (typeof height !== 'undefined') {
        drawSprite(ctx, 'resources', 'stone', widthOrScale, height);
    } else {
        drawSpriteScaled(ctx, 'resources', 'stone', widthOrScale || 1);
    }
}

function drawGoldIcon(ctx, widthOrScale, height) {
    if (typeof height !== 'undefined') {
        drawSprite(ctx, 'resources', 'gold', widthOrScale, height);
    } else {
        drawSpriteScaled(ctx, 'resources', 'gold', widthOrScale || 1);
    }
}

// Legacy function for backward compatibility
function drawPixelIcon(ctx, pixels, palette, scale = 1) {
    console.warn('drawPixelIcon is deprecated. Use PNG assets instead.');
    // Fallback implementation if needed
    pixels.forEach((row, y) => {
        for (let x = 0; x < row.length; x++) {
            const colorIndex = row[x];
            if (colorIndex !== undefined && colorIndex !== 0) {
                ctx.fillStyle = palette[colorIndex];
                ctx.fillRect(x * scale, y * scale, scale, scale);
            }
        }
    });
}