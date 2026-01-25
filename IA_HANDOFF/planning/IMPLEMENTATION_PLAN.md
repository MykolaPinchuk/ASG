# Implementation Plan (MVP v0)

This document turns the exploration artifacts into an executable engineering plan.

Source of truth for rules: `MVP_SPEC.md`.

The numeric parameters (income/costs/turn caps) are **tune-by-playtest** knobs unless explicitly promoted to a “decision”.

## MVP v0 definition of done

- Can run a full match in `SCENARIO_01` as **scripted bot vs scripted bot**.
- `SCENARIO_01` data lives in `scenarios/scenario_01.json`.
- Produces a **deterministic, seed-replayable** log containing:
  - per-turn observations (player-view),
  - actions + (optional) rationale text,
  - resolution events (combat, captures, income),
  - end result (HQ captured or draw by turn cap).
- Includes a minimal **replay viewer** that renders:
  - the node graph (with coordinates),
  - owners + strengths + resource nodes,
  - per-turn event log,
  - turn scrubber / step controls,
  - view mode toggle: Omni / P1 / P2 (identical in MVP, but plumbed).
 - (Optional but recommended) Replay JSON validates against `schemas/replay.schema.json`.

## Milestones

### M0 — Repo + data model skeleton

- Pick a tech stack (see “Tech choices”).
- Create a core library module with types:
  - `Scenario`, `MapGraph`, `Node`, `PlayerState`, `GameState`
  - `Action` (reinforce/move/pass), `ActionResult`
  - `Event` (income, move, combat, capture, error)
  - `Observation` (player-specific view)
  - `Replay` container (or JSONL framing)
- Encode `SCENARIO_01` as data (JSON/YAML) instead of Markdown.

Deliverable: can load scenario data into a validated in-memory model.

### M1 — Rules engine v0 (deterministic core)

Implement a pure(ish) step function:

- `derive_observation(state, player_id)`:
  - MVP: returns full state (but keep the interface for later fog-of-war).
- `validate_actions(observation, actions)`:
  - schema validation + rule validation (adjacency, budget, non-negative amounts).
- `apply_turn(state, player_id, actions, rng_seed) -> (new_state, events)`:
  - income
  - reinforce at HQ
  - moves and combats
  - node capture rules
  - end condition: HQ capture → win
  - turn cap → draw

Combat v0:
- seeded RNG
- low-variance noise around a deterministic baseline
- combat events emit “inputs + roll + outputs” so outcomes are explainable.

Deliverable: engine can advance state and produce a replayable event list.

### M2 — Match runner + bots (no agents yet)

- Implement a `Controller` interface:
  - input: `Observation`
  - output: `Action[]` + optional `rationale_text`
- Implement two controllers:
  - `RandomBot` (valid actions only; sanity)
  - `GreedyBot` (simple heuristics: take resources, defend, then push lane)
- Build a CLI to run:
  - one match with a seed
  - a small batch of seeds (for draw-rate checks)
- Write replay logs to disk.

Batch tuning guidance: `TUNING_PROTOCOL.md`.

Deliverable: `bot vs bot` runs are stable and produce logs you can inspect.

### M3 — Replay viewer v0 (watchability baseline)

Build a minimal viewer (web or desktop):
- reads replay file
- renders the node graph using stored coordinates
- shows per-turn events
- provides a turn scrubber
- supports Omni/P1/P2 view selection (even if identical in MVP)

Viewer requirements: `VIEWER_SPEC.md`.

Deliverable: you can “watch” a match in < 2 minutes and understand what happened.

### M4 — Agent controller integration (post-MVP v0)

Implement an `HttpAgentController`:
- POST `Observation` JSON to an agent endpoint
- receives `Action[]` + optional `rationale_text`
- enforces timeouts, budgets, validation, and logs raw I/O

HTTP wire format: `AGENT_API_SPEC.md`.

Deliverable: `bot vs agent` match runs end-to-end with replay logs.

## Tech choices (decision needed)

Two good options:

1. **TypeScript end-to-end**
   - Engine + CLI: Node.js
   - Viewer: browser (shared types)
   - Pros: one language, shared schemas, easy web UI
   - Cons: careful about determinism/PRNG and numeric edge cases

2. **Python engine + web viewer**
   - Engine + CLI + agent integration: Python
   - Viewer: browser JS/TS
   - Pros: fast iteration on engine, strong data tooling
   - Cons: cross-language schema sync (solve with JSON Schema)

## Explicit “tunables” to playtest (not decisions)

- `turn_cap`, `action_budget`
- base income and resource yields
- starting HQ strength
- reinforce conversion rate
- combat variance bounds
- whether to discretize `move.amount`

## Risk containment

- Keep the engine deterministic and seed-replayable from day 1.
- Keep `Observation` as a first-class object even before fog-of-war.
- Keep action vocabulary tiny until the core loop is fun and draw rate is acceptable.
