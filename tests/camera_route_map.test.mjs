import test from 'node:test';
import assert from 'node:assert/strict';
import { routePlan, routeMapSummary } from '../src/features/camera_guidance/route_map.mjs';
import { createSession, transition } from '../src/features/camera_guidance/session.mjs';

function sessionAt(index, evidenceSource = 'vision_experimental') {
  let session = createSession('synthetic-map-session', 'camera');
  session = transition(session, { sessionId: session.sessionId, type: 'start' });
  for (const nodeId of ['Y28', 'Y26', 'Y23'].slice(0, index + 1)) {
    session = transition(session, {
      sessionId: session.sessionId, type: 'advance', nodeId,
      evidenceSource, decision: 'accepted',
    });
  }
  return session;
}

function attribute(tag, name) {
  return tag.match(new RegExp(`(?:^|\\s)${name}="([^"]*)"`))?.[1] ?? null;
}

// Read the renderer's public state attributes, not its decorative SVG coordinates.
// This is a pure rendering contract check, not browser layout or field validation.
function semantics(svg) {
  return {
    index: Number(attribute(svg.match(/<svg\b[^>]*>/)[0], 'data-route-index')),
    nodes: [...svg.matchAll(/<g\b[^>]*\bdata-map-node="[^"]*"[^>]*>/g)].map(([tag]) => ({
      nodeId: attribute(tag, 'data-map-node'), state: attribute(tag, 'data-state'),
      lastSeen: attribute(tag, 'data-last-seen') === 'true', current: attribute(tag, 'aria-current'),
    })),
    segments: [...svg.matchAll(/<path\b[^>]*\bdata-segment="[^"]*"[^>]*>/g)].map(([tag]) => ({
      segment: attribute(tag, 'data-segment'), state: attribute(tag, 'data-state'),
      done: attribute(tag, 'class').split(/\s+/).includes('is-done'),
      ahead: attribute(tag, 'class').split(/\s+/).includes('is-ahead'),
    })),
    arrows: [...svg.matchAll(/class="plan-chevron"/g)].length,
  };
}

const PROGRESS = [
  { index: -1, nodes: ['target', 'pending', 'pending'], segments: ['pending', 'pending'], next: 'Y28', last: null },
  { index: 0, nodes: ['recognized', 'target', 'pending'], segments: ['pending', 'pending'], next: 'Y26', last: 'Y28' },
  { index: 1, nodes: ['recognized', 'recognized', 'target'], segments: ['recognized', 'pending'], next: 'Y23', last: 'Y26' },
  { index: 2, nodes: ['recognized', 'recognized', 'recognized'], segments: ['recognized', 'recognized'], next: null, last: 'Y23' },
];

test('route map: compact and expanded plans agree on every node and segment of progress', () => {
  for (const expected of PROGRESS) {
    const session = sessionAt(expected.index);
    const compact = semantics(routePlan(session, { compact: true }));
    const expanded = semantics(routePlan(session));
    assert.deepEqual(compact, expanded, `index ${expected.index}: both views have the same meaning`);
    assert.equal(compact.index, expected.index);
    assert.deepEqual(compact.nodes.map(node => node.nodeId), ['Y28', 'Y26', 'Y23']);
    assert.deepEqual(compact.nodes.map(node => node.state), expected.nodes);
    assert.deepEqual(compact.nodes.filter(node => node.lastSeen).map(node => node.nodeId), expected.last ? [expected.last] : []);
    assert.deepEqual(compact.nodes.filter(node => node.current === 'step').map(node => node.nodeId), expected.next ? [expected.next] : []);
    assert.deepEqual(compact.segments.map(segment => segment.segment), ['Y28-Y26', 'Y26-Y23']);
    assert.deepEqual(compact.segments.map(segment => segment.state), expected.segments);
    for (const segment of compact.segments) {
      assert.equal(segment.done, segment.state === 'recognized');
      assert.equal(segment.ahead, segment.state === 'pending');
    }
    assert.equal(compact.arrows, expected.segments.filter(state => state === 'pending').length);
  }
});

test('route map: pause, error and stop preserve the last anchor and next target in both views', () => {
  for (const type of ['pause', 'error', 'stop']) {
    const active = sessionAt(0), paused = transition(active, { sessionId: active.sessionId, type });
    for (const compact of [false, true]) {
      const svg = routePlan(paused, { compact });
      assert.match(svg, /class="route-plan [^"]*\bis-paused\b/);
      assert.deepEqual(semantics(svg), semantics(routePlan(active, { compact })));
      assert.equal(routeMapSummary(paused), '上次辨識 Y28 · 接著 Y26');
    }
  }
});

test('route map: summaries distinguish manual and visual updates without inventing an arrival', () => {
  assert.equal(routeMapSummary(), '先找 Y28，確認起點');
  assert.equal(routeMapSummary(createSession('synthetic-ready')), '先找 Y28，確認起點');
  assert.equal(routeMapSummary(sessionAt(0, 'manual_fallback')), '上次確認 Y28 · 接著 Y26');
  assert.equal(routeMapSummary(sessionAt(1)), '上次辨識 Y26 · 接著 Y23');
  assert.equal(routeMapSummary(sessionAt(2, 'manual_fallback')), '上次確認 Y23 · 路線完成');
  assert.equal(routeMapSummary(sessionAt(2)), '上次辨識 Y23 · 路線完成');
  let mixed = sessionAt(0, 'manual_fallback');
  mixed = transition(mixed, {
    sessionId: mixed.sessionId, type: 'advance', nodeId: 'Y26',
    evidenceSource: 'vision_experimental', decision: 'accepted',
  });
  assert.equal(routeMapSummary(mixed), '上次辨識 Y26 · 接著 Y23');
});

test('route map: both views expose distinct accessible labels and the same direction and location limits', () => {
  const session = sessionAt(1);
  for (const compact of [false, true]) {
    const svg = routePlan(session, { compact }), prefix = compact ? 'mini' : 'plan';
    assert.match(svg, /role="img"/);
    assert.equal(attribute(svg.match(/<svg\b[^>]*>/)[0], 'aria-labelledby'), `${prefix}-title ${prefix}-description`);
    assert.ok(svg.includes(`<title id="${prefix}-title">Y28 → Y26 → Y23 地下街路線</title>`));
    assert.ok(svg.includes(`<desc id="${prefix}-description">${routeMapSummary(session)}。`));
    assert.ok(svg.includes('沿主走廊前進，Y26牆標在右側，不轉入出口'));
    assert.ok(svg.includes('路線關係圖，非即時定位'));
  }
});

test('route map: rendering either size repeatedly is read-only and cannot advance the session', () => {
  const session = sessionAt(0, 'manual_fallback'), before = structuredClone(session);
  for (const event of session.events) Object.freeze(event);
  Object.freeze(session.events); Object.freeze(session);
  const compact = routePlan(session, { compact: true }), expanded = routePlan(session);
  for (let repeat = 0; repeat < 3; repeat += 1) {
    assert.equal(routePlan(session, { compact: true }), compact);
    assert.equal(routePlan(session), expanded);
    assert.deepEqual(session, before);
  }
  assert.deepEqual(semantics(routePlan()).nodes.map(node => node.state), ['target', 'pending', 'pending']);
});
