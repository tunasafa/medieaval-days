/**
 * Medieval Days WebRTC signaling server.
 *
 * Usage:
 *   npm install
 *   npm run server
 *
 * The server does not run game logic and does not relay gameplay traffic.
 * It only places players in rooms and forwards WebRTC offer/answer/ICE messages.
 */

const { WebSocketServer, WebSocket } = require('ws');

const PORT = process.env.PORT || 9000;
const wss = new WebSocketServer({ port: PORT });

const clients = new Map(); // ws -> { id, roomId, role }
const rooms = new Map();   // roomId -> { host, clients: Map<number, WebSocket> }
let nextPlayerId = 1;

function sanitizeRoomId(value) {
    return String(value || 'DEFAULT').trim().toUpperCase().replace(/[^A-Z0-9-]/g, '').slice(0, 24) || 'DEFAULT';
}

function send(ws, message) {
    if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(message));
}

function getRoom(roomId) {
    if (!rooms.has(roomId)) rooms.set(roomId, { host: null, clients: new Map() });
    return rooms.get(roomId);
}

function getPeerById(room, id) {
    if (room.host && clients.get(room.host)?.id === id) return room.host;
    return room.clients.get(id) || null;
}

function removeEmptyRoom(roomId) {
    const room = rooms.get(roomId);
    if (!room) return;
    if (!room.host && room.clients.size === 0) rooms.delete(roomId);
}

function leaveCurrentRoom(ws) {
    const info = clients.get(ws);
    if (!info || !info.roomId) return;

    const room = rooms.get(info.roomId);
    if (!room) {
        info.roomId = null;
        info.role = null;
        return;
    }

    if (room.host === ws) {
        room.host = null;
        for (const client of room.clients.values()) {
            send(client, { type: 'host-disconnected', roomId: info.roomId });
        }
        room.clients.clear();
    } else {
        room.clients.delete(info.id);
        if (room.host) send(room.host, { type: 'player-left', playerId: info.id, roomId: info.roomId });
    }

    removeEmptyRoom(info.roomId);
    info.roomId = null;
    info.role = null;
}

function joinRoom(ws, message) {
    const info = clients.get(ws);
    const roomId = sanitizeRoomId(message.roomId);
    const requestedMode = message.mode || 'auto';

    leaveCurrentRoom(ws);
    const room = getRoom(roomId);

    if (requestedMode === 'host' || (requestedMode === 'auto' && !room.host)) {
        if (room.host && room.host.readyState === WebSocket.OPEN) {
            send(ws, { type: 'error', message: `Room ${roomId} already has a host.` });
            return;
        }
        room.host = ws;
        info.roomId = roomId;
        info.role = 'host';
        send(ws, { type: 'role-assigned', role: 'host', playerId: info.id, roomId });
        console.log(`[room ${roomId}] Player ${info.id} joined as host`);
        return;
    }

    if (!room.host || room.host.readyState !== WebSocket.OPEN) {
        send(ws, { type: 'error', message: `Room ${roomId} has no host yet.` });
        removeEmptyRoom(roomId);
        return;
    }

    room.clients.set(info.id, ws);
    info.roomId = roomId;
    info.role = 'client';
    send(ws, {
        type: 'role-assigned',
        role: 'client',
        playerId: info.id,
        roomId,
        hostId: clients.get(room.host)?.id
    });
    send(room.host, { type: 'player-joined', playerId: info.id, roomId });
    console.log(`[room ${roomId}] Player ${info.id} joined as client`);
}

function relaySignal(ws, message) {
    const info = clients.get(ws);
    if (!info || !info.roomId) return;
    const room = rooms.get(info.roomId);
    if (!room) return;

    const target = getPeerById(room, message.targetId);
    if (!target) {
        send(ws, { type: 'error', message: 'WebRTC peer is no longer available.' });
        return;
    }

    send(target, {
        type: 'signal',
        roomId: info.roomId,
        fromId: info.id,
        data: message.data
    });
}

console.log('');
console.log('Medieval Days WebRTC signaling server');
console.log(`Listening on port ${PORT}`);
console.log('Waiting for rooms...');
console.log('');

wss.on('connection', ws => {
    const playerId = nextPlayerId++;
    clients.set(ws, { id: playerId, roomId: null, role: null });
    send(ws, { type: 'connected', playerId });

    ws.on('message', raw => {
        let message;
        try {
            message = JSON.parse(raw);
        } catch (err) {
            send(ws, { type: 'error', message: 'Bad JSON message.' });
            return;
        }

        switch (message.type) {
            case 'join-room':
                joinRoom(ws, message);
                break;

            case 'signal':
                relaySignal(ws, message);
                break;

            default:
                break;
        }
    });

    ws.on('close', () => {
        const info = clients.get(ws);
        if (info) console.log(`[room ${info.roomId || '-'}] Player ${info.id} disconnected`);
        leaveCurrentRoom(ws);
        clients.delete(ws);
    });

    ws.on('error', err => {
        const info = clients.get(ws);
        console.error(`WebSocket error for player ${info?.id || '?'}:`, err.message);
    });
});

wss.on('error', err => {
    if (err.code === 'EADDRINUSE') {
        console.error(`Port ${PORT} is already in use. Stop the other server or run with PORT=XXXX npm run server`);
    } else {
        console.error('Signaling server error:', err.message);
    }
});
