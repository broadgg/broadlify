import * as shell from 'node:child_process';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';

import * as esbuild from 'esbuild';

const OUTPUT_DIRECTORY = path.join(__dirname, '../dist/source');
const SCRIPTS_DIRECTORY = __dirname;
const ROOT_DIRECTORY = path.join(__dirname, '../');
const ZIP_BUNDLE_ENTRIES = [
  'src',
  '.env',
  '.npmrc',
  'package.json',
  'uploads',
  '.platform',
  'extensions',
];

(async () => {
  await fs.rm(OUTPUT_DIRECTORY, {
    force: true,
    recursive: true,
  });

  const files = await fs.readdir(SCRIPTS_DIRECTORY);

  const functions = files.flatMap((filename) => {
    if (filename === 'build.ts') {
      return [];
    }

    if (filename.endsWith('.ts')) {
      return [`${SCRIPTS_DIRECTORY}/${filename}`];
    }

    return [];
  });

  await esbuild.build({
    bundle: true,
    entryPoints: functions,
    format: 'cjs',
    outdir: `${path.join(OUTPUT_DIRECTORY, 'scripts')}`,
    platform: 'node',
    sourcemap: 'inline',
    target: 'node14',
  });

  const commands = [
    `cd ${ROOT_DIRECTORY}`,
    `zip -Ar source ${ZIP_BUNDLE_ENTRIES.join(' ')}`,
    `mv source ${OUTPUT_DIRECTORY}`,
    `cd ${OUTPUT_DIRECTORY}`,
    `zip -Ar source scripts`,
  ];

  shell.exec(commands.join(' && '));
})();
