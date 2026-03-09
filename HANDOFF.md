# HANDOFF

## Current Slice
Work is on branch `v07`, focused on behavior experiments in the current simple setup.

## Rule Epoch Notice (Critical)
- As of 2026-03-08 (PDT), combat tie semantics changed: `delta==0` now resolves as **defender wins with 1**.
- Because this changes engine outcomes for identical seeds/actions, pre-change experiment results are **not directly comparable** to post-change runs and should not be treated as the active baseline.

Primary model/setup used in recent runs:
- Provider/model: OpenRouter `google/gemini-3.1-flash-lite-preview`
- Opponent: `greedy`
- Runtime defaults used in experiments: `reasoning-effort=medium`, `rationale-style=concise`, tools off, stream off.

Secondary model/setup (fallback qualifier):
- Provider/model: OpenRouter `xiaomi/mimo-v2-flash`
- Routing/runtime defaults: `--openrouter-provider-only xiaomi`, `--openrouter-allow-fallbacks false`, `reasoning-effort=low`, `rationale-style=concise`, `timeout-ms=120000`, `agent-timeout-ms=130000`, tools off, stream off.

## What Changed This Cycle
- Adopted EXP023 prompt as the practical baseline for future prompt-ablation experiments.
- Added explicit prompt-ablation isolation guard in eval CLI (required baseline prompt file + expected line diff).
- Re-ran EXP021 cleanly (after earlier contaminated run), ran EXP022 and EXP023 on matched seed batches.
- Updated high-level experiment conclusion logic to prioritize outcome/reliability over capture count.

Evidence (commits):
- `43a6334` — `agent12: checkpoint(workflow): adopt EXP023 prompt baseline + labeling logic`
- `9742788` — `agent12: checkpoint(misc): record EXP021/EXP022 outcomes and notes`
- `3bddbd6` — `agent12: checkpoint(workflow): enforce prompt-ablation isolation guard`

Evidence (files):
- Prompt baseline file: `experiments/baselines/system_prompt_act_exp023.txt`
- Runtime prompt source: `src/providers/openaiCompat.ts`
- Prompt guard + labeling logic: `src/cli/evalModelsVsMix.ts`, `src/cli/indexExperimentsHighLevel.ts`
- Aggregated experiment table: `runs/experiment_logs/EXPERIMENTS_SUMMARY.md`
- Run-level registry: `runs/experiment_logs/INDEX.md`

## Baseline Decision
Adopted baseline for future prompt ablations:
- `--baseline-system-prompt-file experiments/baselines/system_prompt_act_exp023.txt`

Operational note:
- Baseline file was verified to match the active runtime EXP023 prompt generation exactly (zero diff in local check).

## Latest Experiment Snapshot
- `EXP_024_rules_delta0_defender_baseline` (6 seeds): 6W/0D/0L, AvgCaptures=7.667, AvgProvErr=0.000, Plies/Win=12.333.
- `EXP_021_chain_combat_sentence` (clean, 6 seeds): labeled `promising` after updated rubric.
- `EXP_022_chain_fast_wins_sentence` (6 seeds): labeled `regression` (provider error delta regression).
- `EXP_023_chain_directions_sentence` (6 seeds): labeled `promising` under updated rubric.
- Earlier stacked run preserved separately as:
  - `EXP_021_chain_combat_sentence_contaminated`

Applicability note:
- EXP021/EXP022/EXP023 and earlier rows were collected before the 2026-03-08 combat tie rule change and are historical only for directional context.

Source of truth:
- `runs/experiment_logs/EXPERIMENTS_SUMMARY.md`

## Human Direction To Carry Forward
Human concern recorded:
- Guidance may be becoming too explicit/instruction-heavy.
- Keep EXP023 baseline for current model family.
- When switching to stronger models, run A/B tests with reduced/removed explicit guidance to test whether similar behavior emerges without heavy hand-holding.

Recorded in:
- `human_notes_future_experiemnts.md`
- `a2a_notes.md`

## Next Agent Task (Immediate)
Next agent should work on small game-setup changes, starting with draw-resolution logic.

Suggested first slice:
1. Define exact intended draw-resolution behavior change (single-variable).
2. Implement minimally in engine/rules path.
3. Run short paired evals with strict isolation and updated logging.

Likely touchpoints:
- `src/game/engine.ts`
- `docs/planning/MVP_SPEC.md` (if rule semantics change)
- `docs/GAME_RULES.md` (human-readable rule update)

## Repro / Commands
- Refresh summaries:
  - `npm run -s exp:index-runs`
  - `npm run -s exp:summary`
- Run prompt ablation safely:
  - `npm run -s agent:eval-vs-mix -- ... --ablation-key prompt.<...> --baseline-system-prompt-file experiments/baselines/system_prompt_act_exp023.txt --expected-system-prompt-diff-lines <N>`

## Known Risks / Notes
- Summary/table reads can look stale if generation and reading are run in parallel; run `exp:summary` sequentially before interpreting.
- Keep artifacts out of git (`runs/`, `replays/`, `dist/`, `node_modules/`, secrets).

## Git Notes
- Intentionally untracked local-only folder remains:
  - `human_experiment_notes/`
