const { spawn } = require('child_process');
const WebSocket = require('ws');

const URL = process.env.PERF_URL || 'http://127.0.0.1:8000/';
const CHROME = process.env.CHROME_BIN || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const DEBUG_PORT = Number(process.env.CDP_PORT || 9223);

function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function fetchJson(url, tries = 80) {
    let lastError = null;
    for (let i = 0; i < tries; i++) {
        try {
            const res = await fetch(url);
            if (res.ok) return await res.json();
        } catch (err) {
            lastError = err;
        }
        await delay(125);
    }
    throw lastError || new Error(`Could not fetch ${url}`);
}

function connect(wsUrl) {
    const ws = new WebSocket(wsUrl);
    let nextId = 1;
    const pending = new Map();
    const events = new Map();

    ws.on('message', raw => {
        const message = JSON.parse(raw.toString());
        if (message.id && pending.has(message.id)) {
            const { resolve, reject } = pending.get(message.id);
            pending.delete(message.id);
            if (message.error) reject(new Error(message.error.message));
            else resolve(message.result);
            return;
        }
        const handlers = events.get(message.method) || [];
        handlers.forEach(handler => handler(message.params || {}));
    });

    return new Promise((resolve, reject) => {
        ws.once('open', () => {
            resolve({
                send(method, params = {}) {
                    const id = nextId++;
                    ws.send(JSON.stringify({ id, method, params }));
                    return new Promise((res, rej) => pending.set(id, { resolve: res, reject: rej }));
                },
                on(method, handler) {
                    const handlers = events.get(method) || [];
                    handlers.push(handler);
                    events.set(method, handlers);
                },
                close() {
                    ws.close();
                }
            });
        });
        ws.once('error', reject);
    });
}

async function evaluate(client, expression) {
    const result = await client.send('Runtime.evaluate', {
        expression,
        awaitPromise: true,
        returnByValue: true,
        timeout: 120000
    });
    if (result.exceptionDetails) {
        throw new Error(result.exceptionDetails.text || 'Runtime evaluation failed');
    }
    return result.result.value;
}

(async () => {
    const chrome = spawn(CHROME, [
        '--headless=new',
        `--remote-debugging-port=${DEBUG_PORT}`,
        '--disable-background-timer-throttling',
        '--disable-renderer-backgrounding',
        '--no-first-run',
        '--no-default-browser-check',
        `--user-data-dir=/tmp/medieval-days-perf-${Date.now()}`,
        'about:blank'
    ], { stdio: 'ignore' });

    let client = null;
    try {
        await fetchJson(`http://127.0.0.1:${DEBUG_PORT}/json/version`);
        const tabs = await fetchJson(`http://127.0.0.1:${DEBUG_PORT}/json/list`);
        const page = tabs.find(tab => tab.type === 'page') || tabs[0];
        client = await connect(page.webSocketDebuggerUrl);
        const errors = [];
        client.on('Runtime.exceptionThrown', event => {
            errors.push(event.exceptionDetails?.text || 'exception');
        });
        await client.send('Page.enable');
        await client.send('Runtime.enable');
        const loaded = new Promise(resolve => client.on('Page.loadEventFired', resolve));
        await client.send('Page.navigate', { url: URL });
        await loaded;

        await evaluate(client, `new Promise(resolve => {
            const wait = () => {
                if (typeof beginGameFromMenu === 'function' && typeof gameState !== 'undefined') resolve(true);
                else setTimeout(wait, 50);
            };
            wait();
        })`);
        await evaluate(client, `(async () => { await beginGameFromMenu(); return true; })()`);
        await evaluate(client, `new Promise(resolve => {
            const wait = () => {
                if (gameState?.ui?.hasStarted && typeof tilemap !== 'undefined' && tilemap && typeof pathfindingGrid !== 'undefined' && pathfindingGrid) resolve(true);
                else setTimeout(wait, 100);
            };
            wait();
        })`);

        const setup = await evaluate(client, `(() => {
            const allBuildings = typeof getAllBuildings === 'function' ? getAllBuildings() : [...gameState.buildings, ...gameState.enemyBuildings];
            const playerTC = allBuildings.find(b => b.player === 'player' && b.type === 'town-center');
            const enemyTC = allBuildings.find(b => b.player !== 'player' && b.type === 'town-center') || playerTC;
            const makeUnit = (type, player, x, y) => {
                const cfg = GAME_CONFIG.units[type] || GAME_CONFIG.units.villager;
                return {
                    id: generateId(),
                    type,
                    player,
                    faction: player,
                    factionName: typeof getFactionName === 'function' ? getFactionName(player) : player,
                    factionColor: typeof getFactionColor === 'function' ? getFactionColor(player) : '#fff',
                    x,
                    y,
                    health: cfg.maxHealth,
                    state: 'idle',
                    target: null,
                    anim: { action: 'idle', direction: 'south', frame: 0, elapsed: 0 },
                    _faceDir: 'south',
                    _lastFaceNatural: 'south',
                    prevX: x,
                    prevY: y
                };
            };
            const addAround = (container, type, player, origin, count, radius) => {
                for (let i = 0; i < count; i++) {
                    const a = (i / Math.max(1, count)) * Math.PI * 2;
                    const r = radius + (i % 5) * 11;
                    container.push(makeUnit(type, player, origin.x + Math.cos(a) * r, origin.y + Math.sin(a) * r));
                }
            };
            const pc = { x: playerTC.x + playerTC.width / 2, y: playerTC.y + playerTC.height / 2 };
            const ec = { x: enemyTC.x + enemyTC.width / 2, y: enemyTC.y + enemyTC.height / 2 };
            addAround(gameState.units, 'villager', 'player', pc, 18, 130);
            addAround(gameState.units, 'archer', 'player', pc, 12, 210);
            addAround(gameState.enemyUnits, 'militia', enemyTC.player || 'enemy-1', ec, 80, 180);
            addAround(gameState.enemyUnits, 'archer', enemyTC.player || 'enemy-1', ec, 80, 280);
            if (typeof FogOfWar !== 'undefined') FogOfWar.update();
            return {
                playerUnits: gameState.units.length,
                enemyUnits: gameState.enemyUnits.length,
                buildings: allBuildings.length
            };
        })()`);

        const result = await evaluate(client, `new Promise(resolve => {
            const frames = [];
            let last = performance.now();
            let n = 0;
            function sample(now) {
                frames.push(now - last);
                last = now;
                n++;
                if (n >= 260) {
                    const usable = frames.slice(20);
                    const sorted = usable.slice().sort((a, b) => a - b);
                    const avg = usable.reduce((sum, value) => sum + value, 0) / usable.length;
                    const p95 = sorted[Math.floor(sorted.length * 0.95)] || 0;
                    const max = Math.max(...usable);
                    resolve({
                        avg: Math.round(avg * 10) / 10,
                        p95: Math.round(p95 * 10) / 10,
                        max: Math.round(max * 10) / 10,
                        fps: Math.round((1000 / avg) * 10) / 10
                    });
                    return;
                }
                requestAnimationFrame(sample);
            }
            requestAnimationFrame(sample);
        })`);

        if (errors.length) {
            console.error(JSON.stringify({ setup, result, errors }, null, 2));
            process.exitCode = 1;
        } else {
            console.log(JSON.stringify({ setup, result }, null, 2));
        }
    } finally {
        if (client) client.close();
        chrome.kill('SIGTERM');
    }
})();
