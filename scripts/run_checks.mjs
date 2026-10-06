#!/usr/bin/env node
import { execFileSync, spawnSync } from 'node:child_process';
import { lstatSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { isAllowedRepositoryPath } from './lib/repository_policy.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
if (Number(process.versions.node.split('.')[0]) !== 24) {
  console.error('Use Node.js 24, as specified in .node-version, before running the development gate.');
  process.exit(1);
}
const files = [...new Set(execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z'], { cwd: root }).toString().split('\0').filter(Boolean))];
const sources = files.filter(name => /^(src|scripts|tests)\/.+\.mjs$/.test(name));
for (const name of sources) {
  if (!isAllowedRepositoryPath(name)) throw new Error('Source path is outside the approved public categories. Run the repository check.');
  let current = root;
  for (const part of name.split('/')) {
    current = path.join(current, part);
    if (lstatSync(current).isSymbolicLink()) throw new Error('Source symlink is not supported.');
  }
  if (!lstatSync(path.join(root, name)).isFile()) throw new Error(`Expected regular source file: ${name}`);
  const result = spawnSync(process.execPath, ['--check', name], { cwd: root, stdio: 'inherit' });
  if (result.status !== 0) process.exit(result.status ?? 1);
}
console.log(`Syntax checked ${sources.length} JavaScript modules.`);
for (const script of ['run_tests', 'check_docs', 'check_repository_hygiene']) {
  console.log(`Checking ${script}.`);
  const result = spawnSync(process.execPath, [`scripts/${script}.mjs`], { cwd: root, stdio: 'inherit' });
  if (result.status !== 0) process.exit(result.status ?? 1);
}
console.log('Local development checks passed. Device, field and hosted CI results are separate.');
