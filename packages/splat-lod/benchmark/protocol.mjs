// One frozen protocol for every renderer. Physical pixels, never CSS-scaled timings.
export const PROTOCOL = Object.freeze({
    version: 2,
    width: 2560,
    height: 1440,
    cssWidth: 1280,
    cssHeight: 720,
    warmup: 20,
    samples: 90,
    interactiveDurationMs: 4000,
    repeats: 2,
    qualityFractions: [0, 0.25, 0.5, 0.75, 1],
    modes: ['pc-full', 'ours-lod', 'pc-default', 'ours-source', 'spark', 'luma']
});

const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = a => a.map(v => v / Math.hypot(...a));

// Same smooth path in both timing tracks: sideways/backwards translation
// plus changing aim. Amplitude fixed in scene units before collecting results.
export function cameraAt(scene, t) {
    const c = scene.camera, f = norm(c.target.map((v, i) => v - c.position[i]));
    const right = norm(cross(f, c.up)), up = norm(cross(right, f)), s = scene.motionScale;
    const side = Math.sin(2 * Math.PI * t) * s, back = t * 2 * s;
    const position = c.position.map((v, i) => v + side * right[i] - back * f[i]);
    const target = position.map((v, i) => v + f[i] + 0.12 * Math.sin(2 * Math.PI * t) * right[i] + 0.04 * Math.sin(4 * Math.PI * t) * up[i]);
    return { ...c, position, target };
}

export function quantile(values, p) {
    if (!values.length || values.some(v => !Number.isFinite(v))) throw new Error('Invalid timing samples');
    const a = [...values].sort((x, y) => x - y), x = (a.length - 1) * p, lo = Math.floor(x);
    return a[lo] + (a[Math.ceil(x)] - a[lo]) * (x - lo);
}

export function imageError(reference, candidate, background) {
    if (reference.length !== candidate.length || reference.length % 4) throw new Error('Image size mismatch');
    let squared = 0, foregroundSquared = 0, foregroundPixels = 0, max = 0;
    for (let i = 0; i < reference.length; i += 4) {
        const foreground = [0, 1, 2].some(c => Math.abs(reference[i + c] - background[c]) > 3);
        if (foreground) foregroundPixels++;
        for (let c = 0; c < 3; c++) {
            const delta = reference[i + c] - candidate[i + c];
            squared += delta * delta; if (foreground) foregroundSquared += delta * delta;
            max = Math.max(max, Math.abs(delta));
        }
    }
    const psnr = (sum, samples) => (sum ? 10 * Math.log10(255 ** 2 * samples / sum) : null);
    return { psnrDb: psnr(squared, reference.length * 0.75),
        exact: squared === 0,
        foregroundPsnrDb: foregroundPixels ? psnr(foregroundSquared, foregroundPixels * 3) : null,
        foregroundPixels,
        pixels: reference.length / 4,
        squared,
        foregroundSquared,
        max };
}
