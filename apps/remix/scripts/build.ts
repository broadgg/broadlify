import * as path from 'node:path';

import * as remix from '@remix-run/dev/cli/commands';
import * as esbuild from 'esbuild';

const ROOT_DIRECTORY = path.join(__dirname, '..');
const OUTPUT_DIRECTORY = path.join(__dirname, '../build');
const ENTRY_FILE = path.join(OUTPUT_DIRECTORY, 'index.js');

(async () => {
  await remix.build(ROOT_DIRECTORY, process.env.NODE_ENV);
  await esbuild.build({
    allowOverwrite: true,
    bundle: true,
    entryPoints: [ENTRY_FILE],
    outdir: OUTPUT_DIRECTORY,
    platform: 'node',
    sourcemap: 'inline',
    target: 'node14',
  });
})();
