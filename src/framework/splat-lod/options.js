export const DEFAULT_LOD_MULTIPLIER = 2;

export function lodScale(multiplier) {
    if (!Number.isFinite(multiplier) || multiplier <= 0 || multiplier > 16) throw new RangeError('LOD multiplier must be greater than 0 and at most 16');
    return 0.5 * multiplier;
}

export function validateCamera(camera) {
    for (const name of ['position', 'target', 'up']) {
        if (!Array.isArray(camera[name]) || camera[name].length !== 3 || camera[name].some(v => !Number.isFinite(v))) throw new TypeError(`Camera ${name} must contain three finite numbers`);
    }
    const f = camera.target.map((v, i) => v - camera.position[i]);
    const [x, y, z] = f, [a, b, c] = camera.up;
    if (Math.hypot(x, y, z) < 1e-9 || Math.hypot(y * c - z * b, z * a - x * c, x * b - y * a) < 1e-9) throw new RangeError('Camera direction and up must form a non-degenerate basis');
    if (!(camera.fovDegrees > 0 && camera.fovDegrees < 179 && Number.isFinite(camera.near) && camera.near > 0 && Number.isFinite(camera.far) && camera.far > camera.near)) throw new RangeError('Invalid perspective camera');
    return camera;
}

export function validateViewport(width, height, pixelRatio, maxDimension) {
    const w = Math.floor(width * pixelRatio), h = Math.floor(height * pixelRatio);
    if (![width, height, pixelRatio].every(v => Number.isFinite(v) && v > 0) || w < 1 || h < 1 || w > maxDimension || h > maxDimension) throw new RangeError(`Viewport exceeds device limits (${maxDimension}px) or has invalid dimensions`);
    return [w, h];
}
