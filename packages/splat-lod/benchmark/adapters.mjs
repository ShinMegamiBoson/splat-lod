import * as pc from 'playcanvas/build/playcanvas.min.mjs';
import * as THREE from 'three';
import { SparkRenderer, SplatMesh } from '@sparkjsdev/spark';
import { luma } from '@luma.gl/core';
import { webgpuAdapter } from '@luma.gl/webgpu';
import { GPUPagedSplatRenderer, makeGPUSplatData } from '@luma.gl/splats';
import { PROTOCOL as P } from './protocol.mjs';
import { sequence, until } from './sequence.mjs';
import { OPTIMIZATION_SETTINGS } from './main-protocol.mjs';

const pause = () => new Promise((resolve) => {
    setTimeout(resolve, 0);
});
function threeCamera(scene) {
    return new THREE.PerspectiveCamera(scene.camera.fovDegrees, P.width / P.height, scene.camera.near, scene.camera.far);
}
function setThree(camera, pose) {
    camera.position.set(...pose.position); camera.up.set(...pose.up); camera.lookAt(...pose.target); camera.updateMatrixWorld();
}
function flipRows(pixels) {
    const out = new Uint8Array(pixels.length), stride = P.width * 4;
    for (let y = 0; y < P.height; y++) out.set(pixels.subarray(y * stride, (y + 1) * stride), (P.height - y - 1) * stride);
    return out;
}
function pcSettings(app) {
    const keys = ['renderer', 'currentRenderer', 'splatBudget', 'minPixelSize', 'minContribution', 'colorUpdateAngle', 'radialSorting', 'alphaClipForward'];
    return Object.fromEntries(keys.map(k => [k, app.scene.gsplat[k]]));
}
function gpuInfo(device) {
    const i = device.gpuAdapter?.info || device.adapterInfo;
    return { vendor: i?.vendor, architecture: i?.architecture, device: i?.device, description: i?.description };
}

export async function createAdapter(id, canvas, scene, progress) {
    if (id.startsWith('ours-')) {
        const libraryUrl = '/ours.js';
        const { createSplatRenderer } = await import(libraryUrl);
        const renderer = await createSplatRenderer({ canvas,
            manifestUrl: scene.manifest,
            camera: scene.camera,
            pixelRatio: 1,
            background: scene.background.map(v => v / 255),
            lodMultiplier: 2,
            adaptiveLod: id === 'ours-auto',
            renderSettings: OPTIMIZATION_SETTINGS[id],
            onProgress: progress });
        renderer.resize(P.width, P.height, 1); renderer.setMode(['ours-source', 'ours-direct'].includes(id) ? 'source' : 'automatic');
        return { prepare: pose => renderer.setCamera(pose),
            render: () => renderer.render(),
            flush: () => renderer.flush(),
            capture: async () => (await renderer.capture()).pixels,
            dispose: () => renderer.dispose(),
            trace: () => {
                const info = renderer.getInfo();
                return { ...info.performance,
                    selections: info.dispatch.selections,
                    prefixScans: info.dispatch.prefixScans,
                    bankDispatches: info.dispatch.projection.bankDispatches };
            },
            stats: async () => ({ ...renderer.getInfo(),
                selection: await renderer.readStats(),
                settings: pcSettings(renderer._app),
                device: gpuInfo(renderer._app.graphicsDevice) }) };
    }
    if (id.startsWith('pc-')) return createPlayCanvas(id, canvas, scene, progress);
    if (id === 'spark') return createSpark(canvas, scene, progress);
    if (id === 'luma') return createLuma(canvas, scene, progress);
    throw new Error(`Unknown renderer: ${id}`);
}

async function createPlayCanvas(id, canvas, scene, progress) {
    const device = await pc.createGraphicsDevice(canvas, { deviceTypes: [pc.DEVICETYPE_WEBGPU], alpha: false, antialias: false, powerPreference: 'high-performance' });
    if (!device.isWebGPU) throw new Error('WebGPU required');
    let gpuError;
    device.wgpu.addEventListener('uncapturederror', (e) => {
        gpuError = e.error;
    });
    const app = new pc.Application(canvas, { graphicsDevice: device }); app.autoRender = false;
    device.maxPixelRatio = 1; device.resizeCanvas(P.width, P.height);
    if (id === 'pc-full') {
        Object.assign(app.scene.gsplat, { renderer: pc.GSPLAT_RENDERER_RASTER_GPU_SORT,
            splatBudget: 0,
            minPixelSize: 0,
            minContribution: 0,
            colorUpdateAngle: 0,
            radialSorting: false,
            alphaClipForward: 1 / 255 });
    }
    const camera = new pc.Entity('benchmark-camera');
    camera.addComponent('camera', { fov: scene.camera.fovDegrees,
        nearClip: scene.camera.near,
        farClip: scene.camera.far,
        clearColor: new pc.Color(...scene.background.map(v => v / 255), 1),
        toneMapping: pc.TONEMAP_NONE });
    app.root.addChild(camera);
    progress(`Loading original SH${scene.shBands ?? 3} source…`);
    const asset = new pc.Asset('source', 'gsplat', { url: scene.source }, id === 'pc-full' ? { reorder: false, decompress: true } : {});
    const loaded = new Promise((resolve, reject) => {
        asset.ready(resolve); asset.once('error', reject);
    });
    app.assets.add(asset); app.assets.load(asset); await loaded;
    const data = asset.resource.gsplatData;
    if (data.numSplats !== scene.count || data.shBands !== (scene.shBands ?? 3)) throw new Error('PlayCanvas count/SH mismatch');
    const entity = new pc.Entity('source'); entity.addComponent('gsplat', { asset: asset.id, unified: true }); app.root.addChild(entity);
    const prepare = (pose) => {
        camera.setPosition(...pose.position); camera.lookAt(new pc.Vec3(...pose.target), new pc.Vec3(...pose.up));
    };
    const render = () => {
        if (gpuError) throw gpuError; app.update(0); app.fire('framerender'); app.render();
    };
    const flush = async () => {
        await device.wgpu.queue.onSubmittedWorkDone(); if (gpuError) throw gpuError;
    };
    prepare(scene.camera); app.start(); cancelAnimationFrame(app.frameRequestId); app.frameRequestId = null;
    return { prepare,
        render,
        flush,
        stats() {
            return { engine: pc.version,
                sourceCount: data.numSplats,
                shBands: data.shBands,
                residentCount: app.renderer._gsplatCount,
                settings: pcSettings(app),
                sourceEncoding: data.constructor.name,
                device: gpuInfo(device) };
        },
        async capture() {
            const texture = new pc.Texture(device, { width: P.width, height: P.height, format: pc.PIXELFORMAT_RGBA8, mipmaps: false });
            const target = new pc.RenderTarget({ colorBuffer: texture, depth: true, samples: 1 });
            camera.camera.renderTarget = target;
            try {
                render(); await flush(); return await texture.read(0, 0, P.width, P.height, { immediate: true });
            } finally {
                camera.camera.renderTarget = null; target.destroy(); texture.destroy();
            }
        },
        dispose() {
            asset.unload(); app.destroy();
        } };
}

async function createSpark(canvas, sceneConfig, progress) {
    const renderer = new THREE.WebGLRenderer({ canvas, alpha: false, antialias: false, powerPreference: 'high-performance' });
    renderer.setPixelRatio(1); renderer.setSize(P.width, P.height, false); renderer.outputColorSpace = THREE.SRGBColorSpace;
    const scene = new THREE.Scene(); scene.background = new THREE.Color().setRGB(...sceneConfig.background.map(v => v / 255), THREE.SRGBColorSpace);
    const camera = threeCamera(sceneConfig);
    const spark = new SparkRenderer({ renderer,
        autoUpdate: false,
        enableLod: false,
        enableDriveLod: false,
        sortRadial: false,
        minSortIntervalMs: 0,
        minPixelRadius: 0,
        minAlpha: 1 / 255,
        focalAdjustment: 2,
        preBlurAmount: 0.3,
        blurAmount: 0 });
    scene.add(spark); progress('Loading original SH3 source into Spark…');
    const mesh = new SplatMesh({ url: sceneConfig.source, editable: false, raycastable: false, lod: false, enableLod: false });
    mesh.maxSh = 3; scene.add(mesh); await mesh.initialized;
    if (mesh.numSplats !== sceneConfig.count || mesh.splats.getNumSh() !== 3) throw new Error('Spark count/SH mismatch');
    const gl = renderer.getContext(), state = { lastKey: null };
    const prepare = async (pose, interactive = false) => {
        setThree(camera, pose); spark.autoUpdate = interactive;
        if (interactive) {
            state.lastKey = null; return;
        }
        const key = JSON.stringify(pose);
        if (key !== state.lastKey) {
            // The harness serializes prepare calls and aborts this case on any failure.
            state.lastKey = key;
            const deadline = performance.now() + 20000;
            const current = () => !spark.sorting && !spark.sortDirty && spark.sortedCenter.distanceTo(camera.position) <= 1e-5 &&
                spark.sortedDir.dot(camera.getWorldDirection(new THREE.Vector3())) >= 0.999999;
            let updated = false;
            await until(() => updated && current(), async () => {
                await until(() => !spark.sorting, () => {
                    if (performance.now() > deadline) throw new Error('Spark sort timeout'); return pause();
                });
                await spark.update({ scene, camera });
                updated = true;
                if (current()) return;
                if (performance.now() > deadline) throw new Error('Spark current-view sort not ready');
                await pause();
            });
        }
    };
    const render = () => renderer.render(scene, camera);
    const flush = async () => {
        const fence = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0); gl.flush(); const deadline = performance.now() + 20000;
        try {
            await until(() => {
                const result = gl.clientWaitSync(fence, 0, 0);
                if (result === gl.ALREADY_SIGNALED || result === gl.CONDITION_SATISFIED) return true;
                if (result === gl.WAIT_FAILED || performance.now() > deadline) throw new Error('Spark GPU fence failed');
                return false;
            }, pause);
            if (gl.getError() !== gl.NO_ERROR) throw new Error('Spark WebGL error');
        } finally {
            gl.deleteSync(fence);
        }
    };
    const debug = gl.getExtension('WEBGL_debug_renderer_info');
    return { prepare,
        render,
        flush,
        sortLag() {
            return { angleRadians: Math.acos(Math.min(1, Math.max(-1, spark.sortedDir.dot(camera.getWorldDirection(new THREE.Vector3()))))),
                distance: spark.sortedCenter.distanceTo(camera.position) };
        },
        stats() {
            return { engine: 'Spark 2.1.0 / Three 0.180.0',
                sourceCount: mesh.numSplats,
                shBands: mesh.splats.getNumSh(),
                activeSplats: spark.activeSplats,
                sourceEncoding: 'PackedSplats: additional native quantization',
                settings: { enableLod: false,
                    sortRadial: false,
                    minSortIntervalMs: 0,
                    minPixelRadius: 0,
                    minAlpha: 1 / 255,
                    focalAdjustment: 2,
                    preBlurAmount: 0.3,
                    blurAmount: 0 },
                device: { renderer: debug ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER) } };
        },
        async capture() {
            const target = new THREE.WebGLRenderTarget(P.width, P.height, { type: THREE.UnsignedByteType, format: THREE.RGBAFormat, colorSpace: THREE.NoColorSpace });
            const background = scene.background, pixels = new Uint8Array(P.width * P.height * 4);
            const restore = () => {
                renderer.setRenderTarget(null); scene.background = background; target.dispose();
            };
            try {
                scene.background = new THREE.Color(...sceneConfig.background.map(v => v / 255)); renderer.setRenderTarget(target);
                render(); await flush(); renderer.readRenderTargetPixels(target, 0, 0, P.width, P.height, pixels); return flipRows(pixels);
            } finally {
                restore();
            }
        },
        dispose() {
            spark.dispose(); mesh.dispose(); renderer.dispose(); renderer.forceContextLoss();
        } };
}

async function createLuma(canvas, scene, progress) {
    const device = await luma.createDevice({ adapters: [webgpuAdapter],
        type: 'webgpu',
        powerPreference: 'high-performance',
        createCanvasContext: { canvas, width: P.width, height: P.height, autoResize: false, useDevicePixels: false, alphaMode: 'opaque', colorFormat: 'rgba8unorm' } });
    device.canvasContext.setDrawingBufferSize(P.width, P.height);
    const context = device.canvasContext.handle;
    context.configure({ ...context.getConfiguration(), usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC });
    let gpuError; device.handle.addEventListener('uncapturederror', (e) => {
        gpuError = e.error;
    });
    const manifestUrl = new URL(scene.luma, location.href), meta = await (await fetch(manifestUrl)).json(), pages = [];
    if (meta.count !== scene.count || meta.shDegree !== 3) throw new Error('Luma input count/SH mismatch');
    await sequence(meta.pages, async (page, i) => {
        progress(`Loading native Float32 SH3 page ${i + 1}/${meta.pages.length}…`);
        const response = await fetch(new URL(page.file, manifestUrl)); if (!response.ok) throw new Error('Missing Luma page');
        const buffer = await response.arrayBuffer();
        const hash = [...new Uint8Array(await crypto.subtle.digest('SHA-256', buffer))].map(b => b.toString(16).padStart(2, '0')).join('');
        if (hash !== page.sha256 || buffer.byteLength !== page.count * 60 * 4) throw new Error('Luma page hash/size mismatch');
        const columns = {}; let offset = 0;
        for (const [key, width] of [['positions', 3], ['scales', 3], ['rotations', 4], ['colors', 4], ['opacities', 1], ['sphericalHarmonics', 45]]) {
            columns[key] = new Float32Array(buffer, offset, page.count * width); offset += page.count * width * 4;
        }
        pages.push({ id: String(i), data: makeGPUSplatData(device, { ...columns, sphericalHarmonicsDegree: 3 }) });
    });
    const renderer = new GPUPagedSplatRenderer(device, { pages,
        viewportSize: [P.width, P.height],
        sphericalHarmonicsDegree: 3,
        clearColor: [...scene.background.map(v => v / 255), 1],
        toneMapping: 'none',
        alphaCutoff: 1 / 255,
        screenSizeCutoffPixels: 0,
        kernel2DSize: 0.3,
        gaussianSupportRadius: 3,
        radiusScale: 1,
        alphaScale: 1 });
    const camera = threeCamera(scene); camera.coordinateSystem = THREE.WebGPUCoordinateSystem; camera.updateProjectionMatrix();
    const mvp = new THREE.Matrix4();
    const prepare = (pose) => {
        setThree(camera, pose); mvp.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
        renderer.setProps({ modelViewProjectionMatrix: mvp.elements, cameraPosition: pose.position });
    };
    let encodedFrames = 0;
    const render = () => {
        if (gpuError) throw gpuError;
        const encoder = device.createCommandEncoder();
        if (renderer.encode(encoder)) {
            device.submit(encoder.finish()); encodedFrames++;
        }
    };
    const flush = async () => {
        await device.handle.queue.onSubmittedWorkDone(); if (gpuError) throw gpuError;
    };
    return { prepare,
        render,
        flush,
        stats() {
            return { engine: 'luma.gl 9.4.0 GPUPagedSplatRenderer (experimental)',
                sourceCount: meta.count,
                shBands: 3,
                sourceEncoding: 'native Float32 columns',
                renderer: renderer.stats,
                encodedFrames,
                settings: renderer.props,
                device: gpuInfo(device) };
        },
        async capture() {
            // Encode and copy the same presentation texture before yielding; canvas textures expire at presentation.
            // Public-property invalidation requests a redraw of an unchanged pose for diagnostic readback.
            renderer.setProps({ cameraPosition: camera.position.toArray().map(v => v + 1) });
            renderer.setProps({ modelViewProjectionMatrix: [...mvp.elements], cameraPosition: camera.position.toArray() });
            render();
            const texture = device.canvasContext.handle.getCurrentTexture(), stride = Math.ceil(P.width * 4 / 256) * 256;
            const staging = device.handle.createBuffer({ size: stride * P.height, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ });
            try {
                const encoder = device.handle.createCommandEncoder(); encoder.copyTextureToBuffer({ texture }, { buffer: staging, bytesPerRow: stride }, [P.width, P.height]);
                device.handle.queue.submit([encoder.finish()]); await staging.mapAsync(GPUMapMode.READ);
                const mapped = new Uint8Array(staging.getMappedRange()), pixels = new Uint8Array(P.width * P.height * 4);
                for (let y = 0; y < P.height; y++) pixels.set(mapped.subarray(y * stride, y * stride + P.width * 4), y * P.width * 4);
                await flush(); return pixels;
            } finally {
                staging.destroy();
            }
        },
        dispose() {
            renderer.destroy(); for (const page of pages) page.data.destroy(); device.destroy();
        } };
}
