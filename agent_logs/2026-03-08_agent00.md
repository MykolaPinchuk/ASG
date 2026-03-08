# agent_logs/current.md

## Agent
- id: agent12

## Timestamp (Pacific)
- start: 2026-03-07

## Intent
- Continue v07 behavior experiments in the current simple setup.
- Immediate slice: refine EXP_014 (structured rationale) via single-variable ordering ablations, and improve rationale readability in viewer with clear section headers/paragraph formatting.

## Log
- 2026-03-08 14:08:43 PDT — Adopted EXP023 as new prompt baseline for follow-up prompt ablations.
  - Added canonical baseline file: `experiments/baselines/system_prompt_act_exp023.txt`.
  - Updated docs pointers in `README.md` and `REPO_MAP.md` to use this file for `--baseline-system-prompt-file`.
  - Recorded human concern: guidance may be near over-explicit; keep for current model but plan stronger-model A/B without such explicit instructions.
- 2026-03-08 13:46:58 PDT — Completed EXP021 clean reruns + EXP022 follow-up and recorded outcome.
  - Added prompt-ablation isolation guard in `src/cli/evalModelsVsMix.ts` (requires baseline prompt file + expected line diff for `prompt.*` ablations, with fail-fast mismatch).
  - Re-ran clean EXP021 with isolation (`diffLines=1`): `variant_exp021_chain_sentence_s3_clean` vs `control` and `variant_exp021_chain_sentence_plus3_clean` vs `control_plus3` (both 3W/0D/0L).
  - Ran EXP022 (`diffLines=2`) for seeds 301-303 and 304-306: `variant_exp022_chain_fastwins_s3`, `variant_exp022_chain_fastwins_plus3`.
  - Re-labeled earlier stacked run as `EXP_021_chain_combat_sentence_contaminated` in run logs to keep high-level table truthful.
  - User takeaway recorded in `human_notes_future_experiemnts.md`: EXP021 somewhat promising but not dramatic; EXP022 below expectation.
- 2026-03-08 12:35:44 PDT — Extended high-level experiment dashboard with latency + token metrics.
  - Updated `src/cli/indexExperimentsHighLevel.ts` to derive `AvgLatencyMs` from `game_metrics.jsonl` (weighted by agent turns) and `AvgTokens/Turn` from `turn_metrics.jsonl`.
  - Added paired deltas `LatencyΔms` and `TokensΔ/Turn`.
  - Regenerated `runs/experiment_logs/EXPERIMENTS_SUMMARY.md` and `.csv`.
- 2026-03-08 12:32:49 PDT — Added `Plies/Win` metrics to high-level experiment dashboard.
  - Updated `src/cli/indexExperimentsHighLevel.ts` to derive per-run `avgPliesWhenWin` from `game_metrics.jsonl`.
  - Added columns in `runs/experiment_logs/EXPERIMENTS_SUMMARY.md` and `.csv`: `Plies/Win` and `Plies/WinΔ`.
  - Regeneration command unchanged: `npm run exp:summary`.
- 2026-03-08 12:29:05 PDT — Fixed high-level experiment summary baseline pairing.
  - Updated `src/cli/indexExperimentsHighLevel.ts` to resolve baseline aliases across experiments (same model/opponent/seeds, with control-like fallback) instead of requiring exact condition id only.
  - Regenerated `runs/experiment_logs/EXPERIMENTS_SUMMARY.md` and `.csv`; EXP015 and EXP020 now compare against existing control data rather than `needs_control`.
- 2026-03-08 12:21:39 PDT — Added one-row-per-experiment dashboard (requested high-level source of truth).
  - Implemented `src/cli/indexExperimentsHighLevel.ts` + npm script `exp:summary`.
  - Generated `runs/experiment_logs/EXPERIMENTS_SUMMARY.md` and `.csv` from all `runs/experiment_logs/**/summary.json`.
  - Dashboard includes one line per experiment with aggregate W/D/L, win rate, captures, provider errors, paired deltas, auto conclusion, and short explanation.
  - Updated discoverability in `REPO_MAP.md` and `experiments/README.md`.
- 2026-03-08 12:15:35 PDT — Added run-level experiment source-of-truth registry.
  - Implemented `src/cli/indexExperimentRuns.ts` and npm script `exp:index-runs`.
  - Generated `runs/experiment_logs/INDEX.md` + `INDEX.csv` from all `runs/experiment_logs/**/summary.json` files.
  - Clarified docs: `experiments/README.md` and `REPO_MAP.md` now distinguish pack-level index (`experiments/INDEX.*`) vs run-level index (`runs/experiment_logs/INDEX.*`).
- 2026-03-08 12:05:12 PDT — Ran EXP020 first batch after prompt-intro change.
  - Command: `npm run -s agent:eval-vs-mix -- --provider-name openrouter --models google/gemini-3.1-flash-lite-preview --opponent greedy --seeds 301,302,303 --reasoning-effort medium --rationale-style concise --use-tools false --tools-mode off --stream off --experiment-id EXP_020_prompt_intro_lines --condition-id variant_exp020_intro2_s3 --baseline-condition-id control_prev_prompt_s3 --ablation-key prompt.system_intro_text`
  - Result: 3W / 0D / 0L, 0 provider-error turns, captureRate=100%.
  - Artifacts: `runs/experiment_logs/2026-03-08T12-00-00-841PDT_openrouter_greedy/{summary.json,manifest.json,game_metrics.jsonl,turn_metrics.jsonl}`
  - Replays: `replays/model_evals/2026-03-08T12-00-00-874PDT/`
- 2026-03-08 11:59:09 PDT — EXP020 prompt variant setup (queued run preparation).
  - Verified `human_experiment_notes/EXP020_instructions.txt` differs from baseline `system_prompt_act.txt` only by 2 added top instruction lines (plus a blank separator).
  - Applied those 2 lines to runtime system prompt construction in `src/providers/openaiCompat.ts` (at the top of `buildSystemPrompt`).
  - `npm run -s typecheck` passed.
- 2026-03-07 20:40:35 PST — Added queued future-experiment doc and recorded new idea for later run.
  - Created `docs/planning/FUTURE_EXPERIMENT_IDEAS.md` as a parking lot for planned-but-not-run experiments.
  - Added `EXP_016_enemy_supply_salience_sentence` (single sentence prompting explicit enemy supply-state evaluation) with suggested A/B setup and first 3 seeds.
  - Linked new doc in `REPO_MAP.md`.
- 2026-03-07 20:23:28 PST — EXP015 implementation + first 3-seed run completed.
  - Code: added new provider rationale style `structured10_exp015` in `src/providers/openaiCompat.ts` with heading order `Current Game State -> Enemy State -> Agent Thoughts and Plans -> Agent Actions`.
  - Code: updated `viewer/index.html` rationale panel to detect/render structured sections with clear headers and fallback to raw text when headings are missing.
  - Run: `EXP_015_rationale_order_sections` (`variant_exp015_order_s3`) on seeds 301/302/303 vs `greedy` using OpenRouter `google/gemini-3.1-flash-lite-preview` (`reasoning-effort=medium`).
  - Result: 2W/1D/0L, 0 provider-error turns, 0 pass turns; artifacts under `runs/experiment_logs/2026-03-07T20-18-39-458PST_openrouter_greedy/` and replays under `replays/model_evals/2026-03-07T20-18-39-490PST/`.
- 2026-03-07 20:09:26 PST — Added identity-sync guardrails to prevent agent ID mismatch across chat tag vs repo state.
  - Updated `repo_workflow.md`: authoritative precedence (kickoff `agentNN` wins), mandatory onboarding sync, commit-prefix guard, and rotated-log filename clarification.
  - Updated `onboarding.md` to require identity sync before onboarding steps.
  - Updated `.codex/skills/onboard/SKILL.md` with explicit step 1 identity sync and required sync log line.
- 2026-03-07 20:00:58 PST — Corrected active agent id to `agent12` per user instruction.
- 2026-03-07 19:59:16 PST — Onboarded current v07 slice.
  - Read required index/state files (`agents.md`, `repo_workflow.md`, `onboarding.md`, `HANDOFF.md`, `REPO_MAP.md`, `README.md`, `docs/planning/MVP_SPEC.md`) plus bounded discovery set focused on EXP_014 + viewer rationale UI.
  - Confirmed immediate objective remains EXP_014 follow-up: run single-variable rationale section-order ablations and improve rationale readability in viewer.
  - Next steps: (1) add new `--rationale-style` variants in `src/providers/openaiCompat.ts` for order testing, (2) render rationale sections as clear headers/paragraph blocks in `viewer/index.html`, (3) run short paired seeds with `agent:eval-vs-mix` and log manifests/summaries.
