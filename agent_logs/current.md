# agent_logs/current.md

## Agent
- id: agent14

## Timestamp (Pacific)
- start: 2026-03-09

## Intent
- Awaiting next slice.

## Log
- 2026-03-09 14:48:30 PDT — Handoff prepared and log rotated from previous cycle.
- 2026-03-09 14:49:09 PDT — Identity sync: session_tag=agent14 current_md_before=agent13 current_md_after=agent14 synced=true
- 2026-03-09 14:49:09 PDT — Onboard complete: confirmed post-EXP024 rule epoch, active branch state in HANDOFF, and current priority on bounded model/prompt comparisons (Mimo secondary, Gemini less-explicit gap still open). Next: execute user-selected slice (strict 2x2 completion, Mimo follow-up, or no-run documentation/reporting).
- 2026-03-09 14:49:09 PDT — Resolved live combat-tie inconsistency for post-EXP024 epoch: updated active prompt artifacts to state `delta==0` => defender wins with 1. Left `IA_HANDOFF/` immutable snapshot and `openaiCompat` historical `pre_exp024` prompt branch unchanged for exact legacy reproduction.
- 2026-03-09 15:05:00 PDT — Drafted action/memory representation spec: separate canonical per-ply action log, derived full-turn memory object, and minimal prompt-memory payload. Recommendation is to start memory work with compact derived history rather than raw state snapshots.
- 2026-03-09 15:41:38 PDT — Implemented first replay/runtime slice for future memory support: replays now emit `submittedActions`, per-action `actionResults`, per-ply `summary`, and optional `memoryUpdate`; replay schema updated accordingly. Verified with `npm run -s typecheck`, smoke match, and replay validation.
- 2026-03-09 15:54:00 PDT — Implemented first prompt-time memory experiment path: runner now derives per-player `lastFullTurn` memory, HTTP agent requests can carry `memory_context`, and agent server merges that with per-turn `memory_update` into the prompt `memory` block. Verified by typecheck, prompt snapshot smoke, and end-to-end stub-agent match.
- 2026-03-09 18:32:33 PDT — Ran `EXP_035_gemini_memory_last_full_turn_s3` (Gemini, greedy, seeds 301-303): control and memory variant both went 3/3 with 0 provider-error turns. Memory variant increased avg captures (8.33 vs 7.67) but worsened plies/win (10.67 vs 9.33) and avg latency slightly; no `memoryUpdate` field was emitted in variant replays, so observed effect is from derived last-full-turn context only.
- 2026-03-09 18:41:05 PDT — Tightened prompt-time memory instruction: when memory is enabled, `memory_update` is now explicitly required whenever plan changed, tactical threads remain unresolved, or any fact is likely to help next turn. Verified with typecheck.
