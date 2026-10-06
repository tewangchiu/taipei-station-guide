export const SCHEMA_VERSION = 1;
export const UNKNOWN = "unknown";

export const NODE_IDS = Object.freeze(["Y28", "Y26", "Y23"]);

export const STATES = Object.freeze([
  "not_started",
  "start_confirmation_required",
  "start_confirmed",
  "step_guidance",
  "arrival_confirmation_required",
  "step_confirmed",
  "recovery_required",
  "manual_relocation",
  "manual_confirmation_required",
  "blocked_unknown",
  "completed",
  "aborted",
]);

export const EVENT_TYPES = Object.freeze([
  "session_started",
  "start_candidate_shown",
  "start_confirmed",
  "step_displayed",
  "landmark_viewed",
  "arrival_reported",
  "arrival_confirmed",
  "step_confirmed",
  "wrong_route_reported",
  "relocation_candidate_shown",
  "relocation_confirmed",
  "manual_confirmation_required",
  "no_safe_candidate",
  "sensor_observation_recorded",
  "sensor_weak_prompt_shown",
  "route_completed",
  "route_aborted",
]);

export const ACTORS = Object.freeze(["user", "system"]);
export const SOURCES = Object.freeze([
  "user_confirmed",
  "visual_reference",
  "sensor",
  "osm_candidate",
  "system",
]);
export const CONFIDENCES = Object.freeze([
  "confirmed",
  "high",
  "medium",
  "low",
  UNKNOWN,
]);

const STATE_SET = new Set(STATES);
const ACTOR_SET = new Set(ACTORS);
const SOURCE_SET = new Set(SOURCES);
const CONFIDENCE_SET = new Set(CONFIDENCES);
const NODE_SET = new Set([...NODE_IDS, UNKNOWN]);

export class EventValidationError extends Error {
  constructor(message, field = undefined) {
    super(field ? `${field}: ${message}` : message);
    this.name = "EventValidationError";
    this.field = field;
  }
}

function fail(message, field) {
  throw new EventValidationError(message, field);
}

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function requireOwn(event, field) {
  if (!Object.hasOwn(event, field)) {
    fail("field is required", field);
  }
}

function requireNonEmptyString(value, field) {
  if (typeof value !== "string" || value.length === 0) {
    fail("must be a non-empty string", field);
  }
}

function requireStringOrUnknown(value, field) {
  if (value !== UNKNOWN && (typeof value !== "string" || value.length === 0)) {
    fail(`must be a non-empty string or ${UNKNOWN}`, field);
  }
}

function requireEnum(value, values, field) {
  if (!values.includes(value)) {
    fail(`must be one of: ${values.join(", ")}`, field);
  }
}

function requireIntegerOrUnknown(value, field) {
  if (value !== UNKNOWN && (!Number.isInteger(value) || value < 0)) {
    fail(`must be a non-negative integer or ${UNKNOWN}`, field);
  }
}

function requireNode(value, field) {
  if (!NODE_SET.has(value)) {
    fail(`must be one of: ${[...NODE_SET].join(", ")}`, field);
  }
}

function validateEvidenceRefs(value) {
  if (value === UNKNOWN) {
    return;
  }
  if (!Array.isArray(value) || value.some((ref) => typeof ref !== "string" || ref.length === 0)) {
    fail(`must be an array of non-empty strings or ${UNKNOWN}`, "evidence_refs");
  }
}

/**
 * Validate a complete event. The reducer accepts a command and fills the two
 * state envelope fields; replay callers should validate the resulting event.
 */
export function validateEvent(event) {
  if (!isRecord(event)) {
    fail("event must be an object");
  }

  const requiredFields = [
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
  ];
  for (const field of requiredFields) {
    requireOwn(event, field);
  }

  if (event.schema_version !== SCHEMA_VERSION) {
    fail(`must equal ${SCHEMA_VERSION}`, "schema_version");
  }
  requireNonEmptyString(event.event_id, "event_id");
  requireNonEmptyString(event.session_id, "session_id");
  requireNonEmptyString(event.route_id, "route_id");
  if (!Number.isInteger(event.sequence_no) || event.sequence_no < 1) {
    fail("must be a positive integer", "sequence_no");
  }
  if (!Number.isFinite(event.occurred_at_elapsed_ms) || event.occurred_at_elapsed_ms < 0) {
    fail("must be a non-negative finite number", "occurred_at_elapsed_ms");
  }
  requireNonEmptyString(event.event_type, "event_type");
  requireEnum(event.state_before, STATES, "state_before");
  requireEnum(event.state_after, STATES, "state_after");
  requireEnum(event.actor, ACTORS, "actor");
  requireEnum(event.source, SOURCES, "source");
  if (!EVENT_TYPES.includes(event.event_type) && !isSensorEvent(event)) {
    fail("unsupported event type", "event_type");
  }
  requireNode(event.node_id, "node_id");
  requireNode(event.from_node_id, "from_node_id");
  requireNode(event.to_node_id, "to_node_id");
  requireIntegerOrUnknown(event.step_index, "step_index");
  requireIntegerOrUnknown(event.step_count, "step_count");
  requireEnum(event.confidence, CONFIDENCES, "confidence");
  validateEvidenceRefs(event.evidence_refs);
  requireStringOrUnknown(event.reason, "reason");

  if (Object.hasOwn(event, "route_version")) {
    requireStringOrUnknown(event.route_version, "route_version");
  }
  for (const field of ["level_ref", "direction", "walkable_path", "landmark_ref"]) {
    if (Object.hasOwn(event, field)) {
      requireStringOrUnknown(event[field], field);
    }
  }
  if (Object.hasOwn(event, "conflict") && typeof event.conflict !== "boolean") {
    fail("must be a boolean", "conflict");
  }
  if (Object.hasOwn(event, "confirmed_by_user") && typeof event.confirmed_by_user !== "boolean") {
    fail("must be a boolean", "confirmed_by_user");
  }
  if (Object.hasOwn(event, "candidate_status")) {
    requireEnum(event.candidate_status, ["candidate", "confirmed", "conflict", UNKNOWN], "candidate_status");
  }
  if (Object.hasOwn(event, "ground_truth_status")) {
    requireEnum(event.ground_truth_status, ["candidate", "confirmed", UNKNOWN], "ground_truth_status");
  }

  return event;
}

/**
 * Create and validate a complete event without consulting time, randomness,
 * GPS, or any other ambient source. Callers must provide the event envelope.
 */
export function createEvent(input) {
  if (!isRecord(input)) {
    fail("event input must be an object");
  }

  const event = {
    ...input,
    schema_version: Object.hasOwn(input, "schema_version") ? input.schema_version : SCHEMA_VERSION,
  };
  validateEvent(event);
  return Object.freeze(event);
}

export function isState(value) {
  return typeof value === "string" && STATE_SET.has(value);
}

export function isSensorEvent(eventOrCommand) {
  if (!isRecord(eventOrCommand)) {
    return false;
  }
  return eventOrCommand.source === "sensor"
    || eventOrCommand.event_type === "sensor_observation_recorded"
    || eventOrCommand.event_type === "sensor_weak_prompt_shown"
    || (typeof eventOrCommand.event_type === "string" && eventOrCommand.event_type.startsWith("sensor_"));
}
