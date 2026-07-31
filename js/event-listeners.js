// Event Listeners
function setupEventListeners() {
    const canvas = document.getElementById('gameCanvas');
    let mouseDown = false;
    let dragStart = { x: 0, y: 0 };

    const getCanvasPoint = (e) => {
        const rect = canvas.getBoundingClientRect();
        const screenX = e.clientX - rect.left;
        const screenY = e.clientY - rect.top;
        const zoom = gameState.zoomLevel || 1;
        return {
            screenX,
            screenY,
            worldX: screenX / zoom + gameState.camera.x,
            worldY: screenY / zoom + gameState.camera.y
        };
    };

    window.addEventListener('mousemove', (e) => {
        gameState.input.mouseX = e.clientX;
        gameState.input.mouseY = e.clientY;
        gameState.input.mouseInsideWindow = true;
    });
    window.addEventListener('mouseleave', () => {
        gameState.input.mouseInsideWindow = false;
    });
    window.addEventListener('blur', () => {
        gameState.input.mouseInsideWindow = false;
    });

    // Minimap click-to-navigate support
    const minimap = document.getElementById('minimapCanvas');
    if (minimap) {
        let mmDown = false;
        const moveCameraToMinimap = (e) => {
            const rect = minimap.getBoundingClientRect();
            const mx = e.clientX - rect.left;
            const my = e.clientY - rect.top;
            const nx = mx / Math.max(1, rect.width);
            const ny = my / Math.max(1, rect.height);
            const dx = nx - 0.5;
            const dy = ny - 0.5;
            if (Math.hypot(dx, dy) > 0.5) {
                return false;
            }
            const worldX = nx * GAME_CONFIG.world.width;
            const worldY = ny * GAME_CONFIG.world.height;
            // Center camera on clicked world position
            const zoom = gameState.zoomLevel || 1;
            gameState.camera.x = worldX - (GAME_CONFIG.canvas.width / zoom) / 2;
            gameState.camera.y = worldY - (GAME_CONFIG.canvas.height / zoom) / 2;
            if (typeof clampCameraToBounds === 'function') clampCameraToBounds();
            return true;
        };
        minimap.addEventListener('mousedown', (e) => {
            if (e.button !== 0) return;
            mmDown = moveCameraToMinimap(e);
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
                const { worldX, worldY } = getCanvasPoint(e);
                // Multiplayer client: send BUILD command to host
                if (typeof Multiplayer !== 'undefined' && Multiplayer.isClient) {
                    Multiplayer.sendCommand({
                        action: 'BUILD',
                        buildingType: gameState.placingBuilding,
                        workerIds: gameState.placingWorkerIds || [],
                        x: worldX,
                        y: worldY
                    });
                    gameState.placingBuilding = null;
                    gameState.placingWorkerIds = [];
                    canvas.classList.remove('placing-building', 'invalid-placement');
                    return;
                }
                if (canPlaceBuilding(gameState.placingBuilding, worldX, worldY)) {
                    placeBuilding(gameState.placingBuilding, worldX, worldY);
                } else {
                    showNotification("Cannot place building here!");
                }
                gameState.placingBuilding = null;
                gameState.placingWorkerIds = [];
                canvas.classList.remove('placing-building', 'invalid-placement');
                return;
            }

            const { screenX, screenY, worldX, worldY } = getCanvasPoint(e);

            // Check for building clicks first
            const clickedBuilding = getAllBuildings().find(building =>
                isLocalPlayerEntity(building) &&
                worldX >= building.x && worldX <= building.x + building.width &&
                worldY >= building.y && worldY <= building.y + building.height
            );

            if (clickedBuilding) {
                selectBuilding(clickedBuilding);
                return;
            }

            // Check for unit clicks with a small tolerance area (20 pixels radius)
            const clickedUnit = getAllUnits().find(unit => {
                if (!isLocalPlayerEntity(unit)) return false;
                const distance = Math.hypot(unit.x - worldX, unit.y - worldY);
                return distance <= 20; // 20 pixel radius for easier clicking
            });

            if (clickedUnit) {
                // Single unit selection with multi-select support
                const isMultiSelect = e.ctrlKey || e.metaKey; // Ctrl on Windows/Linux, Cmd on Mac

                if (!isMultiSelect) {
                    // Clear previous selection
                    gameState.selectedUnits.forEach(unit => unit.isSelected = false);
                    getAllBuildings().forEach(building => building.isSelected = false);
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
            dragStart.x = screenX;
            dragStart.y = screenY;
            gameState.isSelecting = true;
            gameState.selectionStart = { ...dragStart };
        }
    });
    canvas.addEventListener('mousemove', (e) => {
        if (gameState.placingBuilding) {
            const { worldX, worldY } = getCanvasPoint(e);
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
            const { screenX: currentX, screenY: currentY } = getCanvasPoint(e);

            // Only show selection box if drag distance is meaningful (> 3 pixels)
            const dragDistance = Math.hypot(currentX - dragStart.x, currentY - dragStart.y);
            if (dragDistance > 3) {
                updateSelectionBox(dragStart, { x: currentX, y: currentY });
            }
        }
        const { worldX, worldY } = getCanvasPoint(e);
        let cursor = 'default';

        // NEW CURSOR HINTS for embark/disembark
        const transports = gameState.selectedUnits.filter(u => isTransport(u));
        if (transports.length === 1) {
            const t = transports[0];
            const others = gameState.selectedUnits.filter(u => u !== t && canEmbark(u));
            const cap = GAME_CONFIG.units[t.type].capacity || 0;
            const used = (t.cargo || []).length;
            const nearMouseToTransport = Math.hypot(worldX - t.x, worldY - t.y) < 50;
            const anyEmbarkableNearby = others.some(u => Math.hypot(u.x - t.x, u.y - t.y) < 40);

            if (nearMouseToTransport && anyEmbarkableNearby && used < cap) {
                cursor = 'alias'; // embark cursor
            } else if ((t.cargo && t.cargo.length > 0) && !isPointInWater(worldX, worldY)) {
                cursor = 'copy'; // disembark cursor
            }
        }
        const canvasEl = document.getElementById('game-canvas');
        if (canvasEl) canvasEl.style.cursor = cursor;
    });
    canvas.addEventListener('mouseup', (e) => {
        if (gameState.placingBuilding) return;
        if (e.button === 0 && mouseDown) {
            mouseDown = false;
            if (gameState.isSelecting) {
                const { screenX: endX, screenY: endY } = getCanvasPoint(e);

                // Calculate the drag distance
                const dragDistance = Math.hypot(endX - dragStart.x, endY - dragStart.y);

                // If drag distance is very small (less than 5 pixels), treat as a click to deselect
                if (dragDistance < 5) {
                    // Deselect all units and buildings
                    gameState.selectedUnits.forEach(unit => unit.isSelected = false);
                    getAllBuildings().forEach(building => building.isSelected = false);
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
        const { worldX: x, worldY: y } = getCanvasPoint(e);
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
        // Initialize SFX on first user interaction
        if (typeof SFX !== 'undefined') SFX.ensureContext();
        if (gameState.selectedUnits.length > 0 && typeof SFX !== 'undefined') SFX.unitCommanded();
        handleRightClick(x, y);
    });

    canvas.addEventListener('wheel', (e) => {
        e.preventDefault();
        const zoomSensitivity = 0.001;
        const previousZoom = gameState.zoomLevel;
        gameState.zoomLevel -= e.deltaY * zoomSensitivity;
        gameState.zoomLevel = Math.max(0.5, Math.min(2.0, gameState.zoomLevel)); // Clamp between 0.5x and 2.0x

        // Adjust camera to zoom into mouse cursor
        const rect = canvas.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;

        const worldX = mouseX / previousZoom + gameState.camera.x;
        const worldY = mouseY / previousZoom + gameState.camera.y;

        gameState.camera.x = worldX - mouseX / gameState.zoomLevel;
        gameState.camera.y = worldY - mouseY / gameState.zoomLevel;
        if (typeof clampCameraToBounds === 'function') clampCameraToBounds();

        // Re-sync GIF overlays
        if (typeof syncOverlayToCanvas === 'function') {
            syncOverlayToCanvas();
        }
    }, { passive: false });
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && typeof closeOpenModal === 'function' && closeOpenModal()) {
            e.preventDefault();
            return;
        }
        if (e.key === 'Escape' && typeof isMainMenuOpen === 'function' && isMainMenuOpen()) {
            e.preventDefault();
            toggleMainMenu(false);
            return;
        }
        if (gameState.placingBuilding && e.key === 'Escape') {
            gameState.placingBuilding = null;
            gameState.placingWorkerIds = [];
            canvas.classList.remove('placing-building', 'invalid-placement');
            showNotification("Building placement cancelled.");
            return;
        }
        if (typeof Hotkeys !== 'undefined' && Hotkeys.handleKeyDown(e)) {
            return;
        }
        if (gameState.ui?.modalOpen) {
            return;
        }
        const key = e.key.toLowerCase();
        gameState.keys[key] = true;
        if (key === ' ') {
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
    window.addEventListener('resize', () => {
        resizeCanvas();
        if (typeof clampCameraToBounds === 'function') clampCameraToBounds();
        if (typeof syncOverlayToCanvas === 'function') syncOverlayToCanvas();
    });
    const areaEl = canvas.parentElement;
    if (window.ResizeObserver && areaEl) {
        const ro = new ResizeObserver(() => {
            resizeCanvas();
            if (typeof clampCameraToBounds === 'function') clampCameraToBounds();
            if (typeof syncOverlayToCanvas === 'function') syncOverlayToCanvas();
        });
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
    const zoom = gameState.zoomLevel || 1;
    const left = Math.min(start.x, end.x) / zoom + gameState.camera.x;
    const top = Math.min(start.y, end.y) / zoom + gameState.camera.y;
    const right = Math.max(start.x, end.x) / zoom + gameState.camera.x;
    const bottom = Math.max(start.y, end.y) / zoom + gameState.camera.y;

    if (!isMultiSelect) {
        // Clear previous selection only if not multi-selecting
        gameState.selectedUnits.forEach(unit => unit.isSelected = false);
        getAllBuildings().forEach(building => building.isSelected = false);
        gameState.selectedUnits = [];
        gameState.selectedBuilding = null;
    }

    document.getElementById('building-actions').style.display = 'none';
    document.getElementById('general-units').style.display = 'block';

    // More precise unit selection - check if unit center or any part is within selection box
    getAllUnits().forEach(unit => {
        if (isLocalPlayerEntity(unit)) {
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
    if (gameState.selectedBuilding && isLocalPlayerEntity(gameState.selectedBuilding)) {
        if (gameState.selectedBuilding.underConstruction) {
            showNotification(`${displayName(gameState.selectedBuilding.type)} is still under construction.`);
            return;
        }
        if (typeof Multiplayer !== 'undefined' && Multiplayer.isClient) {
            Multiplayer.sendCommand({
                action: 'RALLY',
                buildingId: gameState.selectedBuilding.id,
                targetX: x,
                targetY: y
            });
            showNotification(`${gameState.selectedBuilding.type} rally point set.`);
            if (typeof SFX !== 'undefined') SFX.unitCommanded();
            return;
        }
        gameState.selectedBuilding.rallyPoint = { x, y };
        showNotification(`${gameState.selectedBuilding.type} rally point set.`);
        if (typeof SFX !== 'undefined') SFX.unitCommanded(); // Use command sound
        return;
    }

    if (gameState.selectedUnits.length === 0) return;
    const constructionTarget = getBuildingsForPlayer(getLocalPlayerId()).find(building =>
        building.underConstruction &&
        x >= building.x && x <= building.x + building.width &&
        y >= building.y && y <= building.y + building.height
    );
    if (constructionTarget && typeof assignWorkersToConstruction === 'function') {
        const settings = typeof getConstructionSettings === 'function'
            ? getConstructionSettings()
            : { maxWorkers: 4 };
        const builders = gameState.selectedUnits
            .filter(unit => unit.type === 'villager' && isLocalPlayerEntity(unit) && unit.health > 0)
            .slice(0, settings.maxWorkers);
        if (builders.length === 0) {
            showNotification(`Select villager(s) to build ${displayName(constructionTarget.type)}.`);
            return;
        }
        if (typeof Multiplayer !== 'undefined' && Multiplayer.isClient) {
            Multiplayer.sendCommand({
                action: 'ASSIGN_BUILDERS',
                buildingId: constructionTarget.id,
                unitIds: builders.map(unit => unit.id)
            });
            showNotification(`${builders.length} villager(s) assigned to ${displayName(constructionTarget.type)}.`);
            return;
        }
        const added = assignWorkersToConstruction(constructionTarget, builders);
        const currentWorkers = typeof getConstructionWorkers === 'function'
            ? getConstructionWorkers(constructionTarget).length
            : 0;
        showNotification(added > 0
            ? `${added} villager(s) assigned to ${displayName(constructionTarget.type)}.`
            : currentWorkers >= settings.maxWorkers
                ? `${displayName(constructionTarget.type)} already has the maximum builders.`
                : `Those villager(s) are already building ${displayName(constructionTarget.type)}.`
        );
        return;
    }

    if (typeof releaseUnitFromConstruction === 'function') {
        gameState.selectedUnits.forEach(unit => releaseUnitFromConstruction(unit, 'idle'));
    }

    // NEW EMBARK SYSTEM: Right-click on friendly transport
    const clickedTransport = getAllUnits().find(u =>
        isLocalPlayerEntity(u) &&
        isTransport(u) &&
        Math.hypot(u.x - x, u.y - y) < 40
    );
    if (clickedTransport) {
        const landUnits = gameState.selectedUnits.filter(u => canEmbark(u));
        if (landUnits.length > 0) {
            if (typeof Multiplayer !== 'undefined' && Multiplayer.isClient) {
                Multiplayer.sendCommand({
                    action: 'EMBARK',
                    unitIds: landUnits.map(unit => unit.id),
                    transportId: clickedTransport.id
                });
                showNotification(`${landUnits.length} unit(s) moving to embark...`);
                return;
            }
            // Check if any units are already close enough to embark immediately
            const nearbyUnits = landUnits.filter(u => Math.hypot(u.x - clickedTransport.x, u.y - clickedTransport.y) <= 40);
            const farUnits = landUnits.filter(u => Math.hypot(u.x - clickedTransport.x, u.y - clickedTransport.y) > 40);

            // Embark nearby units immediately
            if (nearbyUnits.length > 0) {
                embarkUnitsNearTransport(nearbyUnits, clickedTransport);
            }

            // Send far units toward the transport for future embarking
            // Use pathfinding to a point near the transport (on land side) to avoid walking on water
            for (const u of farUnits) {
                // Clamp target to allowed terrain for this unit type (land units can't path to water)
                const clamped = clampTargetToAllowed(u, clickedTransport.x, clickedTransport.y);
                setUnitDestination(u, clamped.x, clamped.y);
                u.embarkTargetId = clickedTransport.id;
            }

            if (farUnits.length > 0) {
                showNotification(`${farUnits.length} unit(s) moving to embark...`);
            }

            updateSelectionInfo();
            return;
        }
    }
    const commandSource = gameState.selectedUnits[0] || getLocalPlayerId();
    const enemyUnit = getAllUnits().find(unit =>
        !isLocalPlayerEntity(unit) &&
        areHostile(commandSource, unit) &&
        (typeof canPlayerSeeEnemyUnit !== 'function' || canPlayerSeeEnemyUnit(unit)) &&
        getDistance(unit, { x, y }) < 20
    );
    const enemyBuilding = getAllBuildings().find(building =>
        !isLocalPlayerEntity(building) &&
        areHostile(commandSource, building) &&
        (typeof canPlayerSeeEnemyBuilding !== 'function' || canPlayerSeeEnemyBuilding(building)) &&
        x >= building.x && x <= building.x + building.width &&
        y >= building.y && y <= building.y + building.height
    );
    const enemyTarget = enemyUnit || enemyBuilding;
    if (enemyTarget) {
        // Multiplayer client: send ATTACK command to host
        if (typeof Multiplayer !== 'undefined' && Multiplayer.isClient) {
            Multiplayer.sendCommand({
                action: 'ATTACK',
                unitIds: gameState.selectedUnits.map(u => u.id),
                targetId: enemyTarget.id
            });
            showNotification('Attack command issued!');
            return;
        }
        gameState.selectedUnits.forEach(unit => {
            unit.state = 'attacking';
            unit.target = enemyTarget;
            unit.attackPath = null;
            unit.attackPathTimer = -Math.random() * 450;
            unit.attackPathFailed = false;
            unit.attackPathFailCount = 0;
            unit.attackPathRetryDelay = 0;
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
        if (typeof Multiplayer !== 'undefined' && Multiplayer.isClient) {
            Multiplayer.sendCommand({
                action: 'GATHER',
                unitIds: gameState.selectedUnits.map(u => u.id),
                resourceId: resource.id
            });
            showNotification('Gather command issued!');
            return;
        }
        const offsets = computeFormationOffsets(gameState.selectedUnits.length, 28);
        gameState.selectedUnits.forEach((unit, idx) => {
            if (unit.type === 'villager') {
                unit.state = 'gathering';
                unit.targetResource = resource;
                unit.gatherType = resource.resourceType;
                unit.gatherStartTime = null;
                unit.gatheredAmount = 0;
                unit.gatherPath = null;
                unit.gatherPathTimer = 0;
                unit.gatherPathFailed = false;
                unit.gatherPathFailCount = 0;
                unit.gatherPathRetryDelay = 0;
                const off = offsets[idx] || { dx: 0, dy: 0 };
                unit.gatherOffset = { dx: off.dx, dy: off.dy };
            } else {
                const off = offsets[idx] || { dx: 0, dy: 0 };
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
    // Check for selected transport ships for disembarking
    const transports = gameState.selectedUnits.filter(isTransport);
    if (transports.length === 1) {
        const transport = transports[0];

        // If right-clicking near the transport and it has cargo, embark other selected units
        if (getDistance({ x, y }, transport) < 50) {
            const landUnits = gameState.selectedUnits.filter(u => u !== transport && canEmbark(u));
            if (landUnits.length > 0) {
                embarkUnitsNearTransport(landUnits, transport);
                return;
            }
        }

        // If right-clicking on land/shore and transport has cargo, disembark
        if (!isPointInWater(x, y) || isPointOnBridge(x, y)) {
            if (transport.cargo && transport.cargo.length > 0) {
                if (typeof Multiplayer !== 'undefined' && Multiplayer.isClient) {
                    Multiplayer.sendCommand({
                        action: 'DISEMBARK',
                        transportId: transport.id,
                        targetX: x,
                        targetY: y
                    });
                    return;
                }
                // Use pathfinding to move transport toward shore (clamped to water for vessels)
                const clamped = clampTargetToAllowed(transport, x, y);
                setUnitDestination(transport, clamped.x, clamped.y);
                // Mark for disembark when close to shore - checked in updateUnit via flag
                transport._pendingDisembark = true;
                return;
            }
        }
    }
    // Multiplayer client: send MOVE command to host
    if (typeof Multiplayer !== 'undefined' && Multiplayer.isClient) {
        Multiplayer.sendCommand({
            action: 'MOVE',
            unitIds: gameState.selectedUnits.map(u => u.id),
            targetX: x,
            targetY: y
        });
        return;
    }
    const offsets = computeFormationOffsets(gameState.selectedUnits.length, 28);
    gameState.selectedUnits.forEach((unit, idx) => {
        unit.state = 'moving';
        const off = offsets[idx] || { dx: 0, dy: 0 };
        let clamped = clampTargetToAllowed(unit, x + off.dx, y + off.dy);
        // No special shoreline band logic; clampTargetToAllowed already enforces land/water and bridges
        const free = getAvailablePosition(clamped.x, clamped.y, 15);

        // Use advanced pathfinding for movement
        setUnitDestination(unit, free.x, free.y);
        // Keep the formation slot as the final target. A* waypoints are cell
        // centers, and collapsing several slots onto one center makes units
        // orbit the same point instead of settling beside one another.
        unit.targetX = free.x;
        unit.targetY = free.y;
        unit.target = null;
    });
}
