// ============================================================
// Projectile System
// ============================================================

const ProjectileSystem = (function () {
    const projectiles = [];
    const PROJECTILE_TYPES = {
        arrow: { speed: 600, size: 8, width: 1.5, color: '#8B5A2B', tipColor: '#CFD8DC', trailLength: 3, arc: false, impactFn: 'emitArrowImpact' },
        bolt: { speed: 550, size: 10, width: 2, color: '#5D4037', tipColor: '#B0BEC5', trailLength: 4, arc: false, impactFn: 'emitArrowImpact' },
        catapult_stone: { speed: 300, size: 6, width: 6, color: '#8C8C84', tipColor: '#A0A0A0', trailLength: 5, arc: true, arcHeight: 200, impactFn: 'emitSiegeImpact' },
        ballista_bolt: { speed: 500, size: 14, width: 2.5, color: '#6D4C41', tipColor: '#CFD8DC', trailLength: 5, arc: false, impactFn: 'emitSiegeImpact' }
    };

    function getProjectileType(unitType) {
        switch (unitType) {
            case 'archer': return 'arrow'; case 'crossbowman': return 'bolt';
            case 'catapult': return 'catapult_stone'; case 'ballista': return 'ballista_bolt';
            case 'warship': return 'bolt'; default: return null;
        }
    }

    function spawn(fromUnit, target, targetPoint) {
        const projType = getProjectileType(fromUnit.type);
        if (!projType) return null;
        const config = PROJECTILE_TYPES[projType];

        let tx, ty;
        if (target && target.width) { tx = target.x + target.width/2; ty = target.y + target.height/2; }
        else if (targetPoint) { tx = targetPoint.x; ty = targetPoint.y; }
        else if (target) { tx = target.x; ty = target.y; }
        else return null;

        const dx = tx - fromUnit.x, dy = ty - fromUnit.y;
        const dist = Math.hypot(dx, dy);
        if (dist < 1) return null;

        const damage = typeof getUnitAttack === 'function'
            ? getUnitAttack(fromUnit)
            : GAME_CONFIG.units[fromUnit.type]?.attack || 0;
        const proj = { x: fromUnit.x, y: fromUnit.y, startX: fromUnit.x, startY: fromUnit.y, targetX: tx, targetY: ty, totalDist: dist, traveled: 0, vx: (dx/dist)*config.speed, vy: (dy/dist)*config.speed, type: projType, config, target, damage, fromPlayer: fromUnit.player, angle: Math.atan2(dy, dx), trail: [], alive: true };
        projectiles.push(proj);
        return proj;
    }

    function update(dt) {
        const dtSec = dt / 1000;
        for (let i = projectiles.length - 1; i >= 0; i--) {
            const p = projectiles[i];
            if (!p.alive) { projectiles.splice(i, 1); continue; }

            p.trail.push({ x: p.x, y: p.y });
            if (p.trail.length > p.config.trailLength) p.trail.shift();

            const moveX = p.vx * dtSec, moveY = p.vy * dtSec;
            p.x += moveX; p.y += moveY; p.traveled += Math.hypot(moveX, moveY);

            if (p.config.arc) {
                const t = Math.min(1, p.traveled / p.totalDist);
                p.x = p.startX + (p.targetX - p.startX) * t;
                p.y = p.startY + (p.targetY - p.startY) * t - (-4 * p.config.arcHeight * t * (t - 1));
            }

            if (p.traveled >= p.totalDist - 5 || Math.hypot(p.targetX - p.x, p.targetY - p.y) < 12) {
                p.alive = false;
                if (p.target && p.target.health > 0) {
                    p.target.health -= p.damage;
                    if (p.target.health <= 0) {
                        if (p.target.width) handleBuildingDestruction(p.target);
                        else handleUnitDeath(p.target);
                        [...gameState.units, ...gameState.enemyUnits].forEach(u => { if (u.target === p.target) { u.state = 'idle'; u.target = null; u.targetPoint = undefined; }});
                    }
                }
                if (typeof ParticleSystem !== 'undefined' && p.config.impactFn) ParticleSystem[p.config.impactFn](p.x, p.y);
                if (typeof SFX !== 'undefined') p.type === 'arrow' || p.type === 'bolt' ? SFX.arrowHit() : SFX.siegeImpact();
                projectiles.splice(i, 1);
            } else if (p.traveled > p.totalDist * 2) {
                projectiles.splice(i, 1);
            }
        }
    }

    function draw(ctx, camera) {
        if (!projectiles.length) return;
        ctx.save();
        for (const p of projectiles) {
            const sx = p.x - camera.x, sy = p.y - camera.y;
            if (sx < -30 || sx > GAME_CONFIG.canvas.width + 30 || sy < -30 || sy > GAME_CONFIG.canvas.height + 30) continue;

            const cfg = p.config;
            if (p.trail.length > 1) {
                ctx.save(); ctx.globalAlpha = 0.3; ctx.strokeStyle = cfg.color; ctx.lineWidth = cfg.width * 0.6;
                ctx.beginPath(); ctx.moveTo(p.trail[0].x - camera.x, p.trail[0].y - camera.y);
                for (let j = 1; j < p.trail.length; j++) ctx.lineTo(p.trail[j].x - camera.x, p.trail[j].y - camera.y);
                ctx.lineTo(sx, sy); ctx.stroke(); ctx.restore();
            }

            ctx.save(); ctx.translate(sx, sy);
            if (p.type === 'catapult_stone') {
                ctx.fillStyle = cfg.color; ctx.beginPath(); ctx.arc(0, 0, cfg.width/2, 0, Math.PI*2); ctx.fill();
            } else {
                ctx.rotate(p.angle);
                ctx.strokeStyle = cfg.color; ctx.lineWidth = cfg.width;
                ctx.beginPath(); ctx.moveTo(-cfg.size, 0); ctx.lineTo(0, 0); ctx.stroke();
                ctx.fillStyle = cfg.tipColor; ctx.beginPath(); ctx.moveTo(2, 0); ctx.lineTo(-2, -2); ctx.lineTo(-2, 2); ctx.fill();
            }
            ctx.restore();
        }
        ctx.restore();
    }

    return { spawn, update, draw, getProjectileType, getCount: () => projectiles.length };
})();
