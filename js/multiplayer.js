/**
 * Medieval Days — Client-side multiplayer networking module.
 *
 * Architecture: State-Broadcast model.
 *   - HOST runs the full game simulation and broadcasts state snapshots at 15 ticks/sec.
 *   - CLIENT receives snapshots, overwrites local gameState, and only renders.
 *   - CLIENT user actions are serialised as commands and sent to the host for execution.
 *
 * Public API (all accessed via the `Multiplayer` global):
 *   Multiplayer.connect(ip, port)         → Promise  (connect to relay server)
 *   Multiplayer.sendCommand(cmd)          → void     (client sends action to host)
 *   Multiplayer.broadcastGameStart()      → void     (host pushes initial state)
 *   Multiplayer.isHost / .isClient        → boolean
 *   Multiplayer.isMultiplayer             → boolean
 *   Multiplayer.connected                 → boolean
 *   Multiplayer.playerId                  → number
 *   Multiplayer.disconnect()              → void
 */

const Multiplayer = (() => {
    // ─── Private State ──────────────────────────────
    let ws = null;
    let _role = null;        // 'host' | 'client' | null
    let _playerId = null;
    let _connected = false;
    let snapshotInterval = null;

    const TICK_RATE = 15;    // State snapshots per second
    const TICK_MS = Math.round(1000 / TICK_RATE);

    // ─── CONNECTION ─────────────────────────────────

    /**
     * Connect to the relay server.
     * @param {string} ip   - Host IP or 'localhost'
     * @param {number} port - Server port (default 9000)
     * @returns {Promise} Resolves with the role-assigned message
     */
    function connect(ip, port = 9000) {
        return new Promise((resolve, reject) => {
            try {
                ws = new WebSocket(`ws://${ip}:${port}`);
            } catch (err) {
                return reject(err);
            }

            const timeout = setTimeout(() => {
                reject(new Error('Connection timed out'));
                if (ws) ws.close();
            }, 8000);

            ws.onopen = () => {
                _connected = true;
            };

            ws.onclose = () => {
                clearTimeout(timeout);
                _connected = false;
                _role = null;
                stopBroadcasting();
                if (typeof showNotification === 'function') {
                    showNotification('Multiplayer connection lost.');
                }
            };

            ws.onerror = (err) => {
                clearTimeout(timeout);
                reject(err);
            };

            ws.onmessage = (event) => {
                let msg;
                try {
                    msg = JSON.parse(event.data);
                } catch (e) {
                    console.warn('[MP] Bad message from server:', e);
                    return;
                }
                handleMessage(msg);
                if (msg.type === 'role-assigned') {
                    clearTimeout(timeout);
                    resolve(msg);
                }
            };
        });
    }

    function disconnect() {
        stopBroadcasting();
        if (ws) {
            ws.close();
            ws = null;
        }
        _role = null;
        _playerId = null;
        _connected = false;
    }

    // ─── MESSAGE HANDLER ────────────────────────────

    function handleMessage(msg) {
        switch (msg.type) {
            case 'role-assigned':
                _role = msg.role;
                _playerId = msg.playerId;
                console.log(`[MP] Assigned role: ${_role}, player ID: ${_playerId}`);
                break;

            case 'player-joined':
                console.log(`[MP] Player ${msg.playerId} has joined!`);
                if (typeof showNotification === 'function') {
                    showNotification(`Player ${msg.playerId} has joined the game!`);
                }
                break;

            case 'player-left':
                console.log(`[MP] Player ${msg.playerId} has left.`);
                if (typeof showNotification === 'function') {
                    showNotification(`Player ${msg.playerId} has disconnected.`);
                }
                break;

            case 'host-disconnected':
                console.warn('[MP] Host disconnected!');
                if (typeof showNotification === 'function') {
                    showNotification('Host disconnected! Game cannot continue.');
                }
                break;

            case 'game-start':
                // Client receives initial game state + world config from host
                if (_role === 'client') {
                    console.log('[MP] Received game-start from host. Initializing...');
                    applyGameStart(msg);
                }
                break;

            case 'state-snapshot':
                // Client receives authoritative state from host
                if (_role === 'client') {
                    deserializeState(msg.state);
                }
                break;

            case 'command':
                // Host receives a command from a client
                if (_role === 'host') {
                    executeRemoteCommand(msg);
                }
                break;

            case 'chat':
                if (typeof showNotification === 'function') {
                    showNotification(`Player ${msg.from}: ${msg.message}`);
                }
                break;
        }
    }

    // ─── GAME START (Client receives) ───────────────

    async function applyGameStart(msg) {
        // Apply the full initial state
        deserializeState(msg.state);

        // Copy world object data if provided (resources, water, etc.)
        if (msg.worldObjects) {
            gameState.worldObjects = msg.worldObjects;
        }

        // Close main menu, start rendering
        document.body.classList.remove('menu-open');
        const mainMenu = document.getElementById('main-menu');
        if (mainMenu) mainMenu.classList.remove('open');
        gameState.ui.modalOpen = null;
        gameState.ui.hasStarted = true;

        // Close the multiplayer modal
        const mpModal = document.getElementById('mp-modal');
        if (mpModal) mpModal.setAttribute('aria-hidden', 'true');

        // Initialize rendering systems that the client needs
        if (typeof resizeCanvas === 'function') resizeCanvas();
        if (typeof initTilemap === 'function') await initTilemap();
        if (tilemap && gameState.worldObjects) {
            tilemap.markWaterAreas(gameState.worldObjects);
        }
        if (typeof initializePathfinding === 'function') initializePathfinding();
        if (typeof FogOfWar !== 'undefined') {
            FogOfWar.init(GAME_CONFIG.world.width, GAME_CONFIG.world.height);
        }
        if (typeof setupEventListeners === 'function') setupEventListeners();
        if (typeof drawUIIcons === 'function') await drawUIIcons();

        // Center camera on Player 2's town center
        const p2TC = gameState.buildings.find(b => b.type === 'town-center' && b.player === 'player2');
        if (p2TC) {
            const zoom = gameState.zoomLevel || 1;
            gameState.camera.x = p2TC.x + p2TC.width / 2 - (GAME_CONFIG.canvas.width / zoom) / 2;
            gameState.camera.y = p2TC.y + p2TC.height / 2 - (GAME_CONFIG.canvas.height / zoom) / 2;
            if (typeof clampCameraToBounds === 'function') clampCameraToBounds();
        }

        // Start the render loop
        gameState.lastUpdate = Date.now();
        gameLoop();

        if (typeof showNotification === 'function') {
            showNotification('Connected to host! You are Player 2. Good luck!');
        }
    }

    // ─── STATE SERIALIZATION ────────────────────────

    /**
     * Serialize the current gameState into a compact JSON-friendly object.
     * Only includes data needed for rendering and game logic on the client.
     */
    function serializeState() {
        return {
            resources: gameState.resources,
            resourceRates: gameState.resourceRates,
            population: gameState.population,
            units: gameState.units.map(serializeUnit),
            buildings: gameState.buildings.map(serializeBuilding),
            enemyUnits: gameState.enemyUnits.map(serializeUnit),
            enemyBuildings: gameState.enemyBuildings.map(serializeBuilding),
            gameTime: gameState.gameTime,
            currentAge: gameState.currentAge,
            gameOver: gameState.gameOver,
            // Player 2 specific state
            p2Resources: gameState.p2Resources || null,
            p2Population: gameState.p2Population || null
        };
    }

    function serializeUnit(u) {
        return {
            id: u.id,
            type: u.type,
            player: u.player,
            faction: u.faction,
            x: Math.round(u.x * 10) / 10, // 1 decimal precision
            y: Math.round(u.y * 10) / 10,
            health: Math.round(u.health),
            maxHealth: u.maxHealth || (GAME_CONFIG.units[u.type]?.maxHealth),
            state: u.state,
            gatherType: u.gatherType || null,
            isSelected: false, // Never sync selection state
            anim: u.anim ? {
                action: u.anim.action,
                direction: u.anim.direction,
                frame: u.anim.frame
            } : null
        };
    }

    function serializeBuilding(b) {
        return {
            id: b.id,
            type: b.type,
            player: b.player,
            faction: b.faction,
            factionName: b.factionName,
            factionColor: b.factionColor,
            x: b.x,
            y: b.y,
            width: b.width,
            height: b.height,
            health: Math.round(b.health),
            maxHealth: b.maxHealth,
            underConstruction: b.underConstruction || false,
            rallyPoint: b.rallyPoint || null,
            construction: b.underConstruction ? {
                totalTime: b.construction?.totalTime,
                timeRemaining: b.construction?.timeRemaining
            } : undefined
        };
    }

    /**
     * Apply received state onto local gameState.
     * Uses ID-based merging to preserve local object references and reduce GC pressure.
     */
    function deserializeState(state) {
        if (!state) return;

        // Scalar values — direct overwrite
        gameState.resources = state.resources;
        gameState.resourceRates = state.resourceRates;
        gameState.population = state.population;
        gameState.gameTime = state.gameTime;
        gameState.currentAge = state.currentAge;
        gameState.gameOver = state.gameOver;

        // Player 2 state
        if (state.p2Resources) gameState.p2Resources = state.p2Resources;
        if (state.p2Population) gameState.p2Population = state.p2Population;

        // Entity arrays — smart merge by ID
        mergeEntityArray(gameState.units, state.units);
        mergeEntityArray(gameState.buildings, state.buildings);
        mergeEntityArray(gameState.enemyUnits, state.enemyUnits);
        mergeEntityArray(gameState.enemyBuildings, state.enemyBuildings);
    }

    /**
     * ID-based merge: update existing, remove dead, add new entities.
     * Preserves local object references where possible.
     */
    function mergeEntityArray(localArr, remoteArr) {
        if (!remoteArr) return;

        const remoteMap = new Map();
        for (const e of remoteArr) {
            remoteMap.set(e.id, e);
        }

        // Walk backwards so splice doesn't break indices
        for (let i = localArr.length - 1; i >= 0; i--) {
            const local = localArr[i];
            const remote = remoteMap.get(local.id);
            if (remote) {
                // Update in place — preserve the object reference
                Object.assign(local, remote);
                remoteMap.delete(local.id);
            } else {
                // Entity no longer exists on host → remove
                localArr.splice(i, 1);
            }
        }

        // Add any new entities that didn't exist locally
        for (const entity of remoteMap.values()) {
            localArr.push(entity);
        }
    }

    // ─── COMMANDS (Client → Host) ───────────────────

    /**
     * Send a game command to the host for execution.
     * @param {Object} cmd - Command object with `action` and params
     */
    function sendCommand(cmd) {
        if (!_connected || !ws || ws.readyState !== 1) return;
        ws.send(JSON.stringify({ type: 'command', ...cmd }));
    }

    /**
     * Host-side: execute a command received from a remote client.
     */
    function executeRemoteCommand(cmd) {
        console.log(`[MP] Executing remote command: ${cmd.action}`, cmd);

        switch (cmd.action) {
            case 'MOVE': {
                const units = (cmd.unitIds || [])
                    .map(id => gameState.units.find(u => u.id === id))
                    .filter(Boolean);
                if (units.length > 0 && typeof moveUnitsTo === 'function') {
                    moveUnitsTo(units, cmd.targetX, cmd.targetY);
                }
                break;
            }

            case 'ATTACK': {
                const attackers = (cmd.unitIds || [])
                    .map(id => gameState.units.find(u => u.id === id))
                    .filter(Boolean);
                const target = [...gameState.units, ...gameState.enemyUnits,
                    ...gameState.buildings, ...gameState.enemyBuildings]
                    .find(e => e.id === cmd.targetId);
                if (attackers.length && target && typeof assignAttackTarget === 'function') {
                    attackers.forEach(u => assignAttackTarget(u, target));
                }
                break;
            }

            case 'BUILD': {
                if (typeof canPlaceBuilding === 'function' &&
                    typeof placeBuilding === 'function' &&
                    canPlaceBuilding(cmd.buildingType, cmd.x, cmd.y)) {
                    placeBuilding(cmd.buildingType, cmd.x, cmd.y);
                }
                break;
            }

            case 'TRAIN': {
                const building = gameState.buildings.find(b => b.id === cmd.buildingId);
                if (building && typeof trainUnit === 'function') {
                    trainUnit(building, cmd.unitType);
                }
                break;
            }

            case 'RESEARCH': {
                if (typeof startResearch === 'function') {
                    startResearch(cmd.upgradeId, cmd.buildingId);
                }
                break;
            }

            case 'GATHER': {
                const gatherers = (cmd.unitIds || [])
                    .map(id => gameState.units.find(u => u.id === id))
                    .filter(Boolean);
                const resource = gameState.worldObjects.find(o => o.id === cmd.resourceId);
                if (gatherers.length && resource) {
                    gatherers.forEach(u => {
                        u.state = 'moving';
                        u.target = resource;
                        u.gatherType = resource.resourceType;
                    });
                }
                break;
            }

            default:
                console.warn('[MP] Unknown command action:', cmd.action);
        }
    }

    // ─── BROADCASTING (Host only, 15 ticks/sec) ─────

    function startBroadcasting() {
        if (snapshotInterval) return;
        snapshotInterval = setInterval(() => {
            if (!_connected || _role !== 'host' || !ws || ws.readyState !== 1) return;
            try {
                const snapshot = JSON.stringify({
                    type: 'state-snapshot',
                    state: serializeState()
                });
                ws.send(snapshot);
            } catch (e) {
                console.error('[MP] Failed to send snapshot:', e);
            }
        }, TICK_MS);
    }

    function stopBroadcasting() {
        if (snapshotInterval) {
            clearInterval(snapshotInterval);
            snapshotInterval = null;
        }
    }

    // ─── GAME START (Host triggers) ─────────────────

    function broadcastGameStart() {
        if (_role !== 'host' || !_connected || !ws) return;
        console.log('[MP] Broadcasting game-start to clients...');
        const msg = JSON.stringify({
            type: 'game-start',
            state: serializeState(),
            worldObjects: gameState.worldObjects
        });
        ws.send(msg);
        startBroadcasting();
    }

    // ─── PUBLIC API ─────────────────────────────────

    return Object.freeze({
        connect,
        disconnect,
        sendCommand,
        broadcastGameStart,
        startBroadcasting,
        stopBroadcasting,

        get role()          { return _role; },
        get connected()     { return _connected; },
        get playerId()      { return _playerId; },
        get isHost()        { return _role === 'host'; },
        get isClient()      { return _role === 'client'; },
        get isMultiplayer() { return _role !== null; }
    });
})();
