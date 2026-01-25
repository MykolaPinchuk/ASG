# ADR 0002 — v0 tech stack and repo layout

## Status
Proposed (needs explicit human approval before M0 implementation begins).

## Context
MVP v0 requires a deterministic rules engine, a bot-vs-bot match runner, replay logging, and a minimal replay viewer.
This repo is intended to be developed by multiple generations of agents, so reducing cross-language/schema drift is important.

The handoff bundle includes an optional TypeScript prototype (`prototype_optional/`) that already matches much of the MVP v0 spec.

## Decision
1) **Tech stack (v0)**: TypeScript end-to-end.
   - Engine + CLI + bots: Node.js + TypeScript (ESM).
   - Viewer: static `viewer/index.html` consuming replay JSON.
   - Package manager: `npm` with `package-lock.json`.

2) **Canonical repo layout**:
   - Canonical specs/data live at:
     - `docs/planning/` (specs)
     - `scenarios/` (scenario JSON)
     - `schemas/` (JSON schemas)
   - Implementation code will live at repo root (canonical):
     - `package.json`, `src/`, `viewer/`, etc.

3) **Snapshots vs canonical**:
   - `IA_HANDOFF/` is an immutable snapshot.
   - `prototype_optional/` is an immutable snapshot reference; implementation should not depend on it staying up to date.

## Consequences
- Pros: single language across engine/CLI types; minimal schema drift; easiest path to future HTTP agent integration.
- Cons: determinism needs careful handling for RNG and serialization; Node version/tooling must be consistent across devs/agents.

