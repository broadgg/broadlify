import * as shell from 'node:child_process';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';

import * as esbuild from 'esbuild';

const SOURCE_DIRECTORY = path.join(__dirname, '../src');
const OUTPUT_DIRECTORY = path.join(__dirname, '../dist');

(async () => {
  await fs.rm(OUTPUT_DIRECTORY, {
    force: true,
    recursive: true,
  });

  const files = await fs.readdir(SOURCE_DIRECTORY);

  const functions = files.flatMap((filename) => {
    if (filename.endsWith('.ts')) {
      return [`${SOURCE_DIRECTORY}/${filename}`];
    }

    return [];
  });

  await esbuild.build({
    bundle: true,
    entryPoints: functions,
    format: 'cjs',
    minify: true,
    outdir: OUTPUT_DIRECTORY,
    platform: 'node',
    sourcemap: 'inline',
    target: 'node14',
  });

  shell.exec(`cd ${OUTPUT_DIRECTORY} && zip -Ar source *.js`);
})();
