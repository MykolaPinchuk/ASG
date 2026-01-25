# Formats and Versioning (Planning)

This document defines how core artifacts evolve over time without silent drift.

## Artifacts

- **Scenario**: a map + settings + initial state (e.g. `scenarios/scenario_01.json`).
- **Replay**: a full match record including the embedded scenario, observations, actions, events, and result.
- **Agent API messages**: `/act` request/response payloads for LLM-driven agents.

## Replay versioning

- `Replay.version` is a **semantic version string** (e.g. `0.1.0`).
- Backward compatibility policy:
  - **Major** bump: replay format or semantics change incompatibly (old viewer/loader should refuse).
  - **Minor** bump: backward compatible additions (new optional fields).
  - **Patch** bump: bugfixes that do not change the serialized structure.

Operational rule:
- If the **rules engine semantics** change (including combat math) in a way that would change outcomes given the same actions+seed, bump **major**.
- If the **PRNG algorithm** changes, bump **major**.

## Agent API versioning

- Request and response both include `api_version` (string).
- The match runner should reject an agent response if `api_version` mismatches what the runner expects.

## Scenario evolution

Replays embed the full `scenario` object, so scenario drift is captured per replay. This means:
- You can safely tweak `scenarios/*.json` while keeping old replays interpretable.
- “Scenario versioning” is optional for MVP (replay is self-contained).

If you later want scenario-only distribution/validation, add:
- explicit `scenario_version` field, and/or
- a stable `scenario_hash` computed from a canonical JSON form.

## Schemas

- `schemas/replay.schema.json` is the strict MVP v0 replay schema.
- `schemas/agent_api.schema.json` is the agent wire schema.

Policy:
- If schemas change incompatibly, bump the corresponding version field (`Replay.version` and/or `api_version`).

