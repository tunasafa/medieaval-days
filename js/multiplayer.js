/**
 * Medieval Days client-side multiplayer networking.
 *
 * Architecture: WebRTC data channel with WebSocket signaling.
 * - The signaling server only introduces peers and relays SDP/ICE messages.
 * - The host runs the simulation and sends snapshots over WebRTC.
 * - The client renders host snapshots and sends player commands over WebRTC.
 */

const Multiplayer = (() => {
    let ws = null;
    let manualDisconnect = false;
    let _role = null;
    let _playerId = null;
    let _roomId = '';
    let _signalUrl = '';
    let _connected = false;
    let snapshotInterval = null;
    let connectResolve = null;
    let connectReject = null;
    let connectTimer = null;

    const peers = new Map();
    const dataChannels = new Map();
    const pendingCandidates = new Map();

    const TICK_RATE = 15;
    const TICK_MS = Math.round(1000 / TICK_RATE);
    const CONNECT_TIMEOUT_MS = 22000;
    const DATA_CHANNEL_LABEL = 'medieval-days-game';
    const MAX_SNAPSHOT_BUFFERED_BYTES = 900000;
    const ICE_SERVERS = [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' }
    ];

    function normalizeSignalUrl(value) {
        const fallback = 'ws://localhost:9000';
        const raw = String(value || fallback).trim();
        if (/^wss?:\/\//i.test(raw)) return raw;
        if (/^https?:\/\//i.test(raw)) return raw.replace(/^http/i, 'ws');
        return `ws://${raw}`;
    }

    function normalizeConnectOptions(optionsOrHost, roomOrPort, mode) {
        if (optionsOrHost && typeof optionsOrHost === 'object') {
            return {
                signalUrl: normalizeSignalUrl(optionsOrHost.signalUrl),
                roomId: String(optionsOrHost.roomId || '').trim().toUpperCase(),
                mode: optionsOrHost.mode || 'auto'
            };
        }

        if (typeof roomOrPort === 'number') {
            return {
                signalUrl: normalizeSignalUrl(`${optionsOrHost || 'localhost'}:${roomOrPort}`),
                roomId: 'DEFAULT',
                mode: mode || 'auto'
            };
        }

        return {
            signalUrl: normalizeSignalUrl(optionsOrHost),
            roomId: String(roomOrPort || 'DEFAULT').trim().toUpperCase(),
            mode: mode || 'auto'
        };
    }

    function emitStatus(message, tone = 'neutral') {
        if (typeof window === 'undefined' || typeof window.dispatchEvent !== 'function') return;
        window.dispatchEvent(new CustomEvent('multiplayer-status', { detail: { message, tone } }));
    }

    function showMultiplayerNotice(message) {
        if (typeof showNotification === 'function') showNotification(message);
    }

    function clearConnectTimer() {
        if (connectTimer) {
            clearTimeout(connectTimer);
            connectTimer = null;
        }
    }

    function resolveConnection(value) {
        clearConnectTimer();
        if (!connectResolve) return;
        connectResolve(value);
        connectResolve = null;
        connectReject = null;
    }

    function rejectConnection(error) {
        clearConnectTimer();
        if (!connectReject) return;
        connectReject(error);
        connectResolve = null;
        connectReject = null;
    }

    function sendSignalServerMessage(message) {
        if (!ws || ws.readyState !== WebSocket.OPEN) return false;
        ws.send(JSON.stringify(message));
        return true;
    }

    function sendPeerSignal(targetId, data) {
        return sendSignalServerMessage({
            type: 'signal',
            roomId: _roomId,
            targetId,
            data
        });
    }

    function updateConnectedFlag() {
        _connected = [...dataChannels.values()].some(channel => channel.readyState === 'open');
        if (!_connected) stopBroadcasting();
        return _connected;
    }

    function closePeer(remoteId) {
        const channel = dataChannels.get(remoteId);
        if (channel) {
            channel.onopen = null;
            channel.onmessage = null;
            channel.onclose = null;
            channel.onerror = null;
            if (channel.readyState === 'open' || channel.readyState === 'connecting') channel.close();
        }
        dataChannels.delete(remoteId);

        const peer = peers.get(remoteId);
        if (peer) {
            peer.onicecandidate = null;
            peer.onconnectionstatechange = null;
            peer.ondatachannel = null;
            peer.close();
        }
        peers.delete(remoteId);
        pendingCandidates.delete(remoteId);
        updateConnectedFlag();
    }

    function closeAllPeers() {
        for (const remoteId of [...peers.keys()]) closePeer(remoteId);
        for (const remoteId of [...dataChannels.keys()]) closePeer(remoteId);
        pendingCandidates.clear();
        _connected = false;
    }

    function connect(optionsOrHost, roomOrPort, mode) {
        if (typeof WebSocket === 'undefined') {
            return Promise.reject(new Error('This browser does not support WebSocket signaling.'));
        }
        if (typeof RTCPeerConnection === 'undefined') {
            return Promise.reject(new Error('This browser does not support WebRTC.'));
        }

        const options = normalizeConnectOptions(optionsOrHost, roomOrPort, mode);
        if (!options.roomId) return Promise.reject(new Error('Room code is required.'));

        disconnect({ quiet: true });
        manualDisconnect = false;
        _roomId = options.roomId;
        _signalUrl = options.signalUrl;

        return new Promise((resolve, reject) => {
            connectResolve = resolve;
            connectReject = reject;
            connectTimer = setTimeout(() => {
                rejectConnection(new Error('WebRTC negotiation timed out. Check the room code and signaling server.'));
            }, CONNECT_TIMEOUT_MS);

            let signalSocket;
            try {
                signalSocket = new WebSocket(_signalUrl);
            } catch (err) {
                rejectConnection(err);
                return;
            }

            ws = signalSocket;

            signalSocket.onopen = () => {
                sendSignalServerMessage({
                    type: 'join-room',
                    roomId: _roomId,
                    mode: options.mode
                });
            };

            signalSocket.onmessage = event => {
                if (ws !== signalSocket) return;
                let message;
                try {
                    message = JSON.parse(event.data);
                } catch (err) {
                    console.warn('[MP] Bad signaling message:', err);
                    return;
                }
                handleSignalServerMessage(message);
            };

            signalSocket.onerror = () => {
                if (ws !== signalSocket) return;
                rejectConnection(new Error('Could not reach the signaling server.'));
            };

            signalSocket.onclose = () => {
                if (ws !== signalSocket) return;
                const wasManual = manualDisconnect;
                ws = null;
                clearConnectTimer();
                closeAllPeers();
                _role = null;
                _playerId = null;
                _roomId = '';
                if (!wasManual) {
                    rejectConnection(new Error('Signaling server disconnected.'));
                    showMultiplayerNotice('Multiplayer signaling disconnected.');
                    emitStatus('Signaling server disconnected.', 'error');
                }
                manualDisconnect = false;
            };
        });
    }

    function disconnect(options = {}) {
        const quiet = !!options.quiet;
        manualDisconnect = true;
        stopBroadcasting();
        closeAllPeers();
        if (ws) {
            ws.onopen = null;
            ws.onmessage = null;
            ws.onerror = null;
            ws.onclose = null;
            if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) ws.close();
            ws = null;
        }
        clearConnectTimer();
        if (!quiet) emitStatus('Disconnected.', 'neutral');
        _role = null;
        _playerId = null;
        _roomId = '';
        _signalUrl = '';
        _connected = false;
        connectResolve = null;
        connectReject = null;
        manualDisconnect = false;
    }

    function handleSignalServerMessage(message) {
        switch (message.type) {
            case 'role-assigned':
                _role = message.role;
                _playerId = message.playerId;
                _roomId = message.roomId || _roomId;
                if (_role === 'host') {
                    resolveConnection({ role: _role, playerId: _playerId, roomId: _roomId });
                }
                console.log(`[MP] Joined room ${_roomId} as ${_role}`);
                break;

            case 'player-joined':
                if (_role === 'host') {
                    startOffer(message.playerId);
                    emitStatus('Peer found. Opening WebRTC channel...', 'neutral');
                    showMultiplayerNotice('Peer found. Opening WebRTC channel...');
                }
                break;

            case 'player-left':
                closePeer(message.playerId);
                emitStatus('Peer left the room.', 'neutral');
                showMultiplayerNotice('Peer left the multiplayer room.');
                break;

            case 'host-disconnected':
                closeAllPeers();
                emitStatus('Host disconnected.', 'error');
                showMultiplayerNotice('Host disconnected. Game cannot continue.');
                break;

            case 'signal':
                handlePeerSignal(message);
                break;

            case 'error':
                rejectConnection(new Error(message.message || 'Signaling server error.'));
                emitStatus(message.message || 'Signaling server error.', 'error');
                break;

            default:
                break;
        }
    }

    function createPeer(remoteId, isOfferer) {
        closePeer(remoteId);
        const peer = new RTCPeerConnection({ iceServers: ICE_SERVERS });
        peers.set(remoteId, peer);

        peer.onicecandidate = event => {
            if (event.candidate) sendPeerSignal(remoteId, { candidate: event.candidate });
        };

        peer.onconnectionstatechange = () => {
            if (peer.connectionState === 'failed') {
                emitStatus('WebRTC connection failed.', 'error');
                closePeer(remoteId);
            } else if (peer.connectionState === 'disconnected' || peer.connectionState === 'closed') {
                closePeer(remoteId);
            }
        };

        if (!isOfferer) {
            peer.ondatachannel = event => {
                registerDataChannel(remoteId, event.channel);
            };
        }

        return peer;
    }

    async function startOffer(remoteId) {
        try {
            const peer = createPeer(remoteId, true);
            const channel = peer.createDataChannel(DATA_CHANNEL_LABEL, { ordered: true });
            registerDataChannel(remoteId, channel);
            const offer = await peer.createOffer();
            await peer.setLocalDescription(offer);
            sendPeerSignal(remoteId, { description: peer.localDescription });
        } catch (err) {
            console.error('[MP] Failed to create WebRTC offer:', err);
            emitStatus('Could not start WebRTC negotiation.', 'error');
        }
    }

    async function handlePeerSignal(message) {
        const remoteId = message.fromId;
        if (!remoteId || !message.data) return;

        let peer = peers.get(remoteId);
        if (!peer) peer = createPeer(remoteId, false);

        try {
            if (message.data.description) {
                await peer.setRemoteDescription(message.data.description);
                await flushPendingCandidates(remoteId, peer);

                if (message.data.description.type === 'offer') {
                    const answer = await peer.createAnswer();
                    await peer.setLocalDescription(answer);
                    sendPeerSignal(remoteId, { description: peer.localDescription });
                }
            }

            if (message.data.candidate) {
                if (peer.remoteDescription && peer.remoteDescription.type) {
                    await peer.addIceCandidate(message.data.candidate);
                } else {
                    const queue = pendingCandidates.get(remoteId) || [];
                    queue.push(message.data.candidate);
                    pendingCandidates.set(remoteId, queue);
                }
            }
        } catch (err) {
            console.error('[MP] Failed to apply WebRTC signal:', err);
            emitStatus('WebRTC negotiation failed.', 'error');
            rejectConnection(err);
        }
    }

    async function flushPendingCandidates(remoteId, peer) {
        const queue = pendingCandidates.get(remoteId) || [];
        pendingCandidates.delete(remoteId);
        for (const candidate of queue) await peer.addIceCandidate(candidate);
    }

    function registerDataChannel(remoteId, channel) {
        dataChannels.set(remoteId, channel);
        channel.onopen = () => {
            updateConnectedFlag();
            if (_role === 'client') {
                resolveConnection({ role: _role, playerId: _playerId, roomId: _roomId });
            }
            emitStatus(
                _role === 'host'
                    ? 'WebRTC peer connected. Press Play when ready.'
                    : 'WebRTC connected. Waiting for host to press Play...',
                'success'
            );
            showMultiplayerNotice('WebRTC peer connection ready.');
        };

        channel.onmessage = event => {
            let message;
            try {
                message = JSON.parse(event.data);
            } catch (err) {
                console.warn('[MP] Bad WebRTC data message:', err);
                return;
            }
            handleDataMessage(message);
        };

        channel.onclose = () => {
            dataChannels.delete(remoteId);
            updateConnectedFlag();
            if (_role === 'host') emitStatus('Waiting for WebRTC peer...', 'neutral');
        };

        channel.onerror = () => {
            emitStatus('WebRTC data channel error.', 'error');
        };
    }

    function sendDataMessage(message) {
        const payload = JSON.stringify(message);
        let sent = false;
        for (const channel of dataChannels.values()) {
            if (channel.readyState !== 'open') continue;
            if (message.type === 'state-snapshot' && channel.bufferedAmount > MAX_SNAPSHOT_BUFFERED_BYTES) continue;
            channel.send(payload);
            sent = true;
        }
        return sent;
    }

    function handleDataMessage(message) {
        switch (message.type) {
            case 'game-start':
                if (_role === 'client') {
                    console.log('[MP] Received game-start from host. Initializing...');
                    applyGameStart(message);
                }
                break;

            case 'state-snapshot':
                if (_role === 'client') deserializeState(message.state);
                break;

            case 'command':
                if (_role === 'host') executeRemoteCommand(message);
                break;

            case 'chat':
                showMultiplayerNotice(`Player ${message.from}: ${message.message}`);
                break;

            default:
                break;
        }
    }

    async function applyGameStart(message) {
        deserializeState(message.state);

        if (message.worldObjects) gameState.worldObjects = message.worldObjects;

        document.body.classList.remove('menu-open');
        const mainMenu = document.getElementById('main-menu');
        if (mainMenu) {
            mainMenu.classList.remove('open');
            mainMenu.setAttribute('aria-hidden', 'true');
        }
        gameState.ui.modalOpen = null;
        gameState.ui.hasStarted = true;

        const mpModal = document.getElementById('mp-modal');
        if (mpModal) {
            mpModal.classList.remove('open');
            mpModal.setAttribute('aria-hidden', 'true');
        }

        if (typeof resizeCanvas === 'function') resizeCanvas();
        if (typeof initTilemap === 'function') await initTilemap();
        if (tilemap && gameState.worldObjects) tilemap.markWaterAreas(gameState.worldObjects);
        if (typeof initializePathfinding === 'function') initializePathfinding();
        if (typeof FogOfWar !== 'undefined') FogOfWar.init(GAME_CONFIG.world.width, GAME_CONFIG.world.height);
        if (typeof setupEventListeners === 'function') setupEventListeners();
        if (typeof drawUIIcons === 'function') await drawUIIcons();

        const p2TC = gameState.buildings.find(b => b.type === 'town-center' && b.player === 'player2');
        if (p2TC) {
            const zoom = gameState.zoomLevel || 1;
            gameState.camera.x = p2TC.x + p2TC.width / 2 - (GAME_CONFIG.canvas.width / zoom) / 2;
            gameState.camera.y = p2TC.y + p2TC.height / 2 - (GAME_CONFIG.canvas.height / zoom) / 2;
            if (typeof clampCameraToBounds === 'function') clampCameraToBounds();
        }

        gameState.lastUpdate = Date.now();
        gameLoop();
        showMultiplayerNotice('Connected to host. You are Player 2.');
    }

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
            p2Resources: gameState.p2Resources || null,
            p2Population: gameState.p2Population || null
        };
    }

    function serializeUnit(unit) {
        return {
            id: unit.id,
            type: unit.type,
            player: unit.player,
            faction: unit.faction,
            x: Math.round(unit.x * 10) / 10,
            y: Math.round(unit.y * 10) / 10,
            health: Math.round(unit.health),
            maxHealth: unit.maxHealth || GAME_CONFIG.units[unit.type]?.maxHealth,
            state: unit.state,
            gatherType: unit.gatherType || null,
            isSelected: false,
            anim: unit.anim ? {
                action: unit.anim.action,
                direction: unit.anim.direction,
                frame: unit.anim.frame
            } : null
        };
    }

    function serializeBuilding(building) {
        return {
            id: building.id,
            type: building.type,
            player: building.player,
            faction: building.faction,
            factionName: building.factionName,
            factionColor: building.factionColor,
            x: building.x,
            y: building.y,
            width: building.width,
            height: building.height,
            health: Math.round(building.health),
            maxHealth: building.maxHealth,
            underConstruction: building.underConstruction || false,
            rallyPoint: building.rallyPoint || null,
            construction: building.underConstruction ? {
                totalTime: building.construction?.totalTime,
                timeRemaining: building.construction?.timeRemaining
            } : undefined
        };
    }

    function deserializeState(state) {
        if (!state) return;

        gameState.resources = state.resources;
        gameState.resourceRates = state.resourceRates;
        gameState.population = state.population;
        gameState.gameTime = state.gameTime;
        gameState.currentAge = state.currentAge;
        gameState.gameOver = state.gameOver;

        if (state.p2Resources) gameState.p2Resources = state.p2Resources;
        if (state.p2Population) gameState.p2Population = state.p2Population;

        mergeEntityArray(gameState.units, state.units);
        mergeEntityArray(gameState.buildings, state.buildings);
        mergeEntityArray(gameState.enemyUnits, state.enemyUnits);
        mergeEntityArray(gameState.enemyBuildings, state.enemyBuildings);
    }

    function mergeEntityArray(localArr, remoteArr) {
        if (!remoteArr) return;

        const remoteMap = new Map();
        for (const entity of remoteArr) remoteMap.set(entity.id, entity);

        for (let i = localArr.length - 1; i >= 0; i--) {
            const local = localArr[i];
            const remote = remoteMap.get(local.id);
            if (remote) {
                Object.assign(local, remote);
                remoteMap.delete(local.id);
            } else {
                localArr.splice(i, 1);
            }
        }

        for (const entity of remoteMap.values()) localArr.push(entity);
    }

    function sendCommand(command) {
        if (_role !== 'client' || !_connected) return;
        sendDataMessage({ type: 'command', ...command });
    }

    function executeRemoteCommand(command) {
        console.log(`[MP] Executing remote command: ${command.action}`, command);

        switch (command.action) {
            case 'MOVE': {
                const units = (command.unitIds || [])
                    .map(id => gameState.units.find(unit => unit.id === id))
                    .filter(Boolean);
                if (units.length > 0 && typeof moveUnitsTo === 'function') {
                    moveUnitsTo(units, command.targetX, command.targetY);
                }
                break;
            }

            case 'ATTACK': {
                const attackers = (command.unitIds || [])
                    .map(id => gameState.units.find(unit => unit.id === id))
                    .filter(Boolean);
                const target = [
                    ...gameState.units,
                    ...gameState.enemyUnits,
                    ...gameState.buildings,
                    ...gameState.enemyBuildings
                ].find(entity => entity.id === command.targetId);
                if (attackers.length && target && typeof assignAttackTarget === 'function') {
                    attackers.forEach(unit => assignAttackTarget(unit, target));
                }
                break;
            }

            case 'BUILD':
                if (
                    typeof canPlaceBuilding === 'function' &&
                    typeof placeBuilding === 'function' &&
                    canPlaceBuilding(command.buildingType, command.x, command.y)
                ) {
                    placeBuilding(command.buildingType, command.x, command.y);
                }
                break;

            case 'TRAIN': {
                const building = gameState.buildings.find(item => item.id === command.buildingId);
                if (building && typeof trainUnit === 'function') trainUnit(building, command.unitType);
                break;
            }

            case 'RESEARCH':
                if (typeof startResearch === 'function') startResearch(command.upgradeId, command.buildingId);
                break;

            case 'GATHER': {
                const gatherers = (command.unitIds || [])
                    .map(id => gameState.units.find(unit => unit.id === id))
                    .filter(Boolean);
                const resource = gameState.worldObjects.find(item => item.id === command.resourceId);
                if (gatherers.length && resource) {
                    gatherers.forEach(unit => {
                        unit.state = 'moving';
                        unit.target = resource;
                        unit.gatherType = resource.resourceType;
                    });
                }
                break;
            }

            default:
                console.warn('[MP] Unknown command action:', command.action);
        }
    }

    function startBroadcasting() {
        if (snapshotInterval) return;
        snapshotInterval = setInterval(() => {
            if (_role !== 'host' || !_connected) return;
            try {
                sendDataMessage({
                    type: 'state-snapshot',
                    state: serializeState()
                });
            } catch (err) {
                console.error('[MP] Failed to send snapshot:', err);
            }
        }, TICK_MS);
    }

    function stopBroadcasting() {
        if (snapshotInterval) {
            clearInterval(snapshotInterval);
            snapshotInterval = null;
        }
    }

    function broadcastGameStart() {
        if (_role !== 'host' || !_connected) return;
        console.log('[MP] Sending game-start over WebRTC...');
        sendDataMessage({
            type: 'game-start',
            state: serializeState(),
            worldObjects: gameState.worldObjects
        });
        startBroadcasting();
    }

    return Object.freeze({
        connect,
        disconnect,
        sendCommand,
        broadcastGameStart,
        startBroadcasting,
        stopBroadcasting,

        get role() { return _role; },
        get connected() { return _connected; },
        get playerId() { return _playerId; },
        get roomId() { return _roomId; },
        get signalUrl() { return _signalUrl; },
        get isHost() { return _role === 'host'; },
        get isClient() { return _role === 'client'; },
        get isMultiplayer() { return _role !== null; }
    });
})();
