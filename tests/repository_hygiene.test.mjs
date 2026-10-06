import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { scanRepository } from '../scripts/check_repository_hygiene.mjs';
import { isAllowedRepositoryPath } from '../scripts/lib/repository_policy.mjs';

// Generate deliberately invalid examples only inside disposable repositories.
const sampleToken = () => ['gh', 'p', '_'].join('') + 'x'.repeat(36);
const sampleEmail = () => ['sample', 'example.invalid'].join('@');
const sampleMachinePath = () => ['', 'Users', 'sample', 'document'].join('/');
const noreply = () => ['sample', 'users.noreply.github.com'].join('@');
const scanner = fileURLToPath(new URL('../scripts/check_repository_hygiene.mjs', import.meta.url));
function git(root, args, extraEnv = {}) {
  try {
    return execFileSync('git', ['-C', root, ...args], {
      env: { ...process.env, GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: os.devNull,
        GIT_AUTHOR_NAME: 'Repository Test', GIT_COMMITTER_NAME: 'Repository Test',
        GIT_AUTHOR_EMAIL: noreply(), GIT_COMMITTER_EMAIL: noreply(), ...extraEnv },
      stdio: ['ignore', 'pipe', 'pipe'],
    }).toString();
  } catch { throw new Error('Temporary repository setup failed'); }
}
function write(root, name, content = '# Example\n') {
  mkdirSync(path.dirname(path.join(root, name)), { recursive: true });
  writeFileSync(path.join(root, name), content);
}
function repository(t) {
  const root = mkdtempSync(path.join(os.tmpdir(), 'repository-hygiene-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  git(root, ['init', '-q', '-b', 'main', '--template=']);
  git(root, ['config', 'commit.gpgsign', 'false']);
  git(root, ['config', 'core.excludesFile', os.devNull]);
  return root;
}
function commit(root, message = 'Test revision', extraEnv = {}) {
  git(root, ['add', '-A']);
  git(root, ['commit', '-q', '-m', message], extraEnv);
}
function has(result, kind, scope) {
  return result.findings.some(item => item.kind === kind && (!scope || item.scope === scope));
}
function assertNoValues(result, values) {
  const output = JSON.stringify(result);
  for (const value of values) assert.equal(output.includes(value), false, 'Matched values must not appear in findings');
}

test('allows only the approved governance and source path categories', () => {
  for (const name of [
    '.node-version', '.github/workflows/checks.yml', '.github/pull_request_template.md',
    'docs/spec-index.json', 'docs/adr/0001-development.md', 'docs/product/milestones.md',
    'docs/testing/release-gates.md', 'docs/testing/matrices/chg-foundation.md',
    'docs/roadmap/change-tracker.md', 'docs/research/camera-localization.md', 'docs/research/README.md',
    'docs/runbooks/local-preview.md', 'docs/exec-plans/active/chg-foundation.md',
    'docs/exec-plans/completed/chg-foundation.md', 'openspec/project.md',
    'openspec/specs/navigation/spec.md', 'openspec/specs/privacy/spec.md',
    'openspec/specs/route-data/spec.md', 'openspec/specs/visual-localization/spec.md',
    'openspec/changes/chg-foundation/proposal.md', 'openspec/changes/chg-foundation/design.md',
    'openspec/changes/chg-foundation/tasks.md', 'openspec/changes/chg-foundation/plan.md',
    'openspec/changes/chg-foundation/specs/privacy/spec.md',
    'openspec/changes/archive/2026-01-01-chg-example/tasks.md',
    'scripts/check_docs.mjs', 'scripts/run_checks.mjs', 'scripts/run_tests.mjs',
    'scripts/lib/repository_policy.mjs', 'tests/documentation_check.test.mjs',
    'tests/camera_route_contract.test.mjs', 'tests/camera_route_map.test.mjs',
  ]) assert.equal(isAllowedRepositoryPath(name), true, name);
  for (const name of [
    '.github/workflows/upload.yml', '.github/CODEOWNERS', 'docs/secret.md',
    'docs/research/raw.json', ['docs', 'research', 'private', 'note.md'].join('/'), 'docs/research/nested/note.md',
    'research/note.md', 'openspec/specs/extra/spec.md', 'openspec/changes/chg-example/data.json',
    'tests/fixtures/example.json', 'data/camera/route.json', ['src', 'private', 'example.mjs'].join('/'),
    'src/../README.md', 'src//app.mjs', 'scripts/extra.mjs', 'records/data.csv',
  ]) assert.equal(isAllowedRepositoryPath(name), false, name);
});

test('pre-stage coverage includes legal new docs and source without requiring a commit', t => {
  const root = repository(t);
  write(root, 'docs/research/camera-localization.md');
  write(root, '.github/workflows/checks.yml', 'name: checks\n');
  write(root, 'openspec/specs/privacy/spec.md');
  const result = scanRepository(root);
  assert.equal(result.status, 'pass');
  assert.equal(result.coverage.workingTree.untrackedEntries, 3);
  assert.equal(result.coverage.workingTree.filesChecked, 3);
  assert.equal(result.coverage.index.entries, 0);
  assert.equal(result.coverage.history.commitsChecked, 0);
});

test('rejects a non-allowlisted untracked document before staging', t => {
  const root = repository(t); write(root, 'docs/unknown.md');
  assert.equal(has(scanRepository(root), 'path_not_allowlisted', 'working_tree'), true);
});

test('detects a secret in an untracked allowlisted document without printing it', t => {
  const root = repository(t), secret = sampleToken(); write(root, 'docs/research/sample.md', secret);
  const result = scanRepository(root);
  assert.equal(has(result, 'github_token', 'working_tree'), true); assertNoValues(result, [secret]);
});

test('detects unstaged modifications while the index and committed version remain clean', t => {
  const root = repository(t); write(root, 'README.md'); commit(root);
  const secret = sampleToken(); write(root, 'README.md', secret);
  const result = scanRepository(root);
  assert.equal(has(result, 'github_token', 'working_tree'), true);
  assert.equal(has(result, 'github_token', 'index'), false);
  assert.equal(has(result, 'github_token', 'history'), false); assertNoValues(result, [secret]);
});

test('still inspects staged content after the working file is cleaned', t => {
  const root = repository(t), secret = sampleToken(); write(root, 'README.md', secret);
  git(root, ['add', 'README.md']); write(root, 'README.md');
  const result = scanRepository(root);
  assert.equal(has(result, 'github_token', 'index'), true);
  assert.equal(has(result, 'github_token', 'working_tree'), false); assertNoValues(result, [secret]);
});

test('never inspects ignored untracked private files', t => {
  const root = repository(t), secret = sampleToken();
  write(root, '.gitignore', 'private/\nrecords/\n');
  write(root, 'private/photo.json', secret); write(root, 'records/recording.csv', Buffer.from([255, 0]));
  const result = scanRepository(root);
  assert.equal(result.status, 'pass');
  assert.equal(result.coverage.workingTree.filesChecked, 1);
  assert.equal(result.coverage.workingTree.ignoredUntrackedInspected, false);
});

test('ignored paths that were force-staged remain checked and rejected', t => {
  const root = repository(t), secret = sampleToken(); write(root, '.gitignore', 'records/\n');
  write(root, 'records/recording.csv', secret); git(root, ['add', '-f', 'records/recording.csv']);
  const result = scanRepository(root);
  assert.equal(has(result, 'path_not_allowlisted', 'working_tree'), true);
  assert.equal(has(result, 'github_token', 'working_tree'), true);
  assert.equal(has(result, 'github_token', 'index'), true); assertNoValues(result, [secret]);
});

test('rejects binary and invalid UTF-8 content under approved text filenames', t => {
  const root = repository(t); write(root, 'README.md', Buffer.from([65, 0, 66]));
  write(root, 'SECURITY.md', Buffer.from([255, 254])); git(root, ['add', '-A']);
  const result = scanRepository(root);
  for (const scope of ['working_tree', 'index']) {
    assert.equal(has(result, 'binary_content', scope), true);
    assert.equal(has(result, 'non_text_file', scope), true);
  }
});

test('rejects oversized content instead of treating it as fully scanned', t => {
  const root = repository(t); write(root, 'README.md', 'a'.repeat(512 * 1024 + 1)); git(root, ['add', '-A']);
  const result = scanRepository(root);
  assert.equal(has(result, 'oversized_file', 'working_tree'), true);
  assert.equal(has(result, 'oversized_file', 'index'), true);
});

test('does not follow file symlinks into ignored private content', t => {
  const root = repository(t); write(root, '.gitignore', 'private/\n'); write(root, 'private/target.md', sampleToken());
  symlinkSync(path.join('private', 'target.md'), path.join(root, 'README.md')); git(root, ['add', 'README.md']);
  const result = scanRepository(root);
  assert.equal(has(result, 'symlink_or_submodule', 'working_tree'), true);
  assert.equal(has(result, 'symlink_or_submodule', 'index'), true);
  assert.equal(has(result, 'github_token'), false);
});

test('does not follow a replaced parent directory into ignored private content', t => {
  const root = repository(t); write(root, '.gitignore', 'private/\n'); write(root, 'src/app.mjs', 'export {};\n'); commit(root);
  rmSync(path.join(root, 'src'), { recursive: true }); write(root, 'private/app.mjs', sampleToken());
  symlinkSync('private', path.join(root, 'src'));
  const result = scanRepository(root);
  assert.equal(has(result, 'symlink_or_submodule', 'working_tree'), true);
  assert.equal(has(result, 'github_token'), false);
});

test('finds deleted historical secrets even when current tree and index are clean', t => {
  const root = repository(t), secret = sampleToken(); write(root, 'README.md', secret); commit(root);
  write(root, 'README.md'); commit(root);
  const result = scanRepository(root);
  assert.equal(result.coverage.history.commitsChecked, 2);
  assert.equal(has(result, 'github_token', 'history'), true);
  assert.equal(has(result, 'github_token', 'working_tree'), false);
  assert.equal(has(result, 'github_token', 'index'), false); assertNoValues(result, [secret]);
});

test('replacement refs cannot hide a secret in the original history', t => {
  const root = repository(t), secret = sampleToken(); write(root, 'README.md', secret); commit(root);
  const original = git(root, ['rev-parse', 'HEAD']).trim();
  write(root, 'README.md'); commit(root);
  const cleanTree = git(root, ['rev-parse', 'HEAD^{tree}']).trim();
  const replacement = git(root, ['commit-tree', cleanTree, '-m', 'Clean replacement']).trim();
  git(root, ['replace', original, replacement]);
  // First establish that ordinary Git really presents different historical content.
  assert.equal(git(root, ['show', `${original}:README.md`]).includes(secret), false);
  assert.equal(git(root, ['--no-replace-objects', 'show', `${original}:README.md`]).includes(secret), true);
  const result = scanRepository(root);
  assert.equal(result.coverage.history.replacementObjectsDisabled, true);
  assert.equal(has(result, 'github_token', 'history'), true); assertNoValues(result, [secret]);
});

test('legacy grafts stop inspection because no-replace alone does not disable graft traversal', t => {
  const root = repository(t), secret = sampleToken(); write(root, 'README.md', secret); commit(root);
  write(root, 'README.md'); commit(root);
  const head = git(root, ['rev-parse', 'HEAD']).trim();
  write(root, '.git/info/grafts', `${head}\n`);
  assert.equal(git(root, ['rev-list', '--count', 'HEAD']).trim(), '1');
  assert.equal(git(root, ['--no-replace-objects', 'rev-list', '--count', 'HEAD']).trim(), '1');
  const result = scanRepository(root);
  assert.equal(result.coverage.history.legacyGraftsDetected, true);
  assert.equal(result.coverage.history.complete, false);
  assert.equal(result.coverage.history.commitsChecked, 0);
  assert.equal(result.status, 'fail');
  assert.equal(has(result, 'legacy_grafts_not_allowed'), true);
  assertNoValues(result, [secret]);
});

test('checks an unreferenced detached HEAD revision as well as branch history', t => {
  const root = repository(t); write(root, 'README.md'); commit(root); git(root, ['checkout', '--detach', '-q']);
  write(root, 'README.md', sampleToken()); commit(root);
  const result = scanRepository(root);
  assert.equal(result.coverage.history.commitsChecked, 2);
  assert.equal(has(result, 'github_token', 'history'), true);
});

test('accepts regular and GitHub merge noreply commit identities', t => {
  const root = repository(t); write(root, 'README.md'); commit(root);
  write(root, 'SECURITY.md'); commit(root, 'Merge example', { GIT_AUTHOR_EMAIL: ['noreply', 'github.com'].join('@') });
  const result = scanRepository(root); assert.equal(result.status, 'pass'); assert.equal(result.reachableCommitsChecked, 2);
});

test('rejects personal author metadata and never includes the email value', t => {
  const root = repository(t), email = sampleEmail(); write(root, 'README.md');
  commit(root, 'Test revision', { GIT_AUTHOR_EMAIL: email });
  const result = scanRepository(root); assert.equal(has(result, 'commit_email_address'), true); assertNoValues(result, [email]);
});

test('lookalike domains do not qualify for the exact GitHub noreply exception', t => {
  for (const [local, domain] of [
    ['sample', ['users', 'noreply', 'github', 'com', 'example', 'invalid'].join('.')],
    ['noreply', ['github', 'com', 'example', 'invalid'].join('.')],
    ['sample', ['users.noreply.github', 'com-example.invalid'].join('.')],
  ]) {
    const root = repository(t), email = [local, domain].join('@'); write(root, 'README.md');
    commit(root, 'Test revision', { GIT_AUTHOR_EMAIL: email });
    const result = scanRepository(root);
    assert.equal(has(result, 'commit_email_address'), true); assertNoValues(result, [email]);
  }
});

test('the noreply exception cannot hide a token in commit metadata', t => {
  const root = repository(t), secret = sampleToken(); write(root, 'README.md');
  commit(root, 'Test revision', { GIT_AUTHOR_EMAIL: [secret, 'users.noreply.github.com'].join('@') });
  const result = scanRepository(root);
  assert.equal(has(result, 'commit_github_token'), true); assertNoValues(result, [secret]);
});

test('checks commit messages for machine paths without echoing them', t => {
  const root = repository(t), machinePath = sampleMachinePath(); write(root, 'README.md'); commit(root, machinePath);
  const result = scanRepository(root); assert.equal(has(result, 'commit_machine_path'), true); assertNoValues(result, [machinePath]);
});

test('checks annotated tag messages and tagger metadata', t => {
  const root = repository(t), secret = sampleToken(), email = sampleEmail(); write(root, 'README.md'); commit(root);
  git(root, ['tag', '-a', 'example', '-m', secret], { GIT_COMMITTER_EMAIL: email });
  const result = scanRepository(root);
  assert.equal(result.coverage.history.annotatedTagsChecked, 1);
  assert.equal(has(result, 'tag_github_token'), true); assert.equal(has(result, 'tag_email_address'), true);
  assertNoValues(result, [secret, email]);
});

test('checks nested annotated tags even if the inner tag ref was deleted', t => {
  const root = repository(t), secret = sampleToken(); write(root, 'README.md'); commit(root);
  git(root, ['tag', '-a', 'inner', '-m', secret]);
  git(root, ['tag', '-a', 'outer', 'inner', '-m', 'Nested example']); git(root, ['tag', '-d', 'inner']);
  const result = scanRepository(root);
  assert.equal(result.coverage.history.annotatedTagsChecked, 2);
  assert.equal(has(result, 'tag_github_token'), true); assertNoValues(result, [secret]);
});

test('a tab in a filename cannot bypass the index path allowlist', t => {
  const root = repository(t); write(root, 'README.md\tdata.json'); git(root, ['add', '-A']);
  const result = scanRepository(root);
  assert.equal(has(result, 'path_not_allowlisted', 'working_tree'), true);
  assert.equal(has(result, 'path_not_allowlisted', 'index'), true);
});

test('does not label a shallow clone as complete history coverage', t => {
  const source = repository(t); write(source, 'README.md'); commit(source); write(source, 'SECURITY.md'); commit(source);
  const parent = mkdtempSync(path.join(os.tmpdir(), 'repository-hygiene-shallow-'));
  t.after(() => rmSync(parent, { recursive: true, force: true }));
  const clone = path.join(parent, 'checkout');
  git(parent, ['clone', '-q', '--depth=1', new URL(`file://${source}`).href, clone]);
  const result = scanRepository(clone);
  assert.equal(result.coverage.history.shallow, true);
  assert.equal(has(result, 'incomplete_shallow_history'), true);
});

test('redacts sensitive values embedded in file names', t => {
  const root = repository(t), secret = sampleToken(); write(root, `src/${secret}.mjs`, 'export {};\n');
  const result = scanRepository(root); assert.equal(has(result, 'filename_github_token'), true); assertNoValues(result, [secret]);
});

test('all content rules operate in newly created docs and report no sample values', t => {
  const root = repository(t);
  const samples = [
    sampleMachinePath(), [192, 168, 1, 9].join('.'), ['-----BEGIN', 'PRIVATE KEY-----'].join(' '),
    sampleToken(), ['AK', 'IA'].join('') + 'A'.repeat(16), ['sk', '-'].join('') + 'b'.repeat(30),
    ['https:', '//', 'sample', ':', 'example', '@', 'example.invalid'].join(''),
    ['password', '= "', 'x'.repeat(25), '"'].join(''), sampleEmail(),
  ];
  write(root, 'docs/research/example.md', samples.join('\n'));
  const result = scanRepository(root);
  for (const kind of ['machine_path', 'private_network_address', 'private_key', 'github_token', 'aws_access_key', 'api_token', 'credential_in_url', 'credential_assignment', 'email_address']) {
    assert.equal(has(result, kind, 'working_tree'), true, kind);
  }
  assertNoValues(result, samples);
});

test('CLI uses its explicit root, returns nonzero, and does not print matched values', t => {
  const root = repository(t), secret = sampleToken(); write(root, 'README.md', secret);
  const result = spawnSync(process.execPath, [scanner, '--root', root], { encoding: 'utf8' });
  assert.equal(result.status, 1); assert.equal(result.stderr, ''); assert.equal(result.stdout.includes(secret), false);
  assert.equal(JSON.parse(result.stdout).status, 'fail');
});

test('CLI errors do not expose the requested root or subprocess details', t => {
  const root = repository(t), missing = path.join(root, 'missing');
  const result = spawnSync(process.execPath, [scanner, '--root', missing], { encoding: 'utf8' });
  assert.equal(result.status, 1); assert.equal(result.stderr, ''); assert.equal(result.stdout.includes(missing), false);
  assert.equal(has(JSON.parse(result.stdout), 'inspection_failed'), true);
});
