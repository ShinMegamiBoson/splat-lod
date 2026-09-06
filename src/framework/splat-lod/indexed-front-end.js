// Extracted from the benchmarked cube-LOD renderer; see packages/splat-lod/CHANGES.md.
import { StorageBuffer } from '../../platform/graphics/storage-buffer.js';
import {
    BUFFERUSAGE_COPY_DST,
    BUFFERUSAGE_COPY_SRC
} from '../../platform/graphics/constants.js';


function singleHybridRenderer(app) {
    const renderers = [];
    app.renderer.gsplatDirector?.camerasMap.forEach((cameraData) => {
        cameraData.layersMap.forEach((layerData) => {
            const renderer = layerData.gsplatManager?.renderer;
            if (renderer) renderers.push(renderer);
        });
    });
    if (renderers.length !== 1) {
        throw new Error(`Expected one GPU-sort renderer for adaptive LOD; found ${renderers.length}`);
    }
    return renderers[0];
}

function ensureGpuSelectionBuffers(compaction, sourceCount) {
    compaction._ensureCapacity(1, sourceCount);
    if (
        compaction.countBuffer.byteSize < 2 * Uint32Array.BYTES_PER_ELEMENT ||
        (compaction.countBuffer.bufferUsage & (BUFFERUSAGE_COPY_DST | BUFFERUSAGE_COPY_SRC)) !== (BUFFERUSAGE_COPY_DST | BUFFERUSAGE_COPY_SRC)
    ) {
        compaction.countBuffer.destroy();
        compaction.countBuffer = new StorageBuffer(
            compaction.device,
            2 * Uint32Array.BYTES_PER_ELEMENT,
            BUFFERUSAGE_COPY_DST | BUFFERUSAGE_COPY_SRC
        );
        compaction.allocatedCountBufferSize = 2;
        compaction.prefixSumKernel.destroyPasses();
    }
}

function projectorCompute(projector, parameters) {
    const fisheyeMode = Boolean(parameters.fisheyeProj?.enabled);
    const stereoMode = Boolean(parameters.isStereo) &&
        !parameters.pickMode &&
        !fisheyeMode;
    const antiAliasMode = Boolean(parameters.antiAlias) && !parameters.pickMode;
    projector._updateMaterial(parameters.material, parameters.userCacheWords || 0);
    return projector._getProjectorCompute(
        parameters.workBuffer,
        parameters.radialSort,
        Boolean(parameters.pickMode),
        fisheyeMode,
        antiAliasMode,
        stereoMode
    );
}

export function installAdaptiveIndexedLodFrontEnd(app, dynamicLod, { createSelector, installProjection = null } = {}) {
    const renderer = singleHybridRenderer(app);
    renderer._ensureGpuPipeline();
    const compaction = renderer.intervalCompaction;
    const projector = renderer.projector;
    if (!compaction || !projector) {
        throw new Error('Adaptive LOD requires the PlayCanvas GPU projector');
    }

    const sourceCount = dynamicLod.gpuHierarchy.sourceCount;
    const selector = createSelector({
        device: app.graphicsDevice,
        dynamicLod
    });
    let currentFrame = null;
    const originalSortAndProject = renderer.sortAndProjectForCamera.bind(renderer);
    const originalUploadIntervals = compaction.uploadIntervals.bind(compaction);
    const originalDispatchCompact = compaction.dispatchCompact.bind(compaction);
    const originalProjectorDispatch = projector.dispatch.bind(projector);

    compaction.uploadIntervals = function uploadIntervals() {
        ensureGpuSelectionBuffers(this, selector.idCapacity ?? sourceCount);
    };

    compaction.dispatchCompact = function dispatchCompact(
        _frustumCuller,
        numIntervals,
        totalActiveSplats
    ) {
        if (!currentFrame || numIntervals !== 1 || totalActiveSplats !== sourceCount) {
            throw new Error('GPU adaptive LOD received a stale render frame');
        }
        const prepare = dynamicLod.directSource ? selector.prepareDirect : selector.prepare;
        prepare({
            ...currentFrame,
            selectedIds: this.compactedSplatIds,
            selectedCount: this.countBuffer
        });
    };

    projector.dispatch = function dispatch(parameters) {
        const compute = projectorCompute(this, parameters);
        const originalSetupDispatch = compute.setupDispatch;
        compute.setupDispatch = function setupDispatch() {
            if (renderer.indirectDispatchSlot < 0) {
                throw new Error('GPU adaptive LOD projector has no indirect dispatch slot');
            }
            this.setupIndirectDispatch(renderer.indirectDispatchSlot);
        };
        try {
            return originalProjectorDispatch(parameters);
        } finally {
            compute.setupDispatch = originalSetupDispatch;
        }
    };

    // A range projector bypasses ID expansion but keeps the same native
    // projection/sort/raster contract. Other hierarchy experiments are unchanged.
    const projection = installProjection?.({ app, renderer, projector, selector, dynamicLod, dispatch: originalProjectorDispatch });

    renderer.sortAndProjectForCamera = function sortAndProjectForCamera(
        world,
        worldState,
        cameraNode,
        viewportWidth,
        viewportHeight,
        ...parameters
    ) {
        currentFrame = Object.freeze({
            cameraNode,
            viewportWidth,
            viewportHeight,
            layout: dynamicLod.resolveWorldLayout(worldState)
        });
        const originalActiveSplats = worldState.totalActiveSplats;
        const originalIntervals = worldState.totalIntervals;
        worldState.totalActiveSplats = sourceCount;
        worldState.totalIntervals = 1;
        try {
            return originalSortAndProject(
                world,
                worldState,
                cameraNode,
                viewportWidth,
                viewportHeight,
                ...parameters
            );
        } finally {
            worldState.totalActiveSplats = originalActiveSplats;
            worldState.totalIntervals = originalIntervals;
            currentFrame = null;
        }
    };

    dynamicLod.enableGpuSelection(selector);
    return Object.freeze({
        name: 'gpu-resident-hierarchical-cut',
        removesIntervalScatter: true,
        projectorPass: 'GSplatProjectorIndirect',
        selectionBackend: 'gpu',
        synchronousReadback: false,
        selectedIdUpload: false,
        selectedRunUpload: false,
        sourceOrderGpuLookup: true,
        gpuHierarchySelection: true,
        gpuIdExpansion: !selector.ranges,
        projection: projection?.describe,
        gpuIndirectProjection: true,
        residentRecordsProjected: false,
        installed: 1,
        readStats: selector.readStats,
        describeDispatch: selector.describeDispatch,
        restore() {
            projection?.restore();
            renderer.sortAndProjectForCamera = originalSortAndProject;
            compaction.uploadIntervals = originalUploadIntervals;
            compaction.dispatchCompact = originalDispatchCompact;
            projector.dispatch = originalProjectorDispatch;
            selector.destroy();
        }
    });
}
