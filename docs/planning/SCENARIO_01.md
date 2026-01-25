# Scenario 01 — “Two Lanes, Two Resources” (Graph, ~12 nodes)

Goal: a minimal, symmetric scenario that forces conflict around contested resources and naturally creates an “outer fight → inner breakthrough → HQ kill” arc.

This is an exploration artifact; numbers are meant to be tweaked.

## Nodes

Node ids are stable identifiers. Coordinates are for visualization only.

### Player 1 side

- `p1_hq` at `(-6, 0)`; owner `P1`; supply_yield `0`
- `p1_bridge` at `(-4, 0)`; owner `P1`; supply_yield `0`
- `p1_n` at `(-4, 2)`; owner `P1`; supply_yield `0`
- `p1_s` at `(-4, -2)`; owner `P1`; supply_yield `0`

### Player 2 side

- `p2_hq` at `(6, 0)`; owner `P2`; supply_yield `0`
- `p2_bridge` at `(4, 0)`; owner `P2`; supply_yield `0`
- `p2_n` at `(4, 2)`; owner `P2`; supply_yield `0`
- `p2_s` at `(4, -2)`; owner `P2`; supply_yield `0`

### Contested middle

- `mid_n` at `(0, 2)`; owner `Neutral`; supply_yield `0`
- `mid_s` at `(0, -2)`; owner `Neutral`; supply_yield `0`
- `res_n` at `(0, 4)`; owner `Neutral`; supply_yield `2`
- `res_s` at `(0, -4)`; owner `Neutral`; supply_yield `2`

Total: 12 nodes.

## Edges (adjacency)

- `p1_hq` — `p1_bridge`
- `p1_bridge` — `p1_n`
- `p1_bridge` — `p1_s`

- `p2_hq` — `p2_bridge`
- `p2_bridge` — `p2_n`
- `p2_bridge` — `p2_s`

- `p1_n` — `mid_n`
- `p2_n` — `mid_n`
- `mid_n` — `res_n`

- `p1_s` — `mid_s`
- `p2_s` — `mid_s`
- `mid_s` — `res_s`

Optional variant edge (if we want more lane switching):
- `mid_n` — `mid_s`

## Initial state (suggested)

- P1 starts with `garrison_strength = 10` at `p1_hq`, and `0` elsewhere.
- P2 starts with `garrison_strength = 10` at `p2_hq`, and `0` elsewhere.
- Neutral nodes start with `0` strength.
- Economy defaults live in `MVP_DRAFT.md` (base income + resource yields).

## Intended dynamics

- Early: both sides contest `mid_n` / `mid_s` to reach `res_n` / `res_s`.
- Midgame: holding a resource creates supply advantage; player chooses whether to press that lane or pivot.
- Endgame: once a lane is won decisively, attacker pushes through `p?_n/p?_s → p?_bridge → p?_hq`.

## Notes for future scaling

This layout is intentionally small. To scale, add:
- more intermediate neutral nodes per lane (longer routes),
- side loops that create flanking,
- additional resource pairs deeper in the map,
while keeping actions high-level so branching stays bounded.

