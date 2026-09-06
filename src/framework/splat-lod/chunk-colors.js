// Extracted from the benchmarked cube-LOD renderer; see packages/splat-lod/CHANGES.md.
import { writeRegionColorIds } from './regions.js';

const COLOR_FUNCTION = `
fn sceneChunkColor(id: u32) -> vec3f {
    var h = id + 1u;
    h = (h ^ (h >> 16u)) * 0x7feb352du;
    h = (h ^ (h >> 15u)) * 0x846ca68bu;
    h = h ^ (h >> 16u);
    let hue = f32(h & 65535u) / 65536.0;
    let saturation = 0.65 + 0.3 * f32((h >> 16u) & 255u) / 255.0;
    let value = 0.8 + 0.2 * f32(h >> 24u) / 255.0;
    let rainbow = clamp(abs(fract(vec3f(hue) + vec3f(0.0, 2.0/3.0, 1.0/3.0)) * 6.0 - 3.0) - 1.0, vec3f(0.0), vec3f(1.0));
    return value * mix(vec3f(1.0), rainbow, vec3f(saturation));
}
fn modifySplatCenter(center: ptr<function, vec3f>) {}
fn modifySplatRotationScale(originalCenter: vec3f, modifiedCenter: vec3f, rotation: ptr<function, vec4f>, scale: ptr<function, vec3f>) {}
`;

export const SOURCE_CHUNK_COLOR_MODIFIER = { wgsl: `
var sceneChunkOwners: texture_2d<u32>;
${COLOR_FUNCTION}
fn modifySplatColor(center: vec3f, color: ptr<function, vec4f>) {
    let id = textureLoad(sceneChunkOwners, splat.uv, 0).r;
    (*color) = vec4f(sceneChunkColor(id), (*color).a);
}` };

export function createSceneChunkColors(pc, device, banks, sourceOrder, regionOffsets) {
    let enabled = false;
    const owners = new Map();
    return {
        get enabled() {
            return enabled;
        },
        setEnabled(value) {
            value = Boolean(value); if (value === enabled) return;
            for (const bank of banks) {
                const splat = bank.entity.gsplat;
                if (value) {
                    if (!owners.has(bank.key)) {
                        const { x: width, y: height } = bank.asset.resource.textureDimensions;
                        const texture = new pc.Texture(device, { name: `cube-owners-${bank.key}`,
                            width,
                            height,
                            format: pc.PIXELFORMAT_R32U,
                            mipmaps: false,
                            minFilter: pc.FILTER_NEAREST,
                            magFilter: pc.FILTER_NEAREST,
                            addressU: pc.ADDRESS_CLAMP_TO_EDGE,
                            addressV: pc.ADDRESS_CLAMP_TO_EDGE });
                        const ids = texture.lock();
                        const level = bank.key === 'source' ? 0 : Number(bank.key.slice(5));
                        writeRegionColorIds(ids, regionOffsets[level], level === 0 ? sourceOrder : null);
                        texture.unlock(); owners.set(bank.key, texture);
                    }
                    splat.setParameter('sceneChunkOwners', owners.get(bank.key));
                    splat.setWorkBufferModifier(SOURCE_CHUNK_COLOR_MODIFIER);
                } else {
                    splat.setWorkBufferModifier(null); splat.deleteParameter('sceneChunkOwners');
                }
            }
            enabled = value;
        },
        destroy() {
            this.setEnabled(false); for (const texture of owners.values())texture.destroy(); owners.clear();
        }
    };
}
