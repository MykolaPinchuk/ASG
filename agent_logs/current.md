# agent_logs/current.md

## Agent
- id: agent08

## Timestamp (Pacific)
- start: 2026-03-05

## Intent
- Continue v07 behavior experiments in the current simple setup using OpenRouter `google/gemini-3.1-flash-lite-preview` (`--reasoning-effort medium`) as primary, with `x-ai/grok-4.1-fast` (`--reasoning-effort low`) as secondary.

## Log

### 2026-03-05 18:59 PST - Onboard
- Read required onboarding files (`agents.md`, `repo_workflow.md`, `onboarding.md`, `HANDOFF.md`, `REPO_MAP.md`, `README.md`, `docs/planning/MVP_SPEC.md`) and bounded discovery set for the current v07 qualification slice.
- Confirmed current baseline: OpenRouter `google/gemini-3.1-flash-lite-preview` (`--reasoning-effort medium`) as primary and OpenRouter `x-ai/grok-4.1-fast` (`--reasoning-effort low`) as secondary, with strict v0 guardrails (`turnCapPlies<=30`, `games<=5`, replay+latency required).
- Next steps: choose one focused slice and execute a small paired batch (qualification refresh, provider reliability cross-check, or harness-level A/B) with preserved seeds and full replay artifacts.

### 2026-03-05 19:10 PST - Experiment logging foundation
- Added `agent:eval-vs-mix` logging outputs for ablation workflows: `summary.json` (now includes experiment metadata), `manifest.json`, `game_metrics.jsonl`, and `turn_metrics.jsonl`.
- Added reproducibility metadata capture (experiment ids, baseline/ablation labels, hypothesis/notes, git state, scenario sha256, runtime/setup settings, output paths, row counts).
- Added docs/schema for the logging contract: `docs/planning/EXPERIMENT_LOGGING_SPEC.md` and `schemas/experiment_run.schema.json`; updated protocol/index docs accordingly.

### 2026-03-05 19:34 PST - Minimal experiment pack implementation
- Added `npm run exp:pack` (`src/cli/experimentPack.ts`) to materialize committed experiment packs from control/variant manifests: condition state snapshots, prompt/rule artifacts, `state_diff.md` ablation guard, `latest.md`, and replay index CSV.
- Extended `agent:eval-vs-mix` to pass through and log additional evolution dimensions (memory/warmup/repair/retry/select/fallback), keeping manifests expressive for future experiments.
- Added pack docs/index (`experiments/README.md`, `experiments/INDEX.md`) and spec (`docs/planning/EXPERIMENT_PACK_SPEC.md`), then validated end-to-end with a local smoke pack (`EXP_999_pack_smoke`).

### 2026-03-05 19:55 PST - EXP_014 rationale format ablation
- Added `--rationale-style` support (`concise`/`structured10`) across prompt generation + run logging + replay metadata and experiment-pack snapshots.
- Ran paired 3-seed experiment vs current baseline model (`openrouter`, `google/gemini-3.1-flash-lite-preview`, `reasoning-effort=medium`, `greedy`, seeds 301/302/303):
  - Control: `runs/experiment_logs/EXP_014_rationale_struct10/control/summary.json` → 3W/0D/0L, 0 provider-error turns.
  - Variant (`--rationale-style structured10`): `runs/experiment_logs/EXP_014_rationale_struct10/variant_struct10/summary.json` → 3W/0D/0L, 0 provider-error turns.
- Materialized committed pack: `experiments/EXP_014_rationale_struct10/` with state snapshots, prompt/rules artifacts, diff guard (`runtime.rationaleStyle` only), and replay index.

### 2026-03-05 20:12 PST - Comprehensive experiment reporting
- Added `npm run exp:report` (`src/cli/reportExperiment.ts`) to generate `results/comparison.md` + `comparison.json` with:
  - turns-to-win,
  - latency deltas,
  - token usage totals/per-turn (from agent server logs),
  - strict suboptimal reinforce counts (missed deployable supply).
- Re-ran EXP_014 control/variant with `--server-log-dir` enabled to capture token usage, regenerated experiment pack, and produced:
  - `experiments/EXP_014_rationale_struct10/results/comparison.md`
  - `experiments/EXP_014_rationale_struct10/results/comparison.json`

### 2026-03-05 20:30 PST - Experiment policy defaults + registry interpretation
- Added repo-level experiment policy at `experiments/POLICY.json`:
  - default seed profile: `smoke3` (`301,302,303`)
  - control rerun cadence: every `5` variant experiments.
- Updated `agent:eval-vs-mix` to support `--seed-profile` and default to policy profile when no explicit seed args are provided; policy metadata now appears in `summary.json`/`manifest.json`.
- Extended reporting:
  - `npm run exp:report` now writes `results/interpretation.md` + `interpretation.json` (decision/confidence/control-rerun due),
  - and refreshes `experiments/INDEX.md` + `experiments/INDEX.csv` (one row per experiment with deltas and interpretation fields).
- Added shared registry updater (`src/experiments/indexRegistry.ts`) and wired both `exp:pack` and `exp:report` to use it.
