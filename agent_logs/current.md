# agent_logs/current.md

## Agent
- id: agent07

## Timestamp (Pacific)
- start: 2026-01-30

## Intent
- Onboard + choose next slice.

## Notes
- Do not commit secrets or bulky artifacts (see `.gitignore`).
- Keep v0/v0.x guardrails by default (`turnCapPlies<=30`, `games<=5`, always save replays, persist `turns[*].latencyMs`).

## Log

### 2026-01-30 (PT) — Onboard (agent07)
- Read index/state docs (`agents.md`, `repo_workflow.md`, `onboarding.md`, `HANDOFF.md`, `REPO_MAP.md`, `README.md`, `docs/planning/MVP_SPEC.md`) and key runtime entrypoints (see onboarding output).
- Quick sanity:
  - `npm run -s typecheck` ✅
  - `npm run -s validate:scenario` ✅
  - `npm run -s match -- --seed 1 --p1 greedy --p2 greedy --turn-cap-plies 2` ✅ (wrote `replays/scenario_01_seed1_greedy_vs_greedy.json`)
  - `npm run -s validate:replay -- replays/scenario_01_seed1_greedy_vs_greedy.json` ✅
- Next steps: pick 1 narrow v06 slice (Cerebras `gpt-oss-120b` repeatability OR replay metadata enrichment OR viewer summary/UX) and run a small, replay-saved, 30-ply capped eval per `docs/planning/EXPERIMENT_EVAL_PROTOCOL.md`.

### 2026-01-30 (PT) — Focus-20 performance snapshot
- Added generator `src/cli/updatePerformanceTop20.ts` + script `npm run -s perf:top20` to produce `performance.md` from saved replays.
- Note: replay JSONs do not yet persist full run config (reasoning/tools/max_tokens), so config variants in `docs/focus20_models.md` cannot be split reliably.

### 2026-01-30 (PT) — Cerebras `gpt-oss-120b` repeatability (vs MixBot)
- Ran seeds 3..7 at `turnCapPlies=30` with `--reasoning-effort high --max-tokens 8000 --use-tools false --tools-mode off --stream off`.
- Replays: `replays/model_evals/cerebras_gpt-oss-120b_repeatability_2026-01-30T23-24-49-476Z`
- Summary JSON: `runs/experiments/cerebras_gpt-oss-120b_repeatability_2026-01-30T23-24-49-476Z.json`
- `analyze:replays` summary: 4W-1D-0L, but very high pass/error turn rates (~70.6%), suggesting request reliability issues dominate despite high “strength”.

### 2026-01-30 (PT) — Self-consistency + 1-ply engine scoring (A/B)
- Implemented opt-in selection flags in `src/cli/agentServer.ts` (`--select-mode one_ply --select-k K --select-candidate-temperature t --select-until-ply N`) and plumbed them through `src/cli/agentVsRandom.ts`.
- A/B vs MixBot on Chutes `Qwen/Qwen3-Next-80B-A3B-Instruct` (seeds 3..7, 30 plies):
  - Win rate unchanged (all draws); captures/game decreased; latency increased substantially.
  - Details: `docs/diagnostics/2026-01-30_self_consistency_engine_scoring.md`.

### 2026-01-30 (PT) — Pinned Top-6 + 2-game refresh
- Pinned Top-6 leaderboard list: `configs/leaderboard_top6_models.txt` (rendered in `performance.md`).
- Ran 2 games (seeds 3,4; 30 plies) vs MixBot for each pinned model; replays under:
  - `replays/model_evals/top6_2games_2026-01-31T00-41-39-071Z/`
- Refreshed `performance.md` to include:
  - `avg ok latency (ms)` (mean over ok agent turns)
  - `avg plies to win` (mean match plies over wins only)

### 2026-01-30 (PT) — `gpt-oss-120b` reasoning-effort sweep (OR/Chutes/Cerebras)
- Sweep results + commands: `docs/diagnostics/2026-01-30_gpt_oss_120b_reasoning_effort_sweep.md`.
