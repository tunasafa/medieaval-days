/**
 * Water shape generation: signed distance fields, noise warping, and contour extraction.
 *
 * This module is the single source of truth for the SHAPE of every water body.
 * The tilemap rasterizes these shapes into its logical mask (which pathfinding and
 * all gameplay rules read), and the renderer draws the smoothed contour of that
 * same mask. Because both consumers derive from one field, the drawn coastline and
 * the gameplay no-go border can never disagree.
 *
 * Convention: sdf(x, y) < 0 means inside water, > 0 means land, in world units.
 */

// ===== SEEDED RNG =====
/**
 * Small fast seeded PRNG. Deterministic for a given seed so a map can be reproduced.
 * @param {number} seed - Integer seed
 * @returns {function(): number} Function returning floats in [0,1)
 */
function waterMulberry32(seed) {
    let a = seed >>> 0;
    return function () {
        a = (a + 0x6D2B79F5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

// ===== VALUE NOISE (2D, smooth, seeded) =====
/**
 * Hash-based 2D gradient noise used to warp otherwise geometric water outlines.
 * Uses a permutation table so results are stable and tileable-free (we never need
 * tiling here because the field is sampled in absolute world space).
 */
class WaterNoise {
    constructor(seed = 1337) {
        const rng = waterMulberry32(seed);
        const p = new Uint8Array(256);
        for (let i = 0; i < 256; i++) p[i] = i;
        for (let i = 255; i > 0; i--) {
            const j = (rng() * (i + 1)) | 0;
            const t = p[i]; p[i] = p[j]; p[j] = t;
        }
        this.perm = new Uint8Array(512);
        for (let i = 0; i < 512; i++) this.perm[i] = p[i & 255];
        this.grad = [
            [1, 1], [-1, 1], [1, -1], [-1, -1],
            [1, 0], [-1, 0], [0, 1], [0, -1]
        ];
    }

    _fade(t) { return t * t * t * (t * (t * 6 - 15) + 10); }

    /**
     * Sample smooth noise at a point.
     * @returns {number} Value in roughly [-1, 1]
     */
    at(x, y) {
        const xi = Math.floor(x), yi = Math.floor(y);
        const xf = x - xi, yf = y - yi;
        const X = xi & 255, Y = yi & 255;
        const u = this._fade(xf), v = this._fade(yf);
        const perm = this.perm, grad = this.grad;
        const g00 = grad[perm[perm[X] + Y] & 7];
        const g10 = grad[perm[perm[X + 1] + Y] & 7];
        const g01 = grad[perm[perm[X] + Y + 1] & 7];
        const g11 = grad[perm[perm[X + 1] + Y + 1] & 7];
        const n00 = g00[0] * xf + g00[1] * yf;
        const n10 = g10[0] * (xf - 1) + g10[1] * yf;
        const n01 = g01[0] * xf + g01[1] * (yf - 1);
        const n11 = g11[0] * (xf - 1) + g11[1] * (yf - 1);
        const nx0 = n00 + u * (n10 - n00);
        const nx1 = n01 + u * (n11 - n01);
        return nx0 + v * (nx1 - nx0);
    }

    /**
     * Fractal Brownian motion: layered noise for natural, multi-scale coastlines.
     * @param {number} x - World x
     * @param {number} y - World y
     * @param {number} octaves - Number of layers
     * @param {number} scale - Base feature size in world units
     * @returns {number} Value in roughly [-1, 1]
     */
    fbm(x, y, octaves = 4, scale = 400) {
        let sum = 0, amp = 1, freq = 1 / scale, norm = 0;
        for (let i = 0; i < octaves; i++) {
            sum += this.at(x * freq, y * freq) * amp;
            norm += amp;
            amp *= 0.5;
            freq *= 2;
        }
        return norm > 0 ? sum / norm : 0;
    }
}

// ===== GEOMETRY HELPERS =====
/**
 * Distance from point P to segment AB, plus the parametric position along it.
 * @returns {{dist: number, t: number}} Distance in world units and t in [0,1]
 */
function distToSegment(px, py, ax, ay, bx, by) {
    const vx = bx - ax, vy = by - ay;
    const wx = px - ax, wy = py - ay;
    const len2 = vx * vx + vy * vy;
    let t = len2 > 0 ? (wx * vx + wy * vy) / len2 : 0;
    if (t < 0) t = 0; else if (t > 1) t = 1;
    const cx = ax + t * vx, cy = ay + t * vy;
    return { dist: Math.hypot(px - cx, py - cy), t };
}

/**
 * Catmull-Rom spline point, used to turn a few control points into a smooth
 * river centerline without the caller having to specify many points.
 */
function catmullRom(p0, p1, p2, p3, t) {
    const t2 = t * t, t3 = t2 * t;
    return {
        x: 0.5 * ((2 * p1.x) + (-p0.x + p2.x) * t +
            (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 +
            (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3),
        y: 0.5 * ((2 * p1.y) + (-p0.y + p2.y) * t +
            (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 +
            (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3)
    };
}

/**
 * Densify control points into a polyline via Catmull-Rom, carrying a per-point
 * radius so a river can taper along its length.
 * @param {Array<{x:number,y:number,r:number}>} pts - Control points with radius
 * @param {number} perSeg - Samples per control segment
 * @returns {Array<{x:number,y:number,r:number}>} Smooth polyline
 */
function splinePolyline(pts, perSeg = 12) {
    if (pts.length < 2) return pts.slice();
    const ext = [pts[0], ...pts, pts[pts.length - 1]];
    const out = [];
    for (let i = 1; i < ext.length - 2; i++) {
        const p0 = ext[i - 1], p1 = ext[i], p2 = ext[i + 1], p3 = ext[i + 2];
        for (let s = 0; s < perSeg; s++) {
            const t = s / perSeg;
            const p = catmullRom(p0, p1, p2, p3, t);
            // Interpolate radius linearly between the two bracketing control points
            p.r = p1.r + (p2.r - p1.r) * t;
            out.push(p);
        }
    }
    const last = pts[pts.length - 1];
    out.push({ x: last.x, y: last.y, r: last.r });
    return out;
}

// ===== WATER FIELD =====
/**
 * A composite signed distance field describing all water in the world.
 *
 * Bodies are combined with a smooth-minimum union so a river joining a lake
 * produces a blended confluence rather than a hard seam. The whole field is then
 * displaced by fbm noise, which is what converts clean geometry into an organic,
 * non-blocky coastline.
 */
class WaterField {
    /**
     * @param {Object} opts
     * @param {number} opts.seed - Seed controlling noise and layout
     * @param {number} opts.worldWidth - World width in units
     * @param {number} opts.worldHeight - World height in units
     */
    constructor({ seed = 20240730, worldWidth, worldHeight } = {}) {
        this.seed = seed;
        this.worldWidth = worldWidth;
        this.worldHeight = worldHeight;
        this.noise = new WaterNoise(seed);
        this.warpNoise = new WaterNoise(seed ^ 0x9E3779B9);
        /** @type {Array<Object>} Primitive water bodies */
        this.bodies = [];
        // Noise displacement parameters. amplitude is how far the coast can wander
        // from the base geometry; scale is the size of coastline features.
        this.warpAmplitude = 150;
        this.warpScale = 620;
        this.detailAmplitude = 46;
        this.detailScale = 165;
        // Cached bounding box of all water, in world units, inflated for warp.
        this._bounds = null;
    }

    /**
     * Add a river: a tapered tube along a smooth spline centerline.
     * @param {Array<{x:number,y:number,r:number}>} controlPoints - Centerline with radii
     */
    addRiver(controlPoints) {
        const poly = splinePolyline(controlPoints, 14);
        this.bodies.push({ kind: 'river', poly });
        this._bounds = null;
        return this;
    }

    /**
     * Add a lake: a radial blob whose radius varies with angle.
     * @param {Object} o
     * @param {number} o.x - Center x
     * @param {number} o.y - Center y
     * @param {number} o.rx - X radius
     * @param {number} o.ry - Y radius
     */
    addLake({ x, y, rx, ry }) {
        this.bodies.push({ kind: 'lake', x, y, rx, ry });
        this._bounds = null;
        return this;
    }

    /**
     * Signed distance of a single primitive, before noise warping.
     * @returns {number} Negative inside, positive outside, in world units
     */
    _bodySdf(body, x, y) {
        if (body.kind === 'lake') {
            // Elliptical distance, scaled back toward world units so the value
            // stays usable as an approximate distance for depth shading.
            const dx = (x - body.x) / body.rx;
            const dy = (y - body.y) / body.ry;
            const d = Math.hypot(dx, dy);
            const minR = Math.min(body.rx, body.ry);
            return (d - 1) * minR;
        }
        // River: distance to the polyline minus the locally-interpolated radius.
        const poly = body.poly;
        let best = Infinity;
        for (let i = 0; i < poly.length - 1; i++) {
            const a = poly[i], b = poly[i + 1];
            const { dist, t } = distToSegment(x, y, a.x, a.y, b.x, b.y);
            const r = a.r + (b.r - a.r) * t;
            const d = dist - r;
            if (d < best) best = d;
        }
        return best;
    }

    /**
     * Smooth minimum: unions two distances with a soft blend of width k so
     * confluences look carved rather than glued.
     */
    _smoothMin(a, b, k) {
        const h = Math.max(0, Math.min(1, 0.5 + 0.5 * (b - a) / k));
        return b * (1 - h) + a * h - k * h * (1 - h);
    }

    /**
     * The composite, noise-warped signed distance at a world point.
     * This is the authoritative definition of "where the water is".
     * @param {number} x - World x
     * @param {number} y - World y
     * @returns {number} Negative inside water, positive on land
     */
    sdf(x, y) {
        if (this.bodies.length === 0) return Infinity;

        // Domain warp: shifting the sample point produces meanders and inlets
        // that a pure radius offset cannot, because it bends the shape itself.
        const wx = this.warpNoise.fbm(x, y, 3, this.warpScale);
        const wy = this.warpNoise.fbm(x + 971.3, y - 517.7, 3, this.warpScale);
        const sx = x + wx * this.warpAmplitude;
        const sy = y + wy * this.warpAmplitude;

        let d = this._bodySdf(this.bodies[0], sx, sy);
        for (let i = 1; i < this.bodies.length; i++) {
            d = this._smoothMin(d, this._bodySdf(this.bodies[i], sx, sy), 240);
        }

        // Fine detail on the boundary only. Scaling by proximity to the coast
        // keeps deep water and far inland from being needlessly perturbed.
        const falloff = Math.exp(-Math.abs(d) / 220);
        d += this.noise.fbm(x, y, 4, this.detailScale) * this.detailAmplitude * falloff;

        return d;
    }

    /**
     * Whether a world point is inside water according to the field.
     * Note: gameplay reads the rasterized tilemap mask, not this directly, so
     * that rendering and rules share one quantization.
     */
    contains(x, y) {
        return this.sdf(x, y) < 0;
    }

    /**
     * Conservative world-space bounds of all water, inflated to cover warping.
     * Used to limit rasterization and contour work to the region that matters.
     * @returns {{x0:number,y0:number,x1:number,y1:number}}
     */
    bounds() {
        if (this._bounds) return this._bounds;
        let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
        for (const b of this.bodies) {
            if (b.kind === 'lake') {
                x0 = Math.min(x0, b.x - b.rx); x1 = Math.max(x1, b.x + b.rx);
                y0 = Math.min(y0, b.y - b.ry); y1 = Math.max(y1, b.y + b.ry);
            } else {
                for (const p of b.poly) {
                    x0 = Math.min(x0, p.x - p.r); x1 = Math.max(x1, p.x + p.r);
                    y0 = Math.min(y0, p.y - p.r); y1 = Math.max(y1, p.y + p.r);
                }
            }
        }
        const pad = this.warpAmplitude + this.detailAmplitude + 64;
        this._bounds = {
            x0: Math.max(0, x0 - pad),
            y0: Math.max(0, y0 - pad),
            x1: Math.min(this.worldWidth, x1 + pad),
            y1: Math.min(this.worldHeight, y1 + pad)
        };
        return this._bounds;
    }
}

// ===== CONTOUR EXTRACTION (MARCHING SQUARES) =====
/**
 * Chaikin corner-cutting: each pass replaces every corner with two points at
 * 1/4 and 3/4 along its edges, converging on a smooth curve. Two passes is
 * enough to erase the 8-directional stair pattern left by marching squares.
 * @param {Array<{x:number,y:number}>} pts - Closed ring
 * @param {number} passes - Number of smoothing iterations
 * @returns {Array<{x:number,y:number}>} Smoothed closed ring
 */
function chaikinClosed(pts, passes = 2) {
    let ring = pts;
    for (let p = 0; p < passes; p++) {
        if (ring.length < 3) return ring;
        const out = [];
        for (let i = 0; i < ring.length; i++) {
            const a = ring[i];
            const b = ring[(i + 1) % ring.length];
            out.push({ x: a.x * 0.75 + b.x * 0.25, y: a.y * 0.75 + b.y * 0.25 });
            out.push({ x: a.x * 0.25 + b.x * 0.75, y: a.y * 0.25 + b.y * 0.75 });
        }
        ring = out;
    }
    return ring;
}

/**
 * Remove points closer together than a tolerance, to keep path sizes sane after
 * smoothing without visibly changing the outline.
 */
function decimateRing(pts, minDist = 3) {
    if (pts.length < 4) return pts;
    const out = [pts[0]];
    let last = pts[0];
    for (let i = 1; i < pts.length; i++) {
        const p = pts[i];
        if (Math.hypot(p.x - last.x, p.y - last.y) >= minDist) {
            out.push(p);
            last = p;
        }
    }
    // Guard against the closing edge collapsing
    if (out.length > 2 && Math.hypot(out[0].x - out[out.length - 1].x, out[0].y - out[out.length - 1].y) < minDist) {
        out.pop();
    }
    return out;
}

/**
 * Extract smooth closed contours at the water/land boundary of a boolean mask.
 *
 * Implementation is marching squares on the dual grid with linear interpolation
 * from a scalar field, then edge-linking into rings, then Chaikin smoothing.
 * Working from the scalar SDF (rather than the 0/1 mask) is what lets the curve
 * land between cell centers and removes the staircase.
 *
 * @param {Object} o
 * @param {function(number, number): number} o.sample - Scalar field; negative = inside
 * @param {number} o.x0 - Region left in world units
 * @param {number} o.y0 - Region top in world units
 * @param {number} o.x1 - Region right in world units
 * @param {number} o.y1 - Region bottom in world units
 * @param {number} o.step - Sampling step in world units (smaller = more detail)
 * @param {number} o.smoothPasses - Chaikin iterations
 * @returns {Array<Array<{x:number,y:number}>>} Closed rings in world coordinates
 */
function extractContours({ sample, x0, y0, x1, y1, step = 32, smoothPasses = 2 }) {
    const cols = Math.max(2, Math.ceil((x1 - x0) / step) + 1);
    const rows = Math.max(2, Math.ceil((y1 - y0) / step) + 1);

    // Sample the field on a lattice.
    const field = new Float32Array(cols * rows);
    for (let r = 0; r < rows; r++) {
        const wy = y0 + r * step;
        for (let c = 0; c < cols; c++) {
            field[r * cols + c] = sample(x0 + c * step, wy);
        }
    }

    const val = (c, r) => field[r * cols + c];
    // Linear interpolation to find where the field crosses zero along an edge.
    const lerpZero = (va, vb) => {
        const d = va - vb;
        if (Math.abs(d) < 1e-9) return 0.5;
        const t = va / d;
        return t < 0 ? 0 : (t > 1 ? 1 : t);
    };

    // Collect boundary segments per cell, keyed for linking.
    const segments = [];
    const key = (p) => `${Math.round(p.x * 4)},${Math.round(p.y * 4)}`;

    for (let r = 0; r < rows - 1; r++) {
        for (let c = 0; c < cols - 1; c++) {
            const v0 = val(c, r);         // top-left
            const v1 = val(c + 1, r);     // top-right
            const v2 = val(c + 1, r + 1); // bottom-right
            const v3 = val(c, r + 1);     // bottom-left

            let idx = 0;
            if (v0 < 0) idx |= 1;
            if (v1 < 0) idx |= 2;
            if (v2 < 0) idx |= 4;
            if (v3 < 0) idx |= 8;
            if (idx === 0 || idx === 15) continue;

            const wx = x0 + c * step, wy = y0 + r * step;
            // Crossing points on each of the four cell edges.
            const top    = { x: wx + step * lerpZero(v0, v1), y: wy };
            const right  = { x: wx + step, y: wy + step * lerpZero(v1, v2) };
            const bottom = { x: wx + step * lerpZero(v3, v2), y: wy + step };
            const left   = { x: wx, y: wy + step * lerpZero(v0, v3) };

            // Oriented so inside (negative) stays on the left of travel.
            const push = (a, b) => segments.push({ a, b });
            switch (idx) {
                case 1:  push(left, top); break;
                case 2:  push(top, right); break;
                case 3:  push(left, right); break;
                case 4:  push(right, bottom); break;
                case 5:  push(left, top); push(right, bottom); break; // saddle
                case 6:  push(top, bottom); break;
                case 7:  push(left, bottom); break;
                case 8:  push(bottom, left); break;
                case 9:  push(bottom, top); break;
                case 10: push(top, left); push(bottom, right); break; // saddle
                case 11: push(bottom, right); break;
                case 12: push(right, left); break;
                case 13: push(right, top); break;
                case 14: push(top, left); break;
            }
        }
    }

    if (segments.length === 0) return [];

    // Link segments head-to-tail into closed rings.
    const startMap = new Map();
    for (let i = 0; i < segments.length; i++) {
        const k = key(segments[i].a);
        if (!startMap.has(k)) startMap.set(k, []);
        startMap.get(k).push(i);
    }

    const used = new Uint8Array(segments.length);
    const rings = [];

    for (let i = 0; i < segments.length; i++) {
        if (used[i]) continue;
        const ring = [segments[i].a];
        let cur = segments[i];
        used[i] = 1;
        let guard = 0;

        while (guard++ < segments.length + 4) {
            ring.push(cur.b);
            const cands = startMap.get(key(cur.b));
            if (!cands) break;
            let nextIdx = -1;
            for (const ci of cands) {
                if (!used[ci]) { nextIdx = ci; break; }
            }
            if (nextIdx === -1) break; // ring closed or path ended
            used[nextIdx] = 1;
            cur = segments[nextIdx];
        }

        // Keep only rings substantial enough to be a real shoreline.
        if (ring.length >= 6) {
            rings.push(decimateRing(chaikinClosed(ring, smoothPasses), Math.max(2, step * 0.12)));
        }
    }

    return rings;
}

/**
 * Build a Path2D from smoothed rings using quadratic curves through midpoints,
 * which keeps the outline continuous rather than faceted.
 * @param {Array<Array<{x:number,y:number}>>} rings - Closed rings in world space
 * @returns {Path2D} Path in world coordinates
 */
function ringsToPath(rings) {
    const path = new Path2D();
    for (const ring of rings) {
        if (ring.length < 3) continue;
        // Start at the midpoint of the closing edge so the curve has no seam.
        const n = ring.length;
        const startMidX = (ring[n - 1].x + ring[0].x) / 2;
        const startMidY = (ring[n - 1].y + ring[0].y) / 2;
        path.moveTo(startMidX, startMidY);
        for (let i = 0; i < n; i++) {
            const cp = ring[i];
            const nx = ring[(i + 1) % n];
            path.quadraticCurveTo(cp.x, cp.y, (cp.x + nx.x) / 2, (cp.y + nx.y) / 2);
        }
        path.closePath();
    }
    return path;
}

/**
 * Construct the world's water layout for a new game.
 *
 * Produces either a meandering river that spans the map vertically (leaving both
 * bases on opposite banks) or a central lake with an outflow channel. Both are
 * expressed purely as SDF primitives so the coastline is organic by construction.
 *
 * @param {Object} o
 * @param {number} o.worldWidth - World width
 * @param {number} o.worldHeight - World height
 * @param {'river'|'lake'} o.layout - Which layout to build
 * @param {number} o.seed - Seed for reproducibility
 * @returns {WaterField} The constructed field
 */
function buildWorldWaterField({ worldWidth, worldHeight, layout, seed }) {
    const field = new WaterField({ seed, worldWidth, worldHeight });
    const rng = waterMulberry32(seed);
    const W = worldWidth, H = worldHeight;

    if (layout === 'river') {
        // Vertical meander down the middle. Control points wander laterally;
        // radius swells mid-map so the crossing is widest where bridges matter.
        const cx = W / 2;
        const amp = Math.min(300, W * 0.13);
        const pts = [];
        const n = 7;
        for (let i = 0; i < n; i++) {
            const t = i / (n - 1);
            // Alternating lateral offset with jitter produces natural bends.
            const swing = Math.sin(t * Math.PI * 2.1) * amp + (rng() - 0.5) * amp * 0.5;
            const radius = 150 + 55 * Math.sin(t * Math.PI); // taper at both ends
            pts.push({
                x: cx + swing,
                y: -60 + t * (H + 120), // overshoot edges so water meets the border
                r: radius
            });
        }
        field.addRiver(pts);
        field.warpAmplitude = 130;
        field.detailAmplitude = 42;
    } else {
        // Central lake plus a channel draining to the bottom edge.
        const cx = W / 2, cy = H / 2;
        const rx = Math.min(W, H) * 0.20;
        const ry = Math.min(W, H) * 0.155;
        field.addLake({ x: cx, y: cy, rx, ry });
        const chPts = [];
        const steps = 5;
        for (let i = 0; i < steps; i++) {
            const t = i / (steps - 1);
            const y = cy + ry * 0.55 + t * (H - (cy + ry * 0.55) + 80);
            chPts.push({
                x: cx + Math.sin(t * Math.PI * 1.6) * 130 + (rng() - 0.5) * 60,
                y,
                r: 130 - 35 * t // narrows downstream
            });
        }
        field.addRiver(chPts);
        field.warpAmplitude = 165;
        field.detailAmplitude = 50;
    }

    return field;
}
