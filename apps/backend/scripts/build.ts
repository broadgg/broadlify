import * as shell from 'node:child_process';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';

const OUTPUT_DIRECTORY = path.join(__dirname, '../dist');
const ZIP_BUNDLE_ENTRIES = ['src', '.env', '.npmrc', 'package.json'];

(async () => {
  await fs.rm(OUTPUT_DIRECTORY, {
    force: true,
    recursive: true,
  });

  const commands = [
    `cd ${OUTPUT_DIRECTORY}`,
    'mkdir source',
    'cd source',
    `zip -Ar source ${ZIP_BUNDLE_ENTRIES.map((entry) =>
      path.join(__dirname, `../${entry}`),
    ).join(' ')}`,
  ];

  shell.exec(commands.join(' && '));
})();
