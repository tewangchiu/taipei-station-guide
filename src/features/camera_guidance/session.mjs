export const NODES = Object.freeze(['Y28', 'Y26', 'Y23']);
export function createSession(sessionId, source = 'replay') {
  if (!['replay', 'camera'].includes(source) || !sessionId) throw new Error('Invalid session');
  return { sessionId, source, status: 'ready', index: -1, events: [], nextSequence: 1 };
}
export function expectedNode(state) { return NODES[state.index + 1] ?? null; }
// Experimental domain: never impersonates the legacy user_confirmed event.
export function transition(state, event) {
  if (!state || event.sessionId !== state.sessionId) return state;
  if (event.type === 'start' && ['ready', 'paused', 'error'].includes(state.status)) return { ...state, status: 'running' };
  if (event.type === 'pause' && ['ready', 'running'].includes(state.status)) return { ...state, status: 'paused' };
  if (event.type === 'error' && state.status !== 'completed') return { ...state, status: 'error' };
  if (event.type === 'stop' && state.status !== 'completed') return { ...state, status: 'stopped' };
  if (event.type !== 'advance' || state.status !== 'running' || event.nodeId !== expectedNode(state)) return state;
  if (!['vision_experimental', 'manual_fallback'].includes(event.evidenceSource)) return state;
  if (event.evidenceSource === 'vision_experimental' && event.decision !== 'accepted') return state;
  const index = state.index + 1;
  return { ...state, index, status: index === 2 ? 'completed' : 'running', nextSequence: state.nextSequence + 1,
    events: [...state.events, { sequence: state.nextSequence, nodeId: event.nodeId,
      type: 'anchor_progressed', evidenceSource: event.evidenceSource, inputSource: state.source }] };
}
export function walkingSummary(state) {
  if (state.status === 'completed') return { time: '本段完成', segments: 0 };
  if (['paused', 'error', 'stopped'].includes(state.status)) return { time: '指引已暫停', segments: Math.max(0, 2 - Math.max(0, state.index)) };
  return { time: state.index === 1 ? '約半分鐘' : '約 1–2 分鐘', segments: 2 - Math.max(0, state.index) };
}
