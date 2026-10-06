import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { checkDocumentation } from '../scripts/check_docs.mjs';
import { discoverTests } from '../scripts/run_tests.mjs';

function project(t) {
  const root = mkdtempSync(path.join(tmpdir(), 'station-doc-check-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  execFileSync('git', ['init', '-q', root]);
  const put = (name, text) => {
    mkdirSync(path.dirname(path.join(root, name)), { recursive: true });
    writeFileSync(path.join(root, name), text);
  };
  const spec = 'openspec/specs/navigation/spec.md';
  put('docs/index.md', '# Entry\n\n[Spec](../openspec/specs/navigation/spec.md)\n');
  put(spec, '### Requirement: NAV-01\n\nExample requirement.\n');
  put('tests/example.test.mjs', 'export const synthetic = true;\n');
  const index = {
    schemaVersion: 1, project: { id: 'synthetic', scope: 'documentation-check' },
    documents: ['docs/index.md', 'docs/spec-index.json', spec].map((file, n) => ({
      id: `doc-${n}`, path: file, kind: 'canonical', status: 'current', owner: 'maintainer', updated: '2026-10-06', scope: 'synthetic',
    })),
    requirements: [{ id: 'NAV-01', spec, checks: [{ path: 'tests/example.test.mjs', tier: 'unit', status: 'pending', note: 'Synthetic check only.' }] }],
    changes: [],
  };
  const save = () => put('docs/spec-index.json', JSON.stringify(index));
  save();
  return { root, put, index, save, spec };
}
const has = (result, kind) => result.errors.some(error => error.kind === kind);

test('documentation gate accepts an indexed synthetic project without upgrading pending evidence', t => {
  const { root } = project(t);
  const result = checkDocumentation(root);
  assert.equal(result.status, 'pass');
  assert.equal(result.pendingByTier.unit, 1);
});

test('documentation gate rejects missing links and documents absent from the registry', t => {
  const { root, put } = project(t);
  put('docs/research/note.md', '[Missing](absent.md)\n');
  const result = checkDocumentation(root);
  assert.ok(has(result, 'document_not_indexed'));
  assert.ok(has(result, 'missing_or_private_link'));
});

test('documentation gate accepts public directory links but rejects escaping the repository', t => {
  const p = project(t);
  p.put('docs/index.md', '[Domain](../openspec/specs/navigation/)\n');
  assert.equal(checkDocumentation(p.root).status, 'pass');
  p.put('docs/index.md', '[Escape](../../outside/)\n');
  assert.ok(has(checkDocumentation(p.root), 'missing_or_private_link'));
});

test('documentation gate rejects duplicate IDs, missing owners and nonexistent evidence', t => {
  const p = project(t);
  p.index.documents[1].id = p.index.documents[0].id;
  delete p.index.documents[0].owner;
  p.index.requirements[0].checks[0].path = 'tests/missing.test.mjs';
  p.save();
  const result = checkDocumentation(p.root);
  for (const kind of ['duplicate_document_id', 'missing_metadata', 'invalid_check_mapping']) assert.ok(has(result, kind));
});

test('documentation gate catches undeclared, duplicate and unindexed requirements', t => {
  const p = project(t);
  p.put(p.spec, '### Requirement: NAV-01\n### Requirement: NAV-01\n### Requirement: NAV-02\n');
  p.index.requirements[0].id = 'NAV-03';
  p.save();
  const result = checkDocumentation(p.root);
  for (const kind of ['duplicate_requirement', 'requirement_not_indexed', 'requirement_declaration_mismatch']) assert.ok(has(result, kind));
});

test('documentation gate rejects incomplete acceptance mappings and invalid change references', t => {
  const p = project(t);
  p.index.requirements[0].checks = [];
  p.index.changes = [{ id: 'chg-2026-10-example', status: 'in-progress', path: 'missing.md', requirements: ['NAV-99'] }];
  p.save();
  const result = checkDocumentation(p.root);
  for (const kind of ['missing_acceptance_mapping', 'invalid_change_document', 'invalid_change_requirements']) assert.ok(has(result, kind));
});

test('documentation gate rejects an orphan requirement with a missing or noncanonical spec', t => {
  const p = project(t);
  const orphan = { id: 'NAV-99', checks: structuredClone(p.index.requirements[0].checks) };
  p.index.requirements.push(orphan);
  p.save();
  assert.ok(has(checkDocumentation(p.root), 'requirement_declaration_mismatch'));
  orphan.spec = 'docs/index.md';
  p.save();
  assert.ok(has(checkDocumentation(p.root), 'requirement_declaration_mismatch'));
});

test('documentation gate does not follow symlinks or count ignored private documents as evidence', t => {
  const p = project(t);
  p.put('.gitignore', 'private/\n');
  p.put('private/note.md', 'Not shared evidence.\n');
  const privateLink = ['..', 'private', 'note.md'].join('/');
  p.put('docs/index.md', `[Private](${privateLink})\n[Link](linked.md)\n`);
  symlinkSync(privateLink, path.join(p.root, 'docs/linked.md'));
  const result = checkDocumentation(p.root);
  assert.ok(has(result, 'missing_or_private_link'));
  assert.ok(has(result, 'missing_or_unsafe_file'));
});

test('documentation gate compiles Draft 2020-12 schemas and rejects malformed schema keywords', t => {
  const p = project(t), name = 'docs/contracts/synthetic.schema.json';
  p.index.documents.push({ ...p.index.documents[0], id: 'contract', path: name, kind: 'contract' });
  p.save();
  p.put(name, JSON.stringify({ $schema: 'https://json-schema.org/draft/2020-12/schema', type: 'object', required: ['example'] }));
  assert.equal(checkDocumentation(p.root).schemasChecked, 1);
  p.put(name, JSON.stringify({ $schema: 'https://json-schema.org/draft/2020-12/schema', type: 'not-a-type' }));
  assert.ok(has(checkDocumentation(p.root), 'invalid_schema'));
});

test('test discovery includes new public tests and skips ignored datasets and local tests', t => {
  const p = project(t);
  p.put('.gitignore', 'private/\nfixtures/\n*.local.*\n');
  p.put('tests/unit/extra.test.mjs', 'export const synthetic = true;\n');
  p.put('tests/fixtures/ignored.test.mjs', 'throw new Error("must not run");\n');
  p.put(['tests', 'private', 'probe.test.mjs'].join('/'), 'throw new Error("must not run");\n');
  p.put('tests/probe.local.test.mjs', 'throw new Error("must not run");\n');
  assert.deepEqual(discoverTests(p.root), ['tests/example.test.mjs', 'tests/unit/extra.test.mjs']);
  symlinkSync('example.test.mjs', path.join(p.root, 'tests/linked.test.mjs'));
  assert.throws(() => discoverTests(p.root), /symlink/);
});

test('test discovery rejects forbidden tracked test paths even when ignored', t => {
  const p = project(t), name = ['tests', 'private', 'probe.test.mjs'].join('/');
  p.put('.gitignore', 'private/\n');
  p.put(name, 'export const mustNotRun = true;\n');
  execFileSync('git', ['add', '-f', name], { cwd: p.root });
  assert.throws(() => discoverTests(p.root), /outside the approved public paths/);
});
