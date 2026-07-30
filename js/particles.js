// ============================================================
// Particle Effects System — Object-pooled particle engine
// ============================================================

const ParticleSystem = (function () {
    const MAX_PARTICLES = 600;
    const pool = [];
    const active = [];

    for (let i = 0; i < MAX_PARTICLES; i++) {
        pool.push({
            x: 0, y: 0, vx: 0, vy: 0, life: 0, maxLife: 0,
            size: 1, startSize: 1, endSize: 0,
            r: 255, g: 255, b: 255, alpha: 1,
            gravity: 0, friction: 1, type: 'default',
            rotation: 0, rotationSpeed: 0, active: false
        });
    }

    function spawn(opts) {
        let p = pool.pop();
        if (!p) { p = active.shift(); if (!p) return null; }
        p.x = opts.x || 0; p.y = opts.y || 0;
        p.vx = opts.vx || 0; p.vy = opts.vy || 0;
        p.life = opts.life || 500; p.maxLife = p.life;
        p.size = opts.size || 3; p.startSize = p.size; p.endSize = opts.endSize !== undefined ? opts.endSize : 0;
        p.r = opts.r !== undefined ? opts.r : 255;
        p.g = opts.g !== undefined ? opts.g : 255;
        p.b = opts.b !== undefined ? opts.b : 255;
        p.alpha = opts.alpha !== undefined ? opts.alpha : 1;
        p.gravity = opts.gravity || 0; p.friction = opts.friction !== undefined ? opts.friction : 0.98;
        p.type = opts.type || 'default'; p.rotation = opts.rotation || 0; p.rotationSpeed = opts.rotationSpeed || 0;
        p.active = true; active.push(p);
        return p;
    }

    function update(dt) {
        const dtSec = dt / 1000;
        for (let i = active.length - 1; i >= 0; i--) {
            const p = active[i];
            p.life -= dt;
            if (p.life <= 0) { p.active = false; active.splice(i, 1); pool.push(p); continue; }
            p.vy += p.gravity * dtSec; p.vx *= p.friction; p.vy *= p.friction;
            p.x += p.vx * dtSec; p.y += p.vy * dtSec; p.rotation += p.rotationSpeed * dtSec;
            const t = 1 - (p.life / p.maxLife);
            p.size = p.startSize + (p.endSize - p.startSize) * t;
            p.alpha = Math.max(0, 1 - t * t);
        }
    }

    function draw(ctx, camera) {
        if (active.length === 0) return;
        ctx.save();
        for (const p of active) {
            const sx = p.x - camera.x; const sy = p.y - camera.y;
            if (sx < -20 || sx > GAME_CONFIG.canvas.width + 20 || sy < -20 || sy > GAME_CONFIG.canvas.height + 20) continue;
            ctx.globalAlpha = p.alpha; const s = Math.max(0.5, p.size);
            switch (p.type) {
                case 'spark': ctx.fillStyle = `rgb(${p.r},${p.g},${p.b})`; ctx.fillRect(sx - s/2, sy - s/2, s, s); break;
                case 'blood': ctx.fillStyle = `rgb(${p.r},${p.g},${p.b})`; ctx.beginPath(); ctx.arc(sx, sy, s, 0, Math.PI * 2); ctx.fill(); break;
                case 'rubble': ctx.save(); ctx.translate(sx, sy); ctx.rotate(p.rotation); ctx.fillStyle = `rgb(${p.r},${p.g},${p.b})`; ctx.fillRect(-s/2, -s/2, s, s * 0.7); ctx.restore(); break;
                case 'smoke': case 'dust': ctx.fillStyle = `rgba(${p.r},${p.g},${p.b},${p.alpha * 0.6})`; ctx.beginPath(); ctx.arc(sx, sy, s, 0, Math.PI * 2); ctx.fill(); break;
                case 'gather': ctx.fillStyle = `rgb(${p.r},${p.g},${p.b})`; ctx.fillRect(sx - s/2, sy - s/2, s, s); break;
                default: ctx.fillStyle = `rgb(${p.r},${p.g},${p.b})`; ctx.beginPath(); ctx.arc(sx, sy, s, 0, Math.PI * 2); ctx.fill();
            }
        }
        ctx.globalAlpha = 1; ctx.restore();
    }

    return {
        update, draw, spawn,
        emitHitSpark: (x, y) => { for(let i=0;i<6;i++) spawn({x, y, vx:(Math.random()-0.5)*200, vy:(Math.random()-0.5)*200, life:300, size:2, r:255, g:220, b:50, type:'spark'}) },
        emitBlood: (x, y) => { for(let i=0;i<8;i++) spawn({x, y, vx:(Math.random()-0.5)*150, vy:Math.random()*150-100, life:600, size:3, endSize:1, r:200, g:20, b:20, gravity:300, type:'blood'}) },
        emitDust: (x, y) => { for(let i=0;i<4;i++) spawn({x, y, vx:(Math.random()-0.5)*50, vy:(Math.random()-0.5)*50, life:600, size:4, endSize:8, r:160, g:140, b:110, gravity:-10, type:'dust'}) },
        emitBuildingRubble: (x, y, w, h) => { for(let i=0;i<20;i++) spawn({x:x+Math.random()*w, y:y+Math.random()*h, vx:(Math.random()-0.5)*250, vy:Math.random()*200-250, life:1000, size:5, endSize:2, r:120, g:100, b:90, gravity:500, type:'rubble', rotation:Math.random()*6, rotationSpeed:(Math.random()-0.5)*15}); },
        emitGatherSparkle: (x, y, type) => { spawn({x, y, vx:(Math.random()-0.5)*30, vy:-30-Math.random()*30, life:400, size:2, r:(type==='gold'?255:type==='wood'?140:100), g:(type==='food'?160:type==='gold'?215:100), b:(type==='stone'?170:50), type:'gather'}); },
        emitArrowImpact: (x, y) => { for(let i=0;i<3;i++) spawn({x, y, vx:(Math.random()-0.5)*100, vy:(Math.random()-0.5)*100, life:200, size:2, r:200, g:180, b:100, type:'spark'}) },
        emitSiegeImpact: (x, y) => { for(let i=0;i<12;i++) spawn({x, y, vx:(Math.random()-0.5)*200, vy:Math.random()*150-200, life:600, size:4, r:140, g:120, b:80, gravity:300, type:'rubble'}); },
        emitUnitTrainEffect: (x, y) => { for(let i=0;i<8;i++) spawn({x, y, vx:(Math.random()-0.5)*80, vy:-40-Math.random()*40, life:500, size:2, r:100, g:200, b:255, type:'spark'}) },
        getActiveCount: () => active.length
    };
})();
