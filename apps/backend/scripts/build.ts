import * as shell from 'node:child_process';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';

const ROOT_DIRECTORY = path.join(__dirname, '../');
const OUTPUT_DIRECTORY = path.join(__dirname, '../dist');

(async () => {
  await fs.rm(OUTPUT_DIRECTORY, {
    force: true,
    recursive: true,
  });

  const commands = [
    `cd ${ROOT_DIRECTORY}`,
    'zip -Ar source ./',
    'mkdir -p dist/source',
    `mv source dist/source`,
  ];

  shell.exec(commands.join(' && '));
})();
