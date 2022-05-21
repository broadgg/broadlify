import * as shell from 'node:child_process';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';

import * as esbuild from 'esbuild';

const FUNCTIONS_DIRECTORY = path.join(__dirname, '../src/functions');
const OUTPUT_DIRECTORY = path.join(__dirname, '../dist');

(async () => {
  await fs.rm(OUTPUT_DIRECTORY, {
    force: true,
    recursive: true,
  });

  const files = await fs.readdir(FUNCTIONS_DIRECTORY);

  const functions = files.flatMap((filename) => {
    if (filename.endsWith('.ts')) {
      return [`${FUNCTIONS_DIRECTORY}/${filename}`];
    }

    return [];
  });

  await esbuild.build({
    bundle: true,
    entryPoints: functions,
    format: 'cjs',
    outdir: OUTPUT_DIRECTORY,
    platform: 'node',
    sourcemap: 'inline',
    target: 'node14',
  });

  const commands = [
    `cd ${OUTPUT_DIRECTORY}`,
    'mkdir source',
    'cd source',
    'zip -Ar source ../*.js',
  ];

  shell.exec(commands.join(' && '));
})();
