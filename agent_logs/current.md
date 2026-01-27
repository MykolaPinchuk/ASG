# agent_logs/current.md

## Agent
- id: agent02

## Timestamp (Pacific)
- start: 2026-01-26

## Intent
- Improve agent reliability (provider robustness, fewer malformed outputs) without adding strategic fallbacks; continue eval + UI observability.

## Notes
- Do not commit secrets or bulky artifacts (see `.gitignore`).

## Log

- 2026-01-26 12:52:58 PST — Onboarded (read current state + spec); verified `npm run typecheck` and `npm run match`+`validate:replay` smoke run; next focus: reduce `openai_compat` parse/provider-error passes without adding strategic fallbacks.
- 2026-01-26 13:11:54 PST — Added deterministic `mix` bot (coinflip between Greedy and Random, configurable via `--mix-greedy-prob`) and wired it into `npm run match`, replay schema, and viewer.
- 2026-01-26 13:52:23 PST — Ran seed=3 eval vs `mix` (pGreedy=0.5) for a few models; NanoGPT models drew with many captures, Chutes models lost due to frequent `openai_compat` errors (results under `runs/model_evals/seed3_vs_mix/`).
- 2026-01-26 15:20:19 PST — Ran NanoGPT eval vs `mix` with 3 games/model (seeds 3,4,5) at turnCapPlies=120; saved 9 replays under `replays/model_evals/seed3_vs_mix/nanogpt_games3_tc120/` and wrote summary `runs/model_evals/seed3_vs_mix/nanogpt_seed3_games3_tc120_summary.json`.
- 2026-01-26 16:19:15 PST — Fixed OpenRouter integration edge cases in `openai_compat` (retry with higher output tokens on OpenAI “empty_output/max_output_tokens”; retry with tools disabled on Gemini forced-function-call 400s). Re-tested OpenRouter models vs `mix` and saved replays under `replays/model_evals/seed3_vs_mix/openrouter_1game_tc120_fixed_2026-01-26T23-55-02Z/`.
- 2026-01-26 16:45:40 PST — Ran Grok 4.1 Fast (OpenRouter) vs `greedy` for 3 seeds (3,4,5): 3-0-0; replays in `replays/model_evals/grok_vs_greedy_2026-01-26T16-38-41PST/`.
- 2026-01-26 17:00:50 PST — Ran OpenRouter `google/gemini-3-flash-preview` and `anthropic/claude-haiku-4.5` vs `mix` (seed=3): both won; replays in `replays/model_evals/seed3_vs_mix/openrouter_newmodels_2026-01-26T16-59-03PST/`.
- 2026-01-26 17:35:30 PST — Ran Gemini 3 Flash Preview (OpenRouter) vs `greedy` for 3 seeds (3,4,5): 1 win, 2 draws, 0 losses; replays in `replays/model_evals/gemini3_vs_greedy_2026-01-26T17-32-26PST/`.
- 2026-01-26 17:44:07 PST — Set OpenRouter default model to `x-ai/grok-4.1-fast` when `--model` is omitted (agent server + provider + docs).
- 2026-01-26 17:48:56 PST — Added `npm run eval:grok-vs-greedy` (cost-capped at 3 games; always saves replays).
- 2026-01-26 17:54:39 PST — Added `npm run analyze:agent-io` to summarize `runs/agent_io` (timeouts/HTTP/parse/pass + latency).
- 2026-01-26 18:37:06 PST — Added `--prompt-mode=compact` option to `openai_compat` (for OSS experimentation; default remains unchanged). Ran 1-game OSS spot checks vs MixBot (seed=3, tc=40): DeepSeek V3.2 + Devstral drew; Qwen3 Next Thinking lost with many provider errors; replays under `replays/model_evals/oss_vs_mix_nanogpt_compact_*`.
- 2026-01-26 18:56:01 PST — Added an automatic “thinking time” hint for reasoning/thinking model variants (heuristic by model id; configurable via `--think-hint auto|on|off`).
