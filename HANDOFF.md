# HANDOFF

## Current slice
v0 setup + planning: repo scaffold is in place; next step is to confirm v0 implementation decisions and then start M0/M1.

## Invariants (do not break)
- Spec is source of truth: `docs/planning/MVP_SPEC.md`.
- Deterministic replays: same seed + same actions ⇒ identical outcomes.
- No secrets or bulky artifacts in git (see `.gitignore`).

## State of work

### Done (with evidence)
- Version branch set: currently on `v0`.
- Initial setup commit:
  - `b6aeff4` — `agent00: checkpoint(workflow): initial v0 repo scaffold`
- Planning checkpoint commit:
  - `877afde` — `agent00: checkpoint(docs): add v0 decision ADRs`
- Agentic workflow scaffold added:
  - `agents.md`, `business_context.md`, `repo_workflow.md`, `onboarding.md`, `REPO_MAP.md`
  - `.codex/skills/`, `agent_logs/`, `docs/adr/0001-agentic-workflow-protocol.md`
- Canonical copies of handoff artifacts created:
  - Specs/planning: `docs/planning/`
  - Scenario data: `scenarios/scenario_01.json`
  - Schemas: `schemas/replay.schema.json`, `schemas/agent_api.schema.json`
  - Optional TS prototype: `prototype_optional/`
  - `IA_HANDOFF/` retained as an immutable snapshot (do not edit).
- Proposed v0 decision ADRs:
  - `docs/adr/0002-v0-stack-and-repo-layout.md`
  - `docs/adr/0003-v0-determinism-and-replay-contract.md`

### Next (ordered)
1) Human: approve (or edit) ADRs:
   - `docs/adr/0002-v0-stack-and-repo-layout.md`
   - `docs/adr/0003-v0-determinism-and-replay-contract.md`
2) Agent01: start MVP v0 implementation (M0/M1) per `docs/planning/IMPLEMENTATION_PLAN.md`.
3) Agent01: update `agent_logs/current.md` `id:` to `agent01` at the start of the cycle.

### Open questions
- None blocking (once ADRs above are approved).

## Repro / smoke check
- Commands run:
  - `python /home/mykola/repos/context-manager-1/sync_context.py --repo /home/mykola/repos/ASG`
- Outcome:
  - Generated `agents.md` and `business_context.md`.

## Known issues / current breakage
- None known.

## Git notes (handoff)
- `.gitignore` updates made:
  - Added ignores for secrets and generated artifacts (`secrets/`, `runs/`, `replays/`, build outputs).
- If anything is intentionally uncommitted, list it here with a reason:
  - None.
