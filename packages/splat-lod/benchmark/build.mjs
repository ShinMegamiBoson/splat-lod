import { build } from 'esbuild';
await build({ entryPoints: ['runner.mjs'],
    bundle: true,
    format: 'esm',
    platform: 'browser',
    target: 'es2022',
    outfile: 'build/runner.js',
    external: ['/ours.js'],
    minify: true,
    define: { 'process.env.NODE_ENV': '"production"' } });
