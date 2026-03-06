# Experiment Logging Spec (v07)

This document defines the minimum logging contract for single-variable ablation experiments.

## Goal

Each run must be reconstructable later without relying on chat history:
- what changed vs baseline,
- exactly what command/config was used,
- what happened per game and per turn,
- and why a decision was made for the next iteration.

## Required artifacts per run

1. `summary.json`
- Aggregate run output (W-D-L, capture rate, provider-error summary).
- Includes `experimentId`, `conditionId`, run metadata.

2. `manifest.json`
- Full reproducibility state:
- experiment metadata (`experimentId`, `conditionId`, optional baseline/ablation key/hypothesis/notes),
- git state (`branch`, `commit`, `dirty`),
- command line (`argv`, `cwd`),
- scenario identity (`path`, `id`, `sha256`),
- runtime/harness settings (timeouts, tools mode, reasoning mode, etc.),
- output file locations and row counts.
- includes seed policy context (`seedProfile` when used + policy cadence metadata).

3. `game_metrics.jsonl`
- One JSON object per game.
- Includes game-level reliability, tempo, and latency stats.

4. `turn_metrics.jsonl`
- One JSON object per agent turn.
- Includes action types, pass/invalid flags, latency, retries/fallbacks, and normalized error tags.

5. Replays
- Replays remain mandatory and are the source of truth for in-depth inspection.

## Error taxonomy

Turn metrics should classify errors using stable tags:
- `timeout`
- `rate_limit`
- `provider_5xx`
- `provider_4xx`
- `empty_output`
- `json_parse_error`
- `invalid_action`
- `fallback_used`
- `controller_error`

These tags make cross-run comparisons robust even when provider text varies.

## CLI contract (`agent:eval-vs-mix`)

Supported metadata flags:
- `--experiment-id`
- `--condition-id`
- `--baseline-condition-id`
- `--ablation-key`
- `--hypothesis`
- `--notes`
- `--seed-profile`

Supported output flags:
- `--manifest-out`
- `--game-metrics-out`
- `--turn-metrics-out`
- `--experiment-log-dir`
- `--experiment-log true|false`

Defaults:
- If `--out` is omitted and experiment logging is enabled, outputs are written under `runs/experiment_logs/<run_id>_.../`.

## Process requirement

For each experiment batch:
- change one variable only,
- use fixed paired seeds,
- log a baseline condition and variant condition under the same `experimentId`,
- write a short decision note after analysis (continue / reject / refine).

Companion surface for humans:
- Materialize committed experiment packs under `experiments/EXP_###_<slug>/` (see `docs/planning/EXPERIMENT_PACK_SPEC.md`).
