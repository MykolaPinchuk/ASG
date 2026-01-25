# MVP Draft (Exploration)

This is a *working* MVP sketch to support exploration discussions. It is not an implementation plan.

## Fixed inputs (decided)

- Map representation: **graph with coordinates** (grid-compatible later).
- MVP info model: **perfect-information positions** (no fog-of-war yet).
- Build order: **scripted bot vs bot → 1 agent → 2 agents → multi-agent teams**.
- Win condition: **destroy/capture enemy HQ**; otherwise **draw**.
- Viewer: support **Omni**, **P1 POV**, **P2 POV**, and a **compare/diff** mode.

## MVP content scale (default)

- Start with **~12 nodes** for the first scenario (small enough to iterate).
- Keep the engine **data-driven** so scenarios can scale to many nodes later.

## World model (MVP)

- **Location (node)**:
  - `location_id`
  - `x, y` (for visualization only)
  - `neighbors: location_id[]`
  - `owner: P1 | P2 | Neutral`
  - `garrison_strength: int` (per owner; in MVP likely max one owner present)
  - `supply_yield: int` (0 for most nodes; >0 for resource nodes)
  - (optional later) `fortification: int`
- **Player**:
  - `supply: int`
  - `hq_location_id`
  - (optional) `tech_level` / `upgrades`

## Turn loop (MVP)

Alternating turns (WEGO later).

1. **Income**: active player gains supply (`base_income + sum(supply_yield of owned nodes)`).
2. **Action phase**: active player submits up to `action_budget` actions.
3. **Resolution**: engine resolves actions in order, producing an event log.
4. **End check**: if enemy HQ is destroyed/captured, active player wins; otherwise continue until turn cap, then draw.

## Proposed initial parameters (for discussion)

These are *defaults to start playtesting*, not locked decisions.

- `turn_cap`: **30 plies** (15 turns per player).
- `action_budget`: **4 actions per turn**.
- `base_income`: **2 supply / turn**.
- `supply_yield` on resource nodes: **2 supply / turn**.
- `reinforce_cost`: **1 supply → +1 strength** at HQ.
- Starting HQ `garrison_strength`: **10**.
- `move.amount`: free integer for MVP, but keep strength numbers small; if branching becomes a problem, discretize to `{all, half, 1}`.

## Action vocabulary (minimal)

Keep this small; complexity should come from the map + incentives.

- `reinforce(amount)`:
  - Spend supply to add `amount` strength at your HQ.
  - Optional safety valve: a **max strength** at HQ (or max reinforce per turn) to keep numbers bounded.
- `move(from_location_id, to_location_id, amount)`:
  - Must be adjacent via an edge.
  - Move `amount` strength (integer) to the neighbor.
  - If destination contains enemy strength, combat triggers.
- `pass`

Optional (add only if needed for depth/anti-stalemate):
- `fortify(location_id, amount)` (spend supply to increase local defense)
- `upgrade(name)` (2–3 upgrades max, e.g., “attack +1”)

## Combat (MVP)

Goal: easy to explain; replayable; bounded randomness.

Recommended approach:
- Compute expected outcome from attacker/defender strengths (and any simple bonuses).
- Apply **seeded, low-variance randomness** around the expectation.
- Emit combat log fields like:
  - `attacker_strength`, `defender_strength`
  - `win_prob_estimate` (or a simpler “expected remaining strength”)
  - `seed` / `rng_roll` (for replay determinism)
  - `resulting_strengths`

Early-debug fallback:
- deterministic resolution only (no RNG), then re-enable RNG once the loop is stable.

## Anti-stalemate (MVP choice)

Even with “HQ kill” win condition, we want most games to end.

Chosen mechanism for MVP: **economy advantage breaks defense**.

Practical MVP interpretation:
- Put most meaningful income on **contested resource nodes**.
- Make HQ expensive to crack without extra income, so players are pushed to fight for resources.
- Keep a hard `turn_cap` so the match always ends (draw if no HQ kill).

Optional “if too many draws” follow-up levers (add later, not MVP by default):
- **Siege pressure**: holding a node adjacent to enemy HQ creates an endgame clock.
- **Escalation clock**: base income ramps, or defense decays, making late fights more decisive.

## Scenario 01 (starting point)

See `SCENARIO_01.md` for a concrete ~12-node graph layout to use as the first iteration.
See `IMPLEMENTATION_PLAN.md` for an engineering milestone plan.

## Scaling path (keep grid option open)

Design rule: treat everything as **locations + adjacency + movement costs**. A grid is just a larger, regular graph.

To scale to large graphs/grids later, plan for:
- **Observation compression / query tools** (don’t always dump the entire world).
- **High-level movement orders** (e.g., “move toward target within range”) if the map gets large.
- Possible **hierarchical layers** (regions over tiles) to keep action branching bounded.

## Open questions to resolve during exploration

- Confirm or adjust the proposed initial parameters (`turn_cap`, `action_budget`, income, costs).
- Decide whether `move.amount` is free integer or discretized (all / half / fixed chunks).
- Decide whether “destroy HQ” means:
  - capture HQ node (simplest), or
  - separate HQ HP + siege (more expressive, more complexity).
