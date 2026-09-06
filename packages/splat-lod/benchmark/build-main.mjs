import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ENGINE_BASE } from '../../../src/framework/splat-lod/engine-base.js';

const root = fileURLToPath(new URL('../../../', import.meta.url));
const env = { ...process.env, ENGINE_BUILD_REVISION: ENGINE_BASE.revision.slice(0, 9) };
for (const [script, args] of [['build.mjs', ['--type=min', '--format=esm']], ['packages/splat-lod/build.mjs', []], ['packages/splat-lod/benchmark/build.mjs', ['--main']]]) {
    const cwd = script.endsWith('benchmark/build.mjs') ? path.join(root, 'packages/splat-lod/benchmark') : root;
    const result = spawnSync(process.execPath, [path.join(root, script), ...args], { cwd, env, stdio: 'inherit' });
    if (result.error || result.status !== 0) throw result.error ?? new Error(`${script}: exit ${result.status}`);
}
