# agent_logs/current.md

## Agent
- id: agent12

## Timestamp (Pacific)
- start: 2026-03-07

## Intent
- Continue v07 behavior experiments in the current simple setup.
- Immediate slice: refine EXP_014 (structured rationale) via single-variable ordering ablations, and improve rationale readability in viewer with clear section headers/paragraph formatting.

## Log
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
