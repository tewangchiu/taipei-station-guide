export const ROUTE_NODES = Object.freeze(["Y28", "Y26", "Y23"]);
const PAUSED = new Set(["recovery_required", "manual_relocation", "manual_confirmation_required", "blocked_unknown"]);
const START = new Set(["not_started", "start_confirmation_required"]);
const WALK = new Set(["step_guidance", "arrival_confirmation_required"]);

// Read-only projection of the existing manual session; no clock, sensor or OCR input.
export function routeContext(state) {
  const index = ROUTE_NODES.indexOf(state?.last_confirmed_node);
  const knownNode = index >= 0;
  const emptyStart = state?.last_confirmed_node === "unknown" && state?.current_node === "unknown";
  const consistentNode = knownNode && state.current_node === state.last_confirmed_node;
  const lowConfidence = typeof state?.last_reason === "string" && state.last_reason.includes("low_confidence");
  let mode = "unknown";
  if (START.has(state?.status) && emptyStart && !state.completed) mode = lowConfidence ? "paused" : "start_pending";
  else if (WALK.has(state?.status) && consistentNode && index < 2 && state.step_index === index && !state.completed) mode = lowConfidence ? "paused" : "guidance";
  else if (PAUSED.has(state?.status) && ((consistentNode && index < 2) || emptyStart) && !state.completed) mode = "paused";
  else if (state?.status === "completed" && consistentNode && index === 2 && state.completed === true) mode = "completed";
  else if (state?.status === "aborted" && (consistentNode || emptyStart) && !state.completed) mode = "aborted";
  const valid = mode !== "unknown";
  return {
    mode,
    lastConfirmedNode: valid && knownNode ? ROUTE_NODES[index] : null,
    targetNode: ["guidance", "start_pending", "paused"].includes(mode) ? ROUTE_NODES[index + 1] : null,
    remainingSegments: ["unknown", "aborted"].includes(mode) ? null : 2 - Math.max(0, index),
    segments: ROUTE_NODES.slice(1).map((to, segment) => ({
      from: ROUTE_NODES[segment], to,
      status: !valid ? "unresolved" : index >= segment + 1 ? "confirmed" : "remaining",
    })),
  };
}

// Coarse reference labels; private measurement evidence is not distributed.
// Y26 uses marker visibility during passage, NOT a confirmed arrival timestamp.
export function walkingReference(context) {
  if (context.mode === "start_pending") return { label: "全程步行參考", value: "約 1–2 分鐘", from: "Y28" };
  if (context.mode !== "guidance") return null;
  if (context.lastConfirmedNode === "Y28") return { label: "步行參考", value: "約 1–2 分鐘", from: "Y28" };
  if (context.lastConfirmedNode === "Y26") return { label: "步行參考", value: "約半分鐘", from: "Y26" };
  return null;
}
