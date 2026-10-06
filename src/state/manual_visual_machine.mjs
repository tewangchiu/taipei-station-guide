import {
  EventValidationError,
  SCHEMA_VERSION,
  UNKNOWN,
  NODE_IDS,
  createEvent,
  isSensorEvent,
  isState,
  validateEvent,
} from "../contracts/manual_visual_events.mjs";

export const ROUTE_STEPS = Object.freeze([
  Object.freeze({ step_index: 0, from_node_id: "Y28", to_node_id: "Y26" }),
  Object.freeze({ step_index: 1, from_node_id: "Y26", to_node_id: "Y23" }),
]);

const NODE_SET = new Set(NODE_IDS);
const SUFFICIENT_CONFIDENCES = new Set(["confirmed", "high"]);
const TERMINAL_STATES = new Set(["completed", "aborted"]);

export class InvalidStateError extends Error {
  constructor(message) {
    super(message);
    this.name = "InvalidStateError";
  }
}

export class InvalidTransitionError extends Error {
  constructor(message, { event_type = undefined, state = undefined, code = "INVALID_TRANSITION" } = {}) {
    super(message);
    this.name = "InvalidTransitionError";
    this.event_type = event_type;
    this.state = state;
    this.code = code;
  }
}

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function failTransition(message, command, code = "INVALID_TRANSITION") {
  throw new InvalidTransitionError(message, {
    event_type: command.event_type,
    state: command.state_before,
    code,
  });
}

function freezeCandidates(candidates) {
  return Object.freeze(candidates.map((candidate) => {
    if (isRecord(candidate)) {
      return Object.freeze({ ...candidate });
    }
    return candidate;
  }));
}

function freezeState(state) {
  return Object.freeze({
    ...state,
    relocation_candidates: freezeCandidates(state.relocation_candidates ?? []),
  });
}

function transitionState(state, status, patch = {}) {
  return freezeState({
    ...state,
    ...patch,
    status,
    navigation_state: status,
  });
}

function assertState(state) {
  if (!isRecord(state)) {
    throw new InvalidStateError("state must be an object");
  }
  if (state.schema_version !== SCHEMA_VERSION) {
    throw new InvalidStateError(`schema_version must equal ${SCHEMA_VERSION}`);
  }
  if (!isState(state.status)) {
    throw new InvalidStateError(`unknown state status: ${String(state.status)}`);
  }
  if (state.navigation_state !== state.status) {
    throw new InvalidStateError("navigation_state must equal status");
  }
  for (const field of ["session_id", "route_id"]) {
    if (typeof state[field] !== "string" || state[field].length === 0) {
      throw new InvalidStateError(`${field} must be a non-empty string`);
    }
  }
  for (const field of ["route_version", "current_node", "last_confirmed_node", "pending_arrival_node", "paused_step_target", "start_candidate_node", "pending_confirmation_node", "blocked_reason", "abort_reason", "last_reason"]) {
    if (typeof state[field] !== "string" || state[field].length === 0) {
      throw new InvalidStateError(`${field} must be a non-empty string`);
    }
  }
  if (state.step_index !== UNKNOWN && (!Number.isInteger(state.step_index) || state.step_index < 0)) {
    throw new InvalidStateError("step_index must be a non-negative integer or unknown");
  }
  if (state.step_count !== UNKNOWN && (!Number.isInteger(state.step_count) || state.step_count < 0)) {
    throw new InvalidStateError("step_count must be a non-negative integer or unknown");
  }
  if (typeof state.arrival_confirmed !== "boolean" || typeof state.completed !== "boolean") {
    throw new InvalidStateError("arrival_confirmed and completed must be booleans");
  }
  if (state.completed !== (state.status === "completed")) {
    throw new InvalidStateError("completed must match the completed status");
  }
  if (!Array.isArray(state.relocation_candidates)) {
    throw new InvalidStateError("relocation_candidates must be an array");
  }
  return state;
}

export function createInitialState(options = {}) {
  if (!isRecord(options)) {
    throw new InvalidStateError("initial state options must be an object");
  }
  const session_id = options.session_id ?? options.sessionId ?? "session-unknown";
  const route_id = options.route_id ?? options.routeId ?? "y28-y26-y23-manual-v1";
  const route_version = options.route_version ?? options.routeVersion ?? UNKNOWN;
  const state = {
    schema_version: SCHEMA_VERSION,
    session_id,
    route_id,
    route_version,
    status: "not_started",
    navigation_state: "not_started",
    current_node: UNKNOWN,
    last_confirmed_node: UNKNOWN,
    step_index: UNKNOWN,
    // The route implementation knows the two local transitions, but the MVP
    // contract keeps the user-facing step count unknown until separately verified.
    step_count: UNKNOWN,
    arrival_confirmed: false,
    completed: false,
    pending_arrival_node: UNKNOWN,
    paused_step_target: UNKNOWN,
    start_candidate_node: UNKNOWN,
    relocation_candidates: [],
    pending_confirmation_node: UNKNOWN,
    recovery_origin_status: UNKNOWN,
    blocked_reason: UNKNOWN,
    abort_reason: UNKNOWN,
    last_reason: UNKNOWN,
    last_landmark_ref: UNKNOWN,
  };
  return freezeState(assertState(state));
}

function defaultActor(event_type) {
  if (event_type === "step_displayed" || event_type === "landmark_viewed" || event_type === "route_completed") {
    return "system";
  }
  if (typeof event_type === "string" && event_type.startsWith("sensor_")) {
    return "system";
  }
  return "user";
}

function defaultSource(event_type) {
  if (event_type === "step_displayed" || event_type === "landmark_viewed" || event_type === "route_completed") {
    return "system";
  }
  if (typeof event_type === "string" && event_type.startsWith("sensor_")) {
    return "sensor";
  }
  return "user_confirmed";
}

function normalizeCommand(state, input) {
  if (!isRecord(input)) {
    throw new EventValidationError("event command must be an object");
  }
  const event_type = Object.hasOwn(input, "event_type") ? input.event_type : input.type;
  const valueOr = (field, fallback) => (Object.hasOwn(input, field) ? input[field] : fallback);
  const command = {
    ...input,
    schema_version: valueOr("schema_version", SCHEMA_VERSION),
    event_type,
    session_id: valueOr("session_id", state.session_id),
    route_id: valueOr("route_id", state.route_id),
    route_version: valueOr("route_version", state.route_version),
    state_before: valueOr("state_before", state.status),
    actor: valueOr("actor", defaultActor(event_type)),
    source: valueOr("source", defaultSource(event_type)),
    node_id: valueOr("node_id", UNKNOWN),
    from_node_id: valueOr("from_node_id", UNKNOWN),
    to_node_id: valueOr("to_node_id", UNKNOWN),
    step_index: valueOr("step_index", state.step_index),
    step_count: valueOr("step_count", UNKNOWN),
    confidence: valueOr("confidence", UNKNOWN),
    evidence_refs: valueOr("evidence_refs", UNKNOWN),
    reason: valueOr("reason", UNKNOWN),
  };

  // Validate the complete envelope before consulting transition rules. A
  // draft state_after is sufficient for shape validation; the real value is
  // checked after the deterministic transition has been selected.
  validateEvent({
    ...command,
    state_after: valueOr("state_after", state.status),
  });
  if (command.session_id !== state.session_id || command.route_id !== state.route_id) {
    failTransition("event session_id and route_id must match the state", command, "CONTEXT_MISMATCH");
  }
  if (command.route_version !== state.route_version) {
    failTransition("event route_version must match the state", command, "CONTEXT_MISMATCH");
  }
  if (command.state_before !== state.status) {
    failTransition("state_before does not match the current state", command, "STATE_BEFORE_MISMATCH");
  }
  return command;
}

function currentStep(state) {
  return ROUTE_STEPS.find((step) => step.from_node_id === state.current_node) ?? null;
}

function nodeFromCommand(command) {
  if (command.node_id !== UNKNOWN) {
    return command.node_id;
  }
  if (command.to_node_id !== UNKNOWN) {
    return command.to_node_id;
  }
  return UNKNOWN;
}

function assertKnownNode(node, command, message = "node must be a known route node") {
  if (!NODE_SET.has(node)) {
    failTransition(message, command, "UNKNOWN_NODE");
  }
}

function assertOptionalTarget(command, expected, field = "to_node_id") {
  const actual = command[field];
  if (actual !== UNKNOWN && actual !== expected) {
    failTransition(`${field} must be ${expected} for this transition`, command, "TARGET_MISMATCH");
  }
}

function isExplicitUserConfirmation(command) {
  return command.actor === "user"
    && command.source === "user_confirmed"
    && command.confirmed_by_user !== false;
}

function hasSufficientConfirmation(command, target) {
  if (!isExplicitUserConfirmation(command) || !SUFFICIENT_CONFIDENCES.has(command.confidence)) {
    return false;
  }
  // A required node field that is still unknown cannot be rescued by a known
  // to_node_id or by the route's expected destination.
  if (command.node_id === UNKNOWN || target === UNKNOWN || command.conflict === true) {
    return false;
  }
  if (command.candidate_status === "conflict" || command.candidate_status === UNKNOWN || command.ground_truth_status === UNKNOWN) {
    return false;
  }
  for (const field of ["level_ref", "direction", "walkable_path", "landmark_ref"]) {
    if (Object.hasOwn(command, field) && command[field] === UNKNOWN) {
      return false;
    }
  }
  return true;
}

function requireUserConfirmation(command) {
  if (!isExplicitUserConfirmation(command)) {
    failTransition("this transition requires an explicit user confirmation", command, "USER_CONFIRMATION_REQUIRED");
  }
}

function confirmationFields(command, {
  node_id = UNKNOWN,
  from_node_id = UNKNOWN,
  to_node_id = UNKNOWN,
  step_index = undefined,
  result = undefined,
} = {}) {
  return {
    node_id,
    from_node_id,
    to_node_id,
    ...(step_index !== undefined ? { step_index } : {}),
    ...(result ? { result } : {}),
  };
}

function normalizeCandidateInput(command) {
  const raw = command.candidates ?? command.candidate_nodes;
  if (raw === UNKNOWN || raw === undefined || raw === null) {
    return [];
  }
  if (!Array.isArray(raw)) {
    failTransition("candidates must be an array or unknown", command, "INVALID_CANDIDATES");
  }
  return raw.map((candidate) => {
    if (typeof candidate === "string") {
      return { node_id: candidate, status: candidate === UNKNOWN ? UNKNOWN : "candidate" };
    }
    if (!isRecord(candidate)) {
      failTransition("each candidate must be a node id or object", command, "INVALID_CANDIDATES");
    }
    const node_id = candidate.node_id ?? UNKNOWN;
    const status = candidate.status ?? "candidate";
    if (typeof node_id !== "string" || ![...NODE_SET, UNKNOWN].includes(node_id)) {
      failTransition("candidate node_id must be a known node or unknown", command, "INVALID_CANDIDATES");
    }
    if (!["candidate", "confirmed", "conflict", UNKNOWN].includes(status)) {
      failTransition("candidate status is invalid", command, "INVALID_CANDIDATES");
    }
    return {
      ...candidate,
      node_id,
      // A shown candidate is never trusted merely because its payload says
      // confirmed; a later user event must do that promotion.
      status: node_id === UNKNOWN || status === UNKNOWN ? UNKNOWN : "candidate",
    };
  });
}

function safeCandidates(candidates) {
  return candidates.filter((candidate) => NODE_SET.has(candidate.node_id) && candidate.status === "candidate");
}

function candidateIds(state) {
  return new Set(safeCandidates(state.relocation_candidates).map((candidate) => candidate.node_id));
}

function insufficientReason(command, fallback) {
  if (command.reason !== UNKNOWN) {
    return command.reason;
  }
  if (command.conflict === true || command.candidate_status === "conflict") {
    return "conflicting_confirmation";
  }
  if (command.node_id === UNKNOWN && command.to_node_id === UNKNOWN) {
    return "unknown_node";
  }
  return fallback;
}

function reduceTransition(state, command) {
  if (isSensorEvent(command)) {
    return {
      state,
      fields: { result: "no_op" },
    };
  }

  if (TERMINAL_STATES.has(state.status)) {
    failTransition("terminal state accepts only sensor no-op events", command, "TERMINAL_STATE");
  }

  switch (command.event_type) {
    case "session_started": {
      if (state.status !== "not_started") {
        failTransition("session_started is only valid before a session starts", command);
      }
      return {
        state: transitionState(state, "start_confirmation_required", {
          current_node: UNKNOWN,
          last_confirmed_node: UNKNOWN,
          step_index: UNKNOWN,
          arrival_confirmed: false,
          completed: false,
          pending_arrival_node: UNKNOWN,
          paused_step_target: UNKNOWN,
          start_candidate_node: UNKNOWN,
          relocation_candidates: [],
          pending_confirmation_node: UNKNOWN,
          recovery_origin_status: UNKNOWN,
          blocked_reason: UNKNOWN,
          abort_reason: UNKNOWN,
          last_reason: command.reason,
          last_landmark_ref: UNKNOWN,
        }),
        fields: confirmationFields(command, { result: "started" }),
      };
    }

    case "start_candidate_shown": {
      if (state.status !== "start_confirmation_required") {
        failTransition("start_candidate_shown requires start confirmation", command);
      }
      const candidate = nodeFromCommand(command);
      if (candidate !== UNKNOWN) {
        assertKnownNode(candidate, command, "start candidate must be a known route node or unknown");
      }
      return {
        state: transitionState(state, state.status, {
          start_candidate_node: candidate,
          last_reason: command.reason,
        }),
        fields: confirmationFields(command, { node_id: candidate, result: "candidate_only" }),
      };
    }

    case "start_confirmed": {
      if (state.status !== "start_confirmation_required") {
        failTransition("start_confirmed requires start confirmation", command);
      }
      requireUserConfirmation(command);
      const target = nodeFromCommand(command);
      if (target !== UNKNOWN && target !== "Y28") {
        failTransition("the only allowed start node is Y28", command, "START_NODE_MISMATCH");
      }
      assertOptionalTarget(command, "Y28");
      if (!hasSufficientConfirmation(command, target)) {
        return {
          state: transitionState(state, state.status, {
            last_reason: insufficientReason(command, "start_confirmation_insufficient"),
          }),
          fields: confirmationFields(command, {
            node_id: target,
            to_node_id: "Y28",
            result: "not_confirmed",
          }),
        };
      }
      return {
        state: transitionState(state, "start_confirmed", {
          current_node: "Y28",
          last_confirmed_node: "Y28",
          step_index: 0,
          arrival_confirmed: false,
          completed: false,
          pending_arrival_node: UNKNOWN,
          paused_step_target: UNKNOWN,
          start_candidate_node: UNKNOWN,
          relocation_candidates: [],
          pending_confirmation_node: UNKNOWN,
          recovery_origin_status: UNKNOWN,
          blocked_reason: UNKNOWN,
          abort_reason: UNKNOWN,
          last_reason: command.reason,
        }),
        fields: confirmationFields(command, {
          node_id: "Y28",
          to_node_id: "Y28",
          step_index: 0,
          result: "confirmed",
        }),
      };
    }

    case "step_displayed": {
      if (state.status !== "start_confirmed" && state.status !== "step_confirmed") {
        failTransition("step_displayed requires a confirmed node", command);
      }
      const step = currentStep(state);
      if (!step) {
        failTransition("there is no next step from the current node", command, "NO_NEXT_STEP");
      }
      assertOptionalTarget(command, step.from_node_id, "from_node_id");
      assertOptionalTarget(command, step.to_node_id);
      return {
        state: transitionState(state, "step_guidance", {
          step_index: step.step_index,
          arrival_confirmed: false,
          pending_arrival_node: step.to_node_id,
          paused_step_target: UNKNOWN,
          pending_confirmation_node: UNKNOWN,
          recovery_origin_status: UNKNOWN,
          last_reason: command.reason,
        }),
        fields: confirmationFields(command, {
          node_id: step.from_node_id,
          from_node_id: step.from_node_id,
          to_node_id: step.to_node_id,
          step_index: step.step_index,
          result: "guidance_displayed",
        }),
      };
    }

    case "landmark_viewed": {
      if (state.status !== "step_guidance") {
        failTransition("landmark_viewed requires step guidance", command);
      }
      return {
        state: transitionState(state, state.status, {
          last_landmark_ref: command.landmark_ref ?? UNKNOWN,
          last_reason: command.reason,
        }),
        fields: confirmationFields(command, { result: "recorded" }),
      };
    }

    case "arrival_reported": {
      if (state.status !== "step_guidance") {
        failTransition("arrival_reported requires step guidance", command);
      }
      const expected = state.pending_arrival_node;
      assertKnownNode(expected, command, "arrival target is unknown");
      if (command.node_id !== UNKNOWN && command.node_id !== expected) {
        failTransition("arrival report does not match the displayed target", command, "TARGET_MISMATCH");
      }
      assertOptionalTarget(command, expected);
      return {
        state: transitionState(state, "arrival_confirmation_required", {
          arrival_confirmed: false,
          pending_arrival_node: expected,
          pending_confirmation_node: UNKNOWN,
          last_reason: command.reason,
        }),
        fields: confirmationFields(command, {
          node_id: command.node_id,
          from_node_id: state.current_node,
          to_node_id: expected,
          step_index: state.step_index,
          result: "awaiting_confirmation",
        }),
      };
    }

    case "arrival_confirmed":
    case "step_confirmed": {
      if (state.status !== "arrival_confirmation_required" && state.status !== "manual_confirmation_required") {
        failTransition("arrival confirmation requires a reported arrival", command);
      }
      if (state.pending_arrival_node === UNKNOWN) {
        failTransition("there is no pending arrival to confirm", command, "NO_PENDING_ARRIVAL");
      }
      requireUserConfirmation(command);
      const expected = state.pending_arrival_node;
      const target = nodeFromCommand(command);
      if (target !== UNKNOWN && target !== expected) {
        failTransition("arrival confirmation does not match the displayed target", command, "TARGET_MISMATCH");
      }
      assertOptionalTarget(command, expected);
      // Do not substitute the instruction's expected target for an unknown
      // user-confirmation node: unknown evidence must never become confirmed.
      if (!hasSufficientConfirmation(command, target)) {
        return {
          state: transitionState(state, "manual_confirmation_required", {
            arrival_confirmed: false,
            pending_arrival_node: expected,
            pending_confirmation_node: UNKNOWN,
            last_reason: insufficientReason(command, "arrival_confirmation_insufficient"),
          }),
          fields: confirmationFields(command, {
            node_id: target,
            from_node_id: state.current_node,
            to_node_id: expected,
            step_index: state.step_index,
            result: "not_confirmed",
          }),
        };
      }
      return {
        state: transitionState(state, "step_confirmed", {
          current_node: expected,
          last_confirmed_node: expected,
          arrival_confirmed: true,
          completed: false,
          pending_arrival_node: UNKNOWN,
          pending_confirmation_node: UNKNOWN,
          relocation_candidates: [],
          paused_step_target: UNKNOWN,
          recovery_origin_status: UNKNOWN,
          blocked_reason: UNKNOWN,
          last_reason: command.reason,
        }),
        fields: confirmationFields(command, {
          node_id: expected,
          from_node_id: state.current_node,
          to_node_id: expected,
          step_index: state.step_index,
          result: "confirmed",
        }),
      };
    }

    case "route_completed": {
      if (state.status !== "step_confirmed" || state.current_node !== "Y23" || !state.arrival_confirmed) {
        failTransition("route_completed requires a confirmed arrival at Y23", command, "COMPLETION_REQUIRES_Y23");
      }
      if (!(command.actor === "system" && command.source === "system") && !isExplicitUserConfirmation(command)) {
        failTransition("route_completed must follow user confirmation or be a system outcome", command, "USER_CONFIRMATION_REQUIRED");
      }
      assertOptionalTarget(command, "Y23", "node_id");
      assertOptionalTarget(command, "Y23", "from_node_id");
      assertOptionalTarget(command, "Y23", "to_node_id");
      return {
        state: transitionState(state, "completed", {
          current_node: "Y23",
          last_confirmed_node: "Y23",
          arrival_confirmed: true,
          completed: true,
          pending_arrival_node: UNKNOWN,
          pending_confirmation_node: UNKNOWN,
          last_reason: command.reason,
        }),
        fields: confirmationFields(command, {
          node_id: "Y23",
          from_node_id: "Y23",
          to_node_id: "Y23",
          step_index: state.step_index,
          result: "completed",
        }),
      };
    }

    case "wrong_route_reported": {
      if (state.status !== "step_guidance") {
        failTransition("wrong_route_reported requires active step guidance", command);
      }
      requireUserConfirmation(command);
      if (command.node_id !== UNKNOWN && command.node_id !== state.current_node) {
        failTransition("wrong-route report must retain the current confirmed node", command, "CURRENT_NODE_MISMATCH");
      }
      assertOptionalTarget(command, state.pending_arrival_node);
      return {
        state: transitionState(state, "recovery_required", {
          paused_step_target: state.pending_arrival_node,
          pending_arrival_node: UNKNOWN,
          pending_confirmation_node: UNKNOWN,
          relocation_candidates: [],
          arrival_confirmed: false,
          recovery_origin_status: "step_guidance",
          last_reason: command.reason,
        }),
        fields: confirmationFields(command, {
          node_id: state.current_node,
          from_node_id: state.current_node,
          to_node_id: state.pending_arrival_node,
          step_index: state.step_index,
          result: "recovery_required",
        }),
      };
    }

    case "relocation_candidate_shown": {
      if (state.status !== "recovery_required" && state.status !== "blocked_unknown") {
        failTransition("relocation candidates require recovery or a blocked state", command);
      }
      const candidates = normalizeCandidateInput(command);
      const safe = safeCandidates(candidates);
      if (safe.length === 0) {
        return {
          state: transitionState(state, "blocked_unknown", {
            relocation_candidates: candidates,
            pending_confirmation_node: UNKNOWN,
            blocked_reason: command.reason === UNKNOWN ? "no_safe_candidate" : command.reason,
            last_reason: command.reason,
          }),
          fields: confirmationFields(command, { result: "blocked_unknown" }),
        };
      }
      return {
        state: transitionState(state, "manual_relocation", {
          relocation_candidates: candidates,
          pending_confirmation_node: UNKNOWN,
          blocked_reason: UNKNOWN,
          last_reason: command.reason,
        }),
        fields: confirmationFields(command, { result: "manual_relocation" }),
      };
    }

    case "manual_confirmation_required": {
      if (state.status !== "manual_relocation" && state.status !== "arrival_confirmation_required" && state.status !== "manual_confirmation_required" && state.status !== "blocked_unknown") {
        failTransition("manual confirmation is only valid after an uncertain observation", command);
      }
      if (state.status === "blocked_unknown") {
        const candidates = normalizeCandidateInput(command);
        const safe = safeCandidates(candidates);
        if (safe.length === 0) {
          return {
            state: transitionState(state, "blocked_unknown", {
              blocked_reason: command.reason === UNKNOWN ? "no_safe_candidate" : command.reason,
              last_reason: command.reason,
            }),
            fields: confirmationFields(command, { result: "blocked_unknown" }),
          };
        }
        return {
          state: transitionState(state, "manual_relocation", {
            relocation_candidates: candidates,
            pending_confirmation_node: UNKNOWN,
            blocked_reason: UNKNOWN,
            last_reason: command.reason,
          }),
          fields: confirmationFields(command, { result: "manual_relocation" }),
        };
      }
      if (state.status === "manual_relocation") {
        const ids = candidateIds(state);
        const target = nodeFromCommand(command);
        if (target !== UNKNOWN && !ids.has(target)) {
          failTransition("manual confirmation must refer to a displayed candidate", command, "CANDIDATE_NOT_LISTED");
        }
        return {
          state: transitionState(state, "manual_confirmation_required", {
            pending_confirmation_node: target,
            last_reason: insufficientReason(command, "manual_confirmation_required"),
          }),
          fields: confirmationFields(command, {
            node_id: target,
            result: "manual_confirmation_required",
          }),
        };
      }
      return {
        state: transitionState(state, "manual_confirmation_required", {
          last_reason: insufficientReason(command, "manual_confirmation_required"),
        }),
        fields: confirmationFields(command, { result: "manual_confirmation_required" }),
      };
    }

    case "relocation_confirmed": {
      if (state.status !== "manual_relocation" && state.status !== "manual_confirmation_required") {
        failTransition("relocation_confirmed requires manual relocation", command);
      }
      requireUserConfirmation(command);
      const ids = candidateIds(state);
      const target = nodeFromCommand(command);
      if (target !== UNKNOWN && !ids.has(target)) {
        failTransition("only a displayed candidate can be manually confirmed", command, "CANDIDATE_NOT_LISTED");
      }
      if (target !== UNKNOWN) {
        assertOptionalTarget(command, target);
      }
      const targetForConfidence = target;
      if (!hasSufficientConfirmation(command, targetForConfidence)) {
        if (ids.size === 0) {
          return {
            state: transitionState(state, "blocked_unknown", {
              pending_confirmation_node: UNKNOWN,
              blocked_reason: "no_safe_candidate",
              last_reason: "no_safe_candidate",
            }),
            fields: confirmationFields(command, { node_id: target, result: "blocked_unknown" }),
          };
        }
        return {
          state: transitionState(state, "manual_confirmation_required", {
            pending_confirmation_node: target,
            last_reason: insufficientReason(command, "relocation_confirmation_insufficient"),
          }),
          fields: confirmationFields(command, {
            node_id: target,
            result: "not_confirmed",
          }),
        };
      }
      const nextStep = ROUTE_STEPS.find((step) => step.from_node_id === target);
      if (target === "Y23") {
        return {
          state: transitionState(state, "completed", {
            current_node: "Y23",
            last_confirmed_node: "Y23",
            step_index: 1,
            arrival_confirmed: true,
            completed: true,
            pending_arrival_node: UNKNOWN,
            paused_step_target: UNKNOWN,
            pending_confirmation_node: UNKNOWN,
            relocation_candidates: [],
            recovery_origin_status: UNKNOWN,
            blocked_reason: UNKNOWN,
            last_reason: command.reason,
          }),
          fields: confirmationFields(command, {
            node_id: "Y23",
            from_node_id: state.current_node,
            to_node_id: "Y23",
            step_index: 1,
            result: "completed",
          }),
        };
      }
      return {
        state: transitionState(state, "step_guidance", {
          current_node: target,
          last_confirmed_node: target,
          step_index: nextStep?.step_index ?? UNKNOWN,
          arrival_confirmed: false,
          completed: false,
          pending_arrival_node: nextStep?.to_node_id ?? UNKNOWN,
          paused_step_target: UNKNOWN,
          pending_confirmation_node: UNKNOWN,
          relocation_candidates: [],
          recovery_origin_status: UNKNOWN,
          blocked_reason: UNKNOWN,
          last_reason: command.reason,
        }),
        fields: confirmationFields(command, {
          node_id: target,
          from_node_id: state.current_node,
          to_node_id: target,
          step_index: nextStep?.step_index ?? UNKNOWN,
          result: "guidance_resumed",
        }),
      };
    }

    case "no_safe_candidate": {
      if (state.status !== "recovery_required" && state.status !== "manual_relocation" && state.status !== "manual_confirmation_required" && state.status !== "blocked_unknown") {
        failTransition("no_safe_candidate requires a recovery or manual-confirmation state", command);
      }
      return {
        state: transitionState(state, "blocked_unknown", {
          pending_confirmation_node: UNKNOWN,
          blocked_reason: command.reason === UNKNOWN ? "no_safe_candidate" : command.reason,
          last_reason: command.reason,
        }),
        fields: confirmationFields(command, { result: "blocked_unknown" }),
      };
    }

    case "route_aborted": {
      if (TERMINAL_STATES.has(state.status)) {
        failTransition("route_aborted cannot be applied after termination", command, "TERMINAL_STATE");
      }
      if (command.actor !== "user" && command.actor !== "system") {
        failTransition("route_aborted requires a valid actor", command);
      }
      return {
        state: transitionState(state, "aborted", {
          completed: false,
          arrival_confirmed: false,
          pending_arrival_node: UNKNOWN,
          pending_confirmation_node: UNKNOWN,
          paused_step_target: UNKNOWN,
          relocation_candidates: [],
          abort_reason: command.reason,
          last_reason: command.reason,
        }),
        fields: confirmationFields(command, {
          node_id: state.current_node,
          from_node_id: state.current_node,
          step_index: state.step_index,
          result: "aborted",
        }),
      };
    }

    default:
      failTransition(`unsupported event type: ${String(command.event_type)}`, command, "UNSUPPORTED_EVENT");
  }
}

function finalizeEvent(state, nextState, command, fields) {
  if (command.state_after !== undefined && command.state_after !== nextState.status) {
    failTransition("state_after does not match the deterministic transition", command, "STATE_AFTER_MISMATCH");
  }
  return createEvent({
    ...command,
    ...fields,
    state_before: state.status,
    state_after: nextState.status,
    session_id: state.session_id,
    route_id: state.route_id,
    route_version: state.route_version,
    // Gate 4A has not verified a step count; keep the contract's explicit
    // unknown instead of allowing a caller or candidate source to assert one.
    step_count: UNKNOWN,
  });
}

/**
 * Apply one command and return both the next state and its complete event.
 * No time, randomness, GPS, or sensor detector is consulted here.
 */
export function transition(state, input) {
  assertState(state);
  const command = normalizeCommand(state, input);
  const { state: nextState, fields } = reduceTransition(state, command);
  assertState(nextState);
  const event = finalizeEvent(state, nextState, command, fields);
  return { state: nextState, event };
}

/** Conventional reducer form for callers that only need the state. */
export function reduce(state, input) {
  return transition(state, input).state;
}

export const dispatch = transition;
export const reduceWithEvent = transition;
export const applyEvent = reduce;

/**
 * Replay a complete ordered event log. Sequence numbers and relative elapsed
 * times are checked by the replay loop; the reducer itself remains pure.
 */
export function replay(initialState, events) {
  assertState(initialState);
  if (!Array.isArray(events)) {
    throw new EventValidationError("events must be an array");
  }
  let state = initialState;
  let previousElapsed = -Infinity;
  const eventIds = new Set();

  for (let index = 0; index < events.length; index += 1) {
    const event = events[index];
    validateEvent(event);
    if (event.sequence_no !== index + 1) {
      throw new EventValidationError(`expected sequence_no ${index + 1}`, "sequence_no");
    }
    if (eventIds.has(event.event_id)) {
      throw new EventValidationError("event_id must be unique during replay", "event_id");
    }
    eventIds.add(event.event_id);
    if (event.occurred_at_elapsed_ms < previousElapsed) {
      throw new EventValidationError("occurred_at_elapsed_ms must be monotonic during replay", "occurred_at_elapsed_ms");
    }
    previousElapsed = event.occurred_at_elapsed_ms;

    const result = transition(state, event);
    if (result.event.state_before !== event.state_before || result.event.state_after !== event.state_after) {
      throw new EventValidationError("event state envelope does not replay to the recorded transition", "state_after");
    }
    state = result.state;
  }
  return state;
}

export function validateState(state) {
  return assertState(state);
}
