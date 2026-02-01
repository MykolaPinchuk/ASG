# V07 — Complexity experiment (more complex game setup)

Goal (v07): increase game-mechanics complexity in a controlled way and measure how our current baseline models behave:
- Cerebras: `gpt-oss-120b`
- Chutes: `tngtech/DeepSeek-R1T-Chimera`
- OpenRouter: `x-ai/grok-4.1-fast`

Non-goals:
- Do not introduce “strategy hints” or human-authored tactical guidance in prompts; prompts remain mechanics-only.
- Do not run large sweeps by default; keep v0/v0.x guardrails unless explicitly overridden.

## Baseline protocol (keep constant)
- Scenario: start from `scenarios/scenario_01.json`
- Opponent: MixBot
- Seeds: small fixed set (e.g. `3,4` for iteration; `3..7` for a stronger check)
- `turnCapPlies=30`
- Always save replays and keep `turns[*].latencyMs`
- Update `performance.md` via `npm run -s perf:top20`

Suggested commands (examples; adjust provider flags as needed):
- Chutes Chimera (2 games, seeds 3/4):
  - `npm run -s agent:eval-vs-mix -- --provider-name chutes --base-url https://llm.chutes.ai/v1 --models tngtech/DeepSeek-R1T-Chimera --seeds 3,4 --turn-cap-plies 30`
- Cerebras `gpt-oss-120b` (2 games, seeds 3/4):
  - `npm run -s agent:eval-vs-mix -- --provider-name cerebras --base-url https://api.cerebras.ai/v1 --keys-name cerebras-paid --models gpt-oss-120b --seeds 3,4 --turn-cap-plies 30 --prompt-mode compact --temperature 0 --use-tools false --tools-mode off --stream off --max-tokens 8000 --reasoning-effort high`
- OpenRouter Grok (2 games, seeds 3/4):
  - `npm run -s agent:eval-vs-mix -- --provider-name openrouter --base-url https://openrouter.ai/api/v1 --models x-ai/grok-4.1-fast --seeds 3,4 --turn-cap-plies 30`

## Stepwise complexity ramp

The goal is to introduce one “mechanics bump” at a time, keep the baseline protocol constant, and record results (replays + short diagnostics note).

1) **Clarify rules + action space**
   - Ensure rules are explicitly defined and validated (no ambiguity about what actions are legal).
   - Move toward “3 actions per unit” (or comparable expansion), if not already present.
   - Add/validate split + consolidation rules.

2) **Consolidation penalty**
   - Introduce a consolidation penalty (resource/strength/tempo) to create meaningful tradeoffs.

3) **Adjacency bonus**
   - Add adjacency-based bonus (e.g., owned-neighbor bonus to capture/defense/supply).

4) **Defensive bonus**
   - Add a defensive bonus to slow down steamrolls and increase positional value.

For each step:
- Re-run baseline protocol on the 3 baseline models.
- Track: win rate, ok/pass/error rates, captures/game, time_to_first_capture, avg ok latency, avg plies-to-win.
- If a change causes widespread invalid actions, stop and fix rules/validation/observability before proceeding.

## Where to record results
- `performance.md` (aggregated, always up-to-date)
- `docs/diagnostics/YYYY-MM-DD_<topic>.md` (brief writeups for each step in the ramp)

