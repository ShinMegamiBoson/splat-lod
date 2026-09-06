// Extracted from the benchmarked cube-LOD renderer; see packages/splat-lod/CHANGES.md.
export function validateScenePartition(order, sourceCount, chunkSize = 1) {
    if (order.length !== sourceCount || !Number.isInteger(sourceCount) || sourceCount < 1) throw new Error('Incomplete source ownership');
    const seen = new Uint8Array(sourceCount);
    if (!Number.isInteger(chunkSize) || chunkSize < 1) throw new Error('Invalid chunk size');
    for (const id of order) {
        if (!Number.isInteger(id) || id < 0 || id >= sourceCount || seen[id]) throw new Error('Duplicate or out-of-range source owner'); seen[id] = 1;
    }
    return { sourceCount, chunkCount: Math.ceil(sourceCount / chunkSize), unassigned: 0, duplicates: 0 };
}

// Exact perspective silhouette diameter of a sphere, including off-axis magnification.
export function projectedChunk(bounds, pose) {
    const dx = bounds[0] - pose.position[0], dy = bounds[1] - pose.position[1], dz = bounds[2] - pose.position[2];
    const dot = v => v[0] * dx + v[1] * dy + v[2] * dz;
    const z = dot(pose.forward), x = dot(pose.right), y = dot(pose.up), r = bounds[3];
    if (z + r <= pose.near) return { visible: false, pixels: 0 };
    if (z - r <= pose.near) return { visible: true, pixels: Infinity };
    const den = z * z - r * r, f = pose.focal;
    const ex = f * r * Math.sqrt(x * x + den) / den, ey = f * r * Math.sqrt(y * y + den) / den;
    const cx = f * x * z / den, cy = f * y * z / den;
    // Native Gaussian antialiasing can cover a pixel beyond geometric support.
    const guard = 2;
    const visible = cx + ex + guard >= -pose.width / 2 && cx - ex - guard <= pose.width / 2 && cy + ey + guard >= -pose.height / 2 && cy - ey - guard <= pose.height / 2;
    return { visible, pixels: 2 * f * r * Math.sqrt(x * x + y * y + den) / den };
}
