// Extracted from the benchmarked cube-LOD renderer; see packages/splat-lod/CHANGES.md.
import { projectedChunk } from './projection.js';
// Bounds on a sub-group anywhere inside the region, at its nearest possible depth.
// This prevents a whole-region gate from using a merge above its fitted pixel size.
export function regionMergePixels(bounds, groupRadius, pose) {
    const d = [0, 1, 2].map(i => bounds[i] - pose.position[i]), dot = v => d.reduce((s, x, i) => s + x * v[i], 0);
    const z = dot(pose.forward) - bounds[3], rho = Math.hypot(dot(pose.right), dot(pose.up)) + bounds[3];
    if (z - groupRadius <= pose.near) return Infinity;
    const den = z * z - groupRadius * groupRadius;
    return 2 * pose.focal * groupRadius * Math.sqrt(rho * rho + den) / den;
}

export function selectSceneRegions(regions, pose, mode = 'automatic', options = {}) {
    if (!['automatic', 'lower-only', 'source'].includes(mode)) throw new Error('Invalid display mode');
    const { bounds, drawBounds, offsets: bankOffsets, maxGroupRadii } = regions, count = bankOffsets[0].length - 1;
    const policy = regions.policy, scale = options.scale ?? 1, hysteresis = policy.hysteresis || 0, previous = options.previousTags;
    if (!Number.isFinite(scale) || scale <= 0 || (previous && previous.length !== count)) throw new Error('Invalid chunk selection settings');
    const tags = new Uint32Array(count), offsets = new Uint32Array(count + 1);
    const chunksByLevel = [0, 0, 0, 0], splatsByLevel = [0, 0, 0, 0]; let culled = 0, hiddenFull = 0, covered = 0, maxLowerPixels = 0;
    for (let i = 0; i < count; i++) {
        if (!projectedChunk(drawBounds.subarray(i * 4, i * 4 + 4), pose).visible) {
            culled++; continue;
        }
        const b = bounds.subarray(i * 4, i * 4 + 4), p = projectedChunk(b, pose), sourceN = bankOffsets[0][i + 1] - bankOffsets[0][i]; let level = 0;
        if (mode !== 'source' && p.pixels > 0 && (policy.version !== 3 || p.visible)) {
            for (let l = 3; l >= 1; l--) {
                const tier = policy.levels[l], n = bankOffsets[l][i + 1] - bankOffsets[l][i], retaining = (previous?.[i] || 0) > l;
                const limit = tier.maxPixels * scale * (1 + (retaining ? hysteresis : -hysteresis));
                if (n > 0 && n < sourceN && p.pixels <= limit && (tier.mergeMaxPixels == null || regionMergePixels(b, maxGroupRadii[i * 4 + l], pose) <= tier.mergeMaxPixels)) {
                    level = l; break;
                }
            }
        }
        if (mode === 'lower-only' && !level) {
            hiddenFull++; continue;
        }
        tags[i] = level + 1; chunksByLevel[level]++; splatsByLevel[level] += bankOffsets[level][i + 1] - bankOffsets[level][i]; covered += sourceN;
        if (level)maxLowerPixels = Math.max(maxLowerPixels, p.pixels);
    }
    for (let i = 0; i < count; i++)offsets[i + 1] = offsets[i] + (tags[i] ? bankOffsets[tags[i] - 1][i + 1] - bankOffsets[tags[i] - 1][i] : 0);
    return { tags, offsets, activeCount: offsets[count], stats: { chunksByLevel, splatsByLevel, culled, hiddenFull, coveredSourceSplats: covered, maxLowerPixels, totalChunks: count, mode } };
}

export function materializeRegionSelection(selection, regions, sourceOrder, bases) {
    const ids = new Uint32Array(selection.activeCount);
    for (let i = 0; i < selection.tags.length; i++) {
        if (!selection.tags[i]) continue;
        const level = selection.tags[i] - 1, first = regions.offsets[level][i], end = regions.offsets[level][i + 1], out = selection.offsets[i];
        for (let j = first; j < end; j++)ids[out + j - first] = bases[level] + (level ? j : sourceOrder[j]);
    }
    return ids;
}

export function writeRegionColorIds(target, offsets, sourceOrder = null) {
    if (target.length < offsets.at(-1)) throw new Error('Invalid region-color storage');
    for (let i = 0; i < offsets.length - 1; i++) for (let j = offsets[i]; j < offsets[i + 1]; j++)target[sourceOrder ? sourceOrder[j] : j] = i;
    return target;
}
