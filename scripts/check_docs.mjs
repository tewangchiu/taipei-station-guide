#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { readFileSync, lstatSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Ajv2020 from 'ajv/dist/2020.js';

const registryPath = 'docs/spec-index.json';
const requirementPattern = /^### Requirement: ([A-Z]+-\d+)\b/gm;
const tiers = new Set(['unit', 'static', 'contract', 'browser', 'device', 'field']);
const statuses = new Set(['pending', 'needs-data', 'future', 'pass', 'fail']);
const documentFile = name => /^(docs|openspec)\/.+\.(md|schema\.json)$/.test(name)
  || /^data\/.+\.schema\.json$/.test(name) || name === registryPath;

export function checkDocumentation(root) {
  const errors = [];
  const error = (file, kind, detail) => errors.push({ file, kind, ...(detail ? { detail } : {}) });
  const files = [...new Set(execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z'], { cwd: root }).toString().split('\0').filter(Boolean))];
  const fileSet = new Set(files);
  function safePath(name) {
    if (typeof name !== 'string' || !name || path.posix.isAbsolute(name) || name.includes('\\')
      || name.split('/').some(part => ['..', '.', ''].includes(part))) return false;
    let current = root;
    try {
      for (const part of name.split('/')) {
        current = path.join(current, part);
        if (lstatSync(current).isSymbolicLink()) return false;
      }
      return true;
    } catch { return false; }
  }
  function publicFile(name) { return safePath(name) && fileSet.has(name) && lstatSync(path.join(root, name)).isFile(); }
  if (!publicFile(registryPath)) return { status: 'fail', errors: [{ file: registryPath, kind: 'missing_registry' }] };
  let index;
  try { index = JSON.parse(readFileSync(path.join(root, registryPath), 'utf8')); }
  catch { return { status: 'fail', errors: [{ file: registryPath, kind: 'invalid_json' }] }; }
  if (index.schemaVersion !== 1 || !index.project?.id || !index.project?.scope
    || !Array.isArray(index.documents) || !Array.isArray(index.requirements) || !Array.isArray(index.changes)) {
    return { status: 'fail', errors: [{ file: registryPath, kind: 'invalid_registry_shape' }] };
  }
  const ids = new Set(), indexed = new Set();
  for (const doc of index.documents) {
    if (!doc || typeof doc !== 'object') { error(registryPath, 'invalid_document'); continue; }
    for (const key of ['id', 'path', 'kind', 'status', 'owner', 'updated', 'scope']) {
      if (typeof doc[key] !== 'string' || !doc[key].trim()) error(registryPath, 'missing_metadata', key);
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(doc.updated ?? '') || Number.isNaN(Date.parse(doc.updated))) error(doc.path, 'invalid_updated_date');
    if (ids.has(doc.id)) error(registryPath, 'duplicate_document_id', doc.id);
    if (indexed.has(doc.path)) error(registryPath, 'duplicate_document_path', doc.path);
    ids.add(doc.id); indexed.add(doc.path);
    if (!publicFile(doc.path)) error(doc.path, 'missing_or_unsafe_document');
  }
  for (const name of files.filter(documentFile)) if (!indexed.has(name)) error(name, 'document_not_indexed');
  const texts = new Map();
  let linksChecked = 0, schemasChecked = 0;
  for (const name of files.filter(name => name.endsWith('.md') || (documentFile(name) && name.endsWith('.schema.json')))) {
    if (!publicFile(name)) { error(name, 'missing_or_unsafe_file'); continue; }
    const text = readFileSync(path.join(root, name), 'utf8');
    if (name.endsWith('.schema.json')) {
      try {
        const schema = JSON.parse(text);
        if (schema.$schema !== 'https://json-schema.org/draft/2020-12/schema') throw new Error('Unsupported draft');
        // Existing contracts use conditional subschemas without repeated type declarations.
        // Disable strict authoring warnings, not instance validation or schema validation.
        new Ajv2020({ strict: false, allErrors: true, validateSchema: true }).compile(schema);
        schemasChecked += 1;
      } catch { error(name, 'invalid_schema'); }
      continue;
    }
    texts.set(name, text);
    const prose = text.replace(/^```[^\n]*\n[\s\S]*?^```\s*$/gm, '');
    for (const match of prose.matchAll(/\]\((<[^>]+>|[^)]+)\)/g)) {
      let target = match[1].trim().replace(/^<|>$/g, '').replace(/\s+["'][^]*["']$/, '');
      if (/^https?:\/\//.test(target) || target.startsWith('#')) continue;
      linksChecked += 1;
      try { target = decodeURIComponent(target.split('#')[0].split('?')[0]); }
      catch { error(name, 'invalid_link'); continue; }
      if (!target || path.posix.isAbsolute(target) || /^[a-z]+:/i.test(target) || target.includes('\\')) {
        error(name, 'unsafe_link'); continue;
      }
      const normalized = path.posix.normalize(path.posix.join(path.posix.dirname(name), target)).replace(/\/$/, '');
      if (!safePath(normalized) || !(fileSet.has(normalized) || files.some(file => file.startsWith(`${normalized}/`)))) error(name, 'missing_or_private_link', normalized);
    }
  }
  const declarations = new Map();
  for (const [name, text] of texts) {
    if (!/^openspec\/specs\/[^/]+\/spec\.md$/.test(name)) continue;
    for (const match of text.matchAll(requirementPattern)) {
      if (declarations.has(match[1])) error(name, 'duplicate_requirement', match[1]);
      declarations.set(match[1], name);
    }
  }
  const requirementIds = new Set();
  const pendingByTier = {};
  for (const requirement of index.requirements) {
    if (!requirement || !/^[A-Z]+-\d+$/.test(requirement.id ?? '')) { error(registryPath, 'invalid_requirement_id'); continue; }
    if (requirementIds.has(requirement.id)) error(registryPath, 'duplicate_requirement_id', requirement.id);
    requirementIds.add(requirement.id);
    if (typeof requirement.spec !== 'string'
      || !/^openspec\/specs\/(navigation|privacy|route-data|visual-localization)\/spec\.md$/.test(requirement.spec)
      || !indexed.has(requirement.spec) || !publicFile(requirement.spec)
      || !declarations.has(requirement.id) || declarations.get(requirement.id) !== requirement.spec) {
      error(registryPath, 'requirement_declaration_mismatch', requirement.id);
    }
    if (!Array.isArray(requirement.checks) || !requirement.checks.length) { error(registryPath, 'missing_acceptance_mapping', requirement.id); continue; }
    for (const check of requirement.checks) {
      if (!check || !tiers.has(check.tier) || !statuses.has(check.status) || !publicFile(check.path) || typeof check.note !== 'string' || !check.note.trim()) {
        error(registryPath, 'invalid_check_mapping', requirement.id); continue;
      }
      if (['unit', 'contract'].includes(check.tier) && !/^tests\/.+\.test\.mjs$/.test(check.path)) error(registryPath, 'automated_check_not_test_source', requirement.id);
      if (check.status !== 'pass') pendingByTier[check.tier] = (pendingByTier[check.tier] ?? 0) + 1;
    }
  }
  for (const [id, name] of declarations) if (!requirementIds.has(id)) error(name, 'requirement_not_indexed', id);
  const changeIds = new Set();
  for (const change of index.changes) {
    if (!change || !/^chg-\d{4}-\d{2}-[a-z0-9-]+$/.test(change.id ?? '') || changeIds.has(change.id)) error(registryPath, 'invalid_or_duplicate_change_id');
    changeIds.add(change?.id);
    if (!change?.status) error(registryPath, 'missing_change_status');
    for (const field of ['path', 'plan', 'matrix']) if (!indexed.has(change?.[field]) || !publicFile(change?.[field])) error(registryPath, 'invalid_change_document', field);
    if (!Array.isArray(change?.requirements) || !change.requirements.length || change.requirements.some(id => !requirementIds.has(id))) error(registryPath, 'invalid_change_requirements');
  }
  return { status: errors.length ? 'fail' : 'pass', documents: indexed.size, requirements: requirementIds.size,
    linksChecked, schemasChecked, pendingByTier, errors,
    limits: 'Checks structure, links, declarations and schema compilation; not prose consistency, instance coverage, browser, device or field acceptance.' };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const result = checkDocumentation(root);
  console.log(JSON.stringify(result, null, 2));
  process.exitCode = result.status === 'pass' ? 0 : 1;
}
