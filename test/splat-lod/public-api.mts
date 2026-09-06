import { createSplatRenderer, ENGINE_BASE, type SplatRenderer } from '../../packages/splat-lod/build/index.js';

async function useLibrary(canvas: HTMLCanvasElement): Promise<SplatRenderer> {
    const renderer = await createSplatRenderer({ canvas, manifestUrl: '/scene/manifest.json', camera: { position: [0, 1, 4], target: [0, 0, 0] }, lodMultiplier: 2, renderSettings: { profile: 'contribution', shMode: 'visible' } });
    renderer.resize(1280, 720, 2);
    renderer.setCamera({ position: [0, 2, 4] });
    renderer.setMode('automatic'); renderer.setChunkColors(false); renderer.start(); renderer.stop();
    renderer.render(); await renderer.flush();
    const stats = await renderer.readStats();
    const count: number | undefined = stats?.activeSplats;
    const verified: boolean = (await renderer.audit()).passed;
    const pixels: Uint8Array = (await renderer.capture()).pixels;
    console.log(ENGINE_BASE.version, count, verified, pixels.length, renderer.getInfo().camera);
    return renderer;
}
void useLibrary;
