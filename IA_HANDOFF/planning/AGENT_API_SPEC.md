# Agent API Spec (v0, Planning)

This document specifies the HTTP interface for plugging an external (LLM-driven) agent into the game engine.

This is not required for “bots vs bots” MVP v0, but it should be implemented before “bot vs agent”.

## Goals

- Simple request/response over HTTP.
- Strict action schema; engine validates.
- Deterministic logging: raw request/response captured in replay artifacts.
- Timeouts and safe failure modes (agent can’t stall the match runner).

## Transport

- Protocol: HTTP(S)
- Method: `POST`
- Path: `/act`
- Content-Type: `application/json`

## Request JSON

```json
{
  "api_version": "0.1",
  "match_id": "string",
  "player": "P1",
  "scenario_id": "scenario_01",
  "ply": 0,
  "action_budget": 4,
  "observation": { "..." : "see MVP_SPEC.md Observations" }
}
```

Field notes:
- `api_version`: lets the runner reject incompatible agents early.
- `match_id`: stable id for correlation across logs.
- `action_budget`: the maximum number of actions allowed this ply (agent may submit fewer).
- `observation`: the exact Observation object the agent should condition on.

## Response JSON

```json
{
  "api_version": "0.1",
  "actions": [
    { "type": "reinforce", "amount": 2 },
    { "type": "move", "from": "p1_n", "to": "mid_n", "amount": 3 }
  ],
  "rationale_text": "Optional short explanation for humans"
}
```

Rules:
- `actions` MUST be an array.
- The runner/engine will truncate to `action_budget` and validate each action.
- `rationale_text` is optional and intended for watchability/debug; it should be concise.

## Action schema (MVP v0)

See `MVP_SPEC.md` for normative semantics. Summary of JSON shapes:

- `{"type":"pass"}`
- `{"type":"reinforce","amount": <positive int>}`
- `{"type":"move","from": "<location_id>","to":"<location_id>","amount": <positive int>}`

## Error handling (runner behavior)

The match runner MUST be resilient to agent failures:

- Timeout: if the agent does not respond within `agent_timeout_ms`, treat as `pass` (and log timeout).
- Invalid JSON / schema mismatch: treat as `pass` (log error).
- HTTP error / network error: treat as `pass` (log error).

The engine still performs validation; invalid actions have no effect and become `invalid_action` events.

## Logging requirements

For each ply where an HTTP agent is used, the runner SHOULD log:
- request JSON (as sent),
- response JSON (as received),
- timing: start/end/latency,
- any error/timeout details.

These logs can live either:
- embedded in replay turns (careful about size), or
- as sidecar files referenced by the replay (recommended as agents get verbose).

## Security / safety (runner-side)

- Do not execute arbitrary code from the agent.
- Limit payload sizes (max request/response bytes).
- Sanitize `rationale_text` before rendering in a viewer (treat as plain text).

