// ============================================================
// Sound Effects System
// ============================================================

const SFX = (function () {
    let ctx = null, masterGain = null, enabled = true, lastPlayed = {};

    function ensureContext() {
        if (ctx) return true;
        try {
            const AC = window.AudioContext || window.webkitAudioContext;
            ctx = new AC();
            masterGain = ctx.createGain();
            masterGain.gain.value = 0.25;
            masterGain.connect(ctx.destination);
            return true;
        } catch (e) { return false; }
    }

    function canPlay(name) {
        if (!enabled || !ensureContext()) return false;
        const now = performance.now();
        if (lastPlayed[name] && now - lastPlayed[name] < 80) return false;
        lastPlayed[name] = now; return true;
    }

    function playTone(freq, duration, type, volume) {
        if (!ctx) return;
        const osc = ctx.createOscillator(), gain = ctx.createGain();
        osc.type = type || 'square'; osc.frequency.value = freq;
        gain.gain.value = (volume || 0.15) * masterGain.gain.value;
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
        osc.connect(gain); gain.connect(ctx.destination);
        osc.start(ctx.currentTime); osc.stop(ctx.currentTime + duration);
    }

    function playNoise(duration, volume, filterFreq) {
        if (!ctx) return;
        const bs = ctx.sampleRate * duration, buf = ctx.createBuffer(1, bs, ctx.sampleRate), data = buf.getChannelData(0);
        for (let i = 0; i < bs; i++) data[i] = Math.random() * 2 - 1;
        const src = ctx.createBufferSource(); src.buffer = buf;
        const filter = ctx.createBiquadFilter(); filter.type = 'highpass'; filter.frequency.value = filterFreq || 2000;
        const gain = ctx.createGain(); gain.gain.value = (volume || 0.1) * masterGain.gain.value;
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
        src.connect(filter); filter.connect(gain); gain.connect(ctx.destination);
        src.start(ctx.currentTime); src.stop(ctx.currentTime + duration);
    }

    return {
        swordHit: () => { if (canPlay('sword')) { playNoise(0.08, 0.12, 3000); playTone(800, 0.06, 'square', 0.08); } },
        arrowFire: () => { if (canPlay('arrowFire')) { playTone(800, 0.08, 'triangle', 0.08); } },
        arrowHit: () => { if (canPlay('arrowHit')) { playNoise(0.06, 0.08, 800); } },
        siegeFire: () => { if (canPlay('siegeFire')) { playNoise(0.15, 0.1, 600); playTone(120, 0.2, 'sine', 0.08); } },
        siegeImpact: () => { if (canPlay('siegeImpact')) { playNoise(0.2, 0.15, 500); playTone(60, 0.15, 'sine', 0.12); } },
        buildingPlace: () => { if (canPlay('buildPlace')) { playTone(330, 0.1, 'square', 0.06); setTimeout(() => playTone(440, 0.1, 'square', 0.06), 60); } },
        buildingDestroyed: () => { if (canPlay('buildDestroy')) { playNoise(0.3, 0.15, 400); playTone(200, 0.15, 'sine', 0.1); } },
        resourceDeposit: () => { if (canPlay('resDep')) { playTone(660, 0.08, 'sine', 0.04); setTimeout(() => playTone(880, 0.1, 'sine', 0.03), 50); } },
        unitTrained: () => { if (canPlay('unitTrain')) { playTone(440, 0.08, 'square', 0.05); setTimeout(() => playTone(550, 0.08, 'square', 0.05), 70); } },
        unitDeath: () => { if (canPlay('unitDeath')) { playTone(300, 0.2, 'square', 0.07); } },
        unitSelected: () => { if (canPlay('unitSel')) playTone(880, 0.04, 'square', 0.04); },
        unitCommanded: () => { if (canPlay('unitCmd')) { playTone(660, 0.03, 'square', 0.04); setTimeout(() => playTone(770, 0.04, 'square', 0.03), 40); } },
        ensureContext, setEnabled: (v) => enabled = !!v
    };
})();
