import * as pc from '../../index.js';
import { installAdaptiveIndexedLodFrontEnd } from './indexed-front-end.js';
import { createSceneRegionSelector } from './region-selector.js';
import { installSceneRangeProjection } from './range-projector.js';
import { createSceneChunkColors } from './chunk-colors.js';
import { checkedBytes, loadManifest } from './manifest.js';
import { DEFAULT_LOD_MULTIPLIER, lodScale, validateCamera, validateViewport } from './options.js';
import { renderSettings } from './render-settings.js';
import { ENGINE_BASE } from './engine-base.js';
import { createLodPerformanceMonitor } from './performance-policy.js';

/** Tested upstream engine revision; this package bundles the fork, not an npm peer. */
export { ENGINE_BASE };

/** Standalone renderer returned by createSplatRenderer. Construction is internal. */
class SplatRenderer {
    constructor(app, camera, data, assets, onError) {
        this._app = app; this._camera = camera; this._data = data; this._assets = assets;
        this._disposed = false; this._frame = null; this._busy = false; this._failure = null;
        this._onError = (error) => {
            if (this._disposed) return;
            this._failure = error instanceof Error ? error : new Error(String(error));
            this.stop(); onError?.(this._failure);
        };
        this._gpuError = event => this._onError(event.error);
        app.graphicsDevice.wgpu.addEventListener('uncapturederror', this._gpuError);
        app.graphicsDevice.wgpu.lost.then((info) => {
            if (!this._disposed) this._onError(new Error(`WebGPU device lost: ${info.message}`));
        });
    }

    _initialize(banks, scale, settings) {
        const { sourceOrder, regions, manifest } = this._data;
        this._colors = createSceneChunkColors(pc, this._app.graphicsDevice, banks, sourceOrder, regions.offsets);
        const colors = this._colors;
        this._lod = {
            mode: 'automatic',
            pixelScale: scale,
            fuseRangeSh: settings.shMode === 'visible',
            get rangeDebugColors() {
                return colors.enabled;
            },
            gpuHierarchy: { sourceCount: manifest.sourceCount, sourceOrder, regions },
            resolveWorldLayout(worldState) {
                const layout = {};
                for (const splat of worldState.splats) {
                    const bank = banks.find(b => b.id === splat.node.name);
                    if (!bank) continue;
                    if (splat.activeSplats !== bank.count || splat.intervalOffsets.length !== 1) throw new Error('Resident bank layout changed');
                    layout[bank.key] = { base: splat.intervalOffsets[0], count: bank.count, boundsIndex: splat.boundsBaseIndex };
                }
                if (banks.some(b => !layout[b.key])) throw new Error('A resident bank is missing');
                return layout;
            },
            enableGpuSelection: (selector) => {
                this._selector = selector;
            }
        };
        this._residentCount = banks.reduce((sum, b) => sum + b.count, 0);
        this._settings = settings;
    }

    _install(adaptive) {
        this._frontEnd = installAdaptiveIndexedLodFrontEnd(this._app, this._lod, {
            createSelector: args => createSceneRegionSelector({ ...args, directRanges: true }), installProjection: installSceneRangeProjection
        });
        this._performance = createLodPerformanceMonitor(this._app.graphicsDevice, this._lod, this._data.regions.policy.cellSize);
        this._performance.setEnabled(adaptive);
    }

    _assertActive() {
        if (this._disposed) throw new Error('Renderer has been disposed');
        if (this._failure) throw this._failure;
        if (this._busy) throw new Error('Wait for the active capture or audit before changing the renderer');
    }

    _render() {
        const start = this._performance?.before(this._view);
        this._app.update(0); this._app.fire('framerender'); this._app.render();
        this._performance?.after(start);
    }

    /** Submit one frame without waiting for the GPU or reading back pixels. */
    render() {
        this._assertActive(); this._render();
    }

    /** Wait for already submitted GPU work. This is optional and not part of the normal frame path. */
    async flush() {
        this._assertActive(); await this._app.graphicsDevice.wgpu.queue.onSubmittedWorkDone(); this._assertActive();
    }

    /** Start a requestAnimationFrame loop. Calling start twice does not create a second loop. */
    start() {
        this._assertActive(); if (this._frame !== null) return;
        const tick = () => {
            this._frame = null;
            try {
                this.render(); this._frame = requestAnimationFrame(tick);
            } catch (error) {
                this._onError(error);
            }
        };
        this._frame = requestAnimationFrame(tick);
    }

    /** Stop the internal animation loop. User-owned loops are not modified. */
    stop() {
        if (this._frame !== null) cancelAnimationFrame(this._frame); this._frame = null;
    }

    /**
     * Update the camera without rendering. Position, target and up are world-space three-element arrays.
     * @param {object} camera - Partial camera settings, merged with the previous camera.
     */
    setCamera(camera) {
        this._assertActive();
        const view = validateCamera({ ...this._view, ...camera });
        this._view = { ...view, position: [...view.position], target: [...view.target], up: [...view.up] };
        this._camera.setPosition(...view.position);
        this._camera.lookAt(new pc.Vec3(...view.target), new pc.Vec3(...view.up));
        Object.assign(this._camera.camera, { fov: view.fovDegrees, nearClip: view.near, farClip: view.far });
    }

    /**
     * Resize the drawing buffer at native pixel density; no hidden resolution scale is applied.
     * @param {number} width - CSS width.
     * @param {number} height - CSS height.
     * @param {number} [pixelRatio] - Physical pixels per CSS pixel; pass devicePixelRatio for native output.
     */
    resize(width, height, pixelRatio = 1) {
        this._assertActive();
        const device = this._app.graphicsDevice;
        const [w, h] = validateViewport(width, height, pixelRatio, device.wgpu.limits.maxTextureDimension2D);
        if (w !== device.width || h !== device.height) this._performance?.invalidate();
        device.maxPixelRatio = 1; device.resizeCanvas(w, h);
    }

    /**
     * Select a screen-size multiplier. At 2, thresholds are 256/128/64 physical pixels before hysteresis.
     * @param {number} multiplier - Greater than 0 and at most 16; 1 uses the original 128/64/32px thresholds.
     */
    setLodMultiplier(multiplier) {
        this._assertActive();
        const scale = lodScale(multiplier);
        if (scale !== this._lod.pixelScale) this._performance?.invalidate();
        this._lod.pixelScale = scale;
    }

    /**
     * Enable measured render-path selection, or use fixed screen-size LOD.
     * @param {boolean} enabled - True selects LOD only after a measured gain.
     */
    setAdaptiveLod(enabled) {
        this._assertActive(); this._performance.setEnabled(enabled);
    }

    /**
     * Choose automatic LOD, original splats only, or eligible reduced cubes only. Lower-only never forces LOD.
     * @param {'automatic'|'source'|'lower-only'} mode - Display mode.
     */
    setMode(mode) {
        this._assertActive();
        if (!['automatic', 'source', 'lower-only'].includes(mode)) throw new RangeError('Invalid display mode');
        if (mode !== this._lod.mode) this._performance?.invalidate();
        this._lod.mode = mode;
    }

    /**
     * Color each cube consistently across its LODs. Opacity and geometry remain unchanged.
     * @param {boolean} enabled - Whether to replace natural SH colors with diagnostic cube colors.
     */
    setChunkColors(enabled) {
        this._assertActive();
        if (Boolean(enabled) !== this._colors.enabled) this._performance?.invalidate();
        this._colors.setEnabled(enabled);
    }

    /**
     * Read 48 bytes of GPU selection statistics. Returns null if the view changes during readback.
     * @returns {Promise<object|null>} Statistics for a completed selection.
     */
    async readStats() {
        this._assertActive(); return await this._selector.readStats();
    }

    /**
     * Return CPU-side configuration and residency, without GPU readback.
     * @returns {object} A configuration snapshot.
     */
    getInfo() {
        this._assertActive();
        return { engine: ENGINE_BASE,
            backend: 'webgpu',
            shBands: this._data.manifest.shBands ?? 3,
            renderSettings: this._settings,
            performance: this._performance?.describe(),
            dispatch: this._frontEnd ? { ...this._frontEnd.describeDispatch(), projection: this._frontEnd.projection?.() } : null,
            mode: this._lod.mode,
            lodMultiplier: this._lod.pixelScale * 2,
            viewport: [this._app.graphicsDevice.width, this._app.graphicsDevice.height],
            sourceCount: this._data.manifest.sourceCount,
            residentCount: this._residentCount,
            chunkCount: this._data.ownership.chunkCount,
            chunkColors: this._colors.enabled,
            sourceHashVerified: Boolean(this._data.manifest.sourceSha256),
            globalDepthSort: true,
            camera: structuredClone(this._view) };
    }

    async _diagnostic(callback) {
        this._assertActive(); const resume = this._frame !== null; this.stop(); this._busy = true;
        this._performance?.suspend(true);
        try {
            return await callback();
        } finally {
            this._performance?.suspend(false);
            this._busy = false; if (resume && !this._disposed && !this._failure) this.start();
        }
    }

    /**
     * Freeze the camera and verify actual GPU-selected IDs against an independent CPU range oracle.
     * @returns {Promise<object>} Actual versus expected ownership and selected IDs.
     */
    async audit() {
        return await this._diagnostic(async () => {
            this._render(); await this._app.graphicsDevice.wgpu.queue.onSubmittedWorkDone(); return this._selector.audit();
        });
    }

    /**
     * Capture the current view as native-size RGBA8. This diagnostic allocates a temporary render target
     * and reads pixels back; do not call every frame. Rows use the native WebGPU texture orientation.
     * @returns {Promise<{width:number,height:number,pixels:Uint8Array}>} Image pixels.
     */
    async capture() {
        return await this._diagnostic(async () => {
            const device = this._app.graphicsDevice, width = device.width, height = device.height;
            const texture = new pc.Texture(device, { name: 'splat-lod-capture', width, height, format: pc.PIXELFORMAT_RGBA8, mipmaps: false });
            const target = new pc.RenderTarget({ colorBuffer: texture, depth: true, samples: 1 });
            const previous = this._camera.camera.renderTarget;
            try {
                this._camera.camera.renderTarget = target; this._render();
                await device.wgpu.queue.onSubmittedWorkDone();
                return { width, height, pixels: await texture.read(0, 0, width, height, { immediate: true }) };
            } finally {
                this._camera.camera.renderTarget = previous; target.destroy(); texture.destroy();
            }
        });
    }

    /** Release resources and listeners. Idempotent; wait for an active diagnostic before disposing. */
    dispose() {
        if (this._disposed) return;
        if (this._busy) throw new Error('Wait for capture or audit before disposing');
        this.stop(); this._disposed = true;
        this._app.graphicsDevice.wgpu.removeEventListener('uncapturederror', this._gpuError);
        this._performance?.destroy(); this._frontEnd?.restore(); this._colors?.destroy();
        for (const asset of this._assets) {
            asset.unload(); this._app.assets.remove(asset);
        }
        this._app.destroy();
        this._frontEnd = null; this._selector = null; this._lod = null; this._colors = null;
        this._assets = null; this._data = null; this._camera = null; this._app = null;
    }
}

/**
 * Create a standalone, mono-perspective WebGPU Gaussian renderer. Loading is complete only after
 * the first correctly selected frame. No animation loop, controls, or resize listeners are installed.
 * All four banks remain resident. Source geometry is static and is already in world coordinates.
 *
 * @param {object} options - Renderer options; see the package's TypeScript declarations.
 * @param {HTMLCanvasElement} options.canvas - Canvas owned by this renderer until disposal.
 * @param {string|URL} options.manifestUrl - Completed cube manifest, relative to document.baseURI.
 * @param {object} options.camera - Perspective camera with position and target arrays.
 * @param {number} [options.lodMultiplier] - Larger values select lower detail sooner, not an FPS promise.
 * @param {object} [options.renderSettings] - Raster culling profile and visible or cached SH evaluation.
 * @param {boolean} [options.adaptiveLod] - Use measured benefit to choose LOD or the direct source path.
 * @param {AbortSignal} [options.signal] - Abort loading; partially created resources are released.
 * @param {Function} [options.onProgress] - Receives readable loading-stage messages.
 * @param {Function} [options.onError] - Receives asynchronous GPU/device-loss errors.
 * @returns {Promise<SplatRenderer>} A loaded renderer, initially stopped.
 */
export async function createSplatRenderer(options) {
    if (!options?.canvas || !options.manifestUrl) throw new TypeError('canvas and manifestUrl are required');
    const view = validateCamera({ up: [0, 1, 0], fovDegrees: 40, near: 0.01, far: 1000000, ...options.camera });
    const scale = lodScale(options.lodMultiplier ?? DEFAULT_LOD_MULTIPLIER);
    const settings = renderSettings(options.renderSettings);
    const adaptive = options.adaptiveLod ?? true;
    if (typeof adaptive !== 'boolean') throw new TypeError('adaptiveLod must be a boolean');
    const background = options.background ?? [0.07, 0.07, 0.07];
    if (background.length !== 3 || background.some(v => !Number.isFinite(v) || v < 0 || v > 1)) throw new RangeError('background must contain three values in [0,1]');
    const url = new URL(options.manifestUrl, document.baseURI);
    if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Serve the manifest over HTTP(S); file:// is not supported');
    options.signal?.throwIfAborted();
    options.onProgress?.('Validating cube ownership and metadata…');
    const data = await loadManifest(url, options.signal);
    if (data.manifest.sourceEuler?.some(v => v !== 0)) throw new Error('Preprocess the source in world coordinates; transformed banks are not supported');
    let renderer, app, device;
    const assets = [];
    try {
        device = await pc.createGraphicsDevice(options.canvas, { deviceTypes: [pc.DEVICETYPE_WEBGPU], antialias: false, alpha: false, powerPreference: 'high-performance' });
        if (!device.isWebGPU) throw new Error('WebGPU is required; this package has no WebGL fallback');
        app = new pc.Application(options.canvas, { graphicsDevice: device });
        app.autoRender = false;
        Object.assign(app.scene.gsplat, { renderer: pc.GSPLAT_RENDERER_RASTER_GPU_SORT, radialSorting: false, minPixelSize: settings.minPixelSize, minContribution: settings.minContribution, foveationStrength: 0, alphaClipForward: 1 / 255, colorUpdateAngle: settings.colorUpdateAngle });
        const camera = new pc.Entity('splat-lod-camera');
        camera.addComponent('camera', { clearColor: new pc.Color(...background, 1), fov: view.fovDegrees, nearClip: view.near, farClip: view.far, toneMapping: pc.TONEMAP_NONE });
        app.root.addChild(camera);
        renderer = new SplatRenderer(app, camera, data, assets, options.onError);
        renderer.setCamera(view);
        renderer.resize(options.canvas.clientWidth || options.canvas.width, options.canvas.clientHeight || options.canvas.height, options.pixelRatio ?? globalThis.devicePixelRatio ?? 1);
        const { manifest: m } = data;
        const definitions = [{ key: 'source', id: 'scene-lod-source', count: m.sourceCount, file: m.source, bytes: m.sourceBytes, sha256: m.sourceSha256 },
            ...m.levels.map(l => ({ ...l, key: `level${l.id}`, id: `scene-lod-level${l.id}`, count: l.splats }))];
        const banks = await definitions.reduce(async (previous, bank, i) => {
            const loaded = await previous;
            options.signal?.throwIfAborted();
            options.onProgress?.(`Loading Gaussian bank ${i + 1} of ${definitions.length}…`);
            const bankUrl = new URL(bank.file, url);
            if (!/\.(?:ply|sog)$/i.test(bankUrl.pathname)) throw new Error('Banks must be PLY files or SOG v2 bundles');
            const bytes = await checkedBytes(bankUrl, bank, options.signal);
            options.signal?.throwIfAborted();
            const asset = new pc.Asset(bank.id, 'gsplat', { url: bankUrl.href, contents: new Response(bytes) }, { reorder: false, decompress: true });
            assets.push(asset);
            const ready = new Promise((resolve, reject) => {
                asset.ready(() => {
                    asset.file.contents = null; resolve(asset);
                }); asset.once('error', error => reject(new Error(String(error))));
            });
            app.assets.add(asset); app.assets.load(asset); await ready;
            options.signal?.throwIfAborted();
            if (asset.resource.gsplatData.numSplats !== bank.count || asset.resource.gsplatData.shBands !== (m.shBands ?? 3)) throw new Error(`Incorrect splat count or SH degree: ${bank.key}`);
            const entity = new pc.Entity(bank.id);
            entity.addComponent('gsplat', { asset: asset.id, unified: true }); app.root.addChild(entity);
            loaded.push({ ...bank, entity, asset });
            return loaded;
        }, Promise.resolve([]));
        renderer._initialize(banks, scale, settings);
        options.onProgress?.('Initializing GPU selection and global depth sorting…');
        app.start(); cancelAnimationFrame(app.frameRequestId); app.frameRequestId = null;
        renderer.render(); await renderer.flush();
        renderer._install(adaptive); renderer.render(); await renderer.flush();
        options.signal?.throwIfAborted();
        renderer._assertActive();
        options.onProgress?.('Loaded');
        return renderer;
    } catch (error) {
        if (renderer) renderer.dispose();
        else if (app) app.destroy();
        else device?.destroy();
        throw error;
    }
}
