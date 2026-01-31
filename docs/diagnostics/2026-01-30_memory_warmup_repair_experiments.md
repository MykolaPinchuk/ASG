# 2026-01-30 — Repair Loop + Warmup/Memory Experiments (v06)

This note records results of early v06 experiments intended to improve agent rule-following and strategic coherence:
- **Repair loop** (validator-guided retry)
- **Warmup + bounded memory** (inline and separate warmup)

Key constraint: `runs/**` is gitignored; this document references run folders (replays + per-condition summaries) but does not commit artifacts.

## What was implemented (opt-in)

Changes (all behind flags; baseline behavior unchanged unless flags are passed):
- Agent server supports:
  - `--repair on|off` (retry once using validator feedback)
  - `--memory on|off`, `--warmup off|inline|separate` (bounded per-match memory; optional warmup call)
- Provider (`openai_compat`) supports returning `memory_update` and receiving `memory`/`repair_feedback`.
- Replay analysis tool: `npm run analyze:replays` summarizes replay directories and supports paired comparisons.

Related commits on `v06`:
- `46c6b72` (runner): warmup/memory + repair flags
- `a3b9920` (docs): evaluation protocol + experiments backlog

## Evaluation protocol used

Reference: `docs/planning/EXPERIMENT_EVAL_PROTOCOL.md`.

For each cohort:
- Fixed opponent: `greedy`
- Fixed seeds: `1..5` (paired comparisons)
- Fixed prompt mode: `compact`
- Fixed temperature: `0`

## Cohorts + results

### Cohort A (short-horizon, baseline already “good”)
Provider/model: `nanogpt deepseek-ai/DeepSeek-V3.1-Terminus`

Run folder:
- `runs/experiments/2026-01-30T04-32-59Z_v06_memory_repair/REPORT.md`

Headline:
- Control had `passTurnRate=0%`, `errorTurnRate=0%`, `invalidTurnRate=0%` in this short-horizon setup (`turnCapPlies=12`).
- Interventions did not improve primary metrics and tended to add overhead or regress secondary metrics.

### Cohort B (provider/parse failure cohort)
Provider/model: `openrouter google/gemini-2.5-flash`

Run folder:
- `runs/experiments/2026-01-30T04-32-59Z_v06_memory_repair/REPORT.md`

Headline:
- Control was effectively “broken” for this harness: `passTurnRate=100%`, `errorTurnRate=100%` (all turns error/pass).
- Repair/memory/warmup did not improve outcomes; warmup-separate increased ply0 latency without fixing failures.

### Cohort C (turnCapPlies=30, baseline already “good”)
Provider/model: `openrouter meta-llama/llama-3-8b-instruct`

Run folder:
- `runs/experiments/2026-01-30T13-19-52Z_v06_memory_repair_cohort2/REPORT.md`

Headline:
- Control: `passTurnRate=0%`, `invalidTurnRate=0%`, `errorTurnRate=0%`.
- Warmup-separate increased ply0 latency and did not deliver clear strategic progress improvements.
- Repair introduced small regressions (higher latency; 1 loss in 5 seeds).

### Cohort D (turnCapPlies=30, *diagnostic* legality-error cohort)
Provider/model: `openrouter qwen/qwen-2.5-7b-instruct`

Run folder:
- `runs/experiments/2026-01-30T13-42-17Z_v06_memory_repair_cohort3/REPORT.md`

Headline (this cohort had room to improve legality):
- Control had meaningful invalid actions: `invalidTurnRate≈9.3%`.
- **Repair loop** reduced invalid actions to `≈2.7%`, but increased ok p95 latency (repair retries cost time).
- **Warmup separate** drove invalid actions to `0%` (best legality), but increased ply0 latency and did not improve outcomes in this run (still 1 loss in 5 seeds).
- **Memory inline** reduced invalid actions further (`≈1.4%`) but introduced pass turns (`passTurnRate≈12.7%`) and had 1 loss in 5 seeds.

Paired comparison JSONs (for deeper inspection):
- `runs/experiments/2026-01-30T13-42-17Z_v06_memory_repair_cohort3/compare_control_vs_repair.json`
- `runs/experiments/2026-01-30T13-42-17Z_v06_memory_repair_cohort3/compare_control_vs_memory_inline.json`
- `runs/experiments/2026-01-30T13-42-17Z_v06_memory_repair_cohort3/compare_memory_inline_vs_warmup_separate.json`

## Conclusions (as of these runs)

1) For cohorts that are already “good” (no pass/errors), these interventions do not show upside and can regress latency and/or outcomes.
2) For provider/parse-failure cohorts (all-pass/all-error), these interventions did not help; the bottleneck is upstream/provider behavior or response parsing, not legality.
3) For legality-error cohorts (non-trivial invalid actions but otherwise responsive), repair/warmup can materially improve legality, but at a latency cost and without (yet) demonstrating a net strategic/win-rate improvement under the current protocol.

## Repro notes (commands)

This is a representative template used across conditions (paths vary per run folder):
- Control:
  - `npm run -s agent:vs-random -- --provider-name <provider> --keys-file secrets/provider_apis.txt --model <model> --opponent greedy --start 1 --count 5 --turn-cap-plies 30 --timeout-ms 70000 --max-tokens 600 --temperature 0 --prompt-mode compact --out-dir <dir>/control/replays`
- Repair:
  - add `--repair on --repair-max-rounds 1`
- Memory inline (A):
  - add `--memory on --memory-max-chars 600 --warmup inline`
- Warmup separate (B):
  - add `--memory on --memory-max-chars 600 --warmup separate --warmup-timeout-ms 5000 --warmup-max-tokens 200`
- Summaries:
  - `npm run -s analyze:replays -- --dir <dir>/control/replays`
  - paired compare: `npm run -s analyze:replays -- --a <dirA> --b <dirB>`

