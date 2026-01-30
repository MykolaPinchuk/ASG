# OSS short-horizon eval notes (agent04) — 2026-01-29

This document summarizes the OSS-model evaluation results and the main reliability/perf learnings from agent04’s experiments.

## Evaluation setup

- Scenario: `scenarios/scenario_01.json` (“Two Lanes, Two Resources”)
- Short-horizon bar: `turnCapPlies=30` (15 turns)
- Runs: `--games 5 --seed-start 3` (seeds 3–7)
- Opponents: `GreedyBot` and `MixBot` (`mixGreedyProb=0.5`, default)

## Results (already run)

### Provider: chutes

#### `tngtech/DeepSeek-R1T-Chimera`

- vs `GreedyBot`, `turnCapPlies=30`: **5W / 0D / 0L**
  - Seeds 3–7 plies-to-win: 25, 9, 5, 9, 13
  - `passTurns=0` in all 5 games; `providerErrors=0` in all 5 games
- vs `MixBot`, `turnCapPlies=30`: **4W / 1D / 0L**
  - Seeds 3–7: 19 (W), 30 (D), 3 (W), 21 (W), 25 (W)
  - `passTurns=0` in all 5 games; the draw is by turn-cap
  - `providerErrors=0` in all 5 games

#### `deepseek-ai/DeepSeek-V3-0324-TEE`

- vs `GreedyBot`, `turnCapPlies=30`: **1W / 4D / 0L**
  - `passTurns=0` in all 5 games; `providerErrors=0` in all 5 games
- vs `MixBot`, `turnCapPlies=30`: **4W / 1D / 0L**
  - 1 game had a single provider-error turn (`providerErrors=1`, `passTurns=1`), the rest were clean

### Provider: nanogpt

#### `mistralai/devstral-2-123b-instruct-2512` (older horizon run)

- vs `GreedyBot`, `turnCapPlies=60`: **0W / 2D / 3L**
  - No provider errors, but multiple pass turns (6–8 passes in some seeds)

#### `deepseek/deepseek-v3.2` (older horizon runs; not short-horizon-strong)

- vs `GreedyBot`, `turnCapPlies=30`: 3/3 draws (seeds 3–5) (no wins at this horizon)
- vs `GreedyBot`, `turnCapPlies=60`: 2W/1D/0L (seeds 3–5)

## What these results imply

- “Win within 15 turns” is achievable in `scenario_01`: `tngtech/DeepSeek-R1T-Chimera` wins quickly and consistently vs both `GreedyBot` and `MixBot`.
- Some models appear “non-losing” but not decisive at 15 turns: `deepseek-ai/DeepSeek-V3-0324-TEE` draws most games vs `GreedyBot` at 30 plies.
- Provider-side instability can still appear as sporadic single-turn `providerErrors`; this aligns with the need for early stopping on repeated errors (to save time), but doesn’t explain most of the “draw vs Greedy” behavior.

## Instrumentation fixes (latency + replays)

### Latency in replays

Root cause: `latencyMs` is optional in `ControllerOutput`; many controllers (bots, some ad-hoc controllers) don’t set it, and `runMatch` just copied it into the replay.

Fix:
- `src/game/match.ts` now measures wall-clock latency per `decide()` call and records it when `decision.latencyMs` is missing.
- Determinism harness now normalizes latency to keep determinism checks meaningful.

### Replay saving defaults

Some prior runs were executed with `--save-replays false` (explicitly passed), so replays for those runs cannot be recovered without rerunning.

Fix (going forward):
- `src/cli/evalModelsVsMix.ts` and `src/cli/agentVsRandom.ts` now treat `--save-replays=false` as ignored (always saving), and also print both overall latency stats and “ok-only” latency stats in per-game logs.
