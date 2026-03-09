# agent_logs/current.md

## Agent
- id: agent13

## Timestamp (Pacific)
- start: 2026-03-08

## Intent
- Handoff complete.
- Next slice expected: small game-setup/rules changes (starting with draw-resolution logic), with strict isolated evals.

## Log
- 2026-03-08 14:08:43 PDT — Baseline updated to EXP023 prompt file and docs/notes aligned.
- 2026-03-08 14:12:00 PDT — Handoff prepared for next agent; see `HANDOFF.md`.
- 2026-03-08 14:15:10 PDT — Identity sync: session_tag=agent13 current_md_before=agent12 current_md_after=agent13 synced=true
- 2026-03-08 14:15:48 PDT — Onboard complete: indexed workflow/spec/current handoff, confirmed draw resolution currently uses RNG coin flip at delta==0, next slice is minimal draw-resolution rule change + docs/spec alignment + short isolated eval.
- 2026-03-08 14:25:20 PDT — Implemented combat tie rule change: delta==0 now defender wins with 1; aligned engine/spec/agent prompt/docs; bumped replay version to 1.0.0 per versioning policy; smoke run + replay validation passed.
- 2026-03-08 14:36:53 PDT — Checkpoint commit created (`52b44de`), reran post-rule-change baseline on seeds 301-306 (6W/0D/0L, avgCaptures=7.667, avgProvErr=0), refreshed experiment indexes/summaries, and added explicit non-comparability notes for pre-change results.
- 2026-03-08 14:40:33 PDT — Updated high-level summary generator to emit synthetic `BASELINE_UPDATE:*` rows for baseline-marked conditions (`conditionId=baseline*`), then regenerated `runs/experiment_logs/EXPERIMENTS_SUMMARY.{md,csv}`.
- 2026-03-08 15:25:43 PDT — Ran one full-horizon (30 plies) seed for each Minimax model with runtime timeout 120s and unchanged prompt time budget: M2.1 (seed301 draw, avgLatencyMs=42980, provErr=0), M2.5 (seed301 draw, avgLatencyMs=47418, provErr=1); refreshed run index and summary.
- 2026-03-08 15:53:19 PDT — Ran high-reasoning single-seed (301) full-horizon tests for Minimax models with same runtime settings: M2.1 (draw, avgLatencyMs=38790, provErr=0), M2.5 (loss at 22 plies, avgLatencyMs=53592, provErr=1); linked each to medium baseline via baselineConditionId and refreshed experiment indexes/summaries.
- 2026-03-08 16:12:06 PDT — Ran OpenRouter `xiaomi/mimo-v2-flash` sanity test (seed301, 30-ply cap, medium/concise/tools-off/stream-off): draw at 23 plies with providerErrors=2 and early stop after error budget; refreshed experiment indexes/summaries.
- 2026-03-08 16:40:40 PDT — Reran `xiaomi/mimo-v2-flash` with timeout 120s (agent timeout 130s) across reasoning low/medium/high on seed301: all 3 runs were wins with providerErrors=0 (plies: low=9, medium=9, high=11); refreshed experiment indexes/summaries.
- 2026-03-08 18:52:40 PDT — Added OpenRouter provider-routing flags (`--openrouter-provider-only|--openrouter-provider-order|--openrouter-allow-fallbacks`) and eval passthrough, then reran `xiaomi/mimo-v2-flash` with Xiaomi-only routing + timeout 120s for reasoning low/medium/high (seed301): all 3 runs won with providerErrors=0 (plies: low=6, medium=7, high=8); refreshed experiment indexes/summaries.
- 2026-03-08 19:08:11 PDT — Promoted OpenRouter `xiaomi/mimo-v2-flash` (`reasoning-effort=low`, Xiaomi-only routing, timeout120/agent130) to secondary model role for future runs; recorded in `HANDOFF.md` and `a2a_notes.md`.
- 2026-03-08 20:04:36 PDT — Corrected experiment intent mid-run: aborted initial tie-wording epoch test, added `--system-prompt-file` override support (plus eval passthrough/prompt snapshot support) to compare instruction explicitness directly.
- 2026-03-08 20:04:36 PDT — Ran EXP_034 on OpenRouter `xiaomi/mimo-v2-flash` (low, Xiaomi-only, timeout120/agent130) across seeds 301-306: current explicit baseline prompt vs older less-explicit EXP014 prompt; both 6/6 wins, but less-explicit prompt required more plies and showed higher latency/tokens; refreshed experiment indexes/summaries.
- 2026-03-09 14:26:11 PDT — User requested no additional test runs for Gemini comparison; halted in-progress rerun attempts and switched to documenting current evidence only. Added explicit note in `human_notes_future_experiemnts.md` that Gemini less-explicit post-EXP024 data is currently missing, so strict cross-model 2x2 comparison is incomplete.
- 2026-03-09 14:37:52 PDT — Recorded human decision: keep `xiaomi/mimo-v2-flash` as secondary model for now, with potential future promotion to primary; noted estimated ~60% cost advantage vs `google/gemini-3.1-flash-lite-preview`.
