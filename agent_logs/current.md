# agent_logs/current.md

## Agent
- id: agent06

## Timestamp (Pacific)
- start: 2026-01-30

## Intent
- Onboard repo state, then start v06 work.

## Notes
- Do not commit secrets or bulky artifacts (see `.gitignore`).

## Log
### 2026-01-30 19:00 PT — Onboard
- Onboarded from `HANDOFF.md` + `REPO_MAP.md` + `docs/planning/MVP_SPEC.md`; current work target is pre-v1 hardening.
- Guardrails: always save replays, persist `turns[*].latencyMs`, default caps `turnCapPlies<=30` and `games/count<=5` unless explicitly overridden.
- Next: pick one slice (tuning sweep tool, viewer debug speed, or replay/agent observability) and execute with short eval runs + inspectable replays.

### 2026-01-30 19:10 PT — Branching
- Confirmed `v05` was merged to `origin/master` (merge commit `6a2c3fc`); created local `v06` from `origin/master` for continued development.
