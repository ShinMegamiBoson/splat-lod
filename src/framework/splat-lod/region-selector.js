// Extracted from the benchmarked cube-LOD renderer; see packages/splat-lod/CHANGES.md.
import * as pc from '../../index.js';
import { StorageBuffer } from '../../platform/graphics/storage-buffer.js';
import { BUFFERUSAGE_COPY_DST, BUFFERUSAGE_COPY_SRC } from '../../platform/graphics/constants.js';
import { PrefixSumKernel } from '../../scene/graphics/prefix-sum-kernel.js';
import { selectSceneRegions, materializeRegionSelection } from './regions.js';
import { RANGE_BANKS, RANGE_GROUP_SIZE, RANGE_LOOKUP_WGSL, rangePrefixes, resolveRangeId } from './range-core.js';

export const SCENE_REGION_CLASSIFY = `
struct Uniforms {positionFocal:vec4f,forwardWidth:vec4f,rightHeight:vec4f,upNear:vec4f,limits:vec4f,mergeLimits:vec4f,options:vec4f,nodeCounts:vec4u};
struct RegionRange {starts:vec4u,counts:vec4u};
@group(0) @binding(0) var<uniform> u:Uniforms;
@group(0) @binding(1) var<storage,read> bounds:array<vec4f>;
@group(0) @binding(2) var<storage,read> drawBounds:array<vec4f>;
@group(0) @binding(3) var<storage,read> ranges:array<RegionRange>;
@group(0) @binding(4) var<storage,read> radii:array<vec4f>;
@group(0) @binding(5) var<storage,read_write> tags:array<u32>;
@group(0) @binding(6) var<storage,read_write> counts:array<u32>;
@group(0) @binding(7) var<storage,read_write> metrics:array<atomic<u32>>;
@group(0) @binding(8) var<storage,read_write> previousTags:array<u32>;
struct Projection {visible:u32,pixels:f32};
fn project(b:vec4f)->Projection {
    let d=b.xyz-u.positionFocal.xyz;let z=dot(d,u.forwardWidth.xyz);let x=dot(d,u.rightHeight.xyz);let y=dot(d,u.upNear.xyz);let r=b.w;
    if(z+r<=u.upNear.w){return Projection(0u,0.0);}
    if(z-r<=u.upNear.w){return Projection(1u,1e30);}
    let den=z*z-r*r;let f=u.positionFocal.w;
    let ex=f*r*sqrt(x*x+den)/den;let ey=f*r*sqrt(y*y+den)/den;let cx=f*x*z/den;let cy=f*y*z/den;
    let visible=!(cx+ex+2.0 < -u.forwardWidth.w || cx-ex-2.0 > u.forwardWidth.w || cy+ey+2.0 < -u.rightHeight.w || cy-ey-2.0 > u.rightHeight.w);
    return Projection(select(0u,1u,visible),2.0*f*r*sqrt(x*x+y*y+den)/den);
}
fn mergePixels(b:vec4f,r:f32)->f32 {
    let d=b.xyz-u.positionFocal.xyz;let z=dot(d,u.forwardWidth.xyz)-b.w;
    let rho=length(vec2f(dot(d,u.rightHeight.xyz),dot(d,u.upNear.xyz)))+b.w;
    if(z-r<=u.upNear.w){return 1e30;}
    let den=z*z-r*r;
    return 2.0*u.positionFocal.w*r*sqrt(rho*rho+den)/den;
}
@compute @workgroup_size(256) fn main(@builtin(global_invocation_id) gid:vec3u){
    let region=gid.x;if(region==0u){counts[u.nodeCounts.y]=0u;}if(region>=u.nodeCounts.y){return;}
    let previous=tags[region];previousTags[region]=previous;tags[region]=0u;counts[region]=0u;
    if(project(drawBounds[region]).visible==0u){atomicAdd(&metrics[5],1u);return;}
    let b=bounds[region];let p=project(b);let range=ranges[region];var level=0u;
    if(u.nodeCounts.z!=2u && p.pixels>0.0 && (u.options.y>0.0 || p.visible!=0u)){
        for(var l=3u;l>0u;l--){
            let threshold=u.limits[l]*(1.0+select(-u.options.x,u.options.x,previous>l));
            if(range.counts[l]>0u && range.counts[l]<range.counts.x && p.pixels<=threshold && (u.mergeLimits[l]<=0.0 || mergePixels(b,radii[region][l])<=u.mergeLimits[l])){level=l;break;}
        }
    }
    if(u.nodeCounts.z==1u && level==0u){atomicAdd(&metrics[6],1u);return;}
    tags[region]=level+1u;counts[region]=range.counts[level];
    atomicAdd(&metrics[level],range.counts[level]);atomicAdd(&metrics[7u+level],1u);atomicAdd(&metrics[4],range.counts.x);
    if(level>0u){atomicMax(&metrics[11],bitcast<u32>(p.pixels));}
}`;

export const SCENE_REGION_SCATTER = `
struct Uniforms {counts:vec4u,bases:vec4u};
struct RegionRange {starts:vec4u,counts:vec4u};
@group(0) @binding(0) var<uniform> u:Uniforms;
@group(0) @binding(1) var<storage,read> tags:array<u32>;
@group(0) @binding(2) var<storage,read> offsets:array<u32>;
@group(0) @binding(3) var<storage,read> sourceOrder:array<u32>;
@group(0) @binding(4) var<storage,read> ranges:array<RegionRange>;
@group(0) @binding(5) var<storage,read_write> selectedIds:array<u32>;
@group(0) @binding(6) var<storage,read_write> selectedCount:array<u32>;
@compute @workgroup_size(64) fn main(@builtin(workgroup_id) group:vec3u,@builtin(local_invocation_id) lane:vec3u){
    let region=group.x+group.y*65535u;
    if(region==0u && lane.x==0u){selectedCount[0]=0u;selectedCount[1]=offsets[u.counts.y];}
    if(region>=u.counts.y || tags[region]==0u){return;}
    let level=tags[region]-1u;let range=ranges[region];let start=range.starts[level];let output=offsets[region];
    for(var i=lane.x;i<range.counts[level];i+=64u){
        var id=start+i;if(level==0u){id=sourceOrder[id];}
        selectedIds[output+i]=u.bases[level]+id;
    }
}`;

export function createSceneRegionSelector({ device, dynamicLod, directRanges = false }) {
    const { sourceCount, sourceOrder, regions } = dynamicLod.gpuHierarchy, regionCount = regions.offsets[0].length - 1;
    const policy = regions.policy;
    const upload = (data) => {
        const b = new StorageBuffer(device, data.byteLength, BUFFERUSAGE_COPY_DST); b.write(0, data); return b;
    };
    const table = new Uint32Array(regionCount * 8);
    for (let i = 0; i < regionCount; i++) {
        for (let l = 0; l < 4; l++) {
            table[i * 8 + l] = regions.offsets[l][i]; table[i * 8 + 4 + l] = regions.offsets[l][i + 1] - regions.offsets[l][i];
        }
    }
    const prefixLength = (regionCount + 1) * (directRanges ? RANGE_BANKS : 1);
    const buffers = { sourceOrder: upload(sourceOrder),
        bounds: upload(regions.bounds),
        drawBounds: upload(regions.drawBounds),
        ranges: upload(table),
        radii: upload(regions.maxGroupRadii || new Float32Array(regionCount * 4)),
        tags: new StorageBuffer(device, regionCount * 4, BUFFERUSAGE_COPY_SRC),
        previousTags: new StorageBuffer(device, regionCount * 4, BUFFERUSAGE_COPY_SRC),
        counts: new StorageBuffer(device, prefixLength * 4, BUFFERUSAGE_COPY_SRC),
        metrics: new StorageBuffer(device, 48, BUFFERUSAGE_COPY_SRC | BUFFERUSAGE_COPY_DST) };
    const make = (name, code, fields, bindings) => {
        const format = new pc.UniformBufferFormat(device, fields.map(([n, type]) => new pc.UniformFormat(n, type)));
        const bind = new pc.BindGroupFormat(device, [new pc.BindUniformBufferFormat('u', pc.SHADERSTAGE_COMPUTE), ...bindings.map(([n, read]) => new pc.BindStorageBufferFormat(n, pc.SHADERSTAGE_COMPUTE, read))]);
        const shader = new pc.Shader(device, { name, shaderLanguage: pc.SHADERLANGUAGE_WGSL, cshader: code, computeBindGroupFormat: bind, computeUniformBufferFormats: { u: format } });
        return { format, bind, shader, compute: new pc.Compute(device, shader, name) };
    };
    const classifySource = directRanges ? SCENE_REGION_CLASSIFY
    .replace('if(region==0u){counts[u.nodeCounts.y]=0u;}', 'if(region==0u){for(var b=0u;b<4u;b++){counts[b*(u.nodeCounts.y+1u)+u.nodeCounts.y]=0u;}}')
    .replace('counts[region]=0u;', 'for(var b=0u;b<4u;b++){counts[b*(u.nodeCounts.y+1u)+region]=0u;}')
    .replace('counts[region]=range.counts[level];', 'counts[level*(u.nodeCounts.y+1u)+region]=range.counts[level];') : SCENE_REGION_CLASSIFY;
    const classify = make('SceneRegionCut', classifySource, [...['positionFocal', 'forwardWidth', 'rightHeight', 'upNear', 'limits', 'mergeLimits', 'options'].map(n => [n, pc.UNIFORMTYPE_VEC4]), ['nodeCounts', pc.UNIFORMTYPE_UVEC4]],
        [['bounds', true], ['drawBounds', true], ['ranges', true], ['radii', true], ['tags', false], ['counts', false], ['metrics', false], ['previousTags', false]]);
    const scatter = directRanges ? null : make('SceneRegionScatter', SCENE_REGION_SCATTER, [['counts', pc.UNIFORMTYPE_UVEC4], ['bases', pc.UNIFORMTYPE_UVEC4]],
        [['tags', true], ['offsets', true], ['sourceOrder', true], ['ranges', true], ['selectedIds', false], ['selectedCount', false]]);
    classify.compute.setupDispatch(Math.ceil(regionCount / 256)); scatter?.compute.setupDispatch(Math.min(regionCount, 65535), Math.ceil(regionCount / 65535));
    for (const name of ['bounds', 'drawBounds', 'ranges', 'radii', 'tags', 'counts', 'metrics', 'previousTags'])classify.compute.setParameter(name, buffers[name]);
    if (scatter) {
        for (const name of ['tags', 'sourceOrder', 'ranges'])scatter.compute.setParameter(name, buffers[name]); scatter.compute.setParameter('offsets', buffers.counts);
    }
    const dispatchBuffer = directRanges ? new StorageBuffer(device, RANGE_BANKS * 12, pc.BUFFERUSAGE_INDIRECT | BUFFERUSAGE_COPY_SRC) : null;
    const rangeArgs = directRanges ? make('SceneRangeDispatch', `
struct U {info:vec4u};@group(0) @binding(0) var<uniform> u:U;
@group(0) @binding(1) var<storage,read> prefix:array<u32>;
@group(0) @binding(2) var<storage,read_write> args:array<u32>;
@group(0) @binding(3) var<storage,read_write> selectedCount:array<u32>;
@compute @workgroup_size(4) fn main(@builtin(local_invocation_index) bank:u32){
let start=bank*u.info.x;let n=prefix[start+u.info.x-1u]-prefix[start];let groups=(n+${RANGE_GROUP_SIZE - 1}u)/${RANGE_GROUP_SIZE}u;
args[bank*3u]=min(groups,65535u);args[bank*3u+1u]=max(1u,(groups+65534u)/65535u);args[bank*3u+2u]=1u;
if(bank==0u){selectedCount[0]=0u;selectedCount[1]=prefix[4u*u.info.x-1u];}
}`, [['info', pc.UNIFORMTYPE_UVEC4]], [['prefix', true], ['args', false], ['selectedCount', false]]) : null;
    if (rangeArgs) {
        rangeArgs.compute.setParameter('info', new Uint32Array([regionCount + 1, 0, 0, 0])); rangeArgs.compute.setParameter('prefix', buffers.counts); rangeArgs.compute.setParameter('args', dispatchBuffer); rangeArgs.compute.setupDispatch(1);
    }
    const prefix = new PrefixSumKernel(device); prefix.resize(buffers.counts, prefixLength);
    let priorKey = null, lastFrame = null, revision = 0, lastDispatch = { skipped: false }, lastStats = null;
    const directCount = new Uint32Array([0, sourceCount]);
    const counters = { selections: 0, prefixScans: 0, directFrames: 0 };
    function prepareDirect({ viewportWidth, viewportHeight, layout, selectedIds, selectedCount }) {
        counters.directFrames++;
        if (lastFrame?.path === 'direct' && lastFrame.selectedCount === selectedCount &&
            lastFrame.viewport[0] === viewportWidth && lastFrame.viewport[1] === viewportHeight &&
            lastFrame.mode === dynamicLod.mode && lastFrame.scale === dynamicLod.pixelScale &&
            lastFrame.bases[0] === layout.source.base && lastFrame.bases[1] === layout.level1.base &&
            lastFrame.bases[2] === layout.level2.base && lastFrame.bases[3] === layout.level3.base) return;
        if (lastFrame?.path !== 'direct' || lastFrame.selectedCount !== selectedCount) selectedCount.write(0, directCount);
        priorKey = null;
        lastFrame = { path: 'direct',
            selectedIds,
            selectedCount,
            bases: [layout.source.base, layout.level1.base, layout.level2.base, layout.level3.base],
            mode: dynamicLod.mode,
            scale: dynamicLod.pixelScale,
            viewport: [viewportWidth, viewportHeight],
            selectionRevision: ++revision,
            selectionCpuMs: 0 };
        dynamicLod.selectionRevision = revision;
        lastDispatch = { skipped: true, path: 'direct' };
    }
    function prepare({ cameraNode, viewportWidth, viewportHeight, layout, selectedIds, selectedCount }) {
        const p = cameraNode.getPosition(), f = cameraNode.forward, r = cameraNode.right, v = cameraNode.up, bases = [layout.source.base, ...[1, 2, 3].map(l => layout[`level${l}`]?.base ?? 0)];
        const scale = dynamicLod.pixelScale ?? 1; if (!Number.isFinite(scale) || scale <= 0) throw new Error('Invalid chunk detail scale');
        const key = [dynamicLod.mode, scale, viewportWidth, viewportHeight, p.x, p.y, p.z, f.x, f.y, f.z, r.x, r.y, r.z, v.x, v.y, v.z, cameraNode.camera.fov, cameraNode.camera.nearClip, ...bases];
        if (priorKey && key.every((value, i) => value === priorKey[i]) && lastFrame.selectedIds === selectedIds && lastFrame.selectedCount === selectedCount) {
            lastDispatch = { skipped: true }; return;
        }
        const start = performance.now(), focal = viewportHeight / (2 * Math.tan(cameraNode.camera.fov * Math.PI / 360)), mode = dynamicLod.mode, modeIndex = ['automatic', 'lower-only', 'source'].indexOf(mode);
        if (modeIndex < 0) throw new Error('Invalid region display mode');
        const counts = new Uint32Array([sourceCount, regionCount, modeIndex, 0]);
        for (const [name, data] of Object.entries({ positionFocal: [p.x, p.y, p.z, focal], forwardWidth: [f.x, f.y, f.z, viewportWidth / 2], rightHeight: [r.x, r.y, r.z, viewportHeight / 2], upNear: [v.x, v.y, v.z, cameraNode.camera.nearClip], limits: policy.levels.map(l => (l.maxPixels || 0) * scale), mergeLimits: policy.levels.map(l => l.mergeMaxPixels || 0), options: [policy.hysteresis || 0, policy.version === 6 ? 1 : 0, 0, 0] }))classify.compute.setParameter(name, new Float32Array(data));
        classify.compute.setParameter('nodeCounts', counts);
        buffers.metrics.clear(); device.computeDispatch([classify.compute], 'SceneRegionCut'); prefix.dispatch(device);
        counters.selections++; counters.prefixScans++;
        if (rangeArgs) {
            rangeArgs.compute.setParameter('selectedCount', selectedCount); device.computeDispatch([rangeArgs.compute], 'SceneRangeDispatch');
        } else {
            scatter.compute.setParameter('counts', counts); scatter.compute.setParameter('bases', new Uint32Array(bases)); scatter.compute.setParameter('selectedIds', selectedIds); scatter.compute.setParameter('selectedCount', selectedCount);
            device.computeDispatch([scatter.compute], 'SceneRegionScatter');
        }
        lastFrame = { path: 'lod',
            selectedIds,
            selectedCount,
            bases,
            mode,
            scale,
            viewport: [viewportWidth, viewportHeight],
            selectionRevision: ++revision,
            selectionCpuMs: performance.now() - start,
            pose: { position: [p.x, p.y, p.z], forward: [f.x, f.y, f.z], right: [r.x, r.y, r.z], up: [v.x, v.y, v.z], focal, width: viewportWidth, height: viewportHeight, near: cameraNode.camera.nearClip } };
        priorKey = key; lastDispatch = { skipped: false }; dynamicLod.selectionRevision = revision;
    }
    function cacheStats(stats) {
        lastStats = stats; return stats;
    }
    async function readStats() {
        const frame = lastFrame; if (!frame) return null; if (lastStats?.selectionRevision === frame.selectionRevision) return lastStats;
        if (frame.path === 'direct') {
            return cacheStats({ mode: frame.mode,
                path: 'direct',
                viewport: frame.viewport,
                selectionRevision: frame.selectionRevision,
                selectionCpuMs: 0,
                pixelScale: frame.scale,
                chunksByLevel: [regionCount, 0, 0, 0],
                splatsByLevel: [sourceCount, 0, 0, 0],
                activeSplats: sourceCount,
                coveredSourceSplats: sourceCount,
                culled: 0,
                hiddenFull: 0,
                maxLowerPixels: 0,
                totalChunks: regionCount,
                visibilityStage: 'projector' });
        }
        const data = await buffers.metrics.read(0, 48, new Uint32Array(12), true);
        if (frame !== lastFrame) return null;
        const stats = { mode: frame.mode,
            path: 'lod',
            viewport: frame.viewport,
            selectionRevision: frame.selectionRevision,
            selectionCpuMs: frame.selectionCpuMs,
            pixelScale: frame.scale,
            chunksByLevel: Array.from(data.slice(7, 11)),
            splatsByLevel: Array.from(data.slice(0, 4)),
            activeSplats: data[0] + data[1] + data[2] + data[3],
            coveredSourceSplats: data[4],
            culled: data[5],
            hiddenFull: data[6],
            maxLowerPixels: new Float32Array(new Uint32Array([data[11]]).buffer)[0],
            totalChunks: regionCount };
        return cacheStats(stats);
    }
    async function audit() {
        const frame = lastFrame; if (!frame || frame.mode !== dynamicLod.mode) throw new Error('Display mode has not reached the renderer yet');
        const direct = frame.path === 'direct';
        const [tags, previousTags, count] = await Promise.all([direct ? new Uint32Array(regionCount).fill(1) : buffers.tags.read(0, regionCount * 4, new Uint32Array(regionCount), true), direct ? null : buffers.previousTags.read(0, regionCount * 4, new Uint32Array(regionCount), true), frame.selectedCount.read(0, 8, new Uint32Array(2), true)]);
        const expected = direct ? { tags } : selectSceneRegions(regions, frame.pose, frame.mode, { scale: frame.scale, previousTags });
        const expectedIds = direct ? Uint32Array.from({ length: sourceCount }, (_, i) => frame.bases[0] + i) : materializeRegionSelection(expected, regions, sourceOrder, frame.bases);
        let actual;
        if (directRanges) {
            // Diagnostic only: exercise the projector's exact lookup on the GPU.
            const out = new StorageBuffer(device, Math.max(4, count[1] * 4), BUFFERUSAGE_COPY_SRC);
            const check = make('SceneRangeAudit', `${RANGE_LOOKUP_WGSL}
@group(0) @binding(0) var<uniform> rangeUniforms:RangeUniforms;
@group(0) @binding(1) var<storage,read> intervals:array<RegionRange>;
@group(0) @binding(2) var<storage,read> prefixSumBuffer:array<u32>;
@group(0) @binding(3) var<storage,read> sourceIdMap:array<u32>;
@group(0) @binding(4) var<storage,read_write> output:array<u32>;
@compute @workgroup_size(${RANGE_GROUP_SIZE}) fn main(@builtin(global_invocation_id) gid:vec3u,@builtin(num_workgroups) size:vec3u){
let i=gid.x+gid.y*size.x*${RANGE_GROUP_SIZE}u;if(i<rangeCount()){let base=select(prefixSumBuffer[rangeStart()],0u,rangeUniforms.info.w>0u);output[base+i]=rangeSplatId(i);}}
`, [['info', pc.UNIFORMTYPE_UVEC4]], [['intervals', true], ['prefixSumBuffer', true], ['sourceIdMap', true], ['output', false]]);
            // make() normally calls its uniform block u; use that same binding name.
            const checks = [check.compute, ...Array.from({ length: RANGE_BANKS - 1 }, () => new pc.Compute(device, check.shader, 'SceneRangeAudit'))];
            try {
                for (let bank = 0; bank < (direct ? 1 : RANGE_BANKS); bank++) {
                    const compute = checks[bank]; compute.setParameter('intervals', buffers.ranges); compute.setParameter('prefixSumBuffer', buffers.counts); compute.setParameter('sourceIdMap', buffers.sourceOrder); compute.setParameter('output', out);
                    compute.setParameter('info', new Uint32Array([bank, regionCount + 1, frame.bases[bank], direct ? sourceCount : 0]));
                    if (direct) {
                        const groups = Math.ceil(sourceCount / RANGE_GROUP_SIZE);
                        compute.setupDispatch(Math.min(groups, 65535), Math.ceil(groups / 65535));
                    } else compute.setupIndirectDispatch(bank, dispatchBuffer);
                    device.computeDispatch([compute], 'SceneRangeAudit');
                }
                actual = count[1] ? await out.read(0, count[1] * 4, new Uint32Array(count[1]), true) : new Uint32Array();
            } finally {
                out.destroy(); for (const c of checks)c.destroy(); check.shader.destroy(); check.bind.destroy();
            }
            if (!direct) {
                const prefix = rangePrefixes(expected.tags, regions.offsets); let n = 0;
                for (let bank = 0; bank < RANGE_BANKS; bank++) for (let i = 0; i < prefix[(bank + 1) * (regionCount + 1) - 1] - prefix[bank * (regionCount + 1)]; i++)expectedIds[n++] = resolveRangeId(prefix, regions.offsets, sourceOrder, frame.bases, bank, i);
            }
        } else actual = count[1] ? await frame.selectedIds.read(0, count[1] * 4, new Uint32Array(count[1]), true) : new Uint32Array();
        let decisionMismatches = 0, mismatches = 0; for (let i = 0; i < tags.length; i++)decisionMismatches += tags[i] !== expected.tags[i]; for (let i = 0; i < actual.length; i++)mismatches += actual[i] !== expectedIds[i];
        const stats = await readStats();
        return { passed: !decisionMismatches && !mismatches && count[1] === expectedIds.length,
            decisionMismatches,
            mismatches,
            expectedCount: expectedIds.length,
            gpuSelectedCount: count[1],
            ...(!mismatches ? {} : { firstActual: Array.from(actual.slice(0, 16)), firstExpected: Array.from(expectedIds.slice(0, 16)) }),
            sourceSplatsSubmitted: stats.splatsByLevel[0],
            mode: frame.mode,
            exactMatchToExclusiveChunkSelection: !mismatches,
            stats };
    }
    return { prepare,
        prepareDirect,
        readStats,
        audit,
        idCapacity: directRanges ? 1 : sourceCount,
        ranges: directRanges ? { prefix: buffers.counts,
            table: buffers.ranges,
            sourceOrder: buffers.sourceOrder,
            dispatchBuffer,
            stride: regionCount + 1,
            get bases() {
                return lastFrame?.bases;
            } } : null,
        describeDispatch: () => ({ ...lastDispatch, directRanges, ...counters }),
        invalidate() {
            priorKey = null;
        },
        destroy() {
            for (const b of Object.values(buffers))b.destroy(); dispatchBuffer?.destroy(); prefix.destroy(); for (const stage of [classify, scatter, rangeArgs].filter(Boolean)) {
                stage.compute.destroy(); stage.shader.destroy(); stage.bind.destroy();
            }
        } };
}
