import {
  createInitialState,
  replay,
  transition,
} from "../../state/manual_visual_machine.mjs";

const UNKNOWN = "unknown";

function createOpaqueSessionId(cryptoApi = globalThis.crypto) {
  if (typeof cryptoApi?.randomUUID === "function") {
    return `gate4a-${cryptoApi.randomUUID()}`;
  }
  if (typeof cryptoApi?.getRandomValues === "function") {
    const bytes = cryptoApi.getRandomValues(new Uint8Array(16));
    return `gate4a-${Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("")}`;
  }
  throw new Error("Secure random session ID is unavailable");
}

function requireConfirmedValue(field, label) {
  if (!field || field.status !== "confirmed" || field.value === UNKNOWN) {
    throw new Error(`${label} is not confirmed in the route fixture`);
  }
  return field.value;
}

export function validateUiFixture(fixture) {
  if (!fixture || typeof fixture !== "object") {
    throw new Error("Route fixture must be an object");
  }
  const sequence = requireConfirmedValue(fixture.route?.sequence, "route.sequence");
  if (!Array.isArray(sequence) || sequence.length !== 3) {
    throw new Error("Gate 4A UI requires one confirmed three-node route");
  }
  if (!Array.isArray(fixture.steps) || fixture.steps.length !== 2) {
    throw new Error("Gate 4A UI requires exactly two fixture steps");
  }
  for (const [index, step] of fixture.steps.entries()) {
    requireConfirmedValue(step.instruction, `steps[${index}].instruction`);
    requireConfirmedValue(step.landmark_ref, `steps[${index}].landmark_ref`);
    if (step.step_index !== index + 1) {
      throw new Error("Fixture step indexes must be one-based and ordered");
    }
  }
  return fixture;
}

export class ManualVisualSession {
  constructor(fixture, options = {}) {
    this.fixture = validateUiFixture(fixture);
    this.clock = options.clock ?? (() => performance.now());
    this.startedAt = this.clock();
    this.lastElapsed = 0;
    this.events = [];
    this.sessionId = options.sessionId ?? createOpaqueSessionId(options.cryptoApi);
    this.state = createInitialState({
      session_id: this.sessionId,
      route_id: fixture.route.route_id,
      route_version: fixture.route.version,
    });
  }

  #command(eventType, fields = {}) {
    const elapsed = Math.max(
      this.lastElapsed,
      Math.floor(this.clock() - this.startedAt),
    );
    this.lastElapsed = elapsed;
    return {
      event_id: `${this.sessionId}-event-${this.events.length + 1}`,
      session_id: this.sessionId,
      route_id: this.fixture.route.route_id,
      route_version: this.fixture.route.version,
      sequence_no: this.events.length + 1,
      occurred_at_elapsed_ms: elapsed,
      event_type: eventType,
      actor: "user",
      source: "user_confirmed",
      node_id: UNKNOWN,
      from_node_id: UNKNOWN,
      to_node_id: UNKNOWN,
      step_index: this.state.step_index,
      step_count: UNKNOWN,
      confidence: UNKNOWN,
      evidence_refs: UNKNOWN,
      reason: UNKNOWN,
      ...fields,
    };
  }

  #apply(eventType, fields = {}) {
    const result = transition(this.state, this.#command(eventType, fields));
    this.state = result.state;
    this.events.push(result.event);
    return result;
  }

  start() {
    this.#apply("session_started", {
      actor: "system",
      source: "system",
      reason: "manual_visual_ui_started",
    });
    const startNode = this.fixture.route.sequence.value[0];
    this.#apply("start_candidate_shown", {
      actor: "system",
      source: "visual_reference",
      node_id: startNode,
      confidence: "high",
      evidence_refs: ["fixture:route.sequence"],
      reason: "fixture_start_candidate",
    });
    return this.state;
  }

  confirmStart() {
    const startNode = this.fixture.route.sequence.value[0];
    this.#apply("start_confirmed", {
      node_id: startNode,
      to_node_id: startNode,
      confidence: "confirmed",
      confirmed_by_user: true,
      evidence_refs: [`fixture:node:${startNode}`],
      reason: "user_visually_confirmed_start",
    });
    this.#displayCurrentStep();
    return this.state;
  }

  reportStartLowConfidence() {
    const startNode = this.fixture.route.sequence.value[0];
    this.#apply("start_confirmed", {
      node_id: startNode,
      to_node_id: startNode,
      confidence: "low",
      confirmed_by_user: true,
      reason: "user_cannot_confirm_start_low_confidence",
    });
    return this.state;
  }

  #displayCurrentStep() {
    const step = this.currentStep;
    if (!step) {
      throw new Error("No fixture step matches the confirmed node");
    }
    this.#apply("step_displayed", {
      actor: "system",
      source: "system",
      from_node_id: step.from_node_id,
      to_node_id: step.to_node_id,
      evidence_refs: [`fixture:step:${step.step_id}`],
      reason: "single_step_guidance_displayed",
    });
  }

  reportArrival() {
    const step = this.currentStep;
    this.#apply("arrival_reported", {
      node_id: UNKNOWN,
      from_node_id: this.state.current_node,
      to_node_id: step.to_node_id,
      confidence: UNKNOWN,
      reason: "user_reports_possible_arrival",
    });
    return this.state;
  }

  confirmArrival() {
    const target = this.state.pending_arrival_node;
    this.#apply("arrival_confirmed", {
      node_id: target,
      from_node_id: this.state.current_node,
      to_node_id: target,
      confidence: "confirmed",
      confirmed_by_user: true,
      evidence_refs: [`fixture:node:${target}`],
      reason: "user_visually_confirmed_arrival",
    });
    if (target === this.fixture.route.sequence.value.at(-1)) {
      this.#apply("route_completed", {
        actor: "system",
        source: "system",
        node_id: target,
        from_node_id: target,
        to_node_id: target,
        reason: "final_node_manually_confirmed",
      });
    } else {
      this.#displayCurrentStep();
    }
    return this.state;
  }

  deferArrivalLowConfidence() {
    const target = this.state.pending_arrival_node;
    this.#apply("arrival_confirmed", {
      node_id: target,
      to_node_id: target,
      confidence: "low",
      confirmed_by_user: true,
      reason: "user_cannot_confirm_arrival_low_confidence",
    });
    return this.state;
  }

  reportWrongRoute(reason = "user_reports_wrong_route") {
    const step = this.currentStep;
    this.#apply("wrong_route_reported", {
      node_id: this.state.current_node,
      from_node_id: this.state.current_node,
      to_node_id: step.to_node_id,
      confidence: "confirmed",
      confirmed_by_user: true,
      reason,
    });
    this.#showFixtureCandidates(reason);
    return this.state;
  }

  reportLowConfidence() {
    return this.reportWrongRoute("user_cannot_recognize_landmark_low_confidence");
  }

  #showFixtureCandidates(reason) {
    const step = this.fixture.steps[this.state.step_index];
    const approved = step?.wrong_route_candidates?.status === "confirmed"
      ? step.wrong_route_candidates.value.filter((candidate) => candidate.status === "confirmed")
      : [];
    this.#apply("relocation_candidate_shown", {
      actor: "system",
      source: "visual_reference",
      candidates: approved.map((candidate) => ({
        node_id: candidate.node_id,
        status: "candidate",
        reason: candidate.reason,
      })),
      evidence_refs: approved.length > 0
        ? [`fixture:step:${step.step_id}:wrong_route_candidates`]
        : UNKNOWN,
      reason: approved.length > 0 ? reason : "no_safe_candidate",
    });
  }

  selectRelocation(nodeId) {
    this.#apply("manual_confirmation_required", {
      node_id: nodeId,
      to_node_id: nodeId,
      confidence: "low",
      candidate_status: "candidate",
      reason: "user_selected_candidate_pending_confirmation",
    });
    return this.state;
  }

  confirmRelocation() {
    const nodeId = this.state.pending_confirmation_node;
    this.#apply("relocation_confirmed", {
      node_id: nodeId,
      to_node_id: nodeId,
      confidence: "confirmed",
      candidate_status: "confirmed",
      confirmed_by_user: true,
      evidence_refs: [`fixture:node:${nodeId}:manual_relocation`],
      reason: "user_visually_confirmed_relocation",
    });
    return this.state;
  }

  abort(reason = "user_aborted") {
    this.#apply("route_aborted", {
      confidence: "confirmed",
      confirmed_by_user: true,
      reason,
    });
    return this.state;
  }

  recordSensorObservation(fields = {}) {
    return this.#apply("sensor_observation_recorded", {
      actor: "system",
      source: "sensor",
      confidence: UNKNOWN,
      reason: "diagnostic_sensor_observation",
      ...fields,
    });
  }

  replay() {
    return replay(createInitialState({
      session_id: this.sessionId,
      route_id: this.fixture.route.route_id,
      route_version: this.fixture.route.version,
    }), this.events);
  }

  exportSnapshot() {
    return {
      export_schema: "gate4a-manual-visual-memory-v1",
      contains_personal_data: false,
      route_id: this.fixture.route.route_id,
      route_version: this.fixture.route.version,
      final_state: this.state,
      events: this.events,
    };
  }

  get currentStep() {
    return this.fixture.steps.find(
      (step) => step.from_node_id === this.state.current_node,
    ) ?? null;
  }
}
