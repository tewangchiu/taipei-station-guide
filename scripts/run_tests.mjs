#!/usr/bin/env node
import { lstatSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync, spawnSync } from 'node:child_process';
import { isAllowedRepositoryPath } from './lib/repository_policy.mjs';

export function discoverTests(root) {
  const files = [...new Set(execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z'], { cwd: root })
    .toString().split('\0').filter(name => /^tests\/.+\.test\.mjs$/.test(name)))];
  for (const name of files) {
    if (!isAllowedRepositoryPath(name)) throw new Error('A test source is outside the approved public paths. Run the repository check.');
    let current = root;
    for (const part of name.split('/')) {
      current = path.join(current, part);
      if (lstatSync(current).isSymbolicLink()) throw new Error('Test symlink is not supported.');
    }
    if (!lstatSync(current).isFile()) throw new Error('Expected a regular test source.');
  }
  if (!files.length) throw new Error('No test sources found');
  return files.sort();
}

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const files = discoverTests(root);
  console.log(`Running ${files.length} test source files; no private datasets are loaded by this runner.`);
  const result = spawnSync(process.execPath, ['--test', ...files], { cwd: root, stdio: 'inherit' });
  process.exitCode = result.status ?? 1;
}
