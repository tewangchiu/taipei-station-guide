import test from "node:test";
import assert from "node:assert/strict";

import {
  EventValidationError,
  createEvent,
  validateEvent,
} from "../../src/contracts/manual_visual_events.mjs";
import {
  createInitialState,
  InvalidTransitionError,
  reduce,
  replay,
  transition,
} from "../../src/state/manual_visual_machine.mjs";

const SESSION_ID = "session-test-1";
const ROUTE_ID = "y28-y26-y23-manual-v1";

function command(sequence_no, occurred_at_elapsed_ms, event_type, fields = {}) {
  return {
    event_id: `event-${sequence_no}`,
    session_id: SESSION_ID,
    route_id: ROUTE_ID,
    sequence_no,
    occurred_at_elapsed_ms,
    event_type,
    actor: "user",
    source: "user_confirmed",
    node_id: "unknown",
    from_node_id: "unknown",
    to_node_id: "unknown",
    step_index: "unknown",
    step_count: "unknown",
    confidence: "unknown",
    evidence_refs: "unknown",
    reason: "unknown",
    ...fields,
  };
}

function buildReplayFixture() {
  let state = createInitialState({
    session_id: SESSION_ID,
    route_id: ROUTE_ID,
  });
  const events = [];

  function apply(event_type, fields = {}) {
    const sequence_no = events.length + 1;
    const result = transition(
      state,
      command(sequence_no, sequence_no * 100, event_type, fields),
    );
    state = result.state;
    events.push(result.event);
  }

  apply("session_started", { actor: "system", source: "system" });
  apply("start_confirmed", {
    node_id: "Y28",
    confidence: "confirmed",
    evidence_refs: ["fixture:start:Y28"],
  });
  apply("step_displayed", {
    actor: "system",
    source: "system",
    from_node_id: "Y28",
    to_node_id: "Y26",
  });
  apply("sensor_observation_recorded", {
    actor: "system",
    source: "sensor",
    confidence: "unknown",
    reason: "replay fixture sensor observation",
  });
  apply("arrival_reported", { node_id: "unknown", to_node_id: "Y26" });
  apply("arrival_confirmed", {
    node_id: "Y26",
    confidence: "high",
    evidence_refs: ["fixture:arrival:Y26"],
  });
  apply("step_displayed", {
    actor: "system",
    source: "system",
    from_node_id: "Y26",
    to_node_id: "Y23",
  });
  apply("arrival_reported", { node_id: "unknown", to_node_id: "Y23" });
  apply("arrival_confirmed", {
    node_id: "Y23",
    confidence: "confirmed",
    evidence_refs: ["fixture:arrival:Y23"],
  });
  apply("route_completed", {
    actor: "system",
    source: "system",
    reason: "final manually confirmed arrival",
  });

  return { state, events };
}

test("session start keeps the start as an explicit human-confirmation gate", () => {
  let state = createInitialState({
    session_id: SESSION_ID,
    route_id: ROUTE_ID,
  });

  const started = transition(
    state,
    command(1, 0, "session_started", {
      actor: "system",
      source: "system",
      reason: "manual visual session started",
    }),
  );
  state = started.state;

  assert.equal(state.status, "start_confirmation_required");
  assert.equal(state.current_node, "unknown");
  assert.equal(state.last_confirmed_node, "unknown");
  assert.equal(started.event.state_before, "not_started");
  assert.equal(started.event.state_after, "start_confirmation_required");

  const candidate = transition(
    state,
    command(2, 100, "start_candidate_shown", {
      actor: "system",
      source: "visual_reference",
      node_id: "Y28",
      confidence: "high",
      candidates: [{ node_id: "Y28", status: "candidate" }],
    }),
  );

  assert.equal(candidate.state.status, "start_confirmation_required");
  assert.equal(candidate.state.current_node, "unknown");
  assert.equal(candidate.state.last_confirmed_node, "unknown");
  assert.equal(candidate.state.arrival_confirmed, false);
});

test("happy path requires manual arrival confirmation for both route steps", () => {
  let state = createInitialState({
    session_id: SESSION_ID,
    route_id: ROUTE_ID,
  });
  const events = [];

  function apply(event_type, fields = {}) {
    const sequence_no = events.length + 1;
    const result = transition(
      state,
      command(sequence_no, sequence_no * 100, event_type, fields),
    );
    state = result.state;
    events.push(result.event);
    return result.event;
  }

  apply("session_started", {
    actor: "system",
    source: "system",
  });
  apply("start_confirmed", {
    node_id: "Y28",
    confidence: "confirmed",
    evidence_refs: ["fixture:start:Y28"],
  });
  apply("step_displayed", {
    actor: "system",
    source: "system",
    from_node_id: "Y28",
    to_node_id: "Y26",
  });
  assert.equal(state.status, "step_guidance");
  assert.equal(state.current_node, "Y28");
  assert.equal(state.step_index, 0);

  apply("arrival_reported", {
    node_id: "unknown",
    confidence: "unknown",
    to_node_id: "Y26",
  });
  assert.equal(state.status, "arrival_confirmation_required");
  assert.equal(state.current_node, "Y28");
  assert.equal(state.arrival_confirmed, false);

  const firstArrival = apply("arrival_confirmed", {
    node_id: "Y26",
    confidence: "confirmed",
    evidence_refs: ["fixture:arrival:Y26"],
  });
  assert.equal(firstArrival.state_after, "step_confirmed");
  assert.equal(state.current_node, "Y26");
  assert.equal(state.last_confirmed_node, "Y26");
  assert.equal(state.arrival_confirmed, true);
  assert.equal(state.completed, false);

  apply("step_displayed", {
    actor: "system",
    source: "system",
    from_node_id: "Y26",
    to_node_id: "Y23",
  });
  apply("arrival_reported", {
    node_id: "unknown",
    to_node_id: "Y23",
  });
  apply("arrival_confirmed", {
    node_id: "Y23",
    confidence: "high",
    evidence_refs: ["fixture:arrival:Y23"],
  });
  assert.equal(state.status, "step_confirmed");
  assert.equal(state.current_node, "Y23");
  assert.equal(state.completed, false);

  apply("route_completed", {
    actor: "system",
    source: "system",
    confidence: "unknown",
    reason: "final manually confirmed arrival",
  });
  assert.equal(state.status, "completed");
  assert.equal(state.navigation_state, "completed");
  assert.equal(state.current_node, "Y23");
  assert.equal(state.last_confirmed_node, "Y23");
  assert.equal(state.arrival_confirmed, true);
  assert.equal(state.completed, true);

  for (const event of events) {
    for (const field of [
      "schema_version",
      "event_id",
      "session_id",
      "route_id",
      "sequence_no",
      "occurred_at_elapsed_ms",
      "event_type",
      "state_before",
      "state_after",
      "actor",
      "source",
      "node_id",
      "from_node_id",
      "to_node_id",
      "step_index",
      "step_count",
      "confidence",
      "evidence_refs",
      "reason",
    ]) {
      assert.ok(Object.hasOwn(event, field), `${field} is required on ${event.event_type}`);
    }
    assert.equal(event.step_count, "unknown");
  }
});

test("unknown, low-confidence, and conflicting observations cannot confirm a node", () => {
  let state = createInitialState({
    session_id: SESSION_ID,
    route_id: ROUTE_ID,
  });

  state = transition(state, command(1, 0, "session_started", {
    actor: "system",
    source: "system",
  })).state;
  state = transition(state, command(2, 100, "start_candidate_shown", {
    actor: "system",
    source: "visual_reference",
    node_id: "Y28",
    confidence: "high",
  })).state;

  const unknownStart = transition(state, command(3, 200, "start_confirmed", {
    node_id: "Y28",
    confidence: "unknown",
  }));
  assert.equal(unknownStart.state.status, "start_confirmation_required");
  assert.equal(unknownStart.state.current_node, "unknown");
  assert.equal(unknownStart.event.result, "not_confirmed");

  state = transition(state, command(4, 300, "start_confirmed", {
    node_id: "Y28",
    confidence: "high",
    evidence_refs: ["fixture:start:Y28"],
  })).state;
  state = transition(state, command(5, 400, "step_displayed", {
    actor: "system",
    source: "system",
    from_node_id: "Y28",
    to_node_id: "Y26",
  })).state;
  state = transition(state, command(6, 500, "arrival_reported", {
    node_id: "unknown",
    to_node_id: "Y26",
  })).state;

  const lowArrival = transition(state, command(7, 600, "arrival_confirmed", {
    node_id: "Y26",
    confidence: "low",
  }));
  assert.equal(lowArrival.state.status, "manual_confirmation_required");
  assert.equal(lowArrival.state.current_node, "Y28");
  assert.equal(lowArrival.state.last_confirmed_node, "Y28");
  assert.equal(lowArrival.state.arrival_confirmed, false);

  const conflictingArrival = transition(lowArrival.state, command(8, 700, "arrival_confirmed", {
    node_id: "Y26",
    confidence: "high",
    conflict: true,
  }));
  assert.equal(conflictingArrival.state.status, "manual_confirmation_required");
  assert.equal(conflictingArrival.state.current_node, "Y28");
  assert.equal(conflictingArrival.state.last_confirmed_node, "Y28");
  assert.equal(conflictingArrival.state.arrival_confirmed, false);

  const unknownNodeArrival = transition(conflictingArrival.state, command(9, 750, "arrival_confirmed", {
    node_id: "unknown",
    to_node_id: "Y26",
    confidence: "high",
  }));
  assert.equal(unknownNodeArrival.state.status, "manual_confirmation_required");
  assert.equal(unknownNodeArrival.state.current_node, "Y28");
  assert.equal(unknownNodeArrival.state.last_confirmed_node, "Y28");
  assert.equal(unknownNodeArrival.state.arrival_confirmed, false);

  const unknownCandidateArrival = transition(unknownNodeArrival.state, command(10, 775, "arrival_confirmed", {
    node_id: "Y26",
    confidence: "high",
    candidate_status: "unknown",
  }));
  assert.equal(unknownCandidateArrival.state.status, "manual_confirmation_required");
  assert.equal(unknownCandidateArrival.state.current_node, "Y28");
  assert.equal(unknownCandidateArrival.state.arrival_confirmed, false);

  const confirmedArrival = transition(unknownCandidateArrival.state, command(11, 800, "arrival_confirmed", {
    node_id: "Y26",
    confidence: "confirmed",
    evidence_refs: ["fixture:arrival:Y26"],
  }));
  assert.equal(confirmedArrival.state.status, "step_confirmed");
  assert.equal(confirmedArrival.state.current_node, "Y26");
  assert.equal(confirmedArrival.state.last_confirmed_node, "Y26");
  assert.equal(confirmedArrival.state.arrival_confirmed, true);
});

test("wrong-route recovery preserves the last node until a candidate is manually confirmed", () => {
  let state = createInitialState({
    session_id: SESSION_ID,
    route_id: ROUTE_ID,
  });
  let sequence_no = 0;

  function apply(event_type, fields = {}) {
    sequence_no += 1;
    const result = transition(
      state,
      command(sequence_no, sequence_no * 100, event_type, fields),
    );
    state = result.state;
    return result.event;
  }

  apply("session_started", { actor: "system", source: "system" });
  apply("start_confirmed", {
    node_id: "Y28",
    confidence: "confirmed",
    evidence_refs: ["fixture:start:Y28"],
  });
  apply("step_displayed", {
    actor: "system",
    source: "system",
    from_node_id: "Y28",
    to_node_id: "Y26",
  });
  const wrongRoute = apply("wrong_route_reported", {
    node_id: "Y28",
    confidence: "confirmed",
    reason: "user reports the route is wrong",
  });
  assert.equal(wrongRoute.state_after, "recovery_required");
  assert.equal(state.status, "recovery_required");
  assert.equal(state.current_node, "Y28");
  assert.equal(state.last_confirmed_node, "Y28");
  assert.equal(state.paused_step_target, "Y26");

  apply("relocation_candidate_shown", {
    actor: "system",
    source: "osm_candidate",
    candidates: [
      { node_id: "Y26", status: "candidate" },
      { node_id: "Y23", status: "candidate" },
    ],
    reason: "explicit recovery candidates",
  });
  assert.equal(state.status, "manual_relocation");
  assert.equal(state.current_node, "Y28");
  assert.deepEqual(
    state.relocation_candidates.map((candidate) => [candidate.node_id, candidate.status]),
    [["Y26", "candidate"], ["Y23", "candidate"]],
  );

  const manualPrompt = apply("manual_confirmation_required", {
    node_id: "Y26",
    confidence: "low",
    conflict: true,
    reason: "visual candidates conflict",
  });
  assert.equal(manualPrompt.result, "manual_confirmation_required");
  assert.equal(state.status, "manual_confirmation_required");
  assert.equal(state.current_node, "Y28");
  assert.equal(state.pending_confirmation_node, "Y26");

  const lowCandidate = apply("relocation_confirmed", {
    node_id: "Y26",
    confidence: "low",
    evidence_refs: ["fixture:recovery:Y26"],
  });
  assert.equal(lowCandidate.result, "not_confirmed");
  assert.equal(state.status, "manual_confirmation_required");
  assert.equal(state.current_node, "Y28");
  assert.equal(state.last_confirmed_node, "Y28");
  assert.equal(state.pending_confirmation_node, "Y26");

  apply("relocation_confirmed", {
    node_id: "Y26",
    confidence: "high",
    evidence_refs: ["fixture:recovery:Y26"],
  });
  assert.equal(state.status, "step_guidance");
  assert.equal(state.current_node, "Y26");
  assert.equal(state.last_confirmed_node, "Y26");
  assert.equal(state.pending_arrival_node, "Y23");
  assert.equal(state.completed, false);

  apply("arrival_reported", { node_id: "unknown", to_node_id: "Y23" });
  apply("arrival_confirmed", {
    node_id: "Y23",
    confidence: "confirmed",
    evidence_refs: ["fixture:arrival:Y23"],
  });
  apply("route_completed", {
    actor: "system",
    source: "system",
    reason: "recovered route completed after manual confirmation",
  });
  assert.equal(state.status, "completed");
  assert.equal(state.current_node, "Y23");
  assert.equal(state.completed, true);
});

test("recovery blocks safely when no candidate exists, and abort preserves the last node", () => {
  let state = createInitialState({
    session_id: SESSION_ID,
    route_id: ROUTE_ID,
  });
  let sequence_no = 0;

  function apply(event_type, fields = {}) {
    sequence_no += 1;
    const result = transition(
      state,
      command(sequence_no, sequence_no * 100, event_type, fields),
    );
    state = result.state;
    return result.event;
  }

  apply("session_started", { actor: "system", source: "system" });
  apply("start_confirmed", {
    node_id: "Y28",
    confidence: "high",
    evidence_refs: ["fixture:start:Y28"],
  });
  apply("step_displayed", {
    actor: "system",
    source: "system",
    from_node_id: "Y28",
    to_node_id: "Y26",
  });
  apply("wrong_route_reported", {
    node_id: "Y28",
    confidence: "confirmed",
    reason: "user cannot match the corridor",
  });

  const blocked = apply("relocation_candidate_shown", {
    actor: "system",
    source: "osm_candidate",
    candidates: [],
    reason: "no_safe_candidate",
  });
  assert.equal(blocked.state_after, "blocked_unknown");
  assert.equal(state.status, "blocked_unknown");
  assert.equal(state.current_node, "Y28");
  assert.equal(state.last_confirmed_node, "Y28");
  assert.equal(state.blocked_reason, "no_safe_candidate");
  assert.equal(state.completed, false);

  const stillBlocked = apply("no_safe_candidate", {
    actor: "system",
    source: "system",
    reason: "still no safe candidate",
  });
  assert.equal(stillBlocked.state_after, "blocked_unknown");
  assert.equal(state.status, "blocked_unknown");
  assert.equal(state.current_node, "Y28");

  const aborted = apply("route_aborted", {
    actor: "user",
    source: "user_confirmed",
    confidence: "confirmed",
    reason: "user chose to stop after recovery was blocked",
  });
  assert.equal(aborted.state_after, "aborted");
  assert.equal(state.status, "aborted");
  assert.equal(state.navigation_state, "aborted");
  assert.equal(state.current_node, "Y28");
  assert.equal(state.last_confirmed_node, "Y28");
  assert.equal(state.completed, false);
  assert.equal(state.abort_reason, "user chose to stop after recovery was blocked");
});

test("every major state treats sensor events as reducer no-ops", () => {
  const states = [];
  let state = createInitialState({
    session_id: SESSION_ID,
    route_id: ROUTE_ID,
  });
  states.push(state);

  state = transition(state, command(1, 0, "session_started", {
    actor: "system",
    source: "system",
  })).state;
  states.push(state);
  state = transition(state, command(2, 100, "start_confirmed", {
    node_id: "Y28",
    confidence: "high",
  })).state;
  states.push(state);
  state = transition(state, command(3, 200, "step_displayed", {
    actor: "system",
    source: "system",
    from_node_id: "Y28",
    to_node_id: "Y26",
  })).state;
  states.push(state);
  state = transition(state, command(4, 300, "arrival_reported", {
    node_id: "unknown",
    to_node_id: "Y26",
  })).state;
  states.push(state);
  state = transition(state, command(5, 400, "arrival_confirmed", {
    node_id: "Y26",
    confidence: "low",
  })).state;
  states.push(state);
  state = transition(state, command(6, 500, "arrival_confirmed", {
    node_id: "Y26",
    confidence: "high",
  })).state;
  states.push(state);

  let recoveryState = transition(
    transition(
      transition(
        createInitialState({ session_id: SESSION_ID, route_id: ROUTE_ID }),
        command(1, 0, "session_started", { actor: "system", source: "system" }),
      ).state,
      command(2, 100, "start_confirmed", { node_id: "Y28", confidence: "high" }),
    ).state,
    command(3, 200, "step_displayed", {
      actor: "system",
      source: "system",
      from_node_id: "Y28",
      to_node_id: "Y26",
    }),
  ).state;
  recoveryState = transition(recoveryState, command(4, 300, "wrong_route_reported", {
    node_id: "Y28",
    confidence: "confirmed",
  })).state;
  states.push(recoveryState);
  const manualRelocation = transition(recoveryState, command(5, 400, "relocation_candidate_shown", {
    actor: "system",
    source: "visual_reference",
    candidates: [{ node_id: "Y26", status: "candidate" }],
  })).state;
  states.push(manualRelocation);
  const blockedUnknown = transition(recoveryState, command(5, 400, "relocation_candidate_shown", {
    actor: "system",
    source: "visual_reference",
    candidates: [],
    reason: "no_safe_candidate",
  })).state;
  states.push(blockedUnknown);

  const completed = transition(
    transition(
      transition(
        transition(
          transition(
            transition(
              transition(
                transition(
                  createInitialState({ session_id: SESSION_ID, route_id: ROUTE_ID }),
                  command(1, 0, "session_started", { actor: "system", source: "system" }),
                ).state,
                command(2, 100, "start_confirmed", { node_id: "Y28", confidence: "high" }),
              ).state,
              command(3, 200, "step_displayed", {
                actor: "system",
                source: "system",
                from_node_id: "Y28",
                to_node_id: "Y26",
              }),
            ).state,
            command(4, 300, "arrival_reported", { node_id: "unknown", to_node_id: "Y26" }),
          ).state,
          command(5, 400, "arrival_confirmed", { node_id: "Y26", confidence: "high" }),
        ).state,
        command(6, 500, "step_displayed", {
          actor: "system",
          source: "system",
          from_node_id: "Y26",
          to_node_id: "Y23",
        }),
      ).state,
      command(7, 600, "arrival_reported", { node_id: "unknown", to_node_id: "Y23" }),
    ).state,
    command(8, 700, "arrival_confirmed", { node_id: "Y23", confidence: "high" }),
  ).state;
  states.push(completed);
  const completedFinal = transition(completed, command(9, 800, "route_completed", {
    actor: "system",
    source: "system",
  })).state;
  states.push(completedFinal);

  const aborted = transition(
    transition(
      transition(
        createInitialState({ session_id: SESSION_ID, route_id: ROUTE_ID }),
        command(1, 0, "session_started", { actor: "system", source: "system" }),
      ).state,
      command(2, 100, "start_confirmed", { node_id: "Y28", confidence: "high" }),
    ).state,
    command(3, 200, "route_aborted", {
      reason: "user stopped",
      confidence: "confirmed",
    }),
  ).state;
  states.push(aborted);

  const sensorEventTypes = [
    "sensor_observation_recorded",
    "sensor_weak_prompt_shown",
    "sensor_gps_observation",
    "arrival_confirmed",
  ];
  for (const [index, original] of states.entries()) {
    const before = structuredClone(original);
    const result = transition(original, command(1, 1000 + index, sensorEventTypes[index % sensorEventTypes.length], {
      actor: "system",
      source: "sensor",
      confidence: "unknown",
      node_id: "Y23",
      to_node_id: "Y23",
      reason: "sensor observation is informational only",
    }));

    assert.strictEqual(result.state, original);
    assert.deepEqual(result.state, before);
    assert.equal(result.event.state_before, original.status);
    assert.equal(result.event.state_after, original.status);
    assert.equal(result.event.source, "sensor");
    assert.equal(result.event.result, "no_op");
    assert.equal(result.state.current_node, before.current_node);
    assert.equal(result.state.step_index, before.step_index);
    assert.equal(result.state.arrival_confirmed, before.arrival_confirmed);
    assert.equal(result.state.completed, before.completed);
    assert.equal(result.state.navigation_state, before.navigation_state);
  }
});

test("illegal transitions and candidate-source confirmations are rejected", () => {
  const initial = createInitialState({
    session_id: SESSION_ID,
    route_id: ROUTE_ID,
  });

  assert.throws(
    () => transition(initial, command(1, 0, "arrival_reported", { to_node_id: "Y26" })),
    InvalidTransitionError,
  );
  assert.throws(
    () => transition(initial, command(1, 0, "step_displayed", {
      actor: "system",
      source: "system",
      to_node_id: "Y26",
    })),
    InvalidTransitionError,
  );

  const started = transition(initial, command(1, 0, "session_started", {
    actor: "system",
    source: "system",
  })).state;
  assert.throws(
    () => transition(started, command(2, 100, "start_confirmed", {
      actor: "system",
      source: "osm_candidate",
      node_id: "Y28",
      confidence: "high",
    })),
    InvalidTransitionError,
  );
  assert.throws(
    () => transition(started, command(2, 100, "start_confirmed", {
      node_id: "Y28",
      confidence: "high",
      state_before: "not_started",
    })),
    InvalidTransitionError,
  );

  const guidance = transition(
    transition(started, command(2, 100, "start_confirmed", {
      node_id: "Y28",
      confidence: "high",
    })).state,
    command(3, 200, "step_displayed", {
      actor: "system",
      source: "system",
      to_node_id: "Y26",
    }),
  ).state;
  assert.throws(
    () => transition(guidance, command(4, 300, "route_completed", {
      actor: "system",
      source: "system",
    })),
    InvalidTransitionError,
  );

  const candidateRecovery = transition(
    transition(guidance, command(4, 300, "wrong_route_reported", {
      node_id: "Y28",
      confidence: "confirmed",
    })).state,
    command(5, 400, "relocation_candidate_shown", {
      actor: "system",
      source: "osm_candidate",
      candidates: [{ node_id: "Y26", status: "candidate" }],
    }),
  ).state;
  assert.throws(
    () => transition(candidateRecovery, command(6, 500, "relocation_confirmed", {
      actor: "system",
      source: "osm_candidate",
      node_id: "Y26",
      confidence: "high",
    })),
    InvalidTransitionError,
  );
});

test("replaying the event log is deterministic and validates state envelopes", () => {
  const fixture = buildReplayFixture();
  const initial = createInitialState({
    session_id: SESSION_ID,
    route_id: ROUTE_ID,
  });

  const replayed = replay(initial, fixture.events);
  const replayedAgain = replay(createInitialState({
    session_id: SESSION_ID,
    route_id: ROUTE_ID,
  }), fixture.events);
  assert.deepEqual(replayed, fixture.state);
  assert.deepEqual(replayedAgain, fixture.state);
  assert.equal(replayed.status, "completed");
  assert.equal(replayed.current_node, "Y23");
  assert.equal(replayed.completed, true);

  const tamperedState = fixture.events.map((event) => ({ ...event }));
  tamperedState[4].state_after = "step_guidance";
  assert.throws(() => replay(initial, tamperedState), InvalidTransitionError);

  const tamperedSequence = fixture.events.map((event) => ({ ...event }));
  tamperedSequence[5].sequence_no = 99;
  assert.throws(() => replay(initial, tamperedSequence), EventValidationError);

  const tamperedTime = fixture.events.map((event) => ({ ...event }));
  tamperedTime[6].occurred_at_elapsed_ms = 50;
  assert.throws(() => replay(initial, tamperedTime), EventValidationError);

  const duplicateId = fixture.events.map((event) => ({ ...event }));
  duplicateId[1].event_id = duplicateId[0].event_id;
  assert.throws(() => replay(initial, duplicateId), EventValidationError);
});

test("event contract rejects missing fields and accepts explicit unknown values", () => {
  const valid = createEvent({
    schema_version: 1,
    event_id: "event-contract-1",
    session_id: SESSION_ID,
    route_id: ROUTE_ID,
    route_version: "unknown",
    sequence_no: 1,
    occurred_at_elapsed_ms: 0,
    event_type: "sensor_observation_recorded",
    state_before: "not_started",
    state_after: "not_started",
    actor: "system",
    source: "sensor",
    node_id: "unknown",
    from_node_id: "unknown",
    to_node_id: "unknown",
    step_index: "unknown",
    step_count: "unknown",
    confidence: "unknown",
    evidence_refs: "unknown",
    reason: "unknown",
  });
  assert.equal(validateEvent(valid), valid);
  assert.equal(valid.step_count, "unknown");

  const missingReason = { ...valid };
  delete missingReason.reason;
  assert.throws(() => validateEvent(missingReason), EventValidationError);

  const badElapsed = { ...valid, occurred_at_elapsed_ms: -1 };
  assert.throws(() => validateEvent(badElapsed), EventValidationError);

  const unsupportedType = { ...valid, event_type: "unrelated_event", source: "system" };
  assert.throws(() => validateEvent(unsupportedType), EventValidationError);

  const customSensorType = { ...valid, event_type: "sensor_custom_observation" };
  assert.equal(validateEvent(customSensorType), customSensorType);
});
