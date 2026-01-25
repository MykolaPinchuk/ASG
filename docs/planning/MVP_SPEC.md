# MVP Spec v0 (Normative)

This is the normative rules/spec document for the MVP v0 game loop described in `MVP_DRAFT.md`.

Design intent: small action vocabulary, deterministic replays (seeded), graph-with-coordinates map (grid-compatible later).

## Terms

- **Node / Location**: a discrete place on the map (identified by `location_id`).
- **Node / Location**: a discrete place on the map (identified by `id` / `LocationId`).
- **Graph map**: undirected adjacency between nodes via edges; coordinates are for rendering only.
- **Strength**: a non-negative integer representing the size/power of a stack at a node.
- **Ply**: one player’s turn (half-move). A match is `settings.turnCapPlies` plies long at most.

## Map

- The map is an undirected graph:
  - `nodes`: each has `id`, `x`, `y`, `supplyYield`, and initial `owner` (`P1`, `P2`, or `Neutral`).
  - `edges`: unordered pairs of node ids; movement is allowed only along an edge.
- Coordinates (`x`, `y`) MUST NOT affect gameplay; they are only for visualization.

## Game state (MVP v0)

Per player:
- `supply[player]`: non-negative integer (named `supplies[player]` in engine state).
- `hq_location_id[player]`: fixed node id (named `players[player].hq` in the scenario definition).

Per node:
- `owner`: `P1 | P2 | Neutral`.
- `forces[P1]`, `forces[P2]`: non-negative integers.
- `supplyYield`: integer (typically 0 or a small positive value).

## Turn order

- Alternating plies: active player is `P1`, then `P2`, etc.
- Starting player comes from the scenario.
- `ply` starts at 0 and increments by 1 after each ply resolves.

## Income

At the start of each ply, the active player gains:

`income = settings.baseIncome + sum(node.supplyYield for all nodes owned by active player)`

Then:
- `supply[active_player] += income`

## Action submission

- The active player submits an ordered list of actions.
- Only the first `settings.actionBudget` actions are processed.
- Any action beyond the budget MUST be ignored and logged as an invalid action.

## Actions (MVP v0)

### 1) `pass`

No effect.

### 2) `reinforce(amount)`

Preconditions:
- `amount` is a positive integer.
- The player has enough supply: `supply[player] >= amount * settings.reinforceCostPerStrength`.

Effects:
- Decrease supply by the cost.
- Increase `forces[player]` at the player HQ node by `amount`.

### 3) `move(from, to, amount)`

Preconditions:
- `from` and `to` are valid node ids.
- `to` is adjacent to `from` via an edge.
- `amount` is a positive integer.
- `forces[player]` at `from` is at least `amount`.

Effects (in order):
1. Subtract `amount` from `forces[player]` at `from`.
2. Add `amount` to `forces[player]` at `to`.
3. If both players have positive forces at `to`, resolve combat (see below).
4. If after combat `forces[player] > 0` and `forces[enemy] == 0` at `to`, then set `owner[to] = player` (capture).
5. If `to` is the enemy HQ node and it is captured by the active player, the active player wins immediately.

## Invalid actions

If an action fails validation, it has **no effect** and MUST emit an `invalid_action` event explaining why.

## Combat resolution (seeded, bounded randomness)

Combat is resolved only at a single node after a `move` into an occupied enemy node.

Inputs:
- `attacker_strength = forces[attacker] at node` (positive integer)
- `defender_strength = forces[defender] at node` (positive integer)
- `variance_fraction = settings.combatVarianceFraction` (e.g. 0.35)
- deterministic PRNG seeded for the match (see “Determinism”)

Steps:
1. `min_strength = min(attacker_strength, defender_strength)`
2. `variance_bound = max(1, floor(min_strength * variance_fraction))`
3. Sample `noise` uniformly from integers in `[-variance_bound, +variance_bound]`
4. `delta_base = attacker_strength - defender_strength`
5. `delta = delta_base + noise`
6. Outcome:
   - If `delta > 0`: attacker wins; attacker remaining strength becomes `delta`; defender becomes 0.
   - If `delta < 0`: defender wins; defender remaining strength becomes `-delta`; attacker becomes 0.
   - If `delta == 0`: pick winner by PRNG coin flip; winner remaining strength becomes 1; loser becomes 0.

Notes:
- Combat MUST be fully explainable in logs by emitting inputs, `variance_bound`, `noise`, and final strengths.
- If combat variance needs tuning, only `settings.combatVarianceFraction` should change for MVP v0.

## End conditions

- **Win**: the active player captures the enemy HQ node.
- **Draw**: after resolving a ply, if `ply >= settings.turnCapPlies`, the match ends in a draw.

## Observations (MVP v0)

- MVP v0 uses perfect-information positions.
- Observations are still modeled as a first-class artifact to preserve a path to fog-of-war later.
- Replay logs SHOULD store both players’ observations per ply so POV switching is possible in the viewer.

## Determinism

- Given:
  - scenario definition,
  - initial state,
  - controllers’ chosen actions,
  - and a match seed,
  the engine MUST produce identical state transitions and event logs.
- If PRNG algorithm changes, it MUST bump replay `version` to avoid silent drift.
