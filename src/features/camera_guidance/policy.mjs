export const POLICY_VERSION = 'camera-temporal-v1';
export const POLICY_PARAMS = Object.freeze({ minFrames: 3, minSpanMs: 1200, maxGapMs: 1000, maxAgeMs: 1500, maxWindowMs: 4000 });
const NODE_IDS = new Set(['Y28', 'Y26', 'Y23']);
export function createEvidenceState() {
  return { version: POLICY_VERSION, sessionId: null, expectedNodeId: null, window: [], seenFrameIds: [],
    lastCapturedAtMs: null, lastNowMs: null, acceptedNodeId: null };
}
const validTime = value => Number.isFinite(value) && value >= 0;
const validId = value => (typeof value === 'string' && value.length > 0 && value.length <= 128)
  || (Number.isSafeInteger(value) && value >= 0);

export function evaluateObservation(previous, observation, { expectedNodeId, nowMs } = {}) {
  let state = previous?.version === POLICY_VERSION && Array.isArray(previous.window) && Array.isArray(previous.seenFrameIds)
    ? { ...previous, window: previous.window.map(item => ({ ...item })), seenFrameIds: [...previous.seenFrameIds] } : createEvidenceState();
  const rejected = reason => ({ state: { ...state, window: [] }, decision: 'rejected', reason });
  if (!NODE_IDS.has(expectedNodeId) || !validTime(nowMs)) return rejected('invalid_context');
  if (!observation || typeof observation.accepted !== 'boolean' || !validTime(observation.capturedAtMs)
    || !validId(observation.sessionId) || !validId(observation.frameId)) return rejected('invalid_observation');
  if (state.lastNowMs !== null && nowMs < state.lastNowMs) return rejected('clock_moved_backwards');
  state.lastNowMs = nowMs;
  if (state.sessionId !== null && state.sessionId !== observation.sessionId) {
    return { state: { ...createEvidenceState(), sessionId: observation.sessionId, expectedNodeId, lastNowMs: nowMs }, decision: 'rejected', reason: 'session_changed' };
  }
  state.sessionId = observation.sessionId;
  if (state.expectedNodeId !== expectedNodeId) { state.window = []; state.acceptedNodeId = null; state.expectedNodeId = expectedNodeId; }
  if (observation.capturedAtMs > nowMs) return rejected('future_frame');
  if (nowMs - observation.capturedAtMs > POLICY_PARAMS.maxAgeMs) return rejected('stale_frame');
  if (state.seenFrameIds.includes(observation.frameId)) return rejected('duplicate_frame');
  if (state.lastCapturedAtMs !== null && observation.capturedAtMs <= state.lastCapturedAtMs) return rejected('out_of_order_frame');
  const previousCapturedAtMs = state.lastCapturedAtMs;
  state.lastCapturedAtMs = observation.capturedAtMs;
  state.seenFrameIds = [...state.seenFrameIds, observation.frameId].slice(-128);
  if (!observation.accepted) return rejected('visual_evidence_rejected');
  if (!NODE_IDS.has(observation.nodeId) || observation.nodeId !== expectedNodeId) return rejected('unexpected_node');
  if (state.acceptedNodeId === expectedNodeId) return rejected('node_already_accepted');
  if (previousCapturedAtMs !== null && observation.capturedAtMs - previousCapturedAtMs > POLICY_PARAMS.maxGapMs) state.window = [];
  state.window = [...state.window, { frameId: observation.frameId, capturedAtMs: observation.capturedAtMs }]
    .filter(item => observation.capturedAtMs - item.capturedAtMs <= POLICY_PARAMS.maxWindowMs).slice(-16);
  const span = observation.capturedAtMs - state.window[0].capturedAtMs;
  if (state.window.length >= POLICY_PARAMS.minFrames && span >= POLICY_PARAMS.minSpanMs) {
    return { state: { ...state, acceptedNodeId: expectedNodeId, window: [] }, decision: 'accepted', reason: 'stable_visual_landmark' };
  }
  return { state, decision: 'stabilizing', reason: 'awaiting_distinct_frames' };
}
