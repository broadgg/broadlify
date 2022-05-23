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
    `mkdir ${OUTPUT_DIRECTORY}`,
    `cd ${OUTPUT_DIRECTORY}`,
    `zip -Ar source.zip ${ZIP_BUNDLE_ENTRIES.map((entry) => `../${entry}`).join(
      ' ',
    )}`,
  ];

  shell.exec(commands.join(' && '));
})();
