// Extracted from the benchmarked cube-LOD renderer; see packages/splat-lod/CHANGES.md.
import * as pc from '../../index.js';
import { CACHE_STRIDE } from '../../scene/gsplat-unified/gsplat-projector-constants.js';
import { computeGsplatProjectorSource } from '../../scene/shader-lib/wgsl/chunks/gsplat/compute-gsplat-projector.js';
import { computeGsplatProjectCommonSource } from '../../scene/shader-lib/wgsl/chunks/gsplat/compute-gsplat-project-common.js';
import { computeGsplatCommonSource } from '../../scene/shader-lib/wgsl/chunks/gsplat/compute-gsplat-common.js';
import { computeGsplatTileIntersectSource } from '../../scene/shader-lib/wgsl/chunks/gsplat/compute-gsplat-tile-intersect.js';
import computeSplatSource from '../../scene/shader-lib/wgsl/chunks/gsplat/vert/gsplatComputeSplat.js';
import gsplatModifySource from '../../scene/shader-lib/wgsl/chunks/gsplat/vert/gsplatModify.js';
import gsplatHelpersSource from '../../scene/shader-lib/wgsl/chunks/gsplat/vert/gsplatHelpers.js';
import gsplatEvalSHSource from '../../scene/shader-lib/wgsl/chunks/gsplat/vert/gsplatEvalSH.js';
import nativeSHSource from '../../scene/shader-lib/wgsl/chunks/gsplat/vert/formats/uncompressedSH.js';
import { VISIBLE_SH_EVALUATION_SOURCE } from './visible-sh.js';
import { RANGE_BANKS, RANGE_LOOKUP_WGSL } from './range-core.js';

const SOG_STREAMS = ['sh0', 'sh_labels', 'sh_centroids', 'sogCodebook'];
const NATIVE_STREAMS = ['splatColor', 'splatSH_1to3', 'splatSH_4to7', 'splatSH_8to11', 'splatSH_12to15'];
const commonSh = VISIBLE_SH_EVALUATION_SOURCE.slice(VISIBLE_SH_EVALUATION_SOURCE.indexOf('fn visibleShRotateInverse'), VISIBLE_SH_EVALUATION_SOURCE.indexOf('fn evaluateVisibleSh'));
const nativeEvaluation = `${commonSh}
fn evaluateVisibleSh(worldIndex:u32,worldCenter:vec3f,fallback:vec3f)->vec3f {
    let index=worldIndex-visibleShUniforms.visibleShParams.x;let size=visibleShUniforms.visibleShParams.y;
    rangeSourceUv=vec2i(i32(index%size),i32(index/size));
    var sh:array<half3,15>;var scale:f32;readSHData(&sh,&scale);
    let dir=normalize(visibleShRotateInverse(visibleShUniforms.visibleShModelRotation,worldCenter-uniforms.cameraPosition));
    return loadSplatColor().rgb+vec3f(evalSH(&sh,dir)*half(scale));
}`;
function replaceOnce(source, from, to) {
    if (!source.includes(from) || source.indexOf(from) !== source.lastIndexOf(from)) throw new Error(`Native projector source changed: ${from.slice(0, 70)}`);
    return source.replace(from, to);
}
export const RANGE_PROJECT_COMMON = replaceOnce(computeGsplatProjectCommonSource, 'let splatId = compactedSplatIds[threadIdx];', 'let splatId = rangeSplatId(threadIdx);');
let rangeProjector = replaceOnce(computeGsplatProjectorSource,
    '@group(0) @binding(0) var<storage, read> compactedSplatIds: array<u32>;\n@group(0) @binding(1) var<storage, read> sortElementCount: array<u32>;',
    `${RANGE_LOOKUP_WGSL}\n@group(0) @binding(0) var<storage,read> intervals:array<RegionRange>;\n@group(0) @binding(1) var<storage,read> prefixSumBuffer:array<u32>;\n@group(0) @binding(7) var<storage,read> sourceIdMap:array<u32>;\n@group(0) @binding(8) var<uniform> rangeUniforms:RangeUniforms;`);
rangeProjector = replaceOnce(rangeProjector, 'let numVisible = sortElementCount[0];', 'let numVisible = rangeCount();');
rangeProjector = replaceOnce(rangeProjector, '#include "gsplatProjectCommonCS"', '#include "gsplatProjectCommonCS"\n#include "rangeShDeclarationsCS"\n#include "gsplatEvalSHVS"\n#include "rangeShEvaluationCS"');
rangeProjector = replaceOnce(rangeProjector, 'modifySplatColor(center, &clr);\n\t\t\trgb = max(clr.rgb, vec3f(0.0));', `
            if(visibleShUniforms.visibleShParams.w!=0u){clr=vec4f(evaluateVisibleSh(projected.splatId,center,clr.rgb),clr.a);}
            modifySplatColor(center,&clr);
            if(visibleShUniforms.visibleShParams.w!=0u){clr=vec4f(quantizeVisibleShWorkBufferColor(clr.rgb),clr.a);}
            rgb=max(clr.rgb,vec3f(0.0));`);
export const RANGE_PROJECTOR_SOURCE = rangeProjector;

// Four texture formats are dispatched separately into ONE projected cache and
// ONE counter, followed by the existing GLOBAL depth sort and blended draw.
// Nothing is composited per bank, and no bank-sized ID list is materialized.
export function installSceneRangeProjection({ app, projector, selector, dynamicLod, dispatch }) {
    if (!selector.ranges) throw new Error('Range projection needs bank-major prefixes');
    const ranges = selector.ranges;
    const managers = []; app.renderer.gsplatDirector.camerasMap.forEach(c => c.layersMap.forEach((l) => {
        if (l.gsplatManager)managers.push(l.gsplatManager);
    }));
    if (managers.length !== 1) throw new Error('Expected one scene manager');
    const world = managers[0].world, state = world.getState(world.currentVersion);
    const infos = [...state.splats].sort((a, b) => bankIndex(a.node.name) - bankIndex(b.node.name));
    function bankIndex(name) {
        return name === 'scene-lod-source' ? 0 : Number(name.match(/^scene-lod-level([123])$/)?.[1]);
    }
    if (infos.length !== RANGE_BANKS || infos.some((v, i) => bankIndex(v.node.name) !== i || v.intervalOffsets.length !== 1 || ![0, 3].includes(v.resource.gsplatData.shBands))) throw new Error('Range projection requires four flat SH0 or SH3 placements');
    const banks = infos.map((info) => {
        const resource = info.resource, shBands = resource.gsplatData.shBands, sog = !!resource.getTexture('sh_labels');
        const streams = shBands === 0 ? [] : sog ? SOG_STREAMS : NATIVE_STREAMS;
        if (streams.some(n => !resource.getTexture(n))) throw new Error('Unsupported SH resource format');
        const q = new pc.Quat().setFromMat4(info.node.getWorldTransform()); if (q.w < 0)q.mulScalar(-1);
        // PlayCanvas destroys old world-state placement records after a layout
        // update. Keep immutable asset metadata, never their intervalOffsets.
        return { resource, shBands, sog, streams, count: info.activeSplats, initialBase: info.intervalOffsets[0], rotation: new Float32Array([q.x, q.y, q.z, q.w]) };
    });
    const saved = { create: projector._createProjectorCompute, key: projector._projectorKey, destroyComputes: projector._destroyProjectorComputes, apply: world.applyWorkBufferUpdates, dispatch: projector.dispatch };
    const formats = new Set(); let activeBank = 0;
    const counters = { projectedFrames: 0, suppressedColorRefreshes: 0, bankDispatches: 0, directFrames: 0 };
    const rangeFormat = new pc.UniformBufferFormat(app.graphicsDevice, [new pc.UniformFormat('info', pc.UNIFORMTYPE_UVEC4)]);
    const shFormat = new pc.UniformBufferFormat(app.graphicsDevice, [new pc.UniformFormat('visibleShParams', pc.UNIFORMTYPE_UVEC4), new pc.UniformFormat('visibleShModelRotation', pc.UNIFORMTYPE_VEC4)]);
    projector._destroyProjectorComputes();
    projector._destroyProjectorComputes = function () {
        for (const compute of this._projectorComputes.values())compute.destroy();
        saved.destroyComputes.call(this); for (const format of formats)format.destroy(); formats.clear();
    };
    projector._projectorKey = function (...args) {
        return `${saved.key.apply(this, args)}range-bank-${activeBank}`;
    };
    projector._createProjectorCompute = function (workBuffer, radialSort, pickMode, fisheyeMode, antiAlias, stereo) {
        if (pickMode || fisheyeMode || stereo || this._userCacheWords) throw new Error('Range projection currently supports the mono perspective scene renderer');
        const device = this.device, wb = workBuffer.format, bank = banks[activeBank];
        if (wb.getStream('dataColor').format !== pc.PIXELFORMAT_R32U) throw new Error('Range SH quantization requires the existing compact work buffer');
        const fixed = [new pc.BindStorageBufferFormat('intervals', pc.SHADERSTAGE_COMPUTE, true), new pc.BindStorageBufferFormat('prefixSumBuffer', pc.SHADERSTAGE_COMPUTE, true),
            ...['projCache', 'sortKeys', 'renderCounter'].map(n => new pc.BindStorageBufferFormat(n, pc.SHADERSTAGE_COMPUTE)), new pc.BindStorageBufferFormat('binWeights', pc.SHADERSTAGE_COMPUTE, true),
            new pc.BindUniformBufferFormat('uniforms', pc.SHADERSTAGE_COMPUTE), new pc.BindStorageBufferFormat('sourceIdMap', pc.SHADERSTAGE_COMPUTE, true), new pc.BindUniformBufferFormat('rangeUniforms', pc.SHADERSTAGE_COMPUTE)];
        const wbBindings = wb.getComputeBindFormats(), shBindings = bank.resource.format.getComputeBindFormats(bank.streams), shStart = fixed.length + wbBindings.length;
        const bind = new pc.BindGroupFormat(device, [...fixed, ...wbBindings, ...shBindings, new pc.BindUniformBufferFormat('visibleShUniforms', pc.SHADERSTAGE_COMPUTE)]); formats.add(bind);
        const declarations = bank.resource.format.getComputeInputDeclarations(shStart, bank.streams).replaceAll('texture_2d<uff>', 'texture_2d<f32>').replaceAll('splat.uv', 'rangeSourceUv');
        const includes = new Map([
            ['gsplatCommonCS', computeGsplatCommonSource], ['gsplatTileIntersectCS', computeGsplatTileIntersectSource], ['gsplatComputeSplatCS', computeSplatSource],
            ['gsplatFormatDeclCS', wb.getComputeInputDeclarations(fixed.length)], ['gsplatFormatReadCS', wb.getReadCode()], ['gsplatHelpersVS', gsplatHelpersSource],
            ['gsplatModifyVS', this._userModifySource ?? gsplatModifySource], ['gsplatProjectCommonCS', RANGE_PROJECT_COMMON], ['gsplatEvalSHVS', gsplatEvalSHSource],
            ['rangeShDeclarationsCS', `var<private> rangeSourceUv:vec2i;\n${declarations}\nstruct VisibleShUniforms {visibleShParams:vec4u,visibleShModelRotation:vec4f};\n@group(0) @binding(${shStart + shBindings.length}) var<uniform> visibleShUniforms:VisibleShUniforms;`],
            ['rangeShEvaluationCS', bank.shBands === 0 ? `${commonSh}\nfn evaluateVisibleSh(index:u32,center:vec3f,fallback:vec3f)->vec3f{return fallback;}` : bank.sog ? VISIBLE_SH_EVALUATION_SOURCE : `${nativeSHSource}\n${nativeEvaluation}`]
        ]);
        const defines = new Map([['{CACHE_STRIDE}', String(CACHE_STRIDE)], ['SH_BANDS', String(bank.shBands)]]);
        if (bank.sog)defines.set('SOG_V2', ''); if (radialSort)defines.set('RADIAL_SORT', ''); if (antiAlias)defines.set('GSPLAT_AA', '');
        this._userDefines?.forEach((v, k) => {
            if (!['{CACHE_STRIDE}', 'SH_BANDS', 'SOG_V2', 'RADIAL_SORT', 'GSPLAT_AA'].includes(k))defines.set(k, v);
        });
        const name = `SceneRangeProject${activeBank}${bank.sog ? 'Sog' : 'Native'}`;
        const shader = new pc.Shader(device, { name,
            shaderLanguage: pc.SHADERLANGUAGE_WGSL,
            cshader: RANGE_PROJECTOR_SOURCE,
            cincludes: includes,
            cdefines: defines,
            computeBindGroupFormat: bind,
            computeUniformBufferFormats: { uniforms: this._projectorUniformBufferFormat, rangeUniforms: rangeFormat, visibleShUniforms: shFormat } });
        return new pc.Compute(device, shader, name);
    };
    world.applyWorkBufferUpdates = function (...args) {
        const renderColor = this._workBuffer.renderColor;
        // Enabling a chunk-color modifier still performs its one-time native
        // update. Those debug colors are view-independent and need no SH refresh.
        if (dynamicLod.fuseRangeSh !== false) {
            this._workBuffer.renderColor = () => {
                counters.suppressedColorRefreshes++;
            };
        }
        try {
            return saved.apply.apply(this, args);
        } finally {
            this._workBuffer.renderColor = renderColor;
        }
    };
    projector.dispatch = function (parameters) {
        const clear = this.renderCounter.clear;
        const direct = dynamicLod.directSource;
        try {
            for (activeBank = 0; activeBank < (direct ? 1 : RANGE_BANKS); activeBank++) {
                const bankIndex = activeBank, bank = banks[bankIndex];
                this._updateMaterial(parameters.material, parameters.userCacheWords || 0);
                const compute = this._getProjectorCompute(parameters.workBuffer, parameters.radialSort, false, false, !!parameters.antiAlias, false);
                compute.setParameter('intervals', ranges.table); compute.setParameter('prefixSumBuffer', ranges.prefix); compute.setParameter('sourceIdMap', ranges.sourceOrder);
                const base = ranges.bases?.[activeBank]; if (!Number.isInteger(base)) throw new Error('Missing current bank address');
                compute.setParameter('info', new Uint32Array([activeBank, ranges.stride, base, direct ? bank.count : 0]));
                compute.setParameter('visibleShParams', new Uint32Array([base, bank.resource.textureDimensions.x, bank.count, bank.shBands === 0 || dynamicLod.rangeDebugColors || dynamicLod.fuseRangeSh === false ? 0 : 1]));
                compute.setParameter('visibleShModelRotation', bank.rotation);
                for (const stream of bank.streams)compute.setParameter(stream, bank.resource.getTexture(stream));
                const setup = compute.setupDispatch;
                if (!direct) compute.setupDispatch = () => compute.setupIndirectDispatch(bankIndex, ranges.dispatchBuffer);
                if (activeBank > 0) this.renderCounter.clear = () => {};
                try {
                    dispatch(parameters); counters.bankDispatches++;
                } finally {
                    compute.setupDispatch = setup;
                }
            }
            counters.projectedFrames++;
            if (direct) counters.directFrames++;
        } finally {
            this.renderCounter.clear = clear; activeBank = 0;
        }
    };
    return { describe: () => ({ name: 'world-indexed-ranges-visible-sh', gpuIdExpansion: false, bankDispatchesPerFrame: dynamicLod.directSource ? 1 : RANGE_BANKS, globalDepthSort: true, visibleOnlySh: dynamicLod.fuseRangeSh !== false, initialBases: banks.map(b => b.initialBase), currentBases: ranges.bases, ...counters }),
        restore() {
            projector._destroyProjectorComputes();
            projector._destroyProjectorComputes = saved.destroyComputes; projector._createProjectorCompute = saved.create; projector._projectorKey = saved.key; projector.dispatch = saved.dispatch; world.applyWorkBufferUpdates = saved.apply;
        } };
}
