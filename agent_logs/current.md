# agent_logs/current.md

## Agent
- id: agent05

## Timestamp (Pacific)
- start: 2026-01-28

## Intent
- Repair repo workflow state and codify local guardrails (replays/latency, plies/games caps, avoid RandomBot by default).

## Notes
- Do not commit secrets or bulky artifacts (see `.gitignore`).

## Log

- 2026-01-28 17:30:28 PST — Repaired workflow drift from agent04 cycle: added `extra_instructions_v0.md` as a tracked guardrails doc (and referenced it from `repo_workflow.md`/`REPO_MAP.md`), updated README to avoid RandomBot defaults, and enforced v0/v05 policy caps in CLIs (`turnCapPlies<=30`, `games/count<=5` unless `--unsafe-allow-long/--unsafe-allow-many`).
