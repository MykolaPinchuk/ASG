# HANDOFF

## Current Slice
Work is on branch `v07`, focused on behavior experiments in the current simple setup.

## Rule Epoch Notice (Critical)
- As of 2026-03-08 (PDT), combat tie semantics changed: `delta==0` now resolves as **defender wins with 1**.
- Replay schema/version was bumped to `1.0.0` to mark this semantic break.
- Pre-change and post-change experiment rows should not be mixed as a single baseline without explicit caveat.

## Active Model Policy
Primary model/setup:
- Provider/model: OpenRouter `google/gemini-3.1-flash-lite-preview`
- Opponent: `greedy`
- Runtime defaults: `reasoning-effort=medium`, `rationale-style=concise`, tools off, stream off.

Secondary model/setup:
- Provider/model: OpenRouter `xiaomi/mimo-v2-flash`
- Runtime/routing defaults: `reasoning-effort=low`, `rationale-style=concise`, `timeout-ms=120000`, `agent-timeout-ms=130000`, tools off, stream off, `--openrouter-provider-only xiaomi`, `--openrouter-allow-fallbacks false`.
- Human direction: keep Mimo as secondary for now; possible future primary candidate (cost note recorded: ~60% cheaper than Gemini 3.1 flash-lite).

## What Changed This Cycle
- Implemented engine rule change for combat tie (`delta==0`): defender always wins with 1 force.
- Updated rules/docs and replay versioning for that rule change.
- Added baseline-update synthetic rows in high-level experiment summary.
- Added OpenRouter provider-routing controls in runtime and eval CLI passthrough:
  - `--openrouter-provider-only`
  - `--openrouter-provider-order`
  - `--openrouter-allow-fallbacks`
- Added system-prompt override plumbing for controlled instruction A/B:
  - `--system-prompt-file`
- Ran Mimo prompt explicitness A/B (`EXP_034`) on 6 seeds under fixed runtime.

Evidence (commits):
- `52b44de` — `agent13: checkpoint(engine): make combat ties defender-win and sync rule docs`
- `1b8b0fa` — `agent13: checkpoint(workflow): add baseline-update rows in experiment summary`
- `7eeedaa` — `agent13: checkpoint(workflow): set mimo-low as secondary and add Xiaomi-only routing flags`
- `053f42b` — `agent13: checkpoint(workflow): record mimo role+cost and add prompt override plumbing`

Evidence (files):
- Engine/rules:
  - `src/game/engine.ts`
  - `src/game/match.ts`
  - `docs/GAME_RULES.md`
  - `docs/planning/MVP_SPEC.md`
- Runtime/provider controls:
  - `src/providers/openaiCompat.ts`
  - `src/cli/evalModelsVsMix.ts`
- Experiment outputs:
  - `runs/experiment_logs/INDEX.md`
  - `runs/experiment_logs/EXPERIMENTS_SUMMARY.md`
  - `runs/experiment_logs/2026-03-08T19-24-23-389PDT_openrouter_greedy/summary.json`
  - `runs/experiment_logs/2026-03-08T19-44-37-640PDT_openrouter_greedy/summary.json`

## Latest Experiment Snapshot
- `EXP_024_rules_delta0_defender_baseline` (Gemini, 6 seeds): 6W/0D/0L, AvgCaptures=7.667, AvgProvErr=0.000, Plies/Win=12.333.
- `EXP_034_mimo_low_explicit_vs_less_explicit_s6` (Mimo low, 6 seeds each arm):
  - Current explicit instructions: 6W/0D/0L, Plies/Win=7.000, AvgProvErr=0.000.
  - Older less-explicit instructions: 6W/0D/0L, Plies/Win=11.333, AvgProvErr=0.000.
  - Directionally, explicit instructions improved Mimo ply efficiency.

Source of truth:
- `runs/experiment_logs/EXPERIMENTS_SUMMARY.md`

## Human Direction To Carry Forward
- Keep Mimo as secondary for now; reevaluate promotion later.
- Cost is relevant in model-role decisions (Mimo marked as substantially cheaper).
- Do not run extra Gemini comparison tests unless explicitly requested (last request was to stop additional runs and use existing evidence).

Recorded in:
- `human_notes_future_experiemnts.md`
- `a2a_notes.md`

## Next Agent Task (Immediate)
No mandatory pending code task from this cycle.

If asked to continue model-comparison work, suggested safe next slice:
1. Confirm comparison scope (strictly same epoch/seeds/settings vs historical directional).
2. Run only explicitly requested arms.
3. Refresh `exp:index-runs` and `exp:summary` and report deltas with caveats.

## Repro / Commands
- Refresh summaries:
  - `npm run -s exp:index-runs`
  - `npm run -s exp:summary`
- Mimo explicitness A/B pattern:
  - `npm run -s agent:eval-vs-mix -- --provider-name openrouter --models xiaomi/mimo-v2-flash --seeds 301,302,303,304,305,306 --unsafe-allow-many true --turn-cap-plies 30 --reasoning-effort low --rationale-style concise --timeout-ms 120000 --agent-timeout-ms 130000 --openrouter-provider-only xiaomi --openrouter-allow-fallbacks false ...`
- Less-explicit prompt override arm:
  - add `--system-prompt-file experiments/EXP_014_rationale_struct10/artifacts/control/prompts/system_prompt_act.txt`

## Known Risks / Notes
- Summary/table reads can look stale if generation and reading are run in parallel; run `exp:summary` sequentially before interpreting.
- Provider routing pinning can fail if provider availability changes; monitor early-stop due to `stopAfterErrors`.
- Keep artifacts/secrets out of git (`runs/`, `replays/`, `dist/`, `node_modules/`, `secrets/`).

## Git Notes
- `.gitignore` remains strict for artifacts and secrets (no change needed this cycle).
- Intentionally untracked local-only folder remains:
  - `human_experiment_notes/`
