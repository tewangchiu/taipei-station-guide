#!/usr/bin/env node
// Read index and every reachable commit. Report locations/types, never matched values.
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const git = (...args) => execFileSync('git', ['-C', root, ...args], { maxBuffer: 32 * 1024 * 1024 });
const named = new Set([
  '.gitignore', '.githooks/pre-push', 'AGENTS.md', 'README.md', 'SECURITY.md',
  'package.json', 'package-lock.json',
  'scripts/check_repository_hygiene.mjs', 'scripts/serve_camera_guidance.mjs',
  'scripts/serve_manual_visual.mjs', 'scripts/prepare_camera_prototype.mjs',
  'docs/index.md', 'docs/PRODUCT_SPEC.md', 'docs/LOCAL_ASSETS.md',
]);
const rules = [
  ['machine_path', /\/(?:Users|Volumes|home|private)\/[^\s"'`<>]+|[A-Za-z]:\\(?:Users|Documents and Settings)\\/i],
  ['private_network_address', /\b(?:192\.168\.\d{1,3}\.\d{1,3}|10\.\d{1,3}\.\d{1,3}\.\d{1,3}|172\.(?:1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3})\b/],
  ['private_key', /-----BEGIN (?:RSA |EC |OPENSSH |DSA |ENCRYPTED )?PRIVATE KEY-----/],
  ['github_token', /\b(?:gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{30,})\b/],
  ['aws_access_key', /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/],
  ['api_token', /\b(?:sk-(?:proj-|svcacct-)?[A-Za-z0-9_-]{24,}|xox[baprs]-[A-Za-z0-9-]{20,}|AIza[A-Za-z0-9_-]{30,})\b/],
  ['credential_in_url', /https?:\/\/[^\s\/@:]+:[^\s\/@]+@/i],
  ['credential_assignment', /(?:api[_-]?key|client[_-]?secret|access[_-]?token|password)\s*[=:]\s*["'][A-Za-z0-9_+\/=.-]{24,}["']/i],
  ['email_address', /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/],
];
const findings = [], seen = new Set();
let files = 0;
function check(name, oid, mode, where) {
  const key = `${name}:${oid}:${mode}`;
  if (seen.has(key)) return; seen.add(key); files += 1;
  const allowed = named.has(name)
    || /^src\/[a-z0-9_/.-]+\.(?:mjs|css|html)$/.test(name)
    || /^docs\/contracts\/[a-z0-9_-]+\.schema\.json$/.test(name)
    || /^data\/(?:mvp|visual_localization)\/[a-z0-9_.-]+\.schema\.json$/.test(name)
    || /^tests\/(?:unit\/)?(?:visual_localization\/)?[a-z0-9_]+\.test\.mjs$/.test(name);
  const denied = /(?:^|\/)(?:raw_data|artifacts|reports|records|fixtures|node_modules|private|local|\.ssh|\.aws|\.codex|\.agents)(?:\/|$)/.test(name);
  if (!allowed || denied) findings.push({ file: name, where, kind: 'path_not_allowlisted' });
  if (!['100644', '100755'].includes(mode)) { findings.push({ file: name, where, kind: 'symlink_or_submodule' }); return; }
  const bytes = git('cat-file', 'blob', oid);
  if (bytes.length > 512 * 1024) { findings.push({ file: name, where, kind: 'oversized_file' }); return; }
  let text;
  try { text = new TextDecoder('utf-8', { fatal: true }).decode(bytes); }
  catch { findings.push({ file: name, where, kind: 'non_text_file' }); return; }
  if (bytes.includes(0)) findings.push({ file: name, where, kind: 'binary_content' });
  for (const [kind, pattern] of rules) {
    const match = pattern.exec(text);
    if (match) findings.push({ file: name, where, kind, line: text.slice(0, match.index).split('\n').length });
  }
}
const staged = git('ls-files', '--stage', '-z').toString().split('\0').filter(Boolean);
for (const entry of staged) {
  const [meta, name] = entry.split('\t'), [mode, oid, stage] = meta.split(' ');
  if (stage !== '0') findings.push({ file: name, kind: 'unmerged_index' });
  else check(name, oid, mode, 'index');
}
const commits = git('rev-list', '--all').toString().trim().split('\n').filter(Boolean);
function checkMetadata(kind, oid) {
  const text = git('cat-file', kind, oid).toString()
    .replace(/\b[A-Za-z0-9._%+-]+@users\.noreply\.github\.com\b/g, '<github-noreply>')
    .replace(/\bnoreply@github\.com\b/g, '<github-noreply>');
  for (const [rule, pattern] of rules) if (pattern.test(text)) findings.push({ where: oid.slice(0, 12), kind: `${kind}_${rule}` });
}
for (const commit of commits) {
  checkMetadata('commit', commit);
  for (const entry of git('ls-tree', '-rz', '--full-tree', commit).toString().split('\0').filter(Boolean)) {
    const [meta, name] = entry.split('\t'), [mode, , oid] = meta.split(' ');
    check(name, oid, mode, commit.slice(0, 12));
  }
}
const tags = git('for-each-ref', '--format=%(objecttype) %(objectname)', 'refs/tags').toString().trim().split('\n').filter(Boolean);
for (const tag of tags) { const [type, oid] = tag.split(' '); if (type === 'tag') checkMetadata('tag', oid); }
console.log(JSON.stringify({ status: findings.length ? 'fail' : 'pass', trackedEntries: staged.length,
  uniqueFileVersionsChecked: files, reachableCommitsChecked: commits.length, findings,
  scope: 'Allowlisted tracked content and reachable history; pattern checks do not prove absence of all secrets or vulnerabilities' }, null, 2));
process.exitCode = findings.length ? 1 : 0;
