import { copyFile, mkdir, readdir, rename } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { ENGINE_BASE } from '../../src/framework/splat-lod/engine-base.js';

// Reuse the upstream release transforms, including shader normalization and debug stripping.
const root = fileURLToPath(new URL('../../', import.meta.url));
process.chdir(root);
// Match the benchmarked engine build even when packaging after a docs-only commit.
process.env.ENGINE_BUILD_REVISION ??= ENGINE_BASE.revision.slice(0, 9);
const { buildTarget } = await import('../../utils/esbuild-build-target.mjs');
const dir = 'packages/splat-lod/build';
await buildTarget({ moduleFormat: 'esm', buildType: 'min', input: `${root}src/framework/splat-lod/index.js`, dir: `${root}${dir}`, preserveModules: false });
await rename(`${dir}/playcanvas.min.mjs`, `${dir}/index.js`);
await copyFile('packages/splat-lod/index.d.ts', `${dir}/index.d.ts`);
await copyFile('LICENSE', 'packages/splat-lod/LICENSE');
await mkdir(`${dir}/tools`, { recursive: true });
await Promise.all((await readdir('scripts/splat-lod'))
.filter(name => name.endsWith('.py') || name === 'requirements.txt')
.map(name => copyFile(`scripts/splat-lod/${name}`, `${dir}/tools/${name}`)));
await copyFile('src/framework/splat-lod/cube-policy-defaults.json', `${dir}/tools/cube-policy-defaults.json`);
console.log(`Built standalone ESM bundle and preprocessing tools in ${dir}`);
