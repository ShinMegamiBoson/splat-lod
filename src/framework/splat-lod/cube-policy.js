// Extracted from the benchmarked cube-LOD renderer; see packages/splat-lod/CHANGES.md.
import { validateScenePartition } from './projection.js';

export function validateCubePartition(order, cubes, sourceCount, policy = cubes.policy) {
    validateScenePartition(order, sourceCount);
    const { offsets, coordinates, bounds, drawBounds } = cubes, C = offsets[0].length - 1;
    if (!C || coordinates.length !== C * 3 || bounds.length !== C * 4 || drawBounds.length !== C * 4 || offsets.length !== policy.levels.length) throw new Error('Incomplete cube data');
    for (const table of offsets) if (table.length !== C + 1 || table[0] !== 0) throw new Error('Invalid cube offsets');
    if (offsets[0][C] !== sourceCount) throw new Error('Incomplete cube source coverage');
    const radius = policy.cellSize * Math.sqrt(3) / 2;
    for (let i = 0; i < C; i++) {
        const n = offsets[0][i + 1] - offsets[0][i]; if (n < 1) throw new Error('Empty cube was retained');
        for (let a = 0; a < 3; a++) {
            const center = (coordinates[i * 3 + a] + 0.5) * policy.cellSize, tolerance = Math.max(1e-6, Math.abs(center) * 1e-6);
            if (!Number.isFinite(bounds[i * 4 + a]) || Math.abs(bounds[i * 4 + a] - center) > tolerance || drawBounds[i * 4 + a] !== bounds[i * 4 + a]) throw new Error('Cube is not aligned to the grid');
        }
        const storedRadius = bounds[i * 4 + 3], supportRadius = drawBounds[i * 4 + 3];
        if (!Number.isFinite(storedRadius) || Math.abs(storedRadius - radius) > Math.max(1e-6, Math.abs(radius) * 1e-6) || !Number.isFinite(supportRadius) || supportRadius < storedRadius) throw new Error('Invalid cube support bound');
        if (i) {
            const a = coordinates.subarray((i - 1) * 3, i * 3), b = coordinates.subarray(i * 3, i * 3 + 3);
            if (!(a[0] < b[0] || (a[0] === b[0] && (a[1] < b[1] || (a[1] === b[1] && a[2] < b[2]))))) throw new Error('Duplicate or unsorted cube coordinates');
        }
        for (const l of policy.levels.slice(1)) if (offsets[l.id][i + 1] - offsets[l.id][i] !== (n > 1 ? Math.ceil(n / l.span) : 0)) throw new Error('LOD range crosses a cube or omits content');
    }
    return { sourceCount, chunkCount: C, unassigned: 0, duplicates: 0, cellSize: policy.cellSize };
}
