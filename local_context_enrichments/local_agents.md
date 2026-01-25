# Repo-specific agent notes (ASG)

## Version branching model
- Branches are version-aligned: `v0` (MVP), then `v1`, `v2`, ...
- Only the human pushes; agents may create local commits when asked (`checkpoint` / `handoff`) or after coherent milestones.
- Never start work on `vN+1` without explicit human approval.

## Commit message format
- All agent-made commits MUST include the agent id prefix (from `agent_logs/current.md`):
  - `agentNN: checkpoint(<area>): <summary>`
  - `agentNN: handoff(<area>): <summary>`
- Areas: `workflow`, `docs`, `engine`, `runner`, `viewer`, `schemas`, `misc`.

## Artifacts hygiene (non-negotiable)
- Never commit secrets/credentials (see `.gitignore` and `secrets/`).
- Default: do not commit generated artifacts (`runs/`, `replays/`, build outputs).

## Time limits
- Default to short commands with timeouts; avoid long-running jobs unless explicitly requested.
