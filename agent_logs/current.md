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

## 2026-03-01 14:40 PST — Onboard (triggered)
- Read repo onboarding/index docs in order: `agents.md`, `repo_workflow.md`, `onboarding.md`, `HANDOFF.md`, `REPO_MAP.md`, `README.md`, `docs/planning/MVP_SPEC.md`.
- Bounded discovery read (current slice: provider/eval hardening + v07 readiness): `extra_instructions_v0.md`, `agent_logs/current.md`, `docs/planning/EXPERIMENT_EVAL_PROTOCOL.md`, `docs/planning/V07_COMPLEXITY_EXPERIMENT.md`, `performance.md`, `src/providers/openaiCompat.ts`, `src/cli/agentServer.ts`, `src/cli/evalModelsVsMix.ts`.
- Current state: v06 ended with 3 baseline candidates (Grok fast, Chimera, Cerebras gpt-oss-120b) and recommendation to postpone complexity ramp until model speed/reliability improves; guardrails remain strict (`turnCapPlies<=30`, `games<=5`, replay+latency required).
- Provider stack status: `openai_compat` + `agentServer` include multi-attempt JSON/tooling recovery, retry-to-medium reasoning, Cerebras include_reasoning omission, and sanitized/fallback action handling with per-turn diagnostics.
- Next steps (pick one): rerun the 3-model baseline snapshot on current seeds for freshness, or start v07 step 1 with a minimal rules/action-space change and paired eval writeup, or harden openai_compat parse/retry paths based on most common diagnostics in recent replays.

## 2026-03-01 14:44 PST — Minimax M2.5 smoke test (blocked by auth)
- Attempted 1-game 5-ply run via OpenAI-compatible path:
  - `npm run -s agent:eval-vs-mix -- --provider-name minimax --base-url https://api.minimaxi.com/v1 --keys-file secrets/provider_apis.txt --models MiniMax-M2.5 --opponent greedy --games 1 --seed 3 --turn-cap-plies 5 --timeout-ms 40000 --agent-timeout-ms 50000 --temperature 0.2 --max-tokens 800 --use-tools false --tools-mode off --stream off --stop-after-errors 1`
- Result: provider auth failure on first agent turn (`HTTP 401`, `invalid api key (2049)`), so run early-stopped after 1 ply.
- Replay: `replays/model_evals/2026-03-01T22-42-16-070Z/scenario_01_seed3_agent_vs_greedy_minimax_minimax_m2_5.json`.
- Local checks: `secrets/provider_apis.txt` has `minimax` key alias, but no `ASG_MINIMAX_API_KEY`/`ASG_OPENAI_API_KEY` env override present.
- Next step: update MiniMax API key in `secrets/provider_apis.txt` (alias `minimax`) or set `ASG_MINIMAX_API_KEY`, then rerun the same 5-ply command.

## 2026-03-01 14:46 PST — Minimax M2.5 smoke test (minimax2 alias)
- Ran with `--keys-name minimax2` and same 5-ply smoke settings.
- Alias resolution succeeded (`minimax2` present in `secrets/provider_apis.txt`).
- Outcome unchanged: first agent turn failed with upstream `HTTP 401` / `invalid api key (2049)`; run early-stopped after 1 ply.
- Replay: `replays/model_evals/2026-03-01T22-45-51-619Z/scenario_01_seed3_agent_vs_greedy_minimax_minimax_m2_5.json`.

## 2026-03-01 14:50 PST — Minimax key parsing + dual-key retest
- Verified key-file parsing compatibility with `alias: value` format for both `minimax` and `minimax2` (both present and non-empty).
- Re-ran the same 5-ply MiniMax-M2.5 smoke command twice (`--keys-name minimax` and `--keys-name minimax2`).
- Both runs failed identically on first agent turn with upstream `HTTP 401` + `invalid api key (2049)`, then early-stopped due `--stop-after-errors 1`.
- Replays:
  - `replays/model_evals/2026-03-01T22-50-03-514Z/scenario_01_seed3_agent_vs_greedy_minimax_minimax_m2_5.json`
  - `replays/model_evals/2026-03-01T22-50-06-679Z/scenario_01_seed3_agent_vs_greedy_minimax_minimax_m2_5.json`

## 2026-03-01 14:54 PST — MiniMax endpoint + key validation
- Direct API checks (outside ASG):
  - `https://api.minimaxi.com/v1` and `https://api.minimax.chat/v1` returned key auth errors.
  - `https://api.minimax.io/v1` is the working OpenAI-compatible endpoint for these keys.
- Key status at `api.minimax.io`:
  - `minimax`: accepted (chat completion succeeds).
  - `minimax2`: rejected by quota (`insufficient_balance_error (1008)`, HTTP 429).
- ASG 5-ply smoke with working key:
  - Command used `--keys-name minimax --base-url https://api.minimax.io/v1 --models MiniMax-M2.5 --turn-cap-plies 5`.
  - Result: completed 5 plies, no provider errors, draw.
  - Replay: `replays/model_evals/2026-03-01T22-52-18-646Z/scenario_01_seed3_agent_vs_greedy_minimax_minimax_m2_5.json`.
- ASG retest with second key (`minimax2`) on same endpoint:
  - Early stop on first turn due provider error `insufficient_balance_error (1008)`.
  - Replay: `replays/model_evals/2026-03-01T22-53-46-653Z/scenario_01_seed3_agent_vs_greedy_minimax_minimax_m2_5.json`.

## 2026-03-01 15:03 PST — MiniMax reasoning_split test (ply=10)
- Code update: added MiniMax `--reasoning-split` support in `openai_compat` (sent as `extra_body.reasoning_split`) and forwarded flag in `agent:eval-vs-mix`.
- Validation: `npm run -s typecheck` passed.
- Run command:
  - `npm run -s agent:eval-vs-mix -- --provider-name minimax --keys-name minimax --base-url https://api.minimax.io/v1 --keys-file secrets/provider_apis.txt --models MiniMax-M2.5 --opponent greedy --games 1 --seed 3 --turn-cap-plies 10 --timeout-ms 45000 --agent-timeout-ms 55000 --temperature 0.2 --max-tokens 800 --use-tools false --tools-mode off --stream off --reasoning-split true --stop-after-errors 1`
- Outcome: draw, 9 plies, 5 agent turns, 1 provider error turn (`timeout_budget_exhausted` at ply 8), early stop due `--stop-after-errors 1`.
- Request/call budget note: replay diagnostics show estimated 6 model calls total (sum of per-turn attempt counts), which is below the 30-call cap.
- Replay: `replays/model_evals/2026-03-01T23-01-32-930Z/scenario_01_seed3_agent_vs_greedy_minimax_minimax_m2_5.json`.
