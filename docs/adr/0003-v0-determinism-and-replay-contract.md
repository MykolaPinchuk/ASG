# ADR 0003 — v0 determinism and replay contract

## Status
Proposed (needs explicit human approval before M0 implementation begins).

## Context
The MVP v0 spec requires deterministic, seed-replayable matches:
- Same scenario + same action list + same seed ⇒ identical outcomes and event logs.
- If PRNG algorithm or rules semantics change incompatibly, replay version must bump (major).

The replay viewer and debugging workflow depend on reliable determinism.

## Decision
1) **Determinism definition**
   - Determinism is defined as identical replay structure and values for all fields except timestamp metadata (e.g. `createdAt`).

2) **Replay output contract**
   - Replays must conform to `schemas/replay.schema.json`.
   - Engine must log all information needed to explain combats (variance bounds, noise roll, winner, remaining strength).

3) **RNG policy**
   - Use a single, explicitly-defined PRNG algorithm for v0 and treat it as part of the replay semantics.
   - Random sampling required by the spec (e.g. combat noise) must be **uniform** over the specified integer range.

## Consequences
- Enables deterministic replays for debugging, regression tests, and fair comparison across agent runs.
- Makes any later RNG/semantics changes explicit via version bumps rather than silent drift.

