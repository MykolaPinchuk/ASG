# agent_logs/current.md

## Agent
- id: agent08

## Timestamp (Pacific)
- start: 2026-01-31

## Intent
- v07: complexity experiment (see `docs/planning/V07_COMPLEXITY_EXPERIMENT.md`)

## Notes
- Do not commit secrets or bulky artifacts (see `.gitignore`).
- Keep v0 / v0.x eval guardrails by default (`turnCapPlies<=30`, `games<=5`, always save replays, persist `turns[*].latencyMs`).

## 2026-01-31 07:17 PST — Onboard
- Read repo index/state docs (`HANDOFF.md`, `REPO_MAP.md`, `docs/planning/MVP_SPEC.md`) and current v07 plan.
- Current slice: v07 complexity experiment; keep mechanics-only prompts + v0/v0.x eval guardrails.
- Next steps: (1) re-run baseline protocol for the 3 baseline models on `scenario_01` (seeds 3,4, 30 plies), then (2) start complexity ramp step 1 (clarify rules/action space) with replay-backed metrics.

## 2026-01-31 07:35 PST — Extra context read
- `human_notes.md`: repeated agent confusion about ownership/capture and stateless play; suggests turn-0 warmup + bounded memory, plus possible “game0” sandbox.
- v06 work already implemented warmup/memory and validator-guided repair loop behind flags (see `docs/diagnostics/2026-01-30_memory_warmup_repair_experiments.md`).
- Evidence so far: repair/warmup can reduce invalid actions for “legality-error” cohorts but tends to add latency and hasn’t clearly improved win-rate for already-good cohorts.

## 2026-01-31 12:46 PST — Baseline refresh (no concurrency)
- Chutes / `tngtech/DeepSeek-R1T-Chimera` vs MixBot, seeds 3,4, 30 plies: 2/2 wins, 0 provider errors. Replays: `replays/model_evals/2026-01-31T20-35-25-707Z`.
- Cerebras / `gpt-oss-120b` (reasoning-effort=high, tools off) vs MixBot, seeds 3,4, 30 plies: 2/2 wins, 0 provider errors. Replays: `replays/model_evals/2026-01-31T20-41-34-662Z`.
- OpenRouter / `x-ai/grok-4.1-fast` vs MixBot, seeds 3,4, 30 plies: 2/2 wins, 1 provider-error turn in seed3. Replays: `replays/model_evals/2026-01-31T20-41-54-087Z`.
- Refreshed `performance.md` via `npm run -s perf:top20`.

## 2026-01-31 13:14 PST — Performance table pin + Cerebras “high-only”
- Reordered `docs/focus20_models.md` so Grok/Chimera/Cerebras-120B are the first 3 rows in `performance.md`.
- Added replay metadata `players[*].config.reasoningEffort` (and other run knobs) via agent server → controller → replay, and updated replay schema accordingly.
- Updated `perf:top20` generator to use `players[*].config` when present, and to treat Cerebras `gpt-oss-120b` row as “reasoning-effort=high only” (older Cerebras replays without config are excluded).

## 2026-01-31 15:49 PST — Top-3 extended baseline (3 more games each)
- Chutes / Chimera vs MixBot, seeds 5,6,7: 3/3 wins, 0 provider errors. Replays: `replays/model_evals/2026-01-31T23-37-17-596Z`.
- Cerebras / `gpt-oss-120b` (high) vs MixBot, seeds 5,6,7: 2 wins, 1 draw; provider-error turns observed (esp seed7). Replays: `replays/model_evals/2026-01-31T23-41-12-407Z`.
- OpenRouter / Grok vs MixBot, seeds 5,6,7: 3/3 wins, 0 provider errors. Replays: `replays/model_evals/2026-01-31T23-43-09-762Z`.
- Refreshed `performance.md` via `npm run -s perf:top20`.

## 2026-01-31 16:10 PST — Cerebras debug logging for `openai_compat` parse failures
- Added error metadata propagation so `runs/agent_io/**` server logs include upstream `raw` response even when `openai_compat` throws (helps debug JSON parse failures).
- Ran Cerebras `gpt-oss-120b` (high) vs MixBot with `--server-log-dir`:
  - seeds 8,9,10: `runs/agent_io/cerebras_gpt_oss_120b_high_debug_2026-01-31T15-59-53PST`
  - seeds 11,12,13: `runs/agent_io/cerebras_gpt_oss_120b_high_debug2_2026-01-31T16-07-00PST`

## 2026-01-31 16:18 PST — `openai_compat` hardening: avoid parsing JSON snippets in reasoning
- Tightened parsing so we only parse `message.reasoning` when it *starts with* `{` (prevents treating schema/examples inside reasoning as the final JSON).
- Improved JSON extraction to take the first complete JSON object from output (tolerates trailing text / multiple concatenated JSON objects).
- Verified in a fresh Cerebras run (seeds 14/15/16) that “Unexpected non-whitespace after JSON” no longer appears; failures are now correctly classified as `empty_output` when the model never emits final JSON. Debug logs: `runs/agent_io/cerebras_gpt_oss_120b_high_debug3_2026-01-31T16-15-51PST`.
