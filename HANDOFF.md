# HANDOFF

## Current slice
v0 repo setup: establish multi-agent workflow scaffolding and canonical paths for specs/schemas/scenarios before implementation work begins.

## Invariants (do not break)
- Spec is source of truth: `docs/planning/MVP_SPEC.md`.
- Deterministic replays: same seed + same actions ⇒ identical outcomes.
- No secrets or bulky artifacts in git (see `.gitignore`).

## State of work

### Done (with evidence)
- Version branch set: currently on `v0`.
- Agentic workflow scaffold added:
  - `agents.md`, `business_context.md`, `repo_workflow.md`, `onboarding.md`, `REPO_MAP.md`
  - `.codex/skills/`, `agent_logs/`, `docs/adr/0001-agentic-workflow-protocol.md`
- Canonical copies of handoff artifacts created:
  - Specs/planning: `docs/planning/`
  - Scenario data: `scenarios/scenario_01.json`
  - Schemas: `schemas/replay.schema.json`, `schemas/agent_api.schema.json`
  - Optional TS prototype: `prototype_optional/`
  - `IA_HANDOFF/` retained as an immutable snapshot (do not edit).

### Next (ordered)
1) Decide whether to reuse `prototype_optional/` as the starting codebase vs re-implement from `docs/planning/MVP_SPEC.md`.
2) Decide tech stack for v0 (TypeScript end-to-end vs Python engine + web viewer).
3) Start MVP v0 implementation: deterministic engine + bot-vs-bot runner + replay viewer.

### Open questions
- Git policy: should agents create an initial commit on `v0` now, or should humans do the first commit?

## Repro / smoke check
- Commands run:
  - `python /home/mykola/repos/context-manager-1/sync_context.py --repo /home/mykola/repos/ASG`
- Outcome:
  - Generated `agents.md` and `business_context.md`.

## Known issues / current breakage
- None known (repo is uninitialized; no build/tests yet).

## Git notes (handoff)
- `.gitignore` updates made:
  - Added ignores for secrets and generated artifacts (`secrets/`, `runs/`, `replays/`, build outputs).
- If anything is intentionally uncommitted, list it here with a reason:
  - None.
