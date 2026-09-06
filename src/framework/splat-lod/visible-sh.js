// Extracted from the benchmarked cube-LOD renderer; see packages/splat-lod/CHANGES.md.
export const VISIBLE_SH_EVALUATION_SOURCE = `
const VISIBLE_SH_C0: f32 = 0.28209479177387814;
fn visibleShCodebook(channel: i32, value: i32) -> f32 {
    return textureLoad(sogCodebook, vec2i(value, 0), 0)[channel];
}
fn visibleShUv(sourceIndex: u32) -> vec2i {
    let textureSize = visibleShUniforms.visibleShParams.y;
    return vec2i(i32(sourceIndex % textureSize), i32(sourceIndex / textureSize));
}
fn visibleShBaseColor(uv: vec2i) -> vec3f {
    let encoded = vec3i(textureLoad(sh0, uv, 0).xyz * 255.0 + 0.5);
    return vec3f(0.5) + VISIBLE_SH_C0 * vec3f(
        visibleShCodebook(1, encoded.x),
        visibleShCodebook(1, encoded.y),
        visibleShCodebook(1, encoded.z)
    );
}
fn visibleShCentroid(u: i32, v: i32) -> half3 {
    let encoded = vec3i(textureLoad(sh_centroids, vec2i(u, v), 0).xyz * 255.0 + 0.5);
    return half3(vec3f(
        visibleShCodebook(2, encoded.x),
        visibleShCodebook(2, encoded.y),
        visibleShCodebook(2, encoded.z)
    ));
}
fn visibleShRotateInverse(q: vec4f, v: vec3f) -> vec3f {
    let t = -q.xyz;
    return v + 2.0 * cross(t, cross(t, v) + q.w * v);
}
fn quantizeVisibleShWorkBufferColor(color: vec3f) -> vec3f {
    let rgb = clamp(color, vec3f(0.0), vec3f(4.0));
    let rBits = u32(rgb.r * (2047.0 / 4.0) + 0.5);
    let gBits = u32(rgb.g * (2047.0 / 4.0) + 0.5);
    let bBits = u32(rgb.b * (1023.0 / 4.0) + 0.5);
    return vec3f(
        f32(rBits) * (4.0 / 2047.0),
        f32(gBits) * (4.0 / 2047.0),
        f32(bBits) * (4.0 / 1023.0)
    );
}
fn evaluateVisibleSh(workBufferIndex: u32, worldCenter: vec3f, fallback: vec3f) -> vec3f {
    let params = visibleShUniforms.visibleShParams;
    if (workBufferIndex < params.x) { return fallback; }
    let sourceIndex = workBufferIndex - params.x;
    if (sourceIndex >= params.z) { return fallback; }
    let uv = visibleShUv(sourceIndex);
    let labels = textureLoad(sh_labels, uv, 0);
    let label = i32(labels.x * 255.0 + 0.5) + i32(labels.y * 255.0 + 0.5) * 256;
    let u = (label % 64) * SH_COEFFS;
    let v = label / 64;
    var sh: array<half3, SH_COEFFS>;
    sh[0] = visibleShCentroid(u, v);
    sh[1] = visibleShCentroid(u + 1, v);
    sh[2] = visibleShCentroid(u + 2, v);
    sh[3] = visibleShCentroid(u + 3, v);
    sh[4] = visibleShCentroid(u + 4, v);
    sh[5] = visibleShCentroid(u + 5, v);
    sh[6] = visibleShCentroid(u + 6, v);
    sh[7] = visibleShCentroid(u + 7, v);
    sh[8] = visibleShCentroid(u + 8, v);
    sh[9] = visibleShCentroid(u + 9, v);
    sh[10] = visibleShCentroid(u + 10, v);
    sh[11] = visibleShCentroid(u + 11, v);
    sh[12] = visibleShCentroid(u + 12, v);
    sh[13] = visibleShCentroid(u + 13, v);
    sh[14] = visibleShCentroid(u + 14, v);
    let worldDirection = normalize(worldCenter - uniforms.cameraPosition);
    let localDirection = normalize(visibleShRotateInverse(
        visibleShUniforms.visibleShModelRotation,
        worldDirection
    ));
    return visibleShBaseColor(uv) + vec3f(evalSH(&sh, localDirection));
}`;
