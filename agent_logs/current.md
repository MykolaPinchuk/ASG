# agent_logs/current.md

## Agent
- id: agent08

## Timestamp (Pacific)
- start: 2026-01-31

## Intent
- Next slice: v07 complexity experiment (increment mechanics and evaluate baselines).

## Log

## 2026-01-31 19:15 PST — Onboard (triggered)
- Read repo index/state docs: `agents.md`, `repo_workflow.md`, `onboarding.md`, `HANDOFF.md`, `REPO_MAP.md`, `README.md`, `docs/planning/MVP_SPEC.md`.
- Bounded discovery read: `docs/planning/V07_COMPLEXITY_EXPERIMENT.md`, `docs/planning/EXPERIMENT_EVAL_PROTOCOL.md`, `docs/GAME_RULES.md`, `package.json`, `src/game/engine.ts`, `src/game/match.ts`, `src/providers/openaiCompat.ts`, `src/cli/agentVsRandom.ts`, `configs/oss_baselines.json`, `docs/focus20_models.md`.
- Current slice: v07 complexity ramp (increment mechanics stepwise; re-eval 3 baselines vs MixBot with `turnCapPlies=30`, fixed seeds, saved replays, and required `turns[*].latencyMs`).
- Notes: MVP v0 rules in `docs/planning/MVP_SPEC.md` match the current `applyTurn()` implementation (income → bounded actions → combat/capture → win/draw); match runner enforces `latencyMs` and emits `agent_retry` events when retries occur.
- Next steps: run the baseline protocol for the 3 v06 winners (Chimera / Cerebras 120B / Grok) on seeds `3,4` (then `3..7`), then start v07 step 1 (“clarify rules + action space”) with replay-backed metrics + a short `docs/diagnostics/YYYY-MM-DD_*.md` writeup.

## 2026-01-31 19:37 PST — Run: Chimera vs MixBot (2 games)
- Command: `npm run -s agent:eval-vs-mix -- --provider-name chutes --base-url https://llm.chutes.ai/v1 --models tngtech/DeepSeek-R1T-Chimera --seeds 3,4 --turn-cap-plies 30 --stop-after-errors 1`
- Seed 3: WIN, plies=19, avgLatencyMs=15606, p95LatencyMs=23613. Replay: `replays/model_evals/2026-02-01T03-30-59-088Z/scenario_01_seed3_agent_vs_mix_chutes_tngtech_deepseek_r1t_chimera.json`
- Seed 4: WIN, plies=13, avgLatencyMs=10887, p95LatencyMs=13702. Replay: `replays/model_evals/2026-02-01T03-36-04-284Z/scenario_01_seed4_agent_vs_mix_chutes_tngtech_deepseek_r1t_chimera.json`

## 2026-01-31 19:47 PST — Run: Chimera vs MixBot (3 games)
- Command(s): `npm run -s agent:eval-vs-mix -- --provider-name chutes --base-url https://llm.chutes.ai/v1 --models tngtech/DeepSeek-R1T-Chimera --seeds <seed> --turn-cap-plies 30 --stop-after-errors 1`
- Seed 5: WIN, plies=21, avgLatencyMs=6827, p95LatencyMs=7556. Replay: `replays/model_evals/2026-02-01T03-42-57-596Z/scenario_01_seed5_agent_vs_mix_chutes_tngtech_deepseek_r1t_chimera.json`
- Seed 6: WIN, plies=23, avgLatencyMs=6810, p95LatencyMs=9516. Replay: `replays/model_evals/2026-02-01T03-44-18-126Z/scenario_01_seed6_agent_vs_mix_chutes_tngtech_deepseek_r1t_chimera.json`
- Seed 7: DRAW (turn cap), plies=30, avgLatencyMs=6273, p95LatencyMs=8853. Replay: `replays/model_evals/2026-02-01T03-45-44-513Z/scenario_01_seed7_agent_vs_mix_chutes_tngtech_deepseek_r1t_chimera.json`

## 2026-01-31 19:51 PST — Conclusion (unchanged)
- Current baseline models are still not good/fast/cheap enough to justify pushing into more complex mechanics yet; pause v07 complexity ramp work until the next wave of models/providers.
