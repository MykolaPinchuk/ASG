# Tuning Protocol (Planning)

This document defines how we tune MVP parameters via playtests/simulation rather than guessing.

## Goals (MVP v0)

- Most matches end by **HQ capture** (not by turn-cap draw).
- Typical match length stays within the intended “watch-time” window once shown in the viewer (turn count and event density matter more than wall-clock compute).
- Outcomes feel explainable: combat variance is noticeable but not chaotic.

## Baselines

Before adding LLM agents, tune against scripted controllers:
- `RandomBot` (sanity / exploration)
- `GreedyBot` (a weak-but-coherent baseline)

Do not overfit to any single bot; the goal is to avoid obvious degeneracy (permanent turtling, no resource contest, perpetual ping-pong).

## Metrics to log

Per match:
- `result`: win/draw, winner
- `plies`: number of plies played
- `hq_capture_ply` (if win)
- `draw_reason` (if draw)
- Resource control timeline:
  - which player owned each resource node each ply (or summary: “plies owned”)
- Combat summary:
  - number of combats
  - average attacker win probability
  - average remaining strength after combat
- Invalid actions count (should be 0 for scripted bots)

Aggregate across seeds:
- draw rate
- mean/median plies
- win-rate symmetry (P1 vs P2 should be close on symmetric maps)
- sensitivity: variance across seeds

## Recommended tuning loop

1. Pick a **fixed seed set** (e.g. 50–200 seeds).
2. Run `GreedyBot vs GreedyBot` and `GreedyBot vs RandomBot` over the seed set.
3. If draw rate is too high, apply the levers below in order (small steps).
4. Re-run the same seed set and compare metrics.
5. Only then consider adding new mechanics (siege/escalation) if tuning cannot fix it.

## Primary levers (try first)

These should usually be enough for MVP v0:
- `settings.turnCapPlies`: if too low, games end in draws; if too high, viewer pacing suffers.
- `settings.baseIncome` and node `supplyYield`: increase contested value of resources.
- `starting_hq_strength`: if too high, HQ is uncrackable; if too low, rushes dominate.
- `settings.reinforceCostPerStrength`: controls how quickly supply converts to attack/defense.
- `settings.combatVarianceFraction`: controls swinginess; reduce if outcomes feel arbitrary.

## Secondary levers (if still too many draws)

Add *one* of these only if the core levers fail:

1. **Siege pressure** (recommended add-on)
   - Holding a node adjacent to enemy HQ causes periodic HQ damage or supply drain.
   - Creates an endgame clock once a player breaks through.

2. **Escalation clock**
   - Base income ramps, or defense decays, making late-game assaults decisive.

3. **Map connectivity**
   - Add the optional `mid_n—mid_s` connector edge in Scenario 01 to enable pivots and break deadlocks.

## Suggested initial targets (not strict)

For symmetric scenarios:
- Draw rate: **< 20%**
- Median plies: **~18–26** (leaves room for narratives but stays compact)
- Win rate: **~50/50** between P1 and P2 for the same bot matchup

## What to leave JIT to implementation

- Exact thresholds and dashboards (once simulation tooling exists).
- Final bot heuristics (they should evolve as you see failure modes).
- Whether to discretize `move.amount` (only if branching or degenerate split-moves become a problem).
