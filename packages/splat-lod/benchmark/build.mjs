import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
const main = process.argv.includes('--main');
await build({ entryPoints: ['runner.mjs'],
    bundle: true,
    format: 'esm',
    platform: 'browser',
    target: 'es2022',
    outfile: main ? 'build/main-runner.js' : 'build/runner.js',
    ...(main ? { alias: { 'playcanvas/build/playcanvas.min.mjs': fileURLToPath(new URL('../../../build/playcanvas.min.mjs', import.meta.url)) } } : {}),
    external: ['/ours.js'],
    minify: true,
    define: { 'process.env.NODE_ENV': '"production"' } });
