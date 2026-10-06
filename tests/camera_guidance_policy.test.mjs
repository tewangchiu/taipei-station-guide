import test from 'node:test';
import assert from 'node:assert/strict';
import { createEvidenceState, evaluateObservation, POLICY_PARAMS } from '../src/features/camera_guidance/policy.mjs';

const observation = (frameId, capturedAtMs, extra = {}) => ({ accepted: true, nodeId: 'Y28', sessionId: 'camera-1', frameId, capturedAtMs, ...extra });
const apply = (state, input, context = {}) => evaluateObservation(state, input, { expectedNodeId: 'Y28', nowMs: input?.capturedAtMs ?? 0, ...context });

test('three distinct fresh matching frames across 1200ms auto-accept, without a timer event', () => {
  let state = createEvidenceState();
  for (const [id, time] of [[1, 0], [2, 600]]) { const r = apply(state, observation(id, time)); assert.equal(r.decision, 'stabilizing'); state = r.state; }
  const r = apply(state, observation(3, 1200));
  assert.equal(r.decision, 'accepted'); assert.equal(r.reason, 'stable_visual_landmark'); assert.equal(r.state.window.length, 0);
  assert.equal(r.state.acceptedNodeId, 'Y28');
});

test('one image plus elapsed time or a timer-only call cannot accept', () => {
  const r = apply(createEvidenceState(), observation(1, 0));
  assert.equal(apply(r.state, undefined, { nowMs: 10000 }).reason, 'invalid_observation');
  const gap = apply(r.state, observation(2, 20000)); assert.equal(gap.decision, 'stabilizing'); assert.equal(gap.state.window.length, 1);
});

test('duplicates, stale/future frames, and capture order all clear accumulated evidence', () => {
  let state = apply(createEvidenceState(), observation(1, 10)).state;
  state = apply(state, observation(2, 610)).state;
  assert.equal(apply(state, observation(2, 1210)).reason, 'duplicate_frame');
  assert.equal(apply(state, observation(3, 9), { nowMs: 1210 }).reason, 'out_of_order_frame');
  assert.equal(apply(state, observation(3, 1210), { nowMs: 4000 }).reason, 'stale_frame');
  assert.equal(apply(state, observation(3, 1210), { nowMs: 1100 }).reason, 'future_frame');
  assert.equal(apply(state, observation(3, 1210), { nowMs: 600 }).reason, 'clock_moved_backwards');
  assert.equal(apply(state, observation(2, 1210)).state.window.length, 0);
});

test('wrong node and weak OCR-only observation never advance or retain earlier matching frames', () => {
  let state = apply(createEvidenceState(), observation(1, 0)).state;
  state = apply(state, observation(2, 600)).state;
  for (const input of [observation(3, 1200, { nodeId: 'Y26' }), observation(3, 1200, { accepted: false, nodeId: 'Y28', reason: 'weak_text_only' })]) {
    const r = apply(state, input); assert.equal(r.decision, 'rejected'); assert.equal(r.state.window.length, 0);
  }
});

test('session interruption cannot combine frames from old and new camera streams', () => {
  let state = apply(createEvidenceState(), observation(1, 0)).state;
  state = apply(state, observation(2, 600)).state;
  let r = apply(state, observation(3, 1200, { sessionId: 'camera-2' }));
  assert.equal(r.reason, 'session_changed'); assert.equal(r.state.window.length, 0);
  r = apply(r.state, observation(4, 1800, { sessionId: 'camera-2' })); assert.equal(r.decision, 'stabilizing');
});

test('a long frame gap resets stability and rapid bursts cannot replace the required span', () => {
  let state = createEvidenceState();
  for (let i = 0; i < 10; i++) { const r = apply(state, observation(i, i * 50)); assert.equal(r.decision, 'stabilizing'); state = r.state; }
  const r = apply(state, observation(11, 2000)); assert.equal(r.decision, 'stabilizing'); assert.equal(r.state.window.length, 1);
  assert.equal(POLICY_PARAMS.minSpanMs, 1200);
});

test('accepted node is idempotent and a next target requires its own complete window', () => {
  let state = createEvidenceState();
  for (const [id, time] of [[1, 0], [2, 600], [3, 1200]]) state = apply(state, observation(id, time)).state;
  assert.equal(apply(state, observation(4, 1800)).reason, 'node_already_accepted');
  assert.equal(apply(state, observation(3, 1200, { nodeId: 'Y26' }), { expectedNodeId: 'Y26' }).reason, 'duplicate_frame');
  let r = apply(state, observation(4, 1800, { nodeId: 'Y26' }), { expectedNodeId: 'Y26' }); assert.equal(r.decision, 'stabilizing');
  r = apply(r.state, observation(5, 2400, { nodeId: 'Y26' }), { expectedNodeId: 'Y26' }); assert.equal(r.decision, 'stabilizing');
  r = apply(r.state, observation(6, 3000, { nodeId: 'Y26' }), { expectedNodeId: 'Y26' }); assert.equal(r.decision, 'accepted');
});

test('policy is pure, bounded, and rejects malformed or non-finite input', () => {
  const state = createEvidenceState(), before = JSON.stringify(state);
  apply(state, observation(1, 0)); assert.equal(JSON.stringify(state), before);
  for (const input of [{}, observation(1, NaN), observation('', 0), observation(1, 0, { accepted: 'true' }), observation(1, 0, { sessionId: '' })]) {
    assert.equal(apply(state, input, { nowMs: 0 }).decision, 'rejected');
  }
  assert.equal(apply(state, observation(1, 0), { expectedNodeId: 'Y24' }).reason, 'invalid_context');
});
