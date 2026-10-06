import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import Ajv2020 from 'ajv/dist/2020.js';
import { loadCameraRoute, validateCameraRoute } from '../src/features/camera_guidance/route_package.mjs';

const schema = JSON.parse(readFileSync(new URL('../docs/contracts/route-package.schema.json', import.meta.url), 'utf8'));
// Existing conditional schema branches omit repeated type declarations. This uses
// full Draft 2020-12 validation; strict linting is disabled, schema validation is not.
const ajv = new Ajv2020({ strict: false, validateSchema: true, allErrors: true });
const validateSchemaInstance = ajv.compile(schema);
const ORDER = ['Y28', 'Y26', 'Y23'];

// Only an in-memory contract specimen. No image is read, no route file is written,
// and these synthetic values cannot establish reference provenance or navigation.
function syntheticRoute() {
  return {
    schemaVersion: 'route-package-v1', specVersion: 'camera-prototype-v1',
    routeId: 'synthetic-contract-only', revision: 'synthetic-v1',
    evidenceMode: 'prototype', navigationReady: false, physicalArrivalVerified: false,
    nodeOrder: [...ORDER],
    nodes: ORDER.map(nodeId => ({
      nodeId, label: `Synthetic ${nodeId}`, floor: 'B1',
      referenceImage: `/camera/assets/${nodeId}.png`,
      sha256: createHash('sha256').update(`not-an-image:${nodeId}`).digest('hex'),
      roi: [1, 2, 5, 8], referencePackId: 'run_01_manual_v1',
      locationEvidenceStatus: 'fixed_marker_visible_only',
    })),
    segments: ORDER.slice(0, -1).map((fromNodeId, index) => ({
      fromNodeId, toNodeId: ORDER[index + 1], instruction: 'Synthetic instruction',
      timeReference: {
        label: 'Synthetic reference only', kind: 'historical_recordings',
        notLiveEta: true, provenanceRef: 'synthetic-no-recording',
      },
    })),
    map: { kind: 'schematic', notToScale: true },
  };
}

function checkSchema(route, expected, message) {
  const valid = validateSchemaInstance(route);
  assert.equal(valid, expected, `${message}: ${ajv.errorsText(validateSchemaInstance.errors)}`);
}

function runtimeRejects(mutations) {
  for (const [description, mutate] of mutations) {
    const route = syntheticRoute();
    mutate(route);
    assert.throws(() => validateCameraRoute(route), /INVALID_ROUTE_PACKAGE/, description);
  }
}

test('route contract: synthetic prototype satisfies the published schema and runtime without mutation', () => {
  assert.equal(ajv.validateSchema(schema), true);
  const route = syntheticRoute(), before = structuredClone(route);
  checkSchema(route, true, 'minimal synthetic prototype');
  assert.equal(validateCameraRoute(route), route);
  assert.deepEqual(route, before);
  assert.equal(route.navigationReady, false);
  assert.equal(route.physicalArrivalVerified, false);
});

test('route contract: schema rejects missing required fields, wrong types and unknown properties', () => {
  const scopes = [
    [schema, route => route, 'route'],
    [schema.properties.nodes.items, route => route.nodes[0], 'node'],
    [schema.properties.segments.items, route => route.segments[0], 'segment'],
    [schema.properties.segments.items.properties.timeReference, route => route.segments[0].timeReference, 'timeReference'],
    [schema.properties.map, route => route.map, 'map'],
  ];
  for (const [definition, select, name] of scopes) {
    for (const key of definition.required) {
      const route = syntheticRoute();
      delete select(route)[key];
      checkSchema(route, false, `missing ${name}.${key}`);
    }
    const route = syntheticRoute();
    select(route).unexpectedProperty = true;
    checkSchema(route, false, `unknown ${name} property`);
  }
  for (const [description, mutate] of [
    ['numeric route ID', route => { route.routeId = 7; }],
    ['empty revision', route => { route.revision = ''; }],
    ['boolean encoded as string', route => { route.navigationReady = 'false'; }],
    ['non-array nodes', route => { route.nodes = {}; }],
    ['null node', route => { route.nodes[0] = null; }],
    ['numeric label', route => { route.nodes[0].label = 3; }],
    ['numeric instruction', route => { route.segments[0].instruction = 3; }],
    ['empty instruction', route => { route.segments[0].instruction = ''; }],
    ['null time reference', route => { route.segments[0].timeReference = null; }],
    ['non-array ROI', route => { route.nodes[0].roi = '1,2,5,8'; }],
    ['string ROI coordinate', route => { route.nodes[0].roi[0] = '1'; }],
    ['negative ROI coordinate', route => { route.nodes[0].roi[0] = -1; }],
    ['wrong node count', route => { route.nodes.pop(); }],
    ['wrong segment count', route => { route.segments.push(structuredClone(route.segments[0])); }],
  ]) {
    const route = syntheticRoute(); mutate(route); checkSchema(route, false, description);
  }
});

test('route contract: prototype readiness, versions, ordered IDs and reference shape fail closed', () => {
  const mutations = [
    ['unknown schema version', route => { route.schemaVersion = 'unknown'; }],
    ['unknown spec version', route => { route.specVersion = 'unknown'; }],
    ['navigation readiness upgrade', route => { route.navigationReady = true; }],
    ['physical arrival upgrade', route => { route.physicalArrivalVerified = true; }],
    ['wrong ordered IDs', route => { route.nodeOrder.reverse(); }],
    ['duplicate ordered IDs', route => { route.nodeOrder[1] = 'Y28'; }],
    ['unrecognized node ID', route => { route.nodes[0].nodeId = 'unknown'; }],
    ['unsupported floor', route => { route.nodes[0].floor = 'B2'; }],
    ['remote image', route => { route.nodes[0].referenceImage = 'https://example.invalid/reference.png'; }],
    ['malformed digest', route => { route.nodes[0].sha256 = 'invalid'; }],
    ['non-schematic map', route => { route.map.kind = 'position'; }],
    ['to-scale map claim', route => { route.map.notToScale = false; }],
    ['live ETA claim', route => { route.segments[0].timeReference.notLiveEta = false; }],
  ];
  runtimeRejects(mutations);
  for (const [description, mutate] of mutations) {
    const route = syntheticRoute(); mutate(route); checkSchema(route, false, description);
  }
});

test('route contract: runtime enforces prototype order and bindings beyond schema shape', () => {
  runtimeRejects([
    ['node array order', route => { route.nodes.reverse(); }],
    ['duplicate node entry', route => { route.nodes[1] = structuredClone(route.nodes[0]); }],
    ['reversed segment direction', route => { route.segments[0].fromNodeId = 'Y26'; route.segments[0].toNodeId = 'Y28'; }],
    ['skipped intermediate node', route => { route.segments[0].toNodeId = 'Y23'; }],
    ['swapped segments', route => { route.segments.reverse(); }],
    ['another local image', route => { route.nodes[0].referenceImage = '/camera/assets/Y26.png'; }],
    ['protocol-relative image', route => { route.nodes[0].referenceImage = '//example.invalid/reference.png'; }],
    ['different reference pack', route => { route.nodes[0].referencePackId = 'synthetic-other-pack'; }],
    ['unsupported near-anchor claim', route => { route.nodes[0].locationEvidenceStatus = 'near_anchor_validated'; }],
    ['missing map', route => { delete route.map; }],
    ['reversed ROI x bounds', route => { route.nodes[0].roi = [5, 2, 1, 8]; }],
    ['zero width ROI', route => { route.nodes[0].roi = [1, 2, 1, 8]; }],
    ['zero height ROI', route => { route.nodes[0].roi = [1, 2, 5, 2]; }],
  ]);
});

test('route contract: runtime rejects malformed ROI and guarded field types', () => {
  for (const roi of [null, '1,2,5,8', [], [1, 2, 5], [1, 2, 5, 8, 9], [-1, 2, 5, 8], [1, -2, 5, 8], ['1', 2, 5, 8], [NaN, 2, 5, 8], [1, 2, Infinity, 8]]) {
    runtimeRejects([['malformed ROI', route => { route.nodes[0].roi = roi; }]]);
  }
  runtimeRejects([
    ['string readiness', route => { route.navigationReady = 'false'; }],
    ['string physical verification', route => { route.physicalArrivalVerified = 'false'; }],
    ['string node order', route => { route.nodeOrder = ORDER.join(','); }],
    ['string map scale flag', route => { route.map.notToScale = 'true'; }],
    ['numeric instruction', route => { route.segments[0].instruction = 1; }],
    ['string ETA flag', route => { route.segments[0].timeReference.notLiveEta = 'true'; }],
  ]);
  for (const route of [null, undefined, [], 'route']) {
    assert.throws(() => validateCameraRoute(route), /INVALID_ROUTE_PACKAGE/);
  }
});

test('route contract: future production schema branch cannot enable the prototype runtime', () => {
  const route = syntheticRoute();
  route.evidenceMode = 'production'; route.navigationReady = true; route.physicalArrivalVerified = true;
  checkSchema(route, false, 'production without evidence references');
  route.acceptanceRecordRef = 'synthetic-not-an-acceptance';
  for (const node of route.nodes) {
    node.locationEvidenceStatus = 'near_anchor_validated';
    node.nearAnchorEvidenceRef = 'synthetic-not-field-evidence';
  }
  // Schema shape is deliberately distinct from evidence authenticity or runtime permission.
  checkSchema(route, true, 'synthetic production shape');
  assert.throws(() => validateCameraRoute(route), /INVALID_ROUTE_PACKAGE/);
  for (const node of route.nodes) {
    const reference = node.nearAnchorEvidenceRef;
    delete node.nearAnchorEvidenceRef;
    checkSchema(route, false, 'missing one near-anchor evidence reference');
    node.nearAnchorEvidenceRef = reference;
  }
});

test('route contract: loader requests the local route and rejects unavailable or invalid packages', async context => {
  const fetch = context.mock.method(globalThis, 'fetch');
  fetch.mock.mockImplementation(async url => {
    assert.equal(url, '/camera/route.json');
    return { ok: false, json: async () => { throw new Error('must not parse a failed response'); } };
  });
  await assert.rejects(loadCameraRoute(), /ROUTE_LOAD_FAILED/);
  const invalid = syntheticRoute(); invalid.navigationReady = true;
  fetch.mock.mockImplementation(async () => ({ ok: true, json: async () => invalid }));
  await assert.rejects(loadCameraRoute(), /INVALID_ROUTE_PACKAGE/);
  const valid = syntheticRoute();
  fetch.mock.mockImplementation(async () => ({ ok: true, json: async () => valid }));
  assert.equal(await loadCameraRoute(), valid);
});
