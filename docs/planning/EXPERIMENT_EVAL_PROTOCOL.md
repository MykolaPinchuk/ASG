# Experiment Evaluation Protocol (v06)

Goal: run experiments that produce clear, comparable data about whether an intervention improves **agent rule-following + strategic coherence**, without wasting time/tokens.

This protocol is designed to compare:
- **Control (baseline)** vs an experiment (A),
- and **A** vs **B** when B is an incremental change over A.

## 1) Fixed baselines (do not vary within a batch)

Lock these for the entire experiment batch:
- Scenario: `scenarios/scenario_01.json`
- Opponent: prefer `greedy` (lower variance); use `mix` only if needed later.
- Horizon: `turnCapPlies = 30` (or a shorter fixed cap for pilot runs; keep fixed).
- Seeds: fixed set; run the **same seeds** for all conditions (paired comparison).
- Agent side: fixed (e.g. agent is `P1`).
- Model config: provider + model + baseUrl + timeout + max_tokens + temperature + prompt mode/tools flags (all fixed).
- Always save replays; require per-ply `latencyMs` (already a repo invariant).

Only change **one variable** per experiment (e.g. repair loop ON/OFF; warmup mode OFF/INLINE/SEPARATE).

## 2) Metrics to record (from replays)

Measure per-game and aggregate (mean + per-seed comparisons):

Rule-following / reliability:
- `pass_turn_rate`: agent plies with all-pass actions (or empty list).
- `invalid_action_turn_rate`: agent plies with any `invalid_action` event.
- `error_turn_rate`: agent plies where diagnostics report an error/upstream error or upstreamStatus >= 400.
- `fallback_turn_rate`: agent plies where diagnostics indicate fallback was used (if enabled).

Strategic progress (cheap but meaningful):
- `time_to_first_capture`: first agent ply with a `capture` event (or null).
- `captures_per_game`: count of `capture` events on agent plies.
- `supply_yield_owned_at_end`: sum of node `supplyYield` owned by agent in final state.
- Optional: `supply_yield_owned_at_ply_10` (same, early).

Latency:
- `lat_p50_ok`, `lat_p95_ok`: percentiles over agent plies without errors.
- Track `ply0_latency` separately when evaluating warmup modes.

## 3) Success criteria (decide before running)

An experiment is “successful” if it meets **Primary** and at least one **Secondary**, without violating **Latency**:

Primary (must hit):
- `pass_turn_rate` improves by ≥ 25% relative (paired over the chosen seeds), AND
- `error_turn_rate` does not worsen materially (e.g. +0 to +1 error turns/game maximum).

Secondary (need ≥ 1):
- `time_to_first_capture` improves (earlier) in ≥ 3/5 seeds, OR
- `supply_yield_owned_at_ply_10` improves in ≥ 3/5 seeds, OR
- `captures_per_game` increases by ≥ 0.5 on average.

Latency budget:
- Repair-loop experiments: `lat_p95_ok` must not worsen by > 10% unless rule-following improves dramatically.
- Warmup experiments: allow ply0 overhead, but require meaningful improvements after ply0 (e.g. pass/invalid reductions).

Stop conditions (avoid wasting tokens):
- If provider flakiness dominates (e.g. lots of 429/5xx), abort and switch provider/model; results are not interpretable.

## 4) Recommended experiment ordering

1) **Repair loop** (1 retry cap, same overall timeout budget)
2) **Warmup + bounded memory**:
   - A: inline memory update (no extra model call)
   - B: separate warmup call (extra call once per match)

Compare:
- Control vs Repair
- Control vs A
- A vs B

## 5) Reporting format (minimal)

For each condition:
- List the exact command used (without secrets).
- Table: metrics (mean over games) + per-seed deltas vs control.
- Link to the replay directory used for analysis.

