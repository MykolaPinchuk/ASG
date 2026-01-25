# Handoff Notes (Next Implementation Agent)

Goal: implement MVP v0 (bots vs bots) and prepare for agent integration, based on the planning/spec docs.

## Read-first docs (authoritative)

1. `DECISIONS.md` — decision log + open decisions.
2. `MVP_SPEC.md` — normative rules/spec (what the engine must do).
3. `scenarios/scenario_01.json` — Scenario 01 as data.
4. `IMPLEMENTATION_PLAN.md` — suggested milestones and deliverables.
5. `AGENT_API_SPEC.md` — HTTP agent interface (post-bots milestone).
6. `FORMATS_AND_VERSIONING.md` — replay/api versioning rules.
7. `TUNING_PROTOCOL.md` — how to tune parameters by simulation/playtests.
8. `VIEWER_SPEC.md` — viewer requirements (Omni/POV/Diff).
9. `schemas/README.md` — JSON schemas for validation.
10. `ROADMAP.md` — post-MVP direction (optional).

## Implementation scope (MVP v0)

- Alternating plies, action budget, supply economy, reinforce/move/pass.
- Seeded deterministic PRNG for combat.
- Replay logging with:
  - both players’ observations per ply (even if identical in MVP),
  - actions + optional rationale_text,
  - events and stateAfter.
- Minimal replay viewer:
  - Omni/P1/P2 toggles (P1/P2 identical in MVP, but wired for later fog-of-war).

## Key tunables (expected to adjust via playtests)

- `turn_cap_plies`, `action_budget`
- base income + resource yields
- starting HQ strength
- reinforce cost
- combat variance fraction
- move amount discretization (if branching gets too big)

## Explicit deferrals (by design)

- Tech stack choice and whether to reuse the existing prototype code are deferred to the implementation agent.
- Exact numeric parameters are intended to be tuned via `TUNING_PROTOCOL.md` rather than locked up front.

## Known gaps / likely next fixes

- Draw rate will likely be high until bot heuristics and/or parameters are tuned.
- If/when fog-of-war is introduced, Observation must become visibility-aware, but the spec keeps it separate already.

## Acceptance checks

- Replays are deterministic: same seed + same action list ⇒ identical replay JSON (modulo timestamps).
- Engine rejects invalid actions cleanly (no state changes; emits `invalid_action` event).
- Viewer can load a replay and scrub plies without crashing.
  - If validation is added, replay JSON conforms to `schemas/replay.schema.json`.

## If you reuse the existing prototype code

This repo already contains a TS prototype implementation (engine/CLI/viewer). You can either:
- treat it as a starting point and harden it (add tests, tune bots/params), or
- ignore it and re-implement from `MVP_SPEC.md`.

Either is acceptable; the spec (`MVP_SPEC.md`) is the source of truth.
