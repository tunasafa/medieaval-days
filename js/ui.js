// UI Functions
function updateUI() {
    document.getElementById('food-count').textContent = Math.floor(gameState.resources.food);
    document.getElementById('wood-count').textContent = Math.floor(gameState.resources.wood);
    document.getElementById('stone-count').textContent = Math.floor(gameState.resources.stone);
    document.getElementById('gold-count').textContent = Math.floor(gameState.resources.gold);
    document.getElementById('population').textContent = `${gameState.population.current}/${gameState.population.max}`;
    document.getElementById('enemy-units').textContent = gameState.enemyUnits.length;
    document.getElementById('enemy-buildings').textContent = gameState.enemyBuildings.length;
}

function updateTrainingQueueUI() {
    const b = gameState.selectedBuilding;
    if (!b) return;
    const current = (b.trainingQueue || [])[0] || null;
    const list = document.querySelector('#building-unit-list');
    if (!list) return;
    list.querySelectorAll('.unit').forEach(unitEl => {
        const type = unitEl.dataset.type;
        const progressFill = unitEl.querySelector('.progress-bar .progress-fill');
        const pill = unitEl.querySelector('.queue-pill');
        const items = (b.trainingQueue || []).filter(t => t.type === type);
        const queuedCount = items.length;
        if (pill) {
            pill.style.display = queuedCount > 0 ? 'inline-flex' : 'none';
            if (queuedCount > 0) pill.textContent = `x${queuedCount}`;
        }
        if (progressFill) {
            if (current && current.type === type) {
                const pct = 1 - (current.timeRemaining / current.totalTime);
                progressFill.style.width = `${Math.max(0, Math.min(100, pct * 100))}%`;
            } else {
                progressFill.style.width = '0%';
            }
        }
    });
}

function updateSelectionInfo() {
    const info = document.getElementById('selection-info');
    
    if (gameState.selectedBuilding) {
        const building = gameState.selectedBuilding;
        info.innerHTML = `
            <div><strong>${building.type.charAt(0).toUpperCase() + building.type.slice(1)}</strong></div>
            <div>Health: ${building.health}/${getBuildingConfig(building.type).maxHealth}</div>
            <div>Player: ${building.player}</div>
        `;
    } else if (gameState.selectedUnits.length === 0) {
        info.textContent = 'No units or buildings selected';
    } else if (gameState.selectedUnits.length === 1) {
        const unit = gameState.selectedUnits[0];
        info.innerHTML = `
            <div><strong>${unit.type.charAt(0).toUpperCase() + unit.type.slice(1)}</strong></div>
            <div>Health: ${unit.health}/${GAME_CONFIG.units[unit.type].maxHealth}</div>
            <div>State: ${unit.state}</div>
        `;
        // NEW TRANSPORT UI: Show cargo and disembark button
        const cfg = GAME_CONFIG.units[unit.type];
        if (isTransport(unit)) {
            unit.cargo = unit.cargo || [];
            const cap = cfg.capacity || 0;
            const used = unit.cargo.length;
            const btns = document.createElement('div');
            btns.style.marginTop = '6px';
            btns.innerHTML = `<div>Cargo: ${used}/${cap}</div>`;
            
            if (used > 0) {
                const disembarkBtn = document.createElement('button');
                disembarkBtn.textContent = `Disembark ${used} unit(s)`;
                disembarkBtn.style.marginTop = '4px';
                disembarkBtn.onclick = () => disembarkCargoNearShore(unit);
                btns.appendChild(disembarkBtn);
            }
            
            info.appendChild(btns);
        }
    } else {
        info.innerHTML = `
            <div><strong>${gameState.selectedUnits.length} units selected</strong></div>
        `;
    }
}

function advanceAge() {
     if (gameState.currentAge === 'Dark Age') {
        if (gameState.resources.food >= 500) {
            gameState.resources.food -= 500;
            gameState.currentAge = 'Feudal Age';
            document.getElementById('age-display').textContent = gameState.currentAge;
            showNotification('Advanced to Feudal Age! Axemen and Crossbowmen unlocked.');
            document.getElementById('btn-age-up').textContent = 'Advance to Castle Age (800 Food, 200 Gold)';
            
            if (gameState.selectedBuilding) {
                showBuildingActions(gameState.selectedBuilding);
            }
        } else {
            showNotification('Not enough Food (need 500)!');
        }
     } else if (gameState.currentAge === 'Feudal Age') {
         if (gameState.resources.food >= 800 && gameState.resources.gold >= 200) {
            gameState.resources.food -= 800;
            gameState.resources.gold -= 200;
            gameState.currentAge = 'Castle Age';
            document.getElementById('age-display').textContent = gameState.currentAge;
            showNotification('Advanced to Castle Age! Siege weapons unlocked.');
            document.getElementById('btn-age-up').textContent = 'Advance to Imperial Age (1000 Food, 800 Gold)';
            
            if (gameState.selectedBuilding) {
                showBuildingActions(gameState.selectedBuilding);
            }
         } else {
             showNotification('Not enough resources (need 800 Food, 200 Gold)!');
         }
     } else if (gameState.currentAge === 'Castle Age') {
          if (gameState.resources.food >= 1000 && gameState.resources.gold >= 800) {
            gameState.resources.food -= 1000;
            gameState.resources.gold -= 800;
            gameState.currentAge = 'Imperial Age';
            document.getElementById('age-display').textContent = gameState.currentAge;
            showNotification('Advanced to Imperial Age!');
            document.getElementById('btn-age-up').disabled = true;
            document.getElementById('btn-age-up').textContent = 'Max Age Reached';
         } else {
             showNotification('Not enough resources (need 1000 Food, 800 Gold)!');
         }
     }
}

function checkWinConditions() {
    const enemyTownCenters = gameState.enemyBuildings.filter(b =>
        b.type === 'town-center' && b.health > 0
    );
    if (enemyTownCenters.length === 0) {
        endGame(true, 'Victory! You have destroyed the enemy!');
        return;
    }
    const playerTownCenters = gameState.buildings.filter(b =>
        b.type === 'town-center' && b.health > 0
    );
    if (playerTownCenters.length ===  0) {
        endGame(false, 'Defeat! Your empire has fallen!');
        return;
    }
}

function endGame(victory, message) {
    gameState.gameOver = true;
    const gameOverDiv = document.getElementById('gameOver');
    const gameOverText = document.getElementById('gameOverText');
    const gameOverSubtext = document.getElementById('gameOverSubtext');
    gameOverText.textContent = victory ? 'Victory!' : 'Defeat!';
    gameOverText.style.color = victory ? '#4CAF50' : '#F44336';
    gameOverSubtext.textContent = message;
    gameOverDiv.style.display = 'flex';
}

function showNotification(message) {
    const notification = document.getElementById('notification');
    notification.textContent = message;
    notification.style.display = 'block';
    setTimeout(() => {
        notification.style.display = 'none';
    }, 3000);
}

// Add sprite debugging function
// Removed legacy PNG sprite-sheet debug/preload; units load via AssetManager GIFs.

function centerOnTownCenter() {
    const townCenter = gameState.buildings.find(b => b.type === 'town-center' && b.player === 'player');
    if (townCenter) {
        gameState.camera.x = townCenter.x + townCenter.width / 2 - (GAME_CONFIG.camera.width / 2);
        gameState.camera.y = townCenter.y + townCenter.height / 2 - (GAME_CONFIG.camera.height / 2);
    }
}

// Initialize the game when the page loads
document.addEventListener('DOMContentLoaded', function() {
    console.log('dw loaded, initializing game...');
    // Initialization relies on initGame -> assetManager.preloadGameAssets()
    initGame();
});
