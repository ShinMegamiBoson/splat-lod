// Compare like-for-like render paths. Never change culling, SH, or resolution to
// make LOD appear cheaper. These margins deliberately prefer original geometry.
export const LOD_PERFORMANCE_POLICY = Object.freeze({
    warmup: 4,
    samples: 12,
    block: 4,
    enterGain: 0.1,
    leaveGain: 0.03,
    maxTailRatio: 1.1,
    recheckFrames: 600,
    holdFrames: 120,
    timeoutFrames: 180
});
const DIRECT = Object.freeze({ path: 'direct', sample: false });
const LOD = Object.freeze({ path: 'lod', sample: false });
const MOTION_COSINE = Math.cos(Math.PI / 12);

const quantile = (values, fraction) => {
    const sorted = [...values].sort((a, b) => a - b);
    const i = (sorted.length - 1) * fraction;
    return sorted[Math.floor(i)] + (sorted[Math.ceil(i)] - sorted[Math.floor(i)]) * (i % 1);
};

/** Pure decision state; delayed GPU results must carry their original epoch. */
export class LodPerformancePolicy {
    constructor(supported, policy = LOD_PERFORMANCE_POLICY) {
        this.supported = supported;
        this.policy = policy;
        this.epoch = 0;
        this.frame = 0;
        this.path = 'direct';
        this.reason = supported ? 'measuring' : 'timing-unavailable';
        this.probing = false;
        this.lastDecision = null;
        this.nextProbe = 0;
        this.needsRecheck = false;
        this.samples = { direct: [], lod: [] };
        this.sent = { direct: 0, lod: 0 };
    }

    requestRecheck(immediate = false) {
        this.needsRecheck = true;
        if (immediate) {
            this.epoch++;
            this.probing = false;
            this.path = 'direct';
            this.nextProbe = this.frame;
            this.reason = this.supported ? 'measuring' : 'timing-unavailable';
        }
    }

    next() {
        this.frame++;
        if (!this.supported) return DIRECT;
        if (!this.probing && (this.frame >= this.nextProbe ||
            (this.needsRecheck && this.frame - this.decidedAt >= this.policy.holdFrames))) {
            this.epoch++;
            this.probing = true;
            this.probeStart = this.frame;
            this.incumbent = this.path;
            this.samples.direct.length = 0; this.samples.lod.length = 0;
            this.sent.direct = 0; this.sent.lod = 0;
            this.needsRecheck = false;
            this.reason = 'measuring';
        }
        if (!this.probing) return this.path === 'direct' ? DIRECT : LOD;
        if (this.frame - this.probeStart >= this.policy.timeoutFrames) {
            this.finish('direct', 'timing-inconclusive');
            return DIRECT;
        }
        const path = Math.floor((this.frame - this.probeStart) / this.policy.block) % 2 ? 'lod' : 'direct';
        this.sent[path]++;
        return { path, sample: this.sent[path] > this.policy.warmup, epoch: this.epoch };
    }

    observe(epoch, path, gpuMs, cpuMs) {
        if (!this.probing || epoch !== this.epoch || !['direct', 'lod'].includes(path) ||
            !Number.isFinite(gpuMs) || gpuMs <= 0 || !Number.isFinite(cpuMs) || cpuMs < 0) return;
        if (this.samples[path].length < this.policy.samples) {
            // Throughput is limited by the slower side, not the sum of overlapped
            // CPU/GPU work. This is a cost estimate, not a displayed-FPS claim.
            this.samples[path].push(Math.max(cpuMs, gpuMs));
        }
        if (this.samples.direct.length < this.policy.samples || this.samples.lod.length < this.policy.samples) return;
        const directMs = quantile(this.samples.direct, 0.5), lodMs = quantile(this.samples.lod, 0.5);
        const directP95 = quantile(this.samples.direct, 0.95), lodP95 = quantile(this.samples.lod, 0.95);
        const gain = 1 - lodMs / directMs;
        const required = this.incumbent === 'lod' ? this.policy.leaveGain : this.policy.enterGain;
        const useLod = gain >= required && lodP95 <= directP95 * this.policy.maxTailRatio;
        this.lastDecision = { directMs, lodMs, directP95, lodP95, gain, samplesPerPath: this.policy.samples };
        this.finish(useLod ? 'lod' : 'direct', useLod ? 'lod-faster' : 'direct-preferred');
    }

    finish(path, reason) {
        this.path = path; this.reason = reason; this.probing = false;
        this.decidedAt = this.frame;
        this.nextProbe = this.frame + this.policy.recheckFrames;
    }
}

/**
 * Sample native asynchronous GPU timestamps during bounded comparison windows.
 * There is no completion fence, pixel readback, or duplicate draw in this loop.
 * @param {object} device - The renderer's owned WebGPU graphics device.
 * @param {object} dynamicLod - Instance-local selection and projection state.
 * @param {number} cellSize - World-space cube edge, used to request remeasurement after movement.
 * @returns {object} Render hooks, diagnostics and cleanup.
 */
export function createLodPerformanceMonitor(device, dynamicLod, cellSize) {
    const profiler = device.gpuProfiler;
    const policy = new LodPerformancePolicy(Boolean(device.supportsTimestampQuery && profiler?.timestampQueriesSet));
    const pending = new Map(), previousReport = profiler.report, previousEnabled = profiler.enabled;
    let enabled = true, suspended = false, disposed = false, latest = null, anchor = null;
    const counters = { directFrames: 0, lodFrames: 0, probeFrames: 0 };
    profiler.report = function (version, timings, span) {
        const frame = pending.get(version); pending.delete(version);
        previousReport.call(this, version, timings, span);
        if (!disposed && frame && timings?.length) policy.observe(frame.epoch, frame.path, span, frame.cpuMs);
    };
    function invalidate(immediate = true) {
        pending.clear(); policy.requestRecheck(immediate); anchor = null;
    }
    return {
        before(view) {
            const eligible = enabled && !suspended && dynamicLod.mode === 'automatic' && !dynamicLod.rangeDebugColors;
            if (dynamicLod.mode === 'source' && !dynamicLod.rangeDebugColors) latest = DIRECT;
            else if (dynamicLod.mode === 'lower-only' || dynamicLod.rangeDebugColors || !enabled) latest = LOD;
            else if (suspended) latest = dynamicLod.directSource ? DIRECT : LOD;
            else if (eligible) {
                const p = view.position, t = view.target, dx = t[0] - p[0], dy = t[1] - p[1], dz = t[2] - p[2];
                const inverseLength = 1 / Math.hypot(dx, dy, dz), fx = dx * inverseLength, fy = dy * inverseLength, fz = dz * inverseLength;
                if (!anchor) anchor = { x: p[0], y: p[1], z: p[2], fx, fy, fz };
                else if (Math.hypot(p[0] - anchor.x, p[1] - anchor.y, p[2] - anchor.z) > cellSize * 2 ||
                    fx * anchor.fx + fy * anchor.fy + fz * anchor.fz < MOTION_COSINE) {
                    if (policy.probing) {
                        pending.clear(); policy.requestRecheck(true);
                    } else policy.requestRecheck();
                    anchor.x = p[0]; anchor.y = p[1]; anchor.z = p[2]; anchor.fx = fx; anchor.fy = fy; anchor.fz = fz;
                }
                latest = policy.next();
            } else {
                latest = dynamicLod.mode === 'source' && !dynamicLod.rangeDebugColors ? DIRECT : LOD;
            }
            dynamicLod.directSource = latest.path === 'direct';
            counters[latest.path === 'direct' ? 'directFrames' : 'lodFrames']++;
            if (eligible && policy.probing) counters.probeFrames++;
            // Keep timing enabled only while probing. Turning it off invalidates
            // outstanding profiler results; epoch checks also reject stale data.
            profiler.enabled = Boolean(eligible && policy.probing && policy.supported);
            if (!profiler.enabled) pending.clear();
            return latest.sample ? performance.now() : 0;
        },
        after(start) {
            if (!start || !latest?.sample || disposed) return;
            if (pending.size < 16) pending.set(device.renderVersion, { ...latest, cpuMs: performance.now() - start });
        },
        invalidate,
        setEnabled(value) {
            if (typeof value !== 'boolean') throw new TypeError('adaptiveLod must be a boolean');
            if (enabled !== value) {
                enabled = value; invalidate();
            }
        },
        suspend(value) {
            suspended = value; pending.clear();
        },
        describe: () => ({ enabled,
            path: dynamicLod.directSource ? 'direct' : 'lod',
            reason: !enabled ? 'fixed' : dynamicLod.mode !== 'automatic' || dynamicLod.rangeDebugColors ? 'display-override' : policy.reason,
            probing: policy.probing && enabled,
            timestampSupported: policy.supported,
            decision: policy.lastDecision,
            ...counters }),
        destroy() {
            disposed = true; pending.clear();
            profiler.report = previousReport; profiler.enabled = previousEnabled;
        }
    };
}
