#!/usr/bin/env node
// Inspect non-ignored working files, the full index, and reachable history.
// Findings contain locations/categories only, never matching values or Git stderr.
import { execFileSync } from 'node:child_process';
import { constants, closeSync, fstatSync, lstatSync, openSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { contentRules, isAllowedRepositoryPath } from './lib/repository_policy.mjs';

const defaultRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const maxBytes = 512 * 1024;
const splitLines = bytes => bytes.toString().trim().split('\n').filter(Boolean);
const splitNull = bytes => bytes.toString().split('\0').filter(Boolean);
const fingerprint = value => createHash('sha256').update(value).digest('hex').slice(0, 12);
function safeFile(name) {
  return contentRules.some(([, pattern]) => pattern.test(name))
    ? `[redacted-path:${fingerprint(name)}]` : name.replace(/[\u0000-\u001f\u007f]/g, '?');
}
function contentFindings(bytes) {
  if (bytes.length > maxBytes) return [{ kind: 'oversized_file' }];
  let text;
  try { text = new TextDecoder('utf-8', { fatal: true }).decode(bytes); }
  catch { return [{ kind: 'non_text_file' }]; }
  const found = bytes.includes(0) ? [{ kind: 'binary_content' }] : [];
  for (const [kind, pattern] of contentRules) {
    const match = pattern.exec(text);
    if (match) found.push({ kind, line: text.slice(0, match.index).split('\n').length });
  }
  return found;
}

export function scanRepository(root = defaultRoot) {
  root = path.resolve(root);
  const git = (...args) => execFileSync('git', ['--no-replace-objects', '-C', root, ...args], {
    maxBuffer: 32 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, GIT_NO_REPLACE_OBJECTS: '1' },
  });
  const findings = [], dedup = new Set(), blobCache = new Map(), fileVersions = new Set();
  const coverage = {
    workingTree: { trackedEntries: 0, untrackedEntries: 0, filesChecked: 0, missingEntries: 0, ignoredUntrackedInspected: false },
    index: { entries: 0, filesChecked: 0 },
    history: { commitsChecked: 0, annotatedTagsChecked: 0, fileEntriesChecked: 0, shallow: false, complete: false,
      replacementObjectsDisabled: true, legacyGraftsDetected: false },
  };
  function report(location, problem, version = '') {
    const finding = { ...location, ...problem };
    if (finding.file) finding.file = safeFile(finding.file);
    const key = JSON.stringify([finding.scope, finding.file, finding.kind, finding.line, version]);
    if (!dedup.has(key)) { dedup.add(key); findings.push(finding); }
  }
  function inspectPath(name, location) {
    if (!isAllowedRepositoryPath(name)) report(location, { kind: 'path_not_allowlisted' });
    for (const [kind, pattern] of contentRules) if (pattern.test(name)) report(location, { kind: `filename_${kind}` });
  }
  function inspectObject(name, oid, mode, location) {
    inspectPath(name, location);
    fileVersions.add(`${name}:${oid}:${mode}`);
    if (!['100644', '100755'].includes(mode)) { report(location, { kind: 'symlink_or_submodule' }, oid); return; }
    if (!blobCache.has(oid)) {
      const size = Number(git('cat-file', '-s', oid).toString());
      blobCache.set(oid, size > maxBytes ? [{ kind: 'oversized_file' }] : contentFindings(git('cat-file', 'blob', oid)));
    }
    for (const problem of blobCache.get(oid)) report(location, problem, oid);
  }
  function inspectWorkingFile(name) {
    const location = { scope: 'working_tree', file: name };
    inspectPath(name, location);
    const parts = name.split('/');
    if (path.isAbsolute(name) || parts.some(part => !part || part === '.' || part === '..')) return;
    let fd;
    try {
      // Do not follow either a file symlink or a symlinked parent into private data.
      for (let i = 1; i <= parts.length; i++) {
        const stat = lstatSync(path.join(root, ...parts.slice(0, i)));
        if (stat.isSymbolicLink()) { report(location, { kind: 'symlink_or_submodule' }); return; }
        if (i < parts.length && !stat.isDirectory()) { report(location, { kind: 'unsupported_file_type' }); return; }
      }
      fd = openSync(path.join(root, name), constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
      const stat = fstatSync(fd);
      if (!stat.isFile()) { report(location, { kind: 'unsupported_file_type' }); return; }
      coverage.workingTree.filesChecked += 1;
      const problems = stat.size > maxBytes ? [{ kind: 'oversized_file' }] : contentFindings(readFileSync(fd));
      for (const problem of problems) report(location, problem);
    } catch (error) {
      if (error.code === 'ENOENT') coverage.workingTree.missingEntries += 1;
      else report(location, { kind: 'working_file_unreadable' });
    } finally { if (fd !== undefined) closeSync(fd); }
  }
  function checkMetadata(kind, oid) {
    const text = git('cat-file', kind, oid).toString();
    for (const [rule, pattern] of contentRules) {
      // The noreply exception applies only to email matching, never other rules.
      const candidate = rule === 'email_address' ? text.replace(new RegExp(pattern.source, 'g'), email => {
        const normalized = email.toLowerCase();
        const domain = normalized.slice(normalized.lastIndexOf('@') + 1);
        return domain === 'users.noreply.github.com' || normalized === ['noreply', 'github.com'].join('@')
          ? '<github-noreply>' : email;
      }) : text;
      if (pattern.test(candidate)) report({ scope: 'history', where: oid.slice(0, 12) }, { kind: `${kind}_${rule}` }, oid);
    }
  }
  try {
    if (git('rev-parse', '--show-prefix').toString().trim()) throw new Error('Root must be repository root');
    const graftPath = path.resolve(root, git('rev-parse', '--git-path', 'info/grafts').toString().trim());
    try { lstatSync(graftPath); coverage.history.legacyGraftsDetected = true; }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
    if (coverage.history.legacyGraftsDetected || process.env.GIT_GRAFT_FILE) {
      report({ scope: 'history' }, { kind: 'legacy_grafts_not_allowed' });
      // Git's no-replace option does not disable legacy graft traversal.
      // Do not describe the rewritten graph as complete history coverage.
      return finish();
    }
    coverage.history.shallow = git('rev-parse', '--is-shallow-repository').toString().trim() === 'true';
    if (coverage.history.shallow) report({ scope: 'history' }, { kind: 'incomplete_shallow_history' });
    const tracked = new Set(splitNull(git('ls-files', '--cached', '-z')));
    const untracked = new Set(splitNull(git('ls-files', '--others', '--exclude-standard', '-z')));
    coverage.workingTree.trackedEntries = tracked.size;
    coverage.workingTree.untrackedEntries = untracked.size;
    for (const name of new Set([...tracked, ...untracked])) inspectWorkingFile(name);

    const staged = splitNull(git('ls-files', '--stage', '-z'));
    coverage.index.entries = staged.length;
    for (const entry of staged) {
      const separator = entry.indexOf('\t'), meta = entry.slice(0, separator), name = entry.slice(separator + 1);
      const [mode, oid, stage] = meta.split(' '), location = { scope: 'index', file: name };
      if (stage !== '0') report(location, { kind: 'unmerged_index' });
      else { coverage.index.filesChecked += 1; inspectObject(name, oid, mode, location); }
    }
    let hasHead = false;
    try { git('rev-parse', '--verify', 'HEAD'); hasHead = true; } catch { /* New repository has no HEAD. */ }
    const commits = splitLines(git('rev-list', '--all', ...(hasHead ? ['HEAD'] : [])));
    coverage.history.commitsChecked = commits.length;
    for (const commit of commits) {
      checkMetadata('commit', commit);
      for (const entry of splitNull(git('ls-tree', '-rz', '--full-tree', commit))) {
        const separator = entry.indexOf('\t'), meta = entry.slice(0, separator), name = entry.slice(separator + 1);
        const [mode, , oid] = meta.split(' ');
        coverage.history.fileEntriesChecked += 1;
        inspectObject(name, oid, mode, { scope: 'history', file: name, where: commit.slice(0, 12) });
      }
    }
    const seenTags = new Set();
    function inspectTag(oid) {
      if (seenTags.has(oid)) return;
      seenTags.add(oid); coverage.history.annotatedTagsChecked += 1; checkMetadata('tag', oid);
      const body = git('cat-file', 'tag', oid).toString();
      const target = /^object ([a-f0-9]{40,64})$/m.exec(body)?.[1];
      const type = target && git('cat-file', '-t', target).toString().trim();
      if (type === 'tag') inspectTag(target);
      else if (type !== 'commit') report({ scope: 'history', where: oid.slice(0, 12) }, { kind: 'unsupported_tag_target' }, oid);
    }
    for (const tag of splitLines(git('for-each-ref', '--format=%(objecttype) %(objectname)', 'refs/tags'))) {
      const [type, oid] = tag.split(' '); if (type === 'tag') inspectTag(oid);
      else if (type !== 'commit') report({ scope: 'history', where: oid.slice(0, 12) }, { kind: 'unsupported_tag_target' }, oid);
    }
    coverage.history.complete = !coverage.history.shallow;
  } catch {
    // Git/OS exceptions can include absolute paths and sensitive command output.
    report({ scope: 'inspection' }, { kind: 'inspection_failed' });
  }
  return finish();
  function finish() {
    return {
      status: findings.length ? 'fail' : 'pass', coverage,
      trackedEntries: coverage.index.entries, uniqueFileVersionsChecked: fileVersions.size,
      reachableCommitsChecked: coverage.history.commitsChecked, findings,
      scope: 'Non-ignored working files, full index (including ignored tracked files), reachable commits including HEAD, and annotated tags. Ignored untracked files are not inspected. Pattern checks do not prove absence of all secrets or vulnerabilities.',
    };
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const valid = args.length === 0 || (args.length === 2 && args[0] === '--root' && args[1]);
  const result = valid ? scanRepository(args[1] ?? defaultRoot) : { status: 'fail', findings: [{ kind: 'invalid_arguments' }] };
  console.log(JSON.stringify(result, null, 2));
  process.exitCode = result.status === 'pass' ? 0 : 1;
}
