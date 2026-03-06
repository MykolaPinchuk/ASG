# Experiment Pack Spec (v1, minimal)

Goal: make each ablation self-serve from the repo without chat context.

Global policy file:
- `experiments/POLICY.json` (default seed profile, control rerun cadence).

## Directory layout

- `experiments/EXP_###_<slug>/experiment.json`
- `experiments/EXP_###_<slug>/conditions/control.json`
- `experiments/EXP_###_<slug>/conditions/variant.json`
- `experiments/EXP_###_<slug>/artifacts/control/...`
- `experiments/EXP_###_<slug>/artifacts/variant/...`
- `experiments/EXP_###_<slug>/results/state_diff.md`
- `experiments/EXP_###_<slug>/results/latest.md`
- `experiments/EXP_###_<slug>/results/replay_index.csv`

## Condition file contract

`conditions/*.json` stores the full runnable state for that condition:
- model/provider/base URL/models
- scenario path/hash/id
- opponent + seeds + game horizon
- runtime knobs (timeouts, prompt mode, tools, reasoning, memory/warmup, repair/retry/select)
- links to produced run artifacts (`manifest/summary/game_metrics/turn_metrics/replaysDir`)

## Artifacts contract

For each condition, snapshot the instructions/rules used by the agent:
- `prompts/system_prompt_act.txt`
- `prompts/user_prompt_template_act.txt`
- optional warmup prompt snapshots when relevant
- `rules_snapshot.md` (frozen copy from current rule sources)

## Ablation guard

Baseline vs variant is validated from `condition.state`:
- default: exactly one changed path
- optional explicit allowlist of changed paths

Write changed paths to `results/state_diff.md`.

## Results surface

`results/latest.md` is the human entrypoint:
- links to condition files and prompt/rule snapshots
- links to baseline/variant run artifacts
- replay index location

`results/replay_index.csv` contains `condition,seed,result,replayPath`.

Optional detailed report:
- `results/comparison.md` (+ `comparison.json`) generated via `npm run exp:report`
- includes outcome deltas, turns-to-win, latency deltas, token usage deltas (when server logs are available), and strict suboptimal reinforce counts.
- `results/interpretation.md` (+ `interpretation.json`) generated via `npm run exp:report`
  - short decision (`promising` / `inconclusive` / `regression`)
  - confidence level
  - control rerun due flag from policy cadence

Registry:
- `experiments/INDEX.md` + `experiments/INDEX.csv` keep one row per experiment with key deltas and interpretation fields.
