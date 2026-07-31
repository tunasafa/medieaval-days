// ============================================================
// Hotkey System
// ============================================================

const Hotkeys = (function() {
    const controlGroups = {}; // Maps '1' through '9' to arrays of unit/building references

    // Quick train bindings (for selected buildings)
    const quickTrainMap = {
        'q': 0, // 1st unit
        'w': 1, // 2nd unit
        'e': 2, // 3rd unit
        'r': 3  // 4th unit
    };
    const quickBuildMap = {
        'z': 'house',
        'x': 'barracks',
        'c': 'archeryRange',
        'v': 'craftery',
        'b': 'blacksmith',
        'n': 'university',
        'm': 'navy'
    };

    function isTextInput(target) {
        return target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable);
    }

    function centerCameraOn(x, y) {
        const zoom = gameState.zoomLevel || 1;
        gameState.camera.x = x - (GAME_CONFIG.canvas.width / zoom) / 2;
        gameState.camera.y = y - (GAME_CONFIG.canvas.height / zoom) / 2;
        if (typeof clampCameraToBounds === 'function') clampCameraToBounds();
    }

    function handleKeyDown(e) {
        // Don't trigger hotkeys if user is typing in an input field (if any exist)
        if (isTextInput(e.target)) return false;

        const key = e.key.toLowerCase();
        if (gameState.ui?.modalOpen) return false;

        // --- Control Groups (Ctrl + 1-9 to save, 1-9 to load) ---
        if (key >= '1' && key <= '9') {
            e.preventDefault();
            if (e.ctrlKey || e.metaKey) {
                // Save selection to control group
                controlGroups[key] = [...gameState.selectedUnits];
                if (gameState.selectedBuilding) {
                    controlGroups[key].push(gameState.selectedBuilding);
                }
                showNotification(`Control group ${key} saved`);
                if (typeof SFX !== 'undefined') SFX.unitCommanded();
            } else {
                // Load selection from control group
                const group = controlGroups[key];
                if (group && group.length > 0) {
                        // Filter out dead units/buildings
                        const validGroup = group.filter(entity => {
                            if (entity.health <= 0) return false;
                            if (typeof isLocalPlayerEntity === 'function' && !isLocalPlayerEntity(entity)) return false;
                            if (entity.width) {
                                return getAllBuildings().includes(entity);
                            }
                            return getAllUnits().includes(entity);
                        });

                    // Update the group with only alive entities
                    controlGroups[key] = validGroup;

                    if (validGroup.length > 0) {
                        // Clear current selection
                        gameState.selectedUnits.forEach(u => u.isSelected = false);
                        gameState.selectedUnits = [];
                        if (gameState.selectedBuilding) {
                            gameState.selectedBuilding.isSelected = false;
                            gameState.selectedBuilding = null;
                        }

                        // Apply new selection
                        validGroup.forEach(entity => {
                            entity.isSelected = true;
                            if (entity.width) {
                                gameState.selectedBuilding = entity; // Can only select one building technically in UI
                            } else {
                                gameState.selectedUnits.push(entity);
                            }
                        });

                        updateSelectionInfo();
                        if (typeof SFX !== 'undefined') SFX.unitSelected();
                    }
                }
            }
            return true;
        }

        // --- Center on Town Center ---
        if (key === 'h') {
            e.preventDefault();
            centerOnTownCenter();
            return true;
        }

        // --- Tech Tree ---
        if (key === 't') {
            e.preventDefault();
            if (typeof toggleTechTreeModal === 'function') {
                toggleTechTreeModal();
            }
            return true;
        }

        // --- Find Idle Villager ---
        if (key === '.') {
            e.preventDefault();
            if (typeof selectNextIdleVillager === 'function') selectNextIdleVillager();
            return true;
        }

        // --- Quick Build ---
        if (quickBuildMap[key]) {
            e.preventDefault();
            startPlacingBuilding(quickBuildMap[key]);
            return true;
        }

        // --- Quick Train ---
        if (quickTrainMap[key] !== undefined && gameState.selectedBuilding && isLocalPlayerEntity(gameState.selectedBuilding)) {
            e.preventDefault();
            const buildingType = gameState.selectedBuilding.type;
            let trainableUnits = [];

            if (buildingType === 'town-center') trainableUnits = ['villager'];
            else if (buildingType === 'barracks') trainableUnits = ['militia', 'warrior', 'axeman'];
            else if (buildingType === 'archeryRange') trainableUnits = ['archer', 'crossbowman'];
            else if (buildingType === 'craftery') {
                trainableUnits = ['ballista', 'catapult'];
                const hasWater = typeof hasWaterTerrain === 'function' ? hasWaterTerrain() :
                    gameState.worldObjects.some(o => o.type === 'water' || o.type === 'lake');
                if (hasWater) trainableUnits.push('bridge');
            }
            else if (buildingType === 'navy') trainableUnits = ['fishingBoat', 'transportLarge', 'warship'];

            const unitToTrain = trainableUnits[quickTrainMap[key]];
            if (unitToTrain) {
                if (unitToTrain === 'bridge') {
                    startPlacingBuilding('bridge');
                } else {
                    trainUnitFromBuilding(unitToTrain, gameState.selectedBuilding);
                }
            }
            return true;
        }

        // --- Delete Selected Units ---
        if (key === 'delete' || key === 'backspace') {
            e.preventDefault();
            if (typeof Multiplayer !== 'undefined' && Multiplayer.isClient) return true;
            if (gameState.selectedUnits.length > 0) {
                // Kill them all
                [...gameState.selectedUnits].forEach(u => {
                    u.health = 0;
                    handleUnitDeath(u);
                });
                gameState.selectedUnits = [];
                updateSelectionInfo();
            } else if (gameState.selectedBuilding) {
                gameState.selectedBuilding.health = 0;
                handleBuildingDestruction(gameState.selectedBuilding);
                gameState.selectedBuilding = null;
                updateSelectionInfo();
            }
            return true;
        }

        return false;
    }

    return {
        handleKeyDown
    };
})();
