# Schemas

Planning-time JSON Schemas for validating core artifacts.

- `schemas/replay.schema.json` — validates replay logs (and includes scenario/state/action/event sub-schemas).
- `schemas/agent_api.schema.json` — validates `/act` request/response envelopes (observation is intentionally left as `object` here; see `MVP_SPEC.md` for semantics).

These schemas are intended to be strict for MVP v0 so format drift is caught early. If formats change incompatibly, bump the replay/spec versions.

