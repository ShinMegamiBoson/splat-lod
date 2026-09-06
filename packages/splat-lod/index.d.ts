export type Vec3 = [number, number, number];
export type DisplayMode = 'automatic' | 'source' | 'lower-only';
export interface Camera {
    position: Vec3;
    target: Vec3;
    up: Vec3;
    fovDegrees: number;
    near: number;
    far: number;
}
export interface RendererOptions {
    canvas: HTMLCanvasElement;
    manifestUrl: string | URL;
    camera: Pick<Camera, 'position' | 'target'> & Partial<Camera>;
    /** Linear-to-the-native-engine clear RGB, in [0,1]; no tone mapping. */
    background?: Vec3;
    /** Default 2. LOD activates sooner; NOT a promised FPS speedup. */
    lodMultiplier?: number;
    /** Defaults to devicePixelRatio. Does not change canvas CSS size. */
    pixelRatio?: number;
    signal?: AbortSignal;
    onProgress?: (stage: string) => void;
    onError?: (error: Error) => void;
}
export interface SelectionStats {
    mode: DisplayMode;
    viewport: [number, number];
    selectionRevision: number;
    selectionCpuMs: number;
    pixelScale: number;
    chunksByLevel: number[];
    splatsByLevel: number[];
    activeSplats: number;
    coveredSourceSplats: number;
    culled: number;
    hiddenFull: number;
    maxLowerPixels: number;
    totalChunks: number;
}
export interface AuditResult {
    passed: boolean;
    decisionMismatches: number;
    mismatches: number;
    expectedCount: number;
    gpuSelectedCount: number;
    sourceSplatsSubmitted: number;
    mode: DisplayMode;
    stats: SelectionStats;
}
export interface RendererInfo {
    engine: { readonly version: string; readonly revision: string };
    backend: 'webgpu';
    shBands: 3;
    mode: DisplayMode;
    lodMultiplier: number;
    viewport: [number, number];
    sourceCount: number;
    residentCount: number;
    chunkCount: number;
    chunkColors: boolean;
    sourceHashVerified: boolean;
    globalDepthSort: true;
    camera: Camera;
}
export interface SplatRenderer {
    render(): void;
    flush(): Promise<void>;
    start(): void;
    stop(): void;
    setCamera(camera: Partial<Camera>): void;
    resize(width: number, height: number, pixelRatio?: number): void;
    setLodMultiplier(multiplier: number): void;
    setMode(mode: DisplayMode): void;
    setChunkColors(enabled: boolean): void;
    readStats(): Promise<SelectionStats | null>;
    getInfo(): RendererInfo;
    audit(): Promise<AuditResult>;
    capture(): Promise<{width: number; height: number; pixels: Uint8Array}>;
    dispose(): void;
}
export declare const ENGINE_BASE: Readonly<{version: string; revision: string}>;
export declare function createSplatRenderer(options: RendererOptions): Promise<SplatRenderer>;
