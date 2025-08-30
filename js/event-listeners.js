// Event Listeners
function setupEventListeners() {
    const canvas = document.getElementById('gameCanvas');
    let mouseDown = false;
    let dragStart = { x: 0, y: 0 };
    // Minimap click-to-navigate support
    const minimap = document.getElementById('minimapCanvas');
    if (minimap) {
        let mmDown = false;
        const moveCameraToMinimap = (e) => {
            const rect = minimap.getBoundingClientRect();
            const mx = e.clientX - rect.left;
            const my = e.clientY - rect.top;
            const worldX = (mx / Math.max(1, minimap.width)) * GAME_CONFIG.world.width;
            const worldY = (my / Math.max(1, minimap.height)) * GAME_CONFIG.world.height;
            // Center camera on clicked world position
            gameState.camera.x = worldX - GAME_CONFIG.canvas.width / 2;
            gameState.camera.y = worldY - GAME_CONFIG.canvas.height / 2;
            if (typeof clampCameraToBounds === 'function') clampCameraToBounds();
        };
        minimap.addEventListener('mousedown', (e) => {
            if (e.button !== 0) return;
            mmDown = true;
            moveCameraToMinimap(e);
        });
        window.addEventListener('mouseup', () => { mmDown = false; });
        minimap.addEventListener('mousemove', (e) => {
            if (!mmDown) return;
            moveCameraToMinimap(e);
        });
        minimap.addEventListener('click', (e) => moveCameraToMinimap(e));
    }
    canvas.addEventListener('mousedown', (e) => {
        if (e.button === 0) {
            if (gameState.placingBuilding) {
                 const rect = canvas.getBoundingClientRect();
                const worldX = e.clientX - rect.left + gameState.camera.x;
                const worldY = e.clientY - rect.top + gameState.camera.y;
                if (canPlaceBuilding(gameState.placingBuilding, worldX, worldY)) {
                    placeBuilding(gameState.placingBuilding, worldX, worldY);
                } else {
                    showNotification("Cannot place building here!");
                }
                gameState.placingBuilding = null;
                canvas.classList.remove('placing-building', 'invalid-placement');
                return;
            }
            
            const rect = canvas.getBoundingClientRect();
            const worldX = e.clientX - rect.left + gameState.camera.x;
            const worldY = e.clientY - rect.top + gameState.camera.y;
            
            // Check for building clicks first
            const clickedBuilding = [...gameState.buildings].find(building =>
                building.player === 'player' &&
                worldX >= building.x && worldX <= building.x + building.width &&
                worldY >= building.y && worldY <= building.y + building.height
            );
            
            if (clickedBuilding) {
                selectBuilding(clickedBuilding);
                return;
            }
            
            // Check for unit clicks with a small tolerance area (20 pixels radius)
            const clickedUnit = gameState.units.find(unit => {
                if (unit.player !== 'player') return false;
                const distance = Math.hypot(unit.x - worldX, unit.y - worldY);
                return distance <= 20; // 20 pixel radius for easier clicking
            });
            
            if (clickedUnit) {
                // Single unit selection with multi-select support
                const isMultiSelect = e.ctrlKey || e.metaKey; // Ctrl on Windows/Linux, Cmd on Mac
                
                if (!isMultiSelect) {
                    // Clear previous selection
                    gameState.selectedUnits.forEach(unit => unit.isSelected = false);
                    gameState.buildings.forEach(building => building.isSelected = false);
                    gameState.selectedUnits = [clickedUnit];
                    gameState.selectedBuilding = null;
                    clickedUnit.isSelected = true;
                } else {
                    // Add to existing selection or remove if already selected
                    if (clickedUnit.isSelected) {
                        // Remove from selection
                        clickedUnit.isSelected = false;
                        const index = gameState.selectedUnits.indexOf(clickedUnit);
                        if (index > -1) {
                            gameState.selectedUnits.splice(index, 1);
                        }
                    } else {
                        // Add to selection
                        clickedUnit.isSelected = true;
                        gameState.selectedUnits.push(clickedUnit);
                    }
                }
                
                document.getElementById('building-actions').style.display = 'none';
                document.getElementById('general-units').style.display = 'block';
                updateSelectionInfo();
                return;
            }
            
            mouseDown = true;
            dragStart.x = e.clientX - rect.left;
            dragStart.y = e.clientY - rect.top;
            gameState.isSelecting = true;
            gameState.selectionStart = { ...dragStart };
        }
    });
    canvas.addEventListener('mousemove', (e) => {
         if (gameState.placingBuilding) {
            const rect = canvas.getBoundingClientRect();
            const worldX = e.clientX - rect.left + gameState.camera.x;
            const worldY = e.clientY - rect.top + gameState.camera.y;
            gameState.placingBuildingPosition.x = worldX;
            gameState.placingBuildingPosition.y = worldY;
            if (canPlaceBuilding(gameState.placingBuilding, worldX, worldY)) {
                canvas.classList.remove('invalid-placement');
            } else {
                canvas.classList.add('invalid-placement');
            }
            return;
        }
        if (mouseDown && gameState.isSelecting) {
            const rect = canvas.getBoundingClientRect();
            const currentX = e.clientX - rect.left;
            const currentY = e.clientY - rect.top;
            
            // Only show selection box if drag distance is meaningful (> 3 pixels)
            const dragDistance = Math.hypot(currentX - dragStart.x, currentY - dragStart.y);
            if (dragDistance > 3) {
                updateSelectionBox(dragStart, { x: currentX, y: currentY });
            }
        }
        const rect2 = canvas.getBoundingClientRect();
        const worldX = e.clientX - rect2.left + gameState.camera.x;
        const worldY = e.clientY - rect2.top + gameState.camera.y;
        let cursor = 'default';
        const transports = gameState.selectedUnits.filter(u => isTransport(u));
        if (transports.length === 1) {
            const t = transports[0];
            const others = gameState.selectedUnits.filter(u => u !== t && canEmbark(u));
            const cap = GAME_CONFIG.units[t.type].capacity || 0;
            const used = (t.cargo || []).length;
            const nearMouseToTransport = Math.hypot(worldX - t.x, worldY - t.y) < 30;
            const anyEmbarkableNearby = others.some(u => Math.hypot(u.x - t.x, u.y - t.y) < 24);
            if (nearMouseToTransport && anyEmbarkableNearby && used < cap) {
                cursor = 'alias';
            } else if ((t.cargo && t.cargo.length > 0) && (!isPointInWater(worldX, worldY) || isPointOnBridge(worldX, worldY))) {
                if (!isOnLandShoreBand(worldX, worldY, 1)) cursor = 'copy';
            }
        }
        const canvasEl = document.getElementById('game-canvas');
        if (canvasEl) canvasEl.style.cursor = cursor;
    });
    canvas.addEventListener('mouseup', (e) => {
         if (gameState.placingBuilding) return;
        if (e.button === 0 && mouseDown) {
            mouseDown = false;
            const rect = canvas.getBoundingClientRect();
            if (gameState.isSelecting) {
                const endX = e.clientX - rect.left;
                const endY = e.clientY - rect.top;
                
                // Calculate the drag distance
                const dragDistance = Math.hypot(endX - dragStart.x, endY - dragStart.y);
                
                // If drag distance is very small (less than 5 pixels), treat as a click to deselect
                if (dragDistance < 5) {
                    // Deselect all units and buildings
                    gameState.selectedUnits.forEach(unit => unit.isSelected = false);
                    gameState.buildings.forEach(building => building.isSelected = false);
                    gameState.selectedUnits = [];
                    gameState.selectedBuilding = null;
                    
                    document.getElementById('building-actions').style.display = 'none';
                    document.getElementById('general-units').style.display = 'block';
                    updateSelectionInfo();
                } else {
                    // Perform box selection
                    finishSelection(dragStart, { x: endX, y: endY }, e.ctrlKey || e.metaKey);
                }
                
                gameState.isSelecting = false;
                hideSelectionBox();
            }
        }
    });
    canvas.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        if (gameState.placingBuilding) return;
        const rect = canvas.getBoundingClientRect();
        const x = e.clientX - rect.left + gameState.camera.x;
        const y = e.clientY - rect.top + gameState.camera.y;
        const transports = gameState.selectedUnits.filter(u => isTransport(u));
        if (transports.length === 1) {
            const t = transports[0];
            const canvasEl = document.getElementById('game-canvas');
            if (canvasEl) {
                if (Math.hypot(x - t.x, y - t.y) < 30) canvasEl.style.cursor = 'alias';
                else if (!isPointInWater(x, y) || isPointOnBridge(x, y)) canvasEl.style.cursor = 'copy';
                setTimeout(() => { if (canvasEl) canvasEl.style.cursor = 'default'; }, 150);
            }
        }
        handleRightClick(x, y);
    });
    document.addEventListener('keydown', (e) => {
        if (gameState.placingBuilding && e.key === 'Escape') {
             gameState.placingBuilding = null;
             canvas.classList.remove('placing-building', 'invalid-placement');
             showNotification("Building placement cancelled.");
             return;
        }
        gameState.keys[e.key.toLowerCase()] = true;
        if (e.key === ' ') {
            e.preventDefault();
            centerOnTownCenter();
        }
    });
    document.addEventListener('keyup', (e) => {
        gameState.keys[e.key.toLowerCase()] = false;
    });

    document.querySelectorAll('.unit, .building').forEach(element => {
        element.addEventListener('click', () => {
            const type = element.dataset.type;
            if (type in GAME_CONFIG.units) {
                trainUnit(type);
            } else if (type in GAME_CONFIG.buildings) {
                 startPlacingBuilding(type);
            }
        });
    });
    document.getElementById('btn-age-up').addEventListener('click', advanceAge);
    const fsBtn = document.getElementById('btn-fullscreen');
    if (fsBtn) {
        fsBtn.addEventListener('click', toggleFullscreen);
        document.addEventListener('fullscreenchange', () => {
            fsBtn.textContent = document.fullscreenElement ? 'Exit Fullscreen' : 'Enter Fullscreen';
            resizeCanvas();
        });
    }
    window.addEventListener('resize', resizeCanvas);
    const areaEl = canvas.parentElement;
    if (window.ResizeObserver && areaEl) {
        const ro = new ResizeObserver(() => resizeCanvas());
        ro.observe(areaEl);
        window.addEventListener('beforeunload', () => ro.disconnect(), { once: true });
    }
}

function resizeCanvas() {
    const canvas = document.getElementById('gameCanvas');
    const area = canvas.parentElement;
    const rect = area.getBoundingClientRect();
    const cssWidth = Math.max(480, Math.floor(rect.width));
    const cssHeight = Math.max(320, Math.floor(rect.height));
    const dpr = window.devicePixelRatio || 1;

    canvas.style.width = cssWidth + 'px';
    canvas.style.height = cssHeight + 'px';

    const bufferWidth = Math.floor(cssWidth * dpr);
    const bufferHeight = Math.floor(cssHeight * dpr);
    if (canvas.width !== bufferWidth || canvas.height !== bufferHeight) {
        canvas.width = bufferWidth;
        canvas.height = bufferHeight;
    }

    GAME_CONFIG.canvas.width = cssWidth;
    GAME_CONFIG.canvas.height = cssHeight;
}

function toggleFullscreen() {
    const elem = document.documentElement;
    if (!document.fullscreenElement) {
        if (elem.requestFullscreen) elem.requestFullscreen();
        else if (elem.webkitRequestFullscreen) elem.webkitRequestFullscreen();
        else if (elem.mozRequestFullScreen) elem.mozRequestFullScreen();
        else if (elem.msRequestFullscreen) elem.msRequestFullscreen();
    } else {
        if (document.exitFullscreen) document.exitFullscreen();
        else if (document.webkitExitFullscreen) document.webkitExitFullscreen();
        else if (document.mozCancelFullScreen) document.mozCancelFullScreen();
        else if (document.msExitFullscreen) document.msExitFullscreen();
    }
}

function updateSelectionBox(start, end) {
    const box = document.getElementById('selectionBox');
    const left = Math.min(start.x, end.x);
    const top = Math.min(start.y, end.y);
    const width = Math.abs(end.x - start.x);
    const height = Math.abs(end.y - start.y);
    box.style.left = left + 'px';
    box.style.top = top + 'px';
    box.style.width = width + 'px';
    box.style.height = height + 'px';
    box.style.display = 'block';
}

function finishSelection(start, end, isMultiSelect = false) {
    const left = Math.min(start.x, end.x) + gameState.camera.x;
    const top = Math.min(start.y, end.y) + gameState.camera.y;
    const right = Math.max(start.x, end.x) + gameState.camera.x;
    const bottom = Math.max(start.y, end.y) + gameState.camera.y;
    
    if (!isMultiSelect) {
        // Clear previous selection only if not multi-selecting
        gameState.selectedUnits.forEach(unit => unit.isSelected = false);
        gameState.buildings.forEach(building => building.isSelected = false);
        gameState.selectedUnits = [];
        gameState.selectedBuilding = null;
    }
    
    document.getElementById('building-actions').style.display = 'none';
    document.getElementById('general-units').style.display = 'block';
    
    // More precise unit selection - check if unit center or any part is within selection box
    gameState.units.forEach(unit => {
        if (unit.player === 'player') {
            // Check if unit center is in selection box OR if selection box overlaps with unit area
            const unitLeft = unit.x - 8; // Small buffer around unit
            const unitRight = unit.x + 8;
            const unitTop = unit.y - 8;
            const unitBottom = unit.y + 8;
            
            const isInSelectionBox = (
                // Unit center is in selection
                (unit.x >= left && unit.x <= right && unit.y >= top && unit.y <= bottom) ||
                // Or selection box overlaps with unit area
                (unitLeft <= right && unitRight >= left && unitTop <= bottom && unitBottom >= top)
            );
            
            if (isInSelectionBox) {
                if (isMultiSelect && unit.isSelected) {
                    // Remove from selection if already selected
                    unit.isSelected = false;
                    const index = gameState.selectedUnits.indexOf(unit);
                    if (index > -1) {
                        gameState.selectedUnits.splice(index, 1);
                    }
                } else if (!unit.isSelected) {
                    // Add to selection
                    unit.isSelected = true;
                    gameState.selectedUnits.push(unit);
                }
            }
        }
    });
    
    updateSelectionInfo();
}

function hideSelectionBox() {
    document.getElementById('selectionBox').style.display = 'none';
}

function handleRightClick(x, y) {
    if (gameState.selectedUnits.length === 0) return;
    const clickedTransport = gameState.units.find(u => isTransport(u) && Math.hypot(u.x - x, u.y - y) < 32);
    if (clickedTransport) {
        const landUnits = gameState.selectedUnits.filter(u => canEmbark(u));
        if (landUnits.length > 0) {
            for (const u of landUnits) {
                const cap = (clickedTransport.cargo ? clickedTransport.cargo.length : 0) < (GAME_CONFIG.units[clickedTransport.type].capacity || 0);
                const pickupRadius = 24;
                const dist = Math.hypot(u.x - clickedTransport.x, u.y - clickedTransport.y);
                if (dist <= pickupRadius && cap) {
                    tryEmbarkUnitsToTransport([u], clickedTransport);
                } else {
                    // Move straight toward the transport center and tag for auto-embark
                    u.state = 'moving';
                    u.targetX = clickedTransport.x;
                    u.targetY = clickedTransport.y;
                    u.embarkTargetId = clickedTransport.id;
                }
            }
            updateSelectionInfo();
            return;
        }
    }
    const enemyUnit = gameState.enemyUnits.find(unit => getDistance(unit, {x, y}) < 20);
    const enemyBuilding = gameState.enemyBuildings.find(building =>
        x >= building.x && x <= building.x + building.width &&
        y >= building.y && y <= building.y + building.height
    );
    const enemyTarget = enemyUnit || enemyBuilding;
    if (enemyTarget) {
        gameState.selectedUnits.forEach(unit => {
            unit.state = 'attacking';
            unit.target = enemyTarget;
            if (enemyTarget.width && enemyTarget.height) {
                unit.targetPoint = {
                    x: enemyTarget.x + enemyTarget.width / 2,
                    y: enemyTarget.y + enemyTarget.height / 2
                };
            } else {
                unit.targetPoint = undefined;
            }
        });
        showNotification('Attack command issued!');
        return;
    }
    const resource = gameState.worldObjects.find(obj =>
        obj.type === 'resource' && obj.amount > 0 &&
        x >= obj.x && x <= obj.x + obj.width &&
        y >= obj.y && y <= obj.y + obj.height
    );
  if (resource) {
      const offsets = computeFormationOffsets(gameState.selectedUnits.length, 24);
      gameState.selectedUnits.forEach((unit, idx) => {
            if (unit.type === 'villager') {
                unit.state = 'gathering';
                unit.targetResource = resource;
                unit.gatherType = resource.resourceType;
                unit.gatherStartTime = null;
            unit.gatheredAmount = 0;
            const off = offsets[idx] || {dx:0, dy:0};
            unit.gatherOffset = { dx: off.dx, dy: off.dy };
            } else {
                const off = offsets[idx] || {dx:0, dy:0};
                const clamped = clampTargetToAllowed(unit, resource.x + resource.width / 2 + off.dx, resource.y + resource.height / 2 + off.dy);
                setUnitDestination(unit, clamped.x, clamped.y);
                unit.target = null;
            }
        });
        if (gameState.selectedUnits.some(u => u.type === 'villager')) {
             showNotification('Gather command issued!');
        } else {
             showNotification('Move command issued!');
        }
        return;
    }
    const transports = gameState.selectedUnits.filter(isTransport);
    if (transports.length === 1) {
        const t = transports[0];
        if (getDistance({x, y}, t) < 30) {
            const others = gameState.selectedUnits.filter(u => u !== t);
            tryEmbarkUnitsToTransport(others, t);
            updateSelectionInfo();
            return;
        }
        if (!isPointInWater(x, y) || isPointOnBridge(x, y)) {
            if (t.cargo && t.cargo.length > 0) {
                disembarkCargo(t);
                return;
            }
        }
    }
    const offsets = computeFormationOffsets(gameState.selectedUnits.length, 24);
    gameState.selectedUnits.forEach((unit, idx) => {
        unit.state = 'moving';
        const off = offsets[idx] || {dx:0, dy:0};
        let clamped = clampTargetToAllowed(unit, x + off.dx, y + off.dy);
        const isVessel = !!GAME_CONFIG.units[unit.type]?.vessel;
        if (isVessel && isInWaterInnerBand(clamped.x, clamped.y, 1)) {
            for (const w of gameState.worldObjects) {
                if (w.type !== 'water') continue;
                if (clamped.x >= w.x - 2 && clamped.x <= w.x + w.width + 2 && clamped.y >= w.y - 2 && clamped.y <= w.y + w.height + 2) {
                    const cx = clamp(clamped.x, w.x + 2, w.x + w.width - 2);
                    const cy = clamp(clamped.y, w.y + 2, w.y + w.height - 2);
                    clamped = { x: cx, y: cy };
                    break;
                }
            }
        } else if (!isVessel && isOnLandShoreBand(clamped.x, clamped.y, 1)) {
            for (const w of gameState.worldObjects) {
                if (w.type !== 'water') continue;
                if (clamped.x >= w.x - 2 && clamped.x <= w.x + w.width + 2 && clamped.y >= w.y - 2 && clamped.y <= w.y + w.height + 2) {
                    if (clamped.x < w.x) clamped.x = w.x - 2; else if (clamped.x > w.x + w.width) clamped.x = w.x + w.width + 2;
                    if (clamped.y < w.y) clamped.y = w.y - 2; else if (clamped.y > w.y + w.height) clamped.y = w.y + w.height + 2;
                    break;
                }
            }
        }
        const free = getAvailablePosition(clamped.x, clamped.y, 15);
        
        // Use advanced pathfinding for movement
        setUnitDestination(unit, free.x, free.y);
        unit.target = null;
    });
}