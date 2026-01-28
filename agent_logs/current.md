# agent_logs/current.md

## Agent
- id: agent04

## Timestamp (Pacific)
- start: 2026-01-28

## Intent
- Onboard and pick a small, measurable v0.5 hardening slice (tuning / viewer debug UX / replay diagnostics).

## Notes
- Do not commit secrets or bulky artifacts (see `.gitignore`).

## Log

- 2026-01-28 05:28:54 PST — Onboarded (read state/spec and a bounded set of hot-path files; quick smoke: `npm run typecheck`, `npm run check:determinism -- --seed 1 --p1 greedy --p2 random`). Next: pick one v0.5 task from `HANDOFF.md` (draw-rate tuning sweep, viewer match summary panel, or persisting per-turn agent diagnostics into replay + viewer).
- 2026-01-28 05:51:40 PST — OSS reliability small tweak: in `agent:eval-vs-mix` + `agent:vs-random`, default OpenAI-compatible upstream timeout is now **65s** for “thinking/reasoning” model ids (still 60s for non-reasoning) to reduce timeout-driven `providerErrors`. Smoke (NanoGPT, `turnCapPlies=2`, 1 game each, no explicit `--timeout-ms`): `qwen/qwen3-next-80b-a3b-thinking`, `deepseek/deepseek-v3.2:thinking`, `deepseek-ai/deepseek-v3.2-exp-thinking` all returned non-pass legal actions with `providerErrors=0`.
- 2026-01-28 13:11:37 PST — Continued OSS reliability hardening: (1) OpenAI tool schema now requires `actions` `minItems=1`; (2) agent server now tolerates case/whitespace variations in move `from`/`to` via case-insensitive node-id normalization; (3) bumped default upstream timeout for reasoning models to **80s** (and client `--agent-timeout-ms` default to 95s in eval CLIs) to reduce near-timeout failures; (4) bumped default `max_tokens` for reasoning models to 800 in `openai_compat` to reduce “budget-empty”/missing-final-JSON behavior.
- 2026-01-28 13:52:06 PST — Prompt tweak (mechanics-only): clarified that owning `supplyYield>0` nodes increases income, and softened the “think-hint” wording to allow spending time to think (still requiring JSON-only output).
- 2026-01-28 13:52:53 PST — Prompt tweak (mechanics-only): clarified that sequential actions allow “reinforce then move” within the same ply (helps agents exploit action budget without any strategy hints).
- 2026-01-28 13:57:15 PST — Prompt tweak (mechanics-only): added map distances to each HQ and an explicit `supplyNodes` list (derived from scenario state) to reduce per-turn bookkeeping load on weaker OSS models without prescribing any strategy.
- 2026-01-28 14:10:34 PST — Quick validation: NanoGPT `deepseek/deepseek-v3.2` vs `GreedyBot` at `turnCapPlies=30` now drew 3/3 (seeds 3–5) with `passTurns=0` and `providerErrors=0` after adding `distances`+`supplyNodes` to the prompt; still no wins in that small sample. Added a mechanics-only note on computing exact combat win probability from the noise distribution.
- 2026-01-28 15:01:50 PST — Stronger perf check: NanoGPT `deepseek/deepseek-v3.2` vs `GreedyBot` at `turnCapPlies=60` went 2W/1D/0L (seeds 3–5) with `passTurns=0` and `providerErrors=0`.
