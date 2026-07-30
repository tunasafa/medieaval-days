/**
 * Medieval Days — Lightweight WebSocket relay server for direct-IP multiplayer.
 *
 * Usage:
 *   npm install        (first time only)
 *   npm run server     (starts relay on port 9000)
 *
 * The first browser that connects is assigned the "host" role.
 * All subsequent connections are "client" role.
 * The server is a dumb relay — it does zero game logic.
 */

const { WebSocketServer } = require('ws');

const PORT = process.env.PORT || 9000;
const wss = new WebSocketServer({ port: PORT });

const clients = new Map(); // ws → { id, role }
let hostWs = null;
let nextPlayerId = 1;

console.log(`\n  ⚔️  Medieval Days Relay Server`);
console.log(`  Listening on port ${PORT}`);
console.log(`  Waiting for players to connect...\n`);

wss.on('connection', (ws, req) => {
    const playerId = nextPlayerId++;
    const role = hostWs ? 'client' : 'host';
    const ip = req.socket.remoteAddress;
    clients.set(ws, { id: playerId, role });

    if (role === 'host') {
        hostWs = ws;
        console.log(`  [+] Player ${playerId} connected as HOST (${ip})`);
        ws.send(JSON.stringify({ type: 'role-assigned', role: 'host', playerId }));
    } else {
        console.log(`  [+] Player ${playerId} connected as CLIENT (${ip})`);
        ws.send(JSON.stringify({ type: 'role-assigned', role: 'client', playerId }));

        // Notify host that a player joined
        if (hostWs && hostWs.readyState === 1) {
            hostWs.send(JSON.stringify({ type: 'player-joined', playerId }));
        }
    }

    ws.on('message', (raw) => {
        let msg;
        try {
            msg = JSON.parse(raw);
        } catch (e) {
            console.error('  [!] Bad JSON from player', clients.get(ws)?.id);
            return;
        }

        const sender = clients.get(ws);

        switch (msg.type) {
            case 'state-snapshot':
                // Host → broadcast to all clients
                for (const [client, info] of clients) {
                    if (info.role === 'client' && client.readyState === 1) {
                        client.send(raw); // Forward raw buffer for speed
                    }
                }
                break;

            case 'command':
                // Client → forward to host
                if (hostWs && hostWs.readyState === 1 && ws !== hostWs) {
                    msg.fromPlayer = sender.id;
                    hostWs.send(JSON.stringify(msg));
                }
                break;

            case 'game-start':
                // Host signals game start → broadcast to all clients
                console.log(`  [>] Host started the game! Broadcasting to ${clients.size - 1} client(s).`);
                for (const [client, info] of clients) {
                    if (info.role === 'client' && client.readyState === 1) {
                        client.send(raw);
                    }
                }
                break;

            case 'chat':
                // Broadcast chat to everyone except sender
                for (const [client] of clients) {
                    if (client !== ws && client.readyState === 1) {
                        client.send(JSON.stringify({
                            type: 'chat',
                            from: sender.id,
                            message: msg.message
                        }));
                    }
                }
                break;

            default:
                break;
        }
    });

    ws.on('close', () => {
        const info = clients.get(ws);
        console.log(`  [-] Player ${info?.id} (${info?.role}) disconnected`);
        clients.delete(ws);

        if (ws === hostWs) {
            hostWs = null;
            console.log('  [!] Host disconnected. Next connection will become new host.');
            // Notify remaining clients
            for (const [client] of clients) {
                if (client.readyState === 1) {
                    client.send(JSON.stringify({ type: 'host-disconnected' }));
                }
            }
        } else {
            // Notify host that a client left
            if (hostWs && hostWs.readyState === 1) {
                hostWs.send(JSON.stringify({ type: 'player-left', playerId: info?.id }));
            }
        }
    });

    ws.on('error', (err) => {
        console.error(`  [!] WebSocket error for player ${clients.get(ws)?.id}:`, err.message);
    });
});

wss.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
        console.error(`\n  [!] Port ${PORT} is already in use. Stop the other server or use PORT=XXXX npm run server\n`);
    } else {
        console.error('  [!] Server error:', err.message);
    }
});
