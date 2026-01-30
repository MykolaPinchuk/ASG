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

### 2026-01-30 19:25 PT — Planning (v06)
- Wrote an experiments backlog focused on improving agent rule-following/strategy without hardcoded prompt “reminders”: `docs/planning/V06_EXPERIMENTS.md`.

### 2026-01-30 19:35 PT — Planning (eval protocol)
- Added an experiment evaluation protocol (fixed baselines, metrics, success criteria): `docs/planning/EXPERIMENT_EVAL_PROTOCOL.md`.

### 2026-01-30 20:45 PT — Experiments (short-horizon)
- Implemented opt-in agent-server flags for `--repair` and `--memory/--warmup` and a replay scorer (`npm run analyze:replays`).
- Ran short-horizon (turnCapPlies=12) experiments across seeds 1..5 and wrote a report under `runs/experiments/2026-01-30T04-32-59Z_v06_memory_repair/REPORT.md`.

### 2026-01-30 21:25 PT — Experiments (cohort search + cohorts 2/3)
- Cohort2 (openrouter `meta-llama/llama-3-8b-instruct`, turnCapPlies=30, seeds 1..5): report `runs/experiments/2026-01-30T13-19-52Z_v06_memory_repair_cohort2/REPORT.md`.
- Cohort3 (openrouter `qwen/qwen-2.5-7b-instruct`, turnCapPlies=30, seeds 1..5): report `runs/experiments/2026-01-30T13-42-17Z_v06_memory_repair_cohort3/REPORT.md`. This cohort had meaningful baseline invalid-action rate, so it is more diagnostic for repair/warmup experiments.
