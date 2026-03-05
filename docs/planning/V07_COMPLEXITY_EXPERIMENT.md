# V07 — Behavior experiments (current simple setup)

Goal (v07): use the current game setup as a controlled lab to understand how harness/prompt/context changes alter agent behavior.

Primary objective (likely v07+):
- Select one model/provider that is operationally stable enough for deep experimentation.
- Prioritize reliability, latency stability, and telemetry quality over immediate win-rate.
- Run many small, controlled A/B experiments to explain *why* behavior changes.

Current candidate:
- MiniMax: `MiniMax-M2.5` (`https://api.minimax.io/v1`)

Non-goals:
- Do not treat v07 as a “leaderboard race”.
- Do not increase game-mechanics complexity until we have clear behavior-level learnings from current setup.
- Do not introduce strategy hints in prompts; keep prompts mechanics-only unless an experiment explicitly tests hinting.

## Model qualification gate (before deep experimentation)

The candidate model is accepted for v07 work if it is good enough operationally:
- Reliability: low provider-error turn rate (timeouts/429/5xx) in short batches.
- Latency: stable p50/p95 under the current per-turn budget.
- Telemetry: successful turns include token-usage evidence (prompt/completion/reasoning where available).
- Output quality floor: legal actions, low invalid-action rate, no frequent parse regressions.

Notes:
- “Great strategic play” is helpful but not required for v07 qualification.
- If errors spike during a run, first suspect provider quota/rate limits before changing harness assumptions.

## Baseline experiment protocol (constant by default)

- Scenario: `scenarios/scenario_01.json`
- Opponent: prefer `greedy` for lower variance while debugging behavior
- Horizon: typically `turnCapPlies=10` for quick loops (or `30` when needed)
- Seeds: fixed paired seeds across A/B conditions
- Always save replays and keep `turns[*].latencyMs`
- Capture server I/O logs for token/response diagnostics (`--server-log-dir`)

Budget-aware default:
- Keep quick batches near <= 30 model calls per cycle unless explicitly expanded.

## Experiment tracks (v07)

1) Prompt structure
- Compact vs full prompt mode
- Wording variants for sequential actions/chaining mechanics

2) Context representation
- Different observation serializations / legal-move framing
- Optional lightweight derived features (distance, frontier summaries)

3) Harness controls
- Timeout/retry settings
- `reasoning_split` and other provider-specific flags
- Tools on/off modes where supported

4) Optional memory/warmup interventions
- Keep opt-in and measured against stateless control

## Metrics to track per condition

- Reliability: pass/error/invalid turn rates, provider-error turns
- Tempo: time_to_first_capture, captures/game
- Latency: avg/p50/p95 on agent turns
- Token usage: prompt/completion/reasoning token stats where provided
- Outcome summary: W-D-L (secondary in v07)

## Where to record results

- `docs/diagnostics/YYYY-MM-DD_<topic>.md` — short experiment writeups
- `runs/` + `replays/` (ignored artifacts) with run metadata
- `performance.md` can still be updated, but it is not the primary decision surface for v07
